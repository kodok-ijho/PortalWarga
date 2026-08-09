import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const logsWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/logs/list',
    position: [220, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/logs/list',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: {}, query: {}, body: { limit: 100, offset: 0 } }],
});

const extractBearerToken = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Bearer Token',
    position: [500, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const source = $input.first()?.json ?? {};\n" +
        "const body = source.body ?? {};\n" +
        "const query = source.query ?? {};\n" +
        "const headers = source.headers ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'logs_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const authHeader = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';\n" +
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
  output: [{ tokenPresent: true, token: 'jwt', request_id: 'logs_list_sample' }],
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [760, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
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
    position: [1040, 220],
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'verify',
      token: expr('{{ $json.token }}'),
      options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' },
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
    position: [1310, 220],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const input = $input.first()?.json ?? {};\n" +
        "const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = null;\n" +
        "try { requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\n" +
        "requestId = requestId || 'logs_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { claimsValid: false, request_id: requestId, timestamp: now, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes('portal-palm-village-web') : payload.aud === 'portal-palm-village-web';\n" +
        "if (payload.iss !== 'portal-palm-village' || !audienceOk || !payload.sub) {\n" +
        "  return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }];\n" +
        "}\n" +
        "return [{ json: { claimsValid: true, request_id: requestId, timestamp: now, sub: payload.sub, email: payload.email ?? null, role: payload.role ?? null, unit_id: payload.unit_id ?? null, approval_status: payload.approval_status ?? null } }];",
    },
  },
  output: [{ claimsValid: true, sub: '00000000-0000-4000-8000-000000000001', request_id: 'logs_list_sample' }],
});

const claimsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Claims Valid?',
    position: [1580, 220],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
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
    position: [1860, 120],
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
    position: [2140, 120],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const profile = $input.first()?.json ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = null;\n" +
        "try { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\n" +
        "requestId = requestId || 'logs_list_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!profile.id) return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.', {}) }];\n" +
        "if (profile.is_active !== true) return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.', {}) }];\n" +
        "if (profile.approval_status !== 'approved') return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }];\n" +
        "if (profile.role !== 'admin') return [{ json: failure(403, 'FORBIDDEN_ROLE', 'Hanya administrator yang dapat melihat sistem log keamanan.', { required_role: 'admin', actor_role: profile.role ?? null }) }];\n" +
        "return [{ json: { authorized: true, request_id: requestId, timestamp: now, actor: { id: profile.id, email: profile.email, role: profile.role } } }];",
    },
  },
  output: [{ authorized: true, request_id: 'logs_list_sample', actor: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' } }],
});

const actorAuthorized = ifElse({
  version: 2.3,
  config: {
    name: 'Actor Authorized?',
    position: [2420, 120],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.authorized }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ authorized: true }],
});

const prepareLogsQuery = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Logs Query',
    position: [2700, 20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const body = $items('POST /portal-v1/logs/list', 0, 0)?.[0]?.json?.body ?? {};\n" +
        "const auth = $input.first()?.json ?? {};\n" +
        "const requestId = auth.request_id || 'logs_list_' + Date.now();\n" +
        "const timestamp = auth.timestamp || new Date().toISOString();\n" +
        "function textOrNull(value) { const text = String(value ?? '').trim(); return text || null; }\n" +
        "function dateOrNull(value) { const text = textOrNull(value); if (!text) return null; const millis = Date.parse(text); return Number.isFinite(millis) ? new Date(millis).toISOString() : null; }\n" +
        "function boundedInteger(value, fallback, minimum, maximum) { const number = Number.parseInt(value, 10); if (!Number.isFinite(number)) return fallback; return Math.max(minimum, Math.min(number, maximum)); }\n" +
        "return [{ json: { request_id: requestId, timestamp, rpc_body: { p_action: textOrNull(body.action), p_search: textOrNull(body.search), p_date_from: dateOrNull(body.date_from), p_date_to: dateOrNull(body.date_to), p_limit: boundedInteger(body.limit, 100, 1, 500), p_offset: boundedInteger(body.offset, 0, 0, 1000000) } } }];",
    },
  },
  output: [{ request_id: 'logs_list_sample', rpc_body: { p_limit: 100, p_offset: 0 } }],
});

const queryPaginatedLogs = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Query Paginated Audit Logs',
    position: [2980, 20],
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 250,
    parameters: {
      method: 'POST',
      url: 'https://mzjgliclzihrdjaqzmqg.supabase.co/rest/v1/rpc/admin_list_audit_logs_v1',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ $json.rpc_body }}'),
      options: {
        timeout: 10000,
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ statusCode: 200, body: { logs: [], total_count: 0 } }],
});

const buildLogsResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Logs Response',
    position: [3260, 20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const http = $input.first()?.json ?? {};\n" +
        "let context = {};\n" +
        "try { context = $items('Prepare Logs Query', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\n" +
        "const requestId = context.request_id || 'logs_list_' + Date.now();\n" +
        "const timestamp = new Date().toISOString();\n" +
        "const status = Number(http.statusCode || 200);\n" +
        "const payload = http.body && typeof http.body === 'object' ? http.body : http;\n" +
        "if (status < 200 || status >= 300 || http.error) {\n" +
        "  return [{ json: { statusCode: 502, response: { ok: false, data: null, error: { code: 'UPSTREAM_ERROR', message: 'Gagal mengambil sistem log. Silakan coba lagi.', details: { upstream_status: status >= 400 ? status : null } }, meta: { request_id: requestId, timestamp } } } }];\n" +
        "}\n" +
        "const logs = Array.isArray(payload.logs) ? payload.logs : [];\n" +
        "const totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : logs.length;\n" +
        "return [{ json: { statusCode: 200, response: { ok: true, data: { logs, total_count: totalCount }, error: null, meta: { request_id: requestId, timestamp } } } }];",
    },
  },
  output: [{ statusCode: 200, response: { ok: true, data: { logs: [], total_count: 0 }, error: null } }],
});

const respondLogs = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Logs',
    position: [3540, 20],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondUnauthorizedToken = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized Token',
    position: [1040, 380],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondInvalidClaims = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Invalid Claims',
    position: [1860, 300],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondUnauthorizedActor = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized Actor',
    position: [2700, 220],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

export default workflow('pv-api-logs-list', 'PV API - Logs List')
  .add(logsWebhook)
  .to(extractBearerToken)
  .to(tokenPresent
    .onTrue(verifyAppJwt.to(validateAppClaims).to(claimsValid
      .onTrue(fetchActorProfile.to(authorizeActor).to(actorAuthorized
        .onTrue(prepareLogsQuery.to(queryPaginatedLogs).to(buildLogsResponse).to(respondLogs))
        .onFalse(respondUnauthorizedActor)))
      .onFalse(respondInvalidClaims)))
    .onFalse(respondUnauthorizedToken));
