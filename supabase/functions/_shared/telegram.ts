import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth } from './sf0.ts';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MESSAGE_MAX_AGE_MS = 3 * 60 * 1000;
const MESSAGE_FUTURE_TOLERANCE_MS = 60 * 1000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function botUsername() {
  const value = Deno.env.get('TELEGRAM_BOT_USERNAME')?.trim().replace(/^@/, '');
  return value && /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : null;
}

function agentToken() {
  const value = Deno.env.get('MINDOIST_AGENT_TOKEN')?.trim();
  return value && new TextEncoder().encode(value).length >= 32 ? value : null;
}

function invalid(message: string, status = 400, code?: string) {
  return json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

function base64url(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function numeric(value: unknown) { return typeof value === 'string' && /^\d{1,20}$/.test(value); }

async function bodyOf(request: Request) {
  try { const value = await request.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : {}; } catch { return {}; }
}

function limited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return null; }
  current.count++;
  return current.count > limit ? Math.max(1, Math.ceil((current.resetAt - now) / 1000)) : null;
}

async function status(userId: string) {
  const username = botUsername();
  if (!username || !agentToken()) return { state: 'unavailable' as const };
  const connected = await sql<Record<string, unknown>[]>`
    select telegram_username as "telegramUsername", telegram_display_name as "telegramDisplayName", linked_at as "linkedAt"
    from telegram_connections where user_id=${userId} limit 1
  `;
  if (connected[0]) return { state: 'connected' as const, botUsername: username, telegramUsername: connected[0].telegramUsername, telegramDisplayName: connected[0].telegramDisplayName, linkedAt: new Date(String(connected[0].linkedAt)).toISOString() };
  const pending = await sql<Record<string, unknown>[]>`select expires_at as "expiresAt" from telegram_link_challenges where user_id=${userId} and consumed_at is null and expires_at > now() order by created_at desc limit 1`;
  return pending[0]
    ? { state: 'pending' as const, botUsername: username, expiresAt: new Date(String(pending[0].expiresAt)).toISOString() }
    : { state: 'unlinked' as const, botUsername: username };
}

async function userAuth(request: Request) {
  const auth = await requireAuth(request);
  return auth instanceof Response ? auth : auth.user.id;
}

async function internalAuth(request: Request) {
  const expected = agentToken();
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/, '');
  if (!expected) return invalid('Telegram agent integration is unavailable', 503, 'TELEGRAM_UNAVAILABLE');
  if (!value || value.length !== expected.length) return invalid('Invalid agent token', 401);
  const [left, right] = await Promise.all([digest(value), digest(expected)]);
  let same = left.length === right.length; for (let i = 0; i < Math.min(left.length, right.length); i++) same = same && left.charCodeAt(i) === right.charCodeAt(i);
  return same ? true : invalid('Invalid agent token', 401);
}

export async function routeTelegram(path: string, request: Request): Promise<Response | null> {
  if (path === '/integrations/telegram/status' && request.method === 'GET') {
    const userId = await userAuth(request); if (userId instanceof Response) return userId;
    return json({ success: true, data: await status(userId) });
  }
  if (path === '/integrations/telegram/link-challenges' && request.method === 'POST') {
    const userId = await userAuth(request); if (userId instanceof Response) return userId;
    if (!botUsername() || !agentToken()) return invalid('Telegram integration is unavailable', 503, 'TELEGRAM_UNAVAILABLE');
    const retry = limited(`challenge:${userId}`, 5, 15 * 60 * 1000); if (retry) return json({ success: false, error: 'Too many requests' }, { status: 429, headers: { 'retry-after': String(retry) } });
    const existing = await sql<{ id: string }[]>`select id from telegram_connections where user_id=${userId} limit 1`;
    if (existing[0]) return invalid('Telegram is already connected', 409, 'TELEGRAM_ALREADY_CONNECTED');
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    const code = base64url(bytes); const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await sql.begin(async tx => {
      await tx`delete from telegram_link_challenges where user_id=${userId}`;
      await tx`insert into telegram_link_challenges (id,user_id,code_hash,expires_at,created_at) values (${crypto.randomUUID()},${userId},${await digest(code)},${expiresAt},now())`;
    });
    return json({ success: true, data: { state: 'pending', botUsername: botUsername(), expiresAt: expiresAt.toISOString(), deepLink: `https://t.me/${botUsername()}?start=mindoist_${code}` } }, { status: 201 });
  }
  if (path === '/integrations/telegram/connection' && request.method === 'DELETE') {
    const userId = await userAuth(request); if (userId instanceof Response) return userId;
    const deleted = await sql.begin(async tx => {
      await tx`delete from telegram_link_challenges where user_id=${userId}`;
      await tx`update agent_drafts set status='CANCELLED'::"AgentDraftStatus", updated_at=now() where user_id=${userId} and transport='TELEGRAM'::"AgentTransport" and status='PENDING'::"AgentDraftStatus"`;
      const rows = await tx`delete from telegram_connections where user_id=${userId} returning id`;
      return rows.length > 0;
    });
    return json({ success: true, data: { disconnected: deleted } });
  }

  if (!path.startsWith('/internal/agent/telegram/')) return null;
  const valid = await internalAuth(request); if (valid !== true) return valid;
  if (path === '/internal/agent/telegram/link-challenges/consume' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (typeof input.code !== 'string' || input.code.length < 32 || input.code.length > 128 || !/^[A-Za-z0-9_-]+$/.test(input.code) || !numeric(input.telegramUserId) || !numeric(input.telegramChatId) || input.chatType !== 'private') return invalid('Invalid Telegram link request');
    const retry = limited(`consume:${input.telegramUserId}`, 10, 10 * 60 * 1000); if (retry) return json({ success: false, error: 'Too many requests' }, { status: 429, headers: { 'retry-after': String(retry) } });
    const challenges = await sql<Record<string, unknown>[]>`select id,user_id as "userId",expires_at as "expiresAt",consumed_at as "consumedAt" from telegram_link_challenges where code_hash=${await digest(input.code)} limit 1`;
    const challenge = challenges[0]; if (!challenge) return invalid('Invalid or expired link', 400, 'TELEGRAM_LINK_INVALID');
    if (challenge.consumedAt) return invalid('Link has already been used', 409, 'TELEGRAM_LINK_USED');
    if (new Date(String(challenge.expiresAt)).getTime() <= Date.now()) return invalid('Link has expired', 410, 'TELEGRAM_LINK_EXPIRED');
    const username = typeof input.telegramUsername === 'string' ? input.telegramUsername.trim().replace(/^@/, '').slice(0, 64) || null : null;
    const displayName = typeof input.telegramDisplayName === 'string' ? input.telegramDisplayName.trim().slice(0, 128) || null : null;
    try {
      const result = await sql.begin(async tx => {
        const consumed = await tx`update telegram_link_challenges set consumed_at=now() where id=${challenge.id} and consumed_at is null and expires_at > now() returning id`;
        if (!consumed.length) throw new Error('used');
        const rows = await tx`insert into telegram_connections (id,user_id,telegram_user_id,telegram_chat_id,telegram_username,telegram_display_name,linked_at,last_seen_at,created_at,updated_at) values (${crypto.randomUUID()},${challenge.userId},${input.telegramUserId},${input.telegramChatId},${username},${displayName},now(),now(),now(),now()) returning id,user_id as "userId"`;
        return rows[0];
      });
      return json({ success: true, data: { connectionId: result.id, userId: result.userId, alreadyConnected: false } });
    } catch { return invalid('Telegram account is already connected', 409, 'TELEGRAM_IDENTITY_IN_USE'); }
  }

  if (path === '/internal/agent/telegram/message/authorize' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (!numeric(input.telegramUserId) || !numeric(input.telegramChatId) || input.chatType !== 'private' || (input.telegramMessageId !== undefined && (!numeric(input.telegramMessageId) || typeof input.telegramMessageDate !== 'number'))) return invalid('Private Telegram chat required');
    const rows = await sql<Record<string, unknown>[]>`select id,user_id as "userId",telegram_chat_id as "telegramChatId",last_seen_at as "lastSeenAt" from telegram_connections where telegram_user_id=${input.telegramUserId} limit 1`;
    const connection = rows[0]; if (!connection || connection.telegramChatId !== input.telegramChatId) return invalid('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
    const now = Date.now();
    if (input.telegramMessageId === undefined) return json({ success: true, data: { connectionId: connection.id, userId: connection.userId, accepted: true } });
    const sentAt = new Date(Number(input.telegramMessageDate) * 1000); const age = now - sentAt.getTime();
    const accepted = age <= MESSAGE_MAX_AGE_MS && age >= -MESSAGE_FUTURE_TOLERANCE_MS;
    try {
      await sql`insert into telegram_inbound_messages (id,connection_id,telegram_chat_id,telegram_message_id,telegram_sent_at,accepted,created_at) values (${crypto.randomUUID()},${connection.id},${input.telegramChatId},${input.telegramMessageId},${sentAt},${accepted},now())`;
    } catch { return json({ success: true, data: { connectionId: connection.id, userId: connection.userId, accepted: false, reason: 'duplicate' } }); }
    return json({ success: true, data: accepted ? { connectionId: connection.id, userId: connection.userId, accepted: true } : { connectionId: connection.id, userId: connection.userId, accepted: false, reason: 'stale' } });
  }

  // Draft/query endpoints remain owned by the agent runtime until their SQL
  // workflow is ported; fail closed instead of accidentally accepting writes.
  return invalid('Telegram agent route is not yet available on Edge', 501);
}
