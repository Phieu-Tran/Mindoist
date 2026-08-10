import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { countdownRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(countdownRoutes);

  const user = await createTestUser('countdown-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('countdown-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.countdown.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe('Countdown CRUD', () => {
  it('POST /countdowns creates a countdown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/countdowns',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Birthday', targetDate: '2026-08-24' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe('Birthday');
    expect(body.data.targetDate).toContain('2026-08-24');
  });

  it('POST /countdowns rejects empty title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/countdowns',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: '', targetDate: '2026-08-24' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /countdowns lists only the current user\'s countdowns, soonest first', async () => {
    await prisma.countdown.create({ data: { userId, title: 'Later', targetDate: new Date('2027-01-01') } });
    await prisma.countdown.create({ data: { userId, title: 'Sooner', targetDate: new Date('2026-08-01') } });
    await prisma.countdown.create({ data: { userId: otherId, title: 'Not mine', targetDate: new Date('2026-01-01') } });

    const res = await app.inject({
      method: 'GET',
      url: '/countdowns',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].title).toBe('Sooner');
    expect(body.data[1].title).toBe('Later');
  });

  it('PATCH /countdowns/:id updates a countdown', async () => {
    const created = await prisma.countdown.create({ data: { userId, title: 'Old', targetDate: new Date('2026-08-01') } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/countdowns/${created.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.title).toBe('New');
  });

  it('PATCH /countdowns/:id 404s for another user\'s countdown', async () => {
    const created = await prisma.countdown.create({ data: { userId: otherId, title: 'Theirs', targetDate: new Date('2026-08-01') } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/countdowns/${created.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /countdowns/:id soft-deletes and excludes it from the list', async () => {
    const created = await prisma.countdown.create({ data: { userId, title: 'To delete', targetDate: new Date('2026-08-01') } });
    const del = await app.inject({
      method: 'DELETE',
      url: `/countdowns/${created.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(del.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: '/countdowns',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(list.body).data).toHaveLength(0);
  });
});
