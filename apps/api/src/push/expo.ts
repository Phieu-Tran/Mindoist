import { prisma } from '../db.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
// Expo's own documented cap per request.
const CHUNK_SIZE = 100;

export interface ExpoPushPayload {
  title: string;
  body: string;
  url?: string;
  dedupeKey?: string;
}

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

export function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export function chunkTokens(tokens: string[], size = CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < tokens.length; index += size) {
    chunks.push(tokens.slice(index, index + size));
  }
  return chunks;
}

/**
 * Deliver to Expo's push service. Unlike web push there is no key to
 * configure - having a device token registered is the whole prerequisite,
 * because credentials live in the Expo project (FCM for Android, APNs for iOS).
 *
 * Tokens Expo reports as `DeviceNotRegistered` are dropped, mirroring how
 * web-push subscriptions are cleaned up on 404/410 in ./service.ts.
 */
export async function sendExpoPushToUser(userId: string, payload: ExpoPushPayload) {
  const devices = await prisma.deviceToken.findMany({ where: { userId } });
  const tokens = devices.map(device => device.token).filter(isExpoPushToken);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  const staleTokens: string[] = [];

  for (const chunk of chunkTokens(tokens)) {
    const messages = chunk.map(token => ({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: 'default' as const,
      channelId: 'default',
      // The tap handler on the client reads `data.url` to deep-link;
      // `data.dedupeKey` lets it cancel the matching locally-scheduled
      // fallback (see notifications-context.tsx on the client).
      data: {
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.dedupeKey ? { dedupeKey: payload.dedupeKey } : {}),
      },
    }));

    let tickets: ExpoTicket[];
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const json = (await response.json()) as { data?: ExpoTicket[] };
      tickets = json.data ?? [];
    } catch {
      // A network blip must not lose the tokens; the next reminder retries.
      continue;
    }

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(chunk[index]);
      }
    });
  }

  if (staleTokens.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { userId, token: { in: staleTokens } },
    });
  }

  return { sent, failed: staleTokens.length };
}
