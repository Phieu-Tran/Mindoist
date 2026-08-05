import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthPayload {
  sub: string;
  email: string;
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
    request.auth = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
  } catch {
    return reply.status(401).send({ success: false, error: 'Invalid token' });
  }

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

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.currentUser?.role !== 'ADMIN') {
    return reply.status(403).send({ success: false, error: 'Administrator access required' });
  }
}
