import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiBase } from './configure-api-base';

const originalFetch = window.fetch;

afterEach(() => {
  window.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('configureApiBase', () => {
  it('routes Telegram integration requests through the split API domain', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    window.fetch = fetchMock;
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');

    configureApiBase();
    await window.fetch('/integrations/telegram/status');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/integrations/telegram/status',
      undefined,
    );
  });

  it('routes administrator requests through the split API domain', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    window.fetch = fetchMock;
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');

    configureApiBase();
    await window.fetch('/admin/providers');

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/admin/providers', undefined);
  });
});
