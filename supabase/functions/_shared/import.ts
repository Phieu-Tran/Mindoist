import { parse } from 'npm:csv-parse@7.0.1/sync';
import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

type TickRow = Record<string, string>;
type ParsedTask = {
  title: string; content: string; isChecklist: boolean; startDate: string | null; dueDate: string | null; dueTime: string | null;
  rrule: string | null; priority: number | null; isCompleted: boolean; completedAt: string | null; listName: string; columnName: string | null;
  tags: string[]; tickTickTaskId: string; tickTickParentId: string; checklistItems: string[];
};
type JsonRow = Record<string, unknown>;
type MindoistData = {
  tasks: JsonRow[]; projects: JsonRow[]; notes: JsonRow[]; tags: JsonRow[];
  sections: JsonRow[]; projectColumns: JsonRow[]; taskTags: JsonRow[]; countdowns: JsonRow[];
  settings: JsonRow | null; clientSettings: JsonRow | null;
};

function priority(value: string) {
  const number = Number.parseInt((value || '').replace(/^p/i, ''), 10);
  return number === 5 ? 1 : number === 3 ? 2 : number === 1 ? 3 : null;
}

function dateTime(value: string | undefined) {
  if (!value?.trim()) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}/);
  return match ? { date: match[1], time: match[2] } : null;
}

function checklist(content: string) {
  return content.replace(/\r\n|\r|\n/g, '\n').split('\n').filter(Boolean)
    .filter(line => line.startsWith('▪') || line.startsWith('▫'))
    .map(line => line.replace(/^[▪▫]\s*/, ''));
}

function parseTickTick(csv: string) {
  const headerIndex = csv.indexOf('"Folder Name"');
  const body = headerIndex >= 0 ? csv.slice(headerIndex) : csv;
  let records: TickRow[];
  try { records = parse(body, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true }) as TickRow[]; } catch { return null; }
  const projects = new Set<string>(); const tags = new Set<string>();
  let completed = 0; let recurring = 0; let checklists = 0; let withDueDate = 0;
  const seen = new Map<string, ParsedTask>();
  for (const row of records) {
    const listName = row['List Name'] || 'Inbox'; projects.add(listName);
    const tagList = (row.Tags || '').split(',').map(value => value.trim()).filter(Boolean); tagList.forEach(tag => tags.add(tag));
    const due = dateTime(row['Due Date']); const isCompleted = row.Status === '1' || row.Status === '2';
    const repeat = row.Repeat?.trim() || null; const isChecklist = row['Is Check list'] === 'Y';
    if (isCompleted) completed++; if (repeat) recurring++; if (isChecklist) checklists++; if (due) withDueDate++;
    const parsed: ParsedTask = {
      title: row.Title?.trim() || 'Untitled', content: row.Content?.trim() || '', isChecklist,
      startDate: dateTime(row['Start Date'])?.date ?? null, dueDate: due?.date ?? null, dueTime: due?.time ?? null,
      rrule: repeat, priority: priority(row.Priority || '0'), isCompleted, completedAt: row['Completed Time']?.trim() || null,
      listName, columnName: row['Column Name']?.trim() || null, tags: tagList, tickTickTaskId: row.taskId || '', tickTickParentId: row.parentId || '', checklistItems: isChecklist ? checklist(row.Content || '') : [],
    };
    const key = parsed.tickTickTaskId || `${parsed.listName}:${parsed.title}`;
    const old = seen.get(key); if (!old || (parsed.isCompleted && !old.isCompleted)) seen.set(key, parsed);
  }
  const tasks = [...seen.values()];
  return { tasks, projects: [...projects].sort(), tags: [...tags].sort(), stats: { total: tasks.length, completed, recurring, checklists, withDueDate } };
}

function dateOnly(value: string | null) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }

function jsonRow(value: unknown): JsonRow | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRow : null;
}

function jsonRows(value: unknown, optional = false) {
  if (value === undefined && optional) return [] as JsonRow[];
  if (!Array.isArray(value) || value.length > 100_000) return null;
  const rows: JsonRow[] = [];
  for (const item of value) {
    const row = jsonRow(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function field(row: JsonRow, ...names: string[]) {
  for (const name of names) if (row[name] !== undefined) return row[name];
  return null;
}

function stringField(row: JsonRow, ...names: string[]) {
  const value = field(row, ...names);
  return value === null || value === undefined || value === '' ? null : String(value);
}

function numberField(row: JsonRow, ...names: string[]) {
  const value = field(row, ...names);
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanField(row: JsonRow, ...names: string[]) {
  const value = field(row, ...names);
  return typeof value === 'boolean' ? value : value === 'true' || value === 1;
}

function dateField(row: JsonRow, ...names: string[]) {
  const value = stringField(row, ...names);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enumField<T extends string>(row: JsonRow, allowed: readonly T[], ...names: string[]) {
  const value = stringField(row, ...names);
  return value && (allowed as readonly string[]).includes(value) ? value : null;
}

function validTimeZone(value: string) {
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}

function parseMindoistJson(content: string): MindoistData | null {
  let root: JsonRow;
  try {
    const parsed = JSON.parse(content);
    const object = jsonRow(parsed);
    if (!object) return null;
    root = object;
  } catch { return null; }
  const tasks = jsonRows(root.tasks);
  const projects = jsonRows(root.projects);
  const tags = jsonRows(root.tags);
  const notes = jsonRows(root.notes, true);
  const sections = jsonRows(root.sections, true);
  const projectColumns = jsonRows(root.projectColumns, true);
  const taskTags = jsonRows(root.taskTags, true);
  const countdowns = jsonRows(root.countdowns, true);
  const settings = root.settings === undefined || root.settings === null ? null : jsonRow(root.settings);
  const clientSettings = root.clientSettings === undefined || root.clientSettings === null ? null : jsonRow(root.clientSettings);
  if (!tasks || !projects || !tags || !notes || !sections || !projectColumns || !taskTags || !countdowns || (root.settings !== undefined && root.settings !== null && !settings) || (root.clientSettings !== undefined && root.clientSettings !== null && !clientSettings)) return null;
  return { tasks, projects, notes, tags, sections, projectColumns, taskTags, countdowns, settings, clientSettings };
}

function mindoistPreview(data: MindoistData) {
  const projectNames = new Map(data.projects.map(project => [String(field(project, 'id') ?? ''), stringField(project, 'name') || 'Untitled']));
  const tasks = data.tasks.map(task => {
    const deadline = dateField(task, 'deadlineDate', 'deadline_date', 'dueDate', 'due_date');
    const completedAt = dateField(task, 'completedAt', 'completed_at');
    const projectId = stringField(task, 'projectId', 'project_id');
    return {
      title: stringField(task, 'title') || 'Untitled',
      content: stringField(task, 'description') || '',
      isChecklist: false,
      startDate: dateField(task, 'startDate', 'start_date')?.toISOString() || null,
      dueDate: deadline?.toISOString().slice(0, 10) || null,
      dueTime: stringField(task, 'deadlineTime', 'deadline_time', 'dueTime', 'due_time'),
      rrule: stringField(task, 'rrule'),
      priority: numberField(task, 'priority'),
      isCompleted: Boolean(completedAt),
      listName: projectNames.get(projectId || '') || 'Inbox',
      tags: [],
    };
  });
  const completed = tasks.filter(task => task.isCompleted).length;
  const recurring = tasks.filter(task => Boolean(task.rrule)).length;
  const withDueDate = tasks.filter(task => Boolean(task.dueDate)).length;
  return {
    tasks,
    projects: [...new Set([...projectNames.values()])].sort(),
    tags: data.tags.map(tag => stringField(tag, 'name')).filter((tag): tag is string => Boolean(tag)).sort(),
    stats: { total: tasks.length, completed, recurring, checklists: 0, withDueDate },
  };
}

async function importData(userId: string, preview: NonNullable<ReturnType<typeof parseTickTick>>) {
  return sql.begin(async tx => {
    const projects = await tx<Record<string, unknown>[]>`select id,name from projects where user_id=${userId}`;
    const projectMap = new Map(projects.map(project => [String(project.name), String(project.id)]));
    let projectsCreated = 0;
    for (const name of preview.projects) if (!projectMap.has(name)) {
      const rows = await tx<Record<string, unknown>[]>`insert into projects (id,user_id,name,created_at,updated_at) values (${crypto.randomUUID()},${userId},${name},now(),now()) returning id`;
      projectMap.set(name, String(rows[0].id)); projectsCreated++;
    }
    const tags = await tx<Record<string, unknown>[]>`select id,name from tags where user_id=${userId}`;
    const tagMap = new Map(tags.map(tag => [String(tag.name), String(tag.id)]));
    let tagsCreated = 0;
    for (const name of preview.tags) if (!tagMap.has(name)) {
      const rows = await tx<Record<string, unknown>[]>`insert into tags (id,user_id,name,created_at,updated_at) values (${crypto.randomUUID()},${userId},${name},now(),now()) returning id`;
      tagMap.set(name, String(rows[0].id)); tagsCreated++;
    }
    const taskMap = new Map<string, string>(); let imported = 0;
    for (const task of preview.tasks) {
      const projectId = projectMap.get(task.listName) ?? null;
      let columnId: string | null = null;
      if (projectId && task.columnName) {
        const columns = await tx<Record<string, unknown>[]>`select id from project_columns where project_id=${projectId} and name=${task.columnName} and deleted_at is null limit 1`;
        if (columns[0]) columnId = String(columns[0].id);
        else {
          const created = await tx<Record<string, unknown>[]>`insert into project_columns (id,project_id,name,created_at,updated_at) values (${crypto.randomUUID()},${projectId},${task.columnName},now(),now()) returning id`;
          columnId = String(created[0].id);
        }
      }
      const existing = task.tickTickTaskId ? await tx<Record<string, unknown>[]>`select id from tasks where user_id=${userId} and import_source='ticktick' and external_id=${task.tickTickTaskId} limit 1` : [];
      const id = existing[0]?.id ? String(existing[0].id) : crypto.randomUUID();
      const completedAt = task.isCompleted ? (task.completedAt ? new Date(task.completedAt) : new Date()) : null;
      if (existing[0]) await tx`update tasks set title=${task.title},description=${task.isChecklist ? null : task.content || null},priority=${task.priority},deadline_date=${dateOnly(task.dueDate)},deadline_time=${task.dueTime},start_date=${dateOnly(task.startDate)},rrule=${task.rrule},project_id=${projectId},project_column_id=${columnId},completed_at=${completedAt},updated_at=now(),deleted_at=null where id=${id} and user_id=${userId}`;
      else await tx`insert into tasks (id,user_id,title,description,priority,deadline_date,deadline_time,start_date,rrule,project_id,project_column_id,completed_at,import_source,external_id,created_at,updated_at) values (${id},${userId},${task.title},${task.isChecklist ? null : task.content || null},${task.priority},${dateOnly(task.dueDate)},${task.dueTime},${dateOnly(task.startDate)},${task.rrule},${projectId},${columnId},${completedAt},'ticktick',${task.tickTickTaskId || null},now(),now())`;
      for (const tag of task.tags) { const tagId = tagMap.get(tag); if (tagId) await tx`insert into task_tags (task_id,tag_id,created_at,updated_at) values (${id},${tagId},now(),now()) on conflict (task_id,tag_id) do update set deleted_at=null,updated_at=now()`; }
      if (task.isChecklist) {
        await tx`delete from task_checklist_items where task_id=${id}`;
        for (let index = 0; index < task.checklistItems.length; index++) await tx`insert into task_checklist_items (id,task_id,title,sort_order,created_at,updated_at) values (${crypto.randomUUID()},${id},${task.checklistItems[index]},${index + 1},now(),now())`;
      }
      if (task.tickTickTaskId) taskMap.set(task.tickTickTaskId, id); imported++;
    }
    for (const task of preview.tasks) if (task.tickTickParentId && task.tickTickParentId !== '0') {
      const child = taskMap.get(task.tickTickTaskId); const parent = taskMap.get(task.tickTickParentId);
      if (child && parent) await tx`update tasks set parent_id=${parent},updated_at=now() where id=${child} and user_id=${userId}`;
    }
    return { imported, projectsCreated, tagsCreated };
  });
}

async function importMindoistData(userId: string, data: MindoistData) {
  return sql.begin(async tx => {
    const existingProjects = await tx<JsonRow[]>`select id,name from projects where user_id=${userId} and deleted_at is null`;
    const projectsByName = new Map(existingProjects.map(project => [String(project.name), String(project.id)]));
    const projectIds = new Map<string, string>();
    let projectsCreated = 0;
    for (const project of data.projects) {
      const oldId = stringField(project, 'id');
      const name = stringField(project, 'name') || 'Untitled';
      let id = projectsByName.get(name);
      if (!id) {
        const type = enumField(project, ['DAILY_LOG', 'JOB', 'PERSONAL', 'CUSTOM'] as const, 'type') || 'CUSTOM';
        const rows = await tx<JsonRow[]>`insert into projects (id,user_id,name,color,type,is_archived,calendar_sync_enabled,sort_order,created_at,updated_at) values (${crypto.randomUUID()},${userId},${name},${stringField(project, 'color')},${type},${booleanField(project, 'isArchived', 'is_archived')},${booleanField(project, 'calendarSyncEnabled', 'calendar_sync_enabled')},${numberField(project, 'sortOrder', 'sort_order') ?? 0},now(),now()) returning id`;
        id = String(rows[0].id); projectsByName.set(name, id); projectsCreated++;
      }
      if (oldId) projectIds.set(oldId, id);
    }
    for (const project of data.projects) {
      const id = projectIds.get(stringField(project, 'id') || '');
      const parentId = projectIds.get(stringField(project, 'parentId', 'parent_id') || '');
      if (id && parentId && id !== parentId) await tx`update projects set parent_id=${parentId},updated_at=now() where id=${id} and user_id=${userId}`;
    }

    const projectColumnIds = new Map<string, string>();
    for (const column of data.projectColumns) {
      const projectId = projectIds.get(stringField(column, 'projectId', 'project_id') || '');
      if (!projectId) continue;
      const name = stringField(column, 'name') || 'Untitled';
      const existing = await tx<JsonRow[]>`select id from project_columns where project_id=${projectId} and name=${name} and deleted_at is null limit 1`;
      const id = existing[0]?.id ? String(existing[0].id) : String((await tx<JsonRow[]>`insert into project_columns (id,project_id,name,color,is_done,sort_order,created_at,updated_at) values (${crypto.randomUUID()},${projectId},${name},${stringField(column, 'color') || 'slate'},${booleanField(column, 'isDone', 'is_done')},${numberField(column, 'sortOrder', 'sort_order') ?? 0},now(),now()) returning id`)[0].id);
      const oldId = stringField(column, 'id'); if (oldId) projectColumnIds.set(oldId, id);
    }

    const sectionIds = new Map<string, string>();
    for (const section of data.sections) {
      const projectId = projectIds.get(stringField(section, 'projectId', 'project_id') || '');
      if (!projectId) continue;
      const name = stringField(section, 'name') || 'Untitled';
      const existing = await tx<JsonRow[]>`select id from sections where project_id=${projectId} and name=${name} and deleted_at is null limit 1`;
      const id = existing[0]?.id ? String(existing[0].id) : String((await tx<JsonRow[]>`insert into sections (id,project_id,name,sort_order,created_at,updated_at) values (${crypto.randomUUID()},${projectId},${name},${numberField(section, 'sortOrder', 'sort_order') ?? 0},now(),now()) returning id`)[0].id);
      const oldId = stringField(section, 'id'); if (oldId) sectionIds.set(oldId, id);
    }

    const existingTags = await tx<JsonRow[]>`select id,name from tags where user_id=${userId} and deleted_at is null`;
    const tagsByName = new Map(existingTags.map(tag => [String(tag.name), String(tag.id)]));
    const tagIds = new Map<string, string>();
    let tagsCreated = 0;
    for (const tag of data.tags) {
      const name = stringField(tag, 'name'); if (!name) continue;
      let id = tagsByName.get(name);
      if (!id) {
        const rows = await tx<JsonRow[]>`insert into tags (id,user_id,name,color,created_at,updated_at) values (${crypto.randomUUID()},${userId},${name},${stringField(tag, 'color')},now(),now()) returning id`;
        id = String(rows[0].id); tagsByName.set(name, id); tagsCreated++;
      }
      const oldId = stringField(tag, 'id'); if (oldId) tagIds.set(oldId, id);
    }

    const existingTasks = await tx<JsonRow[]>`select id,external_id from tasks where user_id=${userId} and import_source='mindoist-json'`;
    const taskIds = new Map<string, string>(existingTasks.filter(task => task.external_id).map(task => [String(task.external_id), String(task.id)]));
    let imported = 0;
    for (const task of data.tasks) {
      const oldId = stringField(task, 'id');
      const existingId = oldId ? taskIds.get(oldId) : undefined;
      const id = existingId || crypto.randomUUID();
      const projectId = projectIds.get(stringField(task, 'projectId', 'project_id') || '') || null;
      const projectColumnId = projectColumnIds.get(stringField(task, 'projectColumnId', 'project_column_id') || '') || null;
      const sectionId = sectionIds.get(stringField(task, 'sectionId', 'section_id') || '') || null;
      const dueDate = dateField(task, 'dueDate', 'due_date');
      const deadlineDate = dateField(task, 'deadlineDate', 'deadline_date') || dueDate;
      const completedAt = dateField(task, 'completedAt', 'completed_at');
      const values = {
        title: stringField(task, 'title') || 'Untitled', description: stringField(task, 'description', 'content'),
        color: stringField(task, 'color'), priority: numberField(task, 'priority'), dueDate, dueTime: stringField(task, 'dueTime', 'due_time'),
        deadlineDate, deadlineTime: stringField(task, 'deadlineTime', 'deadline_time', 'dueTime', 'due_time'), deadlineTimeZone: stringField(task, 'deadlineTimeZone', 'deadline_time_zone'),
        startDate: dateField(task, 'startDate', 'start_date'), durationMin: numberField(task, 'durationMin', 'duration_min'), estimateMin: numberField(task, 'estimateMin', 'estimate_min'),
        rrule: stringField(task, 'rrule'), recurringResetMode: enumField(task, ['RESET', 'KEEP'] as const, 'recurringResetMode', 'recurring_reset_mode') || 'RESET',
        recurrenceBasis: enumField(task, ['DUE_DATE', 'COMPLETION_DATE'] as const, 'recurrenceBasis', 'recurrence_basis') || 'DUE_DATE',
        pomodoroCount: Math.max(0, Math.trunc(numberField(task, 'pomodoroCount', 'pomodoro_count') ?? 0)), completedAt,
        sortOrder: numberField(task, 'sortOrder', 'sort_order') ?? 0, snoozedUntil: dateField(task, 'snoozedUntil', 'snoozed_until'),
      };
      if (existingId) await tx`update tasks set title=${values.title},description=${values.description},color=${values.color},priority=${values.priority},due_date=${values.dueDate},due_time=${values.dueTime},deadline_date=${values.deadlineDate},deadline_time=${values.deadlineTime},deadline_time_zone=${values.deadlineTimeZone},start_date=${values.startDate},duration_min=${values.durationMin},estimate_min=${values.estimateMin},rrule=${values.rrule},recurring_reset_mode=${values.recurringResetMode},recurrence_basis=${values.recurrenceBasis},pomodoro_count=${values.pomodoroCount},completed_at=${values.completedAt},sort_order=${values.sortOrder},snoozed_until=${values.snoozedUntil},project_id=${projectId},project_column_id=${projectColumnId},section_id=${sectionId},updated_at=now(),deleted_at=null where id=${id} and user_id=${userId}`;
      else await tx`insert into tasks (id,user_id,project_id,project_column_id,section_id,title,description,color,priority,due_date,due_time,deadline_date,deadline_time,deadline_time_zone,start_date,duration_min,estimate_min,rrule,recurring_reset_mode,recurrence_basis,pomodoro_count,completed_at,sort_order,import_source,external_id,created_at,updated_at) values (${id},${userId},${projectId},${projectColumnId},${sectionId},${values.title},${values.description},${values.color},${values.priority},${values.dueDate},${values.dueTime},${values.deadlineDate},${values.deadlineTime},${values.deadlineTimeZone},${values.startDate},${values.durationMin},${values.estimateMin},${values.rrule},${values.recurringResetMode},${values.recurrenceBasis},${values.pomodoroCount},${values.completedAt},${values.sortOrder},'mindoist-json',${oldId},now(),now())`;
      if (oldId) taskIds.set(oldId, id);
      imported++;
    }
    for (const task of data.tasks) {
      const id = taskIds.get(stringField(task, 'id') || '');
      const parentId = taskIds.get(stringField(task, 'parentId', 'parent_id') || '');
      if (id) await tx`update tasks set parent_id=${parentId || null},updated_at=now() where id=${id} and user_id=${userId}`;
    }

    let taskTagsLinked = 0;
    for (const link of data.taskTags) {
      const taskId = taskIds.get(stringField(link, 'taskId', 'task_id') || '');
      const tagId = tagIds.get(stringField(link, 'tagId', 'tag_id') || '');
      if (!taskId || !tagId) continue;
      await tx`insert into task_tags (task_id,tag_id,created_at,updated_at) values (${taskId},${tagId},now(),now()) on conflict (task_id,tag_id) do update set deleted_at=null,updated_at=now()`;
      taskTagsLinked++;
    }
    let notesImported = 0;
    for (const note of data.notes) {
      const taskId = taskIds.get(stringField(note, 'taskId', 'task_id') || '') || null;
      await tx`insert into notes (id,user_id,task_id,title,content,created_at,updated_at) values (${crypto.randomUUID()},${userId},${taskId},${stringField(note, 'title')},${stringField(note, 'content')},now(),now())`;
      notesImported++;
    }
    const existingCountdowns = await tx<JsonRow[]>`select id,title,target_date from countdowns where user_id=${userId} and deleted_at is null`;
    const countdownIds = new Map(existingCountdowns.map(countdown => [`${String(countdown.title)}\0${new Date(String(countdown.target_date)).toISOString()}`, String(countdown.id)]));
    let countdownsImported = 0;
    for (const countdown of data.countdowns) {
      const title = stringField(countdown, 'title');
      const targetDate = dateField(countdown, 'targetDate', 'target_date');
      if (!title || !targetDate) continue;
      const key = `${title}\0${targetDate.toISOString()}`;
      const existingId = countdownIds.get(key);
      const reminderDaysBefore = numberField(countdown, 'reminderDaysBefore', 'reminder_days_before');
      const safeReminderDaysBefore = reminderDaysBefore !== null && Number.isInteger(reminderDaysBefore) && reminderDaysBefore >= 0 && reminderDaysBefore <= 30 ? reminderDaysBefore : null;
      if (existingId) await tx`update countdowns set title=${title},target_date=${targetDate},color=${stringField(countdown, 'color')},image_url=${stringField(countdown, 'imageUrl', 'image_url')},reminder_days_before=${safeReminderDaysBefore},show_in_calendar=${booleanField(countdown, 'showInCalendar', 'show_in_calendar')},updated_at=now(),notification_sent_at=null,early_notification_sent_at=null,deleted_at=null where id=${existingId} and user_id=${userId}`;
      else {
        const rows = await tx<JsonRow[]>`insert into countdowns (id,user_id,title,target_date,color,image_url,reminder_days_before,show_in_calendar,created_at,updated_at) values (${crypto.randomUUID()},${userId},${title},${targetDate},${stringField(countdown, 'color')},${stringField(countdown, 'imageUrl', 'image_url')},${safeReminderDaysBefore},${booleanField(countdown, 'showInCalendar', 'show_in_calendar')},now(),now()) returning id`;
        countdownIds.set(key, String(rows[0].id));
      }
      countdownsImported++;
    }
    let settingsImported = false;
    if (data.settings) {
      const currentRows = await tx<JsonRow[]>`select pomodoro_work_minutes as "pomodoroWorkMinutes", pomodoro_break_minutes as "pomodoroBreakMinutes", work_hours_per_day as "workHoursPerDay", time_zone as "timeZone" from users where id=${userId} limit 1`;
      const current = currentRows[0] ?? {};
      const work = Math.max(1, Math.min(120, Math.round(numberField(data.settings, 'pomodoroWorkMinutes', 'pomodoro_work_minutes') ?? (Number(current.pomodoroWorkMinutes) || 25))));
      const breakMinutes = Math.max(1, Math.min(60, Math.round(numberField(data.settings, 'pomodoroBreakMinutes', 'pomodoro_break_minutes') ?? (Number(current.pomodoroBreakMinutes) || 5))));
      const workHours = Math.max(1, Math.min(24, Math.round(numberField(data.settings, 'workHoursPerDay', 'work_hours_per_day') ?? (Number(current.workHoursPerDay) || 8))));
      let timeZone = current.timeZone ?? null;
      if (Object.prototype.hasOwnProperty.call(data.settings, 'timeZone') || Object.prototype.hasOwnProperty.call(data.settings, 'time_zone')) {
        const rawTimeZone = field(data.settings, 'timeZone', 'time_zone');
        if (rawTimeZone === null) timeZone = null;
        else if (typeof rawTimeZone === 'string' && validTimeZone(rawTimeZone)) timeZone = rawTimeZone;
      }
      await tx`update users set pomodoro_work_minutes=${work},pomodoro_break_minutes=${breakMinutes},work_hours_per_day=${workHours},time_zone=${timeZone},updated_at=now() where id=${userId}`;
      settingsImported = true;
    }
    return { imported, projectsCreated, tagsCreated, taskTagsLinked, notesImported, countdownsImported, settingsImported, clientSettings: data.clientSettings };
  });
}

async function fileFrom(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    return file instanceof File ? await file.text() : null;
  } catch { return null; }
}

export async function routeImport(path: string, request: Request): Promise<Response | null> {
  const isTickTick = path === '/import/ticktick/preview' || path === '/import/ticktick/confirm';
  const isMindoist = path === '/import/mindoist/preview' || path === '/import/mindoist/confirm';
  if (!isTickTick && !isMindoist) return null;
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const content = await fileFrom(request);
  if (content === null) return json({ error: 'No file uploaded' }, { status: 400 });
  if (content.length > 25 * 1024 * 1024) return json({ error: 'File is too large' }, { status: 413 });
  if (isMindoist) {
    const data = parseMindoistJson(content);
    if (!data) return json({ error: 'Invalid Mindoist JSON' }, { status: 400 });
    if (path.endsWith('/preview')) return json(mindoistPreview(data));
    try { return json(await importMindoistData(auth.user.id, data)); } catch { return json({ error: 'Import failed' }, { status: 400 }); }
  }
  const preview = parseTickTick(content);
  if (!preview) return json({ error: 'Invalid TickTick CSV' }, { status: 400 });
  if (path.endsWith('/preview')) return json(preview);
  try { return json(await importData(auth.user.id, preview)); } catch { return json({ error: 'Import failed' }, { status: 400 }); }
}
