import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

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
    name: 'POST /portal-v1/payments/qris/doku/status',
    position: [180, 300],
    parameters: {
      authentication: 'none',
      httpMethod: 'POST',
      path: 'portal-v1/payments/qris/doku/status',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
});

const buildResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build DOKU Status Response',
    position: [460, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || 'qris_doku_status_' + Date.now();
const parentOrderId = String(body.parent_order_id || body.order_id || '').trim();
if (!parentOrderId) {
  return [{ json: { statusCode: 400, response: { ok: false, data: null, error: { code: 'BAD_REQUEST', message: 'parent_order_id atau order_id wajib diisi.' }, meta: { request_id: requestId, timestamp: now } } } }];
}
return [{ json: { statusCode: 503, response: { ok: false, data: null, error: { code: 'DOKU_CONFIG_MISSING', message: 'Konfigurasi DOKU QRIS sandbox belum lengkap. Tambahkan credential DOKU di n8n sebelum workflow memverifikasi transaksi.', details: { provider: 'doku', environment: 'sandbox', parent_order_id: parentOrderId } }, meta: { request_id: requestId, timestamp: now } } } }];`,
    },
  },
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond DOKU Status',
    position: [720, 300],
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

export default workflow('pv-api-payments-qris-doku-status', 'PV API - Payments QRIS Status DOKU Sandbox')
  .add(webhook)
  .to(buildResponse)
  .to(respond);
