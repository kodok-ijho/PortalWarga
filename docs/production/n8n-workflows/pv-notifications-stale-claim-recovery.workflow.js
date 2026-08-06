import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

// Reclaims only expired processing leases. It never resends directly: Gmail
// Sent is checked first, then the row is either marked sent or returned to
// pending with confirmed_not_sent.
const everyTwoMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Every Two Minutes', position: [160, 260], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } },
});

const markHeartbeat = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mark Stale Recovery Heartbeat', position: [320, 260], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'stale_recovery', p_worker_id: 'email-stale-recovery-' + ($env.N8N_INSTANCE_ID || 'instance'), p_success: true, p_metrics: { heartbeat: true } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const claimStale = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Claim Stale Leases', position: [480, 260], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/claim_stale_email_notification_batch' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_worker_id: 'email-stale-recovery-' + ($env.N8N_INSTANCE_ID || 'instance'), p_batch_size: 25, p_lease_seconds: 300 }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const normalizeItems = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Claimed Items', position: [640, 260],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const raw = $input.all().flatMap((item) => { const j = item.json; return Array.isArray(j) ? j : (j?.id ? [j] : []); }); if (!raw.length) return []; return raw.map((r) => ({ json: r }));`,
    },
  },
});

const searchSent = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Search Sent for Stale Message', position: [800, 260], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent('in:sent rfc822msgid:' + String($json.message_id || '').replace(/[<>]/g, '')) }}"),
      method: 'GET', authentication: 'predefinedCredentialType', nodeCredentialType: 'gmailOAuth2',
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { gmailOAuth2: newCredential('Gmail account PalmVillage.Paguyuban') },
  },
});

const classify = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Classify Stale Message', position: [1060, 260],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const stale = $items('Normalize Claimed Items', 0, 0) || []; return $input.all().map((item, index) => { const result = item.json || {}; const source = stale[index]?.json || {}; const found = Array.isArray(result.messages) && result.messages.length > 0; return { json: { ...source, found, provider_message_id: found ? result.messages[0].id : null, retry_at: new Date(Date.now() + 60000).toISOString() } }; });` },
  },
});

const found = ifElse({
  version: 2.3,
  config: { name: 'Found in Gmail Sent?', position: [1320, 260], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.found }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } } },
});

const recordReconciled = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Mark Stale Message Sent', position: [1580, 160], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/record_email_notification_outcome' }}"), method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_outbox_id: $json.id, p_lease_token: $json.lease_token, p_worker_id: $json.claimed_by, p_result: 'reconciled', p_provider_message_id: $json.provider_message_id, p_reconciliation_status: 'confirmed_sent' }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const releaseForRetry = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Release Confirmed Not Sent', position: [1580, 360], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/record_email_notification_outcome' }}"), method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_outbox_id: $json.id, p_lease_token: $json.lease_token, p_worker_id: $json.claimed_by, p_result: 'retry', p_error_class: 'STALE_LEASE_RECOVERED', p_error_message: 'Expired worker lease; Message-ID not found in Gmail Sent.', p_reconciliation_status: 'confirmed_not_sent', p_available_at: $json.retry_at }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-stale-claim-recovery', 'PV Notifications - Stale Claim Recovery')
  .add(everyTwoMinutes)
  .to(markHeartbeat)
  .to(claimStale)
  .to(normalizeItems)
  .to(searchSent)
  .to(classify)
  .to(found.onTrue(recordReconciled).onFalse(releaseForRetry));
