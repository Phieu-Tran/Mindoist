import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth, type AuthContext } from './sf0.ts';

type ProjectType = 'DAILY_LOG' | 'JOB' | 'PERSONAL' | 'CUSTOM';

const PROJECT_TYPES = new Set<ProjectType>(['DAILY_LOG', 'JOB', 'PERSONAL', 'CUSTOM']);

const TEMPLATE_COLUMNS: Record<ProjectType, Array<{ name: string; color: string; isDone: boolean }>> = {
  DAILY_LOG: [
    { name: 'TODO', color: 'slate', isDone: false },
    { name: 'Doing', color: 'ocean', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
  JOB: [
    { name: 'Applied', color: 'slate', isDone: false },
    { name: 'Screen', color: 'ocean', isDone: false },
    { name: 'Interview', color: 'amber', isDone: false },
    { name: 'Offer', color: 'jade', isDone: true },
    { name: 'Rejected', color: 'rose', isDone: true },
  ],
  PERSONAL: [
    { name: 'Backlog', color: 'slate', isDone: false },
    { name: 'This Week', color: 'ocean', isDone: false },
    { name: 'Today', color: 'amber', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
  CUSTOM: [
    { name: 'Backlog', color: 'slate', isDone: false },
    { name: 'In progress', color: 'ocean', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
};

function bodyError(message: string) {
  return json({ success: false, error: message }, { status: 400 });
}

async function readBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown, min = 1, max = 120) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length >= min && result.length <= max ? result : null;
}

function optionalString(value: unknown, max = 120) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return stringValue(value, 0, max);
}

function optionalBoolean(value: unknown) {
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value: unknown) {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uuidLike(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function projectType(value: unknown): ProjectType {
  return typeof value === 'string' && PROJECT_TYPES.has(value as ProjectType) ? value as ProjectType : 'CUSTOM';
}

function columnsForTemplate(type: ProjectType, customColumns?: string[]) {
  const columns = type === 'CUSTOM' && customColumns?.length
    ? customColumns.map((name, index) => ({
      name,
      color: ['slate', 'ocean', 'amber', 'jade', 'rose'][index % 5],
      isDone: index === customColumns.length - 1,
    }))
    : TEMPLATE_COLUMNS[type];
  return columns.map((column, sortOrder) => ({ ...column, sortOrder }));
}

function projectNameForTemplate(name: string, type: ProjectType) {
  if (type !== 'DAILY_LOG') return name;
  const today = new Date().toISOString().slice(0, 10);
  return name.startsWith(today) ? name : `${today} · ${name}`;
}

async function projectForUser(id: string, userId: string) {
  const rows = await sql<Record<string, unknown>[]>`
    select id, user_id as "userId", parent_id as "parentId", area_id as "areaId", name, color,
           type, is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled",
           sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from projects where id = ${id} and user_id = ${userId} and deleted_at is null limit 1
  `;
  return rows[0] ?? null;
}

async function createProject(userId: string, input: Record<string, unknown>, parentId: string | null = null) {
  const name = stringValue(input.name);
  if (!name) return { status: 400, body: { success: false, error: 'Name is required' } };
  const type = projectType(input.type);
  const colorValue = optionalString(input.color, 24);
  if (colorValue === null) return { status: 400, body: { success: false, error: 'Invalid color' } };
  const color = colorValue ?? null;
  const areaId = input.areaId === undefined || input.areaId === null ? null : input.areaId;
  if (areaId !== null && !uuidLike(areaId)) return { status: 400, body: { success: false, error: 'Invalid areaId' } };
  const resolvedParentId = parentId ?? (input.parentId === undefined || input.parentId === null ? null : input.parentId);
  if (resolvedParentId !== null) {
    if (!uuidLike(resolvedParentId)) return { status: 400, body: { success: false, error: 'Invalid parentId' } };
    if (!await projectForUser(resolvedParentId, userId)) return { status: 400, body: { success: false, error: 'Invalid parent project' } };
  }
  const calendarSyncEnabled = optionalBoolean(input.calendarSyncEnabled);
  if (calendarSyncEnabled === null) return { status: 400, body: { success: false, error: 'Invalid calendarSyncEnabled' } };

  let customColumns: string[] | undefined;
  if (input.customColumns !== undefined) {
    if (!Array.isArray(input.customColumns) || input.customColumns.length < 1 || input.customColumns.length > 12) {
      return { status: 400, body: { success: false, error: 'Invalid customColumns' } };
    }
    customColumns = input.customColumns.map(value => stringValue(value, 1, 80)).filter((value): value is string => Boolean(value));
    if (customColumns.length !== input.customColumns.length) return { status: 400, body: { success: false, error: 'Invalid customColumns' } };
  }

  const created = await sql.begin(async tx => {
    const projectRows = await tx<Record<string, unknown>[]>`
      insert into projects (id, user_id, parent_id, area_id, name, color, type, calendar_sync_enabled, created_at, updated_at)
      values (${crypto.randomUUID()}, ${userId}, ${resolvedParentId}, ${areaId}, ${projectNameForTemplate(name, type)}, ${color}, ${type}::"ProjectType", ${calendarSyncEnabled ?? false}, now(), now())
      returning id, user_id as "userId", parent_id as "parentId", area_id as "areaId", name, color,
                type, is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled",
                sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    const project = projectRows[0];
    for (const column of columnsForTemplate(type, customColumns)) {
      await tx`
        insert into project_columns (id, project_id, name, color, is_done, sort_order, created_at, updated_at)
        values (${crypto.randomUUID()}, ${project.id}, ${column.name}, ${column.color}, ${column.isDone}, ${column.sortOrder}, now(), now())
      `;
    }
    return project;
  });
  return { status: 201, body: { success: true, data: created } };
}

async function updateProject(id: string, userId: string, input: Record<string, unknown>) {
  const existing = await projectForUser(id, userId);
  if (!existing) return { status: 404, body: { success: false, error: 'Project not found' } };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = stringValue(input.name);
    if (!name) return { status: 400, body: { success: false, error: 'Invalid name' } };
    updates.name = name;
  }
  for (const key of ['color', 'areaId'] as const) {
    if (input[key] !== undefined) {
      const value = key === 'color' ? optionalString(input[key], 24) : (input[key] === null ? null : input[key]);
      if (value === null && key === 'color' && input[key] !== null) return { status: 400, body: { success: false, error: 'Invalid color' } };
      if (key === 'areaId' && value !== null && !uuidLike(value)) return { status: 400, body: { success: false, error: 'Invalid areaId' } };
      updates[key] = value;
    }
  }
  for (const key of ['isArchived', 'calendarSyncEnabled'] as const) {
    if (input[key] !== undefined) {
      const value = optionalBoolean(input[key]);
      if (value === null) return { status: 400, body: { success: false, error: `Invalid ${key}` } };
      updates[key] = value;
    }
  }
  if (input.sortOrder !== undefined) {
    const value = optionalNumber(input.sortOrder);
    if (value === null) return { status: 400, body: { success: false, error: 'Invalid sortOrder' } };
    updates.sortOrder = value;
  }
  if (input.parentId !== undefined) {
    const parentId = input.parentId === null ? null : input.parentId;
    if (parentId !== null && !uuidLike(parentId)) return { status: 400, body: { success: false, error: 'Invalid parentId' } };
    if (parentId === id) return { status: 400, body: { success: false, error: 'Project cannot be its own parent' } };
    if (parentId !== null) {
      const parent = await projectForUser(parentId, userId);
      if (!parent) return { status: 400, body: { success: false, error: 'Invalid parent project' } };
      const cycle = await sql<{ found: boolean }[]>`
        with recursive ancestors as (
          select id, parent_id as "parentId" from projects where id = ${parentId} and user_id = ${userId} and deleted_at is null
          union all
          select p.id, p.parent_id from projects p join ancestors a on p.id = a."parentId"
          where p.user_id = ${userId} and p.deleted_at is null
        ) select exists(select 1 from ancestors where id = ${id}) as found
      `;
      if (cycle[0]?.found) return { status: 400, body: { success: false, error: 'Project hierarchy cannot contain a cycle' } };
    }
    updates.parentId = parentId;
  }

  if (Object.keys(updates).length === 0) return { status: 200, body: { success: true, data: existing } };
  const rows = await sql<Record<string, unknown>[]>`
    update projects set
      name = coalesce(${updates.name ?? null}, name),
      color = case when ${Object.hasOwn(updates, 'color')} then ${updates.color ?? null} else color end,
      area_id = case when ${Object.hasOwn(updates, 'areaId')} then ${updates.areaId ?? null} else area_id end,
      parent_id = case when ${Object.hasOwn(updates, 'parentId')} then ${updates.parentId ?? null} else parent_id end,
      is_archived = coalesce(${updates.isArchived ?? null}, is_archived),
      calendar_sync_enabled = coalesce(${updates.calendarSyncEnabled ?? null}, calendar_sync_enabled),
      sort_order = coalesce(${updates.sortOrder ?? null}, sort_order), updated_at = now()
    where id = ${id} and user_id = ${userId} and deleted_at is null
    returning id, user_id as "userId", parent_id as "parentId", area_id as "areaId", name, color,
              type, is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled",
              sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
  `;
  return { status: 200, body: { success: true, data: rows[0] } };
}

async function listColumns(projectId: string, userId: string) {
  const project = await projectForUser(projectId, userId);
  if (!project) return { status: 404, body: { success: false, error: 'Project not found' } };
  let rows = await sql<Record<string, unknown>[]>`
    select id, project_id as "projectId", name, color, is_done as "isDone", sort_order as "sortOrder",
           created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    from project_columns where project_id = ${projectId} and deleted_at is null
    order by sort_order asc, created_at asc
  `;
  if (!rows.length) {
    for (const column of columnsForTemplate((project.type as ProjectType) || 'CUSTOM')) {
      await sql`
        insert into project_columns (id, project_id, name, color, is_done, sort_order, created_at, updated_at)
        values (${crypto.randomUUID()}, ${projectId}, ${column.name}, ${column.color}, ${column.isDone}, ${column.sortOrder}, now(), now())
      `;
    }
    rows = await sql<Record<string, unknown>[]>`
      select id, project_id as "projectId", name, color, is_done as "isDone", sort_order as "sortOrder",
             created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from project_columns where project_id = ${projectId} and deleted_at is null
      order by sort_order asc, created_at asc
    `;
  }
  return { status: 200, body: { success: true, data: rows } };
}

export async function handleProjectRoutes(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  const userId = auth.user.id;
  const body = () => readBody(request);

  if (path === '/projects' && request.method === 'GET') {
    const rows = await sql<Record<string, unknown>[]>`
      select id, user_id as "userId", parent_id as "parentId", area_id as "areaId", name, color,
             type, is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled",
             sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from projects where user_id = ${userId} and deleted_at is null order by sort_order asc, created_at desc
    `;
    return json({ success: true, data: rows });
  }
  if (path === '/projects' && request.method === 'POST') {
    const result = await createProject(userId, await body());
    return json(result.body, { status: result.status });
  }

  const workspaceMatch = path.match(/^\/projects\/([^/]+)\/workspace$/);
  if (workspaceMatch && request.method === 'GET') {
    const project = await projectForUser(workspaceMatch[1], userId);
    if (!project) return json({ success: false, error: 'Project not found' }, { status: 404 });
    const columns = await sql<Record<string, unknown>[]>`
      select id, project_id as "projectId", name, color, is_done as "isDone", sort_order as "sortOrder",
             created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from project_columns where project_id = ${workspaceMatch[1]} and deleted_at is null order by sort_order asc, created_at asc
    `;
    const tasks = await sql<Record<string, unknown>[]>`
      with recursive tree as (
        select id from projects where id = ${workspaceMatch[1]} and user_id = ${userId} and deleted_at is null
        union all select p.id from projects p join tree t on p.parent_id = t.id
        where p.user_id = ${userId} and p.deleted_at is null
      )
      select id, user_id as "userId", project_id as "projectId", project_column_id as "projectColumnId",
             section_id as "sectionId", parent_id as "parentId", title, description, color, priority,
             due_date as "dueDate", due_time as "dueTime", deadline_date as "deadlineDate", deadline_time as "deadlineTime",
             deadline_time_zone as "deadlineTimeZone", start_date as "startDate", duration_min as "durationMin",
             estimate_min as "estimateMin", rrule, recurring_reset_mode as "recurringResetMode", recurrence_basis as "recurrenceBasis",
             import_source as "importSource", external_id as "externalId", pomodoro_count as "pomodoroCount",
             due_notification_sent_at as "dueNotificationSentAt", completed_at as "completedAt", sort_order as "sortOrder",
             created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt", snoozed_until as "snoozedUntil",
             field_versions as "fieldVersions"
      from tasks where user_id = ${userId} and project_id in (select id from tree) and deleted_at is null
      order by sort_order asc, created_at desc
    `;
    const subProjects = await sql<Record<string, unknown>[]>`
      with recursive tree as (
        select id from projects where id = ${workspaceMatch[1]} and user_id = ${userId} and deleted_at is null
        union all select p.id from projects p join tree t on p.parent_id = t.id
        where p.user_id = ${userId} and p.deleted_at is null
      )
      select id, user_id as "userId", parent_id as "parentId", area_id as "areaId", name, color, type,
             is_archived as "isArchived", calendar_sync_enabled as "calendarSyncEnabled", sort_order as "sortOrder",
             created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
      from projects where id in (select id from tree) and id <> ${workspaceMatch[1]}
      order by sort_order asc, created_at asc
    `;
    return json({ success: true, data: { project, subProjects, columns, tasks } });
  }

  const subprojectMatch = path.match(/^\/projects\/([^/]+)\/subprojects$/);
  if (subprojectMatch && request.method === 'POST') {
    const parent = await projectForUser(subprojectMatch[1], userId);
    if (!parent) return json({ success: false, error: 'Project not found' }, { status: 404 });
    const result = await createProject(userId, await body(), subprojectMatch[1]);
    return json(result.body, { status: result.status });
  }

  const columnListMatch = path.match(/^\/projects\/([^/]+)\/columns$/);
  if (columnListMatch && request.method === 'GET') {
    const result = await listColumns(columnListMatch[1], userId);
    return json(result.body, { status: result.status });
  }
  if (columnListMatch && request.method === 'POST') {
    const project = await projectForUser(columnListMatch[1], userId);
    if (!project) return json({ success: false, error: 'Project not found' }, { status: 404 });
    const input = await body();
    const name = stringValue(input.name, 1, 80);
    if (!name) return bodyError('Name is required');
    const color = input.color === undefined ? 'slate' : stringValue(input.color, 1, 24);
    if (!color) return bodyError('Invalid color');
    const isDone = input.isDone === undefined ? false : input.isDone;
    const sortOrder = input.sortOrder === undefined ? 0 : input.sortOrder;
    if (typeof isDone !== 'boolean' || typeof sortOrder !== 'number' || !Number.isFinite(sortOrder)) return bodyError('Invalid column data');
    const rows = await sql<Record<string, unknown>[]>`
      insert into project_columns (id, project_id, name, color, is_done, sort_order, created_at, updated_at)
      values (${crypto.randomUUID()}, ${columnListMatch[1]}, ${name}, ${color}, ${isDone}, ${sortOrder}, now(), now())
      returning id, project_id as "projectId", name, color, is_done as "isDone", sort_order as "sortOrder",
                created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }

  const columnMatch = path.match(/^\/projects\/([^/]+)\/columns\/([^/]+)$/);
  if (columnMatch && request.method === 'PATCH') {
    const existing = await sql<Record<string, unknown>[]>`
      select pc.id from project_columns pc join projects p on p.id = pc.project_id
      where pc.id = ${columnMatch[2]} and pc.project_id = ${columnMatch[1]} and pc.deleted_at is null
        and p.user_id = ${userId} and p.deleted_at is null limit 1
    `;
    if (!existing[0]) return json({ success: false, error: 'Project column not found' }, { status: 404 });
    const input = await body();
    const name = input.name === undefined ? undefined : stringValue(input.name, 1, 80);
    const color = input.color === undefined ? undefined : stringValue(input.color, 1, 24);
    const isDone = input.isDone === undefined ? undefined : input.isDone;
    const sortOrder = input.sortOrder === undefined ? undefined : input.sortOrder;
    if (name === null || color === null || (isDone !== undefined && typeof isDone !== 'boolean') || (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder)))) return bodyError('Invalid column data');
    const rows = await sql<Record<string, unknown>[]>`
      update project_columns set name = coalesce(${name ?? null}, name), color = coalesce(${color ?? null}, color),
             is_done = coalesce(${isDone ?? null}, is_done), sort_order = coalesce(${sortOrder ?? null}, sort_order), updated_at = now()
      where id = ${columnMatch[2]} and project_id = ${columnMatch[1]} and deleted_at is null
      returning id, project_id as "projectId", name, color, is_done as "isDone", sort_order as "sortOrder",
                created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] });
  }
  if (columnMatch && request.method === 'DELETE') {
    const existing = await sql<Record<string, unknown>[]>`
      select pc.id from project_columns pc join projects p on p.id = pc.project_id
      where pc.id = ${columnMatch[2]} and pc.project_id = ${columnMatch[1]} and pc.deleted_at is null
        and p.user_id = ${userId} and p.deleted_at is null limit 1
    `;
    if (!existing[0]) return json({ success: false, error: 'Project column not found' }, { status: 404 });
    const count = await sql<{ count: number }[]>`select count(*)::int as count from project_columns where project_id = ${columnMatch[1]} and deleted_at is null`;
    if ((count[0]?.count ?? 0) <= 1) return json({ success: false, error: 'A project needs at least one column' }, { status: 409 });
    await sql.begin(async tx => {
      await tx`update tasks set project_column_id = null, updated_at = now() where project_column_id = ${columnMatch[2]}`;
      await tx`update project_columns set deleted_at = now(), updated_at = now() where id = ${columnMatch[2]}`;
    });
    return json({ success: true });
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && request.method === 'GET') {
    const project = await projectForUser(projectMatch[1], userId);
    return project ? json({ success: true, data: project }) : json({ success: false, error: 'Project not found' }, { status: 404 });
  }
  if (projectMatch && request.method === 'PATCH') {
    const result = await updateProject(projectMatch[1], userId, await body());
    return json(result.body, { status: result.status });
  }
  if (projectMatch && request.method === 'DELETE') {
    const project = await projectForUser(projectMatch[1], userId);
    if (!project) return json({ success: false, error: 'Project not found' }, { status: 404 });
    await sql`update projects set deleted_at = now(), updated_at = now() where id = ${projectMatch[1]} and user_id = ${userId}`;
    return json({ success: true });
  }

  if (path.match(/^\/projects\/[^/]+\/sections$/) && ['GET', 'POST'].includes(request.method)) {
    const match = path.match(/^\/projects\/([^/]+)\/sections$/)!;
    const project = await projectForUser(match[1], userId);
    if (!project) return json({ success: false, error: 'Project not found' }, { status: 404 });
    if (request.method === 'GET') {
      const rows = await sql<Record<string, unknown>[]>`
        select id, project_id as "projectId", name, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
        from sections where project_id = ${match[1]} and deleted_at is null order by sort_order asc, created_at desc
      `;
      return json({ success: true, data: rows });
    }
    const name = stringValue((await body()).name, 1, 120);
    if (!name) return bodyError('Name is required');
    const rows = await sql<Record<string, unknown>[]>`
      insert into sections (id, project_id, name, created_at, updated_at)
      values (${crypto.randomUUID()}, ${match[1]}, ${name}, now(), now())
      returning id, project_id as "projectId", name, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }

  const sectionMatch = path.match(/^\/sections\/([^/]+)$/);
  if (sectionMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const existing = await sql<Record<string, unknown>[]>`
      select s.id from sections s join projects p on p.id = s.project_id
      where s.id = ${sectionMatch[1]} and s.deleted_at is null and p.user_id = ${userId} and p.deleted_at is null limit 1
    `;
    if (!existing[0]) return json({ success: false, error: 'Section not found' }, { status: 404 });
    if (request.method === 'DELETE') {
      await sql`update sections set deleted_at = now(), updated_at = now() where id = ${sectionMatch[1]}`;
      return json({ success: true });
    }
    const input = await body();
    const name = input.name === undefined ? undefined : stringValue(input.name, 1, 120);
    const sortOrder = input.sortOrder === undefined ? undefined : input.sortOrder;
    if (name === null || (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder)))) return bodyError('Invalid section data');
    const rows = await sql<Record<string, unknown>[]>`
      update sections set name = coalesce(${name ?? null}, name), sort_order = coalesce(${sortOrder ?? null}, sort_order), updated_at = now()
      where id = ${sectionMatch[1]} and deleted_at is null
      returning id, project_id as "projectId", name, sort_order as "sortOrder", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] });
  }

  if (path === '/tags' && ['GET', 'POST'].includes(request.method)) {
    if (request.method === 'GET') {
      const rows = await sql<Record<string, unknown>[]>`
        select id, user_id as "userId", name, color, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
        from tags where user_id = ${userId} and deleted_at is null order by name asc
      `;
      return json({ success: true, data: rows });
    }
    const input = await body();
    const name = stringValue(input.name, 1, 120);
    if (!name) return bodyError('Name is required');
    const color = input.color === undefined ? null : optionalString(input.color, 24);
    if (color === null && input.color !== undefined && input.color !== null) return bodyError('Invalid color');
    const rows = await sql<Record<string, unknown>[]>`
      insert into tags (id, user_id, name, color, created_at, updated_at)
      values (${crypto.randomUUID()}, ${userId}, ${name}, ${color}, now(), now())
      returning id, user_id as "userId", name, color, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] }, { status: 201 });
  }

  const tagMatch = path.match(/^\/tags\/([^/]+)$/);
  if (tagMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const existing = await sql<Record<string, unknown>[]>`select id from tags where id = ${tagMatch[1]} and user_id = ${userId} and deleted_at is null limit 1`;
    if (!existing[0]) return json({ success: false, error: 'Tag not found' }, { status: 404 });
    if (request.method === 'DELETE') {
      await sql`update tags set deleted_at = now(), updated_at = now() where id = ${tagMatch[1]}`;
      return json({ success: true });
    }
    const input = await body();
    const name = input.name === undefined ? undefined : stringValue(input.name, 1, 120);
    const color = input.color === undefined ? undefined : optionalString(input.color, 24);
    if (name === null || color === null) return bodyError('Invalid tag data');
    const rows = await sql<Record<string, unknown>[]>`
      update tags set name = coalesce(${name ?? null}, name), color = case when ${input.color !== undefined} then ${color ?? null} else color end, updated_at = now()
      where id = ${tagMatch[1]} and user_id = ${userId} and deleted_at is null
      returning id, user_id as "userId", name, color, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
    `;
    return json({ success: true, data: rows[0] });
  }

  return null;
}

export async function routeProjects(path: string, request: Request): Promise<Response | null> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return handleProjectRoutes(path, request, auth);
}
