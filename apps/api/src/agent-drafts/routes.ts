import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AgentDraftError, cancelAgentDraft, confirmAgentDraft, createAgentDraft, createAgentDraftSchema } from './service.js';

export async function agentDraftRoutes(app: FastifyInstance) {
  app.get('/agent/drafts', { preHandler: requireAuth }, async request => {
    const drafts = await prisma.agentDraft.findMany({
      where: { userId: request.auth!.sub, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: drafts };
  });

  app.post('/agent/drafts', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createAgentDraftSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid draft', details: parsed.error.flatten() });
    const draft = await createAgentDraft(request.auth!.sub, parsed.data);
    return reply.status(201).send({ success: true, data: draft });
  });

  app.get('/agent/drafts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const draft = await prisma.agentDraft.findFirst({ where: { id, userId: request.auth!.sub } });
    if (!draft) return reply.status(404).send({ success: false, error: 'Draft not found' });
    return { success: true, data: draft };
  });

  app.post('/agent/drafts/:id/confirm', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const draft = await confirmAgentDraft(request.auth!.sub, id);
      if (draft.status === 'EXPIRED') return reply.status(410).send({ success: false, error: 'Draft expired', data: draft });
      return { success: true, data: draft };
    } catch (error) {
      if (error instanceof AgentDraftError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      throw error;
    }
  });

  app.post('/agent/drafts/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const draft = await cancelAgentDraft(request.auth!.sub, id);
      return { success: true, data: draft };
    } catch (error) {
      if (error instanceof AgentDraftError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      throw error;
    }
  });
}
