import { API_ROUTES } from './api-routes';

// The app has dozens of call sites doing fetch('/tasks'), fetch('/projects'),
// etc. directly against relative paths - written under the assumption that
// the web app and API always sit behind the same origin (a reverse proxy
// routes API path prefixes to the api container, everything else to this
// one; see README "Deploy"). That assumption breaks once the API moves to
// its own subdomain (e.g. api-mindoist.example.com). Rather than prefixing
// every one of those call sites individually - error-prone, and several
// already were missed before this - this patches the single shared entry
// point they all go through: window.fetch.
//
// A no-op when VITE_API_URL is unset (the default, single-origin setup).
// Requests that already resolve to an absolute URL (some call sites already
// build one manually) are left untouched, so this can't double-prefix them.
export function configureApiBase() {
  const base = import.meta.env.VITE_API_URL;
  if (!base) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && API_ROUTES.some(route => input.startsWith(route))) {
      return originalFetch(`${base}${input}`, init);
    }
    return originalFetch(input, init);
  };
}
