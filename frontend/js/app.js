import { supabase, isConfigured, appConfig } from './config/supabase.js';
import { AuthService } from './auth/auth-service.js';
import { navigate, normalizePath, homeFor, isAllowed } from './auth/router.js';
import { renderLayout, wireLayout } from './components/layout.js';
import { unmountNexus } from './components/nexus-assistant.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderEmployees, employeeCreateModal } from './modules/employees.js';
import { renderClients, clientCreateModal } from './modules/clients.js';
import { renderLeads, leadCreateModal } from './modules/leads.js';
import { renderProjects } from './modules/projects.js';
import { renderCommissions } from './modules/commissions.js';
import { renderOperationalPage, pricingItemModal, pricingVersionModal, paymentModal, exportReport } from './modules/operations.js';
import { renderProjectWizard, handleWizardAction, handleWizardClick, handleWizardForm, resumeProjectWizard } from './modules/project-wizard.js';
import { Data } from './services/data-service.js';
import { $, escapeHtml, toast, setBusy, renderIcons } from './utils/dom.js';

const app=$('#app');
let auth=null, profile=null, authSubscription=null;

async function boot() {
  if(!isConfigured) { renderConfigurationGate(); return; }
  auth=new AuthService(supabase);
  authSubscription=auth.onChange((event)=>{
    if(event==='SIGNED_OUT'){profile=null;renderLogin();}
  });
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session){renderLogin();return;}
  try { profile=await auth.getProfile(); await route(); }
  catch(error){await supabase.auth.signOut();renderLogin(error.message);}
}

function renderConfigurationGate() {
  app.innerHTML=`<div class="auth-layout"><section class="auth-brand-panel"><div class="brand-lockup"><span class="brand-mark">W</span><div><strong>WEBNEST NEXUS</strong><small>WEBNEST STUDIO OPERATIONS</small></div></div><div class="auth-copy"><div class="eyebrow">SETUP REQUIRED</div><h1>Your business,<br><span>in one workspace.</span></h1><p>Connect this frontend to your Supabase project to enable secure authentication, employee workspaces and persistent business records.</p></div><div class="auth-feature-row"><span class="auth-feature"><i data-lucide="shield-check"></i> Supabase Auth + RLS</span><span class="auth-feature"><i data-lucide="layers"></i> Three role-specific portals</span></div></section><section class="auth-form-panel"><div class="auth-form"><span class="pill warning">Configuration incomplete</span><h2>Connect Supabase</h2><p>Credentials are intentionally not included in this source package.</p><div class="card card-pad" style="font-size:12px;line-height:1.8"><strong>1.</strong> Copy <code>frontend/config.example.js</code> to <code>frontend/config.js</code>.<br><strong>2.</strong> Add your Supabase project URL and publishable (anon) key.<br><strong>3.</strong> Apply the SQL migrations and deploy Edge Functions.<br><strong>4.</strong> Reload this page.</div><div class="auth-note">Never place the Supabase service-role key in <code>frontend/config.js</code>. The browser may contain only the publishable/anon key.</div></div></section></div>`;
  renderIcons();
}

function renderLogin(message='') {
  profile=null;
  const error=message?`<div class="toast error" style="position:static;margin:0 0 14px">${escapeHtml(message)}</div>`:'';
  app.innerHTML=`<div class="auth-layout"><section class="auth-brand-panel"><div class="brand-lockup"><span class="brand-mark">W</span><div><strong>WEBNEST STUDIO</strong><small>INTERNAL OPERATIONS PLATFORM</small></div></div><div class="auth-copy"><div class="eyebrow">ONE STUDIO · THREE WORKSPACES</div><h1>Build better.<br><span>Work smarter.</span></h1><p>Welcome to Webnest Nexus, the secure workspace for managing people, clients, projects and delivery operations across Webnest Studio.</p></div><div class="auth-feature-row"><span class="auth-feature"><i data-lucide="shield-check"></i> Secure access</span><span class="auth-feature"><i data-lucide="workflow"></i> Connected workflows</span><span class="auth-feature"><i data-lucide="chart-no-axes-combined"></i> Live operations</span></div></section><section class="auth-form-panel"><form class="auth-form" id="login-form"><div class="eyebrow">WEBNEST NEXUS</div><h2>Welcome back</h2><p>Sign in with the username and password provided by your administrator.</p>${error}<div class="field"><label for="username">Username</label><input id="username" name="username" required maxlength="40" autocomplete="username" placeholder="Enter your username"></div><div class="field"><label for="password">Password</label><div class="password-wrap"><input id="password" name="password" type="password" required autocomplete="current-password" placeholder="Enter your password"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Show password"><i data-lucide="eye"></i></button></div></div><button class="btn btn-primary" type="submit" style="width:100%;margin-top:9px">Sign in <i data-lucide="arrow-right"></i></button><div class="auth-note">Your workspace is assigned automatically from your secure employee profile. There is no public registration or role selector.</div><p style="text-align:center;color:var(--subtle);font-size:10px;margin-top:22px">© ${new Date().getFullYear()} Webnest Studio. Internal use only.</p></form></section></div>`;
  renderIcons();
}

function renderPasswordChange() {
  app.innerHTML=`<div class="auth-layout" style="grid-template-columns:1fr"><section class="auth-form-panel"><form class="auth-form" id="password-change-form"><div class="brand-lockup" style="margin-bottom:35px"><span class="brand-mark">W</span><div><strong>WEBNEST NEXUS</strong><small>ACCOUNT SECURITY</small></div></div><span class="pill warning">Action required</span><h2>Set a new password</h2><p>Your administrator provided a temporary password. Choose a private password before continuing.</p><div class="field"><label>New password</label><input name="password" type="password" minlength="12" autocomplete="new-password" required></div><div class="field"><label>Confirm new password</label><input name="confirm" type="password" minlength="12" autocomplete="new-password" required></div><small class="field-hint">At least 12 characters with an uppercase letter, lowercase letter, number and symbol.</small><button class="btn btn-primary" type="submit" style="width:100%;margin-top:16px">Update password</button><button class="btn btn-ghost" type="button" data-action="logout" style="width:100%;margin-top:6px">Sign out</button></form></section></div>`;
}

async function route() {
  if(!auth) { renderLogin(); return; }
  try { if(!profile) profile=await auth.getProfile(); }
  catch(error){await supabase.auth.signOut();renderLogin(error.message);return;}
  if(profile.must_change_password){renderPasswordChange();return;}
  const path=normalizePath();
  if(path==='/login'||path==='/') { navigate(homeFor(profile.role)); return; }
  if(!isAllowed(path,profile.role)){navigate(homeFor(profile.role));return;}
  const content=await resolvePage(path);
  unmountNexus(document.querySelector('#nexus-assistant'));
  app.innerHTML=renderLayout(profile,path,content);
  wireLayout();
  if(path.endsWith('/new-project')) await renderProjectWizard(profile,{reset:!window.__resumeProject});
  if(window.__resumeProject){const p=window.__resumeProject;window.__resumeProject=null;await resumeProjectWizard(profile,p);}
  renderIcons();
}

async function resolvePage(path) {
  const route=path.split('/').at(-1);
  if(route==='dashboard') return renderDashboard(profile);
  if(route==='employees'&&profile.role==='ADMIN') return renderEmployees();
  if(route==='clients') return renderClients(profile);
  if(route==='leads'&&profile.role==='BUSINESS_DEVELOPMENT') return renderLeads(profile);
  if(['projects','available-projects','my-projects','self-sourced-projects'].includes(route)) return renderProjects(profile,path);
  if(route==='new-project') return '<div class="loading"><span class="spinner"></span>Preparing guided discovery…</div>';
  if(route==='commissions') return renderCommissions(profile);
  if(['pricing','quotations','discounts','payments','reports','audit-logs'].includes(route)&&profile.role==='ADMIN') return renderOperationalPage(path,profile);
  return `<div class="page-head"><div><div class="eyebrow">WORKSPACE</div><h1 class="page-title">Page not found</h1><p class="page-subtitle">This route is not available in your workspace.</p></div></div>`;
}

window.addEventListener('popstate',()=>route().catch(showError));
document.addEventListener('click',async event=>{
  try {
    if(await handleWizardClick(event)) return;
    const nav=event.target.closest('[data-nav]'); if(nav){event.preventDefault();navigate(nav.dataset.nav);return;}
    const button=event.target.closest('[data-action]'); if(!button)return;
    const action=button.dataset.action;
    if(action==='close-modal'){if(event.target===button||button.classList.contains('icon-btn'))$('#modal-root')?.replaceChildren();return;}
    if(action==='toggle-password'){const input=$('#password');if(input){input.type=input.type==='password'?'text':'password';button.innerHTML=`<i data-lucide="${input.type==='password'?'eye':'eye-off'}"></i>`;renderIcons();}return;}
    if(action==='logout'){await auth.logout();profile=null;renderLogin();return;}
    if(action==='sidebar-toggle'){$('#sidebar')?.classList.toggle('open');return;}
    if(action==='open-create-employee'){const root=$('#modal-root');root.innerHTML=employeeCreateModal();renderIcons();return;}
    if(action==='open-create-client'){const root=$('#modal-root');root.innerHTML=clientCreateModal();renderIcons();return;}
    if(action==='open-create-lead'){const root=$('#modal-root');const clients=await Data.listClients();root.innerHTML=leadCreateModal(clients);renderIcons();return;}
    if(action==='open-pricing-item'){const root=$('#modal-root');root.innerHTML=await pricingItemModal();renderIcons();return;}
    if(action==='open-pricing-version'){const root=$('#modal-root');root.innerHTML=pricingVersionModal();renderIcons();return;}
    if(action==='open-record-payment'){const root=$('#modal-root');root.innerHTML=await paymentModal();renderIcons();return;}
    if(action==='project-new'){navigate(profile.role==='TECHNICAL'?'/technical/new-project':'/bd/new-project');return;}
    if(action==='wizard-exit'){navigate(profile.role==='TECHNICAL'?'/technical/my-projects':'/bd/projects');return;}
    if(action==='save-draft'||action==='back'||action==='next'||action==='calculate-pricing'||action==='submit-project'||action==='generate-brochure'){
      event.preventDefault();const result=await handleWizardAction(action,button);if(result)return;
    }
    if(action==='employee-toggle'){
      const next=button.dataset.status==='ACTIVE'?'DISABLED':'ACTIVE';if(!confirm(`${next==='DISABLED'?'Deactivate':'Activate'} ${button.dataset.name}?`))return;
      const {error}=await supabase.functions.invoke('admin-employee-action',{body:{user_id:button.dataset.id,action:'set-status',status:next}});if(error)throw await functionError(error);toast(`Employee account ${next.toLowerCase()}.`);await route();return;
    }
    if(action==='employee-reset'){
      const password=prompt(`Enter a temporary password for ${button.dataset.name}. It will not be displayed again after this action.`);if(password===null)return;
      const {data,error}=await supabase.functions.invoke('admin-employee-action',{body:{user_id:button.dataset.id,action:'reset-password',password}});if(error)throw await functionError(error);if(data?.error)throw new Error(data.error);toast('Temporary password reset. Share it with the employee through a verified private channel.');return;
    }
    if(action==='employee-role'){
      const role=prompt(`Enter the new role for ${button.dataset.name}: ADMIN, BUSINESS_DEVELOPMENT or TECHNICAL. Current role: ${button.dataset.role}`);if(role===null)return;
      const normalized=role.trim().toUpperCase();if(!['ADMIN','BUSINESS_DEVELOPMENT','TECHNICAL'].includes(normalized))throw new Error('Enter ADMIN, BUSINESS_DEVELOPMENT or TECHNICAL.');
      if(!confirm(`Change ${button.dataset.name}'s role to ${normalized}? This change will be audited.`))return;
      const {data,error}=await supabase.functions.invoke('admin-employee-action',{body:{user_id:button.dataset.id,action:'change-role',role:normalized,reason:'Role changed from Employee Management'}});if(error)throw await functionError(error);if(data?.error)throw new Error(data.error);toast('Employee role updated.');await route();return;
    }
    if(action==='accept-project'){
      if(!confirm('Accept this project? The first eligible technical employee to confirm receives the assignment.'))return;
      const {error}=await supabase.rpc('accept_available_project',{p_project_id:button.dataset.id});if(error)throw error;toast('Project assigned to your workspace.');await route();return;
    }
    if(action==='approve-project'||action==='reject-project'){
      const decision=action==='approve-project'?'APPROVE':'REJECT';const reason=decision==='REJECT'?prompt('Reason for rejection (required):'):'';if(decision==='REJECT'&&!reason?.trim())return;
      await Data.reviewProject(button.dataset.id,decision,reason||'');toast(`Project ${decision.toLowerCase()}d.`);await route();return;
    }
    if(action==='create-quotation'){
      if(!confirm('Create a versioned quotation from this project’s saved catalogue and tax snapshots?'))return;
      const {data,error}=await supabase.rpc('create_quotation_from_project',{p_project_id:button.dataset.id,p_valid_until:new Date(Date.now()+14*86400000).toISOString().slice(0,10)});if(error)throw error;toast(`Quotation ${data.quotation_number} submitted for Admin approval.`);await route();return;
    }
    if(action==='request-discount'){
      const amount=prompt('Requested discount amount in ₹:');if(amount===null)return;const rupees=Number(amount);if(!Number.isFinite(rupees)||rupees<=0)throw new Error('Enter a positive discount amount.');
      const reason=prompt('Why is this discount required?');if(!reason?.trim())return;
      const {error}=await supabase.from('discount_requests').insert({project_id:button.dataset.id,requested_by:profile.id,requested_discount_paise:Math.round(rupees*100),reason:reason.trim()});if(error)throw error;toast('Discount request submitted for Admin approval.');await route();return;
    }
    if(action==='quotation-approve'||action==='quotation-reject'){
      const decision=action==='quotation-approve'?'APPROVED':'REJECTED';const comments=prompt(`${decision==='APPROVED'?'Approval':'Rejection'} comments (optional):`)||'';
      const {error}=await supabase.rpc('admin_review_quotation',{p_quotation_id:button.dataset.id,p_decision:decision,p_comments:comments});if(error)throw error;toast(`Quotation ${decision.toLowerCase()}.`);await route();return;
    }
    if(action==='approve-completion'){
      if(!confirm('Approve completion? This will mark the project complete and create commission earnings from the saved eligible amount and policy snapshots.'))return;
      await Data.approveCompletion(button.dataset.id);toast('Project completion approved. Commission records have been created where eligible.');await route();return;
    }
    if(action==='reject-completion'){
      const reason=prompt('Explain what needs to be changed before completion can be approved:');if(!reason?.trim()||reason.trim().length<5)return;
      const {error}=await supabase.rpc('admin_reject_project_completion',{p_project_id:button.dataset.id,p_reason:reason.trim()});if(error)throw error;toast('Completion returned for changes.');await route();return;
    }
    if(action==='reassign-project'){
      const select=document.querySelector(`[data-project-assignee=\"${button.dataset.id}\"]`);const employeeId=select?.value;if(!employeeId)throw new Error('Select an active Technical employee first.');
      const reason=prompt('Reason for assigning or overriding project ownership (required):');if(!reason?.trim()||reason.trim().length<5)return;
      const {error}=await supabase.rpc('admin_reassign_project',{p_project_id:button.dataset.id,p_employee_id:employeeId,p_reason:reason.trim()});if(error)throw error;toast('Project assignment updated and audited.');await route();return;
    }
    if(action==='submit-completion'){
      if(!confirm('Submit this project for Admin completion review?'))return;
      await Data.submitCompletion(button.dataset.id);toast('Project submitted for completion review.');await route();return;
    }
    if(action==='resume-project'){
      const {data,error}=await supabase.from('projects').select('*').eq('id',button.dataset.id).single();if(error)throw error;window.__resumeProject=data;navigate(profile.role==='TECHNICAL'?'/technical/new-project':'/bd/new-project');return;
    }
    if(action==='discount-approve'||action==='discount-reject'){
      const decision=action==='discount-approve'?'APPROVED':'REJECTED';const comments=prompt(`${decision==='APPROVED'?'Approval':'Rejection'} comment (optional):`)||'';
      const {error}=await supabase.rpc('admin_review_discount',{p_request_id:button.dataset.id,p_decision:decision,p_comments:comments});if(error)throw error;toast(`Discount request ${decision.toLowerCase()}.`);await route();return;
    }
    if(action==='commission-approve'){
      const reason=prompt('Optional approval note:')||'';const {error}=await supabase.rpc('admin_approve_commission',{p_commission_id:button.dataset.id,p_reason:reason});if(error)throw error;toast('Commission approved for payout.');await route();return;
    }
    if(action==='commission-adjust'){
      const amount=prompt('Adjustment amount in ₹ (use a minus sign for a deduction):');if(amount===null)return;const rupees=Number(amount);if(!Number.isFinite(rupees)||rupees===0)throw new Error('Enter a non-zero adjustment.');
      const reason=prompt('Reason for this commission adjustment (required):');if(!reason?.trim())return;
      const {error}=await supabase.rpc('admin_adjust_commission',{p_commission_id:button.dataset.id,p_adjustment_paise:Math.round(rupees*100),p_reason:reason.trim()});if(error)throw error;toast('Commission adjusted and audited.');await route();return;
    }
    if(action==='commission-pay'){
      const reference=prompt('Payout reference (UPI / bank transfer / transaction ID):');if(reference===null)return;
      const {error}=await supabase.rpc('admin_record_commission_payout',{p_employee_id:button.dataset.employee,p_commission_ids:[button.dataset.id],p_payment_reference:reference,p_notes:'Recorded from commission management'});if(error)throw error;toast('Commission payout recorded.');await route();return;
    }
    if(action==='deactivate-price-item'){
      if(!confirm('Disable this catalogue item for new quotations? Historical snapshots remain unchanged.'))return;
      const {error}=await supabase.from('pricing_items').update({is_active:false}).eq('id',button.dataset.id);if(error)throw error;toast('Pricing item disabled.');await route();return;
    }
    if(action==='export-report'){await exportReport(button.dataset.report);toast('CSV export prepared.');return;}
    if(action==='notifications'){const rows=await Data.notifications();alert(rows.length?rows.map(n=>`${n.title}\n${n.body}`).join('\n\n'):'You have no unread notifications.');return;}
  } catch(error){showError(error);}
});

document.addEventListener('submit',async event=>{
  const form=event.target;
  try {
    if(await handleWizardForm(form,event)) return;
    if(form.id==='login-form'){
      event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());const button=form.querySelector('button[type="submit"]');setBusy(button,true,'Signing in…');
      try{profile=await auth.login(values.username,values.password);toast('Signed in successfully.');await route();}
      catch(error){form.insertAdjacentHTML('afterbegin',`<div class="toast error" style="position:static;margin-bottom:12px">${escapeHtml(error.message)}</div>`);}
      finally{setBusy(button,false);}return;
    }
    if(form.id==='password-change-form'){
      event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());if(values.password!==values.confirm)throw new Error('The passwords do not match.');
      if(values.password.length<12||!/[a-z]/.test(values.password)||!/[A-Z]/.test(values.password)||!/[0-9]/.test(values.password)||!/[^A-Za-z0-9]/.test(values.password))throw new Error('Use at least 12 characters with uppercase, lowercase, a number and a symbol.');
      const {error}=await supabase.auth.updateUser({password:values.password});if(error)throw error;
      const {error:completeError}=await supabase.rpc('complete_my_password_change');if(completeError)throw completeError;
      profile=await auth.getProfile();toast('Password updated. Welcome to your workspace.');await route();return;
    }
    if(form.id==='create-employee-form'){
      event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());if(values.password!==values.confirm_password)throw new Error('The passwords do not match.');
      const button=form.querySelector('[type="submit"]');setBusy(button,true,'Creating account…');
      try{const {data,error}=await supabase.functions.invoke('create-employee',{body:values});if(error)throw await functionError(error);if(data?.error)throw new Error(data.error);toast(`Account created for ${data.employee.full_name}.`);$('#modal-root').replaceChildren();await route();}
      finally{setBusy(button,false);}return;
    }
    if(form.id==='create-client-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());await Data.saveClient({...v,created_by:profile.id,email:v.email||null,company_name:v.company_name||null,industry:v.industry||null,location:v.location||null,notes:v.notes||null});toast('Client saved.');$('#modal-root').replaceChildren();await route();return;
    }
    if(form.id==='create-lead-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());await Data.saveLead({client_id:v.client_id,owner_id:profile.id,title:v.title.trim(),source:v.source||null,requirements:v.requirements||null,next_follow_up_at:v.next_follow_up_at||null});toast('Lead saved.');$('#modal-root').replaceChildren();await route();return;
    }
    if(form.id==='pricing-item-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());const {error}=await supabase.from('pricing_items').insert({category_id:v.category_id,version_id:v.version_id,code:v.code.toUpperCase(),name:v.name,description:v.description||null,unit:v.unit,price_paise:Math.round(Number(v.price)*100),is_commissionable:form.elements.is_commissionable.checked,is_taxable:form.elements.is_taxable.checked,tax_rate:Number(v.tax_rate)});if(error)throw error;toast('Pricing item added.');$('#modal-root').replaceChildren();await route();return;
    }
    if(form.id==='pricing-version-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());const {error}=await supabase.rpc('create_pricing_version',{p_version_name:v.version_name,p_notes:v.notes||null});if(error)throw error;toast('New catalogue version created and made current.');$('#modal-root').replaceChildren();await route();return;
    }
    if(form.id==='payment-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());const {error}=await supabase.rpc('admin_record_payment',{p_project_id:v.project_id,p_amount_paise:Math.round(Number(v.amount)*100),p_method:v.method||null,p_reference:v.reference||null,p_notes:v.notes||null});if(error)throw error;toast('Client payment recorded.');$('#modal-root').replaceChildren();await route();return;
    }
    if(form.id==='commission-policy-form'){
      event.preventDefault();const v=Object.fromEntries(new FormData(form).entries());const {error}=await supabase.rpc('admin_set_commission_policy',{p_employee_role:v.employee_role,p_acquisition_source:v.employee_role==='TECHNICAL'?v.acquisition_source:null,p_rate:Number(v.rate)});if(error)throw error;toast('Future commission policy updated. Existing records are unchanged.');await route();return;
    }
  } catch(error){showError(error);}
});

document.addEventListener('input',async event=>{
  const target=event.target;
  if(target.id==='employee-search'){$$('#employee-rows tr').forEach(row=>row.style.display=row.dataset.search.includes(target.value.toLowerCase())?'':'none');}
  if(target.id==='project-search'){$$('#projects-table tbody tr').forEach(row=>row.style.display=(row.dataset.search||'').includes(target.value.toLowerCase())?'':'none');}
  if(target.id==='client-search'){
    try{const rows=await Data.listClients(target.value.trim());const {renderRows}=await import('./modules/clients.js');$('#client-table').innerHTML=renderRows(rows);renderIcons();}catch(error){showError(error);}
  }
});

document.addEventListener('change',event=>{
  if(event.target.id==='wizard-existing-client'){
    const client=wizardClientFromId(event.target.value);
    if(client){$('#wizard-client-name').value=client.client_name;$('#wizard-mobile').value=client.mobile_number;}
    else {$('#wizard-client-name').value='';$('#wizard-mobile').value='';}
  }
});

function wizardClientFromId(id){return window.__wizardClientCache?.find(c=>c.id===id)||null;}
function $$(selector){return [...document.querySelectorAll(selector)];}
async function functionError(error){try{if(error.context instanceof Response){const body=await error.context.clone().json();return new Error(body.error||body.message||'Request failed.');}}catch{}return new Error('Request failed. Check Edge Function deployment and permissions.');}
function showError(error){console.error(error);toast(error?.message||'Something went wrong. Please try again.','error');}

// Keep the existing client options available for the client-detail prefill interaction.
boot().catch(error=>{console.error(error);renderLogin('The application could not start. Check Supabase configuration and migrations.');});
