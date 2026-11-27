begin;

create or replace function public.admin_reassign_project(p_project_id uuid,p_employee_id uuid,p_reason text)
returns public.projects language plpgsql security definer set search_path=public as $$
declare v_project public.projects%rowtype; v_employee public.profiles%rowtype; v_old uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A reason is required for reassignment'; end if;
  select * into v_employee from public.profiles where id=p_employee_id and role='TECHNICAL' and status='ACTIVE';
  if not found then raise exception 'Select an active Technical employee'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or v_project.status not in ('AVAILABLE','IN_DEVELOPMENT') then raise exception 'Project cannot be reassigned in its current state'; end if;
  v_old:=v_project.technical_owner_id;
  update public.project_assignments set status='RELEASED',released_at=now()
  where project_id=p_project_id and status='ACTIVE';
  update public.projects set technical_owner_id=p_employee_id,status='IN_DEVELOPMENT',updated_at=now()
  where id=p_project_id returning * into v_project;
  insert into public.project_assignments(project_id,employee_id,assigned_by,assignment_source)
  values(p_project_id,p_employee_id,auth.uid(),'ADMIN_OVERRIDE');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'PROJECT_REASSIGNED','PROJECT',p_project_id,jsonb_build_object('technical_owner_id',v_old),jsonb_build_object('technical_owner_id',p_employee_id),p_reason);
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(p_employee_id,'Project assigned','You have been assigned project '||v_project.title||' by an administrator.','PROJECT','PROJECT',p_project_id);
  if v_old is not null and v_old<>p_employee_id then
    insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
    values(v_old,'Project reassigned',v_project.title||' has been reassigned by an administrator.','PROJECT','PROJECT',p_project_id);
  end if;
  return v_project;
end;
$$;
grant execute on function public.admin_reassign_project(uuid,uuid,text) to authenticated;

create or replace function public.admin_reject_project_completion(p_project_id uuid,p_reason text)
returns public.projects language plpgsql security definer set search_path=public as $$
declare v_project public.projects%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A rejection reason is required'; end if;
  update public.projects set status='IN_DEVELOPMENT',completion_submitted_at=null,updated_at=now()
  where id=p_project_id and status='COMPLETED_PENDING_REVIEW' returning * into v_project;
  if not found then raise exception 'Project is not awaiting completion review'; end if;
  insert into public.project_activity_logs(project_id,actor_id,activity_type,description)
  values(p_project_id,auth.uid(),'COMPLETION_REJECTED',p_reason);
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(v_project.technical_owner_id,'Completion needs changes',p_reason,'PROJECT','PROJECT',p_project_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason)
  values(auth.uid(),'PROJECT_COMPLETION_REJECTED','PROJECT',p_project_id,p_reason);
  return v_project;
end;
$$;
grant execute on function public.admin_reject_project_completion(uuid,text) to authenticated;

-- Reject discounts that exceed the current estimate before changing their approval state.
create or replace function public.admin_review_discount(p_request_id uuid,p_decision text,p_comments text default null)
returns public.discount_requests language plpgsql security definer set search_path=public as $$
declare v_row public.discount_requests%rowtype; v_subtotal bigint; v_already bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid discount decision'; end if;
  select * into v_row from public.discount_requests where id=p_request_id for update;
  if not found or v_row.status<>'PENDING' then raise exception 'Discount request is not pending'; end if;
  if p_decision='APPROVED' then
    select subtotal_paise into v_subtotal from public.projects where id=v_row.project_id;
    select coalesce(sum(requested_discount_paise),0) into v_already from public.discount_requests
      where project_id=v_row.project_id and status='APPROVED';
    if v_subtotal is null or v_subtotal=0 or v_already+v_row.requested_discount_paise>v_subtotal then
      raise exception 'Discount exceeds the current priced subtotal. Recalculate or revise the request first.';
    end if;
  end if;
  update public.discount_requests set status=p_decision::public.approval_status,reviewed_by=auth.uid(),reviewed_at=now(),admin_comments=p_comments
  where id=p_request_id returning * into v_row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'DISCOUNT_'||p_decision,'DISCOUNT_REQUEST',v_row.id,jsonb_build_object('discount_paise',v_row.requested_discount_paise),p_comments);
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(v_row.requested_by,'Discount request reviewed','Your discount request was '||lower(p_decision)||'.','DISCOUNT','PROJECT',v_row.project_id);
  return v_row;
end;
$$;
grant execute on function public.admin_review_discount(uuid,text,text) to authenticated;

commit;
