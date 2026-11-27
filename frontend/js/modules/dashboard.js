import { supabase } from '../config/supabase.js';
import { Data } from '../services/data-service.js';
import { money, compactMoney, escapeHtml, statusPill, emptyState } from '../utils/dom.js';

async function count(table, filter) {
  let q=supabase.from(table).select('id',{count:'exact',head:true});
  if(filter) q=filter(q);
  const {count,error}=await q; if(error) throw error; return count||0;
}
const card=(label,value,icon,foot='Live database value')=>`<article class="card stat-card"><div class="stat-head"><span>${label}</span><span class="stat-icon"><i data-lucide="${icon}"></i></span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;

export async function renderDashboard(profile) {
  const admin=profile.role==='ADMIN', bd=profile.role==='BUSINESS_DEVELOPMENT';
  const content=`<div class="page-head"><div><div class="eyebrow">${admin?'COMPANY OVERVIEW':bd?'GROWTH WORKSPACE':'DELIVERY WORKSPACE'}</div><h1 class="page-title">Welcome back, ${escapeHtml(profile.full_name.split(' ')[0])}</h1><p class="page-subtitle">${admin?'Your operations at a glance. All figures below come from authorized Supabase records.':bd?'Track client relationships, lead progress and your submitted opportunities.':'Your delivery queue, accepted projects and completion progress.'}</p></div>${bd?'<a class="btn btn-primary" href="/bd/projects" data-nav="/bd/projects"><i data-lucide="plus"></i> Create project</a>':''}</div><div class="stat-grid" id="stats-grid"><div class="loading"><span class="spinner"></span>Loading live metrics…</div></div><div class="dashboard-grid"><section class="card section-card"><div class="section-head"><div><h3>${admin?'Project pipeline':bd?'My recent leads':'Project portfolio'}</h3><p>Recent activity from your workspace</p></div><span class="pill accent">Live</span></div><div id="dashboard-table" class="loading"><span class="spinner"></span>Loading records…</div></section><section class="card section-card"><div class="section-head"><div><h3>${admin?'Operational mix':'Recent notifications'}</h3><p>${admin?'Projects grouped by current status':'Updates relevant to your account'}</p></div></div><div id="dashboard-side" class="loading"><span class="spinner"></span>Loading…</div></section></div>`;
  setTimeout(()=>loadDashboard(profile).catch(err=>showDashError(err)),0);
  return content;
}

async function loadDashboard(profile) {
  const stats=[];
  if(profile.role==='ADMIN') {
    const [employees,bd,tech,clients,leads,projects,pending,available,development,completed,quotes,commissions,payments] = await Promise.all([
      count('profiles'),count('profiles',q=>q.eq('role','BUSINESS_DEVELOPMENT').eq('status','ACTIVE')),
      count('profiles',q=>q.eq('role','TECHNICAL').eq('status','ACTIVE')),count('clients',q=>q.eq('is_archived',false)),
      count('leads'),count('projects'),count('projects',q=>q.eq('status','PENDING_REVIEW')),
      count('projects',q=>q.eq('status','AVAILABLE')),count('projects',q=>q.eq('status','IN_DEVELOPMENT')),
      count('projects',q=>q.eq('status','COMPLETED')),count('quotations',q=>q.in('status',['PENDING_APPROVAL','DRAFT'])),
      supabase.from('commissions').select('commission_amount_paise,status'),supabase.from('payments').select('amount_paise')
    ]);
    if(commissions.error) throw commissions.error; if(payments.error) throw payments.error;
    const quoted=(commissions.data||[]).filter(x=>['PENDING','EARNED','APPROVED'].includes(x.status)).reduce((s,x)=>s+x.commission_amount_paise,0);
    const earned=(commissions.data||[]).filter(x=>['EARNED','APPROVED','PAID'].includes(x.status)).reduce((s,x)=>s+x.commission_amount_paise,0);
    const paid=(commissions.data||[]).filter(x=>x.status==='PAID').reduce((s,x)=>s+x.commission_amount_paise,0);
    const revenue=(payments.data||[]).reduce((s,x)=>s+x.amount_paise,0);
    stats.push(card('Total employees',employees,'users',`${bd} BD · ${tech} technical`),card('Total clients',clients,'contact-round'),card('Total leads',leads,'target'),card('Total projects',projects,'workflow'),card('Pending review',pending,'clock-3'),card('Available projects',available,'inbox'),card('In development',development,'code-2'),card('Completed projects',completed,'check-circle-2'),card('Pending quotations',quotes,'file-text'),card('Recorded client payments',compactMoney(revenue),'wallet'),card('Commission liabilities',money(quoted),'Unpaid pending / earned / approved'),card('Earned commissions',money(earned),'Earned, approved and paid'),card('Paid commissions',money(paid),'Recorded payouts'));
    const projectRows=await supabase.from('projects').select('id,title,status,service_type,created_at,client:clients(client_name)').order('created_at',{ascending:false}).limit(6);
    if(projectRows.error) throw projectRows.error;
    document.querySelector('#dashboard-table').innerHTML=projectRows.data.length?`<div class="table-wrap"><table><thead><tr><th>Project</th><th>Client</th><th>Status</th></tr></thead><tbody>${projectRows.data.map(p=>`<tr><td><strong>${escapeHtml(p.title)}</strong><br><small class="muted">${escapeHtml(p.service_type)}</small></td><td>${escapeHtml(p.client?.client_name||'—')}</td><td>${statusPill(p.status)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('workflow','No projects yet','New submissions will appear here.');
    const statuses=['PENDING_REVIEW','AVAILABLE','IN_DEVELOPMENT','COMPLETED_PENDING_REVIEW','COMPLETED','REJECTED'];
    const grouped=await supabase.from('projects').select('status'); if(grouped.error) throw grouped.error;
    const summary=statuses.map(s=>[s,grouped.data.filter(p=>p.status===s).length]);
    document.querySelector('#dashboard-side').innerHTML=`<div class="chart-wrap"><canvas id="pipeline-chart" aria-label="Project pipeline chart"></canvas></div><div class="summary-list">${summary.slice(0,4).map(([s,n])=>`<div class="summary-row"><span>${escapeHtml(s.replaceAll('_',' '))}</span><strong>${n}</strong></div>`).join('')}</div>`;
    drawChart(summary.map(x=>x[0].replaceAll('_',' ')),summary.map(x=>x[1]));
  } else if(profile.role==='BUSINESS_DEVELOPMENT') {
    const [leads,clients,projects,pending,approved,completed,commissionRows]=await Promise.all([
      count('leads',q=>q.eq('owner_id',profile.id)),count('clients',q=>q.eq('created_by',profile.id)),
      count('projects',q=>q.eq('created_by',profile.id)),count('projects',q=>q.eq('created_by',profile.id).eq('status','PENDING_REVIEW')),
      count('projects',q=>q.eq('bd_owner_id',profile.id).in('status',['AVAILABLE','IN_DEVELOPMENT'])),
      count('projects',q=>q.eq('bd_owner_id',profile.id).eq('status','COMPLETED')),Data.commissions()
    ]);
    const myTotal=commissionRows.reduce((s,x)=>s+x.commission_amount_paise,0);
    stats.push(card('My total leads',leads,'target'),card('Clients created by me',clients,'contact-round'),card('My submitted projects',projects,'workflow'),card('Pending approvals',pending,'clock-3'),card('Approved / active',approved,'check-circle-2'),card('Completed projects',completed,'trophy'),card('My recorded commissions',money(myTotal),'badge-indian-rupee','Visible only to your account'));
    const leadRows=await supabase.from('leads').select('id,title,status,created_at,client:clients(client_name)').eq('owner_id',profile.id).order('created_at',{ascending:false}).limit(6);
    if(leadRows.error) throw leadRows.error;
    document.querySelector('#dashboard-table').innerHTML=leadRows.data.length?`<div class="table-wrap"><table><thead><tr><th>Lead</th><th>Client</th><th>Status</th></tr></thead><tbody>${leadRows.data.map(l=>`<tr><td>${escapeHtml(l.title)}</td><td>${escapeHtml(l.client?.client_name||'—')}</td><td>${statusPill(l.status)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('target','No leads recorded','Add a lead to start tracking an opportunity.');
    await renderNotifications();
  } else {
    const [available,assigned,development,review,completed,commissionRows]=await Promise.all([
      count('available_projects'),
      count('projects',q=>q.eq('technical_owner_id',profile.id)),
      count('projects',q=>q.eq('technical_owner_id',profile.id).eq('status','IN_DEVELOPMENT')),
      count('projects',q=>q.eq('technical_owner_id',profile.id).eq('status','COMPLETED_PENDING_REVIEW')),
      count('projects',q=>q.eq('technical_owner_id',profile.id).eq('status','COMPLETED')),Data.commissions()
    ]);
    const earned=commissionRows.filter(c=>['EARNED','APPROVED','PAID'].includes(c.status)).reduce((s,c)=>s+c.commission_amount_paise,0);
    stats.push(card('Available projects',available,'inbox'),card('My assigned projects',assigned,'folder-kanban'),card('In development',development,'code-2'),card('Pending completion review',review,'clock-3'),card('Completed projects',completed,'check-circle-2'),card('My earned commission',money(earned),'badge-indian-rupee','Commission earned after Admin completion approval'));
    const rows=await supabase.from('projects').select('id,title,status,service_type,created_at,client:clients(client_name)').eq('technical_owner_id',profile.id).order('created_at',{ascending:false}).limit(6);
    if(rows.error) throw rows.error;
    document.querySelector('#dashboard-table').innerHTML=rows.data.length?`<div class="table-wrap"><table><thead><tr><th>Project</th><th>Client</th><th>Status</th></tr></thead><tbody>${rows.data.map(p=>`<tr><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.client?.client_name||'—')}</td><td>${statusPill(p.status)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('code-2','No assigned projects','Accept a project from the available queue.');
    await renderNotifications();
  }
  document.querySelector('#stats-grid').innerHTML=stats.join('');
  window.lucide?.createIcons?.();
}
function drawChart(labels,data) {
  const canvas=document.querySelector('#pipeline-chart'); if(!canvas||!window.Chart) return;
  new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data,borderWidth:0,backgroundColor:['#9279f4','#62d6a0','#70c9df','#f2c56c','#7a85a8','#fa7d91']}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#a4a5c0',boxWidth:8,font:{size:10}}}}}});
}
async function renderNotifications() {
  const root=document.querySelector('#dashboard-side'); if(!root) return;
  const n=await Data.notifications();
  root.innerHTML=n.length?`<div class="summary-list">${n.map(x=>`<div class="summary-row" style="display:block"><strong style="display:block;text-align:left">${escapeHtml(x.title)}</strong><span style="display:block;margin-top:5px">${escapeHtml(x.body)}</span></div>`).join('')}</div>`:emptyState('bell','All caught up','Notifications about your work will appear here.');
}
function showDashError(error) {
  ['#stats-grid','#dashboard-table','#dashboard-side'].forEach(sel=>{const el=document.querySelector(sel); if(el) el.innerHTML=`<div class="empty-state"><h3>Could not load dashboard data</h3><p>${escapeHtml(error.message||'Please refresh or check your Supabase policies.')}</p></div>`;});
}
