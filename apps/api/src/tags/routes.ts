import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const createTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().optional(),
});

const updateTagSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().optional(),
});

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function conflict(reply: FastifyReply) {
  return reply.status(409).send({ success: false, error: 'Tag name already exists' });
}

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', { preHandler: requireAuth }, async (request, reply) => {
    const tags = await prisma.tag.findMany({
      where: { userId: request.auth!.sub, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return reply.send({ success: true, data: tags });
  });

  app.post('/tags', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') });
    }

    try {
      const tag = await prisma.$transaction(async tx => {
        const existing = await tx.tag.findFirst({ where: { userId: request.auth!.sub, name: parsed.data.name } });
        if (existing?.deletedAt) {
          const restored = await tx.tag.updateMany({
            where: { id: existing.id, deletedAt: { not: null } },
            data: { deletedAt: null, color: parsed.data.color ?? null },
          });
          if (!restored.count) throw Object.assign(new Error('Tag name already exists'), { code: 'P2002' });
          await tx.taskTag.deleteMany({ where: { tagId: existing.id } });
          return tx.tag.findUniqueOrThrow({ where: { id: existing.id } });
        }
        if (existing) throw Object.assign(new Error('Tag name already exists'), { code: 'P2002' });
        return tx.tag.create({ data: { userId: request.auth!.sub, ...parsed.data } });
      });
      return reply.status(201).send({ success: true, data: tag });
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(reply);
      throw error;
    }
  });

  app.patch('/tags/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') });
    }

    const existing = await prisma.tag.findFirst({ where: { id, userId: request.auth!.sub, deletedAt: null } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Tag not found' });

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const duplicate = await prisma.tag.findFirst({
        where: { userId: request.auth!.sub, name: parsed.data.name },
      });
      if (duplicate) return conflict(reply);
    }

    try {
      const tag = await prisma.tag.update({ where: { id }, data: parsed.data });
      return reply.send({ success: true, data: tag });
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(reply);
      throw error;
    }
  });

  app.delete('/tags/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.tag.findFirst({ where: { id, userId: request.auth!.sub, deletedAt: null } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Tag not found' });

    await prisma.$transaction([
      prisma.taskTag.deleteMany({ where: { tagId: id } }),
      prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    return reply.send({ success: true });
  });
}
