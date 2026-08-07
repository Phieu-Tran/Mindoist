import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const createNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  taskId: z.string().optional(),
});

const updateNoteSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

export async function noteRoutes(app: FastifyInstance) {
  // GET /notes — list all notes for user
  app.get('/notes', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.sub;
    const notes = await prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, data: notes };
  });

  // GET /notes/search?q=<query> — search notes by title/content
  app.get<{ Querystring: { q?: string } }>(
    '/notes/search',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const q = request.query.q;
      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [] });
      }
      const notes = await prisma.note.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
      return reply.send({ success: true, data: notes });
    }
  );

  // GET /notes/:id — get single note
  app.get<{ Params: { id: string } }>(
    '/notes/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const note = await prisma.note.findFirst({
        where: { id: request.params.id, userId, deletedAt: null },
      });
      if (!note) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      return reply.send({ success: true, data: note });
    }
  );

  // POST /notes — create note
  app.post<{ Body: { title?: string; content?: string; taskId?: string } }>(
    '/notes',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = createNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid body' });
      }
      const note = await prisma.note.create({
        data: {
          userId,
          title: parsed.data.title || null,
          content: parsed.data.content || null,
          taskId: parsed.data.taskId || null,
        },
      });
      return reply.status(201).send({ success: true, data: note });
    }
  );

  // PATCH /notes/:id — update note
  app.patch<{ Params: { id: string }; Body: { title?: string | null; content?: string | null; taskId?: string | null } }>(
    '/notes/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = updateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid body' });
      }
      const existing = await prisma.note.findFirst({
        where: { id: request.params.id, userId, deletedAt: null },
      });
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      const note = await prisma.note.update({
        where: { id: request.params.id },
        data: {
          ...parsed.data,
          title: parsed.data.title === undefined ? undefined : parsed.data.title,
          content: parsed.data.content === undefined ? undefined : parsed.data.content,
          taskId: parsed.data.taskId === undefined ? undefined : parsed.data.taskId,
        },
      });
      return reply.send({ success: true, data: note });
    }
  );

  // DELETE /notes/:id — soft delete note
  app.delete<{ Params: { id: string } }>(
    '/notes/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const existing = await prisma.note.findFirst({
        where: { id: request.params.id, userId, deletedAt: null },
      });
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      await prisma.note.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      });
      return reply.send({ success: true });
    }
  );
}
