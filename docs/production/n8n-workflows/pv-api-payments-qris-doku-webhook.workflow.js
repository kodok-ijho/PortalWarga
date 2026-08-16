import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

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
    name: 'POST /portal-v1/payments/qris/doku/webhook',
    position: [180, 300],
    parameters: {
      authentication: 'none',
      httpMethod: 'POST',
      path: 'portal-v1/payments/qris/doku/webhook',
      responseMode: 'responseNode',
      options: {
        ignoreBots: true,
      },
    },
  },
});

const buildResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build DOKU Webhook Response',
    position: [460, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || body.request_id || 'qris_doku_webhook_' + Date.now();
const reference = String(body.originalReferenceNo || body.originalPartnerReferenceNo || body.partnerReferenceNo || body.order_id || '').trim();
if (!reference) {
  return [{ json: { statusCode: 400, response: { ok: false, data: null, error: { code: 'BAD_REQUEST', message: 'Payload webhook DOKU tidak memiliki reference transaksi.' }, meta: { request_id: requestId, timestamp: now } } } }];
}
return [{ json: { statusCode: 202, response: { ok: true, data: { accepted: true, provider: 'doku', environment: 'sandbox', reference }, error: null, meta: { request_id: requestId, timestamp: now } } } }];`,
    },
  },
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond DOKU Webhook',
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

export default workflow('pv-api-payments-qris-doku-webhook', 'PV API - Payments QRIS DOKU Webhook')
  .add(webhook)
  .to(buildResponse)
  .to(respond);
