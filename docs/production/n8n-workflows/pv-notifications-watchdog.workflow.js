import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

// This workflow must use a credential that is independent from
// `Gmail account PalmVillage.Paguyuban`.
const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every Five Minutes',
    position: [160, 300],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
  },
});

const fetchDeadLetters = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Unalerted Dead Letters',
    position: [420, 300],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'email_notification_outbox', returnAll: false, limit: 500,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'dead_letter' }, { keyName: 'failure_alerted_at', condition: 'is', keyValue: 'null' }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchRuns = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Pipeline Heartbeats',
    position: [700, 300],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'email_notification_runs', returnAll: true },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchPending = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Pending Backlog',
    position: [980, 300],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'email_notification_outbox', returnAll: false, limit: 500,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'pending' }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchCaptureAnomalies = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Open Capture Anomalies', position: [1120, 300], executeOnce: true, alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'email_notification_capture_anomalies', returnAll: false, limit: 500, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'resolved_at', condition: 'is', keyValue: 'null' }] } },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const buildIncident = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Grouped Incident',
    position: [1260, 300],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const rows = (name) => { try { return $items(name, 0, 0).map((item) => item.json || {}).filter((item) => item.id || item.component); } catch { return []; } };
const dead = rows('Fetch Unalerted Dead Letters'); const runs = rows('Fetch Pipeline Heartbeats'); const pending = rows('Fetch Pending Backlog'); const anomalies = rows('Fetch Open Capture Anomalies');
const now = Date.now(); const stale = runs.filter((run) => !run.last_success_at || now - new Date(run.last_success_at).getTime() > 15 * 60 * 1000);
const oldest = pending.map((row) => new Date(row.created_at).getTime()).filter(Number.isFinite).sort((a,b) => a-b)[0];
const backlogOld = pending.length >= 100 || (oldest && now - oldest > 15 * 60 * 1000);
const incidents = [];
if (dead.length) incidents.push('Dead-letter baru: ' + dead.length);
if (anomalies.length) incidents.push('Capture anomaly terbuka: ' + anomalies.length);
if (stale.length) incidents.push('Heartbeat stale: ' + stale.map((row) => row.component).join(', '));
if (backlogOld) incidents.push('Backlog pending: minimal ' + pending.length + ', umur tertua ' + Math.round((now - oldest) / 60000) + ' menit');
const refs = dead.concat(anomalies).slice(0, 20).map((row) => row.id).join(', ');
return [{ json: { should_alert: incidents.length > 0, incident_count: incidents.length, subject: '[ALERT] Portal Warga email pipeline (' + incidents.length + ')', text: ['Environment: ' + ($env.PV_ENVIRONMENT || 'unknown'), 'Waktu: ' + new Date().toISOString(), ...incidents, refs ? 'Referensi: ' + refs : '', '', 'Periksa dashboard/runbook email notification.'].filter(Boolean).join('\\n'), dead_letter_count: dead.length } }];`,
    },
  },
});

const syncIncident = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Apply Incident Cooldown', position: [1390, 300], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/update_email_notification_incident' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_incident_key: 'email-pipeline', p_incident_type: 'email_pipeline', p_active: $json.should_alert, p_details: { incident_count: $json.incident_count, dead_letter_count: $json.dead_letter_count, summary: $json.text }, p_cooldown_seconds: 3600 }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const prepareAlertDecision = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Alert Decision', position: [1460, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const raw = $input.first()?.json || {}; const state = Array.isArray(raw) ? (raw[0] || {}) : raw; const incident = $items('Build Grouped Incident', 0, 0)?.[0]?.json || {}; const syncError = state.error?.message || state.message || null; const recovery = Boolean(state.should_recover); const shouldSend = Boolean(state.should_alert || recovery || syncError); return [{ json: { ...incident, should_send: shouldSend, is_recovery: recovery, subject: syncError ? '[ALERT] Watchdog incident state gagal disimpan' : (recovery ? '[RECOVERY] Portal Warga email pipeline pulih' : incident.subject), text: syncError ? ['Environment: ' + ($env.PV_ENVIRONMENT || 'unknown'), 'Watchdog gagal menyimpan incident state ke Supabase.', 'Error: ' + syncError, '', 'Periksa koneksi Supabase dan pipeline email.'].join('\\n') : (recovery ? ['Environment: ' + ($env.PV_ENVIRONMENT || 'unknown'), 'Waktu pulih: ' + new Date().toISOString(), 'Pipeline email kembali sehat.', '', 'Periksa dashboard untuk memastikan backlog telah selesai.'].join('\\n') : incident.text) } }];` },
  },
});

const shouldAlert = ifElse({
  version: 2.3,
  config: {
    name: 'Alert or Recovery Needed?', position: [1580, 300],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.should_send }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
});

const prepareWatchdogMime = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Watchdog Alert MIME',
    position: [1680, 200],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const item = $input.first()?.json || {};
const from = String($env.PV_EMAIL_FROM || 'palmvillage.paguyuban@gmail.com').trim();
const to = String($env.PV_ALERT_TO || 'denmas.dyudhiantoro@gmail.com').trim();
const mime = ['From: Portal Warga Alert <' + from + '>', 'To: ' + to, 'Subject: ' + item.subject, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', item.text].join('\\r\\n');
const raw = Buffer.from(mime, 'utf8').toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
return [{ json: { ...item, raw_mime: raw } }];`,
    },
  },
});

const sendGmailAlert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send Gmail Watchdog Alert',
    position: [1800, 200],
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

const classifyAlertDelivery = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify Alert Delivery', position: [1910, 200],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const result = $input.first()?.json || {}; const incident = $items('Prepare Alert Decision', 0, 0)?.[0]?.json || {}; const error = result.error?.message || result.message || null; return [{ json: { ...incident, alert_sent: !error, alert_error: error } }];` },
  },
});

const alertSent = ifElse({
  version: 2.3,
  config: {
    name: 'Secondary Alert Sent?', position: [2040, 200],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.alert_sent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
});

const markDeadLettersAlerted = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Mark Dead Letters Alerted',
    position: [2040, 200],
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'row', operation: 'update', tableId: 'email_notification_outbox', filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'dead_letter' }, { keyName: 'failure_alerted_at', condition: 'is', keyValue: 'null' }] },
      dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'failure_alerted_at', fieldValue: expr('{{ $now.toISO() }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const acknowledgeIncidentDelivery = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Acknowledge Incident Email', position: [2140, 200],
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/ack_email_notification_incident_delivery' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_incident_key: 'email-pipeline', p_recovery: $json.is_recovery }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const markWatchdogHeartbeat = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mark Watchdog Heartbeat', position: [2300, 300], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'watchdog', p_worker_id: 'email-watchdog-' + ($env.N8N_INSTANCE_ID || 'instance'), p_success: true, p_metrics: { checked_at: $now.toISO() } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const markWatchdogFailure = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Record Alert Delivery Failure', position: [2300, 460], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'watchdog', p_worker_id: 'email-watchdog-' + ($env.N8N_INSTANCE_ID || 'instance'), p_success: false, p_metrics: { alert_delivery_failed: true }, p_error: $json.alert_error || 'SECONDARY_ALERT_FAILED' }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-watchdog', 'PV Notifications - Watchdog')
  .add(everyFiveMinutes)
  .to(fetchDeadLetters)
  .to(fetchRuns)
  .to(fetchPending)
  .to(fetchCaptureAnomalies)
  .to(buildIncident)
  .to(syncIncident)
  .to(prepareAlertDecision)
  .to(shouldAlert
    .onTrue(prepareWatchdogMime.to(sendGmailAlert).to(classifyAlertDelivery).to(alertSent
      .onTrue(acknowledgeIncidentDelivery.to(markDeadLettersAlerted).to(markWatchdogHeartbeat))
      .onFalse(markWatchdogFailure)))
    .onFalse(markWatchdogHeartbeat));
