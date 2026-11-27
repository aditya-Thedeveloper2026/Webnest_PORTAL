export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const initials = name => String(name || 'WN').trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase() || '').join('') || 'WN';
export const money = paise => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((Number(paise)||0)/100);
export const compactMoney = paise => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',notation:'compact',maximumFractionDigits:1}).format((Number(paise)||0)/100);
export const date = value => value ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(value)) : '—';
export const dateTime = value => value ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
export const titleCase = value => String(value || '').toLowerCase().replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function toast(message, type='success') {
  const region = $('#toast-region'); if (!region) return;
  const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message;
  region.append(node); setTimeout(() => node.remove(), 3900);
}
export function statusPill(status) {
  const value = String(status || 'UNKNOWN');
  const kind = ['ACTIVE','APPROVED','COMPLETED','EARNED','PAID','AVAILABLE'].includes(value) ? 'success'
    : ['PENDING','PENDING_REVIEW','IN_DEVELOPMENT','COMPLETED_PENDING_REVIEW'].includes(value) ? 'warning'
    : ['REJECTED','DISABLED','REVERSED','LOST'].includes(value) ? 'danger' : 'accent';
  return `<span class="pill ${kind}">${escapeHtml(titleCase(value))}</span>`;
}
export function setBusy(button, busy, label='Please wait…') {
  if (!button) return;
  if (busy) { button.dataset.originalLabel = button.innerHTML; button.disabled = true; button.innerHTML = `<span class="spinner"></span>${escapeHtml(label)}`; }
  else { button.disabled = false; if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel; }
}
export function emptyState(icon, heading, body, action='') {
  return `<div class="empty-state"><div class="empty-icon"><i data-lucide="${escapeHtml(icon)}"></i></div><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(body)}</p>${action}</div>`;
}
export function renderIcons(root=document) { window.lucide?.createIcons?.({root}); }
export function csvDownload(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(','), ...rows.map(row => cols.map(key => `"${String(row[key] ?? '').replaceAll('"','""')}"`).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
