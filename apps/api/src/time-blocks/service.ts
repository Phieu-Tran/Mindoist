import { prisma } from '../db.js';
import {
  createOwnedTimeBlock,
  findOwnedTimeBlock,
  listOwnedTimeBlocks,
  updateTimeBlockById,
} from './repository.js';
import type {
  CreateTimeBlockInput,
  TimeBlockListQuery,
  UpdateTimeBlockInput,
} from './schema.js';

export class TimeBlockServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404,
  ) {
    super(message);
  }
}

function assertValidRange(startAt: Date, endAt: Date): void {
  if (startAt >= endAt) {
    throw new TimeBlockServiceError('Time block end must be after its start', 400);
  }
}

export async function listTimeBlocks(userId: string, query: TimeBlockListQuery) {
  const where: {
    taskId?: string;
    startAt?: { lt: Date };
    endAt?: { gt: Date };
  } = {};

  if (query.taskId) where.taskId = query.taskId;
  if (query.to) where.startAt = { lt: new Date(query.to) };
  if (query.from) where.endAt = { gt: new Date(query.from) };

  return listOwnedTimeBlocks(userId, where);
}

export async function createTimeBlock(userId: string, input: CreateTimeBlockInput) {
  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      userId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!task) throw new TimeBlockServiceError('Task not found', 404);

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  assertValidRange(startAt, endAt);

  return createOwnedTimeBlock({
    userId,
    taskId: input.taskId,
    startAt,
    endAt,
    timeZone: input.timeZone,
    allDay: input.allDay ?? false,
    source: input.source ?? 'MANUAL',
  });
}

export async function updateTimeBlock(
  userId: string,
  timeBlockId: string,
  input: UpdateTimeBlockInput,
) {
  const existing = await findOwnedTimeBlock(userId, timeBlockId);
  if (!existing) throw new TimeBlockServiceError('Time block not found', 404);

  const startAt = input.startAt ? new Date(input.startAt) : existing.startAt;
  const endAt = input.endAt ? new Date(input.endAt) : existing.endAt;
  assertValidRange(startAt, endAt);

  return updateTimeBlockById(timeBlockId, {
    ...(input.startAt ? { startAt } : {}),
    ...(input.endAt ? { endAt } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
  });
}

export async function deleteTimeBlock(userId: string, timeBlockId: string) {
  const existing = await findOwnedTimeBlock(userId, timeBlockId);
  if (!existing) throw new TimeBlockServiceError('Time block not found', 404);

  await updateTimeBlockById(timeBlockId, { deletedAt: new Date() });
}

function dateKeyInTimeZone(value: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
  } catch {
    throw new TimeBlockServiceError('Projection time zone must be a valid IANA time zone', 400);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(candidate => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function getCalendarProjection(
  userId: string,
  from: Date,
  to: Date,
  timeZone = 'UTC',
) {
  if (from >= to) {
    throw new TimeBlockServiceError('Projection end must be after its start', 400);
  }
  const fromDate = dateKeyInTimeZone(from, timeZone);
  const toDate = dateKeyInTimeZone(to, timeZone);
  const fromBoundary = new Date(`${fromDate}T00:00:00.000Z`);
  const toBoundary = new Date(`${toDate}T00:00:00.000Z`);

  const [timeBlocks, tasks] = await Promise.all([
    listOwnedTimeBlocks(userId, {
      startAt: { lt: to },
      endAt: { gt: from },
    }),
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        // A calendar page must receive every task whose date span overlaps
        // the visible interval. Querying only by the final deadline drops a
        // June -> August task completely while the user is looking at July.
        OR: [
          {
            startDate: null,
            deadlineDate: { gte: fromBoundary, lt: toBoundary },
          },
          {
            startDate: { lt: toBoundary },
            deadlineDate: { gte: fromBoundary },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        completedAt: true,
        priority: true,
        projectId: true,
        color: true,
        startDate: true,
        deadlineDate: true,
        deadlineTime: true,
        deadlineTimeZone: true,
      },
      orderBy: [{ deadlineDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return {
    timeBlocks,
    deadlines: tasks.map(task => ({
      id: `deadline-${task.id}`,
      taskId: task.id,
      title: task.title,
      startDate: task.startDate?.toISOString().slice(0, 10) ?? null,
      date: task.deadlineDate!.toISOString().slice(0, 10),
      time: task.deadlineTime,
      timeZone: task.deadlineTimeZone,
      completedAt: task.completedAt,
      priority: task.priority,
      projectId: task.projectId,
      colorOverride: task.color,
    })),
    externalEvents: [],
  };
}
