export const PRODUCTION_WEBHOOK_NAMESPACE = 'portal-v1';
export const UAT_WEBHOOK_NAMESPACE = 'portal-uat-v1';

const PRIVILEGED_VITE_NAME = /^VITE_.*(?:SERVICE_ROLE|JWT_SECRET|LEGACY_JWT|PASSWORD|PRIVATE_KEY|UAT_KEY|BASIC_AUTH|SECRET)/i;

function required(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`[uat-config] ${label} wajib diisi.`);
  }
  return normalized;
}

function parseHttpsBaseUrl(rawValue, label) {
  const raw = required(rawValue, label);
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error(`[uat-config] ${label} wajib memakai HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`[uat-config] ${label} tidak boleh memuat credential di URL.`);
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname
    .replace(/\/webhook\/(?:portal-v1|portal-uat-v1)\/?$/i, '')
    .replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function assertNoPrivilegedViteVariables(env) {
  const exposed = Object.keys(env).filter((key) => PRIVILEGED_VITE_NAME.test(key));
  if (exposed.length) {
    throw new Error(`[uat-config] Secret server-side memakai prefix VITE_: ${exposed.join(', ')}`);
  }
}

function assertStagingBrowserConfig(env) {
  const rawUrl = required(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL');
  const expectedHost = required(env.UAT_SUPABASE_HOST, 'UAT_SUPABASE_HOST').toLowerCase();
  const actualUrl = new URL(rawUrl);
  if (actualUrl.protocol !== 'https:' || actualUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error('[uat-config] Host Supabase browser tidak cocok dengan allowlist staging.');
  }
  if (!env.VITE_SUPABASE_ANON_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('[uat-config] Anon/publishable key staging belum tersedia.');
  }
  if (env.VITE_USE_N8N_PROXY !== 'true') {
    throw new Error('[uat-config] UAT wajib memakai same-origin n8n proxy.');
  }
}

export function resolveN8nProxyConfig({ mode, env = {} }) {
  const isUat = mode === 'uat';

  if (!isUat) {
    const rawTarget = env.N8N_API_BASE_URL || env.VITE_N8N_TARGET_URL || env.VITE_N8N_API_BASE_URL || '';
    return {
      enabled: Boolean(rawTarget),
      isUat: false,
      namespace: PRODUCTION_WEBHOOK_NAMESPACE,
      targetBase: rawTarget ? parseHttpsBaseUrl(rawTarget, 'N8N_API_BASE_URL') : '',
      basicAuth: env.N8N_BASIC_AUTH_USER && (env.N8N_BASIC_AUTH_PASS || env.N8N_BASIC_AUTH_PASSWORD)
        ? `${env.N8N_BASIC_AUTH_USER}:${env.N8N_BASIC_AUTH_PASS || env.N8N_BASIC_AUTH_PASSWORD}`
        : '',
      uatKey: '',
    };
  }

  assertNoPrivilegedViteVariables(env);
  if (env.APP_ENV !== 'uat' || env.VITE_APP_ENV !== 'uat') {
    throw new Error('[uat-config] APP_ENV dan VITE_APP_ENV wajib bernilai uat.');
  }
  if (env.N8N_WEBHOOK_NAMESPACE !== UAT_WEBHOOK_NAMESPACE) {
    throw new Error(`[uat-config] Namespace UAT wajib ${UAT_WEBHOOK_NAMESPACE}.`);
  }
  if (/\/portal-v1(?:\/|$)/i.test(String(env.N8N_API_BASE_URL || ''))) {
    throw new Error('[uat-config] Target UAT tidak boleh memuat namespace production.');
  }
  assertStagingBrowserConfig(env);

  const basicUser = required(env.N8N_BASIC_AUTH_USER, 'N8N_BASIC_AUTH_USER');
  const basicPassword = required(
    env.N8N_BASIC_AUTH_PASSWORD || env.N8N_BASIC_AUTH_PASS,
    'N8N_BASIC_AUTH_PASSWORD'
  );

  return {
    enabled: true,
    isUat: true,
    namespace: UAT_WEBHOOK_NAMESPACE,
    targetBase: parseHttpsBaseUrl(env.N8N_API_BASE_URL, 'N8N_API_BASE_URL'),
    basicAuth: `${basicUser}:${basicPassword}`,
    uatKey: required(env.N8N_UAT_KEY, 'N8N_UAT_KEY'),
  };
}

export function buildN8nTargetPath(namespace, requestUrl = '/') {
  if (![PRODUCTION_WEBHOOK_NAMESPACE, UAT_WEBHOOK_NAMESPACE].includes(namespace)) {
    throw new Error('[uat-config] Namespace proxy tidak dikenal.');
  }

  const parsed = new URL(String(requestUrl || '/'), 'http://localhost');
  const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error('[uat-config] Path request tidak valid.');
    }
    if (decoded === '..' || decoded === '.' || /^(?:webhook|portal-v1|portal-uat-v1)$/i.test(decoded)) {
      throw new Error('[uat-config] Request tidak boleh memilih namespace webhook.');
    }
    return encodeURIComponent(decoded);
  });

  const suffix = segments.length ? `/${segments.join('/')}` : '';
  return `/webhook/${namespace}${suffix}${parsed.search}`;
}

export function buildN8nProxyHeaders(requestHeaders = {}, config) {
  const portalAuth = requestHeaders.authorization || '';
  const requestId = requestHeaders['x-request-id'] || '';
  return {
    'Content-Type': requestHeaders['content-type'] || 'application/json',
    ...(portalAuth ? { 'X-Portal-Authorization': portalAuth } : {}),
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
    ...(config.isUat ? { 'X-UAT-Key': config.uatKey } : {}),
  };
}
