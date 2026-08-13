import { z } from 'zod';

const taskColorSchema = z.enum([
  'slate',
  'sky',
  'indigo',
  'violet',
  'rose',
  'amber',
  'jade',
  'lime',
]);

const taskDeadlineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timeZone: z.string().min(1).optional(),
}).superRefine((deadline, context) => {
  if (deadline.time && !deadline.timeZone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timeZone'],
      message: 'A time zone is required for a timed deadline',
    });
  }
});

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  color: taskColorSchema.nullable().optional(),
  projectId: z.string().optional(),
  projectColumnId: z.string().optional(),
  sectionId: z.string().optional(),
  parentId: z.string().optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  deadline: taskDeadlineSchema.nullable().optional(),
  startDate: z.string().optional(),
  estimateMin: z.number().int().positive().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  rrule: z.string().optional(),
  recurringResetMode: z.enum(['RESET', 'KEEP']).optional(),
  recurrenceBasis: z.enum(['DUE_DATE', 'COMPLETION_DATE']).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  color: taskColorSchema.nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectColumnId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  deadline: taskDeadlineSchema.nullable().optional(),
  startDate: z.string().nullable().optional(),
  estimateMin: z.number().int().positive().nullable().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  rrule: z.string().nullable().optional(),
  recurringResetMode: z.enum(['RESET', 'KEEP']).nullable().optional(),
  recurrenceBasis: z.enum(['DUE_DATE', 'COMPLETION_DATE']).nullable().optional(),
  sortOrder: z.number().optional(),
  tagIds: z.array(z.string()).optional(),
});

export const moveTaskSchema = z
  .object({
    columnId: z.string().uuid().optional(),
    projectColumnId: z.string().uuid().optional(),
    order: z.number().optional(),
    sortOrder: z.number().optional(),
  })
  .refine(data => Boolean(data.columnId || data.projectColumnId), {
    message: 'A project column is required',
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
