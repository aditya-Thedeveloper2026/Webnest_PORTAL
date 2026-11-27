-- Security hardening, brochure versioning, commission/discount administration and storage.
begin;

alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Sanitize all employee-created project inserts and lock fields which must only be
-- changed by database workflow functions or administrators.
create or replace function public.guard_project_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.app_role; v_workflow text; v_pricing text;
begin
  v_workflow := current_setting('webnest.project_workflow', true);
  v_pricing := current_setting('webnest.pricing_workflow', true);
  select role into v_role from public.profiles where id=auth.uid() and status='ACTIVE';
  if tg_op='INSERT' and auth.uid() is not null and auth.role()<>'service_role' and not public.is_admin() then
    new.created_by := auth.uid();
    new.status := 'DRAFT';
    new.subtotal_paise := 0; new.discount_paise := 0; new.tax_paise := 0; new.total_paise := 0; new.eligible_amount_paise := 0;
    new.pricing_snapshot := '{}'::jsonb; new.tax_snapshot := '{}'::jsonb;
    new.reviewed_by := null; new.reviewed_at := null; new.completion_submitted_at := null; new.completion_approved_at := null;
    new.brochure_path := null; new.brochure_version := 0;
  elsif tg_op='UPDATE' and auth.uid() is not null and auth.role()<>'service_role' and not public.is_admin() then
    if new.created_by is distinct from old.created_by or
       new.acquisition_source is distinct from old.acquisition_source or
       new.bd_owner_id is distinct from old.bd_owner_id or
       new.technical_owner_id is distinct from old.technical_owner_id or
       new.status is distinct from old.status or
       new.reviewed_by is distinct from old.reviewed_by or
       new.reviewed_at is distinct from old.reviewed_at or
       new.completion_submitted_at is distinct from old.completion_submitted_at or
       new.completion_approved_at is distinct from old.completion_approved_at or
       new.subtotal_paise is distinct from old.subtotal_paise or
       new.discount_paise is distinct from old.discount_paise or
       new.tax_paise is distinct from old.tax_paise or
       new.total_paise is distinct from old.total_paise or
       new.eligible_amount_paise is distinct from old.eligible_amount_paise or
       new.pricing_snapshot is distinct from old.pricing_snapshot or
       new.tax_snapshot is distinct from old.tax_snapshot then
      if coalesce(v_workflow,'') <> 'on' and coalesce(v_pricing,'') <> 'on' then
        raise exception 'Protected project fields can only be changed by approved workflows';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_integrity_guard before insert or update on public.projects
for each row execute function public.guard_project_integrity();

-- Restrict direct browser UPDATE permissions to editable wizard fields. Workflow RPCs
-- execute as the database owner and may update protected state after validation.
revoke update on public.projects from authenticated;
grant update (client_id, lead_id, title, service_type, service_plan, description,
  requirements, questionnaire_answers, questionnaire_version, wizard_data, expected_timeline)
on public.projects to authenticated;

-- Set the operation marker inside security-definer workflow functions before changing
-- fields which are normally immutable for browser sessions.
create or replace function public.accept_available_project(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles%rowtype; v_project public.projects%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if not found or v_profile.role <> 'TECHNICAL' then raise exception 'Only active technical employees can accept projects'; end if;
  perform set_config('webnest.project_workflow','on',true);
  update public.projects set status = 'IN_DEVELOPMENT', technical_owner_id = auth.uid(), updated_at = now()
   where id = p_project_id and status = 'AVAILABLE' and technical_owner_id is null returning * into v_project;
  if not found then raise exception 'This project has already been assigned to another employee.'; end if;
  insert into public.project_assignments(project_id, employee_id, assignment_source)
  values (p_project_id, auth.uid(), 'FIRST_CLAIM');
  insert into public.notifications(recipient_id, title, body, category, resource_type, resource_id)
  select id, 'Project accepted', v_project.title || ' has been accepted by a technical team member.', 'PROJECT', 'PROJECT', v_project.id
  from public.profiles where role = 'ADMIN' and status = 'ACTIVE';
  return v_project;
end;
$$;

create or replace function public.submit_project_for_review(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype;
begin
  perform set_config('webnest.project_workflow','on',true);
  update public.projects set status = 'PENDING_REVIEW', updated_at = now()
  where id = p_project_id and created_by = auth.uid() and status in ('DRAFT','REJECTED') returning * into v_project;
  if not found then raise exception 'Draft project not found or not editable'; end if;
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select id,'New project submitted','A new project is awaiting review: ' || v_project.title,'PROJECT','PROJECT',v_project.id
  from public.profiles where role = 'ADMIN' and status = 'ACTIVE';
  return v_project;
end;
$$;

create or replace function public.submit_project_completion(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype;
begin
  perform set_config('webnest.project_workflow','on',true);
  update public.projects set status='COMPLETED_PENDING_REVIEW', completion_submitted_at=now(), updated_at=now()
  where id=p_project_id and technical_owner_id=auth.uid() and status='IN_DEVELOPMENT' returning * into v_project;
  if not found then raise exception 'Project cannot be submitted for completion'; end if;
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select id,'Completion review requested',v_project.title || ' is ready for completion review.','PROJECT','PROJECT',v_project.id
  from public.profiles where role='ADMIN' and status='ACTIVE';
  return v_project;
end;
$$;

create or replace function public.save_project_pricing(p_project_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects%rowtype; v_item record; v_qty integer; v_line bigint;
  v_subtotal bigint := 0; v_eligible bigint := 0; v_discount bigint := 0; v_discount_eligible bigint := 0;
  v_tax bigint := 0; v_line_discount bigint; v_tax_line bigint; v_snapshot jsonb := '[]'::jsonb;
  v_tax_snapshot jsonb := '[]'::jsonb; v_total bigint; v_version uuid;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if not (public.is_admin() or v_project.created_by=auth.uid()) then raise exception 'Not authorized to price this project'; end if;
  if v_project.status not in ('DRAFT','PENDING_REVIEW','REJECTED') then raise exception 'Pricing is locked after project approval'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one catalogue item'; end if;
  select id into v_version from public.pricing_versions where is_current=true limit 1;
  if v_version is null then raise exception 'No active pricing catalogue is configured'; end if;
  for v_item in
    select pi.id, pi.code, pi.name, pi.description, pi.unit, pi.price_paise, pi.is_commissionable, pi.is_taxable, pi.tax_rate,
      (x.value->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) x(value)
    join public.pricing_items pi on pi.id=(x.value->>'item_id')::uuid
    where pi.version_id=v_version and pi.is_active=true
  loop
    v_qty := v_item.quantity;
    if v_qty < 1 or v_qty > 1000 then raise exception 'Invalid catalogue quantity'; end if;
    v_line := v_item.price_paise * v_qty; v_subtotal := v_subtotal + v_line;
    if v_item.is_commissionable then v_eligible := v_eligible + v_line; end if;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('item_id',v_item.id,'code',v_item.code,'name',v_item.name,
      'description',v_item.description,'unit',v_item.unit,'quantity',v_qty,'unit_price_paise',v_item.price_paise,
      'line_total_paise',v_line,'is_commissionable',v_item.is_commissionable,'is_taxable',v_item.is_taxable,'tax_rate',v_item.tax_rate));
  end loop;
  if jsonb_array_length(v_snapshot) <> jsonb_array_length(p_items) then raise exception 'One or more catalogue items are invalid or unavailable'; end if;
  select coalesce(sum(requested_discount_paise),0) into v_discount from public.discount_requests where project_id=p_project_id and status='APPROVED';
  if v_discount > v_subtotal then raise exception 'Approved discount exceeds subtotal'; end if;
  if v_subtotal > 0 then v_discount_eligible := round(v_discount::numeric * v_eligible / v_subtotal)::bigint; end if;
  for v_item in
    select (e.value->>'line_total_paise')::bigint as line_total,coalesce((e.value->>'is_taxable')::boolean,false) as is_taxable,
      coalesce((e.value->>'tax_rate')::numeric,0) as tax_rate,coalesce((e.value->>'code'),'') as code,coalesce((e.value->>'name'),'') as name
    from jsonb_array_elements(v_snapshot) e(value)
  loop
    v_line_discount := case when v_subtotal=0 then 0 else round(v_discount::numeric * v_item.line_total / v_subtotal)::bigint end;
    if v_item.is_taxable then
      v_tax_line := round((v_item.line_total - v_line_discount) * v_item.tax_rate / 100)::bigint;
      v_tax := v_tax + v_tax_line;
      v_tax_snapshot := v_tax_snapshot || jsonb_build_array(jsonb_build_object('code',v_item.code,'name',v_item.name,'tax_rate',v_item.tax_rate,'tax_paise',v_tax_line));
    end if;
  end loop;
  v_total := v_subtotal - v_discount + v_tax;
  perform set_config('webnest.pricing_workflow','on',true);
  update public.projects set subtotal_paise=v_subtotal,discount_paise=v_discount,tax_paise=v_tax,total_paise=v_total,
    eligible_amount_paise=greatest(v_eligible-v_discount_eligible,0),pricing_snapshot=v_snapshot,
    tax_snapshot=jsonb_build_object('line_taxes',v_tax_snapshot,'tax_total_paise',v_tax),updated_at=now() where id=p_project_id;
  return jsonb_build_object('project_id',p_project_id,'subtotal_paise',v_subtotal,'discount_paise',v_discount,'tax_paise',v_tax,
    'total_paise',v_total,'eligible_amount_paise',greatest(v_eligible-v_discount_eligible,0),'items',v_snapshot,'taxes',v_tax_snapshot);
end;
$$;

-- Self-sourced Technical projects remain assigned to their originator after Admin approval.
create or replace function public.admin_review_project(p_project_id uuid, p_decision text, p_reason text default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype; v_admin uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid review decision'; end if;
  update public.projects set
    status = case when p_decision='REJECT' then 'REJECTED'::public.project_status
      when technical_owner_id is not null and acquisition_source='TECHNICAL_SELF_SOURCED' then 'IN_DEVELOPMENT'::public.project_status
      else 'AVAILABLE'::public.project_status end,
    rejection_reason = case when p_decision='REJECT' then nullif(trim(p_reason),'') else null end,
    reviewed_by=v_admin,reviewed_at=now(),updated_at=now()
  where id=p_project_id and status='PENDING_REVIEW' returning * into v_project;
  if not found then raise exception 'Project is not awaiting review'; end if;
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(v_project.created_by,'Project reviewed',case when p_decision='APPROVE' then 'Your project is approved.' else 'Your project needs revision: '||coalesce(p_reason,'See administrator comments.') end,'PROJECT','PROJECT',v_project.id);
  if p_decision='APPROVE' and v_project.technical_owner_id is not null then
    insert into public.project_assignments(project_id,employee_id,assigned_by,assignment_source)
    values(v_project.id,v_project.technical_owner_id,v_admin,'SELF_SOURCED')
    on conflict do nothing;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,reason)
  values(v_admin,'PROJECT_'||p_decision,'PROJECT',v_project.id,jsonb_build_object('status',v_project.status),p_reason);
  return v_project;
end;
$$;

-- First technical self-sourced project is assigned to its creator after submission approval.
create or replace function public.set_project_acquisition_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.app_role;
begin
  select role into v_role from public.profiles where id=auth.uid() and status='ACTIVE';
  if auth.role()<>'service_role' and v_role is not null then
    if v_role='TECHNICAL' then new.acquisition_source:='TECHNICAL_SELF_SOURCED';new.technical_owner_id:=auth.uid();new.bd_owner_id:=null;
    elsif v_role='BUSINESS_DEVELOPMENT' then new.acquisition_source:='COMPANY_PROVIDED';new.bd_owner_id:=auth.uid();new.technical_owner_id:=null;
    end if;
  end if;
  return new;
end;
$$;

create table public.project_brochures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version integer not null,
  storage_path text not null unique,
  file_name text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id,version)
);
alter table public.project_brochures enable row level security;
create policy project_brochures_owner_read on public.project_brochures for select to authenticated
using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and (p.created_by=auth.uid() or p.bd_owner_id=auth.uid() or p.technical_owner_id=auth.uid())));
create or replace function public.record_brochure_version(p_project_id uuid,p_storage_path text,p_file_name text)
returns public.project_brochures language plpgsql security definer set search_path = public as $$
declare v_version integer; v_row public.project_brochures%rowtype;
begin
  if not (public.is_admin() or exists(select 1 from public.projects p where p.id=p_project_id and p.created_by=auth.uid())) then raise exception 'Not authorized to archive this proposal'; end if;
  if p_storage_path !~ ('^'||p_project_id::text||'/proposal-v[0-9]+[.]pdf$') then raise exception 'Invalid proposal storage path'; end if;
  select coalesce(max(version),0)+1 into v_version from public.project_brochures where project_id=p_project_id;
  insert into public.project_brochures(project_id,version,storage_path,file_name,created_by)
  values(p_project_id,v_version,p_storage_path,p_file_name,auth.uid()) returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.record_brochure_version(uuid,text,text) to authenticated;

-- Commission administration: approvals and payouts are separate, audited transactions.
create or replace function public.admin_approve_commission(p_commission_id uuid,p_reason text default null)
returns public.commissions language plpgsql security definer set search_path=public as $$
declare v_row public.commissions%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.commissions set status='APPROVED',updated_at=now()
  where id=p_commission_id and status='EARNED' returning * into v_row;
  if not found then raise exception 'Only earned commissions can be approved'; end if;
  insert into public.commission_transactions(commission_id,actor_id,transaction_type,amount_paise,reason)
  values(v_row.id,auth.uid(),'APPROVE',v_row.commission_amount_paise,p_reason);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason)
  values(auth.uid(),'COMMISSION_APPROVED','COMMISSION',v_row.id,p_reason);
  return v_row;
end;
$$;
grant execute on function public.admin_approve_commission(uuid,text) to authenticated;

create or replace function public.admin_record_commission_payout(p_employee_id uuid,p_commission_ids uuid[],p_payment_reference text default null,p_notes text default null)
returns public.commission_payouts language plpgsql security definer set search_path=public as $$
declare v_total bigint; v_payout public.commission_payouts%rowtype; v_item record;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if coalesce(array_length(p_commission_ids,1),0)=0 then raise exception 'Select at least one approved commission'; end if;
  perform 1 from public.commissions
   where id=any(p_commission_ids) and employee_id=p_employee_id and status='APPROVED' for update;
  select sum(commission_amount_paise) into v_total from public.commissions
   where id=any(p_commission_ids) and employee_id=p_employee_id and status='APPROVED';
  if v_total is null or (select count(*) from public.commissions where id=any(p_commission_ids) and employee_id=p_employee_id and status='APPROVED') <> array_length(p_commission_ids,1) then
    raise exception 'All selected commissions must belong to this employee and be approved';
  end if;
  insert into public.commission_payouts(employee_id,recorded_by,amount_paise,payment_reference,notes)
  values(p_employee_id,auth.uid(),v_total,p_payment_reference,p_notes) returning * into v_payout;
  for v_item in select id,commission_amount_paise from public.commissions where id=any(p_commission_ids) and employee_id=p_employee_id and status='APPROVED' for update loop
    update public.commissions set status='PAID',updated_at=now() where id=v_item.id;
    insert into public.commission_transactions(commission_id,actor_id,transaction_type,amount_paise,reason)
    values(v_item.id,auth.uid(),'PAYOUT',v_item.commission_amount_paise,coalesce(p_payment_reference,p_notes));
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'COMMISSION_PAYOUT_RECORDED','COMMISSION_PAYOUT',v_payout.id,jsonb_build_object('employee_id',p_employee_id,'amount_paise',v_total));
  return v_payout;
end;
$$;
grant execute on function public.admin_record_commission_payout(uuid,uuid[],text,text) to authenticated;

create or replace function public.admin_review_discount(p_request_id uuid,p_decision text,p_comments text default null)
returns public.discount_requests language plpgsql security definer set search_path=public as $$
declare v_row public.discount_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid discount decision'; end if;
  update public.discount_requests set status=p_decision::public.approval_status,reviewed_by=auth.uid(),reviewed_at=now(),admin_comments=p_comments
  where id=p_request_id and status='PENDING' returning * into v_row;
  if not found then raise exception 'Discount request is not pending'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'DISCOUNT_'||p_decision,'DISCOUNT_REQUEST',v_row.id,jsonb_build_object('discount_paise',v_row.requested_discount_paise),p_comments);
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(v_row.requested_by,'Discount request reviewed','Your discount request was '||lower(p_decision)||'.','DISCOUNT','PROJECT',v_row.project_id);
  return v_row;
end;
$$;
grant execute on function public.admin_review_discount(uuid,text,text) to authenticated;

-- Record a payment and its audit trail in one transaction.
create or replace function public.admin_record_payment(p_project_id uuid,p_amount_paise bigint,p_method text default null,p_reference text default null,p_notes text default null)
returns public.payments language plpgsql security definer set search_path=public as $$
declare v_row public.payments%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount_paise<=0 then raise exception 'Payment amount must be positive'; end if;
  insert into public.payments(project_id,recorded_by,amount_paise,payment_method,payment_reference,notes)
  values(p_project_id,auth.uid(),p_amount_paise,p_method,p_reference,p_notes) returning * into v_row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'CLIENT_PAYMENT_RECORDED','PAYMENT',v_row.id,jsonb_build_object('project_id',p_project_id,'amount_paise',p_amount_paise,'reference',p_reference));
  return v_row;
end;
$$;
grant execute on function public.admin_record_payment(uuid,bigint,text,text,text) to authenticated;

-- Private storage for proposal PDFs. Never issue public URLs for these files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-brochures','project-brochures',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
create policy brochure_upload_project_member on storage.objects for insert to authenticated
with check (bucket_id='project-brochures' and (public.is_admin() or exists(
  select 1 from public.projects p where p.id=((storage.foldername(name))[1])::uuid and p.created_by=auth.uid())));
create policy brochure_read_project_member on storage.objects for select to authenticated
using (bucket_id='project-brochures' and (public.is_admin() or exists(
  select 1 from public.projects p where p.id=((storage.foldername(name))[1])::uuid and (p.created_by=auth.uid() or p.bd_owner_id=auth.uid() or p.technical_owner_id=auth.uid()))));

-- Employees cannot read or enumerate the username lookup / rate-limit table.
revoke all on public.login_attempts from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

commit;
