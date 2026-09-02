import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

type SyncItem = { table: string; version?: number; id: string; data: Record<string, unknown>; updatedAt: string };

function iso(value: unknown) {
  return value === null || value === undefined ? null : new Date(value as string | Date).toISOString();
}

function item(table: string, id: string, data: Record<string, unknown>, updatedAt: unknown, version = 2): SyncItem {
  return { table, id, data, updatedAt: iso(updatedAt)!, version };
}

function joinSql(parts: any[]) {
  let joined = parts[0];
  for (let index = 1; index < parts.length; index += 1) joined = sql`${joined}, ${parts[index]}`;
  return joined;
}

async function changes(userId: string, since: Date) {
  const items: SyncItem[] = [];
  const tasks = await sql<Record<string, unknown>[]>`
    select id, project_id as "projectId", project_column_id as "projectColumnId", section_id as "sectionId", parent_id as "parentId",
      title, description, color, priority, deadline_date as "deadlineDate", deadline_time as "deadlineTime", deadline_time_zone as "deadlineTimeZone",
      start_date as "startDate", estimate_min as "estimateMin", rrule, recurring_reset_mode as "recurringResetMode", recurrence_basis as "recurrenceBasis",
      completed_at as "completedAt", snoozed_until as "snoozedUntil", sort_order as "sortOrder", field_versions as "fieldVersions",
      created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from tasks where user_id = ${userId} and updated_at > ${since}
  `;
  for (const row of tasks) items.push(item('task', String(row.id), {
    title: row.title, description: row.description, color: row.color, projectId: row.projectId, projectColumnId: row.projectColumnId,
    sectionId: row.sectionId, parentId: row.parentId, priority: row.priority, deadlineDate: iso(row.deadlineDate), deadlineTime: row.deadlineTime,
    deadlineTimeZone: row.deadlineTimeZone, startDate: iso(row.startDate), estimateMin: row.estimateMin, rrule: row.rrule,
    recurringResetMode: row.recurringResetMode, recurrenceBasis: row.recurrenceBasis, completedAt: iso(row.completedAt), snoozedUntil: iso(row.snoozedUntil),
    sortOrder: row.sortOrder, fieldVersions: row.fieldVersions, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt),
  }, row.updatedAt, 2));

  const timeBlocks = await sql<Record<string, unknown>[]>`
    select id, task_id as "taskId", start_at as "startAt", end_at as "endAt", time_zone as "timeZone", all_day as "allDay", source,
      completed_at as "completedAt", actual_min as "actualMin", field_versions as "fieldVersions", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from time_blocks where user_id = ${userId} and updated_at > ${since}
  `;
  for (const row of timeBlocks) items.push(item('timeBlock', String(row.id), {
    taskId: row.taskId, startAt: iso(row.startAt), endAt: iso(row.endAt), timeZone: row.timeZone, allDay: row.allDay, source: row.source,
    completedAt: iso(row.completedAt), actualMin: row.actualMin, fieldVersions: row.fieldVersions, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt),
  }, row.updatedAt, 2));

  const projects = await sql<Record<string, unknown>[]>`
    select id, parent_id as "parentId", area_id as "areaId", name, color, type, is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled",
      sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from projects where user_id = ${userId} and updated_at > ${since}
  `;
  for (const row of projects) items.push(item('project', String(row.id), {
    parentId: row.parentId, areaId: row.areaId, name: row.name, color: row.color, type: row.type, isArchived: row.isArchived,
    calendarSyncEnabled: row.calendarSyncEnabled, sortOrder: row.sortOrder, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt),
  }, row.updatedAt));

  const tags = await sql<Record<string, unknown>[]>`select id, name, color, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt" from tags where user_id = ${userId} and updated_at > ${since}`;
  for (const row of tags) items.push(item('tag', String(row.id), { name: row.name, color: row.color, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));

  const sections = await sql<Record<string, unknown>[]>`
    select s.id, s.project_id as "projectId", s.name, s.sort_order as "sortOrder", s.created_at as "createdAt", s.updated_at as "updatedAt", s.deleted_at as "deletedAt"
    from sections s join projects p on p.id = s.project_id where p.user_id = ${userId} and s.updated_at > ${since}
  `;
  for (const row of sections) items.push(item('section', String(row.id), { projectId: row.projectId, name: row.name, sortOrder: row.sortOrder, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));

  const taskTags = await sql<Record<string, unknown>[]>`
    select tt.task_id as "taskId", tt.tag_id as "tagId", tt.created_at as "createdAt", tt.updated_at as "updatedAt", tt.deleted_at as "deletedAt"
    from task_tags tt join tasks t on t.id = tt.task_id where t.user_id = ${userId} and tt.updated_at > ${since}
  `;
  for (const row of taskTags) items.push(item('taskTag', `${row.taskId}:${row.tagId}`, { taskId: row.taskId, tagId: row.tagId, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));

  const notes = await sql<Record<string, unknown>[]>`
    select id, task_id as "taskId", title, content, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from notes where user_id = ${userId} and updated_at > ${since}
  `;
  for (const row of notes) items.push(item('note', String(row.id), { userId, taskId: row.taskId, title: row.title, content: row.content, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));

  const reminders = await sql<Record<string, unknown>[]>`
    select r.id, r.task_id as "taskId", r.remind_at as "remindAt", r.type, r.is_sent as "isSent", r.created_at as "createdAt", r.updated_at as "updatedAt"
    from reminders r join tasks t on t.id = r.task_id where t.user_id = ${userId} and r.updated_at > ${since}
  `;
  for (const row of reminders) items.push(item('reminder', String(row.id), { taskId: row.taskId, remindAt: iso(row.remindAt), type: row.type, isSent: row.isSent, createdAt: iso(row.createdAt) }, row.updatedAt));

  const columns = await sql<Record<string, unknown>[]>`
    select pc.id, pc.project_id as "projectId", pc.name, pc.color, pc.is_done as "isDone", pc.sort_order as "sortOrder", pc.created_at as "createdAt", pc.updated_at as "updatedAt", pc.deleted_at as "deletedAt"
    from project_columns pc join projects p on p.id = pc.project_id where p.user_id = ${userId} and pc.updated_at > ${since}
  `;
  for (const row of columns) items.push(item('projectColumn', String(row.id), { projectId: row.projectId, name: row.name, color: row.color, isDone: row.isDone, sortOrder: row.sortOrder, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));

  const checklist = await sql<Record<string, unknown>[]>`
    select i.id, i.task_id as "taskId", i.title, i.completed_at as "completedAt", i.sort_order as "sortOrder", i.created_at as "createdAt", i.updated_at as "updatedAt"
    from task_checklist_items i join tasks t on t.id = i.task_id where t.user_id = ${userId} and i.updated_at > ${since}
  `;
  for (const row of checklist) items.push(item('taskChecklistItem', String(row.id), { taskId: row.taskId, title: row.title, completedAt: iso(row.completedAt), sortOrder: row.sortOrder, createdAt: iso(row.createdAt) }, row.updatedAt));

  const areas = await sql<Record<string, unknown>[]>`select id, name, color, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt" from areas where user_id = ${userId} and updated_at > ${since}`;
  for (const row of areas) items.push(item('area', String(row.id), { name: row.name, color: row.color, sortOrder: row.sortOrder, createdAt: iso(row.createdAt) }, row.updatedAt));

  const countdowns = await sql<Record<string, unknown>[]>`
    select id, title, target_date as "targetDate", color, image_url as "imageUrl", reminder_days_before as "reminderDaysBefore", show_in_calendar as "showInCalendar", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from countdowns where user_id = ${userId} and updated_at > ${since}
  `;
  for (const row of countdowns) items.push(item('countdown', String(row.id), { userId, title: row.title, targetDate: iso(row.targetDate), color: row.color, imageUrl: row.imageUrl, reminderDaysBefore: row.reminderDaysBefore, showInCalendar: row.showInCalendar, createdAt: iso(row.createdAt), deletedAt: iso(row.deletedAt) }, row.updatedAt));
  return items;
}

async function push(userId: string, items: SyncItem[]) {
  const accepted: string[] = [];
  const conflicts: unknown[] = [];
  for (const entry of items) {
    const incoming = new Date(entry.updatedAt);
    if (Number.isNaN(incoming.getTime())) continue;
    const d = entry.data.patch && typeof entry.data.patch === 'object'
      ? Object.fromEntries(Object.entries(entry.data.patch as Record<string, { value?: unknown }>).map(([key, value]) => [key, value?.value]))
      : entry.data;
    try {
      if (entry.table === 'taskTag') {
        const [taskId, tagId] = entry.id.split(':');
        if (!taskId || !tagId) continue;
        const owned = await sql<{ ok: boolean }[]>`
          select exists(select 1 from tasks t join tags g on g.user_id = t.user_id where t.id = ${taskId} and g.id = ${tagId} and t.user_id = ${userId}) as ok
        `;
        if (!owned[0]?.ok) continue;
        const existing = await sql<{ updatedAt: Date }[]>`select updated_at as "updatedAt" from task_tags where task_id = ${taskId} and tag_id = ${tagId} limit 1`;
        if (existing[0] && incoming <= new Date(existing[0].updatedAt)) continue;
        if (d.deletedAt) await sql`update task_tags set deleted_at = ${new Date(String(d.deletedAt))}, updated_at = ${incoming} where task_id = ${taskId} and tag_id = ${tagId}`;
        else if (existing[0]) await sql`update task_tags set deleted_at = null, updated_at = ${incoming} where task_id = ${taskId} and tag_id = ${tagId}`;
        else await sql`insert into task_tags (task_id, tag_id, created_at, updated_at) values (${taskId}, ${tagId}, ${d.createdAt ? new Date(String(d.createdAt)) : new Date()}, ${incoming})`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'task') {
        const existing = await sql<Record<string, unknown>[]>`select id, updated_at as "updatedAt" from tasks where id = ${entry.id} and user_id = ${userId} limit 1`;
        if (existing[0] && incoming <= new Date(existing[0].updatedAt as string)) continue;
        const parts = [];
        const fields: Record<string, [string, unknown]> = {
          title: ['title', d.title], description: ['description', d.description ?? null], color: ['color', d.color ?? null],
          projectId: ['project_id', d.projectId ?? null], projectColumnId: ['project_column_id', d.projectColumnId ?? null], sectionId: ['section_id', d.sectionId ?? null], parentId: ['parent_id', d.parentId ?? null],
          priority: ['priority', d.priority ?? null], deadlineDate: ['deadline_date', d.deadlineDate ? new Date(String(d.deadlineDate)) : null], deadlineTime: ['deadline_time', d.deadlineTime ?? null], deadlineTimeZone: ['deadline_time_zone', d.deadlineTimeZone ?? null],
          startDate: ['start_date', d.startDate ? new Date(String(d.startDate)) : null], estimateMin: ['estimate_min', d.estimateMin ?? null], rrule: ['rrule', d.rrule ?? null], completedAt: ['completed_at', d.completedAt ? new Date(String(d.completedAt)) : null], snoozedUntil: ['snoozed_until', d.snoozedUntil ? new Date(String(d.snoozedUntil)) : null], sortOrder: ['sort_order', d.sortOrder ?? 0], deletedAt: ['deleted_at', d.deletedAt ? new Date(String(d.deletedAt)) : null],
        };
        for (const [field, [column, value]] of Object.entries(fields)) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${value}`);
        if (existing[0]) {
          if (parts.length) await sql`update tasks set ${joinSql(parts)}, updated_at = ${incoming} where id = ${entry.id} and user_id = ${userId}`;
        } else if (typeof d.title === 'string' && d.title.trim()) {
          await sql`insert into tasks (id, user_id, title, created_at, updated_at) values (${entry.id}, ${userId}, ${d.title.trim()}, ${d.createdAt ? new Date(String(d.createdAt)) : new Date()}, ${incoming})`;
          if (parts.length) await sql`update tasks set ${joinSql(parts)} where id = ${entry.id}`;
        } else continue;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'project' || entry.table === 'tag' || entry.table === 'section' || entry.table === 'area') {
        const config = entry.table === 'project'
          ? { table: 'projects', columns: [['name', 'name'], ['color', 'color'], ['parentId', 'parent_id'], ['areaId', 'area_id'], ['type', 'type'], ['isArchived', 'is_archived'], ['calendarSyncEnabled', 'calendar_sync_enabled'], ['sortOrder', 'sort_order']] }
          : entry.table === 'tag' ? { table: 'tags', columns: [['name', 'name'], ['color', 'color']] }
          : entry.table === 'section' ? { table: 'sections', columns: [['projectId', 'project_id'], ['name', 'name'], ['sortOrder', 'sort_order']] }
          : { table: 'areas', columns: [['name', 'name'], ['color', 'color'], ['sortOrder', 'sort_order']] };
        const owned = entry.table === 'section'
          ? sql`select s.id from sections s join projects p on p.id=s.project_id where s.id=${entry.id} and p.user_id=${userId}`
          : sql`select id from ${sql(config.table)} where id=${entry.id} and user_id=${userId}`;
        const old = await owned;
        const exists = Boolean(old[0]);
        const parts = [];
        for (const [field, column] of config.columns as string[][]) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${d[field] ?? null}`);
        if (exists && parts.length) await sql`update ${sql(config.table)} set ${joinSql(parts)}, updated_at=${incoming} where id=${entry.id}`;
        else if (!exists && typeof d.name === 'string' && d.name.trim()) {
          if (entry.table === 'section') await sql`insert into sections (id,project_id,name,sort_order,created_at,updated_at) values (${entry.id},${d.projectId},${d.name.trim()},${d.sortOrder ?? 0},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
          else await sql`insert into ${sql(config.table)} (id,user_id,name,created_at,updated_at) values (${entry.id},${userId},${d.name.trim()},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        }
        if (d.deletedAt) await sql`update ${sql(config.table)} set deleted_at=${new Date(String(d.deletedAt))},updated_at=${incoming} where id=${entry.id}`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'projectColumn') {
        const owned = await sql<{ id: string }[]>`select pc.id from project_columns pc join projects p on p.id=pc.project_id where pc.id=${entry.id} and p.user_id=${userId}`;
        const parts = [];
        for (const [field, column] of [['projectId', 'project_id'], ['name', 'name'], ['color', 'color'], ['isDone', 'is_done'], ['sortOrder', 'sort_order']] as const) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${d[field] ?? null}`);
        if (owned[0] && parts.length) await sql`update project_columns set ${joinSql(parts)}, updated_at=${incoming} where id=${entry.id}`;
        else if (!owned[0] && typeof d.projectId === 'string' && typeof d.name === 'string') await sql`insert into project_columns (id,project_id,name,color,is_done,sort_order,created_at,updated_at) values (${entry.id},${d.projectId},${d.name},${d.color ?? 'slate'},${d.isDone ?? false},${d.sortOrder ?? 0},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        if (d.deletedAt) await sql`update project_columns set deleted_at=${new Date(String(d.deletedAt))},updated_at=${incoming} where id=${entry.id}`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'taskChecklistItem') {
        const owned = await sql<{ id: string }[]>`select i.id from task_checklist_items i join tasks t on t.id=i.task_id where i.id=${entry.id} and t.user_id=${userId}`;
        const parts = [];
        for (const [field, column] of [['taskId', 'task_id'], ['title', 'title'], ['completedAt', 'completed_at'], ['sortOrder', 'sort_order']] as const) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${field === 'completedAt' && d[field] ? new Date(String(d[field])) : d[field] ?? null}`);
        if (owned[0] && parts.length) await sql`update task_checklist_items set ${joinSql(parts)}, updated_at=${incoming} where id=${entry.id}`;
        else if (!owned[0] && typeof d.taskId === 'string' && typeof d.title === 'string') await sql`insert into task_checklist_items (id,task_id,title,completed_at,sort_order,created_at,updated_at) values (${entry.id},${d.taskId},${d.title},${d.completedAt ? new Date(String(d.completedAt)) : null},${d.sortOrder ?? 0},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'note') {
        const owned = await sql<{ id: string }[]>`select id from notes where id=${entry.id} and user_id=${userId}`;
        const parts = [];
        for (const [field, column] of [['taskId', 'task_id'], ['title', 'title'], ['content', 'content'], ['deletedAt', 'deleted_at']] as const) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${field === 'deletedAt' && d[field] ? new Date(String(d[field])) : d[field] ?? null}`);
        if (owned[0] && parts.length) await sql`update notes set ${joinSql(parts)}, updated_at=${incoming} where id=${entry.id} and user_id=${userId}`;
        else if (!owned[0] && typeof d.userId === 'string' && d.userId === userId) await sql`insert into notes (id,user_id,task_id,title,content,created_at,updated_at) values (${entry.id},${userId},${d.taskId ?? null},${d.title ?? null},${d.content ?? null},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'reminder') {
        const owned = await sql<{ id: string }[]>`select r.id from reminders r join tasks t on t.id=r.task_id where r.id=${entry.id} and t.user_id=${userId}`;
        const parts = [];
        if (Object.hasOwn(d, 'taskId')) parts.push(sql`task_id = ${d.taskId}`);
        if (Object.hasOwn(d, 'remindAt')) parts.push(sql`remind_at = ${d.remindAt ? new Date(String(d.remindAt)) : new Date()}`);
        if (Object.hasOwn(d, 'type')) parts.push(sql`type = ${d.type}::"ReminderType"`);
        if (Object.hasOwn(d, 'isSent')) parts.push(sql`is_sent = ${Boolean(d.isSent)}`);
        if (owned[0] && parts.length) await sql`update reminders set ${joinSql(parts)},updated_at=${incoming} where id=${entry.id}`;
        else if (!owned[0] && typeof d.taskId === 'string') await sql`insert into reminders (id,task_id,remind_at,type,is_sent,created_at,updated_at) values (${entry.id},${d.taskId},${new Date(String(d.remindAt))},${d.type ?? 'push'}::"ReminderType",${d.isSent ?? false},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'timeBlock') {
        const owned = await sql<{ id: string }[]>`select b.id from time_blocks b join tasks t on t.id=b.task_id where b.id=${entry.id} and t.user_id=${userId}`;
        const parts = [];
        for (const [field, column] of [['taskId', 'task_id'], ['startAt', 'start_at'], ['endAt', 'end_at'], ['timeZone', 'time_zone'], ['allDay', 'all_day'], ['source', 'source'], ['completedAt', 'completed_at'], ['actualMin', 'actual_min'], ['deletedAt', 'deleted_at']] as const) if (Object.hasOwn(d, field)) {
          const value = ['startAt', 'endAt', 'completedAt', 'deletedAt'].includes(field) && d[field] ? new Date(String(d[field])) : d[field] ?? null;
          parts.push(sql`${sql(column)} = ${field === 'source' ? sql`${value}::"TimeBlockSource"` : value}`);
        }
        if (owned[0] && parts.length) await sql`update time_blocks set ${joinSql(parts)},updated_at=${incoming} where id=${entry.id}`;
        else if (!owned[0] && typeof d.taskId === 'string' && d.startAt && d.endAt && d.timeZone) await sql`insert into time_blocks (id,user_id,task_id,start_at,end_at,time_zone,all_day,source,created_at,updated_at) values (${entry.id},${userId},${d.taskId},${new Date(String(d.startAt))},${new Date(String(d.endAt))},${d.timeZone},${d.allDay ?? false},${d.source ?? 'MANUAL'}::"TimeBlockSource",${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        accepted.push(entry.id);
        continue;
      }
      if (entry.table === 'countdown') {
        const owned = await sql<{ id: string }[]>`select id from countdowns where id=${entry.id} and user_id=${userId}`;
        const parts = [];
        for (const [field, column] of [['title', 'title'], ['targetDate', 'target_date'], ['color', 'color'], ['imageUrl', 'image_url'], ['reminderDaysBefore', 'reminder_days_before'], ['showInCalendar', 'show_in_calendar'], ['deletedAt', 'deleted_at']] as const) if (Object.hasOwn(d, field)) parts.push(sql`${sql(column)} = ${['targetDate', 'deletedAt'].includes(field) && d[field] ? new Date(String(d[field])) : d[field] ?? null}`);
        if (owned[0] && parts.length) await sql`update countdowns set ${joinSql(parts)},updated_at=${incoming} where id=${entry.id}`;
        else if (!owned[0] && typeof d.title === 'string' && d.targetDate) await sql`insert into countdowns (id,user_id,title,target_date,color,image_url,reminder_days_before,show_in_calendar,created_at,updated_at) values (${entry.id},${userId},${d.title},${new Date(String(d.targetDate))},${d.color ?? null},${d.imageUrl ?? null},${d.reminderDaysBefore ?? null},${d.showInCalendar ?? false},${d.createdAt ? new Date(String(d.createdAt)) : new Date()},${incoming})`;
        accepted.push(entry.id);
        continue;
      }
    } catch {
      conflicts.push({ table: entry.table, id: entry.id });
    }
  }
  return { accepted, conflicts };
}

export async function routeSync(path: string, request: Request): Promise<Response | null> {
  if (path !== '/sync/changes' && path !== '/sync/push') return null;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (path === '/sync/changes' && request.method === 'GET') {
    const raw = new URL(request.url).searchParams.get('since');
    const since = raw ? new Date(raw) : new Date(0);
    if (Number.isNaN(since.getTime())) return json({ success: false, error: 'Invalid query' }, { status: 400 });
    const items = await changes(auth.user.id, since);
    return json({ success: true, data: { version: 2, items, serverTime: new Date().toISOString() } });
  }
  if (path === '/sync/push' && request.method === 'POST') {
    let input: Record<string, unknown>;
    try { input = await request.json() as Record<string, unknown>; } catch { return json({ success: false, error: 'Invalid body' }, { status: 400 }); }
    if (!Array.isArray(input.items)) return json({ success: false, error: 'Invalid body' }, { status: 400 });
    const entries = input.items.filter((value): value is SyncItem => Boolean(value && typeof value === 'object' && typeof (value as SyncItem).table === 'string' && typeof (value as SyncItem).id === 'string' && typeof (value as SyncItem).updatedAt === 'string' && (value as SyncItem).data && typeof (value as SyncItem).data === 'object'));
    const result = await push(auth.user.id, entries);
    return json({ success: true, data: { ...result, serverTime: new Date().toISOString() } });
  }
  return json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
