import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { adminRoutes } from './routes.js';

const AGENT_TOKEN = 'admin-provider-test-agent-token-with-enough-entropy';
const ROOT_SECRET = 'admin-provider-test-root-secret-with-enough-entropy';

describe('admin provider control plane', () => {
  let app: FastifyInstance;
  let admin: Awaited<ReturnType<typeof createTestUser>>;
  let member: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    process.env.MINDOIST_AGENT_TOKEN = AGENT_TOKEN;
    process.env.JWT_SECRET = ROOT_SECRET;
    app = Fastify({ logger: false });
    await app.register(adminRoutes);
    admin = await createTestUser('admin-control-plane@example.com');
    member = await createTestUser('member-control-plane@example.com');
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
    await prisma.user.update({ where: { id: member.user.id }, data: { role: 'USER' } });
  });

  beforeEach(async () => {
    await prisma.adminAuditLog.deleteMany({});
    await prisma.aiProviderConfig.deleteMany({});
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN', status: 'ACTIVE' } });
    await prisma.user.update({ where: { id: member.user.id }, data: { role: 'USER', status: 'ACTIVE' } });
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({});
    await prisma.aiProviderConfig.deleteMany({});
    await cleanupUsers([admin?.user.id, member?.user.id]);
    await app.close();
  });

  it('rejects missing and non-admin user credentials', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/providers' })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET', url: '/admin/providers', headers: { authorization: `Bearer ${member.token}` },
    })).statusCode).toBe(403);
  });

  it('stores a provider without returning its plaintext or ciphertext', async () => {
    const apiKey = 'gemini-test-api-key-123456';
    const created = await app.inject({
      method: 'POST',
      url: '/admin/providers',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { label: 'Primary Gemini', provider: 'GEMINI', model: 'gemini-2.5-flash', apiKey, priority: 10 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(apiKey);
    expect(created.json().data).toMatchObject({ hasApiKey: true, apiKeyHint: '••••3456' });
    expect(created.json().data).not.toHaveProperty('encryptedApiKey');

    const stored = await prisma.aiProviderConfig.findFirstOrThrow();
    expect(stored.encryptedApiKey).not.toContain(apiKey);
    const audit = await prisma.adminAuditLog.findFirstOrThrow();
    expect(JSON.stringify(audit.metadata)).not.toContain(apiKey);
  });

  it('persists a safe provider health result without exposing the API key', async () => {
    const apiKey = 'health-check-provider-key-9876';
    const created = await app.inject({
      method: 'POST', url: '/admin/providers', headers: { authorization: `Bearer ${admin.token}` },
      payload: { label: 'Health Gemini', provider: 'GEMINI', model: 'gemini-health', apiKey, priority: 10 },
    });
    const providerId = created.json().data.id as string;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));

    try {
      const response = await app.inject({
        method: 'POST', url: `/admin/providers/${providerId}/test`,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(apiKey);
      expect(response.json().data).toMatchObject({ ok: true, status: 200 });

      const stored = await prisma.aiProviderConfig.findUniqueOrThrow({ where: { id: providerId } });
      expect(stored.lastTestStatus).toBe('HEALTHY');
      expect(stored.lastTestedAt).toBeInstanceOf(Date);
      expect(stored.lastTestLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stored.lastTestHttpStatus).toBe(200);
      expect(stored.lastTestError).toBeNull();

      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      const failed = await app.inject({
        method: 'POST', url: `/admin/providers/${providerId}/test`,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain(apiKey);

      const failedStored = await prisma.aiProviderConfig.findUniqueOrThrow({ where: { id: providerId } });
      expect(failedStored.lastTestStatus).toBe('FAILED');
      expect(failedStored.lastTestHttpStatus).toBe(401);
      expect(failedStored.lastTestError).toBe('Provider returned HTTP 401');

      const changed = await app.inject({
        method: 'PATCH', url: `/admin/providers/${providerId}`,
        headers: { authorization: `Bearer ${admin.token}` }, payload: { model: 'gemini-health-v2' },
      });
      expect(changed.statusCode).toBe(200);
      const reset = await prisma.aiProviderConfig.findUniqueOrThrow({ where: { id: providerId } });
      expect(reset.lastTestStatus).toBeNull();
      expect(reset.lastTestedAt).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('never enables more than six providers under concurrent creates', async () => {
    const create = (index: number) => app.inject({
      method: 'POST',
      url: '/admin/providers',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: `Provider ${index}`,
        provider: 'GEMINI',
        model: 'gemini-2.5-flash',
        apiKey: `gemini-capacity-key-${index}`,
        priority: index,
      },
    });
    for (let index = 1; index <= 5; index += 1) {
      expect((await create(index)).statusCode).toBe(201);
    }

    const responses = await Promise.all([create(6), create(7)]);

    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409]);
    await expect(prisma.aiProviderConfig.count({ where: { enabled: true } })).resolves.toBe(6);
  });

  it('does not leave PicoClaw running a disabled last-known-good provider', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/providers',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: 'Only provider', provider: 'GEMINI', model: 'gemini-2.5-flash',
        apiKey: 'only-provider-api-key', priority: 1,
      },
    });
    const providerId = created.json().data.id as string;

    const disable = await app.inject({
      method: 'PATCH', url: `/admin/providers/${providerId}`,
      headers: { authorization: `Bearer ${admin.token}` }, payload: { enabled: false },
    });
    const remove = await app.inject({
      method: 'DELETE', url: `/admin/providers/${providerId}`,
      headers: { authorization: `Bearer ${admin.token}` },
    });

    expect(disable.statusCode).toBe(409);
    expect(remove.statusCode).toBe(409);
    await expect(prisma.aiProviderConfig.count({ where: { enabled: true } })).resolves.toBe(1);
  });

  it('returns enabled provider secrets only through the agent-authenticated projection', async () => {
    const apiKey = 'agent-only-secret-key-9876';
    await app.inject({
      method: 'POST', url: '/admin/providers', headers: { authorization: `Bearer ${admin.token}` },
      payload: { label: 'Primary', provider: 'OPENAI', model: 'gpt-5-mini', apiKey, priority: 5 },
    });

    expect((await app.inject({ method: 'GET', url: '/internal/agent/ai-config' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET', url: '/internal/agent/ai-config', headers: { authorization: `Bearer ${AGENT_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.providers[0]).toMatchObject({ apiKey, model: 'gpt-5-mini', priority: 5 });
    expect(response.json().data.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it('protects the last active admin from demotion and self-suspension', async () => {
    const demote = await app.inject({
      method: 'PATCH', url: `/admin/users/${admin.user.id}`,
      headers: { authorization: `Bearer ${admin.token}` }, payload: { role: 'USER' },
    });
    const suspend = await app.inject({
      method: 'PATCH', url: `/admin/users/${admin.user.id}`,
      headers: { authorization: `Bearer ${admin.token}` }, payload: { status: 'SUSPENDED' },
    });
    expect(demote.statusCode).toBe(409);
    expect(suspend.statusCode).toBe(409);
  });

  it('keeps one active administrator under concurrent demotions', async () => {
    await prisma.user.update({ where: { id: member.user.id }, data: { role: 'ADMIN' } });
    const unrelatedAdmins = await prisma.user.findMany({
      where: { role: 'ADMIN', id: { notIn: [admin.user.id, member.user.id] } },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: unrelatedAdmins.map(user => user.id) } },
      data: { role: 'USER' },
    });

    try {
      const [demoteMember, demoteAdmin] = await Promise.all([
        app.inject({
          method: 'PATCH', url: `/admin/users/${member.user.id}`,
          headers: { authorization: `Bearer ${admin.token}` }, payload: { role: 'USER' },
        }),
        app.inject({
          method: 'PATCH', url: `/admin/users/${admin.user.id}`,
          headers: { authorization: `Bearer ${member.token}` }, payload: { role: 'USER' },
        }),
      ]);

      expect([demoteMember.statusCode, demoteAdmin.statusCode].sort()).toEqual([200, 409]);
      await expect(prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).resolves.toBe(1);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: unrelatedAdmins.map(user => user.id) } },
        data: { role: 'ADMIN' },
      });
    }
  });
});
