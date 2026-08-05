import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { authRoutes, resetAuthRateLimits } from './routes.js';
import { pruneExpiredRefreshTokens } from './refresh-tokens.js';
import { prisma } from '../db.js';

describe('Auth Routes', () => {
  let app: FastifyInstance;
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalAuthRateLimitWindowMs = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  const originalAuthRegisterIpLimit = process.env.AUTH_REGISTER_IP_LIMIT;
  const originalAuthRegisterEmailLimit = process.env.AUTH_REGISTER_EMAIL_LIMIT;
  const originalAuthLoginIpLimit = process.env.AUTH_LOGIN_IP_LIMIT;
  const originalAuthLoginEmailLimit = process.env.AUTH_LOGIN_EMAIL_LIMIT;

  beforeEach(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    delete process.env.AUTH_REGISTER_IP_LIMIT;
    delete process.env.AUTH_REGISTER_EMAIL_LIMIT;
    delete process.env.AUTH_LOGIN_IP_LIMIT;
    delete process.env.AUTH_LOGIN_EMAIL_LIMIT;
    resetAuthRateLimits();
    app = Fastify({ logger: false });
    await app.register(authRoutes, { prefix: '/auth' });
  });

  afterEach(async () => {
    await app.close();
    resetAuthRateLimits();
    await prisma.user.deleteMany({ where: { email: { endsWith: '@auth.test' } } });
    if (originalGoogleClientId) process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    else delete process.env.GOOGLE_CLIENT_ID;
    if (originalGoogleClientSecret) process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
    else delete process.env.GOOGLE_CLIENT_SECRET;
    if (originalAuthRateLimitWindowMs) process.env.AUTH_RATE_LIMIT_WINDOW_MS = originalAuthRateLimitWindowMs;
    else delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    if (originalAuthRegisterIpLimit) process.env.AUTH_REGISTER_IP_LIMIT = originalAuthRegisterIpLimit;
    else delete process.env.AUTH_REGISTER_IP_LIMIT;
    if (originalAuthRegisterEmailLimit) process.env.AUTH_REGISTER_EMAIL_LIMIT = originalAuthRegisterEmailLimit;
    else delete process.env.AUTH_REGISTER_EMAIL_LIMIT;
    if (originalAuthLoginIpLimit) process.env.AUTH_LOGIN_IP_LIMIT = originalAuthLoginIpLimit;
    else delete process.env.AUTH_LOGIN_IP_LIMIT;
    if (originalAuthLoginEmailLimit) process.env.AUTH_LOGIN_EMAIL_LIMIT = originalAuthLoginEmailLimit;
    else delete process.env.AUTH_LOGIN_EMAIL_LIMIT;
  });

  describe('POST /auth/register', () => {
    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject registration with short password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'short',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject registration with missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          name: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should store email in normalized form', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `  Normalize-${Date.now()}@AUTH.TEST  `,
          password: 'password123',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.user.email).toMatch(/^normalize-\d+@auth\.test$/);

      const user = await prisma.user.findUnique({ where: { email: body.data.user.email } });
      expect(user?.email).toBe(body.data.user.email);
    });

    it('should rate limit repeated registration attempts for the same email', async () => {
      process.env.AUTH_REGISTER_IP_LIMIT = '100';
      process.env.AUTH_REGISTER_EMAIL_LIMIT = '2';
      const email = `register-limit-${Date.now()}@auth.test`;

      const first = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Test User' },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Test User' },
      });
      const third = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Test User' },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(third.statusCode).toBe(429);
      expect(third.headers['retry-after']).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject login with empty password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // This tests validation only - database integration tested in e2e
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      // Should return error (user not found or DB error)
      expect([401, 500]).toContain(response.statusCode);
    });

    it('should rate limit repeated login attempts for the same email', async () => {
      process.env.AUTH_LOGIN_IP_LIMIT = '100';
      process.env.AUTH_LOGIN_EMAIL_LIMIT = '2';
      const payload = { email: `login-limit-${Date.now()}@auth.test`, password: 'wrong-password' };

      const first = await app.inject({ method: 'POST', url: '/auth/login', payload });
      const second = await app.inject({ method: 'POST', url: '/auth/login', payload });
      const third = await app.inject({ method: 'POST', url: '/auth/login', payload });

      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(401);
      expect(third.statusCode).toBe(429);
      expect(third.headers['retry-after']).toBeDefined();
    });

    it('should login with the same account when email casing changes', async () => {
      const email = `case-login-${Date.now()}@auth.test`;
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Test User' },
      });

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `  ${email.toUpperCase()}  `, password: 'password123' },
      });

      expect(register.statusCode).toBe(201);
      expect(login.statusCode).toBe(200);
      expect(JSON.parse(login.body).data.user.id).toBe(JSON.parse(register.body).data.user.id);
    });
  });

  describe('POST /auth/set-password', () => {
    it('should reject requests without a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/set-password',
        payload: { password: 'password123' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject short passwords', async () => {
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `short-password-${Date.now()}@auth.test`,
          password: 'password123',
          name: 'Test User',
        },
      });
      const token = JSON.parse(register.body).data.accessToken;

      const response = await app.inject({
        method: 'POST',
        url: '/auth/set-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { password: 'short' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update the password for an authenticated user', async () => {
      const email = `set-password-${Date.now()}@auth.test`;
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Test User' },
      });
      const token = JSON.parse(register.body).data.accessToken;

      const setPassword = await app.inject({
        method: 'POST',
        url: '/auth/set-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { password: 'new-password123' },
      });
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'new-password123' },
      });

      expect(setPassword.statusCode).toBe(200);
      expect(JSON.parse(setPassword.body).success).toBe(true);
      expect(login.statusCode).toBe(200);
      expect(JSON.parse(login.body).success).toBe(true);
    });
  });

  describe('POST /auth/complete-onboarding', () => {
    async function registerOnboardingUser() {
      const email = `onboarding-${Date.now()}-${Math.random()}@auth.test`;
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Google Name' },
      });
      const data = JSON.parse(register.body).data;
      await prisma.user.update({
        where: { email },
        data: { onboardingRequired: true },
      });
      return { email, token: data.accessToken };
    }

    it('requires an authenticated session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/complete-onboarding',
        payload: { name: 'Test User', timeZone: 'Asia/Ho_Chi_Minh' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects an invalid time zone without completing onboarding', async () => {
      const { email, token } = await registerOnboardingUser();
      const response = await app.inject({
        method: 'POST',
        url: '/auth/complete-onboarding',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Confirmed Name', timeZone: 'Not/A_Time_Zone' },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      expect(response.statusCode).toBe(400);
      expect(user.onboardingRequired).toBe(true);
      expect(user.name).toBe('Google Name');
    });

    it('saves the profile and completes onboarding without requiring a password', async () => {
      const { email, token } = await registerOnboardingUser();
      const response = await app.inject({
        method: 'POST',
        url: '/auth/complete-onboarding',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Confirmed Name', timeZone: 'Asia/Ho_Chi_Minh' },
      });
      const body = JSON.parse(response.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      expect(response.statusCode).toBe(200);
      expect(body.data).toMatchObject({
        name: 'Confirmed Name',
        timeZone: 'Asia/Ho_Chi_Minh',
        onboardingRequired: false,
      });
      expect(user.onboardingRequired).toBe(false);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'password123' },
      });
      expect(login.statusCode).toBe(200);
    });

    it('sets the optional backup password when supplied', async () => {
      const { email, token } = await registerOnboardingUser();
      const response = await app.inject({
        method: 'POST',
        url: '/auth/complete-onboarding',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Confirmed Name',
          timeZone: 'Asia/Ho_Chi_Minh',
          password: 'backup-password123',
        },
      });
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'backup-password123' },
      });

      expect(response.statusCode).toBe(200);
      expect(login.statusCode).toBe(200);
    });
  });

  describe('GET /auth/me', () => {
    it('should reject request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Missing token');
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid token');
    });

    it('should reject request without Bearer prefix', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'InvalidToken',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Missing token');
    });
  });

  describe('POST /auth/logout', () => {
    it('should reject logout without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject logout with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /auth/google/url', () => {
    it('should explain when Google sign-in is not configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/url',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Google sign-in is not configured');
    });

    it('should include allowed mobile return targets in Google state', async () => {
      process.env.GOOGLE_CLIENT_ID = 'google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';

      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/url?returnTo=http%3A%2F%2Flocalhost%3A8083',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const url = new URL(body.data.url);
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('should ignore untrusted mobile return targets', async () => {
      process.env.GOOGLE_CLIENT_ID = 'google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';

      const response = await app.inject({
        method: 'GET',
        url: '/auth/google/url?returnTo=https%3A%2F%2Fevil.example',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const url = new URL(body.data.url);
      expect(url.searchParams.get('state')).toBeNull();
    });
  });

  describe('POST /auth/refresh', () => {
    const email = 'refresh@auth.test';

    async function registerUser() {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Refresh' },
      });
      return JSON.parse(response.body).data as {
        accessToken: string;
        refreshToken: string;
      };
    }

    it('issues a refresh token alongside the access token', async () => {
      const data = await registerUser();
      expect(typeof data.refreshToken).toBe('string');
      expect(data.refreshToken.length).toBeGreaterThan(20);
    });

    it('trades a refresh token for a working new pair', async () => {
      const { refreshToken } = await registerUser();

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const next = JSON.parse(response.body).data;
      expect(next.accessToken).toBeTruthy();
      // Rotation: the replacement must not be the token just spent.
      expect(next.refreshToken).not.toBe(refreshToken);

      const me = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${next.accessToken}` },
      });
      expect(me.statusCode).toBe(200);
    });

    it('lets a second client through when two race for the same token', async () => {
      // Access tokens expire at the same instant in every open tab, so two of
      // them reaching for the same refresh token is routine - and must not cost
      // the user their session.
      const { refreshToken } = await registerUser();

      const first = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const loser = JSON.parse(second.body).data;
      const me = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${loser.accessToken}` },
      });
      expect(me.statusCode).toBe(200);
    });

    it('treats a replay long after rotation as theft and drops every session', async () => {
      const { refreshToken } = await registerUser();
      const rotated = JSON.parse(
        (await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } }))
          .body,
      ).data;

      // Age the rotation past the grace window; inside it a replay is only ever
      // read as a second tab.
      await prisma.refreshToken.updateMany({
        where: { user: { email }, rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const replay = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(replay.statusCode).toBe(401);

      const afterBreach = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: rotated.refreshToken },
      });
      expect(afterBreach.statusCode).toBe(401);
    });

    it('refuses a logged-out token without dropping the other devices', async () => {
      // Logging out is the user's own doing, so a stale retry of that token is
      // not evidence of theft - the phone must stay signed in.
      const phone = await registerUser();
      const laptop = JSON.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email, password: 'password123' },
          })
        ).body,
      ).data as { accessToken: string; refreshToken: string };

      await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { authorization: `Bearer ${laptop.accessToken}` },
        payload: { refreshToken: laptop.refreshToken },
      });

      const replay = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: laptop.refreshToken },
      });
      expect(replay.statusCode).toBe(401);

      const stillSignedIn = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: phone.refreshToken },
      });
      expect(stillSignedIn.statusCode).toBe(200);
    });

    it('refuses an unknown token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('revokes the refresh token on logout', async () => {
      const { accessToken, refreshToken } = await registerUser();

      const loggedOut = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { refreshToken },
      });
      expect(loggedOut.statusCode).toBe(200);

      const afterLogout = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(afterLogout.statusCode).toBe(401);
    });

    it('prunes spent rows once they are too old to detect anything', async () => {
      const { refreshToken } = await registerUser();
      await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });

      const stale = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await prisma.refreshToken.updateMany({
        where: { user: { email }, revokedAt: { not: null } },
        data: { revokedAt: stale },
      });

      await pruneExpiredRefreshTokens();

      const left = await prisma.refreshToken.count({
        where: { user: { email }, revokedAt: { not: null } },
      });
      expect(left).toBe(0);
      // The live token the rotation handed out has to survive the sweep.
      const live = await prisma.refreshToken.count({
        where: { user: { email }, revokedAt: null },
      });
      expect(live).toBe(1);
    });
  });

  describe('DELETE /auth/account', () => {
    const email = 'delete-me@auth.test';

    async function registerAndGetToken() {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Delete Me' },
      });
      return JSON.parse(response.body).data.accessToken as string;
    }

    it('deletes the account and everything it owns', async () => {
      const token = await registerAndGetToken();
      const user = await prisma.user.findUnique({ where: { email } });
      await prisma.task.create({ data: { userId: user!.id, title: 'Owned task' } });

      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/account',
        headers: { authorization: `Bearer ${token}` },
        payload: { confirmEmail: email },
      });

      expect(response.statusCode).toBe(200);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      // Cascades must take the owned rows too, or deletion is not really deletion.
      expect(await prisma.task.count({ where: { userId: user!.id } })).toBe(0);
    });

    it('accepts the confirmation email in any casing', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/account',
        headers: { authorization: `Bearer ${token}` },
        payload: { confirmEmail: '  Delete-Me@Auth.Test  ' },
      });

      expect(response.statusCode).toBe(200);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('refuses when the confirmation email belongs to someone else', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/account',
        headers: { authorization: `Bearer ${token}` },
        payload: { confirmEmail: 'someone-else@auth.test' },
      });

      expect(response.statusCode).toBe(400);
      expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
    });

    it('refuses without a confirmation', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/account',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
    });

    it('rejects unauthenticated callers', async () => {
      await registerAndGetToken();

      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/account',
        payload: { confirmEmail: email },
      });

      expect(response.statusCode).toBe(401);
      expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
    });
  });
});
