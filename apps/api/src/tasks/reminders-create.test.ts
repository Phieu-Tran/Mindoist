import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { taskRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let taskId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(taskRoutes);

  const user = await createTestUser('reminders-create-test@example.com');
  userId = user.user.id;
  userToken = user.token;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.reminder.deleteMany({ where: { task: { userId } } });
  await prisma.task.deleteMany({ where: { userId } });
  const task = await prisma.task.create({ data: { userId, title: 'Reminder Task' } });
  taskId = task.id;
});

describe('POST /tasks/:id/reminders', () => {
  it('creates a reminder for a future time', async () => {
    const remindAt = new Date(Date.now() + 60 * 60 * 1000);
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/reminders`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { remindAt: remindAt.toISOString() },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.remindAt).toBe(remindAt.toISOString());
  });

  it('rejects a remindAt that has already passed', async () => {
    const remindAt = new Date(Date.now() - 60 * 60 * 1000);
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/reminders`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { remindAt: remindAt.toISOString() },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

describe('PATCH /reminders/:id', () => {
  it('rejects snoozing a reminder into the past', async () => {
    const reminder = await prisma.reminder.create({
      data: { taskId, remindAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { remindAt: new Date(Date.now() - 60 * 1000).toISOString() },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows snoozing a reminder into the future', async () => {
    const reminder = await prisma.reminder.create({
      data: { taskId, remindAt: new Date(Date.now() + 60 * 60 * 1000), isSent: true },
    });
    const remindAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const res = await app.inject({
      method: 'PATCH',
      url: `/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { remindAt: remindAt.toISOString() },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isSent).toBe(false);
  });
});
