const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function storeTokens(accessToken: string, refreshToken?: string | null) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  // Sessions created before refresh tokens existed have none; keep whatever is
  // already stored rather than wiping a still-valid one.
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/**
 * A page easily fires several API calls at once, and an expired access token
 * makes all of them 401 together. Without this, each would spend a different
 * refresh token and rotation would revoke the others - so concurrent callers
 * share a single in-flight refresh.
 */
let inFlight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        // The server rejected the refresh token outright - it is spent,
        // revoked or expired, and keeping it would retry forever.
        clearTokens();
        return null;
      }
      storeTokens(body.data.accessToken, body.data.refreshToken);
      return body.data.accessToken as string;
    } catch {
      // A network failure says nothing about whether the token is still good,
      // so leave it in place for the next attempt.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
