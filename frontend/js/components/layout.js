import { escapeHtml, initials, renderIcons } from '../utils/dom.js';
import { navigate, routeName } from '../auth/router.js';

const NAV = {
  ADMIN: [
    ['OVERVIEW',[['dashboard','layout-dashboard','Dashboard']]],
    ['WORKSPACE',[['employees','users','Employees'],['clients','contact-round','Clients'],['projects','workflow','Projects'],['pricing','tags','Pricing catalogue'],['quotations','file-text','Quotations']]],
    ['FINANCE & CONTROL',[['commissions','badge-indian-rupee','Commissions'],['discounts','percent','Discount approvals'],['payments','wallet','Payments'],['reports','chart-no-axes-combined','Reports'],['audit-logs','shield-check','Audit logs']]]
  ],
  BUSINESS_DEVELOPMENT: [
    ['MY WORKSPACE',[['dashboard','layout-dashboard','Dashboard'],['clients','contact-round','Client directory'],['leads','target','My leads'],['projects','workflow','Projects'],['commissions','badge-indian-rupee','My commissions']]]
  ],
  TECHNICAL: [
    ['DELIVERY WORKSPACE',[['dashboard','layout-dashboard','Dashboard'],['available-projects','inbox','Available projects'],['my-projects','code-2','My projects'],['self-sourced-projects','plus-circle','Self-sourced work'],['commissions','badge-indian-rupee','My commissions']]]
  ]
};
const ROLE_LABEL = { ADMIN:'Administrator', BUSINESS_DEVELOPMENT:'Business Development', TECHNICAL:'Technical' };
const TITLES = { dashboard:'Dashboard', employees:'Employees', clients:'Clients', leads:'My leads', projects:'Projects', pricing:'Pricing catalogue', quotations:'Quotations', commissions:'Commissions', discounts:'Discount approvals', payments:'Payments', reports:'Reports', 'audit-logs':'Audit logs', 'available-projects':'Available projects', 'my-projects':'My projects', 'self-sourced-projects':'Self-sourced projects', 'new-project':'Create new project' };

export function renderLayout(profile,path,content) {
  const route = routeName(path), groups = NAV[profile.role] || [];
  const nav = groups.map(([title,items]) => `<div class="nav-section">${title}</div><nav class="side-nav">${items.map(([slug,icon,label]) => {
    const href = profile.role==='ADMIN' ? `/admin/${slug}` : profile.role==='BUSINESS_DEVELOPMENT' ? `/bd/${slug}` : `/technical/${slug}`;
    const active = route===slug || (slug==='projects' && route==='new-project') || (slug==='my-projects' && route==='project');
    return `<a class="nav-link ${active?'active':''}" href="${href}" data-nav="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`;
  }).join('')}</nav>`).join('');
  const title = TITLES[route] || 'Workspace';
  return `<div class="workspace">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand"><span class="brand-mark">W</span><div><strong>WEBNEST NEXUS</strong><small>WEBNEST STUDIO · ${escapeHtml(ROLE_LABEL[profile.role] || '')}</small></div></div>
      ${nav}
      <div class="sidebar-spacer"></div>
      <div class="sidebar-profile"><span class="avatar">${escapeHtml(initials(profile.full_name))}</span><div class="profile-meta"><strong>${escapeHtml(profile.full_name)}</strong><small>${escapeHtml(profile.username)} · ${escapeHtml(ROLE_LABEL[profile.role] || '')}</small></div><button class="icon-btn" data-action="logout" title="Sign out"><i data-lucide="log-out"></i></button></div>
    </aside>
    <section class="workspace-main">
      <header class="topbar">
        <div class="topbar-left"><button class="icon-btn" data-action="sidebar-toggle" aria-label="Open navigation"><i data-lucide="menu"></i></button><div class="mobile-brand"><span class="brand-mark" style="width:28px;height:28px;font-size:14px;border-radius:9px">W</span> Nexus</div><span class="breadcrumb">${escapeHtml(ROLE_LABEL[profile.role])} <span class="subtle">/</span> ${escapeHtml(title)}</span></div>
        <div class="topbar-actions"><span class="pill accent">${escapeHtml(ROLE_LABEL[profile.role])}</span><button class="icon-btn" data-action="notifications" title="Notifications"><i data-lucide="bell"></i></button></div>
      </header>
      <main class="content" id="page-content">${content}</main>
    </section>
  </div>`;
}

export function wireLayout() {
  document.querySelectorAll('[data-nav]').forEach(anchor => anchor.addEventListener('click', event => {
    event.preventDefault(); navigate(anchor.dataset.nav);
  }));
  renderIcons();
}
