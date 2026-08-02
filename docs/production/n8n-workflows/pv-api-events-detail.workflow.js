import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const eventsWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/events/detail',
    position: [180, 220],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/events/detail',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: {}, query: {}, body: { event_id: '00000000-0000-4000-8000-000000000010' } }],
});

const extractBearerToken = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Extract Bearer Token', position: [460, 220], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || 'events_detail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
const match = String(headers.authorization || headers.Authorization || '').match(/^Bearer\\s+(.+)$/i);
const fail = (statusCode, code, message, details = {}) => ({ statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } });
if (!match?.[1]) return [{ json: { tokenPresent: false, request_id: requestId, ...fail(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.') } }];
return [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId, timestamp: now } }];
`, }, }, output: [{ tokenPresent: true, token: 'jwt', request_id: 'events_detail_sample' }] });

const tokenPresent = ifElse({ version: 2.3, config: { name: 'Token Present?', position: [720, 220], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.tokenPresent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } }, output: [{ tokenPresent: true }] });

const verifyAppJwt = node({
  type: 'n8n-nodes-base.jwt',
  version: 1,
  config: {
    name: 'Verify App JWT',
    position: [1000, 100],
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'verify',
      token: expr('{{ $json.token }}'),
      options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' },
    },
    credentials: { jwtAuth: newCredential('PV App JWT') },
  },
});

const validateAppClaims = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validate App Claims', position: [1280, 100], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const input = $input.first()?.json ?? {};
const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;
const now = new Date().toISOString();
const requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || 'events_detail_' + Date.now();
const fail = (statusCode, code, message) => ({ claimsValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details: {} }, meta: { request_id: requestId, timestamp: now } } });
const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes('portal-palm-village-web') : payload.aud === 'portal-palm-village-web';
if (payload.iss !== 'portal-palm-village' || !audienceOk || !payload.sub) return [{ json: fail(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.') }];
return [{ json: { claimsValid: true, request_id: requestId, sub: payload.sub } }];
`, }, }, output: [{ claimsValid: true, request_id: 'events_detail_sample', sub: '00000000-0000-4000-8000-000000000001' }] });

const claimsValid = ifElse({ version: 2.3, config: { name: 'Claims Valid?', position: [1540, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.claimsValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } }, output: [{ claimsValid: true }] });

const fetchActorProfile = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Actor Profile',
    position: [1820, -20],
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const authorizeActor = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Authorize Actor', position: [2100, -20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const profile = $input.first()?.json ?? {};
const now = new Date().toISOString();
const requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || 'events_detail_' + Date.now();
const fail = (statusCode, code, message, details = {}) => ({ authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } });
const rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };
if (!profile.id) return [{ json: fail(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.') }];
if (profile.is_active !== true) return [{ json: fail(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.') }];
if (profile.approval_status !== 'approved') return [{ json: fail(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }];
if (!(rank[profile.role] >= rank.warga)) return [{ json: fail(403, 'FORBIDDEN_ROLE', 'Role Anda tidak memiliki akses ke endpoint ini.') }];
return [{ json: { authorized: true, request_id: requestId, actor: { id: profile.id, email: profile.email, role: profile.role } } }];
`, }, }, output: [{ authorized: true, request_id: 'events_detail_sample', actor: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' } }] });

const actorAuthorized = ifElse({ version: 2.3, config: { name: 'Actor Authorized?', position: [2380, -20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.authorized }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } }, output: [{ authorized: true }] });

const validateRequest = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validate Event Detail Request', position: [2660, -20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const requestId = $items('Authorize Actor', 0, 0)?.[0]?.json?.request_id || 'events_detail_' + Date.now();
const now = new Date().toISOString();
const body = $items('POST /portal-v1/events/detail', 0, 0)?.[0]?.json?.body ?? {};
const eventId = body.event_id ?? body.id ?? null;
const isUuid = typeof eventId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
if (!isUuid) return [{ json: { valid: false, statusCode: 400, response: { ok: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'event_id harus UUID yang valid.', details: { field: 'event_id' } }, meta: { request_id: requestId, timestamp: now } } } }];
return [{ json: { valid: true, event_id: eventId, include_deleted: Boolean(body.include_deleted ?? body.includeDeleted), request_id: requestId } }];
`, }, }, output: [{ valid: true, event_id: '00000000-0000-4000-8000-000000000010', request_id: 'events_detail_sample' }] });

const requestValid = ifElse({ version: 2.3, config: { name: 'Detail Request Valid?', position: [2940, -20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } }, output: [{ valid: true }] });

const fetchEvent = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Event',
    position: [3220, -120],
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'events', returnAll: false, limit: 1,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $items('Validate Event Detail Request', 0, 0)[0].json.event_id }}") }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchAssignments = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Event Assignments',
    position: [3500, -120],
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'event_members', returnAll: true, filterType: 'none' },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const buildDetail = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build Event Detail', position: [3780, -20], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const actor = $items('Authorize Actor', 0, 0)?.[0]?.json?.actor ?? {};
const request = $items('Validate Event Detail Request', 0, 0)?.[0]?.json ?? {};
const now = new Date().toISOString();
const event = $items('Fetch Event', 0, 0).map((item) => item.json || {}).find((row) => row.id) || null;
const assignments = $items('Fetch Event Assignments', 0, 0).map((item) => item.json || {});
const fail = (statusCode, code, message, details = {}) => ({ statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: request.request_id, timestamp: now } } });
if (!event) return [{ json: fail(404, 'NOT_FOUND', 'Event tidak ditemukan.') }];
if (event.deleted_at && !(request.include_deleted && actor.role === 'admin')) return [{ json: fail(404, 'NOT_FOUND', 'Event tidak ditemukan.') }];
const canViewAll = actor.role === 'admin' || actor.role === 'bendahara';
const assignment = assignments.find((row) => row.event_id === event.id && row.profile_id === actor.id && !row.revoked_at) || null;
if (!canViewAll && !assignment) return [{ json: fail(403, 'FORBIDDEN', 'Akun tidak memiliki akses ke event ini.', { event_id: event.id }) }];
const assignmentRole = assignment?.assignment_role ?? null;
const result = {
  id: event.id,
  event_code: event.event_code || 'EVT-' + String(event.id).replace(/-/g, '').toUpperCase(),
  title: event.title || '', description: event.description ?? null,
  event_date: event.event_date ?? null, end_date: event.end_date ?? null, location: event.location ?? null,
  status: event.status || 'active', deleted_at: event.deleted_at ?? null,
  created_at: event.created_at ?? null, updated_at: event.updated_at ?? null,
  can_view: true, can_manage_finance: canViewAll || assignmentRole === 'event_treasurer',
  can_manage_event: actor.role === 'admin', assignment_role: assignmentRole, is_assigned: Boolean(assignment),
};
return [{ json: { statusCode: 200, response: { ok: true, data: { event: result }, error: null, meta: { request_id: request.request_id, timestamp: now } } } }];
`, }, }, output: [{ statusCode: 200, response: { ok: true, data: { event: {} }, error: null, meta: { request_id: 'events_detail_sample' } } }] });

const respondDetail = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Event Detail', position: [4060, -20], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } } });
const respondAuthError = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Auth Error', position: [1000, 280], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } } });
const respondClaimError = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Claim Error', position: [1820, 200], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } } });
const respondForbidden = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Forbidden', position: [2660, 220], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } } });
const respondValidationError = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond Validation Error', position: [3220, 180], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } } });

export default workflow('pv-api-events-detail', 'PV API - Events Detail')
  .add(eventsWebhook)
  .to(extractBearerToken)
  .to(tokenPresent.onTrue(
    verifyAppJwt.to(validateAppClaims).to(claimsValid.onTrue(
      fetchActorProfile.to(authorizeActor).to(actorAuthorized.onTrue(
        validateRequest.to(requestValid.onTrue(fetchEvent.to(fetchAssignments).to(buildDetail).to(respondDetail)).onFalse(respondValidationError)),
      ).onFalse(respondForbidden)),
    ).onFalse(respondClaimError)),
  ).onFalse(respondAuthError));
