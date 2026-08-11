import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const reminderDaysBeforeSchema = z.number().int().min(0).max(30).nullable();

const createCountdownSchema = z.object({
  title: z.string().min(1),
  targetDate: z.string(),
  color: z.string().optional(),
  imageUrl: z.string().url().optional(),
  reminderDaysBefore: reminderDaysBeforeSchema.optional(),
  showInCalendar: z.boolean().optional(),
});

const updateCountdownSchema = z.object({
  title: z.string().min(1).optional(),
  targetDate: z.string().optional(),
  color: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  reminderDaysBefore: reminderDaysBeforeSchema.optional(),
  showInCalendar: z.boolean().optional(),
});

export async function countdownRoutes(app: FastifyInstance) {
  // GET /countdowns — list all countdowns for user, soonest target date first
  app.get('/countdowns', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.sub;
    const countdowns = await prisma.countdown.findMany({
      where: { userId, deletedAt: null },
      orderBy: { targetDate: 'asc' },
    });
    return { success: true, data: countdowns };
  });

  // POST /countdowns — create countdown
  app.post<{
    Body: {
      title: string;
      targetDate: string;
      color?: string;
      imageUrl?: string;
      reminderDaysBefore?: number | null;
      showInCalendar?: boolean;
    };
  }>(
    '/countdowns',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = createCountdownSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid body' });
      }
      const countdown = await prisma.countdown.create({
        data: {
          userId,
          title: parsed.data.title,
          targetDate: new Date(parsed.data.targetDate),
          color: parsed.data.color || null,
          imageUrl: parsed.data.imageUrl || null,
          reminderDaysBefore: parsed.data.reminderDaysBefore ?? null,
          showInCalendar: parsed.data.showInCalendar ?? false,
        },
      });
      return reply.status(201).send({ success: true, data: countdown });
    }
  );

  // PATCH /countdowns/:id — update countdown
  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      targetDate?: string;
      color?: string | null;
      imageUrl?: string | null;
      reminderDaysBefore?: number | null;
      showInCalendar?: boolean;
    };
  }>(
    '/countdowns/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = updateCountdownSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid body' });
      }
      const existing = await prisma.countdown.findFirst({
        where: { id: request.params.id, userId, deletedAt: null },
      });
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      const scheduleChanged = parsed.data.targetDate !== undefined || parsed.data.reminderDaysBefore !== undefined;
      const countdown = await prisma.countdown.update({
        where: { id: request.params.id },
        data: {
          title: parsed.data.title,
          targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
          notificationSentAt: parsed.data.targetDate === undefined ? undefined : null,
          earlyNotificationSentAt: scheduleChanged ? null : undefined,
          color: parsed.data.color === undefined ? undefined : parsed.data.color,
          imageUrl: parsed.data.imageUrl === undefined ? undefined : parsed.data.imageUrl,
          reminderDaysBefore: parsed.data.reminderDaysBefore === undefined ? undefined : parsed.data.reminderDaysBefore,
          showInCalendar: parsed.data.showInCalendar,
        },
      });
      return reply.send({ success: true, data: countdown });
    }
  );

  // DELETE /countdowns/:id — soft delete countdown
  app.delete<{ Params: { id: string } }>(
    '/countdowns/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const existing = await prisma.countdown.findFirst({
        where: { id: request.params.id, userId, deletedAt: null },
      });
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      await prisma.countdown.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      });
      return reply.send({ success: true });
    }
  );
}
