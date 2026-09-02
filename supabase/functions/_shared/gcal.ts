import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.file'];
const CALENDAR_NAME = 'Mindoist';

type Row = Record<string, unknown>;

function configured() {
  return Boolean(Deno.env.get('GOOGLE_CLIENT_ID') && Deno.env.get('GOOGLE_CLIENT_SECRET'));
}

function redirectUri() {
  return Deno.env.get('GOOGLE_REDIRECT_URI') || 'http://localhost:3000/gcal/callback';
}

function frontendUrl() {
  return Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
}

function mapRows(rows: Row[]) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key, value instanceof Date ? value.toISOString() : value,
  ])));
}

function bodyOf(request: Request): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({})).then(value => value && typeof value === 'object' ? value as Record<string, unknown> : {});
}

function error(message: string, status = 400) {
  return json({ success: false, error: message }, { status });
}

function encode(value: string) { return encodeURIComponent(value); }

function authUrl(userId: string) {
  if (!configured()) return null;
  const params = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state: userId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code: string) {
  if (!configured()) throw new Error('Google OAuth is not configured');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const tokens = await response.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
  return tokens.refresh_token;
}

async function accountForUser(userId: string) {
  const rows = await sql<Row[]>`select user_id as "userId", refresh_token as "refreshToken", sync_token as "syncToken" from google_accounts where user_id=${userId} limit 1`;
  return rows[0] ?? null;
}

export async function getGoogleAccessToken(userId: string) {
  const account = await accountForUser(userId);
  if (!account?.refreshToken || !configured()) return null;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: String(account.refreshToken),
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) return null;
  const tokens = await response.json() as { access_token?: string };
  return tokens.access_token ?? null;
}

async function googleFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Google Calendar request failed (${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function ensureCalendar(token: string, userId: string) {
  const list = await googleFetch('/users/me/calendarList?maxResults=250', token);
  const calendars = Array.isArray(list.items) ? list.items as Row[] : [];
  const existing = calendars.find(calendar => calendar.summary === CALENDAR_NAME && typeof calendar.id === 'string');
  const externalId = existing?.id as string | undefined;
  let id = externalId;
  if (!id) {
    const created = await googleFetch('/calendars', token, { method: 'POST', body: JSON.stringify({ summary: CALENDAR_NAME }) });
    id = String(created.id || '');
  }
  if (!id) throw new Error('Google did not return a calendar id');
  const rows = await sql<Row[]>`
    insert into external_calendars (id,user_id,provider,external_calendar_id,name,color,time_zone,is_visible,is_read_only,created_at,updated_at)
    values (${crypto.randomUUID()},${userId},'GOOGLE'::"CalendarProvider",${id},${CALENDAR_NAME},${existing?.backgroundColor ?? null},${existing?.timeZone ?? null},true,false,now(),now())
    on conflict (user_id,provider,external_calendar_id) do update set name=excluded.name,color=excluded.color,time_zone=excluded.time_zone,deleted_at=null,updated_at=now()
    returning id, external_calendar_id as "externalCalendarId"
  `;
  return { id, databaseId: String(rows[0]?.id ?? '') };
}

async function syncTimeBlocks(userId: string) {
  const token = await getGoogleAccessToken(userId);
  if (!token) return 0;
  const calendar = await ensureCalendar(token, userId);
  const blocks = await sql<Row[]>`
    select b.id, b.start_at as "startAt", b.end_at as "endAt", b.time_zone as "timeZone", t.id as "taskId", t.title
    from time_blocks b join tasks t on t.id=b.task_id
    where b.user_id=${userId} and b.deleted_at is null and t.deleted_at is null
    order by b.start_at asc
  `;
  let synced = 0;
  for (const block of blocks) {
    const links = await sql<Row[]>`select external_event_id as "externalEventId", etag from external_event_links where time_block_id=${block.id} and external_calendar_id=${calendar.databaseId} limit 1`;
    const event = {
      summary: String(block.title),
      description: `Mindoist planned time · ${block.taskId} · ${block.id}`,
      start: { dateTime: new Date(String(block.startAt)).toISOString(), timeZone: String(block.timeZone) },
      end: { dateTime: new Date(String(block.endAt)).toISOString(), timeZone: String(block.timeZone) },
      extendedProperties: { private: { mindoistTaskId: String(block.taskId), mindoistTimeBlockId: String(block.id) } },
    };
    let result: Row;
    if (links[0]?.externalEventId) {
      result = await googleFetch(`/calendars/${encode(calendar.id)}/events/${encode(String(links[0].externalEventId))}`, token, {
        method: 'PUT', body: JSON.stringify(event), headers: links[0].etag ? { 'if-match': String(links[0].etag) } : undefined,
      });
    } else {
      result = await googleFetch(`/calendars/${encode(calendar.id)}/events`, token, { method: 'POST', body: JSON.stringify(event) });
    }
    if (!result.id) continue;
    await sql`
      insert into external_event_links (id,user_id,external_calendar_id,external_event_id,time_block_id,etag,last_synced_at,created_at,updated_at)
      values (${crypto.randomUUID()},${userId},${calendar.databaseId},${result.id},${block.id},${result.etag ?? null},now(),now(),now())
      on conflict (external_calendar_id,time_block_id) do update set external_event_id=excluded.external_event_id,etag=excluded.etag,last_synced_at=now(),updated_at=now()
    `;
    synced++;
  }
  return synced;
}

async function listEvents(userId: string, from?: string, to?: string) {
  const token = await getGoogleAccessToken(userId);
  if (!token) return [];
  try {
    const list = await googleFetch('/users/me/calendarList?maxResults=250', token);
    const calendars = (Array.isArray(list.items) ? list.items as Row[] : []).filter(calendar => calendar.id && !calendar.deleted && !calendar.hidden && calendar.selected !== false);
    const ownedRows = await sql<Row[]>`
      select external_event_id as "externalEventId", external_calendar_id as "externalCalendarId" from external_event_links where user_id=${userId}
    `;
    const owned = new Set(ownedRows.map(row => `${row.externalCalendarId}:${row.externalEventId}`));
    const timeMin = from || new Date(Date.now() - 30 * 86400000).toISOString();
    const timeMax = to || new Date(Date.now() + 90 * 86400000).toISOString();
    const events: Row[] = [];
    for (const calendar of calendars) {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const result = await googleFetch(`/calendars/${encode(String(calendar.id))}/events?${params}`, token);
      for (const event of (Array.isArray(result.items) ? result.items as Row[] : [])) {
        if (!event.id || event.status === 'cancelled' || owned.has(`${calendar.id}:${event.id}`)) continue;
        const start = (event.start as Row | undefined)?.dateTime || (event.start as Row | undefined)?.date;
        if (!start) continue;
        events.push({ id: `${calendar.id}:${event.id}`, title: event.summary || '(untitled)', start, end: (event.end as Row | undefined)?.dateTime || (event.end as Row | undefined)?.date || '', description: event.description || undefined });
      }
    }
    return events.sort((left, right) => String(left.start).localeCompare(String(right.start)));
  } catch { return []; }
}

async function providerId(path: string) {
  const match = path.match(/^\/calendar\/providers\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export async function routeGcal(path: string, request: Request): Promise<Response | null> {
  if (path === '/gcal/callback' && request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return error('Missing code or state');
    try {
      const users = await sql<{ id: string }[]>`select id from users where id=${state} limit 1`;
      if (!users[0]) throw new Error('Invalid OAuth state');
      const refreshToken = await exchangeCode(code);
      await sql`
        insert into google_accounts (user_id,refresh_token,created_at,updated_at) values (${state},${refreshToken},now(),now())
        on conflict (user_id) do update set refresh_token=excluded.refresh_token,updated_at=now()
      `;
      return Response.redirect(`${frontendUrl()}?gcal=connected`, 302);
    } catch { return Response.redirect(`${frontendUrl()}?gcal=error`, 302); }
  }
  if (path === '/gcal/webhook' && request.method === 'POST') return json({ success: true });

  if (path === '/calendar/providers' && request.method === 'GET') {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;
    return json({ success: true, data: [{ id: 'google', connected: Boolean((await accountForUser(auth.user.id))?.refreshToken) }] });
  }

  const genericProvider = await providerId(path);
  const isGeneric = genericProvider !== null;
  if (isGeneric && genericProvider !== 'google') return error('Calendar provider not found', 404);
  if (!isGeneric && !path.startsWith('/gcal/')) return null;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  const suffix = isGeneric ? path.replace(/^\/calendar\/providers\/google/, '') : path.replace(/^\/gcal/, '');
  if ((suffix === '/auth-url' || suffix === '/status' || suffix === '/disconnect' || suffix === '/sync' || suffix === '/events' || suffix === '/sync-logs') && request.method === 'GET' && suffix !== '/auth-url' && suffix !== '/status' && suffix !== '/events' && suffix !== '/sync-logs') return error('Method not allowed', 405);

  if (suffix === '/auth-url') {
    if (request.method !== 'GET') return error('Method not allowed', 405);
    const url = authUrl(userId);
    return url ? json({ success: true, data: { url } }) : error('Google OAuth is not configured', 503);
  }
  if (suffix === '/status') {
    if (request.method !== 'GET') return error('Method not allowed', 405);
    return json({ success: true, data: { connected: Boolean((await accountForUser(userId))?.refreshToken) } });
  }
  if (suffix === '/disconnect') {
    if (request.method !== 'POST') return error('Method not allowed', 405);
    await sql`delete from google_accounts where user_id=${userId}`;
    return json({ success: true });
  }
  if (suffix === '/events') {
    if (request.method !== 'GET') return error('Method not allowed', 405);
    const params = new URL(request.url).searchParams;
    return json({ success: true, data: await listEvents(userId, params.get('timeMin') || params.get('from') || undefined, params.get('timeMax') || params.get('to') || undefined) });
  }
  if (suffix === '/sync') {
    if (request.method !== 'POST') return error('Method not allowed', 405);
    if (!configured()) return error('Google OAuth is not configured', 503);
    try {
      const timeBlocksSynced = await syncTimeBlocks(userId);
      return json({ success: true, data: { tasksSynced: 0, timeBlocksSynced } });
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : 'Google sync failed', 502);
    }
  }
  if (suffix === '/sync-logs') {
    if (request.method !== 'GET') return error('Method not allowed', 405);
    const rows = await sql<Row[]>`select id,user_id as "userId",direction,action,task_id as "taskId",details,created_at as "createdAt" from sync_logs where user_id=${userId} order by created_at desc limit 50`;
    return json({ success: true, data: mapRows(rows) });
  }
  return null;
}
