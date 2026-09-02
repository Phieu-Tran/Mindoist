import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth, type AuthContext } from './sf0.ts';

function invalid(message: string) {
  return json({ success: false, error: message }, { status: 400 });
}

async function bodyOf(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown, max = 200) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

function optionalText(value: unknown, max = 200) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value, max);
}

function validTimeZone(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}

async function areaForUser(id: string, userId: string) {
  const rows = await sql<Record<string, unknown>[]>`
    select id, user_id as "userId", name, color, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    from areas where id = ${id} and user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

async function noteForUser(id: string, userId: string) {
  const rows = await sql<Record<string, unknown>[]>`
    select id, user_id as "userId", task_id as "taskId", title, content, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from notes where id = ${id} and user_id = ${userId} and deleted_at is null limit 1
  `;
  return rows[0] ?? null;
}

async function taskOwned(taskId: unknown, userId: string) {
  if (taskId === null || taskId === undefined) return true;
  if (typeof taskId !== 'string') return false;
  const rows = await sql<{ id: string }[]>`select id from tasks where id = ${taskId} and user_id = ${userId} and deleted_at is null limit 1`;
  return Boolean(rows[0]);
}

async function routeAreas(path: string, request: Request, userId: string) {
  if (path === '/areas' && request.method === 'GET') {
    const rows = await sql<Record<string, unknown>[]>`
      select id, user_id as "userId", name, color, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
      from areas where user_id = ${userId} order by sort_order asc
    `;
    return json({ success: true, data: rows });
  }
  if (path === '/areas' && request.method === 'POST') {
    const input = await bodyOf(request);
    const name = text(input.name);
    if (!name) return invalid('Name is required');
    const color = optionalText(input.color, 24);
    if (color === null) return invalid('Invalid color');
    const duplicate = await sql<{ id: string }[]>`select id from areas where user_id = ${userId} and name = ${name} limit 1`;
    if (duplicate[0]) return json({ success: false, error: 'Area with this name already exists' }, { status: 409 });
    const rows = await sql<Record<string, unknown>[]>`
      insert into areas (id, user_id, name, color, created_at, updated_at)
      values (${crypto.randomUUID()}, ${userId}, ${name}, ${color ?? null}, now(), now())
      returning id, user_id as "userId", name, color, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }
  const match = path.match(/^\/areas\/([^/]+)$/);
  if (!match || !['PATCH', 'DELETE'].includes(request.method)) return null;
  const existing = await areaForUser(match[1], userId);
  if (!existing) return json({ success: false, error: 'Area not found' }, { status: 404 });
  if (request.method === 'DELETE') {
    await sql.begin(async tx => {
      await tx`update projects set area_id = null, updated_at = now() where area_id = ${match[1]} and user_id = ${userId}`;
      await tx`delete from areas where id = ${match[1]} and user_id = ${userId}`;
    });
    return json({ success: true });
  }
  const input = await bodyOf(request);
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name);
    if (!name) return invalid('Invalid name');
    if (name !== existing.name) {
      const duplicate = await sql<{ id: string }[]>`select id from areas where user_id = ${userId} and name = ${name} and id <> ${match[1]} limit 1`;
      if (duplicate[0]) return json({ success: false, error: 'Area with this name already exists' }, { status: 409 });
    }
    updates.name = name;
  }
  if (input.color !== undefined) {
    const color = optionalText(input.color, 24);
    if (color === null && input.color !== null) return invalid('Invalid color');
    updates.color = color;
  }
  if (input.sortOrder !== undefined) {
    if (typeof input.sortOrder !== 'number' || !Number.isFinite(input.sortOrder)) return invalid('Invalid sortOrder');
    updates.sortOrder = input.sortOrder;
  }
  if (!Object.keys(updates).length) return json({ success: true, data: existing });
  const rows = await sql<Record<string, unknown>[]>`
    update areas set name = coalesce(${updates.name ?? null}, name),
      color = case when ${Object.hasOwn(updates, 'color')} then ${updates.color ?? null} else color end,
      sort_order = coalesce(${updates.sortOrder ?? null}, sort_order), updated_at = now()
    where id = ${match[1]} and user_id = ${userId}
    returning id, user_id as "userId", name, color, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
  `;
  return json({ success: true, data: rows[0] });
}

async function routeNotes(path: string, request: Request, userId: string) {
  if (path === '/notes' && request.method === 'GET') {
    const rows = await sql<Record<string, unknown>[]>`
      select id, user_id as "userId", task_id as "taskId", title, content, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from notes where user_id = ${userId} and deleted_at is null order by updated_at desc
    `;
    return json({ success: true, data: rows });
  }
  if (path === '/notes/search' && request.method === 'GET') {
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (!q) return json({ success: true, data: [] });
    const term = `%${q}%`;
    const rows = await sql<Record<string, unknown>[]>`
      select id, user_id as "userId", task_id as "taskId", title, content, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from notes where user_id = ${userId} and deleted_at is null and (title ilike ${term} or content ilike ${term}) order by updated_at desc
    `;
    return json({ success: true, data: rows });
  }
  if (path === '/notes' && request.method === 'POST') {
    const input = await bodyOf(request);
    const title = optionalText(input.title, 500);
    const content = optionalText(input.content, 1_000_000);
    if (title === null || content === null || !await taskOwned(input.taskId ?? null, userId)) return invalid('Invalid body');
    const taskId = input.taskId === undefined || input.taskId === null ? null : input.taskId;
    const rows = await sql<Record<string, unknown>[]>`
      insert into notes (id, user_id, task_id, title, content, created_at, updated_at)
      values (${crypto.randomUUID()}, ${userId}, ${taskId}, ${title ?? null}, ${content ?? null}, now(), now())
      returning id, user_id as "userId", task_id as "taskId", title, content, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }
  const match = path.match(/^\/notes\/([^/]+)$/);
  if (!match || !['GET', 'PATCH', 'DELETE'].includes(request.method)) return null;
  const existing = await noteForUser(match[1], userId);
  if (!existing) return json({ success: false, error: 'Not found' }, { status: 404 });
  if (request.method === 'GET') return json({ success: true, data: existing });
  if (request.method === 'DELETE') {
    await sql`update notes set deleted_at = now(), updated_at = now() where id = ${match[1]} and user_id = ${userId}`;
    return json({ success: true });
  }
  const input = await bodyOf(request);
  const title = optionalText(input.title, 500);
  const content = optionalText(input.content, 1_000_000);
  if (title === null && input.title !== null || content === null && input.content !== null) return invalid('Invalid body');
  if (input.taskId !== undefined && !await taskOwned(input.taskId, userId)) return invalid('Invalid taskId');
  const parts = [];
  if (input.title !== undefined) parts.push(sql`title = ${title}`);
  if (input.content !== undefined) parts.push(sql`content = ${content}`);
  if (input.taskId !== undefined) parts.push(sql`task_id = ${input.taskId}`);
  if (parts.length) await sql`update notes set ${joinSql(parts)}, updated_at = now() where id = ${match[1]} and user_id = ${userId}`;
  return json({ success: true, data: await noteForUser(match[1], userId) });
}

function joinSql(parts: any[]) {
  let joined = parts[0];
  for (let index = 1; index < parts.length; index += 1) joined = sql`${joined}, ${parts[index]}`;
  return joined;
}

async function routeSettings(path: string, request: Request, userId: string) {
  if (path !== '/settings' || !['GET', 'PATCH'].includes(request.method)) return null;
  if (request.method === 'GET') {
    const rows = await sql<Record<string, unknown>[]>`
      select pomodoro_work_minutes as "pomodoroWorkMinutes", pomodoro_break_minutes as "pomodoroBreakMinutes",
             work_hours_per_day as "workHoursPerDay", time_zone as "timeZone" from users where id = ${userId} limit 1
    `;
    return rows[0] ? json({ success: true, data: rows[0] }) : json({ success: false, error: 'User not found' }, { status: 404 });
  }
  const input = await bodyOf(request);
  const work = input.pomodoroWorkMinutes === undefined ? undefined : Math.max(1, Math.min(120, Math.round(Number(input.pomodoroWorkMinutes))));
  const breakMinutes = input.pomodoroBreakMinutes === undefined ? undefined : Math.max(1, Math.min(60, Math.round(Number(input.pomodoroBreakMinutes))));
  const hours = input.workHoursPerDay === undefined ? undefined : Math.max(1, Math.min(24, Math.round(Number(input.workHoursPerDay))));
  if (work !== undefined && !Number.isFinite(work) || breakMinutes !== undefined && !Number.isFinite(breakMinutes) || hours !== undefined && !Number.isFinite(hours)) return invalid('Invalid settings');
  if (input.timeZone !== undefined && !validTimeZone(input.timeZone)) return invalid('Invalid time zone');
  const parts = [];
  if (work !== undefined) parts.push(sql`pomodoro_work_minutes = ${work}`);
  if (breakMinutes !== undefined) parts.push(sql`pomodoro_break_minutes = ${breakMinutes}`);
  if (hours !== undefined) parts.push(sql`work_hours_per_day = ${hours}`);
  if (input.timeZone !== undefined) parts.push(sql`time_zone = ${input.timeZone}`);
  if (parts.length) await sql`update users set ${joinSql(parts)}, updated_at = now() where id = ${userId}`;
  const rows = await sql<Record<string, unknown>[]>`
    select pomodoro_work_minutes as "pomodoroWorkMinutes", pomodoro_break_minutes as "pomodoroBreakMinutes",
           work_hours_per_day as "workHoursPerDay", time_zone as "timeZone" from users where id = ${userId} limit 1
  `;
  return json({ success: true, data: rows[0] });
}

export async function handleSupportingRoutes(path: string, request: Request, auth: AuthContext) {
  return await routeAreas(path, request, auth.user.id)
    ?? await routeNotes(path, request, auth.user.id)
    ?? await routeSettings(path, request, auth.user.id);
}

export async function routeSupporting(path: string, request: Request): Promise<Response | null> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return handleSupportingRoutes(path, request, auth);
}
