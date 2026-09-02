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

async function fileFrom(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    return file instanceof File ? await file.text() : null;
  } catch { return null; }
}

export async function routeImport(path: string, request: Request): Promise<Response | null> {
  if (path !== '/import/ticktick/preview' && path !== '/import/ticktick/confirm') return null;
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const csv = await fileFrom(request);
  if (csv === null) return json({ error: 'No file uploaded' }, { status: 400 });
  if (csv.length > 25 * 1024 * 1024) return json({ error: 'File is too large' }, { status: 413 });
  const preview = parseTickTick(csv);
  if (!preview) return json({ error: 'Invalid TickTick CSV' }, { status: 400 });
  if (path.endsWith('/preview')) return json(preview);
  try { return json(await importData(auth.user.id, preview)); } catch { return json({ error: 'Import failed' }, { status: 400 }); }
}
