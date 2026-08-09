import https from 'node:https';

const DEFAULT_N8N_TARGET = 'https://n8n-icyxwmjq.runner.web.id';

function standardError(code, message, details = {}) {
  return {
    ok: false,
    data: null,
    error: { code, message, details },
    meta: { timestamp: new Date().toISOString() },
  };
}

function resolveTargetPath(req) {
  const rawPath = req.query?.path;
  const parts = Array.isArray(rawPath)
    ? rawPath
    : String(rawPath || '').split('/').filter(Boolean);
  return parts.map((part) => encodeURIComponent(String(part))).join('/');
}

async function readBody(req) {
  if (['GET', 'HEAD'].includes(req.method)) return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function forwardToN8n(targetUrl, { method, headers, body, basicAuth }) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const upstreamRequest = https.request({
      method,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      protocol: url.protocol,
      auth: basicAuth,
      headers,
    }, (upstreamResponse) => {
      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      upstreamResponse.on('end', () => resolve({
        status: upstreamResponse.statusCode || 502,
        contentType: upstreamResponse.headers['content-type'] || 'application/json; charset=utf-8',
        body: Buffer.concat(chunks),
      }));
    });
    upstreamRequest.on('error', reject);
    if (body) upstreamRequest.write(body);
    upstreamRequest.end();
  });
}

export default async function handler(req, res) {
  const targetBase = (process.env.N8N_API_BASE_URL || DEFAULT_N8N_TARGET)
    .replace(/\/webhook\/portal-v1\/?$/, '')
    .replace(/\/+$/, '');
  const basicUser = process.env.N8N_BASIC_AUTH_USER || '';
  const basicPass = process.env.N8N_BASIC_AUTH_PASS || process.env.N8N_BASIC_AUTH_PASSWORD || '';

  if (!basicUser || !basicPass) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(standardError(
      'N8N_PROXY_CONFIG_MISSING',
      'Konfigurasi proxy API production belum lengkap.'
    )));
    return;
  }

  const portalPath = resolveTargetPath(req);
  const targetUrl = `${targetBase}/webhook/portal-v1/${portalPath}`;
  const requestBody = await readBody(req);
  const headers = {
    Accept: req.headers.accept || 'application/json',
    'Content-Type': req.headers['content-type'] || 'application/json',
    ...(req.headers.authorization
      ? { 'X-Portal-Authorization': req.headers.authorization }
      : {}),
    ...(req.headers['x-request-id']
      ? { 'X-Request-Id': req.headers['x-request-id'] }
      : {}),
  };
  if (requestBody) headers['Content-Length'] = String(requestBody.length);

  try {
    const upstream = await forwardToN8n(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
      basicAuth: `${basicUser}:${basicPass}`,
    });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(upstream.body);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(standardError(
      'N8N_PROXY_ERROR',
      'Proxy API gagal menghubungi layanan backend.',
      { message: error?.message || String(error) }
    )));
  }
}
