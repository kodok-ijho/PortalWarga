import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // register manual via komponen PWAUpdatePrompt

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
});
