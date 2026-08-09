import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
    { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
    { name: 'Vary', value: 'Origin' },
  ],
};

const statusWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/payments/qris/status',
    position: [180, 300],
    parameters: {
      authentication: 'none',
      httpMethod: 'POST',
      path: 'portal-v1/payments/qris/status',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
});

const normalizeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Request',
    position: [460, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const body = source.body ?? {};
const headers = source.headers ?? {};
const parentOrderId = String(body.parent_order_id || '').trim();
const valid = /^PV-QRIS-[0-9]+-[0-9]+-[a-z0-9]+$/i.test(parentOrderId);
const authorization = headers['x-portal-authorization'] || headers['X-Portal-Authorization'] || headers.authorization || headers.Authorization || '';
const match = String(authorization).match(/^Bearer\s+(.+)$/i);
return [{ json: { valid, parent_order_id: parentOrderId, tokenPresent: Boolean(match?.[1]), token: match?.[1]?.trim() || '' } }];`,
    },
  },
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [720, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tokenPresent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const verifyAppJwt = node({
  type: 'n8n-nodes-base.jwt',
  version: 1,
  config: {
    name: 'Verify App JWT',
    position: [960, 220],
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'verify',
      token: expr('{{ $json.token }}'),
      options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' },
    },
    credentials: { jwtAuth: newCredential('PV App JWT') },
  },
});

const validateAppClaims = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate App Claims',
    position: [1200, 220],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const input = $input.first()?.json ?? {};
const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;
let request = {};
try { request = $items('Normalize Request', 0, 0)?.[0]?.json ?? {}; } catch (error) {}
const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes('portal-palm-village-web') : payload.aud === 'portal-palm-village-web';
const claimsValid = payload.iss === 'portal-palm-village' && audienceOk && Boolean(payload.sub);
return [{ json: { claimsValid, valid: request.valid, parent_order_id: request.parent_order_id, user_id: payload.sub || null } }];`,
    },
  },
});

const claimsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Claims Valid?',
    position: [1440, 220],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.claimsValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const requestValid = ifElse({
  version: 2.3,
  config: {
    name: 'Request Valid?',
    position: [740, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const getMidtransStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Get Midtrans Status',
    position: [1020, 180],
    parameters: {
      url: expr("{{ 'https://api.sandbox.midtrans.com/v2/' + encodeURIComponent($json.parent_order_id) + '/status' }}"),
      method: 'GET',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { httpBasicAuth: newCredential('PV Midtrans Sandbox Key v2') },
  },
});

const analyzeProviderStatus = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Analyze Provider Status',
    position: [1300, 180],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const provider = $input.first()?.json ?? {};
let request = {};
try { request = $items('Normalize Request', 0, 0)?.[0]?.json ?? {}; } catch (error) {}
const providerValid = Boolean(provider.order_id && provider.order_id === request.parent_order_id && provider.transaction_status && provider.status_code && provider.gross_amount);
return [{ json: { providerValid, parent_order_id: request.parent_order_id, provider } }];`,
    },
  },
});

const providerStatusValid = ifElse({
  version: 2.3,
  config: {
    name: 'Provider Status Valid?',
    position: [1580, 180],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.providerValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const fetchStatusPayments = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch Payments For Status',
    position: [1860, 80],
    parameters: {
      url: expr("{{ 'https://mzjgliclzihrdjaqzmqg.supabase.co/rest/v1/payments?order_id=like.' + encodeURIComponent($json.parent_order_id) + '*&select=id,ipl_bill_id,status,amount&order=created_at.asc' }}"),
      method: 'GET',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }] },
      options: { response: { response: { responseFormat: 'json' } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const buildStatusUpdate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Status Update',
    position: [2140, 80],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const payments = $input.all().map(item => item.json).filter(Boolean);
let providerData = {};
try { providerData = $items('Analyze Provider Status', 0, 0)?.[0]?.json ?? {}; } catch (error) {}
const provider = providerData.provider || {};
const transactionStatus = String(provider.transaction_status || '').toLowerCase();
const fraudStatus = String(provider.fraud_status || '').toLowerCase();
const settled = transactionStatus === 'settlement' || (transactionStatus === 'capture' && fraudStatus === 'accept');
const billIds = [...new Set(payments.map(payment => payment.ipl_bill_id).filter(Boolean))];
return [{ json: { settled, parent_order_id: providerData.parent_order_id, bill_ids_in: billIds.join(','), paid_at: settled ? new Date().toISOString() : null, transaction_status: provider.transaction_status || null, fraud_status: provider.fraud_status || null } }];`,
    },
  },
});

const paymentSettled = ifElse({
  version: 2.3,
  config: {
    name: 'Payment Settled?',
    position: [2420, 80],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.settled }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
});

const updatePaymentsSettled = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Update Payments Settled',
    position: [2700, 0],
    parameters: {
      url: expr("{{ 'https://mzjgliclzihrdjaqzmqg.supabase.co/rest/v1/payments?order_id=like.' + encodeURIComponent($json.parent_order_id) + '*' }}"),
      method: 'PATCH',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Prefer', value: 'return=representation' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'completed', paid_at: $json.paid_at }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const updateBillsSettled = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Update Bills Settled',
    position: [2980, 0],
    parameters: {
      url: expr("{{ 'https://mzjgliclzihrdjaqzmqg.supabase.co/rest/v1/ipl_bills?id=in.(' + $node['Build Status Update'].json.bill_ids_in + ')' }}"),
      method: 'PATCH',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Prefer', value: 'return=representation' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'paid' }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Success',
    position: [2140, 80],
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ { ok: true, data: { parent_order_id: $node['Analyze Provider Status'].json.parent_order_id, transaction_status: $node['Analyze Provider Status'].json.provider.transaction_status, fraud_status: $node['Analyze Provider Status'].json.provider.fraud_status || null, payment_type: $node['Analyze Provider Status'].json.provider.payment_type || null }, error: null } }}"),
      options: { responseCode: 200, responseHeaders: jsonHeaders },
    },
  },
});

const respondBadRequest = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Bad Request',
    position: [1020, 420],
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ { ok: false, data: null, error: { code: 'BAD_REQUEST', message: 'parent_order_id pembayaran QRIS tidak valid.' } } }}"),
      options: { responseCode: 400, responseHeaders: jsonHeaders },
    },
  },
});

const respondUnauthorized = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized',
    position: [1020, 540],
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ { ok: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid. Silakan login ulang.' } } }}"),
      options: { responseCode: 401, responseHeaders: jsonHeaders },
    },
  },
});

const respondProviderError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Provider Error',
    position: [1860, 300],
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ { ok: false, data: null, error: { code: 'MIDTRANS_STATUS_UNAVAILABLE', message: 'Status pembayaran belum dapat diverifikasi ke Midtrans.' } } }}"),
      // Keep provider-unavailable responses readable by browser clients. The
      // structured payload still carries ok:false and the error code.
      options: { responseCode: 200, responseHeaders: jsonHeaders },
    },
  },
});

const releaseUnavailablePayment = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Release Unavailable Payment',
    position: [1860, 420],
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      url: expr("{{ 'https://mzjgliclzihrdjaqzmqg.supabase.co/rest/v1/payments?order_id=like.' + encodeURIComponent($json.parent_order_id) + '*' }}"),
      method: 'PATCH',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'Accept-Profile', value: 'public' },
          { name: 'Prefer', value: 'return=representation' },
        ],
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ status: 'cancelled' }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-api-payments-qris-status', 'PV API - Payments QRIS Status')
  .add(statusWebhook)
  .to(normalizeRequest)
  .to(tokenPresent
    .onTrue(verifyAppJwt
      .to(validateAppClaims)
      .to(claimsValid
        .onTrue(requestValid
          .onTrue(getMidtransStatus
            .to(analyzeProviderStatus)
            .to(providerStatusValid
              .onTrue(fetchStatusPayments
                .to(buildStatusUpdate)
                .to(paymentSettled
                  .onTrue(updatePaymentsSettled.to(updateBillsSettled.to(respondSuccess)))
                  .onFalse(respondSuccess)))
              .onFalse(releaseUnavailablePayment.to(respondProviderError))))
          .onFalse(respondBadRequest))
        .onFalse(respondUnauthorized)))
    .onFalse(respondUnauthorized));
