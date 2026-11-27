begin;

alter table public.projects add column if not exists pricing_version_id uuid references public.pricing_versions(id) on delete restrict;
create sequence if not exists public.quotation_number_seq;

-- Preserve the exact catalogue version used for every saved project estimate.
create or replace function public.capture_project_pricing_version()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.pricing_snapshot is distinct from old.pricing_snapshot and new.pricing_snapshot <> '{}'::jsonb then
    select id into new.pricing_version_id from public.pricing_versions where is_current=true limit 1;
  end if;
  return new;
end;
$$;
create trigger projects_capture_pricing_version before update of pricing_snapshot on public.projects
for each row execute function public.capture_project_pricing_version();

-- Keep the normalized requirement table in step with the wizard snapshot.
create or replace function public.sync_project_questionnaire_requirements()
returns trigger language plpgsql security definer set search_path=public as $$
declare entry jsonb;
begin
  if jsonb_typeof(new.questionnaire_answers)='array' then
    for entry in select value from jsonb_array_elements(new.questionnaire_answers) loop
      insert into public.project_requirements(project_id,question_id,question_text,answer_id,answer_label,service_category,questionnaire_version)
      values(new.id,entry->>'question_id',coalesce(entry->>'question_text',''),
        entry->'answer_ids'->>0,coalesce(entry->>'answer_label',''),coalesce(entry->>'service_category',new.service_type),new.questionnaire_version)
      on conflict(project_id,question_id) do update set question_text=excluded.question_text,answer_id=excluded.answer_id,
        answer_label=excluded.answer_label,service_category=excluded.service_category,questionnaire_version=excluded.questionnaire_version;
    end loop;
  end if;
  return new;
end;
$$;
create trigger projects_sync_questionnaire after insert or update of questionnaire_answers on public.projects
for each row execute function public.sync_project_questionnaire_requirements();

create or replace function public.create_quotation_from_project(p_project_id uuid,p_valid_until date default (current_date+14))
returns public.quotations language plpgsql security definer set search_path=public as $$
declare v_project public.projects%rowtype; v_quote public.quotations%rowtype; v_version integer; v_number text; v_line jsonb;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if not (public.is_admin() or v_project.created_by=auth.uid()) then raise exception 'Not authorized to quote this project'; end if;
  if v_project.status in ('DRAFT','REJECTED','ARCHIVED') then raise exception 'Project must be submitted and under review before a quotation can be created'; end if;
  if jsonb_typeof(v_project.pricing_snapshot)<>'array' or jsonb_array_length(v_project.pricing_snapshot)=0 then raise exception 'Project pricing has not been calculated'; end if;
  select coalesce(max(version),0)+1 into v_version from public.quotations where project_id=p_project_id;
  v_number:='WN-'||to_char(current_date,'YYYYMM')||'-'||lpad(nextval('public.quotation_number_seq')::text,5,'0');
  insert into public.quotations(project_id,client_id,created_by,quotation_number,version,status,catalogue_version_id,
    items_snapshot,subtotal_paise,discount_paise,tax_snapshot,tax_paise,total_paise,eligible_amount_paise,valid_until)
  values(v_project.id,v_project.client_id,auth.uid(),v_number,v_version,'PENDING_APPROVAL',v_project.pricing_version_id,
    v_project.pricing_snapshot,v_project.subtotal_paise,v_project.discount_paise,v_project.tax_snapshot,
    v_project.tax_paise,v_project.total_paise,v_project.eligible_amount_paise,p_valid_until)
  returning * into v_quote;
  for v_line in select value from jsonb_array_elements(v_project.pricing_snapshot) loop
    insert into public.quotation_items(quotation_id,pricing_item_id,item_snapshot,quantity,unit_price_paise,line_total_paise)
    values(v_quote.id,nullif(v_line->>'item_id','')::uuid,v_line,(v_line->>'quantity')::integer,
      (v_line->>'unit_price_paise')::bigint,(v_line->>'line_total_paise')::bigint);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'QUOTATION_CREATED','QUOTATION',v_quote.id,jsonb_build_object('quotation_number',v_number,'total_paise',v_quote.total_paise));
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  select id,'Quotation submitted for approval','Quotation '||v_number||' is awaiting Admin review.','QUOTATION','PROJECT',v_project.id
  from public.profiles where role='ADMIN' and status='ACTIVE';
  return v_quote;
end;
$$;
grant execute on function public.create_quotation_from_project(uuid,date) to authenticated;

create or replace function public.admin_review_quotation(p_quotation_id uuid,p_decision text,p_comments text default null)
returns public.quotations language plpgsql security definer set search_path=public as $$
declare v_quote public.quotations%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid quotation decision'; end if;
  update public.quotations set status=p_decision where id=p_quotation_id and status='PENDING_APPROVAL' returning * into v_quote;
  if not found then raise exception 'Quotation is not awaiting approval'; end if;
  insert into public.quotation_approvals(quotation_id,reviewer_id,status,comments)
  values(v_quote.id,auth.uid(),p_decision::public.approval_status,p_comments);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'QUOTATION_'||p_decision,'QUOTATION',v_quote.id,jsonb_build_object('status',v_quote.status),p_comments);
  insert into public.notifications(recipient_id,title,body,category,resource_type,resource_id)
  values(v_quote.created_by,'Quotation reviewed','Quotation '||v_quote.quotation_number||' was '||lower(p_decision)||'.','QUOTATION','PROJECT',v_quote.project_id);
  return v_quote;
end;
$$;
grant execute on function public.admin_review_quotation(uuid,text,text) to authenticated;

create or replace function public.admin_adjust_commission(p_commission_id uuid,p_adjustment_paise bigint,p_reason text)
returns public.commissions language plpgsql security definer set search_path=public as $$
declare v_row public.commissions%rowtype; v_amount bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_adjustment_paise=0 or length(trim(coalesce(p_reason,'')))<5 then raise exception 'A non-zero adjustment and a clear reason are required'; end if;
  select * into v_row from public.commissions where id=p_commission_id for update;
  if not found or v_row.status in ('PAID','REVERSED') then raise exception 'This commission cannot be adjusted'; end if;
  v_amount:=v_row.commission_amount_paise+p_adjustment_paise;
  if v_amount<0 then raise exception 'Adjustment cannot make the commission negative'; end if;
  update public.commissions set commission_amount_paise=v_amount,updated_at=now() where id=p_commission_id returning * into v_row;
  insert into public.commission_transactions(commission_id,actor_id,transaction_type,amount_paise,reason)
  values(v_row.id,auth.uid(),'ADJUSTMENT',p_adjustment_paise,p_reason);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'COMMISSION_ADJUSTED','COMMISSION',v_row.id,
    jsonb_build_object('commission_amount_paise',v_amount-p_adjustment_paise),jsonb_build_object('commission_amount_paise',v_amount),p_reason);
  return v_row;
end;
$$;
grant execute on function public.admin_adjust_commission(uuid,bigint,text) to authenticated;

commit;
