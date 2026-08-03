import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authRoutes } from './routes.js';
import { issueRefreshToken } from './refresh-tokens.js';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';

describe('suspended account enforcement', () => {
  const app = Fastify({ logger: false });
  let account: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await app.register(authRoutes, { prefix: '/auth' });
    account = await createTestUser('suspended-account@example.com');
    await prisma.user.update({ where: { id: account.user.id }, data: { status: 'SUSPENDED' } });
  });

  afterAll(async () => { await cleanupUsers([account?.user.id]); await app.close(); });

  it('denies login and an already-issued access token', async () => {
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: account.user.email, password: 'password123' } });
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${account.token}` } });
    expect(login.statusCode).toBe(403);
    expect(me.statusCode).toBe(403);
  });

  it('denies refresh for a suspended account', async () => {
    const refreshToken = await issueRefreshToken(account.user.id);
    const response = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(response.statusCode).toBe(401);
  });
});
