import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.js';
import { createTestUser } from '../test-helpers.js';
import { agentDraftRoutes } from './routes.js';

describe('AgentDraft lifecycle', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(agentDraftRoutes);
    await app.ready();
    const user = await createTestUser(`agent-draft-${Date.now()}-${Math.random()}@test.com`);
    token = user.token;
    userId = user.user.id;
  });

  afterEach(async () => {
    await app.close();
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  async function createDraft(body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/agent/drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  it('validates payload by kind instead of accepting an arbitrary object', async () => {
    const response = await createDraft({ transport: 'MCP', kind: 'EDIT_TASK', payload: { title: 'missing task id' } });
    expect(response.statusCode).toBe(400);
  });

  it('confirms a create task draft once and returns the same result on retry', async () => {
    const created = await createDraft({
      transport: 'MCP',
      kind: 'CREATE_TASK',
      payload: {
        title: 'Created through one lifecycle',
        estimateMin: 45,
        plannedTime: {
          startAt: '2026-08-13T02:00:00.000Z',
          endAt: '2026-08-13T02:45:00.000Z',
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const draftId = created.json().data.id as string;

    const first = await app.inject({
      method: 'POST',
      url: `/agent/drafts/${draftId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/agent/drafts/${draftId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.resultIds).toEqual(first.json().data.resultIds);
    expect(await prisma.task.count({ where: { userId, title: 'Created through one lifecycle' } })).toBe(1);
    expect(await prisma.timeBlock.count({ where: { userId } })).toBe(1);
  });

  it('marks an expired draft and does not execute it', async () => {
    const created = await createDraft({
      transport: 'WEB',
      kind: 'CREATE_TASK',
      payload: { title: 'Must not be created' },
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const response = await app.inject({
      method: 'POST',
      url: `/agent/drafts/${created.json().data.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(410);
    expect(await prisma.task.count({ where: { userId, title: 'Must not be created' } })).toBe(0);
    expect((await prisma.agentDraft.findUniqueOrThrow({ where: { id: created.json().data.id } })).status).toBe('EXPIRED');
  });

  it('does not allow another account to inspect or confirm a draft', async () => {
    const created = await createDraft({ transport: 'MCP', kind: 'CREATE_TASK', payload: { title: 'Private draft' } });
    const other = await createTestUser(`agent-draft-other-${Date.now()}@test.com`);
    try {
      const inspected = await app.inject({
        method: 'GET',
        url: `/agent/drafts/${created.json().data.id}`,
        headers: { authorization: `Bearer ${other.token}` },
      });
      const confirmed = await app.inject({
        method: 'POST',
        url: `/agent/drafts/${created.json().data.id}/confirm`,
        headers: { authorization: `Bearer ${other.token}` },
      });
      expect(inspected.statusCode).toBe(404);
      expect(confirmed.statusCode).toBe(404);
    } finally {
      await prisma.user.deleteMany({ where: { id: other.user.id } });
    }
  });
});
