import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { dateOnlyToUtcDate, zonedDateTimeToUtc } from '../tasks/deadline.js';
import { resolveProject, resolveTags, resolveTelegramOwner } from './task-drafts.js';

export const telegramTaskPeriods = [
  'today', 'tomorrow', 'this_week', 'next_7_days', 'overdue', 'date',
] as const;

export type TelegramTaskPeriod = typeof telegramTaskPeriods[number];

export type TelegramTaskQueryInput = {
  telegramChatId: string;
  locale: 'vi' | 'en';
  period: TelegramTaskPeriod;
  date?: string;
  projectName?: string;
  tagNames?: string[];
  status?: 'open' | 'completed' | 'all';
  limit?: number;
};

type PeriodRange = {
  start?: string;
  end?: string;
  overdueBefore?: string;
};

function localIsoDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(value: string, days: number) {
  const date = dateOnlyToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function periodRange(period: TelegramTaskPeriod, requestedDate: string | undefined, timeZone: string): PeriodRange {
  const today = localIsoDate(new Date(), timeZone);
  if (period === 'overdue') return { overdueBefore: today };
  if (period === 'today') return { start: today, end: today };
  if (period === 'tomorrow') {
    const tomorrow = addDays(today, 1);
    return { start: tomorrow, end: tomorrow };
  }
  if (period === 'next_7_days') return { start: today, end: addDays(today, 6) };
  if (period === 'this_week') {
    const weekday = dateOnlyToUtcDate(today).getUTCDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    const start = addDays(today, -daysFromMonday);
    return { start, end: addDays(start, 6) };
  }
  if (!requestedDate) throw new Error('A date is required for the date period');
  return { start: requestedDate, end: requestedDate };
}

function dueFilter(range: PeriodRange): Prisma.TaskWhereInput {
  const predicate = range.overdueBefore
    ? { lt: dateOnlyToUtcDate(range.overdueBefore) }
    : { gte: dateOnlyToUtcDate(range.start!), lte: dateOnlyToUtcDate(range.end!) };
  return {
    OR: [
      { deadlineDate: predicate },
      { deadlineDate: null, dueDate: predicate },
    ],
  };
}

async function queryContext(input: TelegramTaskQueryInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const [user, project, tags] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } }),
    resolveProject(userId, input.projectName),
    resolveTags(userId, input.tagNames),
  ]);
  const timeZone = user.timeZone || 'Asia/Ho_Chi_Minh';
  const range = periodRange(input.period, input.date, timeZone);
  const filters: Prisma.TaskWhereInput[] = [dueFilter(range)];
  if (project) filters.push({ projectId: project.id });
  for (const tag of tags) {
    filters.push({ taskTags: { some: { tagId: tag.id, deletedAt: null } } });
  }
  return {
    userId,
    timeZone,
    range,
    where: {
      userId,
      deletedAt: null,
      parentId: null,
      AND: filters,
    } satisfies Prisma.TaskWhereInput,
    baseWhere: {
      userId,
      deletedAt: null,
      parentId: null,
      AND: filters.slice(1),
    } satisfies Prisma.TaskWhereInput,
  };
}

function periodTitle(input: TelegramTaskQueryInput, range: PeriodRange) {
  const vi = input.locale === 'vi';
  if (input.period === 'overdue') return vi ? 'các công việc quá hạn' : 'overdue tasks';
  if (input.period === 'today') return vi ? `hôm nay (${range.start})` : `today (${range.start})`;
  if (input.period === 'tomorrow') return vi ? `ngày mai (${range.start})` : `tomorrow (${range.start})`;
  if (input.period === 'this_week') return vi ? `tuần này (${range.start} – ${range.end})` : `this week (${range.start} – ${range.end})`;
  if (input.period === 'next_7_days') return vi ? `7 ngày tới (${range.start} – ${range.end})` : `the next 7 days (${range.start} – ${range.end})`;
  return vi ? `ngày ${range.start}` : `${range.start}`;
}

function taskDueLabel(task: { deadlineDate: Date | null; deadlineTime: string | null; dueDate: Date | null; dueTime: string | null }) {
  const date = task.deadlineDate ?? task.dueDate;
  if (!date) return '—';
  const time = task.deadlineTime ?? task.dueTime;
  return `${date.toISOString().slice(0, 10)}${time ? ` ${time}` : ''}`;
}

export async function listTelegramTasks(input: TelegramTaskQueryInput) {
  const context = await queryContext(input);
  const status = input.status ?? 'open';
  const statusWhere: Prisma.TaskWhereInput = status === 'open'
    ? { completedAt: null }
    : status === 'completed' ? { completedAt: { not: null } } : {};
  const tasks = await prisma.task.findMany({
    where: { AND: [context.where, statusWhere] },
    orderBy: [{ deadlineDate: 'asc' }, { dueDate: 'asc' }, { dueTime: 'asc' }, { createdAt: 'asc' }],
    take: Math.min(Math.max(input.limit ?? 10, 1), 20),
    select: {
      title: true,
      color: true,
      priority: true,
      dueDate: true,
      dueTime: true,
      deadlineDate: true,
      deadlineTime: true,
      completedAt: true,
      project: { select: { name: true } },
      taskTags: {
        where: { deletedAt: null, tag: { deletedAt: null } },
        select: { tag: { select: { name: true } } },
      },
    },
  });
  const title = periodTitle(input, context.range);
  if (!tasks.length) {
    return input.locale === 'vi'
      ? `Không có công việc phù hợp cho ${title}.`
      : `No matching tasks for ${title}.`;
  }
  const heading = input.locale === 'vi'
    ? `Công việc ${title}: ${tasks.length}`
    : `Tasks for ${title}: ${tasks.length}`;
  const rows = tasks.map(task => {
    const details = [
      taskDueLabel(task),
      task.project?.name,
      task.priority ? `P${task.priority}` : null,
      ...task.taskTags.map(item => `#${item.tag.name}`),
    ].filter(Boolean);
    return `• ${task.completedAt ? '✓ ' : ''}${task.title} — ${details.join(' · ')}`;
  });
  return [heading, ...rows].join('\n');
}

export async function summarizeTelegramTasks(input: TelegramTaskQueryInput) {
  const context = await queryContext(input);
  if (input.period === 'overdue') {
    const overdue = await prisma.task.count({ where: { AND: [context.where, { completedAt: null }] } });
    return input.locale === 'vi'
      ? `Thống kê ${periodTitle(input, context.range)}:\n• Chưa hoàn thành: ${overdue}`
      : `Summary for ${periodTitle(input, context.range)}:\n• Open: ${overdue}`;
  }

  const nextDate = addDays(context.range.end!, 1);
  const completedFrom = zonedDateTimeToUtc(context.range.start!, '00:00', context.timeZone);
  const completedUntil = zonedDateTimeToUtc(nextDate, '00:00', context.timeZone);
  const overdueWhere = dueFilter({ overdueBefore: localIsoDate(new Date(), context.timeZone) });
  const [totalDue, openDue, completedDue, completedDuring, overdue] = await Promise.all([
    prisma.task.count({ where: context.where }),
    prisma.task.count({ where: { AND: [context.where, { completedAt: null }] } }),
    prisma.task.count({ where: { AND: [context.where, { completedAt: { not: null } }] } }),
    prisma.task.count({ where: { AND: [context.baseWhere, { completedAt: { gte: completedFrom, lt: completedUntil } }] } }),
    prisma.task.count({ where: { AND: [context.baseWhere, overdueWhere, { completedAt: null }] } }),
  ]);
  const title = periodTitle(input, context.range);
  if (input.locale === 'vi') {
    return [
      `Thống kê ${title}:`,
      `• Đến hạn: ${totalDue}`,
      `• Còn mở: ${openDue}`,
      `• Đã hoàn thành trong số đến hạn: ${completedDue}`,
      `• Hoàn thành trong khoảng này: ${completedDuring}`,
      `• Đang quá hạn: ${overdue}`,
    ].join('\n');
  }
  return [
    `Summary for ${title}:`,
    `• Due: ${totalDue}`,
    `• Open: ${openDue}`,
    `• Completed among due tasks: ${completedDue}`,
    `• Completed during this period: ${completedDuring}`,
    `• Currently overdue: ${overdue}`,
  ].join('\n');
}
