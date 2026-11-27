const config = window.WEBNEST_CONFIG || {};
export const isConfigured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY
  && !config.SUPABASE_URL.includes('YOUR_PROJECT_REF')
  && !config.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE'));
export const supabase = isConfigured && window.supabase?.createClient
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'X-Client-Info': 'webnest-nexus-vanilla/1.0.0' } }
    }) : null;
export const appConfig = Object.freeze({
  APP_NAME: config.APP_NAME || 'Webnest Nexus',
  COMPANY_NAME: config.COMPANY_NAME || 'Webnest Studio',
  CURRENCY: config.CURRENCY || 'INR',
  LOCALE: config.LOCALE || 'en-IN'
});
