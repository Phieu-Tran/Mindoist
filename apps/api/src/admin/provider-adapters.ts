import type { AiProviderType } from '@prisma/client';

export interface ProviderConnectionInput {
  provider: AiProviderType;
  model: string;
  apiBase?: string | null;
  apiKey: string;
  requestTimeoutMs: number;
}

type FetchLike = typeof fetch;

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function testProviderConnection(input: ProviderConnectionInput, fetchImpl: FetchLike = fetch) {
  const startedAt = Date.now();
  const latencyMs = () => Math.max(0, Date.now() - startedAt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.requestTimeoutMs);
  try {
    let url: string;
    let headers: Record<string, string> = { 'content-type': 'application/json' };
    let body: unknown;

    if (input.provider === 'GEMINI') {
      const base = input.apiBase || 'https://generativelanguage.googleapis.com/v1beta';
      url = `${joinUrl(base, `models/${encodeURIComponent(input.model)}:generateContent`)}?key=${encodeURIComponent(input.apiKey)}`;
      body = { contents: [{ parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 1 } };
    } else if (input.provider === 'ANTHROPIC') {
      url = joinUrl(input.apiBase || 'https://api.anthropic.com', '/v1/messages');
      headers = { ...headers, 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' };
      body = { model: input.model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply with OK.' }] };
    } else {
      const defaultBase = input.provider === 'OPENROUTER'
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.openai.com/v1';
      url = joinUrl(input.apiBase || defaultBase, '/chat/completions');
      headers = { ...headers, authorization: `Bearer ${input.apiKey}` };
      body = { model: input.model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply with OK.' }] };
    }

    const response = await fetchImpl(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) return { ok: false as const, status: response.status, latencyMs: latencyMs(), message: `Provider returned HTTP ${response.status}` };
    return { ok: true as const, status: response.status, latencyMs: latencyMs(), message: 'Connection successful' };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false as const, latencyMs: latencyMs(), message: timedOut ? 'Provider request timed out' : 'Provider connection failed' };
  } finally {
    clearTimeout(timer);
  }
}
