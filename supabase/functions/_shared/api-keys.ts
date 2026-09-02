import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

const SCOPES = new Set([
  'tasks:read', 'tasks:write', 'schedule:read', 'schedule:write',
  'review:read', 'review:write', 'api-keys:manage',
]);
const DEFAULT_SCOPES = ['tasks:read', 'tasks:write', 'schedule:read', 'schedule:write', 'review:read'];

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function requireManage(request: Request) {
  const auth = await requireAuth(request, 'api-keys:manage');
  return auth;
}

export async function routeApiKeys(path: string, request: Request): Promise<Response | null> {
  if (!path.startsWith('/api-keys')) return null;
  const auth = await requireManage(request);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  if (path === '/api-keys' && request.method === 'GET') {
    const rows = await sql<Record<string, unknown>[]>`
      select id, name, scopes, last_used_at as "lastUsedAt", created_at as "createdAt"
      from api_keys where user_id = ${userId} and revoked_at is null order by created_at desc
    `;
    return json({ success: true, data: rows });
  }
  if (path === '/api-keys' && request.method === 'POST') {
    let input: Record<string, unknown> = {};
    try { input = await request.json() as Record<string, unknown>; } catch { return json({ success: false, error: 'Invalid API key request' }, { status: 400 }); }
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) return json({ success: false, error: 'Invalid API key request' }, { status: 400 });
    const scopes = input.scopes === undefined ? DEFAULT_SCOPES : input.scopes;
    if (!Array.isArray(scopes) || scopes.length < 1 || scopes.some(scope => typeof scope !== 'string' || !SCOPES.has(scope))) return json({ success: false, error: 'Invalid API key request' }, { status: 400 });
    const uniqueScopes = [...new Set(scopes as string[])];
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = `mdt_${bytesToBase64Url(bytes)}`;
    const rows = await sql<Record<string, unknown>[]>`
      insert into api_keys (id, user_id, name, hash, scopes, created_at)
      values (${crypto.randomUUID()}, ${userId}, ${input.name.trim()}, ${await hashToken(token)}, ${sql.array(uniqueScopes)}, now())
      returning id, name, scopes, created_at as "createdAt"
    `;
    return json({ success: true, data: { ...rows[0], token } }, { status: 201 });
  }
  const match = path.match(/^\/api-keys\/([^/]+)$/);
  if (match && request.method === 'DELETE') {
    const rows = await sql<{ id: string }[]>`
      update api_keys set revoked_at = now()
      where id = ${match[1]} and user_id = ${userId} and revoked_at is null returning id
    `;
    if (!rows[0]) return json({ success: false, error: 'API key not found' }, { status: 404 });
    return json({ success: true });
  }
  return null;
}
