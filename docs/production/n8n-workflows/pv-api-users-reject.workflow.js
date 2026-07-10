import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const rejectWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/users/reject',
    position: [180, 360],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/users/reject',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: {}, query: {}, body: { profile_id: '00000000-0000-4000-8000-000000000000', approval_note: 'Tidak terdaftar sebagai warga.' } }],
});

const extractBearerToken = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Bearer Token',
    position: [460, 360],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const source = $input.first()?.json ?? {};\n" +
        "const body = source.body ?? {};\n" +
        "const query = source.query ?? {};\n" +
        "const headers = source.headers ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || query.request_id || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
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
  output: [{ tokenPresent: true, token: 'jwt', request_id: 'users_reject_sample', timestamp: '2026-07-09T00:00:00.000Z' }],
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [720, 360],
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
    position: [1000, 240],
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
    position: [1280, 240],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const input = $input.first()?.json ?? {};\n" +
        "const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = input.request_id || input.requestId || null;\n" +
        "try { requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || requestId; } catch (error) {}\n" +
        "requestId = requestId || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
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
  output: [{ claimsValid: true, request_id: 'users_reject_sample', sub: '00000000-0000-4000-8000-000000000001' }],
});

const claimsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Claims Valid?',
    position: [1540, 240],
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
    position: [1820, 120],
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
    position: [2100, 120],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const profile = $input.first()?.json ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "let requestId = null;\n" +
        "try { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}\n" +
        "requestId = requestId || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const minimumRole = 'pengurus';\n" +
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
  output: [{ authorized: true, request_id: 'users_reject_sample', actor: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid', role: 'admin' } }],
});

const actorAuthorized = ifElse({
  version: 2.3,
  config: {
    name: 'Actor Authorized?',
    position: [2380, 120],
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

const normalizeRejectRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Reject Request',
    position: [2660, 20],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const auth = $input.first()?.json ?? {};\n" +
        "let webhook = {};\n" +
        "try { webhook = $items('POST /portal-v1/users/reject', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\n" +
        "const body = webhook.body ?? {};\n" +
        "const headers = webhook.headers ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = auth.request_id || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const actor = auth.actor ?? {};\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { requestValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "const profileId = String(body.profile_id ?? body.profileId ?? '').trim();\n" +
        "const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\n" +
        "if (!uuidPattern.test(profileId)) {\n" +
        "  return [{ json: failure(400, 'INVALID_PROFILE_ID', 'profile_id wajib berupa UUID yang valid.', {}) }];\n" +
        "}\n" +
        "const rawNote = body.approval_note ?? body.approvalNote ?? '';\n" +
        "const approvalNote = String(rawNote ?? '').trim().slice(0, 500);\n" +
        "if (!approvalNote) {\n" +
        "  return [{ json: failure(400, 'REJECTION_NOTE_REQUIRED', 'Alasan penolakan wajib diisi.', {}) }];\n" +
        "}\n" +
        "const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || headers['cf-connecting-ip'] || headers['CF-Connecting-IP'] || '';\n" +
        "const firstIp = String(forwardedFor).split(',')[0].trim();\n" +
        "const ipAddress = /^[0-9a-fA-F:.]+$/.test(firstIp) && firstIp.length > 0 ? firstIp : null;\n" +
        "const userAgent = headers['user-agent'] || headers['User-Agent'] || null;\n" +
        "return [{ json: { requestValid: true, request_id: requestId, timestamp: now, actor, profile_id: profileId, approval_note: approvalNote, ip_address: ipAddress, user_agent: userAgent } }];",
    },
  },
  output: [{ requestValid: true, request_id: 'users_reject_sample', profile_id: '00000000-0000-4000-8000-000000000002', approval_note: 'Tidak terdaftar sebagai warga.' }],
});

const requestValid = ifElse({
  version: 2.3,
  config: {
    name: 'Request Valid?',
    position: [2940, 20],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.requestValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ requestValid: true }],
});

const fetchTargetProfile = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Target Profile',
    position: [3220, -80],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'profiles',
      returnAll: false,
      limit: 1,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.profile_id }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000002', email: 'pending@example.invalid', full_name: 'Pending User', role: 'warga', unit_id: null, approval_status: 'pending_approval', is_active: true }],
});

const validateTargetProfile = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate Target Profile',
    position: [3500, -80],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const target = $input.first()?.json ?? {};\n" +
        "let req = {};\n" +
        "try { req = $items('Normalize Reject Request', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = req.request_id || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "function failure(statusCode, code, message, details = {}) {\n" +
        "  return { targetValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };\n" +
        "}\n" +
        "if (!target.id) {\n" +
        "  return [{ json: failure(404, 'PROFILE_NOT_FOUND', 'Profile yang akan ditolak tidak ditemukan.', {}) }];\n" +
        "}\n" +
        "if (target.id === req.actor?.id) {\n" +
        "  return [{ json: failure(400, 'SELF_REJECTION_NOT_ALLOWED', 'Tidak bisa menolak akun sendiri melalui endpoint ini.', {}) }];\n" +
        "}\n" +
        "if (target.approval_status !== 'pending_approval') {\n" +
        "  return [{ json: failure(409, 'PROFILE_NOT_PENDING', 'Profile ini tidak berada dalam status menunggu approval.', { approval_status: target.approval_status ?? null }) }];\n" +
        "}\n" +
        "if (target.is_active !== true) {\n" +
        "  return [{ json: failure(409, 'TARGET_INACTIVE', 'Profile target sedang tidak aktif.', {}) }];\n" +
        "}\n" +
        "return [{ json: { ...req, targetValid: true, timestamp: now, target_before: { id: target.id, email: target.email, full_name: target.full_name, avatar_url: target.avatar_url ?? null, phone: target.phone ?? null, role: target.role, unit_id: target.unit_id ?? null, approval_status: target.approval_status, is_active: target.is_active, approved_by: target.approved_by ?? null, approved_at: target.approved_at ?? null, rejected_by: target.rejected_by ?? null, rejected_at: target.rejected_at ?? null, created_at: target.created_at ?? null }, update: { approval_status: 'rejected', rejected_by: req.actor?.id ?? null, rejected_at: now, approval_note: req.approval_note } } }];",
    },
  },
  output: [{ targetValid: true, request_id: 'users_reject_sample', profile_id: '00000000-0000-4000-8000-000000000002', update: { approval_status: 'rejected', rejected_by: '00000000-0000-4000-8000-000000000001', rejected_at: '2026-07-09T00:00:00.000Z', approval_note: 'Tidak terdaftar sebagai warga.' } }],
});

const targetValid = ifElse({
  version: 2.3,
  config: {
    name: 'Target Valid?',
    position: [3780, -80],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.targetValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ targetValid: true }],
});

const updateTargetProfile = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Update Target Profile',
    position: [4060, -180],
    parameters: {
      resource: 'row',
      operation: 'update',
      tableId: 'profiles',
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.profile_id }}') }] },
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'approval_status', fieldValue: 'rejected' },
          { fieldId: 'rejected_by', fieldValue: expr('{{ $json.actor.id }}') },
          { fieldId: 'rejected_at', fieldValue: expr('{{ $json.update.rejected_at }}') },
          { fieldId: 'approved_by', fieldValue: expr('{{ null }}') },
          { fieldId: 'approved_at', fieldValue: expr('{{ null }}') },
          { fieldId: 'approval_note', fieldValue: expr('{{ $json.approval_note }}') },
          { fieldId: 'updated_at', fieldValue: expr('{{ $json.update.rejected_at }}') },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000002', email: 'pending@example.invalid', full_name: 'Pending User', role: 'warga', unit_id: null, approval_status: 'rejected', is_active: true, rejected_by: '00000000-0000-4000-8000-000000000001', rejected_at: '2026-07-09T00:00:00.000Z' }],
});

const buildAuditRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Audit Row',
    position: [4340, -180],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const updated = $input.first()?.json ?? {};\n" +
        "let context = {};\n" +
        "try { context = $items('Validate Target Profile', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = context.request_id || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "const rejectedUser = {\n" +
        "  id: updated.id || context.profile_id,\n" +
        "  email: updated.email || context.target_before?.email || null,\n" +
        "  full_name: updated.full_name || context.target_before?.full_name || null,\n" +
        "  avatar_url: updated.avatar_url ?? context.target_before?.avatar_url ?? null,\n" +
        "  phone: updated.phone ?? context.target_before?.phone ?? null,\n" +
        "  role: updated.role || context.target_before?.role || null,\n" +
        "  unit_id: updated.unit_id ?? context.target_before?.unit_id ?? null,\n" +
        "  approval_status: updated.approval_status || 'rejected',\n" +
        "  is_active: updated.is_active ?? context.target_before?.is_active ?? true,\n" +
        "  rejected_by: updated.rejected_by || context.actor?.id || null,\n" +
        "  rejected_at: updated.rejected_at || context.update?.rejected_at || null\n" +
        "};\n" +
        "const metadata = {\n" +
        "  request_id: requestId,\n" +
        "  target_email: rejectedUser.email,\n" +
        "  previous: { role: context.target_before?.role ?? null, unit_id: context.target_before?.unit_id ?? null, approval_status: context.target_before?.approval_status ?? null, approved_by: context.target_before?.approved_by ?? null, approved_at: context.target_before?.approved_at ?? null },\n" +
        "  rejected: { approval_status: rejectedUser.approval_status, rejected_by: rejectedUser.rejected_by, rejected_at: rejectedUser.rejected_at },\n" +
        "  approval_note: context.approval_note || null\n" +
        "};\n" +
        "return [{ json: { request_id: requestId, timestamp: now, rejected_user: rejectedUser, actor: context.actor, audit: { actor_id: context.actor?.id ?? null, actor_email: context.actor?.email ?? null, action: 'user.reject', entity_type: 'profile', entity_id: rejectedUser.id, metadata, ip_address: context.ip_address ?? null, user_agent: context.user_agent ?? null } } }];",
    },
  },
  output: [{ request_id: 'users_reject_sample', rejected_user: { id: '00000000-0000-4000-8000-000000000002', approval_status: 'rejected' }, audit: { action: 'user.reject', entity_type: 'profile' } }],
});

const insertAuditLog = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Insert Audit Log',
    position: [4620, -180],
    parameters: {
      resource: 'row',
      operation: 'create',
      tableId: 'audit_logs',
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'actor_id', fieldValue: expr('{{ $json.audit.actor_id }}') },
          { fieldId: 'actor_email', fieldValue: expr('{{ $json.audit.actor_email }}') },
          { fieldId: 'action', fieldValue: 'user.reject' },
          { fieldId: 'entity_type', fieldValue: 'profile' },
          { fieldId: 'entity_id', fieldValue: expr('{{ $json.audit.entity_id }}') },
          { fieldId: 'metadata', fieldValue: expr('{{ $json.audit.metadata }}') },
          { fieldId: 'ip_address', fieldValue: expr('{{ $json.audit.ip_address }}') },
          { fieldId: 'user_agent', fieldValue: expr('{{ $json.audit.user_agent }}') },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000099', action: 'user.reject' }],
});

const buildRejectResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Reject Response',
    position: [4900, -180],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "let context = {};\n" +
        "try { context = $items('Build Audit Row', 0, 0)?.[0]?.json ?? {}; } catch (error) {}\n" +
        "const audit = $input.first()?.json ?? {};\n" +
        "const now = new Date().toISOString();\n" +
        "const requestId = context.request_id || 'users_reject_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);\n" +
        "return [{ json: { statusCode: 200, response: { ok: true, data: { user: context.rejected_user, audit_id: audit.id ?? null }, error: null, meta: { request_id: requestId, timestamp: now } } } }];",
    },
  },
  output: [{ statusCode: 200, response: { ok: true, data: { user: { id: '00000000-0000-4000-8000-000000000002', approval_status: 'rejected' }, audit_id: '00000000-0000-4000-8000-000000000099' }, error: null, meta: { request_id: 'users_reject_sample', timestamp: '2026-07-09T00:00:00.000Z' } } }],
});

const respondRejectSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Reject Success',
    position: [5180, -180],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondTargetError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Target Error',
    position: [4060, 80],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

const respondRequestError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Request Error',
    position: [3220, 160],
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
    position: [2660, 260],
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
    position: [1820, 380],
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
    position: [1000, 540],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders },
    },
  },
});

export default workflow('pv-api-users-reject', 'PV API - Users Reject')
  .add(rejectWebhook)
  .to(extractBearerToken)
  .to(tokenPresent
    .onTrue(verifyAppJwt.to(validateAppClaims).to(claimsValid
      .onTrue(fetchActorProfile.to(authorizeActor).to(actorAuthorized
        .onTrue(normalizeRejectRequest.to(requestValid
          .onTrue(fetchTargetProfile.to(validateTargetProfile).to(targetValid
            .onTrue(updateTargetProfile.to(buildAuditRow).to(insertAuditLog).to(buildRejectResponse).to(respondRejectSuccess))
            .onFalse(respondTargetError)))
          .onFalse(respondRequestError)))
        .onFalse(respondForbidden)))
      .onFalse(respondClaimError)))
    .onFalse(respondAuthError));
