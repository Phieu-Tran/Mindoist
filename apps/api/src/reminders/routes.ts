import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * How far ahead a device is allowed to look. The phone turns each row into an
 * OS-level scheduled notification, and both platforms cap how many of those a
 * single app may hold, so there is no point handing over a year of them.
 */
const DEFAULT_HORIZON_DAYS = 30;
const MAX_HORIZON_DAYS = 90;
const MAX_ROWS = 200;

/**
 * A reminder whose moment has just passed is still worth returning: the device
 * may have been offline when it fired, and the mobile scheduler drops anything
 * already in the past itself. Without this grace window a reminder due a
 * minute ago disappears from the payload while the phone is still catching up.
 */
const GRACE_MS = 60 * 60 * 1000;

export async function reminderRoutes(app: FastifyInstance) {
  /**
   * GET /reminders/upcoming — reminders the caller's device should schedule
   * locally.
   *
   * Manual reminders are the one kind of alert the phone cannot work out on
   * its own: unlike a due date or a countdown target, `remindAt` lives only in
   * this table and is set from the web client. Mobile schedules its own
   * notifications (see apps/mobile/src/notifications/local-reminders.ts)
   * rather than waiting on a push, so it needs to read them up front.
   */
  app.get<{ Querystring: { days?: string } }>(
    '/reminders/upcoming',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth!.sub;

      const requested = Number(request.query.days);
      const days =
        Number.isFinite(requested) && requested > 0
          ? Math.min(Math.floor(requested), MAX_HORIZON_DAYS)
          : DEFAULT_HORIZON_DAYS;

      const now = Date.now();
      const reminders = await prisma.reminder.findMany({
        where: {
          isSent: false,
          type: 'push',
          remindAt: {
            gte: new Date(now - GRACE_MS),
            lte: new Date(now + days * 86_400_000),
          },
          task: { userId, completedAt: null, deletedAt: null },
        },
        select: {
          id: true,
          remindAt: true,
          task: { select: { id: true, title: true } },
        },
        orderBy: { remindAt: 'asc' },
        take: MAX_ROWS,
      });

      return {
        success: true,
        data: reminders.map((reminder) => ({
          id: reminder.id,
          taskId: reminder.task.id,
          taskTitle: reminder.task.title,
          remindAt: reminder.remindAt.toISOString(),
        })),
      };
    },
  );
}
