import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, getBearer, validPassword } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token=getBearer(req); if(!token) return json({error:'Authentication required'},401);
    const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await caller.auth.getUser(); if(userError||!user) return json({error:'Authentication required'},401);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:actor}=await admin.from('profiles').select('id,role,status').eq('id',user.id).single();
    if(actor?.role!=='ADMIN'||actor.status!=='ACTIVE') return json({error:'Administrator access required'},403);
    const {user_id,action,status,password,role,reason}=await req.json();
    if(!user_id||user_id===actor.id) return json({error:'This action cannot be performed on the current administrator.'},400);
    const {data:before,error:readError}=await admin.from('profiles').select('id,full_name,username,role,status').eq('id',user_id).single();
    if(readError||!before) return json({error:'Employee not found.'},404);
    let after={...before};
    if(action==='set-status') {
      if(!['ACTIVE','DISABLED'].includes(status)) return json({error:'Invalid account status.'},400);
      const {error}=await admin.from('profiles').update({status}).eq('id',user_id); if(error) throw error;
      await admin.auth.admin.updateUserById(user_id,{ban_duration:status==='DISABLED'?'876000h':'none'});
      after.status=status;
    } else if(action==='reset-password') {
      if(!validPassword(String(password||''))) return json({error:'Temporary password must be at least 12 characters and include upper/lowercase letters, a number and a symbol.'},400);
      const {error}=await admin.auth.admin.updateUserById(user_id,{password}); if(error) throw error;
      const {error:profileError}=await admin.from('profiles').update({must_change_password:true}).eq('id',user_id); if(profileError) throw profileError;
    } else if(action==='change-role') {
      if(!['ADMIN','BUSINESS_DEVELOPMENT','TECHNICAL'].includes(role)) return json({error:'Invalid role.'},400);
      const {error}=await admin.from('profiles').update({role}).eq('id',user_id); if(error) throw error;
      await admin.from('employee_roles').update({revoked_at:new Date().toISOString()}).eq('profile_id',user_id).is('revoked_at',null);
      await admin.from('employee_roles').insert({profile_id:user_id,role,granted_by:actor.id,reason:String(reason||'Role changed by administrator')});
      after.role=role;
    } else return json({error:'Unsupported employee action.'},400);
    await admin.from('audit_logs').insert({actor_id:actor.id,action:`EMPLOYEE_${action.replaceAll('-','_').toUpperCase()}`,entity_type:'PROFILE',entity_id:user_id,before_data:before,after_data:after,reason:String(reason||'')||null});
    return json({success:true,employee:after});
  } catch(error) {
    console.error('admin-employee-action failure',error);
    return json({error:'The employee action could not be completed.'},500);
  }
});
