import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Both transports are stubbed at their outermost edge: `web-push` talks to a
 * browser endpoint and `./expo.js` to Expo's servers, and this file is about
 * which of them gets called at all - never about what they send.
 */
const webPushMocks = vi.hoisted(() => ({
  sendNotification: vi.fn(async () => undefined),
  setVapidDetails: vi.fn(),
}));

const expoMocks = vi.hoisted(() => ({
  sendExpoPushToUser: vi.fn(async () => ({ sent: 1, failed: 0 })),
}));

vi.mock('web-push', () => ({ default: webPushMocks }));
vi.mock('./expo.js', () => expoMocks);

vi.mock('../db.js', () => ({
  prisma: {
    // vitest.setup.ts disconnects the client after every file; without this
    // the mock makes it throw and buries the run in stack traces.
    $disconnect: vi.fn(async () => undefined),
    pushSubscription: {
      findMany: vi.fn(async () => [
        { endpoint: 'https://example.com/push/1', p256dh: 'p256dh', auth: 'auth' },
      ]),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

// The module reads VAPID_* once at import time, so the keys have to exist
// before it is loaded or the web transport reports itself unconfigured.
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';

const { sendPushToUser } = await import('./service.js');

const payload = { title: 'Mindoist: Task', body: 'Due now' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendPushToUser', () => {
  it('reaches both the browser and the phone by default', async () => {
    const result = await sendPushToUser('user-1', payload);

    expect(webPushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(expoMocks.sendExpoPushToUser).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(2);
  });

  it('skips the phone when only the web transport is asked for', async () => {
    // This is what keeps reminders from arriving twice: the phone schedules
    // them itself, so the server pushing the same reminder natively would show
    // every one of them a second time.
    const result = await sendPushToUser('user-1', payload, { transports: ['web'] });

    expect(webPushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(expoMocks.sendExpoPushToUser).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it('skips the browser when only the native transport is asked for', async () => {
    const result = await sendPushToUser('user-1', payload, { transports: ['native'] });

    expect(webPushMocks.sendNotification).not.toHaveBeenCalled();
    expect(expoMocks.sendExpoPushToUser).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });
});
