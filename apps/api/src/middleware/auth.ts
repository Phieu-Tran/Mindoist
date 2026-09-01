import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { createHash } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthPayload {
  sub: string;
  email: string;
  /** JWTs have no API-key scopes; API-key requests carry this marker. */
  authType?: 'jwt' | 'apiKey';
  scopes?: string[];
}

export const API_KEY_SCOPES = [
  'tasks:read',
  'tasks:write',
  'schedule:read',
  'schedule:write',
  'review:read',
  'review:write',
  'api-keys:manage',
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];

function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

function routeScope(request: FastifyRequest): ApiKeyScope | null {
  const path = request.routeOptions.url || request.url.split('?')[0];
  const method = request.method.toUpperCase();

  if (path.startsWith('/api-keys')) return 'api-keys:manage';
  if (path.startsWith('/agent/drafts')) return method === 'GET' ? 'review:read' : 'review:write';

  // Task-shaped resources include the project/tag/notes surfaces used by
  // automation. Reads and writes are intentionally separated so a read-only
  // key cannot mutate an unrelated task-owned resource.
  if (/^\/(tasks?|task-counts|checklist-items|reminders|tags|projects|sections|areas|notes|countdowns)(\/|$)/.test(path)) {
    return ['GET', 'HEAD'].includes(method) ? 'tasks:read' : 'tasks:write';
  }

  if (/^\/(calendar|time-blocks|gcal|sync)(\/|$)/.test(path)) {
    return ['GET', 'HEAD'].includes(method) ? 'schedule:read' : 'schedule:write';
  }

  return null;
}

async function enforceApiKeyScope(request: FastifyRequest, reply: FastifyReply) {
  if (request.auth?.authType !== 'apiKey') return true;
  const required = routeScope(request);
  if (!required) {
    return reply.status(403).send({ success: false, error: 'API key scope is not defined for this endpoint' });
  }
  if (!request.auth.scopes?.includes(required)) {
    return reply.status(403).send({ success: false, error: `Missing API key scope: ${required}` });
  }
  return true;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  timeZone: string | null;
  onboardingRequired: boolean;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPayload;
    currentUser?: AuthenticatedUser;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ success: false, error: 'Missing token' });
  }

  try {
    request.auth = { ...(jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload), authType: 'jwt' };
  } catch {
    const hash = createHash('sha256').update(header.slice(7)).digest('hex');
    const key = await prisma.apiKey.findFirst({ where: { hash, revokedAt: null }, select: { id: true, userId: true, scopes: true } });
    if (!key) return reply.status(401).send({ success: false, error: 'Invalid token' });
    request.auth = { sub: key.userId, email: '', authType: 'apiKey', scopes: key.scopes.filter(isApiKeyScope) };
    void prisma.apiKey.updateMany({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }

  if (reply.sent) return;
  if (!(await enforceApiKeyScope(request, reply))) return;

  const user = await prisma.user.findUnique({
    where: { id: request.auth.sub },
    select: {
      id: true,
      email: true,
      name: true,
      timeZone: true,
      onboardingRequired: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });
  if (!user) return reply.status(401).send({ success: false, error: 'Invalid token' });
  if (user.status === 'SUSPENDED') {
    return reply.status(403).send({ success: false, error: 'Account suspended' });
  }
  request.currentUser = user;
}

/** Accepts either a JWT or a hashed API key for automation/MCP clients. */
export async function requireAgentAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return reply.status(401).send({ success: false, error: 'Missing token' });
  const token = header.slice(7);
  try {
    request.auth = { ...(jwt.verify(token, JWT_SECRET) as AuthPayload), authType: 'jwt' };
  } catch {
    const hash = createHash('sha256').update(token).digest('hex');
    const key = await prisma.apiKey.findFirst({ where: { hash, revokedAt: null }, select: { userId: true, scopes: true } });
    if (!key) return reply.status(401).send({ success: false, error: 'Invalid token' });
    request.auth = { sub: key.userId, email: '', authType: 'apiKey', scopes: key.scopes.filter(isApiKeyScope) };
    void prisma.apiKey.updateMany({ where: { hash }, data: { lastUsedAt: new Date() } });
  }
  if (reply.sent) return;
  if (!(await enforceApiKeyScope(request, reply))) return;
  const user = await prisma.user.findUnique({ where: { id: request.auth.sub }, select: { id: true, email: true, name: true, timeZone: true, onboardingRequired: true, role: true, status: true, createdAt: true } });
  if (!user) return reply.status(401).send({ success: false, error: 'Invalid token' });
  if (user.status === 'SUSPENDED') return reply.status(403).send({ success: false, error: 'Account suspended' });
  request.currentUser = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.auth?.authType === 'apiKey') {
    return reply.status(403).send({ success: false, error: 'Administrator access requires an interactive session' });
  }
  if (request.currentUser?.role !== 'ADMIN') {
    return reply.status(403).send({ success: false, error: 'Administrator access required' });
  }
}
