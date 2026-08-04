// Single source of truth for "this path prefix belongs to the API, not a
// client-side route" - shared between vite.config.ts (dev-server proxy +
// PWA navigate-fallback denylist) and configure-api-base.ts (prefixing
// relative fetch() calls with VITE_API_URL in a split-domain deploy).
// Keep this in sync with the API's actual top-level route prefixes
// (apps/api/src/index.ts).
export const API_ROUTES = [
  '/auth',
  '/tasks',
  '/time-blocks',
  '/calendar',
  '/projects',
  '/sections',
  '/tags',
  '/sync',
  '/notes',
  '/countdowns',
  '/push',
  '/gcal',
  '/import',
  '/drive',
  '/health',
  '/areas',
  '/reminders',
  '/checklist-items',
  '/export',
  '/task-counts',
  '/settings',
  '/integrations',
  '/admin',
];
