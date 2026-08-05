import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { isExpoPushToken } from './expo.js';
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from './service.js';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
});

const deviceSchema = z.object({
  token: z.string().refine(isExpoPushToken, 'Not an Expo push token'),
  platform: z.enum(['android', 'ios']),
  deviceName: z.string().max(120).optional(),
});

const pushSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string().optional(),
});

export async function pushRoutes(app: FastifyInstance) {
  // GET /push/vapid-public-key — return VAPID public key for client
  app.get('/vapid-public-key', async () => {
    return { success: true, data: { publicKey: getVapidPublicKey() } };
  });

  // POST /push/subscribe — save push subscription
  app.post<{ Body: { endpoint: string; p256dh: string; auth: string } }>(
    '/subscribe',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = subscribeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid subscription' });
      }

      await prisma.pushSubscription.upsert({
        where: {
          userId_endpoint: {
            userId,
            endpoint: parsed.data.endpoint,
          },
        },
        update: {
          p256dh: parsed.data.p256dh,
          auth: parsed.data.auth,
        },
        create: {
          userId,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.p256dh,
          auth: parsed.data.auth,
        },
      });

      return reply.send({ success: true });
    }
  );

  // DELETE /push/subscribe — remove push subscription
  app.delete<{ Body: { endpoint: string } }>(
    '/subscribe',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const endpoint = request.body?.endpoint;
      if (!endpoint) {
        return reply.status(400).send({ success: false, error: 'Missing endpoint' });
      }

      await prisma.pushSubscription.deleteMany({
        where: { userId, endpoint },
      });

      return reply.send({ success: true });
    }
  );

  // POST /push/devices — register an Expo push token for the mobile app
  app.post<{ Body: { token: string; platform: 'android' | 'ios'; deviceName?: string } }>(
    '/devices',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = deviceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid device token' });
      }

      await prisma.deviceToken.upsert({
        where: {
          userId_token: { userId, token: parsed.data.token },
        },
        update: {
          platform: parsed.data.platform,
          deviceName: parsed.data.deviceName ?? null,
        },
        create: {
          userId,
          token: parsed.data.token,
          platform: parsed.data.platform,
          deviceName: parsed.data.deviceName ?? null,
        },
      });

      return reply.send({ success: true });
    },
  );

  // DELETE /push/devices — drop a device token (sign-out, notifications off)
  app.delete<{ Body: { token: string } }>(
    '/devices',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const token = request.body?.token;
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Missing token' });
      }

      await prisma.deviceToken.deleteMany({ where: { userId, token } });

      return reply.send({ success: true });
    },
  );

  // POST /push/send — send a self-test notification for the signed-in user
  app.post<{ Body: { title: string; body: string; url?: string } }>(
    '/send',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!isPushConfigured()) {
        return reply.status(503).send({ success: false, error: 'Push not configured' });
      }

      const parsed = pushSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid payload' });
      }

      const result = await sendPushToUser(request.auth!.sub, {
        title: parsed.data.title,
        body: parsed.data.body,
        url: parsed.data.url,
      });

      return reply.send({ success: true, data: { sent: result.sent, failed: result.failed } });
    }
  );
}
