begin;

create or replace function public.guard_profile_security_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role' then
    if not public.is_admin() and (
      new.role is distinct from old.role or new.status is distinct from old.status or
      new.username is distinct from old.username or new.auth_email is distinct from old.auth_email or
      new.id is distinct from old.id or
      (new.must_change_password is distinct from old.must_change_password and current_setting('webnest.password_workflow',true) is distinct from 'on')
    ) then
      raise exception 'Only an administrator can change protected employee account fields';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.complete_my_password_change()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('webnest.password_workflow','on',true);
  update public.profiles set must_change_password=false where id=auth.uid();
end;
$$;
grant execute on function public.complete_my_password_change() to authenticated;

create or replace function public.create_pricing_version(p_version_name text,p_notes text default null)
returns public.pricing_versions language plpgsql security definer set search_path=public as $$
declare v_old uuid; v_new public.pricing_versions%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(p_version_name))<3 then raise exception 'Version name is required'; end if;
  select id into v_old from public.pricing_versions where is_current=true limit 1;
  update public.pricing_versions set is_current=false where is_current=true;
  insert into public.pricing_versions(version_name,notes,is_current,created_by)
  values(trim(p_version_name),p_notes,true,auth.uid()) returning * into v_new;
  if v_old is not null then
    insert into public.pricing_items(category_id,version_id,code,name,description,unit,price_paise,is_commissionable,is_taxable,tax_rate,is_active,metadata)
    select category_id,v_new.id,code,name,description,unit,price_paise,is_commissionable,is_taxable,tax_rate,is_active,metadata
    from public.pricing_items where version_id=v_old;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'PRICING_VERSION_CREATED','PRICING_VERSION',v_new.id,jsonb_build_object('version_name',v_new.version_name,'copied_from',v_old));
  return v_new;
end;
$$;
grant execute on function public.create_pricing_version(text,text) to authenticated;

create or replace function public.audit_pricing_item_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'PRICING_ITEM_'||tg_op,'PRICING_ITEM',coalesce(new.id,old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger pricing_items_audit after insert or update or delete on public.pricing_items
for each row execute function public.audit_pricing_item_change();

commit;
