import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';

const pushMocks = vi.hoisted(() => ({
  isPushConfigured: vi.fn(() => true),
  sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0, configured: true })),
}));

vi.mock('../push/service.js', () => pushMocks);

import { processDueReminders } from './delivery.js';

let userId: string;

beforeEach(async () => {
  pushMocks.isPushConfigured.mockReturnValue(true);
  pushMocks.sendPushToUser.mockReset();
  pushMocks.sendPushToUser.mockResolvedValue({ sent: 1, failed: 0, configured: true });
  const testUser = await createTestUser(`reminder-delivery-${Date.now()}@test.com`);
  userId = testUser.user.id;
});

afterEach(async () => {
  await cleanupUsers([userId]);
});

describe('processDueReminders', () => {
  it('sends due unsent reminders and marks them sent', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Standup notes' } });
    const due = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: new Date('1999-01-01T01:00:00.000Z') },
    });
    const future = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: new Date('1999-01-01T03:00:00.000Z') },
    });

    const result = await processDueReminders(new Date('1999-01-01T02:00:00.000Z'));

    expect(result).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
    expect(pushMocks.sendPushToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
      title: 'Mindoist: Standup notes',
      url: `/tasks/${task.id}`,
      tag: `task-reminder-${due.id}`,
    }));
    await expect(prisma.reminder.findUniqueOrThrow({ where: { id: due.id } }))
      .resolves.toMatchObject({ isSent: true });
    await expect(prisma.reminder.findUniqueOrThrow({ where: { id: future.id } }))
      .resolves.toMatchObject({ isSent: false });
  });

  it('does not send reminders for completed or deleted tasks', async () => {
    const completed = await prisma.task.create({
      data: { userId, title: 'Done', completedAt: new Date('2026-07-29T01:00:00.000Z') },
    });
    const deleted = await prisma.task.create({
      data: { userId, title: 'Deleted', deletedAt: new Date('2026-07-29T01:00:00.000Z') },
    });
    await prisma.reminder.create({ data: { taskId: completed.id, remindAt: new Date('1999-01-01T01:00:00.000Z') } });
    await prisma.reminder.create({ data: { taskId: deleted.id, remindAt: new Date('1999-01-01T01:00:00.000Z') } });

    const result = await processDueReminders(new Date('1999-01-01T02:00:00.000Z'));

    expect(result.processed).toBe(0);
    expect(pushMocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it('leaves due reminders pending when push is not configured', async () => {
    pushMocks.isPushConfigured.mockReturnValue(false);
    const task = await prisma.task.create({ data: { userId, title: 'Configure VAPID' } });
    const reminder = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: new Date('1999-01-01T01:00:00.000Z') },
    });

    const result = await processDueReminders(new Date('1999-01-01T02:00:00.000Z'));

    expect(result.processed).toBe(0);
    expect(pushMocks.sendPushToUser).not.toHaveBeenCalled();
    await expect(prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } }))
      .resolves.toMatchObject({ isSent: false });
  });

  it('reopens a claimed reminder when push delivery throws', async () => {
    pushMocks.sendPushToUser.mockRejectedValueOnce(new Error('temporary push failure'));
    const task = await prisma.task.create({ data: { userId, title: 'Retry me' } });
    const reminder = await prisma.reminder.create({
      data: { taskId: task.id, remindAt: new Date('1999-01-01T01:00:00.000Z') },
    });

    const result = await processDueReminders(new Date('1999-01-01T02:00:00.000Z'));

    expect(result).toMatchObject({ processed: 1, sent: 0, skipped: 0 });
    await expect(prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } }))
      .resolves.toMatchObject({ isSent: false });
  });

  it('sends a due-time notification for tasks without a manual reminder only once', async () => {
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Schedule dentist',
        dueDate: new Date('1999-01-01T00:00:00.000Z'),
        dueTime: '11:00',
      },
    });

    const first = await processDueReminders(new Date('1999-01-02T00:00:00.000Z'));
    const second = await processDueReminders(new Date('1999-01-02T00:01:00.000Z'));

    expect(first).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
    expect(second).toMatchObject({ processed: 0, sent: 0, skipped: 0 });
    expect(pushMocks.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendPushToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
      title: 'Mindoist: Schedule dentist',
      url: `/tasks/${task.id}`,
      tag: `task-due-${task.id}`,
    }));
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.dueNotificationSentAt).toBeInstanceOf(Date);
  });

  it('sends a due notification for countdowns only once', async () => {
    const countdown = await prisma.countdown.create({
      data: {
        userId,
        title: 'Launch day',
        targetDate: new Date('1999-01-01T12:00:00.000Z'),
      },
    });

    const first = await processDueReminders(new Date('1999-01-01T12:01:00.000Z'));
    const second = await processDueReminders(new Date('1999-01-01T12:02:00.000Z'));

    expect(first).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
    expect(second).toMatchObject({ processed: 0, sent: 0, skipped: 0 });
    expect(pushMocks.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendPushToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
      title: 'Mindoist: Launch day',
      url: '/countdown',
      tag: `countdown-due-${countdown.id}`,
    }));
    const updated = await prisma.countdown.findUniqueOrThrow({ where: { id: countdown.id } });
    expect(updated.notificationSentAt).toBeInstanceOf(Date);
  });

  it('claims but does not push for a countdown whose target date is long in the past', async () => {
    // Regression: editing (or first-polling) an old countdown - e.g. one
    // set 12 weeks ago, from before this worker existed - claimed it as
    // "due now" and fired a stale push out of nowhere.
    const countdown = await prisma.countdown.create({
      data: {
        userId,
        title: 'Old milestone',
        targetDate: new Date('1999-01-01T12:00:00.000Z'),
      },
    });

    const result = await processDueReminders(new Date('1999-04-01T12:00:00.000Z'));
    expect(result).toMatchObject({ sent: 0 });
    expect(pushMocks.sendPushToUser).not.toHaveBeenCalled();

    const updated = await prisma.countdown.findUniqueOrThrow({ where: { id: countdown.id } });
    expect(updated.notificationSentAt).toBeInstanceOf(Date);
  });

  it('sends an early reminder for a countdown with reminderDaysBefore set, separate from the on-the-day one', async () => {
    const countdown = await prisma.countdown.create({
      data: {
        userId,
        title: 'Product launch',
        targetDate: new Date('1999-01-10T12:00:00.000Z'),
        reminderDaysBefore: 3,
      },
    });

    const early = await processDueReminders(new Date('1999-01-07T12:01:00.000Z'));
    expect(early).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
    expect(pushMocks.sendPushToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
      title: 'Mindoist: Product launch',
      url: '/countdown',
      tag: `countdown-early-${countdown.id}`,
    }));

    const again = await processDueReminders(new Date('1999-01-07T12:02:00.000Z'));
    expect(again).toMatchObject({ processed: 0, sent: 0, skipped: 0 });

    const dueDay = await processDueReminders(new Date('1999-01-10T12:01:00.000Z'));
    expect(dueDay).toMatchObject({ processed: 1, sent: 1, skipped: 0 });
    expect(pushMocks.sendPushToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
      tag: `countdown-due-${countdown.id}`,
    }));

    const updated = await prisma.countdown.findUniqueOrThrow({ where: { id: countdown.id } });
    expect(updated.earlyNotificationSentAt).toBeInstanceOf(Date);
    expect(updated.notificationSentAt).toBeInstanceOf(Date);
  });

  it('records an automatic due notification attempt even when no browser subscription receives it', async () => {
    pushMocks.sendPushToUser.mockResolvedValueOnce({ sent: 0, failed: 0, configured: true });
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Enable browser notifications',
        dueDate: new Date('1999-01-01T00:00:00.000Z'),
        dueTime: '11:00',
      },
    });

    const result = await processDueReminders(new Date('1999-01-02T00:00:00.000Z'));

    expect(result).toMatchObject({ processed: 1, sent: 0, skipped: 0 });
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.dueNotificationSentAt).toBeInstanceOf(Date);
  });
});
