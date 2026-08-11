import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteSyncedProjectEvents, syncTimeBlocksToProvider } from '../calendar/provider-sync.js';
import { googleCalendarProvider } from '../calendar/providers/google.js';
import { removeProjectFromGCal, syncProjectTasksToGCal } from '../gcal/service.js';

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  areaId: z.string().uuid().nullable().optional(),
  type: z.enum(['DAILY_LOG', 'JOB', 'PERSONAL', 'CUSTOM']).optional(),
  customColumns: z.array(z.string().trim().min(1).max(80)).min(1).max(12).optional(),
  calendarSyncEnabled: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().optional(),
  parentId: z.string().uuid().nullable().optional(),
  areaId: z.string().uuid().nullable().optional(),
  calendarSyncEnabled: z.boolean().optional(),
});

const createColumnSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().min(1).max(24).optional(),
  isDone: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const updateColumnSchema = createColumnSchema.partial();

type ProjectType = 'DAILY_LOG' | 'JOB' | 'PERSONAL' | 'CUSTOM';

const TEMPLATE_COLUMNS: Record<ProjectType, Array<{ name: string; color: string; isDone: boolean }>> = {
  DAILY_LOG: [
    { name: 'TODO', color: 'slate', isDone: false },
    { name: 'Doing', color: 'ocean', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
  JOB: [
    { name: 'Applied', color: 'slate', isDone: false },
    { name: 'Screen', color: 'ocean', isDone: false },
    { name: 'Interview', color: 'amber', isDone: false },
    { name: 'Offer', color: 'jade', isDone: true },
    { name: 'Rejected', color: 'rose', isDone: true },
  ],
  PERSONAL: [
    { name: 'Backlog', color: 'slate', isDone: false },
    { name: 'This Week', color: 'ocean', isDone: false },
    { name: 'Today', color: 'amber', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
  CUSTOM: [
    { name: 'Backlog', color: 'slate', isDone: false },
    { name: 'In progress', color: 'ocean', isDone: false },
    { name: 'Done', color: 'jade', isDone: true },
  ],
};

function columnsForTemplate(type: ProjectType, customColumns?: string[]) {
  const columns = type === 'CUSTOM' && customColumns?.length
    ? customColumns.map((name, index) => ({
      name,
      color: ['slate', 'ocean', 'amber', 'jade', 'rose'][index % 5],
      isDone: index === customColumns.length - 1,
    }))
    : TEMPLATE_COLUMNS[type];
  return columns.map((column, sortOrder) => ({ ...column, sortOrder }));
}

function projectNameForTemplate(name: string, type: ProjectType) {
  if (type !== 'DAILY_LOG') return name;
  const today = new Date().toISOString().slice(0, 10);
  return name.startsWith(today) ? name : `${today} · ${name}`;
}

export async function projectRoutes(app: FastifyInstance) {
  // List user's projects
  app.get('/projects', { preHandler: requireAuth }, async (request, reply) => {
    const projects = await prisma.project.findMany({
      where: { userId: request.auth!.sub, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return reply.send({ success: true, data: projects });
  });

  // Create project
  app.post('/projects', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    if (parsed.data.parentId) {
      const parent = await prisma.project.findFirst({
        where: { id: parsed.data.parentId, userId: request.auth!.sub, deletedAt: null },
      });
      if (!parent) return reply.status(400).send({ success: false, error: 'Invalid parent project' });
    }

    const type = parsed.data.type || 'CUSTOM';
    const project = await prisma.$transaction(async tx => {
      const created = await tx.project.create({
        data: {
          userId: request.auth!.sub,
          name: projectNameForTemplate(parsed.data.name, type),
          color: parsed.data.color,
          parentId: parsed.data.parentId,
          type,
          calendarSyncEnabled: parsed.data.calendarSyncEnabled ?? false,
        },
      });
      await tx.projectColumn.createMany({
        data: columnsForTemplate(type, parsed.data.customColumns).map(column => ({ ...column, projectId: created.id })),
      });
      return created;
    });
    return reply.status(201).send({ success: true, data: project });
  });

  // Get single project
  app.get('/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }
    return reply.send({ success: true, data: project });
  });

  // Update project
  app.patch('/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const existing = await prisma.project.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    if (parsed.data.parentId !== undefined) {
      if (parsed.data.parentId === id) {
        return reply.status(400).send({ success: false, error: 'Project cannot be its own parent' });
      }
      let cursor = parsed.data.parentId;
      let depth = 0;
      while (cursor && depth < 50) {
        const parent = await prisma.project.findFirst({
          where: { id: cursor, userId: request.auth!.sub, deletedAt: null },
          select: { id: true, parentId: true },
        });
        if (!parent) return reply.status(400).send({ success: false, error: 'Invalid parent project' });
        if (parent.id === id) return reply.status(400).send({ success: false, error: 'Project hierarchy cannot contain a cycle' });
        cursor = parent.parentId;
        depth += 1;
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: parsed.data,
    });
    if (!existing.calendarSyncEnabled && project.calendarSyncEnabled
      && await googleCalendarProvider.isConnected(request.auth!.sub)) {
      await Promise.all([
        syncProjectTasksToGCal(request.auth!.sub, id),
        syncTimeBlocksToProvider(googleCalendarProvider, request.auth!.sub, { projectId: id }),
      ]).catch(error => request.log.warn(error, 'Project Calendar sync failed'));
    }
    return reply.send({ success: true, data: project });
  });

  app.get('/projects/:id/workspace', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!project) return reply.status(404).send({ success: false, error: 'Project not found' });

    const userProjects = await prisma.project.findMany({
      where: { userId: request.auth!.sub, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const descendantIds = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of userProjects) {
        if (candidate.parentId && descendantIds.has(candidate.parentId) && !descendantIds.has(candidate.id)) {
          descendantIds.add(candidate.id);
          grew = true;
        }
      }
    }
    const [columns, tasks] = await Promise.all([
      prisma.projectColumn.findMany({
        where: { projectId: id, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.task.findMany({
        where: { userId: request.auth!.sub, projectId: { in: Array.from(descendantIds) }, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return reply.send({
      success: true,
      data: {
        project,
        subProjects: userProjects.filter(candidate => candidate.id !== id && descendantIds.has(candidate.id)),
        columns,
        tasks,
      },
    });
  });

  app.post('/projects/:id/subprojects', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createProjectSchema.omit({ parentId: true }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(issue => issue.message).join(', ') });
    }
    const parent = await prisma.project.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!parent) return reply.status(404).send({ success: false, error: 'Project not found' });
    const type = parsed.data.type || 'CUSTOM';
    const project = await prisma.$transaction(async tx => {
      const created = await tx.project.create({
        data: {
          userId: request.auth!.sub,
          parentId: id,
          name: projectNameForTemplate(parsed.data.name, type),
          color: parsed.data.color,
          type,
        },
      });
      await tx.projectColumn.createMany({
        data: columnsForTemplate(type, parsed.data.customColumns).map(column => ({ ...column, projectId: created.id })),
      });
      return created;
    });
    return reply.status(201).send({ success: true, data: project });
  });

  app.get('/projects/:projectId/columns', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: request.auth!.sub, deletedAt: null },
    });
    if (!project) return reply.status(404).send({ success: false, error: 'Project not found' });

    let columns = await prisma.projectColumn.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (columns.length === 0) {
      await prisma.projectColumn.createMany({
        data: columnsForTemplate(project.type).map(column => ({ ...column, projectId })),
      });
      columns = await prisma.projectColumn.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }
    return reply.send({ success: true, data: columns });
  });

  app.post('/projects/:projectId/columns', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = createColumnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(issue => issue.message).join(', ') });
    }
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: request.auth!.sub, deletedAt: null },
    });
    if (!project) return reply.status(404).send({ success: false, error: 'Project not found' });
    const column = await prisma.projectColumn.create({ data: { projectId, ...parsed.data } });
    return reply.status(201).send({ success: true, data: column });
  });

  app.patch('/projects/:projectId/columns/:columnId', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, columnId } = request.params as { projectId: string; columnId: string };
    const parsed = updateColumnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(issue => issue.message).join(', ') });
    }
    const existing = await prisma.projectColumn.findFirst({
      where: { id: columnId, projectId, deletedAt: null, project: { userId: request.auth!.sub, deletedAt: null } },
    });
    if (!existing) return reply.status(404).send({ success: false, error: 'Project column not found' });
    const column = await prisma.projectColumn.update({ where: { id: columnId }, data: parsed.data });
    return reply.send({ success: true, data: column });
  });

  app.delete('/projects/:projectId/columns/:columnId', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, columnId } = request.params as { projectId: string; columnId: string };
    const existing = await prisma.projectColumn.findFirst({
      where: { id: columnId, projectId, deletedAt: null, project: { userId: request.auth!.sub, deletedAt: null } },
    });
    if (!existing) return reply.status(404).send({ success: false, error: 'Project column not found' });
    const count = await prisma.projectColumn.count({ where: { projectId, deletedAt: null } });
    if (count <= 1) return reply.status(409).send({ success: false, error: 'A project needs at least one column' });
    await prisma.$transaction([
      prisma.task.updateMany({ where: { projectColumnId: columnId }, data: { projectColumnId: null } }),
      prisma.projectColumn.update({ where: { id: columnId }, data: { deletedAt: new Date() } }),
    ]);
    return reply.send({ success: true });
  });

  // Delete project (soft)
  app.delete('/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.project.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
      await removeProjectFromGCal(request.auth!.sub, id);
      await deleteSyncedProjectEvents(googleCalendarProvider, request.auth!.sub, id);
    }

    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return reply.send({ success: true });
  });
}
