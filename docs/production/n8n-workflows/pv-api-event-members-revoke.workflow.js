import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const headers = { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] };

const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'POST /portal-v1/events/members/revoke', position: [180, 220], parameters: { httpMethod: 'POST', path: 'portal-v1/events/members/revoke', authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173', ignoreBots: true } } } });

const extract = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Extract App Token', position: [460, 220], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const x=$input.first()?.json??{},b=x.body??{},h=x.headers??{},now=new Date().toISOString(),request_id=h['x-request-id']||h['X-Request-Id']||b.request_id||'event_members_revoke_'+Date.now(),m=String(h.authorization||h.Authorization||'').match(/^Bearer\\s+(.+)$/i),fail=(statusCode,code,message,details={})=>({statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id,timestamp:now}}}); if(!m?.[1])return[{json:{valid:false,...fail(401,'UNAUTHORIZED','Sesi tidak ditemukan.')}}]; return[{json:{valid:true,token:m[1].trim(),body:b,request_id}}];` } } });

const tokenOk = ifElse({ version: 2.3, config: { name: 'Token Present?', position: [720, 220], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const jwt = node({ type: 'n8n-nodes-base.jwt', version: 1, config: { name: 'Verify App JWT', position: [1000, 100], onError: 'continueRegularOutput', parameters: { operation: 'verify', token: expr('{{ $json.token }}'), options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' } }, credentials: { jwtAuth: newCredential('PV App JWT') } } });

const profile = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Actor Profile', position: [1280, 100], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const validate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Authorize Admin and Validate Revoke', position: [1560, 100], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const p=$input.first()?.json??{},r=$items('Extract App Token',0,0)?.[0]?.json??{},j=$items('Verify App JWT',0,0)?.[0]?.json??{},q=j.payload&&typeof j.payload==='object'?j.payload:j,now=new Date().toISOString(),id=r.request_id||'event_members_revoke_'+Date.now(),fail=(statusCode,code,message,details={})=>({allowed:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:id,timestamp:now}}}),b=r.body??{},uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(q.iss!=='portal-palm-village'||q.aud!=='portal-palm-village-web'||!q.sub)return[{json:fail(401,'INVALID_TOKEN','Sesi tidak valid.')}];
if(!p.id||p.is_active!==true||p.approval_status!=='approved')return[{json:fail(403,'FORBIDDEN','Akun belum dapat mengakses endpoint ini.')}];
if(p.role!=='admin')return[{json:fail(403,'FORBIDDEN_ROLE','Hanya Admin yang dapat mencabut assignment event.',{required_role:'admin',actor_role:p.role})}];
const assignment_id=b.assignment_id??b.id??'';
if(!uuid.test(assignment_id))return[{json:fail(400,'VALIDATION_ERROR','assignment_id harus UUID yang valid.',{field:'assignment_id'})}];
return[{json:{allowed:true,assignment_id,note:b.note||null,actor:{id:p.id,email:p.email},request_id:id}}];
` } } });

const allowed = ifElse({ version: 2.3, config: { name: 'Admin Authorized?', position: [1840, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.allowed }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

// Fetch existing assignment
const fetchAssign = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Fetch Assignment', position: [2120, 20], alwaysOutputData: true, parameters: { resource: 'row', operation: 'getAll', tableId: 'event_members', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.assignment_id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const prepareRevoke = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare Revoke', position: [2400, 20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const assign=$input.first()?.json??{},ctx=$items('Authorize Admin and Validate Revoke',0,0)?.[0]?.json??{},now=new Date().toISOString(),fail=(statusCode,code,message,details={})=>({ready:false,statusCode,response:{ok:false,data:null,error:{code,message,details},meta:{request_id:ctx.request_id,timestamp:now}}});
if(!assign.id)return[{json:fail(404,'NOT_FOUND','Assignment tidak ditemukan.',{assignment_id:ctx.assignment_id})}];
if(assign.revoked_at)return[{json:fail(409,'ALREADY_REVOKED','Assignment sudah dicabut sebelumnya.',{revoked_at:assign.revoked_at})}];
return[{json:{ready:true,assignment_id:assign.id,event_id:assign.event_id,profile_id:assign.profile_id,note:ctx.note,actor:ctx.actor,request_id:ctx.request_id,before:assign,revoked_at:now}}];
` } } });

const revokeReady = ifElse({ version: 2.3, config: { name: 'Revoke Ready?', position: [2680, 20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.ready }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const doRevoke = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Revoke Assignment', position: [2960, -60], parameters: { resource: 'row', operation: 'update', tableId: 'event_members', filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.assignment_id }}') }] }, dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'revoked_at', fieldValue: expr('{{ $json.revoked_at }}') }, { fieldId: 'revoked_by', fieldValue: expr('{{ $json.actor.id }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildAudit = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Revoke Audit', position: [3240, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const member=$input.first()?.json??{},ctx=$items('Prepare Revoke',0,0)?.[0]?.json??{}; return[{json:{member,request_id:ctx.request_id,audit:{actor_id:ctx.actor?.id??null,actor_email:ctx.actor?.email??null,entity_id:member.id,metadata:{event_id:member.event_id,profile_id:member.profile_id,note:ctx.note,before:ctx.before,revoked_at:member.revoked_at}}}}];` } } });

const auditLog = node({ type: 'n8n-nodes-base.supabase', version: 1, config: { name: 'Audit Member Revoke', position: [3520, -60], parameters: { resource: 'row', operation: 'create', tableId: 'audit_logs', dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'actor_id', fieldValue: expr('{{ $json.audit.actor_id }}') }, { fieldId: 'actor_email', fieldValue: expr('{{ $json.audit.actor_email }}') }, { fieldId: 'action', fieldValue: 'event_member.revoke' }, { fieldId: 'entity_type', fieldValue: 'event_member' }, { fieldId: 'entity_id', fieldValue: expr('{{ $json.audit.entity_id }}') }, { fieldId: 'metadata', fieldValue: expr('{{ $json.audit.metadata }}') }] } }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') } } });

const buildResponse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Revoke Response', position: [3800, -60], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const audit=$input.first()?.json??{},ctx=$items('Build Revoke Audit',0,0)?.[0]?.json??{}; return[{json:{statusCode:200,response:{ok:true,data:{member:ctx.member,audit_id:audit.id??null},error:null,meta:{request_id:ctx.request_id,timestamp:new Date().toISOString()}}}}];` } } });

const respond = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Revoke', position: [4080, -60], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });
const error = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Revoke Error', position: [2120, 240], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: headers } } } });

export default workflow('pv-api-event-members-revoke', 'PV API - Event Members Revoke')
  .add(webhook)
  .to(extract)
  .to(tokenOk
    .onTrue(jwt.to(profile).to(validate).to(allowed
      .onTrue(fetchAssign.to(prepareRevoke).to(revokeReady.onTrue(doRevoke.to(buildAudit).to(auditLog).to(buildResponse).to(respond)).onFalse(error)))
      .onFalse(error)))
    .onFalse(error));
