import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const reportWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/reports/event-finance',
    position: [180, 220],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/reports/event-finance',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: {}, query: {}, body: {} }],
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
        "const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'reports_event_finance_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const authHeader = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';\n" +
        "const match = String(authHeader).match(/^Bearer\\s+(.+)$/i);\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!match || !match[1]) {\n" +
        "  return [{ json: { tokenPresent: false, request_id: requestId, timestamp: now, ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.', {}) } }];\n" +
        "}\n" +
        "return [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId, timestamp: now, payload: body } }];",
    },
  },
  output: [{ tokenPresent: true, token: 'jwt', request_id: 'sample', timestamp: '2026-08-01T00:00:00.000Z', payload: {} }],
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
        "requestId = requestId || 'reports_event_finance_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
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
  output: [{ claimsValid: true, request_id: 'sample', sub: '00000000-0000-4000-8000-000000000001' }],
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
        "requestId = requestId || 'reports_event_finance_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const payload = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.payload ?? {};\n" +
        "const minimumRole = 'warga';\n" +
        "const rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!profile.id) { return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }]; }\n" +
        "if (profile.is_active !== true) { return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }]; }\n" +
        "if (profile.approval_status !== 'approved') { return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }]; }\n" +
        "if (!payload.event_id) { return [{ json: failure(400, 'VALIDATION_ERROR', 'Event ID wajib diisi.', {}) }]; }\n" +
        "return [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role }, eventId: payload.event_id, payload } }];",
    },
  },
  output: [{ authorized: true, request_id: 'sample', actor: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid', role: 'admin' }, eventId: '0000', payload: {} }],
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

const fetchEvent = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Event',
    position: [2660, -120],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'events',
      returnAll: false,
      limit: 1,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.eventId }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000010', title: 'Event Sample' }],
});

const fetchAssignments = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Assignments',
    position: [2660, 40],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'event_members',
      returnAll: true,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'event_id', condition: 'eq', keyValue: expr('{{ $items("Authorize Actor", 0, 0)[0].json.eventId }}') },
        { keyName: 'profile_id', condition: 'eq', keyValue: expr('{{ $items("Authorize Actor", 0, 0)[0].json.actor.id }}') },
        { keyName: 'revoked_at', condition: 'is.empty', keyValue: '' }
      ] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000100', event_id: '00000000-0000-4000-8000-000000000010', assignment_role: 'event_treasurer' }],
});

const fetchIncomes = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Incomes',
    position: [2660, 200],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'non_ipl_incomes',
      returnAll: true,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'event_id', condition: 'eq', keyValue: expr('{{ $items("Authorize Actor", 0, 0)[0].json.eventId }}') },
        { keyName: 'scope', condition: 'eq', keyValue: 'event' },
        { keyName: 'deleted_at', condition: 'is.empty', keyValue: '' }
      ] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000020', scope: 'event', amount: 1500000, income_date: '2026-08-01' }],
});

const fetchExpenses = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Expenses',
    position: [2660, 360],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'expenses',
      returnAll: true,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'event_id', condition: 'eq', keyValue: expr('{{ $items("Authorize Actor", 0, 0)[0].json.eventId }}') },
        { keyName: 'scope', condition: 'eq', keyValue: 'event' },
        { keyName: 'deleted_at', condition: 'is.empty', keyValue: '' }
      ] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000030', scope: 'event', amount: 800000, expense_date: '2026-08-01' }],
});

const buildReportResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Report Response',
    position: [2940, -20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const actor = $items('Authorize Actor', 0, 0)?.[0]?.json?.actor ?? {};\n" +
        "const payload = $items('Authorize Actor', 0, 0)?.[0]?.json?.payload ?? {};\n" +
        "const requestId = $items('Authorize Actor', 0, 0)?.[0]?.json?.request_id || 'reports_event_finance_' + Date.now();\n" +
        "const now = new Date().toISOString();\n" +
        "const event = $items('Fetch Event', 0, 0)?.[0]?.json ?? null;\n" +
        "const assignments = $items('Fetch Assignments', 0, 0).map(i => i.json || {});\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { ok: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!event || !event.id || event.deleted_at) {\n" +
        "  return [{ json: failure(404, 'NOT_FOUND', 'Event tidak ditemukan.') }];\n" +
        "}\n" +
        "const canManageGeneral = actor.role === 'admin' || actor.role === 'bendahara';\n" +
        "if (!canManageGeneral) {\n" +
        "  const hasAccess = assignments.some(a => a.assignment_role === 'event_treasurer' || a.assignment_role === 'coordinator_member');\n" +
        "  if (!hasAccess) {\n" +
        "    return [{ json: failure(403, 'FORBIDDEN', 'Anda tidak berhak melihat laporan keuangan event ini.') }];\n" +
        "  }\n" +
        "}\n" +
        "const incomes = $items('Fetch Incomes', 0, 0).map(i => i.json || {}).filter(i => i.id);\n" +
        "const expenses = $items('Fetch Expenses', 0, 0).map(i => i.json || {}).filter(i => i.id);\n" +
        "const filterFrom = payload.from ? new Date(payload.from) : null;\n" +
        "const filterTo = payload.to ? new Date(payload.to) : null;\n" +
        "const filterCategory = payload.category;\n" +
        "const filteredIncomes = incomes.filter(i => {\n" +
        "  if (filterCategory && i.category !== filterCategory) return false;\n" +
        "  const d = new Date(i.income_date);\n" +
        "  if (filterFrom && d < filterFrom) return false;\n" +
        "  if (filterTo && d > filterTo) return false;\n" +
        "  return true;\n" +
        "});\n" +
        "const filteredExpenses = expenses.filter(e => {\n" +
        "  if (filterCategory && e.category !== filterCategory) return false;\n" +
        "  const d = new Date(e.expense_date);\n" +
        "  if (filterFrom && d < filterFrom) return false;\n" +
        "  if (filterTo && d > filterTo) return false;\n" +
        "  return true;\n" +
        "});\n" +
        "let totalIncome = 0;\n" +
        "filteredIncomes.forEach(i => totalIncome += Number(i.amount || 0));\n" +
        "let totalExpense = 0;\n" +
        "filteredExpenses.forEach(e => totalExpense += Number(e.amount || 0));\n" +
        "const response = {\n" +
        "  ok: true,\n" +
        "  data: {\n" +
        "    report: {\n" +
        "      event: event,\n" +
        "      totalIncome,\n" +
        "      totalExpense,\n" +
        "      net: totalIncome - totalExpense,\n" +
        "      transactionCount: filteredIncomes.length + filteredExpenses.length,\n" +
        "      incomes: filteredIncomes.sort((a,b) => new Date(b.income_date) - new Date(a.income_date)),\n" +
        "      expenses: filteredExpenses.sort((a,b) => new Date(b.expense_date) - new Date(a.expense_date))\n" +
        "    }\n" +
        "  },\n" +
        "  error: null,\n" +
        "  meta: { request_id: requestId, timestamp: now },\n" +
        "};\n" +
        "return [{ json: { ok: true, statusCode: 200, response } }];",
    },
  },
  output: [{ ok: true, statusCode: 200, response: { ok: true, data: { report: {} }, error: null, meta: { request_id: 'sample', timestamp: '2026-08-01T00:00:00.000Z' } } }],
});

const reportValid = ifElse({
  version: 2.3,
  config: {
    name: 'Report Valid?',
    position: [3220, -20],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ ok: true }],
});

const respondReport = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Report',
    position: [3500, -20],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondReportError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Report Error',
    position: [3500, 160],
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
    position: [2660, 520],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

export default workflow('pv-api-reports-event-finance', 'PV API - Reports Event Finance')
  .add(reportWebhook)
  .to(extractBearerToken)
  .to(tokenPresent
    .onTrue(verifyAppJwt.to(validateAppClaims).to(claimsValid.onTrue(fetchActorProfile.to(authorizeActor).to(actorAuthorized.onTrue(fetchEvent.to(fetchAssignments.to(fetchIncomes.to(fetchExpenses.to(buildReportResponse.to(reportValid.onTrue(respondReport).onFalse(respondReportError))))))).onFalse(respondForbidden))).onFalse(respondClaimError)))
    .onFalse(respondAuthError));
