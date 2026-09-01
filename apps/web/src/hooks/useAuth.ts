import { useState, useEffect, useCallback } from 'react';
import type { User, LoginRequest, RegisterRequest } from '@mindoist/shared/types';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  storeTokens,
} from '../lib/auth-tokens';

const API = '/auth';

function getToken() {
  return getAccessToken();
}

function consumeGoogleRedirectToken() {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('google_token');
  const refresh = params.get('google_refresh');
  if (token || params.has('google_error')) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return token ? { token, refresh } : null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // A persisted session is invalid only when the server says so.
        // Transient 5xx responses must not turn an outage into a logout.
        if (res.status === 401 || res.status === 403 || res.status === 404) clearTokens();
        return;
      }
      const body = await res.json();
      if (body.success) {
        setUser(body.data);
      }
    } catch {
      // Navigation/reload can abort this request. Keep the persisted token so
      // the next mount can validate it instead of signing the user out.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const google = consumeGoogleRedirectToken();
    if (google) storeTokens(google.token, google.refresh);
    fetchMe();
  }, [fetchMe]);

  const login = async (data: LoginRequest): Promise<string | null> => {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!body.success) return body.error || 'Login failed';
    storeTokens(body.data.accessToken, body.data.refreshToken);
    setUser(body.data.user);
    return null;
  };

  const register = async (data: RegisterRequest): Promise<string | null> => {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!body.success) return body.error || 'Registration failed';
    storeTokens(body.data.accessToken, body.data.refreshToken);
    setUser(body.data.user);
    return null;
  };

  const setPassword = async (password: string): Promise<string | null> => {
    const token = getToken();
    if (!token) return 'Missing session';
    const res = await fetch(`${API}/set-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    const body = await res.json();
    if (!body.success) return body.error || 'Password update failed';
    return null;
  };

  const completeOnboarding = async (data: {
    name: string;
    timeZone: string;
    password?: string;
  }): Promise<string | null> => {
    const token = getToken();
    if (!token) return 'Missing session';
    try {
      const res = await fetch(`${API}/complete-onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!body.success) return body.error || 'Onboarding failed';
      setUser(body.data);
      return null;
    } catch {
      return 'Onboarding failed';
    }
  };

  const loginWithGoogle = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API}/google/url`);
      const body = await res.json();
      if (!body.success) return body.error || 'Google sign-in failed';
      window.location.assign(body.data.url);
      return null;
    } catch {
      return 'Google sign-in failed';
    }
  };

  const logout = async () => {
    const token = getToken();
    if (token) {
      // The refresh token has to be handed over to be revoked - dropping it
      // locally alone would leave a credential that still works for 30 days.
      await fetch(`${API}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken: getRefreshToken() }),
      }).catch(() => {});
    }
    clearTokens();
    setUser(null);
  };

  return {
    user,
    loading,
    login,
    register,
    setPassword,
    completeOnboarding,
    loginWithGoogle,
    logout,
  };
}
