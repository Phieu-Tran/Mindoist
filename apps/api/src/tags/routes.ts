import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
});

export async function tagRoutes(app: FastifyInstance) {
  // List user's tags
  app.get('/tags', { preHandler: requireAuth }, async (request, reply) => {
    const tags = await prisma.tag.findMany({
      where: { userId: request.auth!.sub, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return reply.send({ success: true, data: tags });
  });

  // Create tag
  app.post('/tags', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const tag = await prisma.tag.create({
      data: { userId: request.auth!.sub, ...parsed.data },
    });
    return reply.status(201).send({ success: true, data: tag });
  });

  // Update tag
  app.patch('/tags/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const existing = await prisma.tag.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Tag not found' });
    }

    const tag = await prisma.tag.update({
      where: { id },
      data: parsed.data,
    });
    return reply.send({ success: true, data: tag });
  });

  // Delete tag (soft)
  app.delete('/tags/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.tag.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Tag not found' });
    }

    await prisma.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return reply.send({ success: true });
  });
}
