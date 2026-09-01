import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { API_ROUTES as apiRoutes } from './src/lib/api-routes';

const apiPort = Number(process.env.E2E_API_PORT ?? 3000);
const apiProxy = `http://127.0.0.1:${apiPort}`;
const apiNavigationDenylist = apiRoutes.map(route => new RegExp(`^${route}(?:/|$)`));
// Client routes (/tasks/:id, /projects/:id, ...) share a path prefix with
// the API. A page reload or a typed/bookmarked URL is a real browser
// navigation (`Accept: text/html`) that must fall through to index.html so
// the SPA can mount and fetch with its token — only the app's own fetch()
// calls (no `text/html` in Accept) should actually reach the API. Without
// this, reloading e.g. /tasks/:id proxies straight to the API and renders
// its raw `{"error":"Missing token"}` JSON instead of the task detail page
// (same class of bug as the prod nginx $http_accept routing fix).
const proxy: Record<string, ProxyOptions> = {};
apiRoutes.forEach(r => {
  proxy[r] = {
    target: apiProxy,
    changeOrigin: true,
    bypass(req) {
      if (req.headers.accept?.includes('text/html')) {
        return '/index.html';
      }
    },
  };
});
// `vite preview` also runs as the prod Docker runtime (see apps/web/Dockerfile),
// where the API lives in a separate container, not on 127.0.0.1 — only wire
// the proxy into preview when e2e explicitly asks for it. Vite falls back to
// `server.proxy` when `preview.proxy` is undefined, so this must be `{}`,
// not `undefined`, to actually disable it.
const previewProxy = process.env.E2E_API_PORT ? proxy : {};

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // E2E runs a newly built preview for every command. Registering that
      // build's service worker makes autoUpdate reload the page mid-test as
      // soon as the worker activates, clearing the React tree during real
      // mutations. Keep production PWA behavior unchanged while making the
      // isolated E2E preview deterministic.
      injectRegister: process.env.E2E_API_PORT ? null : 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mindoist',
        short_name: 'Mindoist',
        description: 'A mindfulness productivity app',
        theme_color: '#4c60dc',
        background_color: '#f7f8fa',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        share_target: {
          action: '/',
          method: 'GET',
          params: {
            title: 'share_title',
            text: 'share_text',
            url: 'share_url',
          },
        },
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // registerType: 'autoUpdate' only handles the client side (checks for
        // and applies updates); without these two, the new service worker
        // itself still sits in "waiting" until every tab running the old
        // one closes, so a deploy silently keeps serving stale JS/CSS to
        // already-open tabs until a hard refresh bypasses the SW entirely.
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['notification-handler.js'],
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        navigateFallbackDenylist: apiNavigationDenylist,
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/localhost:3000\/(tasks|projects|tags|sections|notes|sync)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('dexie')) return 'vendor-storage';
          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('framer-motion')
            || id.includes('i18next')
            || id.includes('react-i18next')
          ) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 5173,
    proxy: previewProxy,
    // Prod runs this behind a reverse proxy on a real domain (see
    // docker-compose.prod.yml); Vite's Host-header check would otherwise
    // reject those requests.
    allowedHosts: true,
  },
});
