import { describe, expect, it, vi } from 'vitest';
import { testProviderConnection } from './provider-adapters.js';

describe('provider connection adapters', () => {
  it('uses the Gemini endpoint and does not return provider response bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"sensitive":"body"}', { status: 401 }));
    const result = await testProviderConnection({ provider: 'GEMINI', model: 'gemini-test', apiKey: 'gemini-secret', requestTimeoutMs: 1000 }, fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('models/gemini-test:generateContent');
    expect(result).toMatchObject({ ok: false, status: 401, message: 'Provider returned HTTP 401' });
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('gemini-secret');
  });

  it('sends Anthropic keys only as the provider authentication header', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await testProviderConnection({ provider: 'ANTHROPIC', model: 'claude-test', apiKey: 'claude-secret', requestTimeoutMs: 1000 }, fetchMock);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'x-api-key': 'claude-secret' });
    expect(init?.body).not.toContain('claude-secret');
  });

  it('reports successful probes with non-negative latency', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const result = await testProviderConnection({ provider: 'OPENAI', model: 'gpt-test', apiKey: 'openai-secret', requestTimeoutMs: 1000 }, fetchMock);
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Connection successful' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
