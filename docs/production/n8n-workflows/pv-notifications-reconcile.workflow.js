import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

// Reconciler is intentionally separate from the sender. It only reconstructs
// missing outbox rows; it never calls Gmail. The overlap window covers a
// transaction that committed while a previous run was interrupted.
const everyFiveMinutes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every Five Minutes',
    position: [160, 300],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
  },
});

const prepareRun = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Reconcile Run',
    position: [420, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const now = new Date();
const since = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
const workerId = 'reconciler-' + ($env.N8N_INSTANCE_ID || 'instance') + '-' + now.getTime();
return [{ json: { worker_id: workerId, since, template_version: 'v2', started_at: now.toISOString() } }];`,
    },
  },
});

const fetchProfiles = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Recent Profiles',
    position: [700, 300],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'profiles',
      returnAll: false,
      limit: 500,
      filterType: 'manual',
      matchType: 'anyFilter',
      filters: {
        conditions: [
          { keyName: 'created_at', condition: 'gte', keyValue: expr("{{ $node['Prepare Reconcile Run'].json.since }}") },
          { keyName: 'updated_at', condition: 'gte', keyValue: expr("{{ $node['Prepare Reconcile Run'].json.since }}") },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const reconcileProfiles = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Reconcile Profile Notifications',
    position: [980, 300],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/reconcile_profile_email_notification' }}"),
      method: 'POST',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Content-Profile', value: 'public' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_profile_id: $json.id, p_since: $node['Prepare Reconcile Run'].json.since, p_template_version: $node['Prepare Reconcile Run'].json.template_version }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const fetchPayments = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Recent Payments',
    position: [1240, 300],
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'payments',
      returnAll: false,
      limit: 500,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'updated_at', condition: 'gte', keyValue: expr("{{ $node['Prepare Reconcile Run'].json.since }}") }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const reconcilePayments = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Reconcile Payment Notifications',
    position: [1520, 300],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/reconcile_payment_email_notification' }}"),
      method: 'POST',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Content-Profile', value: 'public' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_payment_id: $json.id, p_since: $node['Prepare Reconcile Run'].json.since, p_template_version: $node['Prepare Reconcile Run'].json.template_version }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

const markRun = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mark Reconciler Heartbeat',
    position: [1800, 300],
    onError: 'continueRegularOutput',
    parameters: {
      url: expr("{{ ($env.PV_SUPABASE_URL || 'https://mzjgliclzihrdjaqzmqg.supabase.co') + '/rest/v1/rpc/mark_email_notification_run' }}"),
      method: 'POST',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Accept-Profile', value: 'public' }, { name: 'Content-Profile', value: 'public' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_component: 'reconciler', p_worker_id: $node['Prepare Reconcile Run'].json.worker_id, p_success: true, p_metrics: { source: 'profiles+payments', overlap_minutes: 15 } }) }}"),
      options: { response: { response: { responseFormat: 'json', neverError: true } } },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
});

export default workflow('pv-notifications-reconcile', 'PV Notifications - Reconciler')
  .add(everyFiveMinutes)
  .to(prepareRun)
  .to(fetchProfiles)
  .to(reconcileProfiles)
  .to(fetchPayments)
  .to(reconcilePayments)
  .to(markRun);
