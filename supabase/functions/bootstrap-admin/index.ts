import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, sha256, validPassword } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const configuredSecret=Deno.env.get('BOOTSTRAP_SECRET')||'';
    const suppliedSecret=req.headers.get('x-bootstrap-secret')||'';
    if(!configuredSecret||suppliedSecret.length<32||suppliedSecret!==configuredSecret) return json({error:'Unauthorized bootstrap request'},401);
    const url=Deno.env.get('SUPABASE_URL')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:setting,error:settingError}=await admin.from('app_settings').select('value').eq('key','admin_bootstrap_completed').single();
    if(settingError) return json({error:'Bootstrap state unavailable. Apply database migrations first.'},503);
    if(setting?.value===true) return json({error:'Initial administrator bootstrap has already been completed.'},409);
    const {count}=await admin.from('profiles').select('id',{count:'exact',head:true}).eq('role','ADMIN');
    if((count||0)>0) return json({error:'An administrator already exists. Bootstrap is disabled.'},409);
    const body=await req.json();
    const full_name=String(body.full_name||'').trim();
    const password=String(body.password||'');
    if(full_name.length<2||full_name.length>120||!validPassword(password)) return json({error:'Provide a valid full name and a strong password (12+ characters with upper/lowercase, number and symbol).'},400);
    const username='admin_2026_2108';
    const auth_email=`u-${(await sha256(username)).slice(0,28)}@auth.webnest.invalid`;
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:auth_email,password,email_confirm:true,user_metadata:{full_name}});
    if(createError||!created.user) return json({error:createError?.message||'Could not create the initial administrator'},400);
    try {
      const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,full_name,username,auth_email,role:'ADMIN',status:'ACTIVE',must_change_password:false});
      if(profileError) throw profileError;
      const {error:roleError}=await admin.from('employee_roles').insert({profile_id:created.user.id,role:'ADMIN',reason:'One-time owner bootstrap'});
      if(roleError) throw roleError;
      await admin.from('audit_logs').insert({actor_id:created.user.id,action:'INITIAL_ADMIN_BOOTSTRAPPED',entity_type:'PROFILE',entity_id:created.user.id,after_data:{username,role:'ADMIN'}});
      await admin.from('app_settings').update({value:true,updated_at:new Date().toISOString()}).eq('key','admin_bootstrap_completed');
      return json({success:true,username,message:'Initial administrator created. Remove BOOTSTRAP_SECRET from the project secrets now.'});
    } catch(error) {
      await admin.from('profiles').delete().eq('id',created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      throw error;
    }
  } catch(error) {
    console.error('bootstrap-admin failure',error);
    return json({error:'Initial administrator bootstrap failed.'},500);
  }
});
