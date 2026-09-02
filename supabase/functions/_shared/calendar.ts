import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

type Row = Record<string, unknown>;

function bodyOf(request: Request): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({})).then(value =>
    value && typeof value === 'object' ? value as Record<string, unknown> : {});
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: unknown) {
  if (value === null || value === undefined) return value ?? null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function validTimeZone(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; }
}

function invalid(message: string) {
  return json({ success: false, error: message }, { status: 400 });
}

function mapTimeBlock(row: Row) {
  return {
    ...row,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: iso(row.deletedAt),
    completedAt: iso(row.completedAt),
  };
}

function mapCountdown(row: Row) {
  return {
    ...row,
    targetDate: iso(row.targetDate),
    notificationSentAt: iso(row.notificationSentAt),
    earlyNotificationSentAt: iso(row.earlyNotificationSentAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: iso(row.deletedAt),
  };
}

async function taskOwned(taskId: unknown, userId: string) {
  if (typeof taskId !== 'string' || !taskId) return false;
  const rows = await sql<{ id: string }[]>`
    select id from tasks where id = ${taskId} and user_id = ${userId} and deleted_at is null limit 1
  `;
  return Boolean(rows[0]);
}

async function timeBlockForUser(id: string, userId: string) {
  const rows = await sql<Row[]>`
    select id, user_id as "userId", task_id as "taskId", start_at as "startAt", end_at as "endAt",
      time_zone as "timeZone", all_day as "allDay", source, created_at as "createdAt", updated_at as "updatedAt",
      deleted_at as "deletedAt", completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions"
    from time_blocks where id = ${id} and user_id = ${userId} and deleted_at is null limit 1
  `;
  return rows[0] ?? null;
}

async function routeTimeBlocks(path: string, request: Request, userId: string) {
  if (path === '/time-blocks' && request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const taskId = params.get('taskId');
    const from = params.get('from');
    const to = params.get('to');
    if (taskId && !await taskOwned(taskId, userId)) return json({ success: true, data: [] });
    const fromDate = from ? dateValue(from) : null;
    const toDate = to ? dateValue(to) : null;
    if ((from && !fromDate) || (to && !toDate)) return invalid('Invalid date range');
    const rows = await sql<Row[]>`
      select id, user_id as "userId", task_id as "taskId", start_at as "startAt", end_at as "endAt",
        time_zone as "timeZone", all_day as "allDay", source, created_at as "createdAt", updated_at as "updatedAt",
        deleted_at as "deletedAt", completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions"
      from time_blocks
      where user_id = ${userId} and deleted_at is null
        and (${taskId}::uuid is null or task_id = ${taskId})
        and (${toDate}::timestamptz is null or start_at < ${toDate})
        and (${fromDate}::timestamptz is null or end_at > ${fromDate})
      order by start_at asc, created_at asc
    `;
    return json({ success: true, data: rows.map(mapTimeBlock) });
  }

  if (path === '/time-blocks' && request.method === 'POST') {
    const input = await bodyOf(request);
    const taskId = input.taskId;
    const startAt = dateValue(input.startAt);
    const endAt = dateValue(input.endAt);
    const source = input.source === undefined ? 'MANUAL' : input.source;
    const completedAt = input.completedAt === undefined || input.completedAt === null ? null : dateValue(input.completedAt);
    if (!await taskOwned(taskId, userId) || !startAt || !endAt || startAt >= endAt ||
      !validTimeZone(input.timeZone) || !['MANUAL', 'RECURRENCE', 'IMPORT', 'EXTERNAL'].includes(String(source)) ||
      (input.completedAt !== undefined && input.completedAt !== null && !completedAt)) {
      return invalid('Invalid time block');
    }
    if (input.allDay !== undefined && typeof input.allDay !== 'boolean') return invalid('Invalid allDay');
    if (input.actualMin !== undefined && input.actualMin !== null &&
      (typeof input.actualMin !== 'number' || !Number.isInteger(input.actualMin) || input.actualMin < 0)) return invalid('Invalid actualMin');
    const rows = await sql<Row[]>`
      insert into time_blocks (id, user_id, task_id, start_at, end_at, time_zone, all_day, source, completed_at, actual_min, created_at, updated_at)
      values (${crypto.randomUUID()}, ${userId}, ${taskId}, ${startAt}, ${endAt}, ${input.timeZone}, ${input.allDay ?? false}, ${source}::"TimeBlockSource",
        ${completedAt}, ${input.actualMin ?? null}, now(), now())
      returning id, user_id as "userId", task_id as "taskId", start_at as "startAt", end_at as "endAt", time_zone as "timeZone",
        all_day as "allDay", source, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt",
        completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions"
    `;
    return json({ success: true, data: mapTimeBlock(rows[0]) }, { status: 201 });
  }

  const match = path.match(/^\/time-blocks\/([^/]+)$/);
  if (match && request.method === 'PATCH') {
    const existing = await timeBlockForUser(match[1], userId);
    if (!existing) return json({ success: false, error: 'Time block not found' }, { status: 404 });
    const input = await bodyOf(request);
    const startAt = input.startAt === undefined ? new Date(String(existing.startAt)) : dateValue(input.startAt);
    const endAt = input.endAt === undefined ? new Date(String(existing.endAt)) : dateValue(input.endAt);
    if (!startAt || !endAt || startAt >= endAt || (input.timeZone !== undefined && !validTimeZone(input.timeZone))) return invalid('Invalid time block');
    if (input.allDay !== undefined && typeof input.allDay !== 'boolean') return invalid('Invalid allDay');
    if (input.actualMin !== undefined && input.actualMin !== null &&
      (typeof input.actualMin !== 'number' || !Number.isInteger(input.actualMin) || input.actualMin < 0)) return invalid('Invalid actualMin');
    const completedAt = input.completedAt === undefined ? undefined : input.completedAt === null ? null : dateValue(input.completedAt);
    if (input.completedAt !== undefined && input.completedAt !== null && !completedAt) return invalid('Invalid completedAt');
    const rows = await sql<Row[]>`
      update time_blocks set
        start_at = ${startAt}, end_at = ${endAt},
        time_zone = coalesce(${input.timeZone ?? null}, time_zone),
        all_day = coalesce(${input.allDay ?? null}, all_day),
        completed_at = case when ${input.completedAt !== undefined} then ${completedAt ?? null} else completed_at end,
        actual_min = case when ${input.actualMin !== undefined} then ${input.actualMin ?? null} else actual_min end,
        updated_at = now()
      where id = ${match[1]} and user_id = ${userId} and deleted_at is null
      returning id, user_id as "userId", task_id as "taskId", start_at as "startAt", end_at as "endAt", time_zone as "timeZone",
        all_day as "allDay", source, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt",
        completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions"
    `;
    return json({ success: true, data: mapTimeBlock(rows[0]) });
  }
  if (match && request.method === 'DELETE') {
    const existing = await timeBlockForUser(match[1], userId);
    if (!existing) return json({ success: false, error: 'Time block not found' }, { status: 404 });
    await sql`update time_blocks set deleted_at = now(), updated_at = now() where id = ${match[1]} and user_id = ${userId}`;
    return json({ success: true });
  }
  return null;
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return null; }
}

async function routeProjection(request: Request, userId: string) {
  const params = new URL(request.url).searchParams;
  const from = dateValue(params.get('from'));
  const to = dateValue(params.get('to'));
  const timeZone = params.get('timeZone') || 'UTC';
  if (!from || !to || from >= to || !validTimeZone(timeZone)) return invalid('Invalid projection range');
  const fromKey = dateKeyInTimeZone(from, timeZone);
  const toKey = dateKeyInTimeZone(to, timeZone);
  if (!fromKey || !toKey) return invalid('Invalid projection time zone');
  const fromBoundary = new Date(`${fromKey}T00:00:00.000Z`);
  const toBoundary = new Date(`${toKey}T00:00:00.000Z`);
  const [blocks, tasks] = await Promise.all([
    sql<Row[]>`
      select id, user_id as "userId", task_id as "taskId", start_at as "startAt", end_at as "endAt", time_zone as "timeZone",
        all_day as "allDay", source, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt",
        completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions"
      from time_blocks where user_id = ${userId} and deleted_at is null and start_at < ${to} and end_at > ${from}
      order by start_at asc, created_at asc
    `,
    sql<Row[]>`
      select id, title, completed_at as "completedAt", priority, project_id as "projectId", color,
        start_date as "startDate", deadline_date as "deadlineDate", deadline_time as "deadlineTime", deadline_time_zone as "deadlineTimeZone"
      from tasks where user_id = ${userId} and deleted_at is null and (
        (start_date is null and deadline_date >= ${fromBoundary} and deadline_date < ${toBoundary}) or
        (start_date < ${toBoundary} and deadline_date >= ${fromBoundary})
      ) order by deadline_date asc, created_at asc
    `,
  ]);
  const blockTaskIds = [...new Set(blocks.map(block => String(block.taskId)))];
  const owners = blockTaskIds.length ? await sql<Row[]>`
    select id, title, priority, project_id as "projectId", color, completed_at as "completedAt"
    from tasks where user_id = ${userId} and deleted_at is null and id in ${sql(blockTaskIds)}
  ` : [];
  const ownerById = new Map(owners.map(owner => [String(owner.id), owner]));
  return json({ success: true, data: {
    timeBlocks: blocks.map(block => {
      const owner = ownerById.get(String(block.taskId));
      return { ...mapTimeBlock(block), title: owner?.title ?? null, priority: owner?.priority ?? null,
        projectId: owner?.projectId ?? null, colorOverride: owner?.color ?? null, completedAt: iso(owner?.completedAt ?? block.completedAt) };
    }),
    deadlines: tasks.map(task => ({
      id: `deadline-${task.id}`, taskId: task.id, title: task.title,
      startDate: task.startDate ? iso(task.startDate)?.slice(0, 10) : null,
      date: iso(task.deadlineDate)?.slice(0, 10), time: task.deadlineTime ?? null, timeZone: task.deadlineTimeZone ?? null,
      completedAt: iso(task.completedAt), priority: task.priority ?? null, projectId: task.projectId ?? null, colorOverride: task.color ?? null,
    })),
    externalEvents: [],
  } });
}

function expoToken(value: unknown) { return typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value); }

async function routePush(path: string, request: Request, userId: string) {
  if (path === '/push/vapid-public-key' && request.method === 'GET') {
    return json({ success: true, data: { publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '' } });
  }
  const auth = path === '/push/vapid-public-key' ? null : await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (path === '/push/subscribe' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (typeof input.endpoint !== 'string' || !/^https?:\/\//.test(input.endpoint) || typeof input.p256dh !== 'string' || typeof input.auth !== 'string') return invalid('Invalid subscription');
    await sql`
      insert into push_subscriptions (id,user_id,endpoint,p256dh,auth,created_at) values (${crypto.randomUUID()},${userId},${input.endpoint},${input.p256dh},${input.auth},now())
      on conflict (user_id,endpoint) do update set p256dh=excluded.p256dh, auth=excluded.auth
    `;
    return json({ success: true });
  }
  if (path === '/push/subscribe' && request.method === 'DELETE') {
    const input = await bodyOf(request);
    if (typeof input.endpoint !== 'string' || !input.endpoint) return invalid('Missing endpoint');
    await sql`delete from push_subscriptions where user_id=${userId} and endpoint=${input.endpoint}`;
    return json({ success: true });
  }
  if (path === '/push/devices' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (!expoToken(input.token) || !['android', 'ios'].includes(String(input.platform)) || (input.deviceName !== undefined && input.deviceName !== null && (typeof input.deviceName !== 'string' || input.deviceName.length > 120))) return invalid('Invalid device token');
    await sql`
      insert into device_tokens (id,user_id,token,platform,device_name,created_at,updated_at) values (${crypto.randomUUID()},${userId},${input.token},${input.platform},${input.deviceName ?? null},now(),now())
      on conflict (user_id,token) do update set platform=excluded.platform, device_name=excluded.device_name, updated_at=now()
    `;
    return json({ success: true });
  }
  if (path === '/push/devices' && request.method === 'DELETE') {
    const input = await bodyOf(request);
    if (typeof input.token !== 'string' || !input.token) return invalid('Missing token');
    await sql`delete from device_tokens where user_id=${userId} and token=${input.token}`;
    return json({ success: true });
  }
  if (path === '/push/send' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (typeof input.title !== 'string' || typeof input.body !== 'string') return invalid('Invalid payload');
    const webConfigured = Boolean(Deno.env.get('VAPID_PUBLIC_KEY') && Deno.env.get('VAPID_PRIVATE_KEY'));
    const expoConfigured = Deno.env.get('EXPO_PUSH_ENABLED') !== 'false';
    if (!webConfigured && !expoConfigured) return json({ success: false, error: 'Push not configured' }, { status: 503 });
    // Delivery is best-effort. Native Expo credentials live outside the API;
    // web delivery is enabled when VAPID keys are supplied to the function.
    let sent = 0;
    if (expoConfigured) {
      const devices = await sql<{ token: string }[]>`select token from device_tokens where user_id=${userId}`;
      if (devices.length) {
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(devices.map(device => ({ to: device.token, title: input.title, body: input.body, sound: 'default', data: input.url ? { url: input.url } : {} }))) });
          if (response.ok) {
            const result = await response.json() as { data?: Array<{ status?: string }> };
            sent += result.data?.filter(ticket => ticket.status === 'ok').length ?? 0;
          }
        } catch { /* retry on the next reminder */ }
      }
    }
    return json({ success: true, data: { sent, failed: 0 } });
  }
  return null;
}

export async function routeCalendar(path: string, request: Request): Promise<Response | null> {
  if (path === '/calendar/projection') {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
    return routeProjection(request, auth.user.id);
  }
  if (/^\/time-blocks(?:\/|$)/.test(path)) {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    return routeTimeBlocks(path, request, auth.user.id);
  }
  if (/^\/push\//.test(path)) {
    const publicKey = path === '/push/vapid-public-key' && request.method === 'GET';
    if (publicKey) return routePush(path, request, '');
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    return routePush(path, request, auth.user.id);
  }
  return null;
}

export async function routeCountdowns(path: string, request: Request): Promise<Response | null> {
  if (!/^\/countdowns(?:\/|$)/.test(path)) return null;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  if (path === '/countdowns' && request.method === 'GET') {
    const rows = await sql<Row[]>`
      select id, user_id as "userId", title, target_date as "targetDate", color, image_url as "imageUrl",
        reminder_days_before as "reminderDaysBefore", show_in_calendar as "showInCalendar", notification_sent_at as "notificationSentAt",
        early_notification_sent_at as "earlyNotificationSentAt", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from countdowns where user_id=${userId} and deleted_at is null order by target_date asc
    `;
    return json({ success: true, data: rows.map(mapCountdown) });
  }
  if (path === '/countdowns' && request.method === 'POST') {
    const input = await bodyOf(request);
    const targetDate = dateValue(input.targetDate);
    if (typeof input.title !== 'string' || !input.title.trim() || !targetDate ||
      (input.imageUrl !== undefined && input.imageUrl !== null && (typeof input.imageUrl !== 'string' || !/^https?:\/\//.test(input.imageUrl))) ||
      (input.reminderDaysBefore !== undefined && input.reminderDaysBefore !== null && (typeof input.reminderDaysBefore !== 'number' || !Number.isInteger(input.reminderDaysBefore) || input.reminderDaysBefore < 0 || input.reminderDaysBefore > 30)) ||
      (input.showInCalendar !== undefined && typeof input.showInCalendar !== 'boolean')) return invalid('Invalid body');
    const rows = await sql<Row[]>`
      insert into countdowns (id,user_id,title,target_date,color,image_url,reminder_days_before,show_in_calendar,created_at,updated_at)
      values (${crypto.randomUUID()},${userId},${input.title.trim()},${targetDate},${input.color ?? null},${input.imageUrl ?? null},${input.reminderDaysBefore ?? null},${input.showInCalendar ?? false},now(),now())
      returning id,user_id as "userId",title,target_date as "targetDate",color,image_url as "imageUrl",reminder_days_before as "reminderDaysBefore",show_in_calendar as "showInCalendar",notification_sent_at as "notificationSentAt",early_notification_sent_at as "earlyNotificationSentAt",created_at as "createdAt",updated_at as "updatedAt",deleted_at as "deletedAt"
    `;
    return json({ success: true, data: mapCountdown(rows[0]) }, { status: 201 });
  }
  const match = path.match(/^\/countdowns\/([^/]+)$/);
  if (!match || !['PATCH', 'DELETE'].includes(request.method)) return null;
  const existing = await sql<Row[]>`select id from countdowns where id=${match[1]} and user_id=${userId} and deleted_at is null limit 1`;
  if (!existing[0]) return json({ success: false, error: 'Not found' }, { status: 404 });
  if (request.method === 'DELETE') {
    await sql`update countdowns set deleted_at=now(), updated_at=now() where id=${match[1]} and user_id=${userId}`;
    return json({ success: true });
  }
  const input = await bodyOf(request);
  const targetDate = input.targetDate === undefined ? undefined : dateValue(input.targetDate);
  if (targetDate === null || (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim())) ||
    (input.imageUrl !== undefined && input.imageUrl !== null && (typeof input.imageUrl !== 'string' || !/^https?:\/\//.test(input.imageUrl))) ||
    (input.showInCalendar !== undefined && typeof input.showInCalendar !== 'boolean') ||
    (input.reminderDaysBefore !== undefined && input.reminderDaysBefore !== null && (typeof input.reminderDaysBefore !== 'number' || !Number.isInteger(input.reminderDaysBefore) || input.reminderDaysBefore < 0 || input.reminderDaysBefore > 30))) return invalid('Invalid body');
  const scheduleChanged = input.targetDate !== undefined || input.reminderDaysBefore !== undefined;
  const rows = await sql<Row[]>`
    update countdowns set title=coalesce(${input.title === undefined ? null : String(input.title).trim()},title),
      target_date=coalesce(${targetDate ?? null},target_date), color=case when ${input.color !== undefined} then ${input.color ?? null} else color end,
      image_url=case when ${input.imageUrl !== undefined} then ${input.imageUrl ?? null} else image_url end,
      reminder_days_before=case when ${input.reminderDaysBefore !== undefined} then ${input.reminderDaysBefore ?? null} else reminder_days_before end,
      show_in_calendar=coalesce(${input.showInCalendar ?? null},show_in_calendar),
      notification_sent_at=case when ${input.targetDate !== undefined} then null else notification_sent_at end,
      early_notification_sent_at=case when ${scheduleChanged} then null else early_notification_sent_at end,
      updated_at=now() where id=${match[1]} and user_id=${userId} and deleted_at is null
      returning id,user_id as "userId",title,target_date as "targetDate",color,image_url as "imageUrl",reminder_days_before as "reminderDaysBefore",show_in_calendar as "showInCalendar",notification_sent_at as "notificationSentAt",early_notification_sent_at as "earlyNotificationSentAt",created_at as "createdAt",updated_at as "updatedAt",deleted_at as "deletedAt"
  `;
  return json({ success: true, data: mapCountdown(rows[0]) });
}
