import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, getBearer, sha256, validPassword } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token=getBearer(req); if(!token) return json({error:'Authentication required'},401);
    const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await caller.auth.getUser();
    if(userError||!user) return json({error:'Authentication required'},401);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,status').eq('id',user.id).single();
    if(actorError||!actor||actor.role!=='ADMIN'||actor.status!=='ACTIVE') return json({error:'Administrator access required'},403);
    const input=await req.json();
    const full_name=String(input.full_name||'').trim();
    const username=String(input.username||'').trim().toLowerCase();
    const password=String(input.password||'');
    const role=String(input.role||'');
    if(full_name.length<2||full_name.length>120) return json({error:'Enter a valid full name.'},400);
    if(!/^[a-z0-9_]{3,40}$/.test(username)) return json({error:'Username must contain 3–40 letters, numbers or underscores.'},400);
    if(!['BUSINESS_DEVELOPMENT','TECHNICAL'].includes(role)) return json({error:'Select a valid employee category.'},400);
    if(!validPassword(password)) return json({error:'Password must be at least 12 characters and include upper/lowercase letters, a number and a symbol.'},400);
    const {data:existing}=await admin.from('profiles').select('id').eq('username',username).maybeSingle();
    if(existing) return json({error:'That username is already in use.'},409);
    const digest=await sha256(username);
    const auth_email=`u-${digest.slice(0,28)}@auth.webnest.invalid`;
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:auth_email,password,email_confirm:true,user_metadata:{full_name}});
    if(createError||!created.user) return json({error:createError?.message||'Could not create authentication account'},400);
    try {
      const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,full_name,username,auth_email,role,status:'ACTIVE',contact_number:String(input.contact_number||'').trim()||null,designation:String(input.designation||'').trim()||null,must_change_password:true});
      if(profileError) throw profileError;
      const {error:roleError}=await admin.from('employee_roles').insert({profile_id:created.user.id,role,granted_by:actor.id,reason:'Account created by administrator'});
      if(roleError) throw roleError;
      await admin.from('audit_logs').insert({actor_id:actor.id,action:'EMPLOYEE_CREATED',entity_type:'PROFILE',entity_id:created.user.id,after_data:{username,role,status:'ACTIVE'}});
      return json({success:true,employee:{id:created.user.id,full_name,username,role,status:'ACTIVE'}});
    } catch(error) {
      await admin.from('profiles').delete().eq('id',created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      throw error;
    }
  } catch(error) {
    console.error('create-employee failure',error);
    return json({error:'Could not create employee. Verify the supplied details and try again.'},500);
  }
});
