import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const createSectionSchema = z.object({
  name: z.string().min(1),
});

const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().optional(),
});

export async function sectionRoutes(app: FastifyInstance) {
  // List sections in a project
  app.get('/projects/:projectId/sections', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: request.auth!.sub, deletedAt: null },
    });
    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const sections = await prisma.section.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return reply.send({ success: true, data: sections });
  });

  // Create section in a project
  app.post('/projects/:projectId/sections', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = createSectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: request.auth!.sub, deletedAt: null },
    });
    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const section = await prisma.section.create({
      data: { projectId, ...parsed.data },
    });
    return reply.status(201).send({ success: true, data: section });
  });

  // Update section
  app.patch('/sections/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const existing = await prisma.section.findFirst({
      where: { id, deletedAt: null, project: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Section not found' });
    }

    const section = await prisma.section.update({
      where: { id },
      data: parsed.data,
    });
    return reply.send({ success: true, data: section });
  });

  // Delete section (soft)
  app.delete('/sections/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.section.findFirst({
      where: { id, deletedAt: null, project: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Section not found' });
    }

    await prisma.section.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return reply.send({ success: true });
  });
}
