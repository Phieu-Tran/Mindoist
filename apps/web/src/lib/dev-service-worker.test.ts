import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupDevServiceWorkers } from './dev-service-worker';

describe('cleanupDevServiceWorkers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('unregisters stale service workers and clears app caches in dev', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['workbox-precache-v1', 'unrelated-cache']),
        delete: deleteCache,
      },
    });

    await cleanupDevServiceWorkers();

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v1');
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache');
  });
});
