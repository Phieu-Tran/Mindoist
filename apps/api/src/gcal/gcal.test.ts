import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { gcalRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

vi.mock('./service.js', () => ({
  getAuthUrl: vi.fn((userId: string) => `https://accounts.google.com/o/oauth2/auth?state=${userId}`),
  exchangeCode: vi.fn(async (code: string) => ({ accessToken: 'mock-access', refreshToken: 'mock-refresh' })),
  storeRefreshToken: vi.fn(async () => {}),
  syncSelectedProjectTasksToGCal: vi.fn(async () => 0),
  disconnectAccount: vi.fn(async () => {}),
  isConnected: vi.fn(async () => false),
  fetchGCalEvents: vi.fn(async () => [
    { id: 'gcal-1', title: 'Team standup', start: '2026-07-20T09:00:00', end: '2026-07-20T09:30:00' },
  ]),
  ensureMindoistCalendar: vi.fn(async () => ({
    externalId: 'mock-calendar',
    name: 'Mindoist',
    color: null,
    timeZone: 'UTC',
    readOnly: false,
  })),
  upsertTimeBlockEvent: vi.fn(async () => ({
    externalEventId: 'mock-event',
    etag: 'mock-etag',
  })),
  deleteExternalEvent: vi.fn(async () => {}),
  getSyncLogs: vi.fn(async () => [
    { id: 'log-1', direction: 'push', action: 'create', taskId: 'task-1', createdAt: new Date() },
  ]),
}));

vi.mock('./sync.js', () => ({
  triggerSyncForUser: vi.fn(async () => {}),
  startSyncBoss: vi.fn(async () => {}),
  stopSyncBoss: vi.fn(async () => {}),
}));

let app: FastifyInstance;
let userToken: string;
let userId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(gcalRoutes);
  await app.ready();

  const user = await createTestUser('gcal-test@example.com');
  userId = user.user.id;
  userToken = user.token;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

describe('GCal Routes', () => {
  describe('GET /gcal/auth-url', () => {
    it('returns OAuth URL for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/auth-url',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.url).toContain('accounts.google.com');
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/gcal/auth-url' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /gcal/callback', () => {
    it('redirects to frontend on success', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/callback?code=test-code&state=user-1',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('gcal=connected');
    });

    it('returns 400 without code', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/callback?state=user-1',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 without state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/callback?code=test-code',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /gcal/status', () => {
    it('returns connected: false by default', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/status',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.connected).toBe(false);
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/gcal/status' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /gcal/disconnect', () => {
    it('disconnects successfully', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gcal/disconnect',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/gcal/disconnect' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /gcal/sync', () => {
    it('triggers sync for authenticated user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gcal/sync',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/gcal/sync' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /gcal/webhook', () => {
    it('accepts webhook notification', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gcal/webhook',
        headers: {
          'x-goog-channel-token': 'test-token',
          'x-goog-resource-id': 'test-resource',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /gcal/events', () => {
    it('returns GCal events for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/events',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe('Team standup');
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/gcal/events' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /gcal/sync-logs', () => {
    it('returns sync logs for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/gcal/sync-logs',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].direction).toBe('push');
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/gcal/sync-logs' });
      expect(res.statusCode).toBe(401);
    });
  });
});
