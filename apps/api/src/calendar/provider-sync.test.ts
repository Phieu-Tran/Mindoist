import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { deleteSyncedTaskEvents, syncTimeBlocksToProvider } from './provider-sync.js';
import type { CalendarProvider } from './providers/types.js';

let userId: string;
let timeBlockId: string;
let taskId: string;

const upsertTimeBlock = vi.fn<CalendarProvider['upsertTimeBlock']>();
const deleteEvent = vi.fn<CalendarProvider['deleteEvent']>();

const provider: CalendarProvider = {
  id: 'google',
  getAuthUrl: () => 'https://example.test/oauth',
  isConnected: async () => true,
  disconnect: async () => undefined,
  sync: async () => undefined,
  listEvents: async () => [],
  ensureCalendar: async () => ({
    externalId: 'mindoist-calendar',
    name: 'Mindoist',
    color: null,
    timeZone: 'Asia/Ho_Chi_Minh',
    readOnly: false,
  }),
  upsertTimeBlock,
  deleteEvent,
};

beforeAll(async () => {
  const user = await createTestUser('calendar-provider-sync@example.com');
  userId = user.user.id;
});

afterAll(async () => {
  await cleanupUsers([userId]);
});

beforeEach(async () => {
  await prisma.externalEventLink.deleteMany({ where: { userId } });
  await prisma.externalCalendar.deleteMany({ where: { userId } });
  await prisma.timeBlock.deleteMany({ where: { userId } });
  await prisma.task.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  upsertTimeBlock.mockReset();
  deleteEvent.mockReset();
  deleteEvent.mockResolvedValue(undefined);
  upsertTimeBlock.mockImplementation(async (_userId, _calendar, _block, _task, existing) => ({
    externalEventId: existing?.externalEventId ?? 'provider-event-1',
    etag: existing ? 'etag-2' : 'etag-1',
  }));

  const project = await prisma.project.create({
    data: { userId, name: 'Synced project', calendarSyncEnabled: true },
  });
  const task = await prisma.task.create({
    data: { userId, projectId: project.id, title: 'Provider sync task' },
  });
  taskId = task.id;
  const block = await prisma.timeBlock.create({
    data: {
      userId,
      taskId: task.id,
      startAt: new Date('2026-08-03T02:00:00.000Z'),
      endAt: new Date('2026-08-03T03:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    },
  });
  timeBlockId = block.id;
});

describe('syncTimeBlocksToProvider', () => {
  it('updates the same external event with its etag on repeated sync', async () => {
    expect(await syncTimeBlocksToProvider(provider, userId)).toBe(1);
    expect(await syncTimeBlocksToProvider(provider, userId)).toBe(1);

    expect(upsertTimeBlock).toHaveBeenCalledTimes(2);
    expect(upsertTimeBlock.mock.calls[0][4]).toBeUndefined();
    expect(upsertTimeBlock.mock.calls[1][4]).toEqual({
      externalEventId: 'provider-event-1',
      etag: 'etag-1',
    });

    const links = await prisma.externalEventLink.findMany({
      where: { userId, timeBlockId },
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      externalEventId: 'provider-event-1',
      etag: 'etag-2',
    });
  });

  it('keeps external links independent from Task ownership', async () => {
    await syncTimeBlocksToProvider(provider, userId);
    const link = await prisma.externalEventLink.findFirstOrThrow({
      where: { userId, timeBlockId },
    });
    expect(link.taskId).toBeNull();
    expect(link.timeBlockId).toBe(timeBlockId);
  });

  it('only exports time blocks from projects selected for calendar sync', async () => {
    const disabledProject = await prisma.project.create({
      data: { userId, name: 'Local-only project', calendarSyncEnabled: false },
    });
    const disabledTask = await prisma.task.create({
      data: { userId, projectId: disabledProject.id, title: 'Do not export' },
    });
    await prisma.timeBlock.create({
      data: {
        userId,
        taskId: disabledTask.id,
        startAt: new Date('2026-08-03T04:00:00.000Z'),
        endAt: new Date('2026-08-03T05:00:00.000Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    });

    expect(await syncTimeBlocksToProvider(provider, userId)).toBe(1);
    expect(upsertTimeBlock).toHaveBeenCalledTimes(1);
    expect(upsertTimeBlock.mock.calls[0][3].id).toBe(taskId);
  });

  it('deletes only provider events linked to a Mindoist task', async () => {
    await syncTimeBlocksToProvider(provider, userId);

    expect(await deleteSyncedTaskEvents(provider, userId, taskId)).toBe(1);
    expect(deleteEvent).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ externalId: 'mindoist-calendar' }),
      'provider-event-1',
    );
    expect(await prisma.externalEventLink.count({ where: { userId, timeBlockId } })).toBe(0);
  });
});
