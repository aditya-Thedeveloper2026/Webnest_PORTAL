import { supabase } from '../config/supabase.js';
import { Data } from '../services/data-service.js';
import { QUESTIONNAIRES, activeQuestionPages, questionAnswerRecord } from './questionnaires.js';
import { $, escapeHtml, money, toast, setBusy, statusPill, renderIcons } from '../utils/dom.js';
import { mountNexus, unmountNexus } from '../components/nexus-assistant.js';

let wizard = null;
const SERVICE = {
  WEBSITE:{title:'Website',description:'Create a beautiful digital presence for your business.',icon:'globe',type:'WEBSITE'},
  APPLICATION:{title:'Mobile or Web Application',description:'Build a functional application designed around your business needs.',icon:'app-window',type:'APPLICATION'},
  AI_AGENT:{title:'AI Agent',description:'Bring intelligent AI-powered assistance and automation into your business.',icon:'bot',type:'AI_AGENT'}
};
const WEBSITE_PLANS = [
  {code:'BASIC_WEBSITE',name:'Basic Website',price:'₹999',desc:'A clear, responsive starting point for a simple online presence.',features:['Frontend development','Responsive layout','Basic website structure','Basic interactive functionality'],excludes:'Custom backend development and AI integration are not included.'},
  {code:'BUSINESS_WEBSITE',name:'Business Website',price:'₹1,999',desc:'A stronger business website with backend-connected functionality.',features:['Frontend development','Backend integration','Database-backed functionality where required','Business-oriented features'],excludes:'Hosting is charged separately.'},
  {code:'PREMIUM_WEBSITE',name:'Premium Website',price:'₹2,999+',desc:'A scoped premium build for advanced functionality and integrations.',features:['Frontend and backend development','AI integration where scoped','Advanced business functionality','More sophisticated interactions'],excludes:'Indicative catalogue range ₹2,999–₹4,999; complex scope may cost more.'}
];
const APP_TYPES=['Business Management Application','E-commerce Application','Educational Application','Booking and Appointment Application','Social or Community Application','Productivity Application','Finance or Tracking Application','Customer Portal','Employee Management Application','Custom Application',"I don't know"];
const AI_TYPES=['Customer Support Agent','Website Chatbot','WhatsApp Business Assistant','Sales and Lead Qualification Agent','Appointment Booking Agent','Internal Business Assistant','Document and Knowledge Assistant','Workflow Automation Agent','Voice AI Agent','Research Assistant','Custom AI Agent',"I don't know"];

export async function renderProjectWizard(profile, options={}) {
  if(!wizard || wizard.profile.id!==profile.id || options.reset) {
    wizard={profile,stage:0,qPage:0,service:null,plan:null,client:null,clients:[],projectId:null,answers:{},notes:'',projectTitle:'',timeline:'',catalogue:[],selectedItemIds:[],pricing:null,pricingSaved:false,catalogueLoaded:false,selfSourced:profile.role==='TECHNICAL',project:null};
  }
  wizard.clients=await Data.listClients(); window.__wizardClientCache=wizard.clients;
  if(options.project) {
    const p=options.project;
    wizard.projectId=p.id; wizard.project=p;
    wizard.service=Object.keys(SERVICE).find(k=>SERVICE[k].type===p.service_type)||null;
    wizard.plan=p.service_plan||null;
    wizard.answers=Object.fromEntries((p.questionnaire_answers||[]).map(a=>[a.question_id,{answer_ids:a.answer_ids||[],answer_labels:a.answer_labels||[],answer_label:a.answer_label}]));
    wizard.client=wizard.clients.find(c=>c.id===p.client_id)||null;
    wizard.projectTitle=p.title; wizard.notes=p.description||''; wizard.timeline=p.expected_timeline||'';
    const meta=p.wizard_data||{}; wizard.qPage=meta.qPage||0; wizard.stage=meta.stage||0;
    wizard.selfSourced=profile.role==='TECHNICAL';
  }
  const root=document.querySelector('#page-content');
  root.innerHTML=await renderWizardContent();
  await mountNexus($('#nexus-assistant'));
  renderIcons();
  return '';
}

async function renderWizardContent() {
  if(wizard.stage===6 && !wizard.catalogueLoaded) {
    wizard.catalogue=await Data.catalogue(); wizard.catalogueLoaded=true;
    const baseCode=wizard.service==='WEBSITE'?wizard.plan:null;
    const base=baseCode?wizard.catalogue.find(item=>item.code===baseCode):null;
    if(base && !wizard.selectedItemIds.length) wizard.selectedItemIds=[base.id];
  }
  const pages=wizard.service?activeQuestionPages(wizard.service,wizard.answers):[];
  const total=7+pages.length;
  const current=wizard.stage<=2?wizard.stage:wizard.stage===3?3+wizard.qPage:wizard.stage===4?3+pages.length:wizard.stage===5?4+pages.length:wizard.stage===6?5+pages.length:6+pages.length;
  const progress=Math.min(100,Math.round((current/Math.max(total,1))*100));
  return `<div class="wizard-shell">
    <div class="wizard-top"><div><div class="eyebrow">WEBNEST NEXUS · GUIDED DISCOVERY</div><h1 class="page-title" style="font-size:25px;margin-top:5px">Create New Project with Nexus</h1><p class="page-subtitle">A guided conversation to understand your client's goals and shape the right solution.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-wizard-action="save-draft" ${wizard.projectId?'':'disabled'}><i data-lucide="save"></i> Save draft</button><button class="btn btn-ghost" data-action="wizard-exit">Exit</button></div></div>
    <div class="wizard-progress"><span style="width:${progress}%"></span></div>
    <div class="wizard-top" style="margin-top:-12px;margin-bottom:14px"><span class="pill accent">Step ${Math.min(current+1,total)} of ${total}</span><span class="muted" style="font-size:11px">${escapeHtml(stageLabel(pages))}</span></div>
    <section class="card wizard-card">${renderWizardStep(pages)}</section>
  </div>`;
}
function stageLabel(pages) {
  if(wizard.stage===0) return 'Client details'; if(wizard.stage===1) return 'Choose a service'; if(wizard.stage===2) return 'Choose a plan or type';
  if(wizard.stage===3) return `Discovery questions · ${wizard.qPage+1}/${pages.length}`;
  return ({4:'Additional requirements',5:'Project summary',6:'Project investment',7:'Client brochure'})[wizard.stage]||'Project setup';
}
function shellStep(eyebrow,title,description,body,footer=false) {
  return `<div class="nexus-wrap" id="nexus-assistant"></div><div class="wizard-copy"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${description}</p></div>${body}${footer?wizardFooter():''}`;
}
function wizardFooter({back=true,next='Continue',nextAction='next'}={}) {
  return `<div class="wizard-footer">${back?'<button class="btn btn-secondary" data-wizard-action="back"><i data-lucide="arrow-left"></i> Back</button>':'<span class="muted" style="font-size:10px">Your answers are saved to your draft as you continue.</span>'}<button class="btn btn-primary" data-wizard-action="${nextAction}">${next} <i data-lucide="arrow-right"></i></button></div>`;
}
function renderWizardStep(pages) {
  if(wizard.stage===0) return renderClientStep();
  if(wizard.stage===1) return shellStep('STEP 02 · SERVICE','What are we building today?','Choose the kind of solution that best matches your client’s goal. You can change your selection before submission.',`<div class="wizard-options">${Object.entries(SERVICE).map(([key,s])=>`<button class="option-card ${wizard.service===key?'selected':''}" data-wizard-service="${key}"><span class="option-icon"><i data-lucide="${s.icon}"></i></span><span><strong>${s.title}</strong><small>${s.description}</small></span></button>`).join('')}</div>${wizardFooter({})}`);
  if(wizard.stage===2) return renderPlanStep();
  if(wizard.stage===3) return renderQuestionStep(pages);
  if(wizard.stage===4) return renderAdditionalStep();
  if(wizard.stage===5) return renderSummaryStep();
  if(wizard.stage===6) return renderPricingStep();
  return renderBrochureStep();
}
function renderClientStep() {
  const client=wizard.client||{};
  const body=`<form id="wizard-client-form" class="form-grid"><div class="field span-2"><label>Use an existing client (optional)</label><select name="existing_client_id" id="wizard-existing-client"><option value="">Create a new client</option>${wizard.clients.map(c=>`<option value="${c.id}" ${c.id===client.id?'selected':''}>${escapeHtml(c.client_name)} · ${escapeHtml(c.mobile_number)}</option>`).join('')}</select><small class="field-hint">Selecting an existing client fills in their saved contact information.</small></div><div class="field"><label>Client name *</label><input name="client_name" id="wizard-client-name" required maxlength="140" value="${escapeHtml(client.client_name||'')}" placeholder="e.g. Aanya Sharma"></div><div class="field"><label>Mobile number *</label><input name="mobile_number" id="wizard-mobile" required type="tel" minlength="7" maxlength="20" value="${escapeHtml(client.mobile_number||'')}" placeholder="Client contact number"></div><div class="field"><label>Email (optional)</label><input name="email" type="email" maxlength="160" value="${escapeHtml(client.email||'')}"></div><div class="field"><label>Company name (optional)</label><input name="company_name" maxlength="160" value="${escapeHtml(client.company_name||'')}"></div><div class="field"><label>Business / industry</label><input name="industry" maxlength="100" value="${escapeHtml(client.industry||'')}"></div><div class="field"><label>Location</label><input name="location" maxlength="160" value="${escapeHtml(client.location||'')}"></div><div class="field span-2"><label>Additional notes</label><textarea name="notes" maxlength="1500" placeholder="Anything useful to know about this client…">${escapeHtml(client.notes||'')}</textarea></div><div class="span-2">${wizardFooter({back:false,next:'Continue to services',nextAction:'client-submit'})}</div></form>`;
  return shellStep('STEP 01 · CLIENT DETAILS',"First, let's meet your client.",'Just a few details to get started. Only the client name and mobile number are required.',body,false);
}
function renderPlanStep() {
  if(wizard.service==='WEBSITE') return shellStep('STEP 03 · WEBSITE PLAN','Choose a starting point','Each plan is an initial catalogue starting value. The final scope and price depend on your client’s answers.',`<div class="plan-grid">${WEBSITE_PLANS.map(p=>`<article class="plan-card ${wizard.plan===p.code?'selected':''}" data-wizard-plan="${p.code}"><h3>${p.name}</h3><div class="plan-price">${p.price}</div><p class="muted" style="font-size:10px;line-height:1.5">${p.desc}</p><ul>${p.features.map(f=>`<li>${f}</li>`).join('')}</ul><p class="field-hint">${p.excludes}</p></article>`).join('')}</div>${wizardFooter({next:'Continue to questions'})}`);
  const types=wizard.service==='APPLICATION'?APP_TYPES:AI_TYPES;
  const typeName=wizard.service==='APPLICATION'?'application type':'AI agent type';
  return shellStep('STEP 03 · SOLUTION TYPE',wizard.service==='APPLICATION'?'What kind of application do they need?':'What kind of AI agent are they interested in?',`Choose the closest ${typeName}. “I don't know” is a perfectly good answer.`, `<div class="wizard-options">${types.map((t,i)=>`<button class="option-card ${wizard.plan===t?'selected':''}" data-wizard-plan="${escapeHtml(t)}"><span class="option-icon"><i data-lucide="${i===types.length-1?'help-circle':wizard.service==='APPLICATION'?'app-window':'bot'}"></i></span><span><strong>${escapeHtml(t)}</strong><small>We’ll refine the details in the next few questions.</small></span></button>`).join('')}</div>${wizardFooter({next:'Continue to questions'})}`);
}
function renderQuestionStep(pages) {
  const page=pages[wizard.qPage]||[];
  const cards=page.map(question=>{
    const selected=wizard.answers[question.id]?.answer_ids||[];
    return `<div class="field" style="margin:17px 0 21px"><label style="font-size:13px;color:var(--text)">${escapeHtml(question.text)}</label><div class="wizard-options" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:10px 0 0">${question.options.map(option=>`<button type="button" class="option-card ${selected.includes(option.id)?'selected':''}" data-wizard-answer="${question.id}" data-answer-id="${escapeHtml(option.id)}" data-answer-label="${escapeHtml(option.label)}" data-answer-type="${question.type||'single'}"><span class="option-icon"><i data-lucide="${selected.includes(option.id)?'check-circle-2':'circle'}"></i></span><span><strong>${escapeHtml(option.label)}</strong></span></button>`).join('')}</div></div>`;
  }).join('');
  return shellStep(`STEP 04 · DISCOVERY · ${wizard.qPage+1} OF ${pages.length}`,`Let's understand the details.`,`Choose the answers that best fit your client. You can always revisit earlier questions.`,`${cards}${wizardFooter({next:wizard.qPage===pages.length-1?'Continue':'Next questions'})}`);
}
function renderAdditionalStep() {
  const body=`<form id="wizard-extra-form" class="form-grid"><div class="field span-2"><label>Project title *</label><input name="project_title" required maxlength="160" value="${escapeHtml(wizard.projectTitle)}" placeholder="e.g. Aanya Boutique Website"></div><div class="field span-2"><label>Anything else we should know?</label><textarea name="notes" maxlength="4000" placeholder="Special requirements, references, constraints or expectations…">${escapeHtml(wizard.notes)}</textarea></div><div class="field span-2"><label>Preferred delivery timeline</label><input name="timeline" maxlength="100" value="${escapeHtml(wizard.timeline)}" placeholder="e.g. 2–4 weeks or flexible"></div><div class="span-2">${wizardFooter({next:'Review project summary',nextAction:'extra-submit'})}</div></form>`;
  return shellStep('STEP 05 · ADDITIONAL REQUIREMENTS','Anything else to add?','Add context that helps the team understand the project. Technical decisions can be refined during discovery.',body,false);
}
function renderSummaryStep() {
  const answers=Object.values(wizard.answers);
  const grouped={}; for(const a of answers){(grouped[a.service_category] ||= []).push(a);}
  const rows=Object.entries(grouped).map(([service,items])=>`<div class="summary-row"><span>${escapeHtml(service)}</span><strong>${items.length} responses</strong></div>`).join('');
  return shellStep('STEP 06 · PROJECT SUMMARY','Here’s what we understand so far.','Review the client, solution and discovery answers before we build the investment estimate.',`<div class="card card-pad" style="background:rgba(255,255,255,.025);box-shadow:none"><div class="summary-row"><span>Client</span><strong>${escapeHtml(wizard.client?.client_name||'—')}</strong></div><div class="summary-row"><span>Project</span><strong>${escapeHtml(wizard.projectTitle||'—')}</strong></div><div class="summary-row"><span>Service</span><strong>${escapeHtml(SERVICE[wizard.service]?.title||'—')}</strong></div><div class="summary-row"><span>Plan / type</span><strong>${escapeHtml(planLabel())}</strong></div><div class="summary-row"><span>Timeline</span><strong>${escapeHtml(wizard.timeline||'Not specified')}</strong></div>${rows}</div><div style="margin-top:15px;color:var(--muted);font-size:11px">${answers.length} question responses captured. “I don't know” answers will be marked as discovery topics in the project brief.</div>${wizardFooter({next:'Continue to investment'})}`);
}
function renderPricingStep() {
  const allowedCategories=wizard.service==='WEBSITE'?['Website Development','Additional Features','Hosting','Domain','Third-Party Services','Maintenance']:wizard.service==='APPLICATION'?['Web Application Development','Additional Features','Hosting','Third-Party Services','Maintenance']:['AI Agent Development','Additional Features','Hosting','Third-Party Services','Maintenance'];
  const relevantItems=wizard.catalogue.filter(item=>allowedCategories.includes(item.category?.name));
  const grouped=relevantItems.reduce((acc,item)=>{const name=item.category?.name||'Additional';(acc[name] ||= []).push(item);return acc;},{});
  const itemRows=Object.entries(grouped).map(([cat,items])=>`<div style="margin-top:17px"><div class="eyebrow">${escapeHtml(cat)}</div>${items.map(item=>`<label class="option-card" style="margin-top:8px;align-items:center"><input type="checkbox" data-wizard-price-item="${item.id}" ${wizard.selectedItemIds.includes(item.id)?'checked':''} style="accent-color:#9a7cff;width:17px;height:17px"><span style="flex:1"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description||item.unit)} · ${item.is_commissionable?'Development / eligible':'Separate / non-commissionable'}</small></span><strong style="font-size:12px">${money(item.price_paise)}</strong></label>`).join('')}</div>`).join('');
  const price=wizard.pricing;
  const noPrices=relevantItems.length===0;
  const pricingBlock=price?`<div class="pricing-total"><small>Estimated client investment · GST included where configured</small><strong>${money(price.total_paise)}</strong><div class="summary-list"><div class="summary-row"><span>Subtotal</span><strong>${money(price.subtotal_paise)}</strong></div><div class="summary-row"><span>Approved discount</span><strong>− ${money(price.discount_paise)}</strong></div><div class="summary-row"><span>GST / applicable tax</span><strong>${money(price.tax_paise)}</strong></div><div class="summary-row"><span>Commission-eligible amount (internal)</span><strong>Hidden from client brochure</strong></div></div></div>`:'';
  return shellStep('STEP 07 · PROJECT INVESTMENT','Your Project Investment','Choose catalogue items for the scope. Prices and tax are calculated by the Supabase database, not by this browser.',`${noPrices?'<div class="card card-pad"><strong>No active catalogue items are available.</strong><p class="muted" style="font-size:11px;line-height:1.6">Ask an Admin to configure a current pricing catalogue for this service. You can still submit the discovery brief for an internal estimate; the client brochure will state that investment is pending.</p></div>':itemRows}<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:18px"><button class="btn btn-secondary" data-wizard-action="calculate-pricing" ${noPrices?'disabled':''}><i data-lucide="calculator"></i> Calculate estimate</button>${price?'<span class="pill success">Calculated from catalogue</span>':''}</div>${pricingBlock}${wizardFooter({next:'Submit project & create brochure',nextAction:'submit-project'})}`);
}
function renderBrochureStep() {
  return shellStep('STEP 08 · CLIENT BROCHURE','Your project brief is ready.','Preview the client-facing proposal and generate a polished PDF. Internal commission and profit information is never included.',`<div class="card card-pad" style="background:#f7f6fb;color:#212039;box-shadow:none"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><strong style="font:800 13px Manrope">WEBNEST STUDIO</strong><span style="font-size:9px;color:#696780">PROJECT PROPOSAL</span></div><div style="height:1px;background:#ddd9ee;margin:14px 0"></div><div style="font:800 25px Manrope;line-height:1.2">${escapeHtml(wizard.projectTitle||'Project Proposal')}</div><p style="font-size:11px;color:#6d6a83">Prepared for ${escapeHtml(wizard.client?.client_name||'Client')} · ${new Date().toLocaleDateString('en-IN')}</p><h3 style="font:700 13px Manrope;margin:18px 0 6px">Project understanding</h3><p style="font-size:11px;line-height:1.6;color:#55536c">${escapeHtml(wizard.notes||`A ${SERVICE[wizard.service]?.title.toLowerCase()} solution tailored to the client's requirements.`)}</p><h3 style="font:700 13px Manrope;margin:18px 0 6px">Discovery requirements</h3><p style="font-size:11px;color:#55536c">${Object.keys(wizard.answers).length} responses included in the full proposal.</p><h3 style="font:700 13px Manrope;margin:18px 0 6px">Project investment</h3><p style="font-size:13px;font-weight:700;color:#6451c8">${wizard.pricing?money(wizard.pricing.total_paise):'Investment to be confirmed after catalogue review'}</p><p style="font-size:9px;color:#77748c">This proposal is subject to final scope confirmation and approval.</p></div><div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:18px"><button class="btn btn-primary" data-wizard-action="generate-brochure"><i data-lucide="file-down"></i> Generate & download PDF</button><button class="btn btn-secondary" data-wizard-action="back">Back to pricing</button><a class="btn btn-ghost" href="${profileHome()}" data-nav="${profileHome()}">Return to workspace</a></div><p class="field-hint" style="margin-top:13px">The PDF includes scope and pricing details only. Commission rates, commission values and internal margins are excluded.</p>` ,false);
}
function profileHome(){return wizard.profile.role==='ADMIN'?'/admin/projects':wizard.profile.role==='TECHNICAL'?'/technical/my-projects':'/bd/projects';}
function planLabel(){if(wizard.service==='WEBSITE')return WEBSITE_PLANS.find(p=>p.code===wizard.plan)?.name||'Not selected';return wizard.plan||'Not selected';}

export async function handleWizardAction(action, target) {
  if(!wizard) return false;
  if(action==='next') {
    if(wizard.stage===1&&!wizard.service){toast('Choose a service to continue.','error');return true;}
    if(wizard.stage===2&&!wizard.plan){toast('Choose a plan or solution type.','error');return true;}
    if(wizard.stage===3){const pages=activeQuestionPages(wizard.service,wizard.answers); if(wizard.qPage<pages.length-1) wizard.qPage++; else wizard.stage=4;}
    else wizard.stage++;
    await persistDraft(false); await repaint(); return true;
  }
  if(action==='back') {
    if(wizard.stage===3&&wizard.qPage>0) wizard.qPage--;
    else if(wizard.stage===3&&wizard.qPage===0) wizard.stage=2;
    else wizard.stage=Math.max(0,wizard.stage-1);
    await repaint(); return true;
  }
  if(action==='save-draft') { await persistDraft(true); toast('Project draft saved.'); return true; }
  if(action==='calculate-pricing') {
    await persistDraft(false);
    wizard.selectedItemIds=[...document.querySelectorAll('[data-wizard-price-item]:checked')].map(x=>x.dataset.wizardPriceItem);
    if(!wizard.selectedItemIds.length){toast('Select at least one pricing item.','error');return true;}
    const items=wizard.selectedItemIds.map(item_id=>({item_id,quantity:1}));
    const {data,error}=await supabase.rpc('save_project_pricing',{p_project_id:wizard.projectId,p_items:items});
    if(error) throw error; wizard.pricing=data; wizard.pricingSaved=true; await repaint(); toast('Your estimate has been calculated using the active catalogue.'); return true;
  }
  if(action==='submit-project') {
    await persistDraft(false);
    if(wizard.selectedItemIds.length&&!wizard.pricingSaved) {
      const items=wizard.selectedItemIds.map(item_id=>({item_id,quantity:1}));
      const {data,error}=await supabase.rpc('save_project_pricing',{p_project_id:wizard.projectId,p_items:items}); if(error) throw error;
      wizard.pricing=data; wizard.pricingSaved=true;
    }
    const {error}=await supabase.rpc('submit_project_for_review',{p_project_id:wizard.projectId}); if(error) throw error;
    wizard.stage=7; await repaint(); toast('Project submitted for Admin review.'); return true;
  }
  if(action==='generate-brochure') { await generateBrochure(); return true; }
  return false;
}

export async function handleWizardClick(event) {
  const service=event.target.closest('[data-wizard-service]');
  if(service){wizard.service=service.dataset.wizardService;wizard.plan=null;wizard.answers={};wizard.qPage=0;wizard.stage=2;await persistDraft(false);await repaint();return true;}
  const plan=event.target.closest('[data-wizard-plan]');
  if(plan){wizard.plan=plan.dataset.wizardPlan;await persistDraft(false);await repaint();return true;}
  const answer=event.target.closest('[data-wizard-answer]');
  if(answer){const id=answer.dataset.wizardAnswer, value=answer.dataset.answerId, label=answer.dataset.answerLabel;const question=activeQuestionPages(wizard.service,wizard.answers).flat().find(q=>q.id===id);let selected=wizard.answers[id]?.answer_ids||[];
    if(answer.dataset.answerType==='multi') selected=selected.includes(value)?selected.filter(x=>x!==value):[...selected,value]; else selected=[value];
    if(selected.length) wizard.answers[id]=questionAnswerRecord(question,selected,wizard.service); else delete wizard.answers[id];
    const visibleIds=new Set(activeQuestionPages(wizard.service,wizard.answers).flat().map(q=>q.id));
    for(const answeredId of Object.keys(wizard.answers)) if(!visibleIds.has(answeredId)) delete wizard.answers[answeredId];
    await persistDraft(false); await repaint(); return true;
  }
  return false;
}

export async function handleWizardForm(form,event) {
  if(form.id==='wizard-client-form') {
    event.preventDefault(); const values=Object.fromEntries(new FormData(form).entries());
    const existingId=values.existing_client_id;
    if(existingId) wizard.client=wizard.clients.find(c=>c.id===existingId);
    else {
      const phone=values.mobile_number.trim();
      const {data:match,error}=await supabase.from('clients').select('id,client_name,mobile_number,company_name,industry,email,location,notes').eq('mobile_number',phone).limit(1).maybeSingle();
      if(error) throw error;
      if(match){wizard.client=match;toast('An existing client with this mobile number was matched.');}
      else wizard.client=await Data.saveClient({client_name:values.client_name.trim(),mobile_number:phone,email:values.email||null,company_name:values.company_name||null,industry:values.industry||null,location:values.location||null,notes:values.notes||null,created_by:wizard.profile.id});
    }
    if(!wizard.client?.id) throw new Error('Could not save or identify this client.');
    wizard.stage=1; await persistDraft(false); await repaint(); return true;
  }
  if(form.id==='wizard-extra-form') {
    event.preventDefault(); const values=Object.fromEntries(new FormData(form).entries());
    wizard.projectTitle=values.project_title.trim(); wizard.notes=values.notes||''; wizard.timeline=values.timeline||'';
    wizard.stage=5; await persistDraft(false); await repaint(); return true;
  }
  return false;
}

export async function resumeProjectWizard(profile,project) { return renderProjectWizard(profile,{project,reset:true}); }

async function persistDraft(announce=true) {
  if(!wizard.client?.id) return;
  const payload={client_id:wizard.client.id,title:wizard.projectTitle||`${wizard.client.client_name} — ${wizard.service?SERVICE[wizard.service].title:'New project'}`,
    service_type:SERVICE[wizard.service]?.type||'OTHER',service_plan:wizard.plan,description:wizard.notes||null,
    requirements:{service:wizard.service,plan:wizard.plan,answers:Object.values(wizard.answers)},questionnaire_answers:Object.values(wizard.answers),
    questionnaire_version:'2026-11-01',wizard_data:{stage:wizard.stage,qPage:wizard.qPage,service:wizard.service,plan:wizard.plan,notes:wizard.notes,timeline:wizard.timeline,projectTitle:wizard.projectTitle},expected_timeline:wizard.timeline||null};
  if(wizard.projectId) {
    const {error}=await supabase.from('projects').update(payload).eq('id',wizard.projectId); if(error) throw error;
  } else {
    const {data,error}=await supabase.from('projects').insert({...payload,created_by:wizard.profile.id,status:'DRAFT'}).select('id').single();
    if(error) throw error; wizard.projectId=data.id;
  }
  if(announce) toast('Draft saved to Supabase.');
}
async function repaint() {
  const root=$('#page-content'); if(!root) return;
  const nexus=root.querySelector('#nexus-assistant'); unmountNexus(nexus);
  root.innerHTML=await renderWizardContent(); await mountNexus($('#nexus-assistant')); renderIcons();
}
async function generateBrochure() {
  const JsPDF=window.jspdf?.jsPDF; if(!JsPDF) throw new Error('The PDF library did not load. Check your network connection and refresh.');
  const doc=new JsPDF({unit:'mm',format:'a4'}); const pageW=210, margin=18; let y=24;
  const purple=[111,88,206], navy=[21,22,43], muted=[102,101,126];
  const addHeader=(title,sub)=>{doc.setFillColor(...navy);doc.rect(0,0,pageW,43,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('WEBNEST STUDIO',margin,17);doc.setFontSize(19);doc.text(title,margin,29);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(211,207,236);doc.text(sub,margin,36);doc.setTextColor(30,30,50);y=55;};
  const section=(title,body)=>{doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...purple);doc.text(title,margin,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55,54,75);const lines=doc.splitTextToSize(body||'Not specified',pageW-margin*2);for(const line of lines){if(y>276){doc.addPage();y=20;}doc.text(line,margin,y);y+=5;}y+=5;};
  const footer=()=>{const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);doc.setDrawColor(220,218,233);doc.line(margin,285,pageW-margin,285);doc.setFontSize(8);doc.setTextColor(...muted);doc.text('Webnest Studio · Project proposal',margin,291);doc.text(`${i} / ${total}`,pageW-margin,291,{align:'right'});}};
  addHeader('Project proposal',`Prepared for ${wizard.client.client_name} · ${new Date().toLocaleDateString('en-IN')}`);
  doc.setFont('helvetica','bold');doc.setFontSize(24);doc.setTextColor(...navy);doc.text(doc.splitTextToSize(wizard.projectTitle||'Project proposal',170),margin,y);y+=20;
  section('CLIENT OVERVIEW',`${wizard.client.client_name}${wizard.client.company_name?' · '+wizard.client.company_name:''}${wizard.client.industry?' · '+wizard.client.industry:''}\nContact: ${wizard.client.mobile_number}${wizard.client.email?' · '+wizard.client.email:''}`);
  section('PROJECT UNDERSTANDING',`${SERVICE[wizard.service]?.title||'Project'} · ${planLabel()}\n${wizard.notes||'A tailored solution based on the discovery requirements below.'}`);
  section('DISCOVERY REQUIREMENTS','The following responses capture the requirements discussed during the guided discovery session.');
  const answers=Object.values(wizard.answers);
  for(const a of answers){if(y>268){doc.addPage();y=20;}section(a.question_text,a.answer_ids.includes('unknown')?'To be discussed during discovery':a.answer_label||'Not specified');}
  if(y>245){doc.addPage();y=20;}
  section('SCOPE & DELIVERY',`Service: ${SERVICE[wizard.service]?.title||'Project'}\nSelected plan or type: ${planLabel()}\nPreferred timeline: ${wizard.timeline||'To be confirmed'}\nAdditional notes: ${wizard.notes||'Not specified'}`);
  if(wizard.pricing){
    const lineSummary=(wizard.pricing.items||[]).map(item=>`${item.name} · ${item.quantity} ${item.unit||'unit(s)'} · ${money(item.line_total_paise)}`).join('\n');
    if(lineSummary) section('ITEMIZED SCOPE & PRICING',lineSummary);
    section('PROJECT INVESTMENT',`Subtotal: ${money(wizard.pricing.subtotal_paise)}\nApproved discount: ${money(wizard.pricing.discount_paise)}\nApplicable tax: ${money(wizard.pricing.tax_paise)}\nEstimated total: ${money(wizard.pricing.total_paise)}\nFinal scope and pricing are subject to confirmation and quotation approval.`);
  } else section('PROJECT INVESTMENT','Investment to be confirmed after Webnest Studio reviews the final scope and configures the applicable catalogue items.');
  section('NEXT STEPS','Webnest Studio will review the submitted scope, confirm feasibility, timelines and final commercial terms, and share an approved quotation for acceptance.');
  section('ASSUMPTIONS','Third-party subscriptions, hosting, domain registration and external platform fees may be separate unless included in the approved quotation. Integrations are subject to API availability and account requirements.');
  footer();
  const blob=doc.output('blob'); const filename=`Webnest-Proposal-${safeFilename(wizard.projectTitle||wizard.client.client_name)}.pdf`; doc.save(filename);
  try {
    const {data:latest,error:readError}=await supabase.from('project_brochures').select('version').eq('project_id',wizard.projectId).order('version',{ascending:false}).limit(1);
    if(readError) throw readError;
    const version=(latest?.[0]?.version||0)+1; const path=`${wizard.projectId}/proposal-v${version}.pdf`;
    const {error:uploadError}=await supabase.storage.from('project-brochures').upload(path,blob,{contentType:'application/pdf',upsert:false}); if(uploadError) throw uploadError;
    const {error:recordError}=await supabase.rpc('record_brochure_version',{p_project_id:wizard.projectId,p_storage_path:path,p_file_name:filename}); if(recordError) throw recordError;
    toast(`Brochure v${version} downloaded and saved to the project record.`);
  } catch(error) {
    toast(`PDF downloaded, but cloud archive could not be saved: ${error.message}`,'error');
  }
}
function safeFilename(value){return String(value||'proposal').replace(/[^a-z0-9-_]+/gi,'-').replace(/-+/g,'-').slice(0,60);}
