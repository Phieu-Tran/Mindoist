import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { telegramRoutes } from './routes.js';

const AGENT_TOKEN = 'telegram-task-query-agent-token-with-enough-entropy';
const originalAgentToken = process.env.MINDOIST_AGENT_TOKEN;

describe('Telegram read-only task queries', () => {
  let app: FastifyInstance;
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let projectId: string;
  let tagId: string;
  const agentHeaders = { authorization: `Bearer ${AGENT_TOKEN}` };

  beforeAll(async () => {
    process.env.MINDOIST_AGENT_TOKEN = AGENT_TOKEN;
    app = Fastify({ logger: false });
    await app.register(telegramRoutes);
    userA = await createTestUser('telegram-query-a@example.com');
    userB = await createTestUser('telegram-query-b@example.com');
    await prisma.user.update({ where: { id: userA.user.id }, data: { timeZone: 'Asia/Ho_Chi_Minh' } });
    projectId = (await prisma.project.create({ data: { userId: userA.user.id, name: '💼VIHAT' } })).id;
    tagId = (await prisma.tag.create({ data: { userId: userA.user.id, name: 'Domain' } })).id;
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { userId: { in: [userA.user.id, userB.user.id] } } });
    await prisma.telegramConnection.deleteMany({ where: { userId: { in: [userA.user.id, userB.user.id] } } });
    await prisma.telegramConnection.createMany({
      data: [
        { userId: userA.user.id, telegramUserId: '2001', telegramChatId: '2001' },
        { userId: userB.user.id, telegramUserId: '2002', telegramChatId: '2002' },
      ],
    });
  });

  afterAll(async () => {
    await cleanupUsers([userA?.user.id, userB?.user.id]);
    await app.close();
    if (originalAgentToken === undefined) delete process.env.MINDOIST_AGENT_TOKEN;
    else process.env.MINDOIST_AGENT_TOKEN = originalAgentToken;
  });

  function query(path: 'list' | 'summary', payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/internal/agent/telegram/tasks/${path}`,
      headers: agentHeaders,
      payload: { telegramChatId: '2001', locale: 'vi', ...payload },
    });
  }

  it('lists only linked-user tasks matching an exact project, tag, and date', async () => {
    const matching = await prisma.task.create({
      data: {
        userId: userA.user.id,
        projectId,
        title: 'Gia hạn domain omicrm.dev',
        dueDate: new Date('2026-08-03T00:00:00.000Z'),
        deadlineDate: new Date('2026-08-03T00:00:00.000Z'),
        dueTime: '11:00',
      },
    });
    await prisma.taskTag.create({ data: { taskId: matching.id, tagId } });
    await prisma.task.create({
      data: { userId: userA.user.id, projectId, title: 'Không có tag', dueDate: new Date('2026-08-03T00:00:00.000Z') },
    });
    await prisma.task.create({
      data: { userId: userB.user.id, title: 'Dữ liệu riêng user B', dueDate: new Date('2026-08-03T00:00:00.000Z') },
    });

    const response = await query('list', {
      period: 'date', date: '2026-08-03', projectName: '💼vihat', tagNames: ['#Domain'], status: 'open',
    });
    expect(response.statusCode).toBe(200);
    const message = response.json().data.message as string;
    expect(message).toContain('Gia hạn domain omicrm.dev');
    expect(message).toContain('2026-08-03 11:00');
    expect(message).toContain('#Domain');
    expect(message).not.toContain('Không có tag');
    expect(message).not.toContain('Dữ liệu riêng user B');
  });

  it('returns fixed read-only statistics for an explicit date', async () => {
    await prisma.task.createMany({
      data: [
        { userId: userA.user.id, projectId, title: 'Open due', dueDate: new Date('2026-08-03T00:00:00.000Z') },
        { userId: userA.user.id, projectId, title: 'Completed due', dueDate: new Date('2026-08-03T00:00:00.000Z'), completedAt: new Date('2026-08-03T04:00:00.000Z') },
        { userId: userA.user.id, projectId, title: 'Older open', dueDate: new Date('2026-08-02T00:00:00.000Z') },
      ],
    });

    const response = await query('summary', { period: 'date', date: '2026-08-03', projectName: '💼VIHAT' });
    expect(response.statusCode).toBe(200);
    const message = response.json().data.message as string;
    expect(message).toContain('Đến hạn: 2');
    expect(message).toContain('Còn mở: 1');
    expect(message).toContain('Đã hoàn thành trong số đến hạn: 1');
    expect(message).toContain('Hoàn thành trong khoảng này: 1');
  });

  it('rejects malformed explicit dates and unlinked chats', async () => {
    expect((await query('list', { period: 'date', date: '2026-02-30' })).statusCode).toBe(400);
    const unlinked = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/tasks/list',
      headers: agentHeaders,
      payload: { telegramChatId: '9999', locale: 'vi', period: 'today' },
    });
    expect(unlinked.statusCode).toBe(403);
    expect(unlinked.json().code).toBe('TELEGRAM_NOT_CONNECTED');
  });
});
