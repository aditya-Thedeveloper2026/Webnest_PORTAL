import { Data } from '../services/data-service.js';
import { supabase } from '../config/supabase.js';
import { escapeHtml, date, money, statusPill, emptyState } from '../utils/dom.js';
import { navigate } from '../auth/router.js';

export async function renderProjects(profile,path) {
  if(path.endsWith('/new-project')) return `<div class="loading"><span class="spinner"></span>Opening guided project discovery…</div>`;
  const admin=profile.role==='ADMIN';
  const available=path.endsWith('/available-projects');
  const selfSourced=path.endsWith('/self-sourced-projects');
  let rows=[];
  let technicalEmployees=[];
  if(available) rows=await Data.availableProjects();
  else rows=await Data.listProjects({admin,technical:profile.role==='TECHNICAL'});
  if(admin) technicalEmployees=(await Data.listProfiles()).filter(e=>e.role==='TECHNICAL'&&e.status==='ACTIVE');
  if(selfSourced) rows=rows.filter(p=>p.acquisition_source==='TECHNICAL_SELF_SOURCED'||p.created_by===profile.id);
  const title=admin?'Project management':available?'Available projects':selfSourced?'Self-sourced projects':profile.role==='TECHNICAL'?'My projects':'My projects';
  const subtitle=admin?'Review submissions, publish approved work and monitor delivery.':available?'Projects approved by Admin and available for first-come-first-served acceptance.':selfSourced?'Projects you sourced directly are submitted for Admin review and assigned back to you.':profile.role==='TECHNICAL'?'Your accepted projects and delivery workflow.':'Track the opportunities you have submitted and their approval status.';
  const action=admin?'':profile.role==='BUSINESS_DEVELOPMENT'?'Create project':'Add my own project';
  const statusFilter=admin?['PENDING_REVIEW','AVAILABLE','IN_DEVELOPMENT','COMPLETED_PENDING_REVIEW','COMPLETED','REJECTED']:[];
  return `<div class="page-head"><div><div class="eyebrow">DELIVERY OPERATIONS</div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="page-actions">${action?`<button class="btn btn-primary" data-action="project-new"><i data-lucide="plus"></i> ${action}</button>`:''}</div></div>
    ${admin?`<div class="stat-grid">${await adminProjectStats()}</div>`:''}
    <section class="card section-card"><div class="section-head"><div><h3>${available?'Claimable projects':admin?'All projects':selfSourced?'My sourced projects':'Project records'} <span class="pill">${rows.length}</span></h3><p>${available?'The database allocates each project to only one active Technical employee.':'All status transitions are recorded in project activity history.'}</p></div><input id="project-search" class="input" style="max-width:230px" placeholder="Search projects…"></div>
    <div id="projects-table">${renderProjectRows(rows,{admin,available,profile,technicalEmployees})}</div></section>`;
}
async function adminProjectStats(){
  const specs=[['Pending review','PENDING_REVIEW'],['Available','AVAILABLE'],['In development','IN_DEVELOPMENT'],['Completion review','COMPLETED_PENDING_REVIEW']];
  const counts=await Promise.all(specs.map(async ([label,status])=>{const {count,error}=await supabase.from('projects').select('id',{count:'exact',head:true}).eq('status',status);if(error)throw error;return [label,count||0];}));
  return counts.map(([label,value])=>`<article class="card stat-card"><div class="stat-head">${label}<span class="stat-icon"><i data-lucide="workflow"></i></span></div><div class="stat-value">${value}</div></article>`).join('');
}
function renderProjectRows(rows,{admin,available,profile,technicalEmployees=[]}) {
  if(!rows.length) return emptyState(available?'inbox':'workflow',available?'No available projects':'No projects found',available?'New approved projects will appear here.':'Projects created in your workspace will appear here.',!admin&&!available?`<button class="btn btn-primary" data-action="project-new">Create a project</button>`:'');
  return `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Client</th><th>Service</th><th>Status</th>${admin?'<th>Estimated value</th><th>Created by</th>':''}<th>Timeline</th><th>Action</th></tr></thead><tbody>${rows.map(p=>{
    const client=p.client?.client_name||p.client_name||'—';
    let btn='';
    if(available) btn=`<button class="btn btn-primary" data-action="accept-project" data-id="${p.id}">Accept project</button>`;
    else if(admin&&p.status==='PENDING_REVIEW') btn=`<button class="btn btn-primary" data-action="approve-project" data-id="${p.id}">Approve</button> <button class="btn btn-ghost" data-action="reject-project" data-id="${p.id}">Reject</button>`;
    else if(admin&&p.status==='COMPLETED_PENDING_REVIEW') btn=`<button class="btn btn-primary" data-action="approve-completion" data-id="${p.id}">Approve completion</button> <button class="btn btn-ghost" data-action="reject-completion" data-id="${p.id}">Request changes</button>`;
    else if(admin&&['AVAILABLE','IN_DEVELOPMENT'].includes(p.status)) btn=`<div class="inline-actions"><select data-project-assignee="${p.id}" aria-label="Choose technical assignee"><option value="">Select Technical employee</option>${technicalEmployees.map(e=>`<option value="${e.id}" ${p.technical_owner_id===e.id?'selected':''}>${escapeHtml(e.full_name)}</option>`).join('')}</select><button class="btn btn-secondary" data-action="reassign-project" data-id="${p.id}">Assign / reassign</button></div>`;
    else if(profile.role==='TECHNICAL'&&p.status==='IN_DEVELOPMENT') btn=`<button class="btn btn-secondary" data-action="submit-completion" data-id="${p.id}">Submit completion</button>`;
    else if(['BUSINESS_DEVELOPMENT','TECHNICAL'].includes(profile.role)&&p.created_by===profile.id&&Number(p.total_paise)>0&&!['DRAFT','REJECTED'].includes(p.status)) btn=`<button class="btn btn-secondary" data-action="create-quotation" data-id="${p.id}">Create quotation</button> <button class="btn btn-ghost" data-action="request-discount" data-id="${p.id}">Request discount</button>`;
    else if(['DRAFT','REJECTED'].includes(p.status)&&p.created_by===profile.id) btn=`<button class="btn btn-secondary" data-action="resume-project" data-id="${p.id}">Resume draft</button>`;
    else btn='<span class="muted">—</span>';
    return `<tr data-search="${escapeHtml(`${p.title} ${client} ${p.service_type}`.toLowerCase())}"><td><strong>${escapeHtml(p.title)}</strong><br><small class="muted">${date(p.created_at)}</small></td><td>${escapeHtml(client)}</td><td>${escapeHtml(p.service_type||'—')}<br><small class="muted">${escapeHtml(p.service_plan||'')}</small></td><td>${statusPill(p.status)}</td>${admin?`<td>${money(p.total_paise||0)}</td><td>${escapeHtml(p.creator?.full_name||p.created_by||'—')}</td>`:''}<td>${escapeHtml(p.expected_timeline||'—')}</td><td>${btn}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
