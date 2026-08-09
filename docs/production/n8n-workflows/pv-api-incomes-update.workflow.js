import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const headers = { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] };

const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'POST /portal-v1/incomes/update', position: [180, 220], parameters: { httpMethod: 'POST', path: 'portal-v1/incomes/update', authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173', ignoreBots: true } } } });

const extract = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Extract App Token', position: [460, 220], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const x=$input.first()?.json??{},b=x.body??{},h=x.headers??{},now=new Date().toISOString(),request_id=h['x-request-id']||h['X-Request-Id']||b.request_id||'incomes_update_'+Date.now(),m=String(h['x-portal-authorization']||h['X-Portal-Authorization']||h.authorization||h.Authorization||'').match(/^Bearer\\s+(.+)$/i),fail=(statusCode,code,message,details={})=>({statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id,timestamp:now}}}); if(!m?.[1])return[{json:{valid:false,...fail(401,'UNAUTHORIZED','Sesi tidak ditemukan.')}}]; return[{json:{valid:true,token:m[1].trim(),body:b,request_id}}];` } } });

const tokenOk = ifElse({ version: 2.3, config: { name: 'Token Present?', position: [720, 220], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const jwt = node({ type: 'n8n-nodes-base.jwt', version: 1, config: { name: 'Verify App JWT', position: [1000, 100], onError: 'continueRegularOutput', parameters: { operation: 'verify', token: expr('{{ $json.token }}'), options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' } }, credentials: { jwtAuth: newCredential('PV App JWT') } } });

const profileNode = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Actor Profile', position: [1280, 100], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const validate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validate Token and Actor', position: [1560, 100], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const p=$input.first()?.json??{},r=$items('Extract App Token',0,0)?.[0]?.json??{},j=$items('Verify App JWT',0,0)?.[0]?.json??{},q=j.payload&&typeof j.payload==='object'?j.payload:j,now=new Date().toISOString(),id=r.request_id||'incomes_update_'+Date.now(),fail=(statusCode,code,message,details={})=>({allowed:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:id,timestamp:now}}}),b=r.body??{},uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(q.iss!=='portal-palm-village'||q.aud!=='portal-palm-village-web'||!q.sub)return[{json:fail(401,'INVALID_TOKEN','Sesi tidak valid.')}];
if(!p.id||p.is_active!==true||p.approval_status!=='approved')return[{json:fail(403,'FORBIDDEN','Akun belum dapat mengakses endpoint ini.')}];
const income_id=b.income_id??b.id??'';
if(!uuid.test(income_id))return[{json:fail(400,'VALIDATION_ERROR','income_id harus UUID yang valid.',{field:'income_id'})}];
const scope=b.scope??null,event_id=b.event_id??null;
if(scope&&!['general','event'].includes(scope))return[{json:fail(400,'VALIDATION_ERROR','scope harus general atau event.',{field:'scope'})}];
if(scope==='event'&&!event_id)return[{json:fail(400,'VALIDATION_ERROR','event_id wajib untuk scope event.',{field:'event_id'})}];
if(scope==='general'&&event_id)return[{json:fail(400,'VALIDATION_ERROR','event_id harus kosong untuk scope general.',{field:'event_id'})}];
const amount=b.amount!=null?Number(b.amount):null;
if(amount!==null&&(Number.isNaN(amount)||amount<=0))return[{json:fail(400,'VALIDATION_ERROR','amount harus lebih dari nol.',{field:'amount'})}];
return[{json:{allowed:true,income_id,scope,event_id,amount,body:b,actor:{id:p.id,email:p.email,role:p.role},request_id:id}}];
` } } });

const allowed = ifElse({ version: 2.3, config: { name: 'Actor Allowed?', position: [1840, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.allowed }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

// Fetch existing income + assignments to check access
const fetchIncome = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Existing Income', position: [2120, 20], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'non_ipl_incomes', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.income_id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const fetchAssignments = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Actor Assignments', position: [2400, 20], executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'event_members', returnAll: true, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'profile_id', condition: 'eq', keyValue: expr('{{ $items(\'Validate Token and Actor\', 0, 0)?.[0]?.json?.actor?.id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const prepareUpdate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare Income Update', position: [2680, 20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const income=$items('Fetch Existing Income',0,0)?.[0]?.json??{},assignments=$input.all().map(i=>i.json??{}).filter(a=>a.id&&!a.revoked_at&&a.assignment_role==='event_treasurer'),ctx=$items('Validate Token and Actor',0,0)?.[0]?.json??{},now=new Date().toISOString(),fail=(statusCode,code,message,details={})=>({ready:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:ctx.request_id,timestamp:now}}});
if(!income.id||income.deleted_at)return[{json:fail(404,'NOT_FOUND','Pemasukan tidak ditemukan atau sudah dihapus.')}];
const actorRole=ctx.actor?.role,isFinanceStaff=actorRole==='admin'||actorRole==='bendahara',assignedEventIds=new Set(assignments.map(a=>a.event_id));
// Check access to original income event
const originalScopeOk=income.scope==='general'?isFinanceStaff:isFinanceStaff||assignedEventIds.has(income.event_id);
if(!originalScopeOk)return[{json:fail(403,'FORBIDDEN','Akun tidak memiliki akses ke pemasukan ini.')}];
// If changing scope/event_id, check target event access too
const newScope=ctx.scope||income.scope,newEventId=ctx.event_id!==undefined?ctx.event_id:income.event_id;
if(newScope==='event'&&!isFinanceStaff&&!assignedEventIds.has(newEventId))return[{json:fail(403,'FORBIDDEN','Bendahara Event tidak dapat memindahkan pemasukan ke event lain yang tidak di-assign.')}];
const b=ctx.body??{};
const update={income_date:b.income_date||income.income_date,scope:newScope,event_id:newEventId??null,category:b.category?.trim()||income.category,source_name:b.source_name?.trim()||income.source_name,amount:ctx.amount??Number(income.amount),payment_method:b.payment_method||income.payment_method,reference_number:b.reference_number??income.reference_number??null,description:b.description?.trim()||income.description};
if(!update.category||!update.source_name||!update.description)return[{json:fail(400,'VALIDATION_ERROR','Kategori, sumber, dan deskripsi tidak boleh kosong.')}];
return[{json:{ready:true,income_id:income.id,update,actor:ctx.actor,request_id:ctx.request_id,before:income}}];
` } } });

const updateReady = ifElse({ version: 2.3, config: { name: 'Update Ready?', position: [2960, 20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.ready }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const doUpdate = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Update Income', position: [3240, -60], parameters: { resource: 'row', operation: 'update', tableId: 'non_ipl_incomes', filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.income_id }}') }] }, dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'income_date', fieldValue: expr('{{ $json.update.income_date }}') }, { fieldId: 'scope', fieldValue: expr('{{ $json.update.scope }}') }, { fieldId: 'event_id', fieldValue: expr('{{ $json.update.event_id }}') }, { fieldId: 'category', fieldValue: expr('{{ $json.update.category }}') }, { fieldId: 'source_name', fieldValue: expr('{{ $json.update.source_name }}') }, { fieldId: 'amount', fieldValue: expr('{{ $json.update.amount }}') }, { fieldId: 'payment_method', fieldValue: expr('{{ $json.update.payment_method }}') }, { fieldId: 'reference_number', fieldValue: expr('{{ $json.update.reference_number }}') }, { fieldId: 'description', fieldValue: expr('{{ $json.update.description }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildAudit = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Income Update Audit', position: [3520, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const income=$input.first()?.json??{},ctx=$items('Prepare Income Update',0,0)?.[0]?.json??{}; return[{json:{income,request_id:ctx.request_id,audit:{actor_id:ctx.actor?.id??null,actor_email:ctx.actor?.email??null,entity_id:income.id,metadata:{before:ctx.before,after:income}}}}];` } } });

const auditLog = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Audit Income Update', position: [3800, -60], parameters: { resource: 'row', operation: 'create', tableId: 'audit_logs', dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'actor_id', fieldValue: expr('{{ $json.audit.actor_id }}') }, { fieldId: 'actor_email', fieldValue: expr('{{ $json.audit.actor_email }}') }, { fieldId: 'action', fieldValue: 'income.update' }, { fieldId: 'entity_type', fieldValue: 'non_ipl_income' }, { fieldId: 'entity_id', fieldValue: expr('{{ $json.audit.entity_id }}') }, { fieldId: 'metadata', fieldValue: expr('{{ $json.audit.metadata }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildResponse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Update Response', position: [4080, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const audit=$input.first()?.json??{},ctx=$items('Build Income Update Audit',0,0)?.[0]?.json??{}; return[{json:{statusCode:200,response:{ok:true,data:{income:ctx.income,audit_id:audit.id??null},error:null,meta:{request_id:ctx.request_id,timestamp:new Date().toISOString()}}}}];` } } });

const respond = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Update Income', position: [4360, -60], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });
const error = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Update Error', position: [2120, 240], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });

export default workflow('pv-api-incomes-update', 'PV API - Incomes Update')
  .add(webhook)
  .to(extract)
  .to(tokenOk
    .onTrue(jwt.to(profileNode).to(validate).to(allowed
      .onTrue(fetchIncome.to(fetchAssignments).to(prepareUpdate).to(updateReady.onTrue(doUpdate.to(buildAudit).to(auditLog).to(buildResponse).to(respond)).onFalse(error)))
      .onFalse(error)))
    .onFalse(error));
