import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const responseHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/payments/cancel',
    position: [180, 300],
    parameters: {
      authentication: 'none',
      httpMethod: 'POST',
      path: 'portal-v1/payments/cancel',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
});

const extractToken = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Bearer Token',
    position: [440, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || 'payment_cancel_' + Date.now();
const authorization = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';
const match = String(authorization).match(/^Bearer\\s+(.+)$/i);
const failure = (statusCode, code, message, details = {}) => ({ statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } });
if (!match?.[1]) return [{ json: { tokenPresent: false, ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.') } }];
return [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId } }];`,
    },
  },
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [680, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tokenPresent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const verifyJwt = node({
  type: 'n8n-nodes-base.jwt',
  version: 1,
  config: {
    name: 'Verify App JWT',
    position: [920, 200],
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'verify',
      token: expr('{{ $json.token }}'),
      options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' },
    },
    credentials: { jwtAuth: newCredential('PV App JWT') },
  },
});

const validateClaims = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate App Claims',
    position: [1160, 200],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const input = $input.first()?.json ?? {};
const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;
const request = $items('Extract Bearer Token', 0, 0)?.[0]?.json ?? {};
const now = new Date().toISOString();
const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes('portal-palm-village-web') : payload.aud === 'portal-palm-village-web';
const failure = (statusCode, code, message) => ({ claimsValid: false, statusCode, response: { ok: false, data: null, error: { code, message, details: {} }, meta: { request_id: request.request_id, timestamp: now } } });
if (payload.iss !== 'portal-palm-village' || !audienceOk || !payload.sub) return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.') }];
return [{ json: { claimsValid: true, sub: payload.sub, request_id: request.request_id } }];`,
    },
  },
});

const claimsValid = ifElse({ version: 2.3, config: { name: 'Claims Valid?', position: [1400, 200], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.claimsValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const fetchActor = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Actor Profile',
    position: [1640, 100],
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const authorizeActor = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Authorize Actor',
    position: [1880, 100],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const profile = $input.first()?.json ?? {};
const claims = $items('Validate App Claims', 0, 0)?.[0]?.json ?? {};
const now = new Date().toISOString();
const failure = (statusCode, code, message, details = {}) => ({ authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: claims.request_id, timestamp: now } } });
if (!profile.id) return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.') }];
if (profile.is_active !== true) return [{ json: failure(403, 'SUSPENDED_USER', 'Akun tidak aktif. Hubungi pengurus.') }];
if (profile.approval_status !== 'approved') return [{ json: failure(403, 'FORBIDDEN', 'Akun belum dapat mengakses endpoint ini.', { approval_status: profile.approval_status ?? null }) }];
return [{ json: { authorized: true, request_id: claims.request_id, actor: { id: profile.id, email: profile.email, role: profile.role, unit_id: profile.unit_id } } }];`,
    },
  },
});

const actorAuthorized = ifElse({ version: 2.3, config: { name: 'Actor Authorized?', position: [2120, 100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.authorized }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const normalizeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Cancel Request',
    position: [2360, 20],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const webhook = $items('POST /portal-v1/payments/cancel', 0, 0)?.[0]?.json ?? {};
const auth = $items('Authorize Actor', 0, 0)?.[0]?.json ?? {};
const paymentId = String(webhook.body?.payment_id || '').trim();
const now = new Date().toISOString();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuid.test(paymentId)) return [{ json: { requestValid: false, statusCode: 400, response: { ok: false, data: null, error: { code: 'INVALID_PAYMENT_ID', message: 'payment_id wajib berupa UUID valid.', details: {} }, meta: { request_id: auth.request_id, timestamp: now } } } }];
return [{ json: { requestValid: true, payment_id: paymentId, request_id: auth.request_id, actor: auth.actor } }];`,
    },
  },
});

const requestValid = ifElse({ version: 2.3, config: { name: 'Request Valid?', position: [2600, 20], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.requestValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const fetchPayment = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Payment', position: [2840, -80], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'payments', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.payment_id }}') }] } },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchBill = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Payment Bill', position: [3080, -80], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'ipl_bills', returnAll: false, limit: 1, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.ipl_bill_id }}') }] } },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const validateCancellation = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Validate Cancellation', position: [3320, -80],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const bill = $input.first()?.json ?? {};
const payment = $items('Fetch Payment', 0, 0)?.[0]?.json ?? {};
const request = $items('Normalize Cancel Request', 0, 0)?.[0]?.json ?? {};
const actor = request.actor ?? {};
const now = new Date().toISOString();
const failure = (statusCode, code, message, details = {}) => ({ cancellationAllowed: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: request.request_id, timestamp: now } } });
if (!payment.id) return [{ json: failure(404, 'PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan.') }];
if (!bill.id) return [{ json: failure(409, 'PAYMENT_BILL_NOT_FOUND', 'Tagihan pembayaran tidak ditemukan.') }];
if (!['pending_verification', 'rejected'].includes(payment.status)) return [{ json: failure(409, 'INVALID_STATUS', 'Hanya pembayaran yang menunggu verifikasi atau ditolak yang dapat dibatalkan.', { current_status: payment.status }) }];
const isStaff = ['pengurus', 'bendahara', 'admin'].includes(actor.role);
const ownsBill = actor.unit_id != null && String(actor.unit_id) === String(bill.unit_id);
if (!isStaff && !ownsBill) return [{ json: failure(403, 'FORBIDDEN_PAYMENT', 'Anda tidak berhak membatalkan pembayaran ini.') }];
return [{ json: { cancellationAllowed: true, isPending: payment.status === 'pending_verification', payment, bill, actor, request_id: request.request_id } }];`,
    },
  },
});

const cancellationAllowed = ifElse({ version: 2.3, config: { name: 'Cancellation Allowed?', position: [3560, -80], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.cancellationAllowed }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });
const pendingPayment = ifElse({ version: 2.3, config: { name: 'Pending Payment?', position: [3800, -120], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.isPending }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const cancelPending = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Cancel Pending Payment', position: [4040, -200],
    parameters: {
      resource: 'row', operation: 'update', tableId: 'payments', filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'id', condition: 'eq', keyValue: expr("{{ $node['Validate Cancellation'].json.payment.id }}") },
        { keyName: 'status', condition: 'eq', keyValue: 'pending_verification' },
      ] },
      dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'status', fieldValue: 'cancelled' }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const cancelRejected = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Cancel Rejected Payment', position: [4040, 0],
    parameters: {
      resource: 'row', operation: 'update', tableId: 'payments', filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [
        { keyName: 'id', condition: 'eq', keyValue: expr("{{ $node['Validate Cancellation'].json.payment.id }}") },
        { keyName: 'status', condition: 'eq', keyValue: 'rejected' },
      ] },
      dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'status', fieldValue: 'cancelled' }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const validateMutation = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Validate Payment Cancellation', position: [4280, -100],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const row = $input.first()?.json ?? {};
const expected = $items('Validate Cancellation', 0, 0)?.[0]?.json ?? {};
const now = new Date().toISOString();
if (row.id === expected.payment?.id && row.status === 'cancelled') return [{ json: { mutationValid: true, ...expected } }];
return [{ json: { mutationValid: false, statusCode: 409, response: { ok: false, data: null, error: { code: 'PAYMENT_STATE_CHANGED', message: 'Status pembayaran telah berubah dan tidak dapat dibatalkan.', details: { payment_id: expected.payment?.id ?? null } }, meta: { request_id: expected.request_id, timestamp: now } } } }];`,
    },
  },
});

const mutationValid = ifElse({ version: 2.3, config: { name: 'Cancellation Mutation Valid?', position: [4520, -100], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.mutationValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } } });

const buildAudit = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Audit Log Row', position: [4760, -180],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const data = $items('Validate Cancellation', 0, 0)?.[0]?.json ?? {};
return [{ json: { audit: { actor_id: data.actor?.id ?? null, actor_email: data.actor?.email ?? null, action: 'payment.cancel', entity_type: 'payment', entity_id: data.payment?.id ?? null, metadata: { request_id: data.request_id, previous_status: data.payment?.status, bill_id: data.bill?.id, unit_id: data.bill?.unit_id } }, request_id: data.request_id, payment_id: data.payment?.id } }];`,
    },
  },
});

const insertAudit = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Insert Audit Log', position: [5000, -180],
    parameters: { resource: 'row', operation: 'create', tableId: 'audit_logs', dataToSend: 'defineBelow', fieldsUi: { fieldValues: [
      { fieldId: 'actor_id', fieldValue: expr('{{ $json.audit.actor_id }}') },
      { fieldId: 'actor_email', fieldValue: expr('{{ $json.audit.actor_email }}') },
      { fieldId: 'action', fieldValue: expr('{{ $json.audit.action }}') },
      { fieldId: 'entity_type', fieldValue: expr('{{ $json.audit.entity_type }}') },
      { fieldId: 'entity_id', fieldValue: expr('{{ $json.audit.entity_id }}') },
      { fieldId: 'metadata', fieldValue: expr('{{ $json.audit.metadata }}') },
    ] } },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const buildSuccess = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Success Response', position: [5240, -180],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const data = $items('Validate Cancellation', 0, 0)?.[0]?.json ?? {}; return [{ json: { response: { ok: true, data: { payment_id: data.payment?.id, status: 'cancelled' }, error: null, meta: { request_id: data.request_id, timestamp: new Date().toISOString() } } } }];` },
  },
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Success', position: [5480, -180], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseHeaders } } },
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Error', position: [4760, 260], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders } } },
});

export default workflow('pv-api-payments-cancel', 'PV API - Payments Cancel')
  .add(webhook)
  .to(extractToken)
  .to(tokenPresent
    .onTrue(verifyJwt
      .to(validateClaims)
      .to(claimsValid
        .onTrue(fetchActor
          .to(authorizeActor)
          .to(actorAuthorized
            .onTrue(normalizeRequest
              .to(requestValid
                .onTrue(fetchPayment
                  .to(fetchBill)
                  .to(validateCancellation)
                  .to(cancellationAllowed
                    .onTrue(pendingPayment
                      .onTrue(cancelPending.to(validateMutation
                        .to(mutationValid
                          .onTrue(buildAudit.to(insertAudit).to(buildSuccess).to(respondSuccess))
                          .onFalse(respondError))))
                      .onFalse(cancelRejected.to(validateMutation)))
                    .onFalse(respondError)))
                .onFalse(respondError)))
            .onFalse(respondError)))
        .onFalse(respondError)))
    .onFalse(respondError));
