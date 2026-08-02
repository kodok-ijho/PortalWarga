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
    name: 'POST /portal-v1/events/list',
    position: [180, 220],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/events/list',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: {}, query: {}, body: { include_deleted: false } }],
});

const extractBearerToken = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Bearer Token',
    position: [460, 220],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const source = $input.first()?.json ?? {};\n" +
        "const body = source.body ?? {};\n" +
        "const query = source.query ?? {};\n" +
        "const headers = source.headers ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'events_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const authHeader = headers.authorization || headers.Authorization || '';\n" +
        "const match = String(authHeader).match(/^Bearer\\s+(.+)$/i);\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!match || !match[1]) {\n" +
        "  return [{ json: { tokenPresent: false, request_id: requestId, timestamp: now, ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.', {}) } }];\n" +
        "}\n" +
        "return [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId, timestamp: now } }];",
    },
  },
  output: [{ tokenPresent: true, token: 'jwt', request_id: 'events_list_sample', timestamp: '2026-08-01T00:00:00.000Z' }],
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [720, 220],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tokenPresent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ tokenPresent: true }],
});

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
      options: {
        complete: false,
        ignoreExpiration: false,
        ignoreNotBefore: false,
        clockTolerance: 30,
        algorithm: 'HS256',
      },
    },
    credentials: { jwtAuth: newCredential('PV App JWT') },
  },
  output: [{ sub: '00000000-0000-4000-8000-000000000001', iss: 'portal-palm-village', aud: 'portal-palm-village-web' }],
});

const validateAppClaims = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate App Claims',
    position: [1280, 100],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const input = $input.first()?.json ?? {};\n" +
        "const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = null;\n" +
        "try { requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\n" +
        "requestId = requestId || 'events_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const expectedIssuer = 'portal-palm-village';\n" +
        "const expectedAudience = 'portal-palm-village-web';\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { claimsValid: false, request_id: requestId, timestamp: now, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "const aud = payload.aud;\n" +
        "const audienceOk = Array.isArray(aud) ? aud.includes(expectedAudience) : aud === expectedAudience;\n" +
        "if (payload.iss !== expectedIssuer || !audienceOk || !payload.sub) {\n" +
        "  return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }];\n" +
        "}\n" +
        "return [{ json: { claimsValid: true, request_id: requestId, timestamp: now, sub: payload.sub, email: payload.email ?? null, role: payload.role ?? null, unit_id: payload.unit_id ?? null, approval_status: payload.approval_status ?? null } }];",
    },
  },
  output: [{ claimsValid: true, request_id: 'events_list_sample', sub: '00000000-0000-4000-8000-000000000001' }],
});

const claimsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Claims Valid?',
    position: [1540, 100],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.claimsValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ claimsValid: true }],
});

const fetchActorProfile = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Actor Profile',
    position: [1820, -20],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'profiles',
      returnAll: false,
      limit: 1,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid', role: 'admin', approval_status: 'approved', is_active: true }],
});

const authorizeActor = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Authorize Actor',
    position: [2100, -20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const profile = $input.first()?.json ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = null;\n" +
        "try { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\n" +
        "requestId = requestId || 'events_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const minimumRole = 'warga';\n" +
        "const rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!profile.id) { return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }]; }\n" +
        "if (profile.is_active !== true) { return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }]; }\n" +
        "if (profile.approval_status !== 'approved') { return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }]; }\n" +
        "const actorRank = rank[profile.role] || 0;\n" +
        "const minimumRank = rank[minimumRole];\n" +
        "if (actorRank < minimumRank) {\n" +
        "  return [{ json: failure(403, 'FORBIDDEN_ROLE', 'Role Anda tidak memiliki akses ke endpoint ini.', { required_role: minimumRole, actor_role: profile.role ?? null }) }];\n" +
        "}\n" +
        "return [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role }, minimum_role: minimumRole } }];",
    },
  },
  output: [{ authorized: true, request_id: 'events_list_sample', actor: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid', role: 'admin' } }],
});

const actorAuthorized = ifElse({
  version: 2.3,
  config: {
    name: 'Actor Authorized?',
    position: [2380, -20],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.authorized }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ authorized: true }],
});

const fetchEvents = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Events',
    position: [2660, -120],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'events',
      returnAll: true,
      filterType: 'none',
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000010', title: 'Event Sample', event_code: 'EVT-SAMPLE', event_date: '2026-08-01T00:00:00.000Z', status: 'active' }],
});

const fetchAssignments = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Event Assignments',
    position: [2660, 120],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'event_members',
      returnAll: true,
      filterType: 'none',
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000100', event_id: '00000000-0000-4000-8000-000000000010', profile_id: '00000000-0000-4000-8000-000000000001', assignment_role: 'event_treasurer', revoked_at: null }],
});

const buildEventList = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Event List',
    position: [2940, -20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const actor = $items('Authorize Actor', 0, 0)?.[0]?.json?.actor ?? {};\n" +
        "const actorRole = actor.role || 'warga';\n" +
        "const requestId = $items('Authorize Actor', 0, 0)?.[0]?.json?.request_id || 'events_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const now = new Date().toISOString();\n" +
        "const eventRows = $items('Fetch Events', 0, 0).map((item) => item.json || {});\n" +
        "const assignmentRows = $items('Fetch Event Assignments', 0, 0).map((item) => item.json || {});\n" +
        "const includeDeleted = Boolean($items('POST /portal-v1/events/list', 0, 0)?.[0]?.json?.body?.include_deleted || $items('POST /portal-v1/events/list', 0, 0)?.[0]?.json?.body?.includeDeleted);\n" +
        "const requestedStatus = $items('POST /portal-v1/events/list', 0, 0)?.[0]?.json?.body?.status ?? null;\n" +
        "const statusFilter = Array.isArray(requestedStatus) ? requestedStatus.filter(Boolean).map(String) : requestedStatus ? [String(requestedStatus)] : [];\n" +
        "const activeAssignments = assignmentRows.filter((row) => row && row.profile_id === actor.id && !row.revoked_at);\n" +
        "const assignmentMap = new Map(activeAssignments.map((row) => [row.event_id, row]));\n" +
        "const canViewAll = actorRole === 'admin' || actorRole === 'bendahara';\n" +
        "const canManageMaster = actorRole === 'admin';\n" +
        "function normalizeEvent(event) {\n" +
        "  const id = event.id;\n" +
        "  const eventCode = event.event_code || (id ? 'EVT-' + String(id).replace(/-/g, '').toUpperCase() : null);\n" +
        "  const deletedAt = event.deleted_at ?? null;\n" +
        "  const status = event.status || 'active';\n" +
        "  const assignment = assignmentMap.get(id) || null;\n" +
        "  const assignmentRole = assignment?.assignment_role || null;\n" +
        "  const canView = canViewAll || Boolean(assignment);\n" +
        "  const canManageFinance = canViewAll || assignmentRole === 'event_treasurer';\n" +
        "  const canManageEvent = canManageMaster;\n" +
        "  return {\n" +
        "    id,\n" +
        "    event_code: eventCode,\n" +
        "    title: event.title || '',\n" +
        "    description: event.description ?? null,\n" +
        "    event_date: event.event_date ?? null,\n" +
        "    end_date: event.end_date ?? null,\n" +
        "    location: event.location ?? null,\n" +
        "    status,\n" +
        "    deleted_at: deletedAt,\n" +
        "    created_at: event.created_at ?? null,\n" +
        "    updated_at: event.updated_at ?? null,\n" +
        "    can_view: canView,\n" +
        "    can_manage_finance: canManageFinance,\n" +
        "    can_manage_event: canManageEvent,\n" +
        "    assignment_role: assignmentRole,\n" +
        "    is_assigned: Boolean(assignment),\n" +
        "  };\n" +
        "}\n" +
        "const visibleEvents = eventRows\n" +
        "  .filter((event) => event && (includeDeleted || !event.deleted_at))\n" +
        "  .filter((event) => statusFilter.length === 0 || statusFilter.includes(String(event.status || 'active')))\n" +
        "  .filter((event) => canViewAll || assignmentMap.has(event.id))\n" +
        "  .map(normalizeEvent)\n" +
        "  .sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')) || String(a.title || '').localeCompare(String(b.title || '')));\n" +
        "const response = {\n" +
        "  ok: true,\n" +
        "  data: {\n" +
        "    events: visibleEvents,\n" +
        "    access: {\n" +
        "      global: { role: actorRole, can_view_all_events: canViewAll, can_manage_master_event: canManageMaster, can_manage_general_finance: canViewAll },\n" +
        "      events: visibleEvents.map((event) => ({ event_id: event.id, can_view: event.can_view, can_manage_finance: event.can_manage_finance, can_manage_event: event.can_manage_event, assignment_role: event.assignment_role }))\n" +
        "    }\n" +
        "  },\n" +
        "  error: null,\n" +
        "  meta: { request_id: requestId, timestamp: now },\n" +
        "};\n" +
        "return [{ json: { statusCode: 200, response } }];",
    },
  },
  output: [{ statusCode: 200, response: { ok: true, data: { events: [] }, error: null, meta: { request_id: 'events_list_sample', timestamp: '2026-08-01T00:00:00.000Z' } } }],
});

const respondEvents = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Events',
    position: [3220, -20],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondAuthError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Auth Error',
    position: [1000, 280],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondClaimError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Claim Error',
    position: [1820, 200],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondForbidden = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Forbidden',
    position: [2660, 220],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

export default workflow('pv-api-events-list', 'PV API - Events List')
  .add(eventsWebhook)
  .to(extractBearerToken)
  .to(tokenPresent
    .onTrue(verifyAppJwt.to(validateAppClaims).to(claimsValid.onTrue(fetchActorProfile.to(authorizeActor).to(actorAuthorized.onTrue(fetchEvents.to(fetchAssignments.to(buildEventList).to(respondEvents))).onFalse(respondForbidden))).onFalse(respondClaimError)))
    .onFalse(respondAuthError));
