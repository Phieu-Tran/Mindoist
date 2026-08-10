import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

// isPushConfigured() reads real VAPID_* env vars once at module load, so a
// dev's local .env (needed to manually test push end-to-end) makes the
// "not configured" case impossible to hit ambiently. Mock the service so
// this file controls that state directly instead of depending on whatever
// happens to be unset in the environment running the suite.
const pushMocks = vi.hoisted(() => ({
  isPushConfigured: vi.fn(() => true),
  getVapidPublicKey: vi.fn(() => 'test-vapid-public-key'),
  sendPushToUser: vi.fn(async () => ({ sent: 0, failed: 0, configured: true })),
}));

vi.mock('./service.js', () => pushMocks);

import { pushRoutes } from './routes.js';

let app: ReturnType<typeof Fastify>;
let userId: string;
let token: string;

beforeEach(async () => {
  pushMocks.isPushConfigured.mockReturnValue(true);

  app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(pushRoutes, { prefix: '/push' });
  await app.ready();

  const testUser = await createTestUser(`push-test-${Date.now()}@test.com`);
  userId = testUser.user.id;
  token = testUser.token;
});

afterEach(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

describe('GET /push/vapid-public-key', () => {
  it('returns the VAPID public key', async () => {
    const res = await app.inject({ method: 'GET', url: '/push/vapid-public-key' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(typeof res.json().data.publicKey).toBe('string');
  });
});

describe('POST /push/subscribe', () => {
  it('saves a push subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        endpoint: 'https://example.com/push/1',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const sub = await prisma.pushSubscription.findFirst({
      where: { userId, endpoint: 'https://example.com/push/1' },
    });
    expect(sub).not.toBeNull();
    expect(sub!.p256dh).toBe('test-p256dh');
  });

  it('upserts existing subscription', async () => {
    await app.inject({
      method: 'POST',
      url: '/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        endpoint: 'https://example.com/push/1',
        p256dh: 'old-key',
        auth: 'old-auth',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        endpoint: 'https://example.com/push/1',
        p256dh: 'new-key',
        auth: 'new-auth',
      },
    });
    const sub = await prisma.pushSubscription.findFirst({
      where: { userId, endpoint: 'https://example.com/push/1' },
    });
    expect(sub!.p256dh).toBe('new-key');
  });

  it('rejects invalid subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { endpoint: 'not-a-url', p256dh: 'key', auth: 'auth' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/subscribe',
      payload: { endpoint: 'https://example.com', p256dh: 'k', auth: 'a' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /push/subscribe', () => {
  it('removes a push subscription', async () => {
    await prisma.pushSubscription.create({
      data: { userId, endpoint: 'https://example.com/push/1', p256dh: 'k', auth: 'a' },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { endpoint: 'https://example.com/push/1' },
    });
    expect(res.statusCode).toBe(200);
    const sub = await prisma.pushSubscription.findFirst({
      where: { userId, endpoint: 'https://example.com/push/1' },
    });
    expect(sub).toBeNull();
  });
});

describe('POST /push/devices', () => {
  const expoToken = 'ExponentPushToken[mobile-test-token]';

  it('registers an Expo push token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/devices',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: expoToken, platform: 'android', deviceName: 'Pixel 8' },
    });
    expect(res.statusCode).toBe(200);

    const device = await prisma.deviceToken.findFirst({ where: { userId, token: expoToken } });
    expect(device).not.toBeNull();
    expect(device!.platform).toBe('android');
    expect(device!.deviceName).toBe('Pixel 8');
  });

  it('upserts on re-register instead of duplicating the device', async () => {
    await app.inject({
      method: 'POST',
      url: '/push/devices',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: expoToken, platform: 'android', deviceName: 'Old name' },
    });
    await app.inject({
      method: 'POST',
      url: '/push/devices',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: expoToken, platform: 'android', deviceName: 'New name' },
    });

    const devices = await prisma.deviceToken.findMany({ where: { userId } });
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceName).toBe('New name');
  });

  it('rejects a token that is not an Expo push token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/devices',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: 'fcm-raw-token', platform: 'android' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/devices',
      payload: { token: expoToken, platform: 'android' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /push/devices', () => {
  it('removes the device token', async () => {
    const expoToken = 'ExponentPushToken[to-be-removed]';
    await prisma.deviceToken.create({
      data: { userId, token: expoToken, platform: 'android' },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/push/devices',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: expoToken },
    });
    expect(res.statusCode).toBe(200);

    const device = await prisma.deviceToken.findFirst({ where: { userId, token: expoToken } });
    expect(device).toBeNull();
  });
});

describe('POST /push/send', () => {
  it('returns 503 when VAPID not configured', async () => {
    pushMocks.isPushConfigured.mockReturnValue(false);
    const res = await app.inject({
      method: 'POST',
      url: '/push/send',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Test', body: 'Hello' },
    });
    expect(res.statusCode).toBe(503);
  });
});
