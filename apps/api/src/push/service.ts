import webPush from 'web-push';
import { prisma } from '../db.js';
import { sendExpoPushToUser } from './expo.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@mindoist.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

/**
 * `web` is the browser (VAPID); `native` is the phone (Expo/FCM/APNs).
 *
 * Callers only narrow this when a phone would otherwise be told something it
 * already knows - see the reminder worker in ../reminders/delivery.ts.
 */
export type PushTransport = 'web' | 'native';

const ALL_TRANSPORTS: readonly PushTransport[] = ['web', 'native'];

/** Browser (VAPID) transport - needs a key pair in the environment. */
export function isWebPushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/**
 * Native (Expo) transport. Nothing to configure server-side: the FCM/APNs
 * credentials live in the Expo project, so this is on unless deliberately
 * switched off (useful in tests and offline environments).
 */
export function isExpoPushEnabled() {
  return process.env.EXPO_PUSH_ENABLED !== 'false';
}

/** True when at least one transport could deliver something. */
export function isPushConfigured() {
  return isWebPushConfigured() || isExpoPushEnabled();
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

async function sendWebPushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  const failedEndpoints: string[] = [];
  const body = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        failedEndpoints.push(sub.endpoint);
      }
    }
  }

  if (failedEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: { in: failedEndpoints } },
    });
  }

  return { sent, failed: failedEndpoints.length };
}

/**
 * Fan out to every transport the user is reachable on. Callers stay
 * transport-agnostic by default: the same notification reaches a browser and a
 * phone without them knowing either exists.
 *
 * Pass `transports` to opt out of one of them - the only reason to do so is
 * that the excluded device already produces this notification itself.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  options: { transports?: readonly PushTransport[] } = {},
) {
  if (!isPushConfigured()) {
    return { sent: 0, failed: 0, configured: false };
  }

  const transports = options.transports ?? ALL_TRANSPORTS;

  const [web, expo] = await Promise.all([
    transports.includes('web') && isWebPushConfigured()
      ? sendWebPushToUser(userId, payload)
      : Promise.resolve({ sent: 0, failed: 0 }),
    transports.includes('native') && isExpoPushEnabled()
      ? sendExpoPushToUser(userId, { title: payload.title, body: payload.body, url: payload.url })
      : Promise.resolve({ sent: 0, failed: 0 }),
  ]);

  return {
    sent: web.sent + expo.sent,
    failed: web.failed + expo.failed,
    configured: true,
  };
}
