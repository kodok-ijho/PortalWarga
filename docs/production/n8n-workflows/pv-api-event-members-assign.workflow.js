import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const headers = { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] };

const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'POST /portal-v1/events/members/assign', position: [180, 220], parameters: { httpMethod: 'POST', path: 'portal-v1/events/members/assign', authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173', ignoreBots: true } } } });

const extract = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Extract App Token', position: [460, 220], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const x=$input.first()?.json??{},b=x.body??{},h=x.headers??{},now=new Date().toISOString(),request_id=h['x-request-id']||h['X-Request-Id']||b.request_id||'event_members_assign_'+Date.now(),m=String(h['x-portal-authorization']||h['X-Portal-Authorization']||h.authorization||h.Authorization||'').match(/^Bearer\\s+(.+)$/i),fail=(statusCode,code,message,details={})=>({statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id,timestamp:now}}}); if(!m?.[1])return[{json:{valid:false,...fail(401,'UNAUTHORIZED','Sesi tidak ditemukan.')}}]; return[{json:{valid:true,token:m[1].trim(),body:b,request_id}}];` } } });

const tokenOk = ifElse({ version: 2.3, config: { name: 'Token Present?', position: [720, 220], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const jwt = node({ type: 'n8n-nodes-base.jwt', version: 1, config: { name: 'Verify App JWT', position: [1000, 100], onError: 'continueRegularOutput', parameters: { operation: 'verify', token: expr('{{ $json.token }}'), options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' } }, credentials: { jwtAuth: newCredential('PV App JWT') } } });

const profile = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Actor Profile', position: [1280, 100], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

// Validate: Admin only, UUID checks, valid assignment_role
const validate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Authorize Admin and Validate Assignment', position: [1560, 100], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const p=$input.first()?.json??{},r=$items('Extract App Token',0,0)?.[0]?.json??{},j=$items('Verify App JWT',0,0)?.[0]?.json??{},q=j.payload&&typeof j.payload==='object'?j.payload:j,now=new Date().toISOString(),id=r.request_id||'event_members_assign_'+Date.now(),fail=(statusCode,code,message,details={})=>({allowed:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:id,timestamp:now}}}),b=r.body??{},uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,validRoles=['coordinator_member','event_treasurer'];
if(q.iss!=='portal-palm-village'||q.aud!=='portal-palm-village-web'||!q.sub)return[{json:fail(401,'INVALID_TOKEN','Sesi tidak valid.')}];
if(!p.id||p.is_active!==true||p.approval_status!=='approved')return[{json:fail(403,'FORBIDDEN','Akun belum dapat mengakses endpoint ini.')}];
if(p.role!=='admin')return[{json:fail(403,'FORBIDDEN_ROLE','Hanya Admin yang dapat mengelola assignment event.',{required_role:'admin',actor_role:p.role})}];
const event_id=b.event_id??'',profile_id=b.profile_id??'',assignment_role=b.assignment_role??'';
if(!uuid.test(event_id))return[{json:fail(400,'VALIDATION_ERROR','event_id harus UUID yang valid.',{field:'event_id'})}];
if(!uuid.test(profile_id))return[{json:fail(400,'VALIDATION_ERROR','profile_id harus UUID yang valid.',{field:'profile_id'})}];
if(!validRoles.includes(assignment_role))return[{json:fail(400,'VALIDATION_ERROR','assignment_role harus coordinator_member atau event_treasurer.',{field:'assignment_role',valid:validRoles})}];
return[{json:{allowed:true,event_id,profile_id,assignment_role,actor:{id:p.id,email:p.email},request_id:id}}];
` } } });

const allowed = ifElse({ version: 2.3, config: { name: 'Admin Authorized?', position: [1840, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.allowed }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

// Fetch target profile to verify it's active and approved
const targetProfile = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Target Profile', position: [2120, 20], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.profile_id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

// Check target profile is active, fetch existing active assignment for uniqueness
const prepareAssign = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare Assignment', position: [2400, 20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const target=$input.first()?.json??{},ctx=$items('Authorize Admin and Validate Assignment',0,0)?.[0]?.json??{},now=new Date().toISOString(),fail=(statusCode,code,message,details={})=>({ready:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:ctx.request_id,timestamp:now}}});
if(!target.id)return[{json:fail(404,'NOT_FOUND','Profil pengguna tidak ditemukan.',{profile_id:ctx.profile_id})}];
if(target.is_active!==true||target.approval_status!=='approved')return[{json:fail(422,'INVALID_PROFILE','Profil pengguna tidak aktif atau belum disetujui.',{profile_id:ctx.profile_id,is_active:target.is_active,approval_status:target.approval_status})}];
return[{json:{ready:true,event_id:ctx.event_id,profile_id:ctx.profile_id,assignment_role:ctx.assignment_role,actor:ctx.actor,request_id:ctx.request_id,target_name:target.full_name||target.email||ctx.profile_id}}];
` } } });

const assignReady = ifElse({ version: 2.3, config: { name: 'Assignment Ready?', position: [2680, 20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.ready }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

// Insert new assignment (unique index on event_id+profile_id where revoked_at is null handles duplicates at DB level)
const insertAssign = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Insert Event Member', position: [2960, -60], parameters: { resource: 'row', operation: 'create', tableId: 'event_members', dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'event_id', fieldValue: expr('{{ $json.event_id }}') }, { fieldId: 'profile_id', fieldValue: expr('{{ $json.profile_id }}') }, { fieldId: 'assignment_role', fieldValue: expr('{{ $json.assignment_role }}') }, { fieldId: 'assigned_by', fieldValue: expr('{{ $json.actor.id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildAudit = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Assign Audit', position: [3240, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const member=$input.first()?.json??{},ctx=$items('Prepare Assignment',0,0)?.[0]?.json??{}; return[{json:{member,request_id:ctx.request_id,audit:{actor_id:ctx.actor?.id??null,actor_email:ctx.actor?.email??null,entity_id:member.id,metadata:{event_id:member.event_id,profile_id:member.profile_id,assignment_role:member.assignment_role,target_name:ctx.target_name}}}}];` } } });

const auditLog = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Audit Member Assign', position: [3520, -60], parameters: { resource: 'row', operation: 'create', tableId: 'audit_logs', dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'actor_id', fieldValue: expr('{{ $json.audit.actor_id }}') }, { fieldId: 'actor_email', fieldValue: expr('{{ $json.audit.actor_email }}') }, { fieldId: 'action', fieldValue: 'event_member.assign' }, { fieldId: 'entity_type', fieldValue: 'event_member' }, { fieldId: 'entity_id', fieldValue: expr('{{ $json.audit.entity_id }}') }, { fieldId: 'metadata', fieldValue: expr('{{ $json.audit.metadata }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildResponse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Assign Response', position: [3800, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const audit=$input.first()?.json??{},ctx=$items('Build Assign Audit',0,0)?.[0]?.json??{}; return[{json:{statusCode:201,response:{ok:true,data:{member:ctx.member,audit_id:audit.id??null},error:null,meta:{request_id:ctx.request_id,timestamp:new Date().toISOString()}}}}];` } } });

const respond = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Assign', position: [4080, -60], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });
const error = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Assign Error', position: [2120, 240], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });

export default workflow('pv-api-event-members-assign', 'PV API - Event Members Assign')
  .add(webhook)
  .to(extract)
  .to(tokenOk
    .onTrue(jwt.to(profile).to(validate).to(allowed
      .onTrue(targetProfile.to(prepareAssign).to(assignReady.onTrue(insertAssign.to(buildAudit).to(auditLog).to(buildResponse).to(respond)).onFalse(error)))
      .onFalse(error)))
    .onFalse(error));
