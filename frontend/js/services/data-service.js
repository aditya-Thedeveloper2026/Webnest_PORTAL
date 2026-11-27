import { supabase } from '../config/supabase.js';

export const Data = {
  async count(table, filters=[]) {
    let query = supabase.from(table).select('id',{count:'exact',head:true});
    for (const [method,...args] of filters) query = query[method](...args);
    const {count,error}=await query; if(error) throw error; return count || 0;
  },
  async listProfiles() {
    const {data,error}=await supabase.from('profiles').select('id,full_name,username,role,status,contact_number,designation,joined_at').order('joined_at',{ascending:false});
    if(error) throw error; return data || [];
  },
  async listClients(search='') {
    let q=supabase.from('clients').select('id,client_name,company_name,industry,mobile_number,email,location,created_at,is_archived').eq('is_archived',false).order('created_at',{ascending:false}).limit(150);
    if(search) q=q.or(`client_name.ilike.%${search}%,company_name.ilike.%${search}%,mobile_number.ilike.%${search}%`);
    const {data,error}=await q; if(error) throw error; return data||[];
  },
  async listLeads() {
    const {data,error}=await supabase.from('leads').select('id,title,status,source,requirements,next_follow_up_at,created_at,client:clients(client_name,company_name)').order('created_at',{ascending:false}).limit(150);
    if(error) throw error; return data||[];
  },
  async listProjects({admin=false,technical=false}={}) {
    if(technical) {
      const {data,error}=await supabase.from('projects').select('id,title,service_type,service_plan,status,acquisition_source,created_by,expected_timeline,created_at,client:clients(client_name,company_name)').eq('technical_owner_id',(await supabase.auth.getUser()).data.user.id).order('created_at',{ascending:false}).limit(150);
      if(error) throw error; return data||[];
    }
    let q=supabase.from('projects').select('id,title,service_type,service_plan,status,acquisition_source,created_by,technical_owner_id,expected_timeline,total_paise,eligible_amount_paise,created_at,client:clients(client_name,company_name),creator:profiles!projects_created_by_fkey(full_name)').order('created_at',{ascending:false}).limit(150);
    const {data,error}=await q; if(error) throw error; return data||[];
  },
  async availableProjects() {
    const {data,error}=await supabase.from('available_projects').select('*').order('created_at',{ascending:true});
    if(error) throw error; return data||[];
  },
  async commissions() {
    const {data,error}=await supabase.from('commissions').select('id,eligible_amount_paise,rate_snapshot,commission_amount_paise,status,earned_at,created_at,project:projects(title)').order('created_at',{ascending:false}).limit(150);
    if(error) throw error; return data||[];
  },
  async notifications() {
    const {data,error}=await supabase.from('notifications').select('id,title,body,category,read_at,created_at').is('read_at',null).order('created_at',{ascending:false}).limit(10);
    if(error) throw error; return data||[];
  },
  async catalogue() {
    const {data,error}=await supabase.from('pricing_items').select('id,code,name,description,unit,price_paise,is_commissionable,is_taxable,tax_rate,category:pricing_categories(name)').eq('is_active',true).order('name');
    if(error) throw error; return data||[];
  },
  async saveClient(client) {
    const {data,error}=await supabase.from('clients').insert(client).select('id,client_name,mobile_number').single();
    if(error) throw error; return data;
  },
  async saveLead(lead) {
    const {data,error}=await supabase.from('leads').insert(lead).select('id').single();
    if(error) throw error; return data;
  },
  async acceptProject(projectId) {
    const {data,error}=await supabase.rpc('accept_available_project',{p_project_id:projectId});
    if(error) throw error; return data;
  },
  async reviewProject(projectId,decision,reason='') {
    const {data,error}=await supabase.rpc('admin_review_project',{p_project_id:projectId,p_decision:decision,p_reason:reason});
    if(error) throw error; return data;
  },
  async approveCompletion(projectId) {
    const {data,error}=await supabase.rpc('approve_project_completion',{p_project_id:projectId});
    if(error) throw error; return data;
  },
  async submitCompletion(projectId) {
    const {data,error}=await supabase.rpc('submit_project_completion',{p_project_id:projectId});
    if(error) throw error; return data;
  }
};
