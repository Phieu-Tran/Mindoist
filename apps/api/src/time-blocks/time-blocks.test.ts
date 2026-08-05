import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';
import { timeBlockRoutes } from './routes.js';

let app: FastifyInstance;
let userId: string;
let userToken: string;
let otherId: string;
let otherToken: string;
let taskId: string;

const authorization = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(timeBlockRoutes);

  const user = await createTestUser('time-block-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('time-block-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.timeBlock.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.task.deleteMany({ where: { userId: { in: [userId, otherId] } } });

  const task = await prisma.task.create({
    data: { userId, title: 'Time-blocked task' },
  });
  taskId = task.id;
});

describe('TimeBlock CRUD', () => {
  it('creates, lists, updates and soft-deletes an owned time block', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/time-blocks',
      headers: authorization(userToken),
      payload: {
        taskId,
        startAt: '2026-07-30T02:00:00.000Z',
        endAt: '2026-07-30T03:30:00.000Z',
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });

    expect(create.statusCode).toBe(201);
    const created = create.json().data;
    expect(created).toMatchObject({
      taskId,
      timeZone: 'Asia/Ho_Chi_Minh',
      source: 'MANUAL',
      allDay: false,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/time-blocks?taskId=${taskId}`,
      headers: authorization(userToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);

    const update = await app.inject({
      method: 'PATCH',
      url: `/time-blocks/${created.id}`,
      headers: authorization(userToken),
      payload: { endAt: '2026-07-30T04:00:00.000Z' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().data.endAt).toBe('2026-07-30T04:00:00.000Z');

    const remove = await app.inject({
      method: 'DELETE',
      url: `/time-blocks/${created.id}`,
      headers: authorization(userToken),
    });
    expect(remove.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/time-blocks?taskId=${taskId}`,
      headers: authorization(userToken),
    });
    expect(afterDelete.json().data).toEqual([]);
  });

  it('rejects inverted ranges and invalid IANA time zones', async () => {
    const inverted = await app.inject({
      method: 'POST',
      url: '/time-blocks',
      headers: authorization(userToken),
      payload: {
        taskId,
        startAt: '2026-07-30T04:00:00.000Z',
        endAt: '2026-07-30T03:00:00.000Z',
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });
    expect(inverted.statusCode).toBe(400);

    const invalidZone = await app.inject({
      method: 'POST',
      url: '/time-blocks',
      headers: authorization(userToken),
      payload: {
        taskId,
        startAt: '2026-07-30T02:00:00.000Z',
        endAt: '2026-07-30T03:00:00.000Z',
        timeZone: 'Mars/Olympus_Mons',
      },
    });
    expect(invalidZone.statusCode).toBe(400);
  });

  it('does not expose or mutate another user time blocks', async () => {
    const block = await prisma.timeBlock.create({
      data: {
        userId,
        taskId,
        startAt: new Date('2026-07-30T02:00:00.000Z'),
        endAt: new Date('2026-07-30T03:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/time-blocks',
      headers: authorization(otherToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([]);

    const update = await app.inject({
      method: 'PATCH',
      url: `/time-blocks/${block.id}`,
      headers: authorization(otherToken),
      payload: { endAt: '2026-07-30T04:00:00.000Z' },
    });
    expect(update.statusCode).toBe(404);
  });
});

describe('Calendar projection', () => {
  it('returns time blocks and deadline markers as separate event kinds', async () => {
    await prisma.timeBlock.create({
      data: {
        userId,
        taskId,
        startAt: new Date('2026-07-30T02:00:00.000Z'),
        endAt: new Date('2026-07-30T03:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: {
        deadlineDate: new Date('2026-07-31T00:00:00.000Z'),
        deadlineTime: '17:30',
        deadlineTimeZone: 'Asia/Ho_Chi_Minh',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url:
        '/calendar/projection?from=2026-07-29T00%3A00%3A00.000Z' +
        '&to=2026-08-02T00%3A00%3A00.000Z',
      headers: authorization(userToken),
    });

    expect(response.statusCode).toBe(200);
    const projection = response.json().data;
    expect(projection.timeBlocks).toHaveLength(1);
    expect(projection.deadlines).toEqual([
      expect.objectContaining({
        id: `deadline-${taskId}`,
        taskId,
        date: '2026-07-31',
        time: '17:30',
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
    ]);
    expect(projection.externalEvents).toEqual([]);
  });

  it('requires a forward projection range', async () => {
    const response = await app.inject({
      method: 'GET',
      url:
        '/calendar/projection?from=2026-08-02T00%3A00%3A00.000Z' +
        '&to=2026-07-29T00%3A00%3A00.000Z',
      headers: authorization(userToken),
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns a task range that starts before and ends after the visible calendar page', async () => {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        startDate: new Date('2026-06-15T00:00:00.000Z'),
        deadlineDate: new Date('2026-08-31T00:00:00.000Z'),
        color: 'jade',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url:
        '/calendar/projection?from=2026-07-01T00%3A00%3A00.000Z' +
        '&to=2026-08-01T00%3A00%3A00.000Z',
      headers: authorization(userToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.deadlines).toEqual([
      expect.objectContaining({
        taskId,
        startDate: '2026-06-15',
        date: '2026-08-31',
        colorOverride: 'jade',
      }),
    ]);
  });

  it('filters deadline dates by the requested calendar time zone', async () => {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        // A legacy date can retain a time component; it still belongs to July 29.
        deadlineDate: new Date('2026-07-29T17:00:00.000Z'),
        deadlineTime: '10:00',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url:
        '/calendar/projection?from=2026-07-28T17%3A00%3A00.000Z' +
        '&to=2026-07-29T17%3A00%3A00.000Z' +
        '&timeZone=Asia%2FHo_Chi_Minh',
      headers: authorization(userToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.deadlines).toEqual([
      expect.objectContaining({ taskId, date: '2026-07-29', time: '10:00' }),
    ]);
  });
});
