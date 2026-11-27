import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, sha256 } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!;
    const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if(!url||!anonKey||!serviceKey) return json({error:'Authentication service is not configured'},500);
    const body=await req.json();
    const username=String(body.username||'').trim().toLowerCase();
    const password=String(body.password||'');
    if(!/^[a-z0-9_]{3,40}$/.test(username)||password.length<1||password.length>256) return json({error:'Invalid username or password'},400);
    const ip=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,80);
    const userBucket=await sha256(`${ip}:user:${username}`);
    const ipBucket=await sha256(`${ip}:ip`);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const cutoff=new Date(Date.now()-15*60*1000).toISOString();
    const [userLimit,ipLimit]=await Promise.all([
      admin.from('login_attempts').select('id',{count:'exact',head:true}).eq('identifier_hash',userBucket).gt('attempted_at',cutoff),
      admin.from('login_attempts').select('id',{count:'exact',head:true}).eq('identifier_hash',ipBucket).gt('attempted_at',cutoff)
    ]);
    if(userLimit.error||ipLimit.error) return json({error:'Authentication service temporarily unavailable'},503);
    if((userLimit.count||0)>=8||(ipLimit.count||0)>=40) return json({error:'Too many sign-in attempts. Please try again later.'},429);
    const {data:attemptRows,error:attemptError}=await admin.from('login_attempts')
      .insert([{identifier_hash:userBucket,succeeded:false},{identifier_hash:ipBucket,succeeded:false}]).select('id');
    if(attemptError) return json({error:'Authentication service temporarily unavailable'},503);
    const {data:profile,error:profileError}=await admin.from('profiles').select('id,auth_email,status').eq('username',username).maybeSingle();
    if(profileError) return json({error:'Authentication service temporarily unavailable'},503);
    if(!profile) return json({error:'Invalid username or password'},401);
    if(profile.status!=='ACTIVE') return json({error:'This account is unavailable. Contact your administrator.'},403);
    const authClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await authClient.auth.signInWithPassword({email:profile.auth_email,password});
    if(error||!data.session) return json({error:'Invalid username or password'},401);
    const attemptIds=(attemptRows||[]).map(row=>row.id);
    if(attemptIds.length) await admin.from('login_attempts').update({succeeded:true}).in('id',attemptIds);
    return json({access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at});
  } catch(error) {
    console.error('username-login failure',error);
    return json({error:'Unable to sign in right now. Please try again.'},500);
  }
});
