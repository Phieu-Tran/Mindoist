import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';
import { getGoogleAccessToken } from './gcal.ts';

type Row = Record<string, unknown>;
const FOLDER = 'Mindoist';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function fail(message: string, status = 400) { return json({ success: false, error: message }, { status }); }
function mapDate(value: unknown) { return value instanceof Date ? value.toISOString() : value; }

async function driveFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(path.startsWith('http') ? path : `${DRIVE_API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
  return response;
}

async function folderId(token: string) {
  const query = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const response = await driveFetch(`/files?q=${query}&fields=files(id)&spaces=drive`, token);
  const files = await response.json() as { files?: Array<{ id?: string }> };
  if (files.files?.[0]?.id) return files.files[0].id;
  const created = await driveFetch('/files?fields=id', token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
  const value = await created.json() as { id?: string }; if (!value.id) throw new Error('Google Drive did not return a folder id'); return value.id;
}

async function exportData(userId: string) {
  const [tasks, projects, columns, sections, tags, taskTags, notes] = await Promise.all([
    sql<Row[]>`select * from tasks where user_id=${userId} and deleted_at is null order by created_at asc`,
    sql<Row[]>`select * from projects where user_id=${userId} and deleted_at is null order by created_at asc`,
    sql<Row[]>`select pc.* from project_columns pc join projects p on p.id=pc.project_id where p.user_id=${userId} and pc.deleted_at is null order by pc.created_at asc`,
    sql<Row[]>`select s.* from sections s join projects p on p.id=s.project_id where p.user_id=${userId} and s.deleted_at is null order by s.created_at asc`,
    sql<Row[]>`select * from tags where user_id=${userId} and deleted_at is null order by created_at asc`,
    sql<Row[]>`select tt.* from task_tags tt join tasks t on t.id=tt.task_id where t.user_id=${userId} and tt.deleted_at is null order by tt.created_at asc`,
    sql<Row[]>`select * from notes where user_id=${userId} and deleted_at is null order by created_at asc`,
  ]);
  return { schema: 1, exportedAt: new Date().toISOString(), tasks, projects, projectColumns: columns, sections, tags, taskTags, notes };
}

async function backupFileInFolder(token: string, parentId: string, fileId: string) {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,trashed`, token);
  const file = await response.json() as Row; return file.id && file.mimeType === 'application/json' && file.trashed !== true && Array.isArray(file.parents) && file.parents.includes(parentId) ? file : null;
}

async function restore(userId: string, data: Row) {
  return sql.begin(async tx => {
    await tx`delete from notes where user_id=${userId}`;
    await tx`delete from task_tags where task_id in (select id from tasks where user_id=${userId})`;
    await tx`delete from task_checklist_items where task_id in (select id from tasks where user_id=${userId})`;
    await tx`delete from reminders where task_id in (select id from tasks where user_id=${userId})`;
    await tx`delete from time_blocks where user_id=${userId}`;
    await tx`delete from tasks where user_id=${userId}`;
    await tx`delete from sections where project_id in (select id from projects where user_id=${userId})`;
    await tx`delete from project_columns where project_id in (select id from projects where user_id=${userId})`;
    await tx`delete from projects where user_id=${userId}`;
    await tx`delete from tags where user_id=${userId}`;
    const projects = Array.isArray(data.projects) ? data.projects as Row[] : []; const projectIds = new Set<string>();
    for (const project of projects) { if (typeof project.id !== 'string' || typeof project.name !== 'string') continue; projectIds.add(project.id); await tx`insert into projects (id,user_id,parent_id,area_id,name,color,type,is_archived,calendar_sync_enabled,sort_order,created_at,updated_at) values (${project.id},${userId},${project.parent_id ?? null},${project.area_id ?? null},${project.name},${project.color ?? null},${project.type ?? 'CUSTOM'}::"ProjectType",${project.is_archived ?? false},${project.calendar_sync_enabled ?? false},${project.sort_order ?? 0},${project.created_at ? new Date(String(project.created_at)) : new Date()},now())`; }
    const columns = Array.isArray(data.projectColumns) ? data.projectColumns as Row[] : [];
    for (const column of columns) if (typeof column.id === 'string' && projectIds.has(String(column.project_id))) await tx`insert into project_columns (id,project_id,name,color,is_done,sort_order,created_at,updated_at) values (${column.id},${column.project_id},${column.name},${column.color ?? 'slate'},${column.is_done ?? false},${column.sort_order ?? 0},${column.created_at ? new Date(String(column.created_at)) : new Date()},now())`;
    const sections = Array.isArray(data.sections) ? data.sections as Row[] : [];
    for (const section of sections) if (typeof section.id === 'string' && projectIds.has(String(section.project_id))) await tx`insert into sections (id,project_id,name,sort_order,created_at,updated_at) values (${section.id},${section.project_id},${section.name},${section.sort_order ?? 0},${section.created_at ? new Date(String(section.created_at)) : new Date()},now())`;
    const tags = Array.isArray(data.tags) ? data.tags as Row[] : []; const tagIds = new Set<string>();
    for (const tag of tags) if (typeof tag.id === 'string' && typeof tag.name === 'string') { tagIds.add(tag.id); await tx`insert into tags (id,user_id,name,color,created_at,updated_at) values (${tag.id},${userId},${tag.name},${tag.color ?? null},${tag.created_at ? new Date(String(tag.created_at)) : new Date()},now())`; }
    const tasks = Array.isArray(data.tasks) ? data.tasks as Row[] : []; const taskIds = new Set<string>();
    for (const task of tasks) if (typeof task.id === 'string' && typeof task.title === 'string') { taskIds.add(task.id); await tx`insert into tasks (id,user_id,project_id,project_column_id,section_id,parent_id,title,description,color,priority,deadline_date,deadline_time,deadline_time_zone,start_date,estimate_min,rrule,pomodoro_count,completed_at,sort_order,created_at,updated_at) values (${task.id},${userId},${projectIds.has(String(task.project_id)) ? task.project_id : null},${task.project_column_id ?? null},${task.section_id ?? null},null,${task.title},${task.description ?? null},${task.color ?? null},${task.priority ?? null},${task.deadline_date ? new Date(String(task.deadline_date)) : null},${task.deadline_time ?? null},${task.deadline_time_zone ?? null},${task.start_date ? new Date(String(task.start_date)) : null},${task.estimate_min ?? null},${task.rrule ?? null},${task.pomodoro_count ?? 0},${task.completed_at ? new Date(String(task.completed_at)) : null},${task.sort_order ?? 0},${task.created_at ? new Date(String(task.created_at)) : new Date()},now())`; }
    for (const task of tasks) if (taskIds.has(String(task.id)) && task.parent_id && taskIds.has(String(task.parent_id))) await tx`update tasks set parent_id=${task.parent_id},updated_at=now() where id=${task.id} and user_id=${userId}`;
    const taskTags = Array.isArray(data.taskTags) ? data.taskTags as Row[] : []; for (const link of taskTags) if (taskIds.has(String(link.task_id)) && tagIds.has(String(link.tag_id))) await tx`insert into task_tags (task_id,tag_id,created_at,updated_at) values (${link.task_id},${link.tag_id},now(),now()) on conflict (task_id,tag_id) do nothing`;
    const notes = Array.isArray(data.notes) ? data.notes as Row[] : []; for (const note of notes) if (typeof note.id === 'string') await tx`insert into notes (id,user_id,task_id,title,content,created_at,updated_at) values (${note.id},${userId},${taskIds.has(String(note.task_id)) ? note.task_id : null},${note.title ?? null},${note.content ?? null},${note.created_at ? new Date(String(note.created_at)) : new Date()},now())`;
    return { tasks: taskIds.size, projects: projectIds.size, sections: sections.filter(section => projectIds.has(String(section.project_id))).length, tags: tagIds.size, notes: notes.length };
  });
}

export async function routeDrive(path: string, request: Request): Promise<Response | null> {
  if (!/^\/drive\//.test(path)) return null;
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const token = await getGoogleAccessToken(auth.user.id);
  if (path === '/drive/backups' && request.method === 'GET') {
    if (!token) return json({ success: true, data: [] });
    try { const parent = await folderId(token); const query = encodeURIComponent(`'${parent}' in parents and mimeType='application/json' and trashed=false`); const response = await driveFetch(`/files?q=${query}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&spaces=drive`, token); const data = await response.json() as { files?: Row[] }; return json({ success: true, data: (data.files || []).map(file => ({ fileId: file.id, fileName: file.name || '', sizeBytes: Number(file.size) || 0, createdAt: file.createdTime || '' })) }); } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Failed to list backups', 500); }
  }
  if (path === '/drive/backup' && request.method === 'POST') {
    if (!token) return fail('Google account not connected. Please connect Google first.');
    try { const parent = await folderId(token); const data = await exportData(auth.user.id); const content = JSON.stringify(data, null, 2); const fileName = `backup-${data.exportedAt.replace(/[:.]/g, '-')}.json`; const boundary = `mindoist_${crypto.randomUUID()}`; const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [parent], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`; const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', token, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body }); const result = await response.json() as { id?: string }; return json({ success: true, data: { fileId: result.id, fileName, sizeBytes: new TextEncoder().encode(content).byteLength, exportedAt: data.exportedAt } }); } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Backup failed', 500); }
  }
  const restoreMatch = path.match(/^\/drive\/restore\/([^/]+)$/);
  const backupMatch = path.match(/^\/drive\/backup\/([^/]+)$/);
  const match = restoreMatch ?? backupMatch; if (!match) return null;
  if (!token) return fail('Google account not connected.');
  try { const parent = await folderId(token); const owned = await backupFileInFolder(token, parent, match[1]); if (!owned) return fail('Backup file not found', 404);
    if (backupMatch && request.method === 'DELETE') { await driveFetch(`/files/${encodeURIComponent(match[1])}`, token, { method: 'DELETE' }); return json({ success: true }); }
    if (restoreMatch && request.method === 'POST') { const response = await driveFetch(`/files/${encodeURIComponent(match[1])}?alt=media`, token); const data = await response.json() as Row; if (data.schema !== 1 || !data.exportedAt) return fail('Invalid backup file format'); return json({ success: true, data: await restore(auth.user.id, data) }); }
  } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Drive operation failed', 500); }
  return fail('Method not allowed', 405);
}
