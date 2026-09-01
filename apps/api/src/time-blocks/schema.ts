import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const timeZone = z.string().min(1).refine(isValidTimeZone, {
  message: 'Invalid IANA time zone',
});

export const createTimeBlockSchema = z.object({
  taskId: z.string().uuid(),
  startAt: isoDateTime,
  endAt: isoDateTime,
  timeZone,
  allDay: z.boolean().optional(),
  source: z.enum(['MANUAL', 'RECURRENCE', 'IMPORT', 'EXTERNAL']).optional(),
  completedAt: isoDateTime.nullable().optional(),
  actualMin: z.number().int().nonnegative().nullable().optional(),
});

export const updateTimeBlockSchema = z.object({
  startAt: isoDateTime.optional(),
  endAt: isoDateTime.optional(),
  timeZone: timeZone.optional(),
  allDay: z.boolean().optional(),
  completedAt: isoDateTime.nullable().optional(),
  actualMin: z.number().int().nonnegative().nullable().optional(),
});

export const timeBlockListQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const calendarProjectionQuerySchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
  timeZone: z.string().min(1).max(100).default('UTC'),
});

export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>;
export type UpdateTimeBlockInput = z.infer<typeof updateTimeBlockSchema>;
export type TimeBlockListQuery = z.infer<typeof timeBlockListQuerySchema>;
