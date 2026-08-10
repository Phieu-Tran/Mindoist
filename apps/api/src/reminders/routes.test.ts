import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';
import { reminderRoutes } from './routes.js';

let app: ReturnType<typeof Fastify>;
let userId: string;
let token: string;
let otherUserId: string;

const HOUR = 60 * 60 * 1000;

function inHours(hours: number) {
  return new Date(Date.now() + hours * HOUR);
}

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(reminderRoutes);
  await app.ready();

  const testUser = await createTestUser(`reminders-upcoming-${Date.now()}@test.com`);
  userId = testUser.user.id;
  token = testUser.token;

  const other = await createTestUser(`reminders-other-${Date.now()}@test.com`);
  otherUserId = other.user.id;
});

afterEach(async () => {
  await cleanupUsers([userId, otherUserId]);
  await app.close();
});

function get(url = '/reminders/upcoming', authorization = `Bearer ${token}`) {
  return app.inject({ method: 'GET', url, headers: { authorization } });
}

describe('GET /reminders/upcoming', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/reminders/upcoming' });
    expect(res.statusCode).toBe(401);
  });

  it('returns pending reminders with the task title the device will display', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Gọi khách hàng' } });
    const reminder = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: inHours(5) },
    });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      {
        id: reminder.id,
        taskId: task.id,
        taskTitle: 'Gọi khách hàng',
        remindAt: reminder.remindAt.toISOString(),
      },
    ]);
  });

  it('never leaks another account\'s reminders', async () => {
    const theirTask = await prisma.task.create({
      data: { userId: otherUserId, title: 'Not yours' },
    });
    await prisma.reminder.create({ data: { taskId: theirTask.id, remindAt: inHours(2) } });

    const res = await get();

    expect(res.json().data).toEqual([]);
  });

  it('omits reminders already delivered, and tasks that are done or deleted', async () => {
    const sentTask = await prisma.task.create({ data: { userId, title: 'Already pushed' } });
    await prisma.reminder.create({
      data: { taskId: sentTask.id, remindAt: inHours(2), isSent: true },
    });

    const doneTask = await prisma.task.create({
      data: { userId, title: 'Done', completedAt: new Date() },
    });
    await prisma.reminder.create({ data: { taskId: doneTask.id, remindAt: inHours(2) } });

    const deletedTask = await prisma.task.create({
      data: { userId, title: 'Deleted', deletedAt: new Date() },
    });
    await prisma.reminder.create({ data: { taskId: deletedTask.id, remindAt: inHours(2) } });

    const res = await get();

    expect(res.json().data).toEqual([]);
  });

  it('keeps a reminder that just passed so a device catching up still sees it', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Missed by a minute' } });
    await prisma.reminder.create({ data: { taskId: task.id, remindAt: inHours(-0.25) } });

    const res = await get();

    expect(res.json().data).toHaveLength(1);
  });

  it('drops anything past the requested horizon', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Far future' } });
    await prisma.reminder.create({ data: { taskId: task.id, remindAt: inHours(24 * 45) } });

    const withDefaultHorizon = await get();
    expect(withDefaultHorizon.json().data).toHaveLength(0);

    const withWiderHorizon = await get('/reminders/upcoming?days=60');
    expect(withWiderHorizon.json().data).toHaveLength(1);
  });

  it('clamps an absurd horizon rather than scanning the whole table', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Next year' } });
    await prisma.reminder.create({ data: { taskId: task.id, remindAt: inHours(24 * 200) } });

    const res = await get('/reminders/upcoming?days=99999');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('returns the soonest reminders first', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Ordered' } });
    const later = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: inHours(10) },
    });
    const sooner = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: inHours(1) },
    });

    const res = await get();

    expect(res.json().data.map((row: { id: string }) => row.id)).toEqual([sooner.id, later.id]);
  });
});
