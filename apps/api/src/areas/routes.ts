import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const createAreaSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

const updateAreaSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
});

export async function areaRoutes(app: FastifyInstance) {
  // List user's areas
  app.get('/areas', { preHandler: requireAuth }, async (request, reply) => {
    const areas = await prisma.area.findMany({
      where: { userId: request.auth!.sub },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ success: true, data: areas });
  });

  // Create area
  app.post('/areas', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createAreaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    // Check for duplicate name
    const existing = await prisma.area.findFirst({
      where: { userId: request.auth!.sub, name: parsed.data.name },
    });
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Area with this name already exists' });
    }

    const area = await prisma.area.create({
      data: { userId: request.auth!.sub, ...parsed.data },
    });
    return reply.status(201).send({ success: true, data: area });
  });

  // Update area
  app.patch('/areas/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateAreaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const existing = await prisma.area.findFirst({
      where: { id, userId: request.auth!.sub },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Area not found' });
    }

    // Check for duplicate name on rename
    if (parsed.data.name && parsed.data.name !== existing.name) {
      const duplicate = await prisma.area.findFirst({
        where: { userId: request.auth!.sub, name: parsed.data.name },
      });
      if (duplicate) {
        return reply.status(409).send({ success: false, error: 'Area with this name already exists' });
      }
    }

    const area = await prisma.area.update({
      where: { id },
      data: parsed.data,
    });
    return reply.send({ success: true, data: area });
  });

  // Delete area (unlink projects, don't delete them)
  app.delete('/areas/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.area.findFirst({
      where: { id, userId: request.auth!.sub },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Area not found' });
    }

    // Unlink all projects from this area
    await prisma.project.updateMany({
      where: { areaId: id },
      data: { areaId: null },
    });

    await prisma.area.delete({ where: { id } });
    return reply.send({ success: true });
  });
}
