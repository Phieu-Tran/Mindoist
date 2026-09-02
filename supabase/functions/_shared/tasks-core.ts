import { sql } from './db.ts';
import { json } from './http.ts';
import { mapTask, requireAuth, type AuthContext } from './sf0.ts';

const TASK_COLORS = new Set(['slate', 'sky', 'indigo', 'violet', 'rose', 'amber', 'jade', 'lime']);

function joinSql(parts: any[]) {
  let joined = parts[0];
  for (let index = 1; index < parts.length; index += 1) joined = sql`${joined}, ${parts[index]}`;
  return joined;
}

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

const taskSelect = sql`id, user_id as "userId", project_id as "projectId", project_column_id as "projectColumnId",
  section_id as "sectionId", parent_id as "parentId", title, description, color, priority,
  due_date as "dueDate", due_time as "dueTime", deadline_date as "deadlineDate", deadline_time as "deadlineTime",
  deadline_time_zone as "deadlineTimeZone", start_date as "startDate", duration_min as "durationMin",
  estimate_min as "estimateMin", rrule, recurring_reset_mode as "recurringResetMode", recurrence_basis as "recurrenceBasis",
  import_source as "importSource", external_id as "externalId", pomodoro_count as "pomodoroCount",
  due_notification_sent_at as "dueNotificationSentAt", completed_at as "completedAt", sort_order as "sortOrder",
  created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt", snoozed_until as "snoozedUntil",
  field_versions as "fieldVersions"`;

async function taskRow(id: string, userId: string, includeDeleted = false) {
  const rows = await sql<Record<string, unknown>[]>`
    select ${taskSelect} from tasks
    where id = ${id} and user_id = ${userId} ${includeDeleted ? sql`` : sql`and deleted_at is null`} limit 1
  `;
  return rows[0] ?? null;
}

async function taskResponse(row: Record<string, unknown> | null) {
  if (!row) return null;
  const tags = await sql<{ tagId: string }[]>`select tag_id as "tagId" from task_tags where task_id = ${row.id}`;
  return mapTask({ ...row, taskTags: tags });
}

function parseDate(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new Error(`Invalid ${field}`);
  return new Date(value);
}

function parseDeadline(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return { date: null, time: null, timeZone: null };
  if (!value || typeof value !== 'object') throw new Error('Invalid deadline');
  const input = value as Record<string, unknown>;
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Invalid deadline');
  const time = input.time === undefined ? null : input.time;
  const timeZone = input.timeZone === undefined ? null : input.timeZone;
  if (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Invalid deadline');
  if (time !== null && (typeof timeZone !== 'string' || !timeZone.trim())) throw new Error('A time zone is required for a timed deadline');
  if (timeZone !== null && typeof timeZone !== 'string') throw new Error('Invalid deadline');
  return { date: input.date, time, timeZone };
}

async function projectColumn(id: unknown, userId: string) {
  if (typeof id !== 'string') return null;
  const rows = await sql<{ id: string; projectId: string }[]>`
    select pc.id, pc.project_id as "projectId" from project_columns pc join projects p on p.id = pc.project_id
    where pc.id = ${id} and pc.deleted_at is null and p.user_id = ${userId} and p.deleted_at is null limit 1
  `;
  return rows[0] ?? null;
}

async function updateTask(id: string, userId: string, input: Record<string, unknown>) {
  const existing = await taskRow(id, userId);
  if (!existing) return json({ success: false, error: 'Task not found' }, { status: 404 });

  const assignments = [];
  try {
    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) return invalid('Title is required');
      assignments.push(sql`title = ${input.title.trim()}`);
    }
    if (input.description !== undefined) {
      if (input.description !== null && typeof input.description !== 'string') return invalid('Invalid description');
      assignments.push(sql`description = ${input.description}`);
    }
    if (input.color !== undefined) {
      if (input.color !== null && (typeof input.color !== 'string' || !TASK_COLORS.has(input.color))) return invalid('Invalid color');
      assignments.push(sql`color = ${input.color}`);
    }
    for (const [key, column] of [['priority', 'priority'], ['sortOrder', 'sort_order']] as const) {
      if (input[key] !== undefined) {
        if (input[key] !== null && (typeof input[key] !== 'number' || !Number.isFinite(input[key]))) return invalid(`Invalid ${key}`);
        assignments.push(sql`${sql(column)} = ${input[key]}`);
      }
    }
    for (const [key, column] of [['projectId', 'project_id'], ['sectionId', 'section_id'], ['parentId', 'parent_id']] as const) {
      if (input[key] !== undefined) {
        if (input[key] !== null && typeof input[key] !== 'string') return invalid(`Invalid ${key}`);
        assignments.push(sql`${sql(column)} = ${input[key]}`);
      }
    }
    if (input.projectId !== undefined && input.projectId !== null) {
      const project = await sql<{ id: string }[]>`select id from projects where id = ${input.projectId} and user_id = ${userId} and deleted_at is null limit 1`;
      if (!project[0]) return invalid('Invalid project');
    }
    if (input.projectColumnId !== undefined) {
      if (input.projectColumnId !== null) {
        const column = await projectColumn(input.projectColumnId, userId);
        if (!column) return invalid('Invalid project column');
        if (input.projectId !== undefined && input.projectId !== null && input.projectId !== column.projectId) return invalid('Invalid project column');
        assignments.push(sql`project_column_id = ${column.id}`);
        assignments.push(sql`project_id = ${column.projectId}`);
      } else {
        assignments.push(sql`project_column_id = null`);
      }
    }
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) return invalid('A task cannot be its own parent');
      const parent = await taskRow(input.parentId as string, userId);
      if (!parent) return invalid('Parent task not found');
      if (parent.parentId) return invalid('Cannot nest subtask under another subtask');
    }
    const deadline = parseDeadline(input.deadline);
    if (deadline !== undefined) {
      assignments.push(sql`deadline_date = ${deadline.date}`);
      assignments.push(sql`deadline_time = ${deadline.time}`);
      assignments.push(sql`deadline_time_zone = ${deadline.timeZone}`);
      assignments.push(sql`due_notification_sent_at = null`);
    }
    if (input.startDate !== undefined) assignments.push(sql`start_date = ${parseDate(input.startDate, 'startDate')}`);
    if (input.snoozedUntil !== undefined) assignments.push(sql`snoozed_until = ${parseDate(input.snoozedUntil, 'snoozedUntil')}`);
    if (input.estimateMin !== undefined) {
      if (input.estimateMin !== null && (typeof input.estimateMin !== 'number' || !Number.isInteger(input.estimateMin) || input.estimateMin <= 0)) return invalid('Invalid estimateMin');
      assignments.push(sql`estimate_min = ${input.estimateMin}`);
    }
    for (const [key, column] of [['rrule', 'rrule'], ['recurringResetMode', 'recurring_reset_mode'], ['recurrenceBasis', 'recurrence_basis']] as const) {
      if (input[key] !== undefined) {
        if (input[key] !== null && typeof input[key] !== 'string') return invalid(`Invalid ${key}`);
        assignments.push(sql`${sql(column)} = ${input[key]}`);
      }
    }
    if (input.tagIds !== undefined) {
      if (!Array.isArray(input.tagIds) || input.tagIds.some(tag => typeof tag !== 'string')) return invalid('Invalid tagIds');
      const tagIds = input.tagIds as string[];
      if (tagIds.length) {
        const owned = await sql<{ count: number }[]>`select count(*)::int as count from tags where id in ${sql(tagIds)} and user_id = ${userId} and deleted_at is null`;
        if ((owned[0]?.count ?? 0) !== new Set(tagIds).size) return invalid('One or more tags not found');
      }
      await sql.begin(async tx => {
        await tx`delete from task_tags where task_id = ${id}`;
        for (const tagId of tagIds) await tx`insert into task_tags (task_id, tag_id, created_at, updated_at) values (${id}, ${tagId}, now(), now())`;
      });
    }
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'Invalid task data');
  }

  if (assignments.length) {
    await sql`update tasks set ${joinSql(assignments)}, updated_at = now() where id = ${id} and user_id = ${userId} and deleted_at is null`;
  }
  return json({ success: true, data: await taskResponse(await taskRow(id, userId)) });
}

export async function handleTaskCoreRoutes(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  const userId = auth.user.id;
  const match = path.match(/^\/tasks\/([^/]+)$/);
  if (match && request.method === 'GET') {
    const task = await taskRow(match[1], userId);
    return task ? json({ success: true, data: await taskResponse(task) }) : json({ success: false, error: 'Task not found' }, { status: 404 });
  }
  if (match && request.method === 'PATCH') return updateTask(match[1], userId, await bodyOf(request));
  if (match && request.method === 'DELETE') {
    const task = await taskRow(match[1], userId);
    if (!task) return json({ success: false, error: 'Task not found' }, { status: 404 });
    await sql`update tasks set deleted_at = now(), updated_at = now() where id = ${match[1]} and user_id = ${userId}`;
    return json({ success: true });
  }

  const action = path.match(/^\/tasks\/([^/]+)\/(complete|reopen|restore|pomodoro\/complete|move)$/);
  if (action && request.method === 'POST' && ['complete', 'reopen', 'restore', 'pomodoro/complete'].includes(action[2])) {
    const includeDeleted = action[2] === 'restore';
    const task = await taskRow(action[1], userId, includeDeleted);
    if (!task) return json({ success: false, error: 'Task not found' }, { status: 404 });
    const column = action[2] === 'complete' ? sql`completed_at = now()`
      : action[2] === 'reopen' || action[2] === 'restore' ? sql`completed_at = null, deleted_at = null`
      : sql`pomodoro_count = pomodoro_count + 1`;
    await sql`update tasks set ${column}, updated_at = now() where id = ${action[1]} and user_id = ${userId}`;
    const updated = await taskRow(action[1], userId);
    const data = await taskResponse(updated);
    return json({ success: true, data: action[2] === 'complete' ? { ...data, nextTask: null } : data });
  }
  if (action && action[2] === 'move' && request.method === 'PATCH') {
    const task = await taskRow(action[1], userId);
    if (!task) return json({ success: false, error: 'Task not found' }, { status: 404 });
    const input = await bodyOf(request);
    const columnId = input.columnId || input.projectColumnId;
    const column = await projectColumn(columnId, userId);
    if (!column) return invalid('Invalid project column');
    if (task.projectId && task.projectId !== column.projectId) return invalid('Cannot move a task into a column from a different project');
    const order = input.order ?? input.sortOrder ?? task.sortOrder ?? 0;
    if (typeof order !== 'number' || !Number.isFinite(order)) return invalid('Invalid sortOrder');
    await sql`update tasks set project_id = ${column.projectId}, project_column_id = ${column.id}, sort_order = ${order}, updated_at = now() where id = ${action[1]} and user_id = ${userId}`;
    return json({ success: true, data: await taskResponse(await taskRow(action[1], userId)) });
  }
  if (path.match(/^\/tasks\/[^/]+\/subtasks$/) && request.method === 'GET') {
    const parentId = path.match(/^\/tasks\/([^/]+)\/subtasks$/)![1];
    if (!await taskRow(parentId, userId)) return json({ success: false, error: 'Task not found' }, { status: 404 });
    const rows = await sql<Record<string, unknown>[]>`select ${taskSelect} from tasks where parent_id = ${parentId} and user_id = ${userId} and deleted_at is null order by sort_order asc`;
    return json({ success: true, data: await Promise.all(rows.map(taskResponse)) });
  }

  const checklistPath = path.match(/^\/tasks\/([^/]+)\/checklist-items$/);
  if (checklistPath && ['GET', 'POST'].includes(request.method)) {
    if (!await taskRow(checklistPath[1], userId)) return json({ success: false, error: 'Task not found' }, { status: 404 });
    if (request.method === 'GET') {
      const rows = await sql<Record<string, unknown>[]>`
        select id, task_id as "taskId", title, completed_at as "completedAt", sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
        from task_checklist_items where task_id = ${checklistPath[1]} order by sort_order asc
      `;
      return json({ success: true, data: rows });
    }
    const input = await bodyOf(request);
    if (typeof input.title !== 'string' || !input.title.trim()) return invalid('Title is required');
    const sortOrder = input.sortOrder === undefined ? 0 : input.sortOrder;
    if (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder)) return invalid('Invalid sortOrder');
    const rows = await sql<Record<string, unknown>[]>`
      insert into task_checklist_items (id, task_id, title, sort_order, created_at, updated_at)
      values (${crypto.randomUUID()}, ${checklistPath[1]}, ${input.title.trim()}, ${sortOrder}, now(), now())
      returning id, task_id as "taskId", title, completed_at as "completedAt", sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }

  const checklistItem = path.match(/^\/checklist-items\/([^/]+)$/);
  if (checklistItem && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const owned = await sql<{ id: string }[]>`
      select i.id from task_checklist_items i join tasks t on t.id = i.task_id
      where i.id = ${checklistItem[1]} and t.user_id = ${userId} limit 1
    `;
    if (!owned[0]) return json({ success: false, error: 'Checklist item not found' }, { status: 404 });
    if (request.method === 'DELETE') {
      await sql`delete from task_checklist_items where id = ${checklistItem[1]}`;
      return json({ success: true });
    }
    const input = await bodyOf(request);
    const title = input.title === undefined ? undefined : input.title;
    const completedAt = input.completedAt === undefined ? undefined : parseDate(input.completedAt, 'completedAt');
    const sortOrder = input.sortOrder === undefined ? undefined : input.sortOrder;
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) return invalid('Title is required');
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder))) return invalid('Invalid sortOrder');
    const parts = [];
    if (title !== undefined) parts.push(sql`title = ${title.trim()}`);
    if (completedAt !== undefined) parts.push(sql`completed_at = ${completedAt}`);
    if (sortOrder !== undefined) parts.push(sql`sort_order = ${sortOrder}`);
    if (parts.length) {
      await sql`update task_checklist_items set ${joinSql(parts)}, updated_at = now() where id = ${checklistItem[1]}`;
    }
    const rows = await sql<Record<string, unknown>[]>`
      select id, task_id as "taskId", title, completed_at as "completedAt", sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt"
      from task_checklist_items where id = ${checklistItem[1]}
    `;
    return json({ success: true, data: rows[0] });
  }

  const reminderList = path.match(/^\/tasks\/([^/]+)\/reminders$/);
  if (reminderList && request.method === 'GET') {
    if (!await taskRow(reminderList[1], userId)) return json({ success: false, error: 'Task not found' }, { status: 404 });
    const rows = await sql<Record<string, unknown>[]>`
      select id, task_id as "taskId", remind_at as "remindAt", type, is_sent as "isSent", created_at as "createdAt", updated_at as "updatedAt"
      from reminders where task_id = ${reminderList[1]} order by remind_at asc
    `;
    return json({ success: true, data: rows });
  }

  const reminder = path.match(/^\/reminders\/([^/]+)$/);
  if (reminder && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const owned = await sql<{ id: string }[]>`
      select r.id from reminders r join tasks t on t.id = r.task_id where r.id = ${reminder[1]} and t.user_id = ${userId} limit 1
    `;
    if (!owned[0]) return json({ success: false, error: 'Reminder not found' }, { status: 404 });
    if (request.method === 'DELETE') {
      await sql`delete from reminders where id = ${reminder[1]}`;
      return json({ success: true });
    }
    const input = await bodyOf(request);
    let remindAt: Date | undefined;
    if (input.remindAt !== undefined) {
      try { remindAt = parseDate(input.remindAt, 'remindAt') ?? undefined; } catch (error) { return invalid(error instanceof Error ? error.message : 'Invalid remindAt date'); }
      if (!remindAt || remindAt.getTime() <= Date.now()) return invalid('remindAt must be in the future');
    }
    if (input.isSent !== undefined && typeof input.isSent !== 'boolean') return invalid('Invalid isSent');
    const parts = [];
    if (remindAt) parts.push(sql`remind_at = ${remindAt}`, sql`is_sent = false`);
    if (input.isSent !== undefined) parts.push(sql`is_sent = ${input.isSent}`);
    if (parts.length) await sql`update reminders set ${joinSql(parts)}, updated_at = now() where id = ${reminder[1]}`;
    const rows = await sql<Record<string, unknown>[]>`
      select id, task_id as "taskId", remind_at as "remindAt", type, is_sent as "isSent", created_at as "createdAt", updated_at as "updatedAt"
      from reminders where id = ${reminder[1]}
    `;
    return json({ success: true, data: rows[0] });
  }

  const snooze = path.match(/^\/reminders\/([^/]+)\/snooze$/);
  if (snooze && request.method === 'POST') {
    const owned = await sql<{ id: string }[]>`select r.id from reminders r join tasks t on t.id = r.task_id where r.id = ${snooze[1]} and t.user_id = ${userId} limit 1`;
    if (!owned[0]) return json({ success: false, error: 'Reminder not found' }, { status: 404 });
    const input = await bodyOf(request);
    const minutes = input.minutes === undefined ? 10 : input.minutes;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return invalid('Invalid minutes');
    const rows = await sql<Record<string, unknown>[]>`
      update reminders set remind_at = ${new Date(Date.now() + minutes * 60_000)}, is_sent = false, updated_at = now() where id = ${snooze[1]}
      returning id, task_id as "taskId", remind_at as "remindAt", type, is_sent as "isSent", created_at as "createdAt", updated_at as "updatedAt"
    `;
    return json({ success: true, data: rows[0] });
  }
  return null;
}

export async function routeTaskCore(path: string, request: Request): Promise<Response | null> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return handleTaskCoreRoutes(path, request, auth);
}
