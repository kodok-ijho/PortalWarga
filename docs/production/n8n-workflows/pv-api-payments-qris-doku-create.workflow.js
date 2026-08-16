import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const responseHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
    { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
  ],
};

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/payments/qris/doku/create',
    position: [180, 300],
    parameters: {
      authentication: 'none',
      httpMethod: 'POST',
      path: 'portal-v1/payments/qris/doku/create',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
});

const validateRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate DOKU Create Request',
    position: [460, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || 'qris_doku_create_' + Date.now();
const billIds = Array.isArray(body.bill_ids) ? body.bill_ids.map((id) => String(id).trim()).filter(Boolean) : [];
function response(statusCode, code, message, details = {}) {
  return { valid: false, statusCode, response: { ok: false, data: null, error: { code, message, details }, meta: { request_id: requestId, timestamp: now } } };
}
if (!billIds.length) {
  return [{ json: response(400, 'BAD_REQUEST', 'Kolom bill_ids wajib diisi untuk membuat QRIS DOKU.') }];
}
return [{ json: response(503, 'DOKU_CONFIG_MISSING', 'Konfigurasi DOKU QRIS sandbox belum lengkap. Tambahkan credential DOKU di n8n sebelum workflow menulis transaksi.', { provider: 'doku', environment: 'sandbox' }) }];`,
    },
  },
});

const requestAccepted = ifElse({
  version: 2.3,
  config: {
    name: 'Request Accepted?',
    position: [720, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond DOKU Create',
    position: [980, 420],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: {
        responseCode: expr('{{ $json.statusCode }}'),
        responseHeaders,
      },
    },
  },
});

export default workflow('pv-api-payments-qris-doku-create', 'PV API - Payments QRIS Create DOKU Sandbox')
  .add(webhook)
  .to(validateRequest)
  .to(requestAccepted
    .onTrue(respond)
    .onFalse(respond));
