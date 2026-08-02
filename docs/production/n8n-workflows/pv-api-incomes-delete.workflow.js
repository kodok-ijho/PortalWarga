import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const incomesDeleteWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/incomes/delete',
    position: [180, 220],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/incomes/delete',
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
        "const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'incomes_delete_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const authHeader = headers.authorization || headers.Authorization || '';\n" +
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
        "requestId = requestId || 'incomes_delete_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
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
        "requestId = requestId || 'incomes_delete_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const minimumRole = 'warga';\n" +
        "const rank = { warga: 10, pengurus: 20, bendahara: 30, admin: 40 };\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!profile.id) { return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }]; }\n" +
        "if (profile.is_active !== true) { return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }]; }\n" +
        "if (profile.approval_status !== 'approved') { return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }]; }\n" +
        "return [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role } } }];",
    },
  },
  output: [{ authorized: true, request_id: 'sample', actor: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid', role: 'admin' } }],
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

const fetchIncome = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Income',
    position: [2660, -20],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'non_ipl_incomes',
      returnAll: false,
      limit: 1,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $items("Extract Bearer Token", 0, 0)[0].json.payload.income_id }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000020', scope: 'event', event_id: '00000000-0000-4000-8000-000000000010' }],
});

const fetchAssignments = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Assignments',
    position: [2660, 160],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'event_members',
      returnAll: true,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'profile_id', condition: 'eq', keyValue: expr('{{ $items("Authorize Actor", 0, 0)[0].json.actor.id }}') },
        { keyName: 'revoked_at', condition: 'is.empty', keyValue: '' }
      ] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000100', event_id: '00000000-0000-4000-8000-000000000010', assignment_role: 'event_treasurer' }],
});

const validateAccess = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate Access',
    position: [2940, 60],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const actor = $items('Authorize Actor', 0, 0)?.[0]?.json?.actor ?? {};\n" +
        "const requestId = $items('Authorize Actor', 0, 0)?.[0]?.json?.request_id || 'incomes_delete_' + Date.now();\n" +
        "const now = new Date().toISOString();\n" +
        "const payload = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.payload ?? {};\n" +
        "const income = $items('Fetch Income', 0, 0)?.[0]?.json ?? null;\n" +
        "const assignments = $items('Fetch Assignments', 0, 0).map((item) => item.json || {});\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { isValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!payload.income_id) return [{ json: failure(400, 'VALIDATION_ERROR', 'Income ID wajib diisi.') }];\n" +
        "if (!income || !income.id) return [{ json: failure(404, 'NOT_FOUND', 'Income tidak ditemukan.') }];\n" +
        "if (income.deleted_at) return [{ json: failure(400, 'ALREADY_DELETED', 'Income sudah dihapus.') }];\n" +
        "const canManageGeneral = actor.role === 'admin' || actor.role === 'bendahara';\n" +
        "if (income.scope === 'general') {\n" +
        "  if (!canManageGeneral) return [{ json: failure(403, 'FORBIDDEN', 'Anda tidak berhak menghapus income general.') }];\n" +
        "} else if (income.scope === 'event') {\n" +
        "  if (!canManageGeneral) {\n" +
        "    const assignment = assignments.find(a => a.event_id === income.event_id && a.assignment_role === 'event_treasurer');\n" +
        "    if (!assignment) return [{ json: failure(403, 'FORBIDDEN', 'Anda tidak berhak menghapus income event ini.') }];\n" +
        "  }\n" +
        "}\n" +
        "return [{ json: { isValid: true, request_id: requestId, timestamp: now, incomeId: income.id, actor, income } }];",
    },
  },
  output: [{ isValid: true, request_id: 'sample', timestamp: '2026-08-01T00:00:00.000Z', incomeId: '0000', actor: {}, income: {} }],
});

const accessValid = ifElse({
  version: 2.3,
  config: {
    name: 'Access Valid?',
    position: [3220, 60],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.isValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ isValid: true }],
});

const softDeleteIncome = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Soft Delete Income',
    position: [3500, -20],
    parameters: {
      resource: 'row',
      operation: 'update',
      tableId: 'non_ipl_incomes',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.incomeId }}') }] },
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'deleted_at', fieldValue: expr('{{ $json.timestamp }}') },
          { fieldId: 'deleted_by', fieldValue: expr('{{ $json.actor.id }}') },
        ]
      }
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const auditLog = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Audit Log',
    position: [3780, -20],
    parameters: {
      resource: 'row',
      operation: 'insert',
      tableId: 'audit_logs',
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'actor_id', fieldValue: expr('{{ $items("Validate Access", 0, 0)[0].json.actor.id }}') },
          { fieldId: 'action', fieldValue: 'income.delete' },
          { fieldId: 'entity_type', fieldValue: 'non_ipl_incomes' },
          { fieldId: 'entity_id', fieldValue: expr('{{ $items("Validate Access", 0, 0)[0].json.incomeId }}') },
          { fieldId: 'metadata', fieldValue: expr('{{ JSON.stringify({ before: $items("Validate Access", 0, 0)[0].json.income }) }}') },
        ]
      }
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const buildResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Response',
    position: [4060, -20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const requestId = $items('Validate Access', 0, 0)?.[0]?.json?.request_id;\n" +
        "const timestamp = $items('Validate Access', 0, 0)?.[0]?.json?.timestamp;\n" +
        "const incomeId = $items('Validate Access', 0, 0)?.[0]?.json?.incomeId;\n" +
        "const response = {\n" +
        "  ok: true,\n" +
        "  data: { income: { id: incomeId, deleted_at: timestamp } },\n" +
        "  error: null,\n" +
        "  meta: { request_id: requestId, timestamp },\n" +
        "};\n" +
        "return [{ json: { statusCode: 200, response } }];",
    },
  },
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Success',
    position: [4340, -20],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondValidationError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Validation Error',
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
    position: [2660, 280],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

export default workflow('pv-api-incomes-delete', 'PV API - Incomes Delete')
  .add(incomesDeleteWebhook)
  .to(extractBearerToken)
  .to(tokenPresent
    .onTrue(verifyAppJwt.to(validateAppClaims).to(claimsValid.onTrue(fetchActorProfile.to(authorizeActor).to(actorAuthorized.onTrue(fetchIncome.to(fetchAssignments.to(validateAccess.to(accessValid.onTrue(softDeleteIncome.to(auditLog.to(buildResponse.to(respondSuccess)))).onFalse(respondValidationError))))).onFalse(respondForbidden))).onFalse(respondClaimError)))
    .onFalse(respondAuthError));
