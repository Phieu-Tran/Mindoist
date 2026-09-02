import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

type Row = Record<string, unknown>;
type DraftInput = { transport?: unknown; transportRef?: unknown; kind?: unknown; payload?: unknown; expiresAt?: unknown };

function bad(message: string, status = 400) { return json({ success: false, error: message }, { status }); }
function bodyOf(request: Request): Promise<Record<string, unknown>> { return request.json().catch(() => ({})).then(value => value && typeof value === 'object' ? value as Record<string, unknown> : {}); }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function date(value: unknown) { if (typeof value !== 'string') return null; const result = new Date(value); return Number.isNaN(result.getTime()) ? null : result; }
function uuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value); }
function joinSql(parts: any[]) { let joined = parts[0]; for (let index = 1; index < parts.length; index++) joined = sql`${joined}, ${parts[index]}`; return joined; }
function decodePayload(value: unknown): Record<string, unknown> { if (object(value)) return value; if (typeof value === 'string') { try { const parsed = JSON.parse(value); return object(parsed) ? parsed : {}; } catch { return {}; } } return {}; }
function mapDraft(row: Row) {
  return { id: row.id, userId: row.user_id ?? row.userId, transport: row.transport, transportRef: row.transport_ref ?? row.transportRef,
    kind: row.kind, payload: decodePayload(row.payload), status: row.status, expiresAt: row.expires_at ?? row.expiresAt,
    resultIds: row.result_ids ?? row.resultIds ?? [], createdAt: row.created_at ?? row.createdAt, updatedAt: row.updated_at ?? row.updatedAt };
}

async function ownedRefs(userId: string, payload: Record<string, unknown>) {
  for (const [table, key] of [['projects', 'projectId'], ['sections', 'sectionId']] as const) if (payload[key] !== undefined && payload[key] !== null) {
    if (!uuid(payload[key])) return false;
    const rows = table === 'projects'
      ? await sql`select id from projects where id=${payload[key]} and user_id=${userId} and deleted_at is null limit 1`
      : await sql`select s.id from sections s join projects p on p.id=s.project_id where s.id=${payload[key]} and p.user_id=${userId} and s.deleted_at is null limit 1`;
    if (!rows[0]) return false;
  }
  if (payload.parentId !== undefined && payload.parentId !== null) {
    if (!uuid(payload.parentId) || !(await sql`select id from tasks where id=${payload.parentId} and user_id=${userId} and deleted_at is null limit 1`)[0]) return false;
  }
  if (Array.isArray(payload.tagIds) && payload.tagIds.length) {
    if (payload.tagIds.some(value => !uuid(value))) return false;
    const rows = await sql`select id from tags where user_id=${userId} and deleted_at is null and id in ${sql(payload.tagIds as string[])}`;
    if (rows.length !== payload.tagIds.length) return false;
  }
  return true;
}

function taskFields(payload: Record<string, unknown>) {
  const deadline = object(payload.deadline) ? payload.deadline : null;
  const fields: Array<[string, unknown]> = [];
  if (payload.title !== undefined) fields.push(['title', payload.title]);
  if (payload.description !== undefined) fields.push(['description', payload.description ?? null]);
  if (payload.color !== undefined) fields.push(['color', payload.color ?? null]);
  if (payload.projectId !== undefined) fields.push(['project_id', payload.projectId ?? null]);
  if (payload.projectColumnId !== undefined) fields.push(['project_column_id', payload.projectColumnId ?? null]);
  if (payload.sectionId !== undefined) fields.push(['section_id', payload.sectionId ?? null]);
  if (payload.parentId !== undefined) fields.push(['parent_id', payload.parentId ?? null]);
  if (payload.priority !== undefined) fields.push(['priority', payload.priority ?? null]);
  if (payload.startDate !== undefined) fields.push(['start_date', payload.startDate ? new Date(String(payload.startDate)) : null]);
  if (payload.estimateMin !== undefined) fields.push(['estimate_min', payload.estimateMin ?? null]);
  if (payload.rrule !== undefined) fields.push(['rrule', payload.rrule ?? null]);
  if (deadline) {
    fields.push(['deadline_date', new Date(`${deadline.date}T00:00:00.000Z`)]);
    fields.push(['deadline_time', deadline.time ?? null]);
    fields.push(['deadline_time_zone', deadline.time ? deadline.timeZone ?? null : null]);
  } else if (payload.deadline === null) {
    fields.push(['deadline_date', null], ['deadline_time', null], ['deadline_time_zone', null]);
  }
  return fields;
}

async function createTask(tx: any, userId: string, payload: Record<string, unknown>) {
  if (typeof payload.title !== 'string' || !payload.title.trim() || !await ownedRefs(userId, payload)) throw new Error('Invalid draft references');
  const fields = taskFields(payload).filter(field => field[0] !== 'title'); const names = ['id', 'user_id', 'title', ...fields.map(field => field[0]), 'created_at', 'updated_at'];
  const values: unknown[] = [crypto.randomUUID(), userId, payload.title.trim(), ...fields.map(field => field[1]), new Date(), new Date()];
  const placeholders = values.map(value => value === null ? sql`null` : sql`${value}`);
  const cols = names.map(name => sql(name));
  const row = await tx<Row[]>`insert into tasks (${joinSql(cols)}) values (${joinSql(placeholders)}) returning id`;
  const taskId = String(row[0].id);
  if (Array.isArray(payload.tagIds)) for (const tagId of payload.tagIds) await tx`insert into task_tags (task_id,tag_id,created_at,updated_at) values (${taskId},${tagId},now(),now()) on conflict (task_id,tag_id) do update set deleted_at=null,updated_at=now()`;
  if (object(payload.plannedTime)) {
    const startAt = date(payload.plannedTime.startAt); const endAt = date(payload.plannedTime.endAt);
    if (!startAt || !endAt || startAt >= endAt || typeof payload.plannedTime.timeZone !== 'string') throw new Error('Invalid planned time');
    const block = await tx<Row[]>`insert into time_blocks (id,user_id,task_id,start_at,end_at,time_zone,all_day,source,created_at,updated_at) values (${crypto.randomUUID()},${userId},${taskId},${startAt},${endAt},${payload.plannedTime.timeZone},${payload.plannedTime.allDay ?? false},'MANUAL'::"TimeBlockSource",now(),now()) returning id`;
    return [taskId, String(block[0].id)];
  }
  return [taskId];
}

async function confirm(userId: string, id: string) {
  return sql.begin(async tx => {
    const rows = await tx<Row[]>`select * from agent_drafts where id=${id} and user_id=${userId} limit 1`;
    const draft = rows[0]; if (!draft) throw Object.assign(new Error('Draft not found'), { status: 404 });
    if (draft.status === 'CONFIRMED') return mapDraft(draft);
    if (draft.status !== 'PENDING') throw Object.assign(new Error(`Draft is ${String(draft.status).toLowerCase()}`), { status: 409 });
    if (new Date(String(draft.expires_at)).getTime() <= Date.now()) {
      const expired = await tx<Row[]>`update agent_drafts set status='EXPIRED'::"AgentDraftStatus",updated_at=now() where id=${id} returning *`;
      throw Object.assign(new Error('Draft expired'), { status: 410, draft: mapDraft(expired[0]) });
    }
    const payload = decodePayload(draft.payload);
    let resultIds: string[] = [];
    if (draft.kind === 'CREATE_TASK') resultIds = await createTask(tx, userId, payload);
    else if (draft.kind === 'CREATE_TASK_BATCH' && Array.isArray(payload.tasks)) { for (const task of payload.tasks) if (object(task)) resultIds.push(...await createTask(tx, userId, task)); }
    else if (draft.kind === 'EDIT_TASK') {
      if (!uuid(payload.taskId) || !object(payload.patch) || !(await tx`select id from tasks where id=${payload.taskId} and user_id=${userId} and deleted_at is null limit 1`)[0]) throw Object.assign(new Error('Task not found'), { status: 404 });
      const fields = taskFields(payload.patch); if (fields.length) await tx`update tasks set ${joinSql(fields.map(([column, value]) => sql`${sql(column)}=${value}`))},updated_at=now() where id=${payload.taskId} and user_id=${userId}`;
      resultIds = [String(payload.taskId)];
    } else if (draft.kind === 'RESCHEDULE') {
      if (!uuid(payload.taskId) || !object(payload.plannedTime)) throw Object.assign(new Error('Invalid draft payload'), { status: 400 });
      const planned = payload.plannedTime; const startAt = date(planned.startAt); const endAt = date(planned.endAt); if (!startAt || !endAt || startAt >= endAt) throw Object.assign(new Error('Invalid planned time'), { status: 400 });
      if (payload.timeBlockId) { const updated = await tx`update time_blocks set start_at=${startAt},end_at=${endAt},time_zone=${planned.timeZone},all_day=${planned.allDay ?? false},updated_at=now() where id=${payload.timeBlockId} and task_id=${payload.taskId} and user_id=${userId} and deleted_at is null returning id`; if (!updated[0]) throw Object.assign(new Error('Time block not found'), { status: 404 }); resultIds = [String(payload.timeBlockId)]; }
      else { const created = await tx<Row[]>`insert into time_blocks (id,user_id,task_id,start_at,end_at,time_zone,all_day,source,created_at,updated_at) values (${crypto.randomUUID()},${userId},${payload.taskId},${startAt},${endAt},${planned.timeZone},${planned.allDay ?? false},'MANUAL'::"TimeBlockSource",now(),now()) returning id`; resultIds = [String(created[0].id)]; }
    } else throw Object.assign(new Error('Draft payload is invalid'), { status: 400 });
    const updated = await tx<Row[]>`update agent_drafts set status='CONFIRMED'::"AgentDraftStatus",result_ids=${sql.array(resultIds)},updated_at=now() where id=${id} and user_id=${userId} returning *`;
    return mapDraft(updated[0]);
  });
}

export async function routeAgentDrafts(path: string, request: Request): Promise<Response | null> {
  if (!/^\/agent\/drafts(?:\/|$)/.test(path)) return null;
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  if (path === '/agent/drafts' && request.method === 'GET') {
    const rows = await sql<Row[]>`select * from agent_drafts where user_id=${userId} and status='PENDING'::"AgentDraftStatus" and expires_at > now() order by created_at desc`;
    return json({ success: true, data: rows.map(mapDraft) });
  }
  if (path === '/agent/drafts' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (!['TELEGRAM', 'MCP', 'WEB'].includes(String(input.transport)) || !['CREATE_TASK', 'CREATE_TASK_BATCH', 'EDIT_TASK', 'RESCHEDULE'].includes(String(input.kind)) || !object(input.payload)) return bad('Invalid draft');
    const expires = input.expiresAt === undefined ? new Date(Date.now() + 15 * 60_000) : date(input.expiresAt); if (!expires) return bad('Invalid draft');
    const rows = await sql<Row[]>`insert into agent_drafts (id,user_id,transport,transport_ref,kind,payload,status,expires_at,result_ids,created_at,updated_at) values (${crypto.randomUUID()},${userId},${input.transport},${input.transportRef ?? null},${input.kind}::"AgentDraftKind",${JSON.stringify(input.payload)},'PENDING'::"AgentDraftStatus",${expires},${sql.array([])},now(),now()) returning *`;
    return json({ success: true, data: mapDraft(rows[0]) }, { status: 201 });
  }
  const match = path.match(/^\/agent\/drafts\/([^/]+)(?:\/(confirm|cancel))?$/); if (!match) return null;
  const draft = await sql<Row[]>`select * from agent_drafts where id=${match[1]} and user_id=${userId} limit 1`; if (!draft[0]) return bad('Draft not found', 404);
  if (!match[2] && request.method === 'GET') return json({ success: true, data: mapDraft(draft[0]) });
  try {
    if (match[2] === 'cancel' && request.method === 'POST') {
      if (draft[0].status === 'CONFIRMED') return bad('Confirmed draft cannot be cancelled', 409);
      const rows = await sql<Row[]>`update agent_drafts set status='CANCELLED'::"AgentDraftStatus",updated_at=now() where id=${match[1]} and user_id=${userId} returning *`; return json({ success: true, data: mapDraft(rows[0]) });
    }
    if (match[2] === 'confirm' && request.method === 'POST') {
      const result = await confirm(userId, match[1]); return json({ success: true, data: result });
    }
  } catch (cause) {
    const failure = cause as { status?: number; draft?: Row; message?: string }; return json({ success: false, error: failure.message || 'Draft failed', ...(failure.draft ? { data: failure.draft } : {}) }, { status: failure.status || 400 });
  }
  return bad('Method not allowed', 405);
}
