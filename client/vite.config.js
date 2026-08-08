import { defineConfig, loadEnv } from 'vite';
import https from 'node:https';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const n8nTarget = (env.N8N_API_BASE_URL || env.VITE_N8N_TARGET_URL || env.VITE_N8N_API_BASE_URL || '').replace(/\/webhook\/portal-v1\/?$/, '');
  const basicUser = env.N8N_BASIC_AUTH_USER || '';
  const basicPass = env.N8N_BASIC_AUTH_PASS || '';
  const basicAuth = basicUser && basicPass ? `${basicUser}:${basicPass}` : '';

  function n8nProxyPlugin() {
    function forwardToN8n(targetUrl, { method, headers, body }) {
      return new Promise((resolve, reject) => {
        const url = new URL(targetUrl);
        const req = https.request({
          method,
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          protocol: url.protocol,
          ...(basicAuth ? { auth: basicAuth } : {}),
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body || ''),
          },
        }, (upstream) => {
          const chunks = [];
          upstream.on('data', (chunk) => chunks.push(chunk));
          upstream.on('end', () => resolve({
            status: upstream.statusCode || 502,
            contentType: upstream.headers['content-type'] || 'application/json; charset=utf-8',
            text: Buffer.concat(chunks).toString('utf8'),
          }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });
    }

    return {
      name: 'pv-n8n-dev-proxy',
      configureServer(server) {
        if (!n8nTarget) return;
        server.middlewares.use('/api/n8n', async (req, res) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString('utf8');
          const targetPath = `/webhook/portal-v1${req.url || ''}`;
          const portalAuth = req.headers.authorization || '';
          const headers = {
            'Content-Type': req.headers['content-type'] || 'application/json',
            ...(portalAuth ? { 'X-Portal-Authorization': portalAuth } : {}),
          };

          try {
            const upstream = await forwardToN8n(`${n8nTarget}${targetPath}`, {
              method: req.method,
              headers,
              body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
            });
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', upstream.contentType);
            res.setHeader('Cache-Control', 'no-store');
            res.end(upstream.text);
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: false,
              data: null,
              error: {
                code: 'N8N_PROXY_ERROR',
                message: 'Proxy API n8n gagal menghubungi backend.',
                details: { message: error?.message || String(error) },
              },
              meta: { timestamp: new Date().toISOString() },
            }));
          }
        });
      },
    };
  }

  return {
  plugins: [
    react(),
    n8nProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // Service worker mati saat dev → hot-reload tetap mulus
      devOptions: {
        enabled: false,
      },

      workbox: {
        // Semua aset statis (JS, CSS, fonts) di-precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Kalau ada update, cek saat navigasi
        navigateFallback: 'index.html',
      },

      manifest: {
        name: 'Portal Warga Perumahan Palm Village',
        short_name: 'Portal Palm Village',
        description:
          'Portal resmi warga Perumahan Palm Village — pembayaran IPL, informasi penghuni, acara komunitas, dan forum diskusi.',
        theme_color: '#1a3d2e',
        background_color: '#1a3d2e',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
  };
});
