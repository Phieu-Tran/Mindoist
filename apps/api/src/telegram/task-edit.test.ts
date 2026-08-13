import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { telegramRoutes } from './routes.js';

const AGENT_TOKEN = 'telegram-task-edit-agent-token-with-enough-entropy';
const originalAgentToken = process.env.MINDOIST_AGENT_TOKEN;

describe('Telegram task edit drafts', () => {
  let app: FastifyInstance;
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let projectAId: string;
  let taskId: string;

  const agentHeaders = { authorization: `Bearer ${AGENT_TOKEN}` };

  beforeAll(async () => {
    process.env.MINDOIST_AGENT_TOKEN = AGENT_TOKEN;
    app = Fastify({ logger: false });
    await app.register(telegramRoutes);
    userA = await createTestUser('telegram-edit-a@example.com');
    userB = await createTestUser('telegram-edit-b@example.com');
    const projectA = await prisma.project.create({ data: { userId: userA.user.id, name: 'Upwork' } });
    projectAId = projectA.id;
  });

  beforeEach(async () => {
    const userIds = [userA.user.id, userB.user.id];
    await prisma.agentDraft.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramTaskEditDraft.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramTaskBatchDraft.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramTaskDraft.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.task.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramConnection.createMany({
      data: [
        { userId: userA.user.id, telegramUserId: '2001', telegramChatId: '2001' },
        { userId: userB.user.id, telegramUserId: '2002', telegramChatId: '2002' },
      ],
    });
    const task = await prisma.task.create({
      data: {
        userId: userA.user.id,
        title: 'Kiểm tra DNS',
        deadlineDate: new Date('2026-08-04T00:00:00.000Z'),
        deadlineTime: '15:00',
        deadlineTimeZone: 'Asia/Ho_Chi_Minh',
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await cleanupUsers([userA?.user.id, userB?.user.id]);
    await app.close();
    if (originalAgentToken === undefined) delete process.env.MINDOIST_AGENT_TOKEN;
    else process.env.MINDOIST_AGENT_TOKEN = originalAgentToken;
  });

  function prepare(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/task-edit-drafts',
      headers: agentHeaders,
      payload,
    });
  }

  function action(name: 'confirm' | 'cancel', telegramChatId = '2001', locale: 'vi' | 'en' = 'vi') {
    return app.inject({
      method: 'POST',
      url: `/internal/agent/telegram/task-edit-drafts/${name}`,
      headers: agentHeaders,
      payload: { telegramChatId, locale },
    });
  }

  it('finds exactly one match and previews the field change without applying it', async () => {
    const response = await prepare({
      telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS', dueTime: '16:00',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json().data;
    expect(body.state).toBe('ready');
    expect(body.form).toContain('Giờ mới: 16:00');
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.deadlineTime).toBe('15:00');
  });

  it('confirms the edit and applies only the changed field', async () => {
    await prepare({ telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS', dueTime: '16:00' });
    const confirmed = await action('confirm');
    expect(confirmed.statusCode).toBe(200);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.deadlineTime).toBe('16:00');
    expect(task.deadlineDate?.toISOString().slice(0, 10)).toBe('2026-08-04');
  });

  it('returns an ambiguous candidate list without creating a draft when multiple tasks match', async () => {
    await prisma.task.create({ data: { userId: userA.user.id, title: 'Kiểm tra DNS lại', deadlineDate: new Date('2026-08-05T00:00:00.000Z') } });
    const response = await prepare({ telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS' });
    expect(response.statusCode).toBe(201);
    const body = response.json().data;
    expect(body.state).toBe('ambiguous');
    expect(body.form).toContain('1. Kiểm tra DNS —');
    expect(body.form).toContain('2. Kiểm tra DNS lại');
    expect(await prisma.agentDraft.count({ where: { userId: userA.user.id } })).toBe(0);
  });

  it('rejects a search with no matches and never touches another user\'s task', async () => {
    const noMatch = await prepare({ telegramChatId: '2001', locale: 'vi', searchText: 'Không tồn tại' });
    expect(noMatch.statusCode).toBe(404);
    expect(noMatch.json().code).toBe('TELEGRAM_TASK_NOT_FOUND');

    const foreign = await prepare({ telegramChatId: '2002', locale: 'vi', searchText: 'Kiểm tra DNS' });
    expect(foreign.statusCode).toBe(404);
  });

  it('rejects an edit that would push startDate after the existing dueDate', async () => {
    const response = await prepare({
      telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS', startDate: '2026-08-10',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('TELEGRAM_INVALID_DATE_RANGE');
  });

  it('replaces a pending create-task draft when an edit draft is prepared, and vice versa', async () => {
    await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/task-drafts',
      headers: agentHeaders,
      payload: { telegramChatId: '2001', locale: 'vi', title: 'Việc mới' },
    });
    expect(await prisma.agentDraft.count({ where: { userId: userA.user.id, kind: 'CREATE_TASK', status: 'PENDING' } })).toBe(1);

    await prepare({ telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS', dueTime: '17:00' });
    expect(await prisma.agentDraft.count({ where: { userId: userA.user.id, kind: 'CREATE_TASK', status: 'PENDING' } })).toBe(0);
    expect(await prisma.agentDraft.count({ where: { userId: userA.user.id, kind: 'EDIT_TASK', status: 'PENDING' } })).toBe(1);
  });

  it('can be cancelled idempotently without applying the pending change', async () => {
    await prepare({ telegramChatId: '2001', locale: 'vi', searchText: 'Kiểm tra DNS', dueTime: '18:00' });
    const cancelled = await action('cancel');
    expect(cancelled.statusCode).toBe(200);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.deadlineTime).toBe('15:00');

    const again = await action('cancel');
    expect(again.statusCode).toBe(200);
  });
});
