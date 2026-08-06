import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const daily = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily 03:15 WIB', position: [160, 260],
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '15 3 * * *' }] } },
  },
});

const prepareRetention = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Retention Cutoffs', position: [420, 260],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const now = Date.now(); const days = (value) => new Date(now - value * 86400000).toISOString(); return [{ json: { sent_before: days(Number($env.PV_EMAIL_SENT_RETENTION_DAYS || 30)), terminal_before: days(Number($env.PV_EMAIL_DEAD_LETTER_RETENTION_DAYS || 90)), worker_id: 'email-cleanup-' + ($env.N8N_INSTANCE_ID || 'instance') } }];` },
  },
});

const cleanup = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Cleanup Expired Email Data', position: [700, 260], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/cleanup_email_notification_outbox' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_sent_before: $json.sent_before, p_terminal_before: $json.terminal_before, p_batch_size: 500 }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const classifyCleanup = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify Cleanup Result', position: [840, 260],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const result = $input.first()?.json || {}; const hasError = Boolean(result.error || (result.statusCode && result.statusCode >= 400)); return [{ json: { ...result, cleanup_ok: !hasError } }];` },
  },
});

const markHeartbeat = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mark Cleanup Heartbeat', position: [980, 260], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'cleanup', p_worker_id: $node['Prepare Retention Cutoffs'].json.worker_id, p_success: $json.cleanup_ok !== false, p_metrics: { retention_job: true } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-cleanup', 'PV Notifications - Retention Cleanup')
  .add(daily)
  .to(prepareRetention)
  .to(cleanup)
  .to(classifyCleanup)
  .to(markHeartbeat);
