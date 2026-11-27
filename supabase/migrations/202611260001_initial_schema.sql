-- Webnest Nexus — initial schema and security baseline
-- Apply with: supabase db push
begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('ADMIN', 'BUSINESS_DEVELOPMENT', 'TECHNICAL');
create type public.account_status as enum ('ACTIVE', 'DISABLED');
create type public.project_status as enum (
  'DRAFT', 'PENDING_REVIEW', 'REJECTED', 'AVAILABLE', 'IN_DEVELOPMENT',
  'COMPLETED_PENDING_REVIEW', 'COMPLETED', 'ARCHIVED'
);
create type public.acquisition_source as enum ('COMPANY_PROVIDED', 'TECHNICAL_SELF_SOURCED');
create type public.commission_status as enum ('PENDING', 'EARNED', 'APPROVED', 'PAID', 'REVERSED');
create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  username citext not null unique,
  auth_email text not null unique,
  role public.app_role not null,
  status public.account_status not null default 'ACTIVE',
  contact_number text,
  designation text,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username::text ~ '^[a-zA-Z0-9_]{3,40}$'),
  constraint full_name_nonempty check (length(trim(full_name)) > 0)
);
create index profiles_role_status_idx on public.profiles(role, status);

create table public.employee_details (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  emergency_contact text,
  address text,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.employee_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text
);
create index employee_roles_profile_idx on public.employee_roles(profile_id, granted_at desc);

create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values ('admin_bootstrap_completed', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'ACTIVE'
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'ADMIN'::public.app_role, false)
$$;
create or replace function public.is_active_employee()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'ACTIVE')
$$;
grant execute on function public.current_role(), public.is_admin(), public.is_active_employee() to authenticated;

create or replace function public.guard_profile_security_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role' then
    if not public.is_admin() and (
      new.role is distinct from old.role or
      new.status is distinct from old.status or
      new.username is distinct from old.username or
      new.auth_email is distinct from old.auth_email or
      new.id is distinct from old.id
    ) then
      raise exception 'Only an administrator can change protected employee account fields';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_security_guard before update on public.profiles
for each row execute function public.guard_profile_security_fields();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  company_name text,
  industry text,
  mobile_number text not null,
  email text,
  location text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_mobile_nonempty check (length(trim(mobile_number)) >= 7)
);
create index clients_name_idx on public.clients(lower(client_name));
create index clients_mobile_idx on public.clients(mobile_number);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  source text,
  status text not null default 'NEW' check (status in ('NEW','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST')),
  requirements text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_status_idx on public.leads(owner_id, status);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  activity_type text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  service_type text not null check (service_type in ('WEBSITE','APPLICATION','AI_AGENT','OTHER')),
  service_plan text,
  description text,
  status public.project_status not null default 'DRAFT',
  created_by uuid not null references public.profiles(id) on delete restrict,
  bd_owner_id uuid references public.profiles(id) on delete restrict,
  technical_owner_id uuid references public.profiles(id) on delete restrict,
  acquisition_source public.acquisition_source not null default 'COMPANY_PROVIDED',
  requirements jsonb not null default '{}'::jsonb,
  questionnaire_answers jsonb not null default '[]'::jsonb,
  questionnaire_version text not null default '2026-11-01',
  wizard_data jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  tax_snapshot jsonb not null default '{}'::jsonb,
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  total_paise bigint not null default 0 check (total_paise >= 0),
  eligible_amount_paise bigint not null default 0 check (eligible_amount_paise >= 0),
  expected_timeline text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  completion_submitted_at timestamptz,
  completion_approved_at timestamptz,
  brochure_path text,
  brochure_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_status_created_idx on public.projects(status, created_at desc);
create index projects_client_idx on public.projects(client_id);
create index projects_bd_owner_idx on public.projects(bd_owner_id);
create index projects_technical_owner_idx on public.projects(technical_owner_id);

create or replace function public.set_project_acquisition_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if auth.role() <> 'service_role' and v_role is not null then
    if v_role = 'TECHNICAL' then
      new.acquisition_source := 'TECHNICAL_SELF_SOURCED';
      new.technical_owner_id := auth.uid();
      new.bd_owner_id := null;
    elsif v_role = 'BUSINESS_DEVELOPMENT' then
      new.acquisition_source := 'COMPANY_PROVIDED';
      new.bd_owner_id := auth.uid();
      new.technical_owner_id := null;
    elsif v_role = 'ADMIN' then
      new.acquisition_source := coalesce(new.acquisition_source, 'COMPANY_PROVIDED');
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_acquisition_source before insert on public.projects
for each row execute function public.set_project_acquisition_source();

create table public.project_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  question_id text not null,
  question_text text not null,
  answer_id text,
  answer_label text,
  service_category text not null,
  questionnaire_version text not null,
  created_at timestamptz not null default now(),
  unique(project_id, question_id)
);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assignment_source text not null check (assignment_source in ('FIRST_CLAIM','ADMIN_OVERRIDE','SELF_SOURCED')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','COMPLETED')),
  accepted_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index one_active_assignment_per_project on public.project_assignments(project_id) where status = 'ACTIVE';
create index assignments_employee_idx on public.project_assignments(employee_id, status);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE')),
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.pricing_versions (
  id uuid primary key default gen_random_uuid(),
  version_name text not null unique,
  notes text,
  is_current boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index one_current_pricing_version on public.pricing_versions(is_current) where is_current;

create table public.pricing_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pricing_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.pricing_categories(id) on delete restrict,
  version_id uuid not null references public.pricing_versions(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  unit text not null default 'one-time',
  price_paise bigint not null check (price_paise >= 0),
  is_commissionable boolean not null default false,
  is_taxable boolean not null default true,
  tax_rate numeric(6,3) not null default 18 check (tax_rate >= 0 and tax_rate <= 100),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version_id, code)
);
create index pricing_items_active_idx on public.pricing_items(version_id, is_active);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tax_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(6,3) not null check (rate >= 0 and rate <= 100),
  applies_to text not null default 'ALL',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_default_tax_setting on public.tax_settings(is_default) where is_default;

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  quotation_number text not null unique,
  version integer not null default 1,
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SENT','ACCEPTED','EXPIRED')),
  catalogue_version_id uuid references public.pricing_versions(id) on delete restrict,
  items_snapshot jsonb not null default '[]'::jsonb,
  subtotal_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_snapshot jsonb not null default '{}'::jsonb,
  tax_paise bigint not null default 0,
  total_paise bigint not null default 0,
  eligible_amount_paise bigint not null default 0,
  valid_until date,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, version)
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  pricing_item_id uuid references public.pricing_items(id) on delete set null,
  item_snapshot jsonb not null,
  quantity integer not null check (quantity > 0),
  unit_price_paise bigint not null,
  line_total_paise bigint not null,
  created_at timestamptz not null default now()
);

create table public.quotation_approvals (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  status public.approval_status not null,
  comments text,
  created_at timestamptz not null default now()
);

create table public.discount_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_discount_paise bigint not null check (requested_discount_paise > 0),
  reason text not null,
  status public.approval_status not null default 'PENDING',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_comments text,
  created_at timestamptz not null default now()
);

create table public.commission_policies (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null,
  employee_role public.app_role not null,
  acquisition_source public.acquisition_source,
  rate numeric(6,3) not null check (rate >= 0 and rate <= 100),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index commission_policy_lookup_idx on public.commission_policies(employee_role, acquisition_source, effective_from desc) where is_active;

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  employee_role public.app_role not null,
  acquisition_source public.acquisition_source,
  eligible_amount_paise bigint not null check (eligible_amount_paise >= 0),
  rate_snapshot numeric(6,3) not null check (rate_snapshot >= 0 and rate_snapshot <= 100),
  commission_amount_paise bigint not null check (commission_amount_paise >= 0),
  status public.commission_status not null default 'PENDING',
  earned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, employee_id, employee_role)
);
create index commissions_employee_status_idx on public.commissions(employee_id, status);

create table public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  transaction_type text not null check (transaction_type in ('APPROVE','PAYOUT','ADJUSTMENT','REVERSAL')),
  amount_paise bigint not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  payment_reference text,
  notes text,
  paid_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete restrict,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  currency char(3) not null default 'INR',
  payment_method text,
  payment_reference text,
  received_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null,
  resource_type text,
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

-- Audit project status / important changes independently of the browser.
create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_activity_logs(project_id, actor_id, activity_type, description)
    values (new.id, auth.uid(), 'PROJECT_CREATED', 'Project record created');
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.project_activity_logs(project_id, actor_id, activity_type, description, metadata)
    values (new.id, auth.uid(), 'STATUS_CHANGED', old.status::text || ' → ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
create trigger projects_activity_insert after insert on public.projects for each row execute function public.log_project_change();
create trigger projects_activity_update after update on public.projects for each row execute function public.log_project_change();

-- Atomic first-eligible-employee claim. The conditional UPDATE is the concurrency gate.
create or replace function public.accept_available_project(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles%rowtype; v_project public.projects%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if not found or v_profile.role <> 'TECHNICAL' then raise exception 'Only active technical employees can accept projects'; end if;
  update public.projects
     set status = 'IN_DEVELOPMENT', technical_owner_id = auth.uid(), updated_at = now()
   where id = p_project_id and status = 'AVAILABLE' and technical_owner_id is null
   returning * into v_project;
  if not found then raise exception 'This project has already been assigned to another employee.'; end if;
  insert into public.project_assignments(project_id, employee_id, assignment_source)
  values (p_project_id, auth.uid(), 'FIRST_CLAIM');
  insert into public.notifications(recipient_id, title, body, category, resource_type, resource_id)
  select id, 'Project accepted', v_project.title || ' has been accepted by a technical team member.', 'PROJECT', 'PROJECT', v_project.id
  from public.profiles where role = 'ADMIN' and status = 'ACTIVE';
  return v_project;
end;
$$;
grant execute on function public.accept_available_project(uuid) to authenticated;

create or replace function public.admin_review_project(p_project_id uuid, p_decision text, p_reason text default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype; v_admin uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid review decision'; end if;
  update public.projects set
    status = case when p_decision = 'APPROVE' then 'AVAILABLE'::public.project_status else 'REJECTED'::public.project_status end,
    rejection_reason = case when p_decision = 'REJECT' then nullif(trim(p_reason),'') else null end,
    reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
  where id = p_project_id and status = 'PENDING_REVIEW'
  returning * into v_project;
  if not found then raise exception 'Project is not awaiting review'; end if;
  if v_project.created_by is not null then
    insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
    values(v_project.created_by, 'Project reviewed',
      case when p_decision = 'APPROVE' then 'Your project is approved and available to the technical team.' else 'Your project needs revision: ' || coalesce(p_reason,'See administrator comments.') end,
      'PROJECT','PROJECT',v_project.id);
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,reason)
  values(v_admin, 'PROJECT_' || p_decision, 'PROJECT', v_project.id, jsonb_build_object('status',v_project.status), p_reason);
  return v_project;
end;
$$;
grant execute on function public.admin_review_project(uuid,text,text) to authenticated;

create or replace function public.submit_project_for_review(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype;
begin
  update public.projects set status = 'PENDING_REVIEW', updated_at = now()
  where id = p_project_id and created_by = auth.uid() and status = 'DRAFT'
  returning * into v_project;
  if not found then raise exception 'Draft project not found or not editable'; end if;
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select id,'New project submitted','A new project is awaiting review: ' || v_project.title,'PROJECT','PROJECT',v_project.id
  from public.profiles where role = 'ADMIN' and status = 'ACTIVE';
  return v_project;
end;
$$;
grant execute on function public.submit_project_for_review(uuid) to authenticated;

create or replace function public.submit_project_completion(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_project public.projects%rowtype;
begin
  update public.projects set status='COMPLETED_PENDING_REVIEW', completion_submitted_at=now(), updated_at=now()
  where id=p_project_id and technical_owner_id=auth.uid() and status='IN_DEVELOPMENT'
  returning * into v_project;
  if not found then raise exception 'Project cannot be submitted for completion'; end if;
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select id,'Completion review requested',v_project.title || ' is ready for completion review.','PROJECT','PROJECT',v_project.id
  from public.profiles where role='ADMIN' and status='ACTIVE';
  return v_project;
end;
$$;
grant execute on function public.submit_project_completion(uuid) to authenticated;

-- Commission snapshot is created only when an administrator approves completion.
create or replace function public.approve_project_completion(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects%rowtype;
  v_policy public.commission_policies%rowtype;
  v_amount bigint;
  v_rate numeric(6,3);
  v_commission bigint;
  v_employee uuid;
  v_role public.app_role;
  v_source public.acquisition_source;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or v_project.status <> 'COMPLETED_PENDING_REVIEW' then raise exception 'Project is not awaiting completion approval'; end if;
  update public.projects set status='COMPLETED', completion_approved_at=now(), updated_at=now() where id=p_project_id returning * into v_project;

  v_amount := v_project.eligible_amount_paise;
  if v_project.bd_owner_id is not null then
    select * into v_policy from public.commission_policies
    where employee_role='BUSINESS_DEVELOPMENT' and acquisition_source is null and is_active
      and effective_from <= current_date and (effective_to is null or effective_to >= current_date)
    order by effective_from desc limit 1;
    if found then
      v_rate := v_policy.rate;
      v_commission := round(v_amount * v_rate / 100)::bigint;
      insert into public.commissions(project_id,employee_id,employee_role,acquisition_source,eligible_amount_paise,rate_snapshot,commission_amount_paise,status,earned_at)
      values(v_project.id,v_project.bd_owner_id,'BUSINESS_DEVELOPMENT',v_project.acquisition_source,v_amount,v_rate,v_commission,'EARNED',now())
      on conflict(project_id,employee_id,employee_role) do nothing;
    end if;
  end if;

  if v_project.technical_owner_id is not null then
    v_role := 'TECHNICAL';
    v_source := v_project.acquisition_source;
    select * into v_policy from public.commission_policies
    where employee_role='TECHNICAL' and acquisition_source=v_source and is_active
      and effective_from <= current_date and (effective_to is null or effective_to >= current_date)
    order by effective_from desc limit 1;
    if found then
      v_rate := v_policy.rate;
      v_commission := round(v_amount * v_rate / 100)::bigint;
      insert into public.commissions(project_id,employee_id,employee_role,acquisition_source,eligible_amount_paise,rate_snapshot,commission_amount_paise,status,earned_at)
      values(v_project.id,v_project.technical_owner_id,'TECHNICAL',v_source,v_amount,v_rate,v_commission,'EARNED',now())
      on conflict(project_id,employee_id,employee_role) do nothing;
    end if;
  end if;

  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select employee_id,'Commission earned','Commission earned for completed project ' || v_project.title || '.','COMMISSION','PROJECT',v_project.id
  from public.commissions where project_id=v_project.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'PROJECT_COMPLETION_APPROVED','PROJECT',v_project.id,jsonb_build_object('eligible_amount_paise',v_amount));
  return v_project;
end;
$$;
grant execute on function public.approve_project_completion(uuid) to authenticated;

-- Server-side pricing calculation. Browser supplies catalogue IDs + quantities only, never prices.
create or replace function public.save_project_pricing(p_project_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects%rowtype;
  v_item record;
  v_qty integer;
  v_line bigint;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_discount_eligible bigint := 0;
  v_tax bigint := 0;
  v_line_discount bigint;
  v_tax_line bigint;
  v_snapshot jsonb := '[]'::jsonb;
  v_tax_snapshot jsonb := '[]'::jsonb;
  v_total bigint;
  v_version uuid;
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
    v_line := v_item.price_paise * v_qty;
    v_subtotal := v_subtotal + v_line;
    if v_item.is_commissionable then v_eligible := v_eligible + v_line; end if;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'item_id',v_item.id,'code',v_item.code,'name',v_item.name,'description',v_item.description,
      'unit',v_item.unit,'quantity',v_qty,'unit_price_paise',v_item.price_paise,'line_total_paise',v_line,
      'is_commissionable',v_item.is_commissionable,'is_taxable',v_item.is_taxable,'tax_rate',v_item.tax_rate));
  end loop;
  if jsonb_array_length(v_snapshot) <> jsonb_array_length(p_items) then raise exception 'One or more catalogue items are invalid or unavailable'; end if;

  select coalesce(sum(requested_discount_paise),0) into v_discount
  from public.discount_requests where project_id=p_project_id and status='APPROVED';
  if v_discount > v_subtotal then raise exception 'Approved discount exceeds subtotal'; end if;
  if v_subtotal > 0 then v_discount_eligible := round(v_discount::numeric * v_eligible / v_subtotal)::bigint; end if;

  -- Allocate discount proportionally to each line; calculate tax after discount per item.
  for v_item in
    select (e.value->>'line_total_paise')::bigint as line_total,
           coalesce((e.value->>'is_taxable')::boolean,false) as is_taxable,
           coalesce((e.value->>'tax_rate')::numeric,0) as tax_rate,
           coalesce((e.value->>'code'),'') as code,
           coalesce((e.value->>'name'),'') as name
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
  update public.projects set subtotal_paise=v_subtotal,discount_paise=v_discount,tax_paise=v_tax,total_paise=v_total,
    eligible_amount_paise=greatest(v_eligible-v_discount_eligible,0), pricing_snapshot=v_snapshot,
    tax_snapshot=jsonb_build_object('line_taxes',v_tax_snapshot,'tax_total_paise',v_tax), updated_at=now()
  where id=p_project_id;
  return jsonb_build_object('project_id',p_project_id,'subtotal_paise',v_subtotal,'discount_paise',v_discount,
    'tax_paise',v_tax,'total_paise',v_total,'eligible_amount_paise',greatest(v_eligible-v_discount_eligible,0),
    'items',v_snapshot,'taxes',v_tax_snapshot);
end;
$$;
grant execute on function public.save_project_pricing(uuid,jsonb) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.employee_details enable row level security;
alter table public.employee_roles enable row level security;
alter table public.app_settings enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.projects enable row level security;
alter table public.project_requirements enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_activity_logs enable row level security;
alter table public.pricing_versions enable row level security;
alter table public.pricing_categories enable row level security;
alter table public.pricing_items enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.tax_settings enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_approvals enable row level security;
alter table public.discount_requests enable row level security;
alter table public.commission_policies enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_transactions enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profiles_update_self_basic on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy employee_details_self_or_admin on public.employee_details for all to authenticated using (profile_id=auth.uid() or public.is_admin()) with check (profile_id=auth.uid() or public.is_admin());
create policy employee_roles_admin_read on public.employee_roles for select to authenticated using (public.is_admin() or profile_id=auth.uid());

create policy clients_active_read on public.clients for select to authenticated using (public.is_active_employee());
create policy clients_employee_insert on public.clients for insert to authenticated with check (public.is_active_employee() and created_by=auth.uid());
create policy clients_owner_or_admin_update on public.clients for update to authenticated using (public.is_admin() or created_by=auth.uid()) with check (public.is_admin() or created_by=auth.uid());

create policy leads_owner_or_admin_read on public.leads for select to authenticated using (public.is_admin() or owner_id=auth.uid());
create policy leads_bd_insert on public.leads for insert to authenticated with check (public.current_role()='BUSINESS_DEVELOPMENT' and owner_id=auth.uid());
create policy leads_owner_or_admin_update on public.leads for update to authenticated using (public.is_admin() or owner_id=auth.uid()) with check (public.is_admin() or owner_id=auth.uid());
create policy lead_activities_owner_or_admin_read on public.lead_activities for select to authenticated using (public.is_admin() or exists(select 1 from public.leads l where l.id=lead_id and l.owner_id=auth.uid()));
create policy lead_activities_owner_insert on public.lead_activities for insert to authenticated with check (actor_id=auth.uid() and exists(select 1 from public.leads l where l.id=lead_id and (l.owner_id=auth.uid() or public.is_admin())));

create policy projects_admin_all on public.projects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy projects_creator_or_assignee_read on public.projects for select to authenticated using (created_by=auth.uid() or bd_owner_id=auth.uid() or technical_owner_id=auth.uid());
create policy projects_creator_insert on public.projects for insert to authenticated with check (created_by=auth.uid() and public.current_role() in ('BUSINESS_DEVELOPMENT','TECHNICAL'));
create policy projects_creator_update_draft on public.projects for update to authenticated using (created_by=auth.uid() and status in ('DRAFT','REJECTED')) with check (created_by=auth.uid() and status in ('DRAFT','REJECTED'));
create policy project_requirements_owner_or_admin on public.project_requirements for all to authenticated using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and (p.created_by=auth.uid() or p.technical_owner_id=auth.uid()))) with check (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.created_by=auth.uid()));
create policy assignments_employee_or_admin_read on public.project_assignments for select to authenticated using (public.is_admin() or employee_id=auth.uid());
create policy milestones_project_team_read on public.project_milestones for select to authenticated using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and (p.created_by=auth.uid() or p.technical_owner_id=auth.uid())));
create policy milestones_project_team_write on public.project_milestones for all to authenticated using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.technical_owner_id=auth.uid())) with check (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.technical_owner_id=auth.uid()));
create policy project_activity_team_read on public.project_activity_logs for select to authenticated using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and (p.created_by=auth.uid() or p.technical_owner_id=auth.uid())));

create policy pricing_public_active_read on public.pricing_versions for select to authenticated using (is_current or public.is_admin());
create policy categories_active_read on public.pricing_categories for select to authenticated using (is_active or public.is_admin());
create policy items_active_read on public.pricing_items for select to authenticated using (is_active and exists(select 1 from public.pricing_versions v where v.id=version_id and v.is_current) or public.is_admin());
create policy rules_active_read on public.pricing_rules for select to authenticated using (is_active or public.is_admin());
create policy tax_active_read on public.tax_settings for select to authenticated using (is_active or public.is_admin());
create policy pricing_admin_write_categories on public.pricing_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pricing_admin_write_items on public.pricing_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pricing_admin_write_versions on public.pricing_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pricing_admin_write_rules on public.pricing_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pricing_admin_write_tax on public.tax_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy quotations_admin_or_creator_read on public.quotations for select to authenticated using (public.is_admin() or created_by=auth.uid());
create policy quotations_creator_insert on public.quotations for insert to authenticated with check (created_by=auth.uid() and public.is_active_employee());
create policy quotation_items_quotation_read on public.quotation_items for select to authenticated using (exists(select 1 from public.quotations q where q.id=quotation_id and (q.created_by=auth.uid() or public.is_admin())));
create policy quotation_approvals_admin_read on public.quotation_approvals for select to authenticated using (public.is_admin() or reviewer_id=auth.uid());
create policy discount_requests_creator_or_admin_read on public.discount_requests for select to authenticated using (public.is_admin() or requested_by=auth.uid());
create policy discount_requests_creator_insert on public.discount_requests for insert to authenticated with check (requested_by=auth.uid() and public.is_active_employee());
create policy discount_requests_admin_update on public.discount_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy commission_policies_admin_only on public.commission_policies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy commissions_self_or_admin_read on public.commissions for select to authenticated using (employee_id=auth.uid() or public.is_admin());
create policy commission_transactions_self_or_admin_read on public.commission_transactions for select to authenticated using (public.is_admin() or exists(select 1 from public.commissions c where c.id=commission_id and c.employee_id=auth.uid()));
create policy payouts_admin_or_self_read on public.commission_payouts for select to authenticated using (public.is_admin() or employee_id=auth.uid());
create policy payments_admin_only on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy notifications_self_read_update on public.notifications for select to authenticated using (recipient_id=auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Safe, narrow view for first-come project discovery. It intentionally omits all finance fields.
create or replace view public.available_projects with (security_barrier=true) as
select p.id, p.title, p.service_type, p.service_plan, p.description, p.requirements,
       p.questionnaire_answers, p.expected_timeline, p.created_at,
       c.client_name, c.company_name, c.industry
from public.projects p join public.clients c on c.id=p.client_id
where p.status='AVAILABLE' and p.technical_owner_id is null;
grant select on public.available_projects to authenticated;

-- Bootstrap and login support tables are not exposed to authenticated clients.
create table public.login_attempts (
  id bigserial primary key,
  identifier_hash text not null,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);
create index login_attempts_identifier_time_idx on public.login_attempts(identifier_hash, attempted_at desc);
alter table public.login_attempts enable row level security;

-- Seed starter catalogue as editable initial values (paise). Hosting intentionally has no price seeded.
insert into public.pricing_versions(version_name, notes, is_current)
values ('Initial 2026 Catalogue', 'Initial configurable catalogue seed. Update prices before issuing production quotations.', true)
on conflict (version_name) do nothing;
insert into public.pricing_categories(name,description,sort_order) values
 ('Website Development','Website plans and development scope',1),
 ('Web Application Development','Application and platform development',2),
 ('AI Agent Development','AI assistant and automation development',3),
 ('Additional Features','Optional development features',4),
 ('Hosting','Hosting packages; add verified provider costs before use',5),
 ('Domain','Domain registration and renewal',6),
 ('Third-Party Services','External services and assets',7),
 ('Maintenance','Ongoing support and maintenance',8)
on conflict(name) do nothing;
insert into public.pricing_items(category_id,version_id,code,name,description,unit,price_paise,is_commissionable,is_taxable,metadata)
select c.id,v.id,x.code,x.name,x.description,'one-time',x.price_paise,true,true,x.metadata
from (values
 ('BASIC_WEBSITE','Basic Website','Initial starting price; scope must be reviewed',99900::bigint,'{}'::jsonb),
 ('BUSINESS_WEBSITE','Business Website','Initial starting price; backend scope must be reviewed',199900::bigint,'{}'::jsonb),
 ('PREMIUM_WEBSITE','Premium Website','Initial starting value; catalogue can set a final scoped price',299900::bigint,'{"indicative_max_paise":499900}'::jsonb)
) as x(code,name,description,price_paise,metadata)
join public.pricing_categories c on c.name='Website Development'
cross join public.pricing_versions v where v.is_current
on conflict(version_id,code) do nothing;

-- Finalized policy rates; future rows can supersede these without changing commission snapshots.
insert into public.commission_policies(policy_code,employee_role,acquisition_source,rate,effective_from)
values
 ('BD_STANDARD_15','BUSINESS_DEVELOPMENT',null,15.000,'2026-11-26'),
 ('TECH_COMPANY_35','TECHNICAL','COMPANY_PROVIDED',35.000,'2026-11-26'),
 ('TECH_SELF_45','TECHNICAL','TECHNICAL_SELF_SOURCED',45.000,'2026-11-26')
on conflict do nothing;
insert into public.tax_settings(name,rate,applies_to,is_default,is_active)
select 'Initial GST',18,'ALL',true,true
where not exists(select 1 from public.tax_settings where is_default);

-- Generic updated_at triggers.
do $$
declare t text;
begin
  foreach t in array array['employee_details','clients','leads','projects','project_milestones','pricing_categories','pricing_items','pricing_rules','quotations','commissions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

commit;
