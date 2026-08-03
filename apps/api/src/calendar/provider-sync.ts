import { prisma } from '../db.js';
import type { CalendarProvider } from './providers/types.js';

export async function syncTimeBlocksToProvider(
  provider: CalendarProvider,
  userId: string,
  scope: { projectId?: string; taskId?: string; timeBlockId?: string } = {},
): Promise<number> {
  const providerCalendar = await provider.ensureCalendar(userId);
  const calendar = await prisma.externalCalendar.upsert({
    where: {
      userId_provider_externalCalendarId: {
        userId,
        provider: provider.id.toUpperCase() as 'GOOGLE',
        externalCalendarId: providerCalendar.externalId,
      },
    },
    create: {
      userId,
      provider: provider.id.toUpperCase() as 'GOOGLE',
      externalCalendarId: providerCalendar.externalId,
      name: providerCalendar.name,
      color: providerCalendar.color,
      timeZone: providerCalendar.timeZone,
      isReadOnly: providerCalendar.readOnly,
    },
    update: {
      name: providerCalendar.name,
      color: providerCalendar.color,
      timeZone: providerCalendar.timeZone,
      isReadOnly: providerCalendar.readOnly,
      deletedAt: null,
    },
  });

  const blocks = await prisma.timeBlock.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(scope.timeBlockId ? { id: scope.timeBlockId } : {}),
      ...(scope.taskId ? { taskId: scope.taskId } : {}),
      task: {
        deletedAt: null,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        project: { deletedAt: null, calendarSyncEnabled: true },
      },
    },
    include: { task: true },
    orderBy: { updatedAt: 'asc' },
  });
  let synced = 0;

  for (const block of blocks) {
    const existing = await prisma.externalEventLink.findFirst({
      where: {
        userId,
        externalCalendarId: calendar.id,
        timeBlockId: block.id,
      },
    });
    const written = await provider.upsertTimeBlock(
      userId,
      providerCalendar,
      block,
      block.task,
      existing
        ? { externalEventId: existing.externalEventId, etag: existing.etag }
        : undefined,
    );

    await prisma.externalEventLink.upsert({
      where: {
        externalCalendarId_timeBlockId: {
          externalCalendarId: calendar.id,
          timeBlockId: block.id,
        },
      },
      create: {
        userId,
        externalCalendarId: calendar.id,
        externalEventId: written.externalEventId,
        timeBlockId: block.id,
        etag: written.etag,
        lastSyncedAt: new Date(),
      },
      update: {
        timeBlockId: block.id,
        taskId: null,
        etag: written.etag,
        lastSyncedAt: new Date(),
      },
    });
    synced += 1;
  }

  return synced;
}

async function deleteLinkedEvents(
  provider: CalendarProvider,
  userId: string,
  links: Array<{
    id: string;
    externalEventId: string;
    calendar: { externalCalendarId: string; name: string; color: string | null; timeZone: string | null; isReadOnly: boolean };
  }>,
): Promise<number> {
  let deleted = 0;
  for (const link of links) {
    await provider.deleteEvent(
      userId,
      {
        externalId: link.calendar.externalCalendarId,
        name: link.calendar.name,
        color: link.calendar.color,
        timeZone: link.calendar.timeZone,
        readOnly: link.calendar.isReadOnly,
      },
      link.externalEventId,
    );
    await prisma.externalEventLink.delete({ where: { id: link.id } });
    deleted += 1;
  }
  return deleted;
}

export async function deleteSyncedTimeBlockEvents(
  provider: CalendarProvider,
  userId: string,
  timeBlockId: string,
): Promise<number> {
  const links = await prisma.externalEventLink.findMany({
    where: {
      userId,
      timeBlockId,
      calendar: { provider: provider.id.toUpperCase() as 'GOOGLE' },
    },
    include: { calendar: true },
  });
  return deleteLinkedEvents(provider, userId, links);
}

export async function deleteSyncedTaskEvents(
  provider: CalendarProvider,
  userId: string,
  taskId: string,
): Promise<number> {
  const links = await prisma.externalEventLink.findMany({
    where: {
      userId,
      timeBlock: { taskId },
      calendar: { provider: provider.id.toUpperCase() as 'GOOGLE' },
    },
    include: { calendar: true },
  });
  return deleteLinkedEvents(provider, userId, links);
}

export async function deleteSyncedProjectEvents(
  provider: CalendarProvider,
  userId: string,
  projectId: string,
): Promise<number> {
  const links = await prisma.externalEventLink.findMany({
    where: {
      userId,
      timeBlock: { task: { projectId } },
      calendar: { provider: provider.id.toUpperCase() as 'GOOGLE' },
    },
    include: { calendar: true },
  });
  return deleteLinkedEvents(provider, userId, links);
}
