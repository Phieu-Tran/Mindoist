const DEV_SW_CLEANUP_KEY = 'mindoist-dev-sw-cleaned';

export async function cleanupDevServiceWorkers() {
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return;

    await Promise.all(registrations.map(registration => registration.unregister()));

    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter(key => key.includes('workbox') || key.includes('precache') || key.includes('api-cache'))
          .map(key => window.caches.delete(key)),
      );
    }

    if (navigator.serviceWorker.controller && !window.sessionStorage.getItem(DEV_SW_CLEANUP_KEY)) {
      window.sessionStorage.setItem(DEV_SW_CLEANUP_KEY, '1');
      window.location.reload();
    }
  } catch {
    // Dev-only cleanup should never block the app.
  }
}
