import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

export async function routeReminders(path: string, request: Request): Promise<Response | null> {
  if (path !== '/reminders/upcoming') return null;
  if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const requested = Number(new URL(request.url).searchParams.get('days'));
  const days = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 90) : 30;
  const now = new Date(); const from = new Date(now.getTime() - 60 * 60 * 1000); const to = new Date(now.getTime() + days * 86400000);
  const rows = await sql<Record<string, unknown>[]>`
    select r.id,r.remind_at as "remindAt",t.id as "taskId",t.title as "taskTitle"
    from reminders r join tasks t on t.id=r.task_id
    where r.is_sent=false and r.type='push'::"ReminderType" and r.remind_at >= ${from} and r.remind_at <= ${to}
      and t.user_id=${auth.user.id} and t.completed_at is null and t.deleted_at is null
    order by r.remind_at asc limit 200
  `;
  return json({ success: true, data: rows.map(row => ({ ...row, remindAt: row.remindAt instanceof Date ? row.remindAt.toISOString() : row.remindAt })) });
}
