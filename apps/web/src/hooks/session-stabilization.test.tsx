import { afterEach, it, expect, vi } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { refreshAccessToken, clearTokens } from '../lib/auth-tokens';
const reply = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('a late session restore cannot overwrite a new login', async () => {
  localStorage.setItem('token', 'old');
  let restore!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { restore = resolve; }))
    .mockResolvedValueOnce(reply({ accessToken: 'new', user: { id: 'new-user' } })));
  const { result } = renderHook(() => useAuth());
  await act(async () => { await result.current.login({ email: 'new@example.test', password: 'password' }); });
  await act(async () => { restore(reply({ id: 'old-user' })); });
  expect(result.current.user?.id).toBe('new-user');
  expect(localStorage.getItem('token')).toBe('new');
});

it('logout clears the session while its network request is still pending', async () => {
  localStorage.setItem('token', 'old');
  let finish!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ id: 'old-user' }))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })));
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.user?.id).toBe('old-user'));
  let logout!: Promise<void>;
  act(() => { logout = result.current.logout(); });
  expect(result.current.user).toBeNull();
  expect(localStorage.getItem('token')).toBeNull();
  await act(async () => { finish(reply(null)); await logout; });
});


it('token refresh cannot restore a session after logout', async () => {
  localStorage.setItem('refreshToken', 'old-refresh');
  let finish!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
  const refresh = refreshAccessToken();
  clearTokens();
  finish(reply({ accessToken: 'old-access', refreshToken: 'rotated' }));
  expect(await refresh).toBeNull();
  expect(localStorage.getItem('token')).toBeNull();
});
