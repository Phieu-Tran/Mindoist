import bcrypt from 'npm:bcryptjs@2.4.3';
import { sql } from './db.ts';
import { json } from './http.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const JWT_SECRET = Deno.env.get('JWT_SECRET') ?? 'mindoist-sf0-local-secret-change-me';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  email: string;
  name: string;
  timeZone: string | null;
  onboardingRequired: boolean;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
};

type TaskRow = Record<string, unknown> & {
  id: string;
  userId: string;
  title: string;
  deadlineDate: string | null;
  deadlineTime: string | null;
  deadlineTimeZone: string | null;
  taskTags?: { tagId: string }[];
};

export type AuthContext = { user: UserRow; authType: 'jwt' | 'apiKey'; scopes?: string[] };

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function base64UrlJson(value: unknown) {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(value)));
}

async function signHmac(value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)));
}

export async function signAccessToken(user: Pick<UserRow, 'id' | 'email'>) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({ sub: user.id, email: user.email, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS });
  const input = `${header}.${payload}`;
  return `${input}.${bytesToBase64Url(await signHmac(input))}`;
}

async function verifyAccessToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = await signHmac(`${parts[0]}.${parts[1]}`);
  const actual = base64UrlToBytes(parts[2]);
  if (expected.length !== actual.length || !expected.every((byte, index) => byte === actual[index])) return null;
  try {
    const payload = JSON.parse(textDecoder.decode(base64UrlToBytes(parts[1]))) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null;
}

function mapUser(user: UserRow) {
  return { ...user, createdAt: iso(user.createdAt) };
}

export function mapTask(task: TaskRow) {
  const { deadlineDate, deadlineTime, deadlineTimeZone, taskTags, ...rest } = task;
  const deadline = deadlineDate
    ? {
        date: dateOnly(deadlineDate),
        ...(deadlineTime ? { time: deadlineTime } : {}),
        ...(deadlineTime && deadlineTimeZone ? { timeZone: deadlineTimeZone } : {}),
      }
    : null;
  return { ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, iso(value)])), deadline, estimateMin: rest.estimateMin ?? null, tagIds: taskTags?.map(tag => tag.tagId) ?? [] };
}

async function getUser(id: string) {
  const rows = await sql<UserRow[]>`
    select id, email, name, time_zone as "timeZone", onboarding_required as "onboardingRequired",
           role, status, created_at as "createdAt"
    from users where id = ${id} limit 1
  `;
  return rows[0] ?? null;
}

export async function requireAuth(request: Request, requiredScope?: string): Promise<AuthContext | Response> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return json({ success: false, error: 'Missing token' }, { status: 401 });
  const token = header.slice(7);
  const jwt = await verifyAccessToken(token);
  if (jwt) {
    const user = await getUser(jwt.sub);
    if (!user) return json({ success: false, error: 'Invalid token' }, { status: 401 });
    if (user.status === 'SUSPENDED') return json({ success: false, error: 'Account suspended' }, { status: 403 });
    return { user, authType: 'jwt' };
  }

  const hash = await hashToken(token);
  const keys = await sql<{ userId: string; scopes: string[] }[]>`
    select user_id as "userId", scopes from api_keys where hash = ${hash} and revoked_at is null limit 1
  `;
  const key = keys[0];
  if (!key) return json({ success: false, error: 'Invalid token' }, { status: 401 });
  if (requiredScope && !key.scopes.includes(requiredScope)) {
    return json({ success: false, error: `Missing API key scope: ${requiredScope}` }, { status: 403 });
  }
  const user = await getUser(key.userId);
  if (!user) return json({ success: false, error: 'Invalid token' }, { status: 401 });
  if (user.status === 'SUSPENDED') return json({ success: false, error: 'Account suspended' }, { status: 403 });
  void sql`update api_keys set last_used_at = now() where hash = ${hash}`;
  return { user, authType: 'apiKey', scopes: key.scopes };
}

export async function register(input: { email?: unknown; password?: unknown; name?: unknown }) {
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || typeof input.name !== 'string' || input.password.length < 6 || !input.name.trim()) {
    return { status: 400, body: { success: false, error: 'Invalid registration data' } };
  }
  const email = normalizeEmail(input.email);
  const password = await bcrypt.hash(input.password, 10);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    const countRows = await sql<{ count: number }[]>`select count(*)::int as count from users`;
    const role = Number(countRows[0]?.count ?? 0) === 0 ? 'ADMIN' : 'USER';
    const rows = await sql<UserRow[]>`
      insert into users (id, email, password, name, created_at, updated_at, role, status)
      values (${id}, ${email}, ${password}, ${input.name.trim()}, ${now}, ${now}, ${role}::"UserRole", 'ACTIVE'::"UserStatus")
      returning id, email, name, time_zone as "timeZone", onboarding_required as "onboardingRequired", role, status, created_at as "createdAt"
    `;
    const user = rows[0];
    return { status: 201, body: { success: true, data: { accessToken: await signAccessToken(user), refreshToken: await issueRefreshToken(user.id), user: mapUser(user) } } };
  } catch {
    return { status: 409, body: { success: false, error: 'Email already exists' } };
  }
}

export async function login(input: { email?: unknown; password?: unknown }) {
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.password) {
    return { status: 400, body: { success: false, error: 'Invalid credentials' } };
  }
  const rows = await sql<(UserRow & { password: string })[]>`
    select id, email, password, name, time_zone as "timeZone", onboarding_required as "onboardingRequired",
           role, status, created_at as "createdAt"
    from users where email = ${normalizeEmail(input.email)} limit 1
  `;
  const user = rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password))) return { status: 401, body: { success: false, error: 'Invalid credentials' } };
  if (user.status === 'SUSPENDED') return { status: 403, body: { success: false, error: 'Account suspended' } };
  return { status: 200, body: { success: true, data: { accessToken: await signAccessToken(user), refreshToken: await issueRefreshToken(user.id), user: mapUser(user) } } };
}

async function issueRefreshToken(userId: string) {
  const token = randomToken();
  await sql`
    insert into refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    values (${crypto.randomUUID()}, ${userId}, ${await hashToken(token)}, ${new Date(Date.now() + REFRESH_TOKEN_TTL_MS)}, now())
  `;
  return token;
}

export async function refresh(token: unknown) {
  if (typeof token !== 'string' || !token) return { status: 400, body: { success: false, error: 'Missing refresh token' } };
  const tokenHash = await hashToken(token);
  const rows = await sql<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null }[]>`
    select id, user_id as "userId", expires_at as "expiresAt", revoked_at as "revokedAt"
    from refresh_tokens where token_hash = ${tokenHash} limit 1
  `;
  const record = rows[0];
  if (!record || record.revokedAt || record.expiresAt <= new Date()) return { status: 401, body: { success: false, error: 'Invalid refresh token' } };
  await sql`update refresh_tokens set revoked_at = now(), rotated_at = now() where id = ${record.id} and revoked_at is null`;
  const user = await getUser(record.userId);
  if (!user || user.status === 'SUSPENDED') return { status: 401, body: { success: false, error: 'Invalid refresh token' } };
  return { status: 200, body: { success: true, data: { accessToken: await signAccessToken(user), refreshToken: await issueRefreshToken(user.id), user: mapUser(user) } } };
}

function dateOrNull(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listTasks(userId: string) {
  const rows = await sql<TaskRow[]>`
    select id, user_id as "userId", project_id as "projectId", project_column_id as "projectColumnId",
           section_id as "sectionId", parent_id as "parentId", title, description, color, priority,
           due_date as "dueDate", due_time as "dueTime", deadline_date as "deadlineDate",
           deadline_time as "deadlineTime", deadline_time_zone as "deadlineTimeZone", start_date as "startDate",
           duration_min as "durationMin", estimate_min as "estimateMin", rrule,
           recurring_reset_mode as "recurringResetMode", recurrence_basis as "recurrenceBasis",
           import_source as "importSource", external_id as "externalId", pomodoro_count as "pomodoroCount",
           due_notification_sent_at as "dueNotificationSentAt", completed_at as "completedAt",
           sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt",
           snoozed_until as "snoozedUntil", field_versions as "fieldVersions"
    from tasks where user_id = ${userId} and deleted_at is null order by sort_order asc, created_at desc
  `;
  if (!rows.length) return [];
  const tags = await sql<{ taskId: string; tagId: string }[]>`
    select task_id as "taskId", tag_id as "tagId" from task_tags where task_id in ${sql(rows.map(row => row.id))}
  `;
  const tagsByTask = new Map<string, { tagId: string }[]>();
  for (const tag of tags) tagsByTask.set(tag.taskId, [...(tagsByTask.get(tag.taskId) ?? []), { tagId: tag.tagId }]);
  return rows.map(row => mapTask({ ...row, taskTags: tagsByTask.get(row.id) ?? [] }));
}

export async function getTaskCounts(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const next7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = await sql<{ inbox: number; today: number; next7: number; overdue: number; completed: number; trashed: number }[]>`
    select
      count(*) filter (where deleted_at is null and parent_id is null and completed_at is null and deadline_date is null)::int as inbox,
      count(*) filter (where deleted_at is null and parent_id is null and completed_at is null and deadline_date = ${today}::date)::int as today,
      count(*) filter (where deleted_at is null and parent_id is null and completed_at is null and deadline_date > ${today}::date and deadline_date <= ${next7}::date)::int as "next7",
      count(*) filter (where deleted_at is null and parent_id is null and completed_at is null and deadline_date < ${today}::date)::int as overdue,
      count(*) filter (where deleted_at is null and parent_id is null and completed_at is not null)::int as completed,
      count(*) filter (where deleted_at is not null and parent_id is null)::int as trashed
    from tasks where user_id = ${userId}
  `;
  return rows[0] ?? { inbox: 0, today: 0, next7: 0, overdue: 0, completed: 0, trashed: 0 };
}

export async function createTask(userId: string, input: Record<string, unknown>) {
  if (typeof input.title !== 'string' || !input.title.trim()) return { status: 400, body: { success: false, error: 'Title is required' } };
  const id = crypto.randomUUID();
  const now = new Date();
  const deadline = input.deadline && typeof input.deadline === 'object' ? input.deadline as { date?: unknown; time?: unknown; timeZone?: unknown } : null;
  const deadlineDate = deadline?.date ? String(deadline.date) : null;
  const deadlineTime = deadline?.time ? String(deadline.time) : null;
  const deadlineTimeZone = deadline?.timeZone ? String(deadline.timeZone) : null;
  const startDate = dateOrNull(input.startDate);
  const estimateMin = typeof input.estimateMin === 'number' && Number.isInteger(input.estimateMin) && input.estimateMin > 0 ? input.estimateMin : null;
  const priority = typeof input.priority === 'number' && Number.isInteger(input.priority) && input.priority >= 1 && input.priority <= 4 ? input.priority : null;
  const color = input.color === null ? null : typeof input.color === 'string' ? input.color : null;
  const projectId = input.projectId === undefined || input.projectId === null ? null : input.projectId;
  const projectColumnId = input.projectColumnId === undefined || input.projectColumnId === null ? null : input.projectColumnId;
  const sectionId = input.sectionId === undefined || input.sectionId === null ? null : input.sectionId;
  const parentId = input.parentId === undefined || input.parentId === null ? null : input.parentId;
  for (const [label, value] of [['projectId', projectId], ['projectColumnId', projectColumnId], ['sectionId', sectionId], ['parentId', parentId]] as const) {
    if (value !== null && typeof value !== 'string') return { status: 400, body: { success: false, error: `Invalid ${label}` } };
  }
  if (color !== null && !['slate', 'sky', 'indigo', 'violet', 'rose', 'amber', 'jade', 'lime'].includes(color)) return { status: 400, body: { success: false, error: 'Invalid color' } };
  if (projectId !== null) {
    const project = await sql<{ id: string }[]>`select id from projects where id = ${projectId} and user_id = ${userId} and deleted_at is null limit 1`;
    if (!project[0]) return { status: 400, body: { success: false, error: 'Invalid project' } };
  }
  if (projectColumnId !== null) {
    const column = await sql<{ projectId: string }[]>`select pc.project_id as "projectId" from project_columns pc join projects p on p.id = pc.project_id where pc.id = ${projectColumnId} and pc.deleted_at is null and p.user_id = ${userId} and p.deleted_at is null limit 1`;
    if (!column[0] || (projectId !== null && projectId !== column[0].projectId)) return { status: 400, body: { success: false, error: 'Invalid project column' } };
  }
  if (sectionId !== null) {
    const section = await sql<{ projectId: string }[]>`select s.project_id as "projectId" from sections s join projects p on p.id = s.project_id where s.id = ${sectionId} and s.deleted_at is null and p.user_id = ${userId} and p.deleted_at is null limit 1`;
    if (!section[0] || (projectId !== null && projectId !== section[0].projectId)) return { status: 400, body: { success: false, error: 'Invalid section' } };
  }
  if (parentId !== null) {
    const parent = await sql<{ id: string; parentId: string | null }[]>`select id, parent_id as "parentId" from tasks where id = ${parentId} and user_id = ${userId} and deleted_at is null limit 1`;
    if (!parent[0]) return { status: 400, body: { success: false, error: 'Parent task not found' } };
    if (parent[0].parentId) return { status: 400, body: { success: false, error: 'Cannot nest subtask under another subtask' } };
  }
  const rows = await sql<TaskRow[]>`
    insert into tasks (id, user_id, project_id, project_column_id, section_id, parent_id, title, description, color, priority,
                       deadline_date, deadline_time, deadline_time_zone, start_date, estimate_min, rrule,
                       recurring_reset_mode, recurrence_basis, created_at, updated_at)
    values (${id}, ${userId}, ${projectId}, ${projectColumnId}, ${sectionId}, ${parentId}, ${input.title.trim()},
            ${typeof input.description === 'string' ? input.description : null}, ${color}, ${priority}, ${deadlineDate},
            ${deadlineTime}, ${deadlineTimeZone}, ${startDate}, ${estimateMin}, ${typeof input.rrule === 'string' ? input.rrule : null},
            ${typeof input.recurringResetMode === 'string' ? input.recurringResetMode : null}::"RecurringResetMode",
            ${typeof input.recurrenceBasis === 'string' ? input.recurrenceBasis : null}::"RecurrenceBasis", ${now}, ${now})
    returning id, user_id as "userId", project_id as "projectId", project_column_id as "projectColumnId",
      section_id as "sectionId", parent_id as "parentId", title, description, color, priority,
      due_date as "dueDate", due_time as "dueTime", deadline_date as "deadlineDate", deadline_time as "deadlineTime",
      deadline_time_zone as "deadlineTimeZone", start_date as "startDate", duration_min as "durationMin",
      estimate_min as "estimateMin", rrule, recurring_reset_mode as "recurringResetMode",
      recurrence_basis as "recurrenceBasis", import_source as "importSource", external_id as "externalId",
      pomodoro_count as "pomodoroCount", due_notification_sent_at as "dueNotificationSentAt",
      completed_at as "completedAt", sort_order as "sortOrder", created_at as "createdAt",
      updated_at as "updatedAt", deleted_at as "deletedAt", snoozed_until as "snoozedUntil", field_versions as "fieldVersions"
  `;
  return { status: 201, body: { success: true, data: mapTask(rows[0]) } };
}

export async function createReminder(userId: string, taskId: string, input: Record<string, unknown>) {
  const task = await sql<{ id: string }[]>`select id from tasks where id = ${taskId} and user_id = ${userId} and deleted_at is null limit 1`;
  if (!task[0]) return { status: 404, body: { success: false, error: 'Task not found' } };
  const remindAt = dateOrNull(input.remindAt);
  if (!remindAt || remindAt.getTime() <= Date.now()) return { status: 400, body: { success: false, error: 'remindAt must be in the future' } };
  const type = input.type === 'email' ? 'email' : 'push';
  const rows = await sql<Record<string, unknown>[]>`
    insert into reminders (id, task_id, remind_at, type, is_sent, created_at, updated_at)
    values (${crypto.randomUUID()}, ${taskId}, ${remindAt}, ${type}::"ReminderType", false, now(), now())
    returning id, task_id as "taskId", remind_at as "remindAt", type, is_sent as "isSent", created_at as "createdAt", updated_at as "updatedAt"
  `;
  return { status: 201, body: { success: true, data: Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, iso(value)])) } };
}

export async function claimDueReminders(limit = 50) {
  return await sql.begin(async tx => {
    const rows = await tx<Record<string, unknown>[]>`
      with candidates as (
        select r.id from reminders r join tasks t on t.id = r.task_id
        where r.is_sent = false and r.remind_at <= now() and t.deleted_at is null
        order by r.remind_at asc for update skip locked limit ${limit}
      )
      update reminders r set is_sent = true, updated_at = now()
      from candidates c where r.id = c.id
      returning r.id, r.task_id as "taskId", r.remind_at as "remindAt", r.type
    `;
    return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, iso(value)])));
  });
}
