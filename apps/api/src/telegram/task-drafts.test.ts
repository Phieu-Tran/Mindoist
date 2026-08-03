import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { telegramRoutes } from './routes.js';

const AGENT_TOKEN = 'telegram-task-draft-agent-token-with-enough-entropy';
const originalAgentToken = process.env.MINDOIST_AGENT_TOKEN;

describe('Telegram task draft confirmation', () => {
  let app: FastifyInstance;
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let projectAId: string;
  let domainTagId: string;

  const agentHeaders = { authorization: `Bearer ${AGENT_TOKEN}` };

  beforeAll(async () => {
    process.env.MINDOIST_AGENT_TOKEN = AGENT_TOKEN;
    app = Fastify({ logger: false });
    await app.register(telegramRoutes);
    userA = await createTestUser('telegram-draft-a@example.com');
    userB = await createTestUser('telegram-draft-b@example.com');
    const projectA = await prisma.project.create({ data: { userId: userA.user.id, name: 'Upwork' } });
    projectAId = projectA.id;
    await prisma.project.create({ data: { userId: userB.user.id, name: 'Private B' } });
    const domainTag = await prisma.tag.create({ data: { userId: userA.user.id, name: 'Domain', color: 'rose' } });
    domainTagId = domainTag.id;
    await prisma.tag.create({ data: { userId: userB.user.id, name: 'Private tag' } });
  });

  beforeEach(async () => {
    const userIds = [userA.user.id, userB.user.id];
    await prisma.telegramTaskDraft.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.task.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramConnection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.telegramConnection.createMany({
      data: [
        { userId: userA.user.id, telegramUserId: '1001', telegramChatId: '1001' },
        { userId: userB.user.id, telegramUserId: '1002', telegramChatId: '1002' },
      ],
    });
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
      url: '/internal/agent/telegram/task-drafts',
      headers: agentHeaders,
      payload,
    });
  }

  function action(name: 'confirm' | 'cancel', telegramChatId = '1001', locale: 'vi' | 'en' = 'vi') {
    return app.inject({
      method: 'POST',
      url: `/internal/agent/telegram/task-drafts/${name}`,
      headers: agentHeaders,
      payload: { telegramChatId, locale },
    });
  }

  it('requires service authentication and a linked trusted chat', async () => {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/task-drafts',
      payload: { telegramChatId: '1001', locale: 'vi', title: 'Secret' },
    });
    expect(unauthorized.statusCode).toBe(401);

    const unlinked = await prepare({ telegramChatId: '9999', locale: 'vi', title: 'Secret' });
    expect(unlinked.statusCode).toBe(403);
    expect(unlinked.json().code).toBe('TELEGRAM_NOT_CONNECTED');
  });

  it('prepares a fixed form without creating a task and resolves only an owned project', async () => {
    const response = await prepare({
      telegramChatId: '1001',
      locale: 'vi',
      title: 'Gửi báo cáo',
      projectName: 'upWORK',
      dueDate: '2026-08-03',
      dueTime: '09:00',
      priority: 2,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.form).toContain('Xác nhận tạo công việc (chưa tạo)');
    expect(response.json().data.form).toContain('Dự án: Upwork');
    expect(response.json().data.form).toContain('bản nháp đang hoạt động duy nhất');
    expect(await prisma.task.count({ where: { userId: userA.user.id } })).toBe(0);
    const draft = await prisma.telegramTaskDraft.findFirst({ where: { userId: userA.user.id } });
    expect(draft).toMatchObject({ projectId: projectAId, status: 'PENDING', title: 'Gửi báo cáo' });

    const foreignProject = await prepare({
      telegramChatId: '1001', locale: 'vi', title: 'Không được tạo', projectName: 'Private B',
    });
    expect(foreignProject.statusCode).toBe(404);
  });

  it('replaces the pending draft and confirms exactly once under concurrent retry', async () => {
    await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Bản cũ' });
    await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Bản mới', projectName: 'Upwork' });

    const [first, second] = await Promise.all([action('confirm'), action('confirm')]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(await prisma.task.count({ where: { userId: userA.user.id } })).toBe(1);
    const task = await prisma.task.findFirst({ where: { userId: userA.user.id } });
    expect(task).toMatchObject({ title: 'Bản mới', projectId: projectAId });
    expect(first.json().data.taskId).toBe(second.json().data.taskId);
    expect(await prisma.telegramTaskDraft.count({ where: { userId: userA.user.id, status: 'CANCELLED' } })).toBe(1);
  });

  it('persists an explicit color and existing owned tags only after confirmation', async () => {
    const prepared = await prepare({
      telegramChatId: '1001',
      locale: 'vi',
      title: 'Gia hạn domain omicrm.dev',
      projectName: 'Upwork',
      color: 'rose',
      tagNames: ['#Domain', 'domain'],
      dueDate: '2026-08-03',
      dueTime: '11:00',
    });
    expect(prepared.statusCode).toBe(201);
    expect(prepared.json().data.form).toContain('Màu: Đỏ hồng');
    expect(prepared.json().data.form).toContain('Thẻ: #Domain');
    expect(await prisma.task.count({ where: { userId: userA.user.id } })).toBe(0);

    const confirmed = await action('confirm');
    expect(confirmed.statusCode).toBe(200);
    const task = await prisma.task.findFirstOrThrow({
      where: { userId: userA.user.id },
      include: { taskTags: true },
    });
    expect(task).toMatchObject({ color: 'rose', projectId: projectAId, dueTime: '11:00' });
    expect(task.taskTags).toHaveLength(1);
    expect(task.taskTags[0]?.tagId).toBe(domainTagId);
  });

  it('rejects missing or foreign tags and revalidates tags at confirmation', async () => {
    const missing = await prepare({
      telegramChatId: '1001', locale: 'vi', title: 'Missing tag', tagNames: ['Không tồn tại'],
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('TELEGRAM_TAG_NOT_FOUND');

    const foreign = await prepare({
      telegramChatId: '1001', locale: 'vi', title: 'Foreign tag', tagNames: ['Private tag'],
    });
    expect(foreign.statusCode).toBe(404);

    const temporary = await prisma.tag.create({ data: { userId: userA.user.id, name: 'Temporary' } });
    expect((await prepare({
      telegramChatId: '1001', locale: 'vi', title: 'Unavailable tag', tagNames: ['Temporary'],
    })).statusCode).toBe(201);
    await prisma.tag.update({ where: { id: temporary.id }, data: { deletedAt: new Date() } });
    const unavailable = await action('confirm');
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json().code).toBe('TELEGRAM_TAG_UNAVAILABLE');
    expect(await prisma.task.count({ where: { userId: userA.user.id } })).toBe(0);
  });

  it('keeps exactly one pending draft when prepare requests race', async () => {
    const [first, second] = await Promise.all([
      prepare({ telegramChatId: '1001', locale: 'vi', title: 'Đồng thời A' }),
      prepare({ telegramChatId: '1001', locale: 'vi', title: 'Đồng thời B' }),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(await prisma.telegramTaskDraft.count({
      where: { userId: userA.user.id, status: 'PENDING' },
    })).toBe(1);
    expect(await prisma.telegramTaskDraft.count({
      where: { userId: userA.user.id, status: 'CANCELLED' },
    })).toBe(1);
  });

  it('blocks cancelled and expired drafts', async () => {
    await prepare({ telegramChatId: '1001', locale: 'en', title: 'Cancel me' });
    expect((await action('cancel', '1001', 'en')).statusCode).toBe(200);
    expect((await action('cancel', '1001', 'en')).statusCode).toBe(200);
    expect((await action('confirm', '1001', 'en')).statusCode).toBe(409);

    await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Expired' });
    await prisma.telegramTaskDraft.updateMany({
      where: { userId: userA.user.id, status: 'PENDING' },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await action('confirm');
    expect(expired.statusCode).toBe(410);
    expect(await prisma.task.count({ where: { userId: userA.user.id } })).toBe(0);
  });

  it('keeps users isolated and disconnect revokes pending confirmation', async () => {
    await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Only A' });
    const userBConfirm = await action('confirm', '1002');
    expect(userBConfirm.statusCode).toBe(404);

    const disconnected = await app.inject({
      method: 'DELETE',
      url: '/integrations/telegram/connection',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(disconnected.statusCode).toBe(200);
    expect((await action('confirm')).statusCode).toBe(403);
    const draft = await prisma.telegramTaskDraft.findFirst({ where: { userId: userA.user.id } });
    expect(draft?.status).toBe('CANCELLED');
  });

  it('leaves no pending draft when prepare races with disconnect', async () => {
    const [prepareResponse, disconnected] = await Promise.all([
      prepare({ telegramChatId: '1001', locale: 'vi', title: 'Race disconnect' }),
      app.inject({
        method: 'DELETE',
        url: '/integrations/telegram/connection',
        headers: { authorization: `Bearer ${userA.token}` },
      }),
    ]);

    expect(disconnected.statusCode).toBe(200);
    expect([201, 403]).toContain(prepareResponse.statusCode);
    expect(await prisma.telegramConnection.count({ where: { userId: userA.user.id } })).toBe(0);
    expect(await prisma.telegramTaskDraft.count({
      where: { userId: userA.user.id, status: 'PENDING' },
    })).toBe(0);
  });

  it('rejects malformed dates and a time without a date', async () => {
    expect((await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Bad', dueDate: '2026-02-30' })).statusCode).toBe(400);
    expect((await prepare({ telegramChatId: '1001', locale: 'vi', title: 'Bad', dueTime: '09:00' })).statusCode).toBe(400);
  });
});
