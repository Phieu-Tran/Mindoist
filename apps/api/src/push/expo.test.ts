import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { chunkTokens, isExpoPushToken, sendExpoPushToUser } from './expo.js';

let userId: string;
let fetchMock: ReturnType<typeof vi.fn>;

function expoResponse(tickets: unknown[]) {
  return { json: async () => ({ data: tickets }) } as unknown as Response;
}

beforeEach(async () => {
  const testUser = await createTestUser(`expo-push-${Date.now()}@test.com`);
  userId = testUser.user.id;

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupUsers([userId]);
});

describe('isExpoPushToken', () => {
  it('accepts both spellings Expo issues', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it('rejects a raw FCM token', () => {
    expect(isExpoPushToken('dGhpcy1pcy1hbi1mY20tdG9rZW4')).toBe(false);
  });
});

describe('chunkTokens', () => {
  it('splits at the size Expo accepts per request', () => {
    const tokens = Array.from({ length: 250 }, (_, index) => `ExponentPushToken[${index}]`);
    const chunks = chunkTokens(tokens);
    expect(chunks.map(chunk => chunk.length)).toEqual([100, 100, 50]);
  });
});

describe('sendExpoPushToUser', () => {
  it('does not call Expo when the user has no devices', async () => {
    const result = await sendExpoPushToUser(userId, { title: 'Hi', body: 'There' });

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one message per device and carries the deep-link url', async () => {
    await prisma.deviceToken.createMany({
      data: [
        { userId, token: 'ExponentPushToken[phone-a]', platform: 'android' },
        { userId, token: 'ExponentPushToken[phone-b]', platform: 'android' },
      ],
    });
    fetchMock.mockResolvedValue(expoResponse([{ status: 'ok' }, { status: 'ok' }]));

    const result = await sendExpoPushToUser(userId, {
      title: 'Mindoist',
      body: 'Task tới hạn',
      url: '/tasks/abc',
    });

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toHaveLength(2);
    expect(body[0].data).toEqual({ url: '/tasks/abc' });
    expect(body[0].channelId).toBe('default');
  });

  it('drops tokens Expo reports as DeviceNotRegistered', async () => {
    await prisma.deviceToken.createMany({
      data: [
        { userId, token: 'ExponentPushToken[alive]', platform: 'android' },
        { userId, token: 'ExponentPushToken[uninstalled]', platform: 'android' },
      ],
    });
    fetchMock.mockResolvedValue(
      expoResponse([
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ]),
    );

    const result = await sendExpoPushToUser(userId, { title: 'Hi', body: 'There' });

    expect(result).toEqual({ sent: 1, failed: 1 });
    const remaining = await prisma.deviceToken.findMany({ where: { userId } });
    expect(remaining.map(device => device.token)).toEqual(['ExponentPushToken[alive]']);
  });

  it('keeps tokens when the request itself fails, so the next run can retry', async () => {
    await prisma.deviceToken.create({
      data: { userId, token: 'ExponentPushToken[phone-a]', platform: 'android' },
    });
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await sendExpoPushToUser(userId, { title: 'Hi', body: 'There' });

    expect(result).toEqual({ sent: 0, failed: 0 });
    const remaining = await prisma.deviceToken.findMany({ where: { userId } });
    expect(remaining).toHaveLength(1);
  });
});
