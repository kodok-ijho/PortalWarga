import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UAT_WEBHOOK_NAMESPACE,
  buildN8nProxyHeaders,
  buildN8nTargetPath,
  resolveN8nProxyConfig,
} from '../uatProxyConfig.js';
import {
  parseProtectedUatEnv,
  selectUatBrowserEnv,
} from '../uatEnvLoader.js';

function validUatEnv(overrides = {}) {
  return {
    APP_ENV: 'uat',
    VITE_APP_ENV: 'uat',
    VITE_USE_N8N_PROXY: 'true',
    VITE_SUPABASE_URL: 'https://staging-ref.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'browser-safe-test-key',
    UAT_SUPABASE_HOST: 'staging-ref.supabase.co',
    N8N_API_BASE_URL: 'https://n8n.example.test',
    N8N_WEBHOOK_NAMESPACE: UAT_WEBHOOK_NAMESPACE,
    N8N_UAT_KEY: 'synthetic-uat-key',
    N8N_BASIC_AUTH_USER: 'synthetic-user',
    N8N_BASIC_AUTH_PASSWORD: 'synthetic-password',
    ...overrides,
  };
}

test('UAT config resolves only to the UAT namespace', () => {
  const config = resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv() });
  assert.equal(config.namespace, 'portal-uat-v1');
  assert.equal(config.isUat, true);
  assert.equal(config.targetBase, 'https://n8n.example.test');
});

test('UAT rejects production namespace and production-like target path', () => {
  assert.throws(
    () => resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv({ N8N_WEBHOOK_NAMESPACE: 'portal-v1' }) }),
    /Namespace UAT/
  );
  assert.throws(
    () => resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv({ N8N_API_BASE_URL: 'https://n8n.example.test/webhook/portal-v1' }) }),
    /namespace production/
  );
});

test('UAT rejects mismatched Supabase host and privileged VITE variables', () => {
  assert.throws(
    () => resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv({ UAT_SUPABASE_HOST: 'other-ref.supabase.co' }) }),
    /allowlist staging/
  );
  assert.throws(
    () => resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv({ VITE_SUPABASE_SERVICE_ROLE: 'forbidden' }) }),
    /prefix VITE_/
  );
});

test('browser headers cannot override X-UAT-Key', () => {
  const config = resolveN8nProxyConfig({ mode: 'uat', env: validUatEnv() });
  const headers = buildN8nProxyHeaders({
    authorization: 'Bearer synthetic-app-jwt',
    'x-uat-key': 'browser-controlled-key',
  }, config);
  assert.equal(headers['X-UAT-Key'], 'synthetic-uat-key');
  assert.equal(headers['X-Portal-Authorization'], 'Bearer synthetic-app-jwt');
});

test('query/header cannot select environment and namespace path injection is rejected', () => {
  assert.equal(
    buildN8nTargetPath('portal-uat-v1', '/auth/me?namespace=portal-v1'),
    '/webhook/portal-uat-v1/auth/me?namespace=portal-v1'
  );
  assert.throws(() => buildN8nTargetPath('portal-uat-v1', '/portal-v1/auth/me'), /memilih namespace/);
  assert.throws(() => buildN8nTargetPath('portal-uat-v1', '/webhook/portal-v1/auth/me'), /memilih namespace/);
});

test('production config remains pinned to portal-v1 and has no UAT key', () => {
  const config = resolveN8nProxyConfig({
    mode: 'production',
    env: { N8N_API_BASE_URL: 'https://n8n.example.test' },
  });
  assert.equal(config.namespace, 'portal-v1');
  assert.equal(config.uatKey, '');
  assert.equal(buildN8nProxyHeaders({ 'x-uat-key': 'ignored' }, config)['X-UAT-Key'], undefined);
});

test('protected uat.env loader exposes only browser-safe Supabase values', () => {
  const parsed = parseProtectedUatEnv([
    'SUPABASE_URL=https://staging-ref.supabase.co',
    'SUPABASE_ANON_KEY=synthetic-anon',
    'SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-old',
    'SUPABASE_UAT_PUBLISHABLE_KEY=synthetic-publishable-v1',
    'SUPABASE_UAT_PUBLISHABLE_KEY_V2=synthetic-publishable-current',
    'SUPABASE_LEGACY_JWT_SECRET=must-not-leave-server',
    'SUPABASE_SERVICE_ROLE=must-not-leave-server',
    'SUPABASE_SECRET_KEY=must-not-leave-server',
    'SUPABASE_UAT_DB_URL=must-not-leave-server',
  ].join('\n'));
  const selected = selectUatBrowserEnv(parsed);

  assert.deepEqual(Object.keys(selected).sort(), [
    'VITE_APP_ENV',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_USE_N8N_PROXY',
  ]);
  assert.equal(selected.VITE_APP_ENV, 'uat');
  assert.equal(selected.VITE_USE_N8N_PROXY, 'true');
  assert.equal(selected.VITE_SUPABASE_PUBLISHABLE_KEY, 'synthetic-publishable-current');
  assert.equal(selected.VITE_SUPABASE_ANON_KEY, undefined);
  assert.equal(selected.VITE_SUPABASE_SERVICE_ROLE, undefined);
  assert.equal(selected.VITE_SUPABASE_LEGACY_JWT_SECRET, undefined);
  assert.equal(selected.SUPABASE_SECRET_KEY, undefined);
  assert.equal(selected.SUPABASE_UAT_DB_URL, undefined);
});

test('protected uat.env loader uses legacy anon only when publishable is absent', () => {
  const selected = selectUatBrowserEnv(parseProtectedUatEnv([
    'SUPABASE_URL=https://staging-ref.supabase.co',
    'SUPABASE_ANON_KEY=synthetic-anon',
  ].join('\n')));

  assert.equal(selected.VITE_SUPABASE_ANON_KEY, 'synthetic-anon');
  assert.equal(selected.VITE_SUPABASE_PUBLISHABLE_KEY, undefined);
});

test('protected uat.env parser rejects duplicate or malformed assignments', () => {
  assert.throws(
    () => parseProtectedUatEnv('VITE_SUPABASE_URL=one\nVITE_SUPABASE_URL=two'),
    /Variable duplikat/
  );
  assert.throws(() => parseProtectedUatEnv('not an assignment'), /bukan assignment/);
});
