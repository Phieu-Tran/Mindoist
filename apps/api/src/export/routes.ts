import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(v => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

export async function exportRoutes(app: FastifyInstance) {
  app.get('/export/json', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const [tasks, projects, notes, tags, sections, projectColumns] = await Promise.all([
      prisma.task.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.project.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.note.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.tag.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.section.findMany({ where: { project: { userId }, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      prisma.projectColumn.findMany({ where: { project: { userId }, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);

    const data = { exportedAt: new Date().toISOString(), tasks, projects, notes, tags, sections, projectColumns };
    const json = JSON.stringify(data, null, 2);

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="mindoist-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return reply.send(json);
  });

  app.get('/export/csv', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const tasks = await prisma.task.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { project: { select: { name: true } } },
    });

    const header = [
      'id', 'title', 'description', 'priority', 'dueDate', 'dueTime', 'startDate',
      'durationMin', 'completedAt', 'deletedAt', 'rrule', 'color', 'projectId',
      'projectName', 'parentId', 'createdAt', 'updatedAt',
    ];

    const rows = tasks.map(t => toCsvRow([
      t.id, t.title, t.description, t.priority, t.dueDate?.toISOString(), t.dueTime,
      t.startDate?.toISOString(), t.durationMin, t.completedAt?.toISOString(),
      t.deletedAt?.toISOString(), t.rrule, t.color, t.projectId,
      (t as any).project?.name ?? '', t.parentId, t.createdAt.toISOString(), t.updatedAt.toISOString(),
    ]));

    const csv = [header.join(','), ...rows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="mindoist-tasks-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reply.send(csv);
  });
}
