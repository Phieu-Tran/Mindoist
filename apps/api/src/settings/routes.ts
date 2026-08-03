import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          hiddenNavItems: true,
          pomodoroWorkMinutes: true,
          pomodoroBreakMinutes: true,
          workHoursPerDay: true,
          timeZone: true,
        },
      });
      if (!user) return reply.status(404).send({ success: false, error: 'User not found' });
      return {
        success: true,
        data: {
          hiddenNavItems: JSON.parse(user.hiddenNavItems || '[]'),
          pomodoroWorkMinutes: user.pomodoroWorkMinutes,
          pomodoroBreakMinutes: user.pomodoroBreakMinutes,
          workHoursPerDay: user.workHoursPerDay,
          timeZone: user.timeZone,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  app.patch('/settings', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const body = request.body as {
      hiddenNavItems?: string[];
      pomodoroWorkMinutes?: number;
      pomodoroBreakMinutes?: number;
      workHoursPerDay?: number;
      timeZone?: string;
    };
    try {
      const data: any = {};
      if (body.hiddenNavItems !== undefined) {
        data.hiddenNavItems = JSON.stringify(body.hiddenNavItems);
      }
      if (body.pomodoroWorkMinutes !== undefined) {
        const val = Math.max(1, Math.min(120, Math.round(body.pomodoroWorkMinutes)));
        data.pomodoroWorkMinutes = val;
      }
      if (body.pomodoroBreakMinutes !== undefined) {
        const val = Math.max(1, Math.min(60, Math.round(body.pomodoroBreakMinutes)));
        data.pomodoroBreakMinutes = val;
      }
      if (body.workHoursPerDay !== undefined) {
        const val = Math.max(1, Math.min(24, Math.round(body.workHoursPerDay)));
        data.workHoursPerDay = val;
      }
      if (body.timeZone !== undefined) {
        if (!isValidTimeZone(body.timeZone)) {
          return reply.status(400).send({ success: false, error: 'Invalid time zone' });
        }
        data.timeZone = body.timeZone;
      }
      const user = await prisma.user.update({ where: { id: userId }, data });
      return {
        success: true,
        data: {
          hiddenNavItems: JSON.parse(user.hiddenNavItems),
          pomodoroWorkMinutes: user.pomodoroWorkMinutes,
          pomodoroBreakMinutes: user.pomodoroBreakMinutes,
          workHoursPerDay: user.workHoursPerDay,
          timeZone: user.timeZone,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
