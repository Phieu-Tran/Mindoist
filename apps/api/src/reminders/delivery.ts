import { prisma } from '../db.js';
import { isWebPushConfigured, sendPushToUser, type PushTransport } from '../push/service.js';
import { zonedDateTimeToUtc } from '../tasks/deadline.js';

/**
 * Every alert this worker sends is derived from a moment the client already
 * holds - a task's due date, a countdown's target, a reminder's `remindAt`.
 * The mobile app schedules all of them with the OS itself
 * (apps/mobile/src/notifications/local-reminders.ts), which is what lets them
 * fire with no network at all; pushing the same thing natively would simply
 * show every reminder on the phone twice.
 *
 * Browsers have no equivalent, so the web transport stays.
 */
const WEB_ONLY: { transports: readonly PushTransport[] } = { transports: ['web'] };

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
// Tasks/countdowns without an explicit timeZone (all-day, or legacy dueTime
// recorded before per-task time zones existed) have no per-user offset to
// fall back on - default to the app's primary market instead of the
// server process's own local time (UTC in Docker), which has no
// relationship to any real user.
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Ho_Chi_Minh';
// A reminder/due-time/countdown created (or edited) long after its own
// moment already passed - a task due weeks ago, a countdown target set
// months back - has nothing timely left to say. Without this, editing an
// old record (or the worker seeing it for the first time, e.g. right
// after this feature shipped) claims it as "due now" and fires a push
// for an event that's ancient history. Past this window the record is
// still claimed (so it stops being re-checked forever), just silently,
// with no push actually sent.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let interval: NodeJS.Timeout | null = null;
let running = false;

type WorkerStats = { processed: number; sent: number; skipped: number };

function formatLocalTime(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone,
  }).format(instant);
}

function reminderBody(remindAt: Date, timeZone: string) {
  return `Đến giờ nhắc đã đặt lúc ${formatLocalTime(remindAt, timeZone)}.`;
}

function dueBody(dueAt: Date, timeZone: string) {
  return `Task đã tới hạn lúc ${formatLocalTime(dueAt, timeZone)}.`;
}

function countdownBody(targetAt: Date, timeZone: string) {
  return `Countdown đã tới mốc ${formatLocalTime(targetAt, timeZone)}.`;
}

function countdownEarlyBody(targetAt: Date, daysBefore: number, timeZone: string) {
  const dayLabel = daysBefore === 1 ? '1 ngày' : `${daysBefore} ngày`;
  return `Còn ${dayLabel} nữa là tới ${formatLocalTime(targetAt, timeZone)}.`;
}

function localDateTime(date: Date, time: string, timeZone: string) {
  const datePart = date.toISOString().slice(0, 10);
  return zonedDateTimeToUtc(datePart, time, timeZone);
}

function taskDueAt(
  task: {
    dueDate: Date | null;
    dueTime: string | null;
    deadlineDate: Date | null;
    deadlineTime: string | null;
    deadlineTimeZone: string | null;
  },
  fallbackTimeZone: string,
) {
  if (!task.dueDate) return null;
  if (task.deadlineTime && task.deadlineTimeZone) return task.dueDate;
  const date = task.deadlineDate ?? task.dueDate;
  return localDateTime(date, task.deadlineTime ?? task.dueTime ?? '09:00', fallbackTimeZone);
}

function countdownTargetAt(targetDate: Date, fallbackTimeZone: string) {
  if (
    targetDate.getUTCHours() !== 0 ||
    targetDate.getUTCMinutes() !== 0 ||
    targetDate.getUTCSeconds() !== 0 ||
    targetDate.getUTCMilliseconds() !== 0
  ) {
    return targetDate;
  }
  return localDateTime(targetDate, '09:00', fallbackTimeZone);
}

function mergeStats(...stats: WorkerStats[]): WorkerStats {
  return stats.reduce(
    (total, stat) => ({
      processed: total.processed + stat.processed,
      sent: total.sent + stat.sent,
      skipped: total.skipped + stat.skipped,
    }),
    { processed: 0, sent: 0, skipped: 0 },
  );
}

async function processManualReminders(now: Date, batchSize: number): Promise<WorkerStats> {
  const reminders = await prisma.reminder.findMany({
    where: {
      isSent: false,
      remindAt: { lte: now },
      type: 'push',
      task: {
        completedAt: null,
        deletedAt: null,
      },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          userId: true,
          user: { select: { timeZone: true } },
        },
      },
    },
    orderBy: { remindAt: 'asc' },
    take: batchSize,
  });

  let sent = 0;
  let skipped = 0;

  for (const reminder of reminders) {
    const claimed = await prisma.reminder.updateMany({
      where: { id: reminder.id, isSent: false },
      data: { isSent: true },
    });
    if (claimed.count === 0) {
      skipped++;
      continue;
    }

    if (now.getTime() - reminder.remindAt.getTime() > STALE_AFTER_MS) {
      continue;
    }

    try {
      const timeZone = reminder.task.user.timeZone || DEFAULT_TIMEZONE;
      const result = await sendPushToUser(reminder.task.userId, {
        title: `Mindoist: ${reminder.task.title}`,
        body: reminderBody(reminder.remindAt, timeZone),
        url: `/tasks/${reminder.task.id}`,
        tag: `task-reminder-${reminder.id}`,
        icon: '/favicon.svg',
      }, WEB_ONLY);

      if (result.sent > 0) sent++;
    } catch (err) {
      await prisma.reminder.updateMany({
        where: { id: reminder.id, isSent: true },
        data: { isSent: false },
      });
      console.error(`[ReminderWorker] failed reminder ${reminder.id}:`, err);
    }
  }

  return { processed: reminders.length, sent, skipped };
}

async function processDueTasks(now: Date, batchSize: number): Promise<WorkerStats> {
  const tasks = await prisma.task.findMany({
    where: {
      dueNotificationSentAt: null,
      dueDate: { lte: now },
      completedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      userId: true,
      dueDate: true,
      dueTime: true,
      deadlineDate: true,
      deadlineTime: true,
      deadlineTimeZone: true,
      user: { select: { timeZone: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: batchSize,
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const task of tasks) {
    const timeZone = task.user.timeZone || DEFAULT_TIMEZONE;
    const dueAt = taskDueAt(task, timeZone);
    if (!dueAt || dueAt > now) {
      skipped++;
      continue;
    }

    const claimed = await prisma.task.updateMany({
      where: { id: task.id, dueNotificationSentAt: null, completedAt: null, deletedAt: null },
      data: { dueNotificationSentAt: now },
    });
    if (claimed.count === 0) {
      skipped++;
      continue;
    }

    processed++;
    if (now.getTime() - dueAt.getTime() > STALE_AFTER_MS) {
      continue;
    }

    try {
      const result = await sendPushToUser(task.userId, {
        title: `Mindoist: ${task.title}`,
        body: dueBody(dueAt, timeZone),
        url: `/tasks/${task.id}`,
        tag: `task-due-${task.id}`,
        icon: '/favicon.svg',
      }, WEB_ONLY);

      if (result.sent > 0) sent++;
    } catch (err) {
      await prisma.task.updateMany({
        where: { id: task.id, dueNotificationSentAt: now },
        data: { dueNotificationSentAt: null },
      });
      console.error(`[ReminderWorker] failed due task ${task.id}:`, err);
    }
  }

  return { processed, sent, skipped };
}

async function processDueCountdowns(now: Date, batchSize: number): Promise<WorkerStats> {
  const countdowns = await prisma.countdown.findMany({
    where: {
      notificationSentAt: null,
      targetDate: { lte: now },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      userId: true,
      targetDate: true,
      user: { select: { timeZone: true } },
    },
    orderBy: { targetDate: 'asc' },
    take: batchSize,
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const countdown of countdowns) {
    const timeZone = countdown.user.timeZone || DEFAULT_TIMEZONE;
    const targetAt = countdownTargetAt(countdown.targetDate, timeZone);
    if (targetAt > now) {
      skipped++;
      continue;
    }

    const claimed = await prisma.countdown.updateMany({
      where: { id: countdown.id, notificationSentAt: null, deletedAt: null },
      data: { notificationSentAt: now },
    });
    if (claimed.count === 0) {
      skipped++;
      continue;
    }

    processed++;
    if (now.getTime() - targetAt.getTime() > STALE_AFTER_MS) {
      continue;
    }

    try {
      const result = await sendPushToUser(countdown.userId, {
        title: `Mindoist: ${countdown.title}`,
        body: countdownBody(targetAt, timeZone),
        url: '/countdown',
        tag: `countdown-due-${countdown.id}`,
        icon: '/favicon.svg',
      }, WEB_ONLY);

      if (result.sent > 0) sent++;
    } catch (err) {
      await prisma.countdown.updateMany({
        where: { id: countdown.id, notificationSentAt: now },
        data: { notificationSentAt: null },
      });
      console.error(`[ReminderWorker] failed countdown ${countdown.id}:`, err);
    }
  }

  return { processed, sent, skipped };
}

async function processEarlyCountdownReminders(now: Date, batchSize: number): Promise<WorkerStats> {
  const countdowns = await prisma.countdown.findMany({
    where: {
      reminderDaysBefore: { not: null },
      earlyNotificationSentAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      userId: true,
      targetDate: true,
      reminderDaysBefore: true,
      user: { select: { timeZone: true } },
    },
    orderBy: { targetDate: 'asc' },
    take: batchSize,
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const countdown of countdowns) {
    const timeZone = countdown.user.timeZone || DEFAULT_TIMEZONE;
    const targetAt = countdownTargetAt(countdown.targetDate, timeZone);
    const daysBefore = countdown.reminderDaysBefore!;
    const remindAt = new Date(targetAt.getTime() - daysBefore * 86_400_000);
    if (remindAt > now) {
      skipped++;
      continue;
    }

    const claimed = await prisma.countdown.updateMany({
      where: { id: countdown.id, earlyNotificationSentAt: null, deletedAt: null },
      data: { earlyNotificationSentAt: now },
    });
    if (claimed.count === 0) {
      skipped++;
      continue;
    }

    processed++;
    if (now.getTime() - remindAt.getTime() > STALE_AFTER_MS) {
      continue;
    }

    try {
      const result = await sendPushToUser(countdown.userId, {
        title: `Mindoist: ${countdown.title}`,
        body: countdownEarlyBody(targetAt, daysBefore, timeZone),
        url: '/countdown',
        tag: `countdown-early-${countdown.id}`,
        icon: '/favicon.svg',
      }, WEB_ONLY);

      if (result.sent > 0) sent++;
    } catch (err) {
      await prisma.countdown.updateMany({
        where: { id: countdown.id, earlyNotificationSentAt: now },
        data: { earlyNotificationSentAt: null },
      });
      console.error(`[ReminderWorker] failed early countdown ${countdown.id}:`, err);
    }
  }

  return { processed, sent, skipped };
}

export async function processDueReminders(now = new Date(), batchSize = DEFAULT_BATCH_SIZE) {
  // Only the browser is served from here now, so with no VAPID key there is
  // nothing this worker could deliver - and claiming rows it cannot send would
  // burn them for the browsers that come online later.
  if (!isWebPushConfigured()) {
    return { processed: 0, sent: 0, skipped: 0 };
  }

  return mergeStats(
    await processManualReminders(now, batchSize),
    await processDueTasks(now, batchSize),
    await processDueCountdowns(now, batchSize),
    await processEarlyCountdownReminders(now, batchSize),
  );
}

export function startReminderWorker() {
  if (interval || process.env.REMINDER_WORKER_DISABLED === 'true') return;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processDueReminders();
      if (result.processed > 0) {
        console.log(`[ReminderWorker] processed=${result.processed} sent=${result.sent} skipped=${result.skipped}`);
      }
    } catch (err) {
      console.error('[ReminderWorker] failed:', err);
    } finally {
      running = false;
    }
  };

  void run();
  interval = setInterval(run, Number(process.env.REMINDER_WORKER_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS);
}

export function stopReminderWorker() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}
