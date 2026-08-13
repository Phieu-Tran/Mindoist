import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiKeyRoutes } from '../api-keys/routes.js';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';
import { taskRoutes } from '../tasks/routes.js';
import { requireAuth } from './auth.js';

describe('API key scope enforcement', () => {
  let app: FastifyInstance;
  let userId: string;
  let jwt: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(taskRoutes);
    await app.register(apiKeyRoutes);
    app.patch('/settings', { preHandler: requireAuth }, async () => ({ success: true }));
    app.get('/export/json', { preHandler: requireAuth }, async () => ({ success: true }));
    app.post('/drive/restore/:fileId', { preHandler: requireAuth }, async () => ({ success: true }));
    const user = await createTestUser('auth-scope-test@example.com');
    userId = user.user.id;
    jwt = user.token;
  });

  beforeEach(async () => {
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.task.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { userId } });
    await cleanupUsers([userId]);
    await app.close();
  });

  async function createKey(scopes: string[]) {
    const token = `mdt_test_${scopes.join('_')}`;
    await prisma.apiKey.create({
      data: {
        userId,
        name: 'scope test',
        scopes,
        hash: createHash('sha256').update(token).digest('hex'),
      },
    });
    return token;
  }

  it('allows reads but rejects writes for a read-only task key', async () => {
    const token = await createKey(['tasks:read']);

    const read = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'must be rejected' },
    });
    expect(write.statusCode).toBe(403);
    expect(JSON.parse(write.body).error).toContain('tasks:write');
  });

  it('allows a write key to create tasks', async () => {
    const token = await createKey(['tasks:write']);
    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'created with scoped key' },
    });
    expect(response.statusCode).toBe(201);
  });

  it('rejects unknown scopes when creating a key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: 'invalid', scopes: ['admin:everything'] },
    });
    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['tasks:write', 'PATCH', '/settings'],
    ['schedule:read', 'GET', '/export/json'],
    ['schedule:write', 'POST', '/drive/restore/backup-1'],
  ])('does not let %s escape into privileged endpoint %s', async (scope, method, url) => {
    const token = await createKey([scope]);
    const response = await app.inject({
      method: method as 'GET' | 'POST' | 'PATCH',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toContain('not defined');
  });

  it('rejects a revoked key', async () => {
    const token = await createKey(['tasks:read']);
    await prisma.apiKey.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    const response = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

});
