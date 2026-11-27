begin;

create or replace function public.admin_set_commission_policy(p_employee_role text,p_acquisition_source text,p_rate numeric)
returns public.commission_policies language plpgsql security definer set search_path=public as $$
declare v_role public.app_role; v_source public.acquisition_source; v_row public.commission_policies%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_employee_role not in ('BUSINESS_DEVELOPMENT','TECHNICAL') then raise exception 'Invalid employee role'; end if;
  if p_rate<0 or p_rate>100 then raise exception 'Commission rate must be between 0 and 100'; end if;
  v_role:=p_employee_role::public.app_role;
  if p_employee_role='BUSINESS_DEVELOPMENT' then v_source:=null;
  else
    if p_acquisition_source not in ('COMPANY_PROVIDED','TECHNICAL_SELF_SOURCED') then raise exception 'Technical acquisition source is required'; end if;
    v_source:=p_acquisition_source::public.acquisition_source;
  end if;
  update public.commission_policies set is_active=false
  where employee_role=v_role and acquisition_source is not distinct from v_source and is_active;
  insert into public.commission_policies(policy_code,employee_role,acquisition_source,rate,effective_from,is_active,created_by)
  values(v_role::text||'_'||coalesce(v_source::text,'STANDARD')||'_'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),v_role,v_source,p_rate,current_date,true,auth.uid())
  returning * into v_row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'COMMISSION_POLICY_UPDATED','COMMISSION_POLICY',v_row.id,jsonb_build_object('employee_role',v_role,'acquisition_source',v_source,'rate',p_rate));
  return v_row;
end;
$$;
grant execute on function public.admin_set_commission_policy(text,text,numeric) to authenticated;

-- Audit role/status changes made by an authenticated Admin through permitted pathways.
create or replace function public.audit_profile_security_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'PROFILE_SECURITY_CHANGED','PROFILE',new.id,
      jsonb_build_object('role',old.role,'status',old.status),jsonb_build_object('role',new.role,'status',new.status));
  end if;
  return new;
end;
$$;
create trigger profiles_security_audit after update on public.profiles
for each row execute function public.audit_profile_security_change();

commit;
