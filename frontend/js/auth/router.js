const HOME = { ADMIN:'/admin/dashboard', BUSINESS_DEVELOPMENT:'/bd/dashboard', TECHNICAL:'/technical/dashboard' };
const PREFIX = { ADMIN:'/admin/', BUSINESS_DEVELOPMENT:'/bd/', TECHNICAL:'/technical/' };
export function homeFor(role) { return HOME[role] || '/login'; }
export function isAllowed(path,role) { return path === PREFIX[role]?.slice(0,-1) || path.startsWith(PREFIX[role] || '___'); }
export function navigate(path) { history.pushState({},'',path); window.dispatchEvent(new PopStateEvent('popstate')); }
export function normalizePath(path=location.pathname) { return path === '/' ? '/login' : path.replace(/\/+$/,''); }
export function routeName(path) { return path.split('/').filter(Boolean).at(-1) || 'dashboard'; }
