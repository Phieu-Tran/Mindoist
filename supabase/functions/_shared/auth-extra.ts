import bcrypt from 'npm:bcryptjs@2.4.3';
import { sql } from './db.ts';
import { json } from './http.ts';
import { requireAuth, signAccessToken } from './sf0.ts';

function invalid(message: string, status = 400) { return json({ success: false, error: message }, { status }); }
function validZone(value: unknown) { try { return typeof value === 'string' && Boolean(new Intl.DateTimeFormat('en-US', { timeZone: value }).format()); } catch { return false; } }
async function bodyOf(request: Request) { try { const value = await request.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : {}; } catch { return {}; } }
async function hash(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''); }
function frontendUrl() { return Deno.env.get('FRONTEND_URL') || 'http://localhost:5173'; }
function googleRedirect() { return Deno.env.get('GOOGLE_AUTH_REDIRECT_URI') || `${frontendUrl()}/auth/google/callback`; }

export async function routeAuthExtra(path: string, request: Request): Promise<Response | null> {
  if (path === '/auth/google/url' && request.method === 'GET') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID'); const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return invalid('Google sign-in is not configured', 503);
    const returnTo = new URL(request.url).searchParams.get('returnTo');
    let state: string | undefined;
    if (returnTo) {
      try {
        const target = new URL(returnTo); const front = new URL(frontendUrl());
        if (target.origin === front.origin || ((target.hostname === 'localhost' || target.hostname === '127.0.0.1') && target.protocol === 'http:') || target.protocol === 'mindoist:') state = btoa(JSON.stringify({ returnTo }));
      } catch { /* use default redirect */ }
    }
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: googleRedirect(), response_type: 'code', access_type: 'online', prompt: 'select_account', scope: 'openid email profile' });
    if (state) params.set('state', state);
    return json({ success: true, data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` } });
  }
  if (path === '/auth/google/callback' && request.method === 'GET') {
    const params = new URL(request.url).searchParams; const code = params.get('code'); const error = params.get('error');
    let returnTo: string | undefined;
    try { const raw = params.get('state'); if (raw) returnTo = (JSON.parse(atob(raw)) as { returnTo?: string }).returnTo; } catch { /* ignore state */ }
    const redirect = returnTo || frontendUrl();
    if (error || !code) return Response.redirect(`${redirect}/#google_error=${encodeURIComponent(error || 'missing_code')}`, 302);
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '', client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '', redirect_uri: googleRedirect(), grant_type: 'authorization_code' }) });
      if (!response.ok) throw new Error('token');
      const tokens = await response.json() as { id_token?: string };
      if (!tokens.id_token) throw new Error('identity');
      const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`); if (!info.ok) throw new Error('identity');
      const payload = await info.json() as { email?: string; email_verified?: string; name?: string; aud?: string };
      if (!payload.email || payload.email_verified !== 'true' || (payload.aud && payload.aud !== Deno.env.get('GOOGLE_CLIENT_ID'))) throw new Error('identity');
      const email = payload.email.trim().toLowerCase();
      let rows = await sql<Record<string, unknown>[]>`select id,email,name,time_zone as "timeZone",onboarding_required as "onboardingRequired",role,status,created_at as "createdAt" from users where email=${email} limit 1`;
      if (!rows[0]) rows = await sql<Record<string, unknown>[]>`insert into users (id,email,password,name,onboarding_required,role,status,created_at,updated_at) values (${crypto.randomUUID()},${email},${await bcrypt.hash(base64urlRandom(), 10)},${(payload.name || email.split('@')[0]).slice(0, 80)},true,case when (select count(*) from users)=0 then 'ADMIN'::"UserRole" else 'USER'::"UserRole" end,'ACTIVE'::"UserStatus",now(),now()) returning id,email,name,time_zone as "timeZone",onboarding_required as "onboardingRequired",role,status,created_at as "createdAt"`;
      if (rows[0].status === 'SUSPENDED') throw new Error('suspended');
      const accessToken = await signAccessToken({ id: String(rows[0].id), email: String(rows[0].email) });
      const refresh = base64urlRandom(); await sql`insert into refresh_tokens (id,user_id,token_hash,expires_at,created_at) values (${crypto.randomUUID()},${rows[0].id},${await hash(refresh)},${new Date(Date.now()+30*86400000)},now())`;
      return Response.redirect(`${redirect}/#google_token=${encodeURIComponent(accessToken)}&google_refresh=${encodeURIComponent(refresh)}`, 302);
    } catch { return Response.redirect(`${redirect}/#google_error=auth_failed`, 302); }
  }
  if (!path.startsWith('/auth/')) return null;
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  if (path === '/auth/set-password' && request.method === 'POST') {
    const input = await bodyOf(request); if (typeof input.password !== 'string' || input.password.length < 6) return invalid('Password must be at least 6 characters');
    await sql`update users set password=${await bcrypt.hash(input.password,10)},updated_at=now() where id=${auth.user.id}`; return json({ success: true });
  }
  if (path === '/auth/complete-onboarding' && request.method === 'POST') {
    const input = await bodyOf(request);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80 || !validZone(input.timeZone) || (input.password !== undefined && (typeof input.password !== 'string' || input.password.length < 6))) return invalid('Invalid onboarding data');
    const rows = await sql<Record<string, unknown>[]>`update users set name=${input.name.trim()},time_zone=${input.timeZone},onboarding_required=false,password=case when ${input.password !== undefined} then ${await bcrypt.hash(String(input.password),10)} else password end,updated_at=now() where id=${auth.user.id} returning id,email,name,time_zone as "timeZone",onboarding_required as "onboardingRequired",role,status,created_at as "createdAt"`;
    const user = rows[0]; return json({ success: true, data: { ...user, createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt } });
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    const input = await bodyOf(request); if (typeof input.refreshToken === 'string' && input.refreshToken) await sql`delete from refresh_tokens where user_id=${auth.user.id} and token_hash=${await hash(input.refreshToken)}`;
    return json({ success: true });
  }
  if (path === '/auth/account' && request.method === 'DELETE') {
    const input = await bodyOf(request); if (typeof input.confirmEmail !== 'string' || input.confirmEmail.trim().toLowerCase() !== auth.user.email.toLowerCase()) return invalid('Type your account email to confirm deletion');
    await sql`delete from users where id=${auth.user.id}`; return json({ success: true });
  }
  return null;
}

function base64urlRandom() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); let binary=''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
