import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

// v2 dispatcher. The claim and outcome RPCs are the concurrency boundary.
// Gmail timeout is treated as ambiguous until Sent is searched by Message-ID.
const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every Minute',
    position: [160, 280],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
});

const markDispatcherHeartbeat = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mark Dispatcher Heartbeat',
    position: [300, 280],
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'dispatcher', p_worker_id: 'email-dispatcher-' + ($env.N8N_INSTANCE_ID || 'instance'), p_success: true, p_metrics: { heartbeat: true } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const claimBatch = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Claim Email Batch Atomically',
    position: [420, 280],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/claim_email_notification_batch' }}"),
      method: 'POST',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Content-Profile', value: 'public' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_worker_id: 'email-dispatcher-' + ($env.N8N_INSTANCE_ID || 'instance'), p_batch_size: 50, p_lease_seconds: 300 }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const prepareEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Versioned MIME Email',
    position: [700, 280],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const row = (label, value) => '<tr><td style="padding:7px 10px;color:#4b5563">' + esc(label) + '</td><td style="padding:7px 10px;font-weight:600">' + esc(value) + '</td></tr>';
const render = (item) => {
  const o = item.json || {}; const p = typeof o.payload === 'string' ? JSON.parse(o.payload || '{}') : (o.payload || {});
  let subject = '[Portal Warga] Notifikasi'; let title = 'Notifikasi Portal Warga'; let intro = 'Ada aktivitas baru di Portal Warga Palm Village.'; let rows = row('Waktu', o.created_at || '-');
  if (o.event_type === 'profile.registered.user') { subject = '[Portal Warga] Pendaftaran akun diterima'; title = 'Pendaftaran akun diterima'; intro = 'Pendaftaran akun Anda sudah diterima.'; rows = row('Email', p.email) + row('Status', p.approval_status); }
  else if (o.event_type === 'profile.registered.admin') { subject = '[Portal Warga] Pendaftaran pengguna baru'; title = 'Pengguna baru menunggu verifikasi'; intro = 'Ada pendaftaran pengguna baru yang perlu diperiksa.'; rows = row('Nama', p.full_name) + row('Email', p.email) + row('Role awal', p.role); }
  else if (o.event_type === 'profile.verification.user') { subject = '[Portal Warga] Status akun: ' + p.approval_status; title = 'Hasil verifikasi akun'; intro = 'Status akun Anda telah diperbarui.'; rows = row('Email', p.email) + row('Status', p.approval_status) + row('Catatan', p.approval_note || '-'); }
  else if (o.event_type === 'profile.verification.actor') { subject = '[Portal Warga] Verifikasi pengguna selesai'; title = 'Verifikasi pengguna tersimpan'; intro = 'Tindakan verifikasi pengguna Anda sudah tersimpan.'; rows = row('Pengguna', p.email) + row('Status', p.approval_status); }
  else if (o.event_type.startsWith('payment.recorded')) { subject = '[Portal Warga] Pembayaran IPL dicatat'; title = 'Pencatatan pembayaran IPL'; intro = 'Pembayaran IPL sudah tercatat.'; rows = row('Periode', p.period) + row('Jumlah', money(p.amount)) + row('Metode', p.method) + row('Status', p.status); }
  else if (o.event_type.startsWith('payment.verification')) { subject = '[Portal Warga] Verifikasi pembayaran IPL: ' + p.status; title = 'Hasil verifikasi pembayaran'; intro = 'Status verifikasi pembayaran IPL telah diperbarui.'; rows = row('Periode', p.period) + row('Jumlah', money(p.amount)) + row('Status', p.status) + row('Catatan', p.verification_note || '-'); }
  const html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173b2c"><h2 style="background:#174c3c;color:white;padding:18px">' + esc(title) + '</h2><div style="padding:20px;border:1px solid #d1d5db"><p>' + esc(intro) + '</p><table style="border-collapse:collapse;width:100%">' + rows + '</table><p style="font-size:12px;color:#6b7280">Email otomatis Portal Warga Palm Village.</p></div></div>';
  const messageId = o.message_id || '<' + String(o.id || o.dedupe_key || Date.now()).replace(/[^a-zA-Z0-9]/g, '') + '@gmail.com>';
  const from = String($env.PV_EMAIL_FROM || 'palmvillage.paguyuban@gmail.com').trim().toLowerCase();
  if (from !== 'palmvillage.paguyuban@gmail.com') throw new Error('CONFIG_SENDER_MISMATCH: PV_EMAIL_FROM must be palmvillage.paguyuban@gmail.com');
  const mime = ['From: Portal Warga Palm Village <' + from + '>', 'To: ' + o.recipient_email, 'Subject: ' + subject, 'Message-ID: ' + messageId, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\\r\\n');
  const raw = Buffer.from(mime, 'utf8').toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  return { ...o, subject, email_html: html, application_message_id: messageId, raw_mime: raw };
};
return $input.all().map((item) => ({ json: render(item) }));`,
    },
  },
});

const sendGmailRaw = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send Gmail Raw MIME',
    position: [980, 280],
    onError: 'continueRegularOutput',
    parameters: {
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'gmailOAuth2',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ raw: $json.raw_mime }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { gmailOAuth2: newCredential('Gmail account PalmVillage.Paguyuban') },
  },
});

const classifySend = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify Gmail Result',
    position: [1240, 280],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const prepared = $items('Prepare Versioned MIME Email', 0, 0) || [];
return $input.all().map((item, index) => {
  const sent = item.json || {}; const source = prepared[index]?.json || {};
  const code = Number(sent.statusCode || sent.code || 0); const providerId = sent.id || sent.body?.id || sent.message?.id || null;
  return { json: { ...source, provider_message_id: providerId, send_state: Boolean(providerId) && (code === 0 || (code >= 200 && code < 300)) ? 'sent' : 'ambiguous', send_error: sent.error?.message || sent.body?.error?.message || sent.message || null } };
});`,
    },
  },
});

const sentDecision = ifElse({
  version: 2.3,
  config: {
    name: 'Gmail Confirmed Sent?',
    position: [1500, 280],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.send_state }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'sent' }], combinator: 'and' } },
  },
});

const recordSent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Record Sent Outcome',
    position: [1760, 180],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/record_email_notification_outcome' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_outbox_id: $json.id, p_lease_token: $json.lease_token, p_worker_id: $json.claimed_by, p_result: 'sent', p_provider_message_id: $json.provider_message_id, p_reconciliation_status: 'confirmed_sent' }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const searchSent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Search Gmail Sent by Message-ID',
    position: [1760, 380],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent('in:sent rfc822msgid:' + String($json.application_message_id || '').replace(/[<>]/g, '')) }}"),
      method: 'GET', authentication: 'predefinedCredentialType', nodeCredentialType: 'gmailOAuth2',
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { gmailOAuth2: newCredential('Gmail account PalmVillage.Paguyuban') },
  },
});

const classifySearch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify Sent Search',
    position: [2020, 380],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const sourceItems = $items('Classify Gmail Result', 0, 0) || []; return $input.all().map((item, index) => { const search = item.json || {}; const source = sourceItems[index]?.json || {}; const found = Array.isArray(search.messages) && search.messages.length > 0; return { json: { ...source, reconciliation: found ? 'confirmed_sent' : 'confirmed_not_sent', provider_message_id: source.provider_message_id || (found ? search.messages[0].id : null) } }; });` },
  },
});

const reconciledDecision = ifElse({
  version: 2.3,
  config: {
    name: 'Message Found in Sent?',
    position: [2280, 380],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.reconciliation }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'confirmed_sent' }], combinator: 'and' } },
  },
});

const recordReconciled = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Record Reconciled Sent',
    position: [2540, 300],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/record_email_notification_outcome' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_outbox_id: $json.id, p_lease_token: $json.lease_token, p_worker_id: $json.claimed_by, p_result: 'reconciled', p_provider_message_id: $json.provider_message_id, p_reconciliation_status: $json.reconciliation }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const prepareRetry = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Retry or Dead Letter',
    position: [2540, 480],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `return $input.all().map((item) => { const source = item.json || {}; const attempts = Number(source.attempts || 0) + 1; const terminal = attempts >= 5; const delayMs = Math.min(60 * 60 * 1000, Math.pow(2, attempts) * 60 * 1000 + Math.floor(Math.random() * 30000)); return { json: { ...source, outcome: terminal ? 'dead_letter' : 'retry', retry_at: new Date(Date.now() + delayMs).toISOString(), error_class: terminal ? 'MAX_ATTEMPTS' : 'GMAIL_AMBIGUOUS', error_message: source.send_error || 'Gmail result was ambiguous and Message-ID was not found in Sent.' } }; });` },
  },
});

const recordRetry = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Record Retry or Dead Letter',
    position: [2800, 480],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/record_email_notification_outcome' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_outbox_id: $json.id, p_lease_token: $json.lease_token, p_worker_id: $json.claimed_by, p_result: $json.outcome, p_error_class: $json.error_class, p_error_message: $json.error_message, p_reconciliation_status: $json.reconciliation || 'confirmed_not_sent', p_available_at: $json.retry_at }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-transactional-email-v2', 'PV Notifications - Transactional Email v2')
  .add(everyMinute)
  .to(markDispatcherHeartbeat)
  .to(claimBatch)
  .to(prepareEmail)
  .to(sendGmailRaw)
  .to(classifySend)
  .to(sentDecision
    .onTrue(recordSent)
    .onFalse(searchSent.to(classifySearch).to(reconciledDecision
      .onTrue(recordReconciled)
      .onFalse(prepareRetry.to(recordRetry)))));
