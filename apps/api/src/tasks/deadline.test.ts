import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';
import { zonedDateTimeToUtc } from './deadline.js';
import { taskRoutes } from './routes.js';

let app: FastifyInstance;
let userId: string;
let userToken: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(taskRoutes);
  const user = await createTestUser('deadline-contract-test@example.com');
  userId = user.user.id;
  userToken = user.token;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { userId } });
});

describe('Task deadline contract', () => {
  it('stores a date-only deadline without changing its calendar day', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Date-only deadline',
        deadline: { date: '2026-08-03' },
      },
    });

    expect(response.statusCode).toBe(201);
    const task = response.json().data;
    expect(task.deadline).toEqual({ date: '2026-08-03' });
    expect(task).not.toHaveProperty('dueDate');

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.deadlineDate?.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(stored.deadlineTime).toBeNull();
    expect(stored.dueDate).toBeNull();
  });

  it('requires a time zone for timed deadlines', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Missing zone',
        deadline: { date: '2026-08-03', time: '17:30' },
      },
    });
    expect(invalid.statusCode).toBe(400);

    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Timed deadline',
        deadline: {
          date: '2026-08-03',
          time: '17:30',
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.deadline).toEqual({
      date: '2026-08-03',
      time: '17:30',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(response.json().data).not.toHaveProperty('dueDate');
  });

  it('does not let legacy dueDate input mutate the canonical deadline and can clear it', async () => {
    const legacyOnly = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Legacy deadline',
        dueDate: '2026-08-04T14:00:00.000Z',
      },
    });

    expect(legacyOnly.statusCode).toBe(201);
    expect(legacyOnly.json().data.deadline).toBeNull();

    const canonical = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Canonical deadline', deadline: { date: '2026-08-04' } },
    });
    const task = canonical.json().data;

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { deadline: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.deadline).toBeNull();
    expect(cleared.json().data).not.toHaveProperty('dueDate');
  });

  it('resolves late-evening deadlines in the user zone when the server runs UTC', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Late evening deadline',
        deadline: { date: '2026-08-03', time: '23:30', timeZone: 'Asia/Ho_Chi_Minh' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.deadline).toEqual({
      date: '2026-08-03',
      time: '23:30',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(zonedDateTimeToUtc('2026-08-03', '23:30', 'Asia/Ho_Chi_Minh').toISOString())
      .toBe('2026-08-03T16:30:00.000Z');
  });

  it('resolves a deadline on the America/New_York spring DST boundary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'DST boundary deadline',
        deadline: { date: '2026-03-08', time: '03:30', timeZone: 'America/New_York' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.deadline).toEqual({
      date: '2026-03-08',
      time: '03:30',
      timeZone: 'America/New_York',
    });
    expect(zonedDateTimeToUtc('2026-03-08', '03:30', 'America/New_York').toISOString())
      .toBe('2026-03-08T07:30:00.000Z');
  });
});
