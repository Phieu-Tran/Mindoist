import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { API_KEY_SCOPES, requireAuth } from '../middleware/auth.js';

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get('/api-keys', { preHandler: requireAuth }, async request => {
    const keys = await prisma.apiKey.findMany({ where: { userId: request.auth!.sub, revokedAt: null }, select: { id: true, name: true, scopes: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    return { success: true, data: keys };
  });
  app.post('/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z.object({
      name: z.string().min(1).max(80),
      scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['tasks:read', 'tasks:write', 'schedule:read', 'schedule:write', 'review:read']),
    }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid API key request' });
    const token = `mdt_${randomBytes(32).toString('base64url')}`;
    const key = await prisma.apiKey.create({ data: { userId: request.auth!.sub, name: parsed.data.name, scopes: parsed.data.scopes, hash: createHash('sha256').update(token).digest('hex') }, select: { id: true, name: true, scopes: true, createdAt: true } });
    return reply.status(201).send({ success: true, data: { ...key, token } });
  });
  app.delete('/api-keys/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.apiKey.updateMany({ where: { id, userId: request.auth!.sub, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) return reply.status(404).send({ success: false, error: 'API key not found' });
    return { success: true };
  });
}
