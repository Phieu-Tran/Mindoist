import { refreshAccessToken } from './auth-tokens';

/**
 * Retrofits automatic token renewal onto the whole app.
 *
 * Eleven modules read the access token straight out of localStorage and call
 * `fetch` themselves (App.tsx, the sync engine, several dialogs...). Rewriting
 * every one of them to funnel through a shared client would be a large, risky
 * change to code that is otherwise working, so the retry is installed once
 * here instead: any request that carried our bearer token and comes back 401
 * is retried once with a freshly minted one.
 *
 * Only requests that already had an Authorization header are touched, so the
 * login, register and refresh calls themselves are never intercepted.
 */
export function installAuthFetch() {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    if (response.status !== 401) return response;

    const sentToken = readBearer(input, init);
    if (!sentToken) return response;

    const fresh = await refreshAccessToken();
    // No new token, or the session moved on underneath us - let the original
    // 401 through so callers handle it exactly as they do today.
    if (!fresh || fresh === sentToken) return response;

    return original(input, withBearer(init, fresh));
  };
}

function readBearer(input: RequestInfo | URL, init?: RequestInit): string | null {
  const fromInit = new Headers(init?.headers).get('Authorization');
  const header =
    fromInit ?? (input instanceof Request ? input.headers.get('Authorization') : null);

  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length) || null;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}
