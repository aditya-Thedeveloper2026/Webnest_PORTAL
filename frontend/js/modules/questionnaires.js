const UNKNOWN = { id:'unknown', label:"I don't know — let's discuss this" };
const yesNo = ['Yes','No',"I don't know"].map((label,i)=>({id:['yes','no','unknown'][i],label}));
const q = (id,text,options,extra={}) => ({id,text,options:options.map((v,i)=>typeof v==='string'?{id:v.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label:v}:v),...extra});
const withUnknown = options => [...options, UNKNOWN];

export const QUESTIONNAIRES = {
  WEBSITE: [
    [
      q('business_type','What type of business is this website for?',withUnknown(['Personal brand','Startup','Small business','Agency','E-commerce','Educational institution','Service provider','Other'])),
      q('main_purpose','What is the main purpose?',withUnknown(['Generate leads','Sell products','Showcase services','Build brand awareness','Share information','Accept bookings','Other'])),
      q('target_audience','Who is the target audience?',withUnknown(['General public','Businesses','Students','Professionals','Local customers','International customers'])),
      q('existing_website','Do you already have a website?',withUnknown(['Yes','No','Need to redesign an existing website']))
    ],
    [
      q('website_kind','What kind of website do you need?',withUnknown(['Landing page','Business website','Portfolio','E-commerce','Blog or content website','Booking website','Educational website','Custom website'])),
      q('page_count','Approximately how many pages do you need?',withUnknown(['1','2–5','6–10','11–20','More than 20'])),
      q('website_pages','Which pages would you like?',['Home','About','Services','Products','Portfolio','Contact','Blog','Pricing','FAQ','Other',UNKNOWN],{type:'multi'}),
      q('contact_form','Do you need a contact form?',yesNo)
    ],
    [
      q('design_style','What design style do you prefer?',withUnknown(['Minimal','Modern','Luxury','Corporate','Creative','Playful'])),
      q('colour_direction','What colour direction do you prefer?',withUnknown(['Light','Dark','Blue','Purple','Neutral','Brand-specific colours'])),
      q('brand_identity','Do you have a logo and brand identity?',withUnknown(['Yes','Partially','No'])),
      q('website_references','Do you have website references you like?',yesNo)
    ],
    [
      q('admin_dashboard','Do you need an admin dashboard?',yesNo),
      q('visitor_accounts','Do visitors need to create accounts or log in?',yesNo),
      q('online_payments','Do you need online payments?',yesNo),
      q('payment_types','What payment experience do you need?',withUnknown(['One-time payments','Subscriptions','Deposits or advance payments','Multiple payment options']),{dependsOn:{question:'online_payments',values:['yes']}})
    ],
    [
      q('booking_functionality','Do you need booking or appointment functionality?',yesNo),
      q('seo_setup','Do you need SEO setup?',withUnknown(['Basic SEO','Advanced SEO','No'])),
      q('website_analytics','Do you need website analytics?',yesNo),
      q('domain_status','Do you already have a domain?',withUnknown(['Yes','No','Need assistance']))
    ],
    [
      q('maintenance','Do you need ongoing maintenance?',yesNo),
      q('delivery_timeline','What is your preferred delivery timeline?',withUnknown(['Within one week','1–2 weeks','2–4 weeks','1–2 months','Flexible']))
    ]
  ],
  APPLICATION: [
    [
      q('application_purpose','What should the application help your business do?',withUnknown(['Manage business operations','Sell products or services','Teach or manage learning','Manage bookings','Connect a community','Track work or productivity','Manage finances or records','Serve customers','Manage employees','Something custom'])),
      q('application_users','Who will use the application?',withUnknown(['Customers','Employees','Administrators','Business partners','The public','A mix of user types'])),
      q('application_platform','Where should it work?',withUnknown(['Web application','Android application','iOS application','Web + Android','Web + iOS','Android + iOS','All platforms'])),
      q('expected_users','How many people may use it?',withUnknown(['Under 100','100–1,000','1,000–10,000','More than 10,000']))
    ],
    [
      q('user_registration','Do users need accounts?',yesNo),
      q('login_methods','How should users sign in?',withUnknown(['Email and password','Mobile OTP','Google / social login','Single sign-on','Multiple methods']),{dependsOn:{question:'user_registration',values:['yes']}}),
      q('user_roles','Do different users need different permissions?',withUnknown(['Yes, multiple roles','Only users and administrators','No special roles'])),
      q('admin_dashboard','Do administrators need a management dashboard?',yesNo)
    ],
    [
      q('database_requirements','Does the app need to save business or user data?',withUnknown(['Yes, structured records','Yes, files and documents','Both records and files','No, mostly informational'])),
      q('application_payments','Do you need in-app payments?',yesNo),
      q('application_payment_types','What payment features are needed?',withUnknown(['One-time checkout','Subscriptions','Wallet or stored balance','Invoices and payment tracking']),{dependsOn:{question:'application_payments',values:['yes']}}),
      q('notifications','Should the app send notifications?',withUnknown(['Push notifications','Email notifications','SMS or WhatsApp notifications','In-app notifications','Multiple types','No notifications']))
    ],
    [
      q('real_time','Do users need live updates?',yesNo),
      q('file_uploads','Should users upload files or images?',yesNo),
      q('location_features','Does the app need maps or location features?',yesNo),
      q('chat_features','Do users need chat or messaging?',yesNo)
    ],
    [
      q('analytics','Do you need reports or analytics?',yesNo),
      q('third_party_integrations','Does it need to connect to other tools?',withUnknown(['Payment gateway','CRM','Accounting software','Maps or delivery services','Existing APIs','Several tools','No integrations'])),
      q('security_requirements','Are there specific security or privacy requirements?',withUnknown(['Standard account security','Sensitive business data','Regulated or confidential data','Not sure yet'])),
      q('application_design','What visual direction do you prefer?',withUnknown(['Clean and minimal','Modern SaaS','Corporate','Premium / luxury','Creative','I need guidance']))
    ],
    [
      q('application_timeline','When would you like the application?',withUnknown(['Within one month','1–2 months','2–4 months','More than four months','Flexible']))
    ]
  ],
  AI_AGENT: [
    [
      q('agent_type','What kind of AI assistant are you interested in?',withUnknown(['Customer support agent','Website chatbot','WhatsApp Business assistant','Sales and lead qualification','Appointment booking','Internal business assistant','Document and knowledge assistant','Workflow automation agent','Voice AI agent','Research assistant','Custom AI agent'])),
      q('agent_goal','What should the AI agent mainly do?',withUnknown(['Answer questions','Collect and qualify leads','Resolve support requests','Book appointments','Search documents and knowledge','Automate repetitive workflows','Generate reports or research','A combination of these'])),
      q('agent_users','Who will interact with it?',withUnknown(['Customers','Website visitors','Employees','Sales team','Support team','Business owners','Multiple groups'])),
      q('agent_channels','Where should it work?',withUnknown(['Website','WhatsApp','Telegram','Internal dashboard','Voice interface','Multiple channels']))
    ],
    [
      q('interaction_mode','How should people interact with the agent?',withUnknown(['Text chat','Voice conversations','Both text and voice','I need guidance'])),
      q('agent_languages','Which languages should it understand?',withUnknown(['English','Hindi','Hinglish','English and Hindi','Multiple Indian languages','Other languages'])),
      q('knowledge_sources','Where should the agent get its information?',withUnknown(['Website content','PDFs and documents','Business database','CRM or help centre','Internal knowledge base','Several sources','Not decided'])) ,
      q('document_types','Which documents should it understand?',withUnknown(['PDF','Word documents','Spreadsheets','Images and scanned files','Multiple formats']),{dependsOn:{question:'knowledge_sources',values:['pdfs_and_documents','internal_knowledge_base','several_sources']}})
    ],
    [
      q('database_integration','Should it read or update your business database?',yesNo),
      q('crm_integration','Should it connect with a CRM?',yesNo),
      q('crm_name','Which CRM do you currently use?',withUnknown(['HubSpot','Salesforce','Zoho CRM','Freshsales','A custom CRM','Other']),{dependsOn:{question:'crm_integration',values:['yes']}}),
      q('human_handover','Should it hand a conversation to a human?',yesNo)
    ],
    [
      q('lead_collection','Should it collect visitor or customer details?',yesNo),
      q('appointment_booking','Should it book appointments?',yesNo),
      q('workflow_automation','Should it trigger automated business actions?',yesNo),
      q('external_apis','Does it need other external APIs or services?',withUnknown(['Yes, existing APIs','Yes, new integrations may be needed','No','Not sure']))
    ],
    [
      q('voice_preferences','Do you have preferences for speech recognition or voice output?',withUnknown(['Natural-sounding AI voice','Specific voice or accent','Speech-to-text only','Not required','Need guidance']),{dependsOn:{question:'interaction_mode',values:['voice_conversations','both_text_and_voice']}}),
      q('agent_volume','How much usage do you expect?',withUnknown(['Under 100 conversations per month','100–1,000 per month','1,000–10,000 per month','More than 10,000 per month','Not sure'])),
      q('privacy_requirements','Are there privacy or data-retention requirements?',withUnknown(['Standard privacy controls','Keep data within our organization','Sensitive or regulated data','Need guidance'])),
      q('response_style','How should the assistant communicate?',withUnknown(['Professional and concise','Friendly and conversational','Formal and detailed','Brand-specific personality','We need recommendations']))
    ],
    [
      q('agent_timeline','When would you like the AI agent ready?',withUnknown(['Within two weeks','2–4 weeks','1–2 months','More than two months','Flexible']))
    ]
  ]
};

export function activeQuestionPages(service, answers={}) {
  const pages=QUESTIONNAIRES[service] || [];
  return pages.map(page=>page.filter(question=>{
    if(!question.dependsOn) return true;
    const selected=answers[question.dependsOn.question]?.answer_ids || [];
    return question.dependsOn.values.some(value=>selected.includes(value));
  })).filter(page=>page.length);
}
export function questionAnswerRecord(question, selectedIds, service) {
  const answerIds=Array.isArray(selectedIds)?selectedIds:[selectedIds];
  const labels=answerIds.map(id=>question.options.find(o=>o.id===id)?.label).filter(Boolean);
  return {question_id:question.id,question_text:question.text,answer_ids:answerIds,answer_labels:labels,answer_label:labels.join(', '),service_category:service,questionnaire_version:'2026-11-01'};
}
