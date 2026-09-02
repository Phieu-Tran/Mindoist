import { json } from '../_shared/http.ts';
import { sql } from '../_shared/db.ts';

const BATCH_SIZE = 50;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = Deno.env.get('DEFAULT_TIMEZONE') || 'Asia/Ho_Chi_Minh';
const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type Row = Record<string, unknown>;
type Stats = { processed: number; sent: number; skipped: number };

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
  };
  const firstPass = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(firstPass));
}

function localMoment(value: unknown, time: string | null, timeZone: string) {
  const day = dateOnly(value);
  return day ? zonedDateTimeToUtc(day, time || '09:00', timeZone) : null;
}

function taskDueAt(row: Row) {
  const timeZone = typeof row.deadlineTimeZone === 'string' && row.deadlineTimeZone
    ? row.deadlineTimeZone : (typeof row.timeZone === 'string' && row.timeZone ? row.timeZone : DEFAULT_TIMEZONE);
  return localMoment(row.deadlineDate, typeof row.deadlineTime === 'string' ? row.deadlineTime : null, timeZone);
}

function countdownTargetAt(row: Row) {
  const timeZone = typeof row.timeZone === 'string' && row.timeZone ? row.timeZone : DEFAULT_TIMEZONE;
  const target = new Date(String(row.targetDate));
  if (!Number.isNaN(target.getTime()) && (target.getUTCHours() || target.getUTCMinutes() || target.getUTCSeconds() || target.getUTCMilliseconds())) return target;
  return localMoment(row.targetDate, '09:00', timeZone);
}

function formatLocalTime(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone }).format(instant);
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string; dedupeKey?: string }) {
  let sent = 0;
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (publicKey && privateKey) {
    try {
      const module = await import('npm:web-push@3.6.7');
      const webPush = (module.default ?? module) as {
        setVapidDetails: (email: string, publicKey: string, privateKey: string) => void;
        sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, options: { TTL: number }) => Promise<unknown>;
      };
      webPush.setVapidDetails(Deno.env.get('VAPID_EMAIL') || 'mailto:admin@mindoist.app', publicKey, privateKey);
      const subscriptions = await sql<Row[]>`select endpoint,p256dh,auth from push_subscriptions where user_id=${userId}`;
      const stale: string[] = [];
      for (const subscription of subscriptions) {
        try {
          await webPush.sendNotification({ endpoint: String(subscription.endpoint), keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth) } }, JSON.stringify(payload), { TTL: 24 * 60 * 60 });
          sent++;
        } catch (cause) {
          const status = Number((cause as { statusCode?: number }).statusCode);
          if (status === 404 || status === 410) stale.push(String(subscription.endpoint));
        }
      }
      if (stale.length) await sql`delete from push_subscriptions where user_id=${userId} and endpoint in ${sql(stale)}`;
    } catch {
      // Delivery is best-effort; claiming prevents duplicate alerts.
    }
  }

  if (Deno.env.get('EXPO_PUSH_ENABLED') !== 'false') {
    const devices = await sql<Row[]>`select token from device_tokens where user_id=${userId}`;
    const messages = devices.map(device => String(device.token))
      .filter(token => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token))
      .map(token => ({ to: token, title: payload.title, body: payload.body, sound: 'default', channelId: 'default', ttl: 24 * 60 * 60, data: { ...(payload.url ? { url: payload.url } : {}), ...(payload.dedupeKey ? { dedupeKey: payload.dedupeKey } : {}) } }));
    if (messages.length) {
      try {
        const response = await fetch(EXPO_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
        const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
        sent += result.data?.filter(ticket => ticket.status === 'ok').length ?? 0;
        const stale = result.data?.flatMap((ticket, index) => ticket.details?.error === 'DeviceNotRegistered' ? [messages[index].to] : []) ?? [];
        if (stale.length) await sql`delete from device_tokens where user_id=${userId} and token in ${sql(stale)}`;
      } catch {
        // Keep device tokens for the next successful request.
      }
    }
  }
  return sent;
}

async function claimManualReminders() {
  return sql.begin(async tx => {
    const candidates = await tx<Row[]>`
      select r.id,r.remind_at as "remindAt",t.id as "taskId",t.title,t.user_id as "userId",u.time_zone as "timeZone"
      from reminders r join tasks t on t.id=r.task_id join users u on u.id=t.user_id
      where r.is_sent=false and r.remind_at <= now() and r.type='push'::"ReminderType"
        and t.completed_at is null and t.deleted_at is null
      order by r.remind_at asc for update of r skip locked limit ${BATCH_SIZE}
    `;
    if (candidates.length) await tx`update reminders set is_sent=true,updated_at=now() where id in ${sql(candidates.map(row => String(row.id)))}`;
    return candidates;
  });
}

async function processManualReminders(now: Date): Promise<Stats> {
  const reminders = await claimManualReminders();
  let sent = 0;
  for (const reminder of reminders) {
    const remindAt = new Date(String(reminder.remindAt));
    if (now.getTime() - remindAt.getTime() > STALE_AFTER_MS) continue;
    const timeZone = typeof reminder.timeZone === 'string' && reminder.timeZone ? reminder.timeZone : DEFAULT_TIMEZONE;
    try {
      sent += await sendPushToUser(String(reminder.userId), { title: `Mindoist: ${reminder.title}`, body: `Đến giờ nhắc đã đặt lúc ${formatLocalTime(remindAt, timeZone)}.`, url: `/tasks/${reminder.taskId}`, dedupeKey: `reminder:${reminder.id}` }) > 0 ? 1 : 0;
    } catch {
      await sql`update reminders set is_sent=false,updated_at=now() where id=${reminder.id} and is_sent=true`;
    }
  }
  return { processed: reminders.length, sent, skipped: 0 };
}

async function processDueTasks(now: Date): Promise<Stats> {
  const rows = await sql<Row[]>`
    select t.id,t.title,t.user_id as "userId",t.deadline_date as "deadlineDate",t.deadline_time as "deadlineTime",
      t.deadline_time_zone as "deadlineTimeZone",u.time_zone as "timeZone"
    from tasks t join users u on u.id=t.user_id
    where t.due_notification_sent_at is null and t.deadline_date <= current_date and t.completed_at is null and t.deleted_at is null
    order by t.deadline_date asc limit ${BATCH_SIZE}
  `;
  let processed = 0; let sent = 0; let skipped = 0;
  for (const row of rows) {
    const dueAt = taskDueAt(row);
    if (!dueAt || dueAt > now) { skipped++; continue; }
    const claimed = await sql`update tasks set due_notification_sent_at=now(),updated_at=now() where id=${row.id} and due_notification_sent_at is null and completed_at is null and deleted_at is null returning id`;
    if (!claimed.length) { skipped++; continue; }
    processed++;
    if (now.getTime() - dueAt.getTime() > STALE_AFTER_MS) continue;
    const timeZone = typeof row.deadlineTimeZone === 'string' && row.deadlineTimeZone ? row.deadlineTimeZone : (typeof row.timeZone === 'string' && row.timeZone ? row.timeZone : DEFAULT_TIMEZONE);
    try {
      sent += await sendPushToUser(String(row.userId), { title: `Mindoist: ${row.title}`, body: `Task đã tới hạn lúc ${formatLocalTime(dueAt, timeZone)}.`, url: `/tasks/${row.id}`, dedupeKey: `task-due:${row.id}` }) > 0 ? 1 : 0;
    } catch {
      await sql`update tasks set due_notification_sent_at=null,updated_at=now() where id=${row.id} and due_notification_sent_at is not null`;
    }
  }
  return { processed, sent, skipped };
}

async function processCountdowns(now: Date): Promise<Stats> {
  const rows = await sql<Row[]>`
    select c.id,c.title,c.user_id as "userId",c.target_date as "targetDate",c.reminder_days_before as "reminderDaysBefore",
      c.notification_sent_at as "notificationSentAt",c.early_notification_sent_at as "earlyNotificationSentAt",u.time_zone as "timeZone"
    from countdowns c join users u on u.id=c.user_id where c.deleted_at is null
      and (c.notification_sent_at is null or (c.reminder_days_before is not null and c.early_notification_sent_at is null))
    order by c.target_date asc limit ${BATCH_SIZE}
  `;
  let processed = 0; let sent = 0; let skipped = 0;
  for (const row of rows) {
    const targetAt = countdownTargetAt(row);
    if (!targetAt) { skipped++; continue; }
    const earlyDays = Number(row.reminderDaysBefore);
    const earlyAt = Number.isFinite(earlyDays) && earlyDays >= 0 ? new Date(targetAt.getTime() - earlyDays * 86_400_000) : null;
    const due = row.notificationSentAt === null || row.notificationSentAt === undefined;
    const early = Boolean(earlyAt && (row.earlyNotificationSentAt === null || row.earlyNotificationSentAt === undefined) && earlyAt <= now);
    if (!due && !early) { skipped++; continue; }
    const timeZone = typeof row.timeZone === 'string' && row.timeZone ? row.timeZone : DEFAULT_TIMEZONE;
    if (early) {
      const claimed = await sql`update countdowns set early_notification_sent_at=now(),updated_at=now() where id=${row.id} and early_notification_sent_at is null and deleted_at is null returning id`;
      if (claimed.length) {
        processed++;
        if (now.getTime() - earlyAt!.getTime() <= STALE_AFTER_MS) {
          try { sent += await sendPushToUser(String(row.userId), { title: `Mindoist: ${row.title}`, body: `Còn ${earlyDays === 1 ? '1 ngày' : `${earlyDays} ngày`} nữa là tới ${formatLocalTime(targetAt, timeZone)}.`, url: '/countdown', dedupeKey: `countdown-early:${row.id}` }) > 0 ? 1 : 0; } catch { await sql`update countdowns set early_notification_sent_at=null,updated_at=now() where id=${row.id}`; }
        }
      } else skipped++;
    }
    if (due && targetAt <= now) {
      const claimed = await sql`update countdowns set notification_sent_at=now(),updated_at=now() where id=${row.id} and notification_sent_at is null and deleted_at is null returning id`;
      if (claimed.length) {
        processed++;
        if (now.getTime() - targetAt.getTime() <= STALE_AFTER_MS) {
          try { sent += await sendPushToUser(String(row.userId), { title: `Mindoist: ${row.title}`, body: `Countdown đã tới mốc ${formatLocalTime(targetAt, timeZone)}.`, url: '/countdown', dedupeKey: `countdown-due:${row.id}` }) > 0 ? 1 : 0; } catch { await sql`update countdowns set notification_sent_at=null,updated_at=now() where id=${row.id}`; }
        }
      } else skipped++;
    }
  }
  return { processed, sent, skipped };
}

function merge(...stats: Stats[]): Stats {
  return stats.reduce((total, current) => ({ processed: total.processed + current.processed, sent: total.sent + current.sent, skipped: total.skipped + current.skipped }), { processed: 0, sent: 0, skipped: 0 });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  const expectedSecret = Deno.env.get('JOBS_SECRET');
  if (!expectedSecret || request.headers.get('x-job-secret') !== expectedSecret) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (Deno.env.get('SF0_FEATURES') !== '1') return json({ success: true, data: { processed: 0, sent: 0, skipped: 0, phase: 'SF0-shell' } });
  const now = new Date();
  const stats = merge(await processManualReminders(now), await processDueTasks(now), await processCountdowns(now));
  return json({ success: true, data: { ...stats, phase: 'SF0' } });
});
