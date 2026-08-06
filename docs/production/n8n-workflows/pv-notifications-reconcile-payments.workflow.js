import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

// Separate payment branch ensures payment reconciliation still runs when the
// profile query returns zero rows. It is intentionally idempotent with the
// combined reconciler artifact.
const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Every Five Minutes', position: [160, 260], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } },
});

const prepareRun = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Prepare Payment Reconcile Run', position: [420, 260], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const now = new Date(); return [{ json: { since: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), worker_id: 'reconciler-payments-' + ($env.N8N_INSTANCE_ID || 'instance') + '-' + now.getTime(), template_version: 'v2' } }];` } },
});

const fetchPayments = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Recent Payments', position: [700, 260], executeOnce: true, alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'getAll', tableId: 'payments', returnAll: false, limit: 500, filterType: 'manual', matchType: 'allFilters', filters: { conditions: [{ keyName: 'updated_at', condition: 'gte', keyValue: expr("{{ $node['Prepare Payment Reconcile Run'].json.since }}") }] } },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const reconcilePayments = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Reconcile Payment Notifications', position: [980, 260], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/reconcile_payment_email_notification' }}"),
      method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_payment_id: $json.id, p_since: $node['Prepare Payment Reconcile Run'].json.since, p_template_version: $node['Prepare Payment Reconcile Run'].json.template_version }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const markRun = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Mark Payment Reconciler Heartbeat', position: [1260, 260], onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"), method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'reconciler_payments', p_worker_id: $node['Prepare Payment Reconcile Run'].json.worker_id, p_success: true, p_metrics: { source: 'payments', overlap_minutes: 15 } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    }, credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-reconcile-payments', 'PV Notifications - Payment Reconciler')
  .add(everyFiveMinutes)
  .to(prepareRun)
  .to(fetchPayments)
  .to(reconcilePayments)
  .to(markRun);
