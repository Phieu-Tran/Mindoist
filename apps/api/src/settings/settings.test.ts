import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(settingsRoutes);

  const user = await createTestUser('settings-test@example.com');
  userId = user.user.id;
  userToken = user.token;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

describe('Settings', () => {
  it('GET /settings requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /settings returns defaults for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toMatchObject({
      pomodoroWorkMinutes: 25,
      pomodoroBreakMinutes: 5,
      workHoursPerDay: 8,
      timeZone: null,
    });
  });

  it('PATCH /settings requires auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: { workHoursPerDay: 6 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /settings updates workHoursPerDay and persists it', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { workHoursPerDay: 6 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.workHoursPerDay).toBe(6);

    const getRes = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(getRes.body).data.workHoursPerDay).toBe(6);
  });

  it('PATCH /settings clamps workHoursPerDay to [1, 24]', async () => {
    const tooHigh = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { workHoursPerDay: 100 },
    });
    expect(JSON.parse(tooHigh.body).data.workHoursPerDay).toBe(24);

    const tooLow = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { workHoursPerDay: 0 },
    });
    expect(JSON.parse(tooLow.body).data.workHoursPerDay).toBe(1);
  });

  it('PATCH /settings clamps pomodoro durations to their bounds', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { pomodoroWorkMinutes: 999, pomodoroBreakMinutes: 0 },
    });
    const data = JSON.parse(res.body).data;
    expect(data.pomodoroWorkMinutes).toBe(120);
    expect(data.pomodoroBreakMinutes).toBe(1);
  });

  it('PATCH /settings updates timeZone and persists it', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { timeZone: 'Asia/Bangkok' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.timeZone).toBe('Asia/Bangkok');

    const getRes = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(getRes.body).data.timeZone).toBe('Asia/Bangkok');
  });

  it('PATCH /settings rejects an invalid timeZone', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { timeZone: 'Not/AZone' },
    });
    expect(res.statusCode).toBe(400);
  });
});
