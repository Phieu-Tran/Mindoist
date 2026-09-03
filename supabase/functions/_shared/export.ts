import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

type Row = Record<string, unknown>;

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function csvCell(value: unknown) {
  const valueText = text(value);
  return /[,"\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText;
}

function download(body: string, contentType: string, fileName: string) {
  return new Response(body, { status: 200, headers: {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${fileName}"`,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-api-key, content-type, x-job-secret',
  } });
}

export async function routeExport(path: string, request: Request): Promise<Response | null> {
  if (path !== '/export/json' && path !== '/export/csv') return null;
  if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  const stamp = new Date().toISOString().slice(0, 10);
  if (path === '/export/json') {
    const [tasks, projects, notes, tags, sections, projectColumns, taskTags, countdowns, settings] = await Promise.all([
      sql<Row[]>`select * from tasks where user_id=${userId} and deleted_at is null order by created_at asc`,
      sql<Row[]>`select * from projects where user_id=${userId} and deleted_at is null order by created_at asc`,
      sql<Row[]>`select * from notes where user_id=${userId} and deleted_at is null order by created_at asc`,
      sql<Row[]>`select * from tags where user_id=${userId} and deleted_at is null order by created_at asc`,
      sql<Row[]>`select s.* from sections s join projects p on p.id=s.project_id where p.user_id=${userId} and s.deleted_at is null order by s.created_at asc`,
      sql<Row[]>`select pc.* from project_columns pc join projects p on p.id=pc.project_id where p.user_id=${userId} and pc.deleted_at is null order by pc.created_at asc`,
      sql<Row[]>`select tt.* from task_tags tt join tasks t on t.id=tt.task_id where t.user_id=${userId} and tt.deleted_at is null and t.deleted_at is null order by tt.created_at asc`,
      sql<Row[]>`select * from countdowns where user_id=${userId} and deleted_at is null order by target_date asc`,
      sql<Row[]>`select pomodoro_work_minutes as "pomodoroWorkMinutes", pomodoro_break_minutes as "pomodoroBreakMinutes", work_hours_per_day as "workHoursPerDay", time_zone as "timeZone" from users where id=${userId} limit 1`,
    ]);
    return download(JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), tasks, projects, notes, tags, sections, projectColumns, taskTags, countdowns, settings: settings[0] ?? null }, null, 2), 'application/json; charset=utf-8', `mindoist-export-${stamp}.json`);
  }
  const tasks = await sql<Row[]>`
    select t.id,t.title,t.description,t.priority,t.deadline_date as "deadlineDate",t.deadline_time as "deadlineTime",
      t.start_date as "startDate",t.estimate_min as "estimateMin",t.completed_at as "completedAt",t.deleted_at as "deletedAt",
      t.rrule,t.color,t.project_id as "projectId",p.name as "projectName",t.parent_id as "parentId",t.created_at as "createdAt",t.updated_at as "updatedAt"
    from tasks t left join projects p on p.id=t.project_id where t.user_id=${userId} and t.deleted_at is null order by t.created_at asc
  `;
  const header = ['id', 'title', 'description', 'priority', 'dueDate', 'dueTime', 'startDate', 'durationMin', 'completedAt', 'deletedAt', 'rrule', 'color', 'projectId', 'projectName', 'parentId', 'createdAt', 'updatedAt'];
  const rows = tasks.map(task => [
    task.id, task.title, task.description, task.priority, task.deadlineDate, task.deadlineTime, task.startDate, task.estimateMin,
    task.completedAt, task.deletedAt, task.rrule, task.color, task.projectId, task.projectName, task.parentId, task.createdAt, task.updatedAt,
  ].map(csvCell).join(','));
  return download([header.join(','), ...rows].join('\n'), 'text/csv; charset=utf-8', `mindoist-tasks-${stamp}.csv`);
}
