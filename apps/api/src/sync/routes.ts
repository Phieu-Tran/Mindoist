import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { zonedDateTimeToUtc } from '../tasks/deadline.js';
import { mergeFieldPatch, type FieldVersion } from './field-merge.js';

// --- Sync types ----------------------------------------------------------------

export interface SyncItem {
  table: 'task' | 'timeBlock' | 'project' | 'tag' | 'section' | 'taskTag' | 'note' | 'reminder' | 'projectColumn' | 'taskChecklistItem' | 'area' | 'countdown';
  version?: 1 | 2 | 3;
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

// --- Validation ----------------------------------------------------------------

const changesQuerySchema = z.object({
  since: z.string().datetime().optional(),
});

const pushBodySchema = z.object({
  items: z.array(
    z.object({
      table: z.enum(['task', 'timeBlock', 'project', 'tag', 'section', 'taskTag', 'note', 'reminder', 'projectColumn', 'taskChecklistItem', 'area', 'countdown']),
      version: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      id: z.string(),
      data: z.record(z.unknown()),
      updatedAt: z.string().datetime(),
    })
  ),
});

// --- Helpers -------------------------------------------------------------------

const SYNC_TABLES = ['task', 'timeBlock', 'project', 'tag', 'section', 'note', 'reminder', 'projectColumn', 'taskChecklistItem', 'area', 'countdown'] as const;

type SyncTable = (typeof SYNC_TABLES)[number];

function toIso(date: Date | string): string {
  return new Date(date).toISOString();
}

function nextServerUpdatedAt(current?: Date | null): Date {
  const now = new Date();
  return current && current > now ? current : now;
}

function legacyDueDate(
  deadlineDate: Date | null,
  deadlineTime: string | null,
  deadlineTimeZone: string | null,
): string | null {
  if (!deadlineDate) return null;
  if (!deadlineTime || !deadlineTimeZone) return deadlineDate.toISOString();
  return zonedDateTimeToUtc(
    deadlineDate.toISOString().slice(0, 10),
    deadlineTime,
    deadlineTimeZone,
  ).toISOString();
}

// --- Routes --------------------------------------------------------------------

export async function syncRoutes(app: FastifyInstance) {
  // GET /sync/changes?since=<ISO> — pull all changes since cursor
  app.get<{ Querystring: { since?: string } }>(
    '/changes',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = changesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid query' });
      }

      const since = parsed.data.since ? new Date(parsed.data.since) : new Date(0);
      const items: SyncItem[] = [];

      // Pull tasks
      const tasks = await prisma.task.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const t of tasks) {
        items.push({
          table: 'task',
          version: 2,
          id: t.id,
          data: {
            title: t.title,
            description: t.description,
            color: t.color,
            projectId: t.projectId,
            sectionId: t.sectionId,
            parentId: t.parentId,
            priority: t.priority,
            // v2 remains available to the legacy Android client during the
            // observation window. Derive its fields at the boundary without
            // reintroducing dual writes in the database.
            dueDate: legacyDueDate(t.deadlineDate, t.deadlineTime, t.deadlineTimeZone),
            dueTime: t.deadlineTime,
            deadlineDate: t.deadlineDate?.toISOString() ?? null,
            deadlineTime: t.deadlineTime,
            deadlineTimeZone: t.deadlineTimeZone,
            startDate: t.startDate?.toISOString() ?? null,
            estimateMin: t.estimateMin,
            fieldVersions: t.fieldVersions,
            rrule: t.rrule,
            completedAt: t.completedAt?.toISOString() ?? null,
            snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
            sortOrder: t.sortOrder,
            createdAt: toIso(t.createdAt),
            deletedAt: t.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(t.updatedAt),
        });
      }

      // Pull scheduled work independently from task deadlines.
      const timeBlocks = await prisma.timeBlock.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const block of timeBlocks) {
        items.push({
          table: 'timeBlock',
          version: 2,
          id: block.id,
          data: {
            taskId: block.taskId,
            startAt: toIso(block.startAt),
            endAt: toIso(block.endAt),
            timeZone: block.timeZone,
            allDay: block.allDay,
            source: block.source,
            fieldVersions: block.fieldVersions,
            completedAt: block.completedAt?.toISOString() ?? null,
            actualMin: block.actualMin,
            createdAt: toIso(block.createdAt),
            deletedAt: block.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(block.updatedAt),
        });
      }

      // Pull projects
      const projects = await prisma.project.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const p of projects) {
        items.push({
          table: 'project',
          id: p.id,
          data: {
            name: p.name,
            color: p.color,
            isArchived: p.isArchived,
            sortOrder: p.sortOrder,
            createdAt: toIso(p.createdAt),
            deletedAt: p.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(p.updatedAt),
        });
      }

      // Pull tags
      const tags = await prisma.tag.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const t of tags) {
        items.push({
          table: 'tag',
          id: t.id,
          data: {
            name: t.name,
            color: t.color,
            createdAt: toIso(t.createdAt),
            deletedAt: t.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(t.updatedAt),
        });
      }

      // Pull sections
      const sections = await prisma.section.findMany({
        where: {
          project: { userId },
          updatedAt: { gt: since },
        },
      });
      for (const s of sections) {
        items.push({
          table: 'section',
          id: s.id,
          data: {
            projectId: s.projectId,
            name: s.name,
            sortOrder: s.sortOrder,
            createdAt: toIso(s.createdAt),
            deletedAt: s.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(s.updatedAt),
        });
      }

      // Pull task-tag relations
      const taskTags = await prisma.taskTag.findMany({
        where: {
          task: { userId },
          updatedAt: { gt: since },
        },
      });
      for (const tt of taskTags) {
        items.push({
          table: 'taskTag',
          id: `${tt.taskId}:${tt.tagId}`,
          data: {
            taskId: tt.taskId,
            tagId: tt.tagId,
            createdAt: toIso(tt.createdAt),
            deletedAt: tt.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(tt.updatedAt),
        });
      }

      // Pull notes
      const notes = await prisma.note.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const n of notes) {
        items.push({
          table: 'note',
          id: n.id,
          data: {
            userId: n.userId,
            taskId: n.taskId,
            title: n.title,
            content: n.content,
            createdAt: toIso(n.createdAt),
            deletedAt: n.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(n.updatedAt),
        });
      }

      // Pull countdowns
      const countdowns = await prisma.countdown.findMany({
        where: { userId, updatedAt: { gt: since } },
      });
      for (const c of countdowns) {
        items.push({
          table: 'countdown',
          id: c.id,
          data: {
            userId: c.userId,
            title: c.title,
            targetDate: toIso(c.targetDate),
            color: c.color,
            imageUrl: c.imageUrl,
            reminderDaysBefore: c.reminderDaysBefore,
            showInCalendar: c.showInCalendar,
            createdAt: toIso(c.createdAt),
            deletedAt: c.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(c.updatedAt),
        });
      }

      // Pull reminders
      const reminders = await prisma.reminder.findMany({
        where: {
          task: { userId },
          updatedAt: { gt: since },
        },
      });
      for (const r of reminders) {
        items.push({
          table: 'reminder',
          id: r.id,
          data: {
            taskId: r.taskId,
            remindAt: toIso(r.remindAt),
            type: r.type,
            isSent: r.isSent,
            createdAt: toIso(r.createdAt),
          },
          updatedAt: toIso(r.updatedAt),
        });
      }

      // Pull project columns
      const projectColumns = await prisma.projectColumn.findMany({
        where: {
          project: { userId },
          updatedAt: { gt: since },
        },
      });
      for (const pc of projectColumns) {
        items.push({
          table: 'projectColumn',
          id: pc.id,
          data: {
            projectId: pc.projectId,
            name: pc.name,
            color: pc.color,
            isDone: pc.isDone,
            sortOrder: pc.sortOrder,
            createdAt: toIso(pc.createdAt),
            deletedAt: pc.deletedAt?.toISOString() ?? null,
          },
          updatedAt: toIso(pc.updatedAt),
        });
      }

      // Pull taskChecklistItems
      const checklistItems = await prisma.taskChecklistItem.findMany({
        where: {
          task: { userId },
          updatedAt: { gt: since },
        },
      });
      for (const ci of checklistItems) {
        items.push({
          table: 'taskChecklistItem',
          id: ci.id,
          data: {
            taskId: ci.taskId,
            title: ci.title,
            completedAt: ci.completedAt?.toISOString() ?? null,
            sortOrder: ci.sortOrder,
            createdAt: toIso(ci.createdAt),
          },
          updatedAt: toIso(ci.updatedAt),
        });
      }

      // Pull areas
      const areas = await prisma.area.findMany({
        where: {
          userId,
          updatedAt: { gt: since },
        },
      });
      for (const a of areas) {
        items.push({
          table: 'area',
          id: a.id,
          data: {
            name: a.name,
            color: a.color,
            sortOrder: a.sortOrder,
            createdAt: toIso(a.createdAt),
          },
          updatedAt: toIso(a.updatedAt),
        });
      }

      const serverTime = new Date().toISOString();

      return reply.send({
        success: true,
        data: { version: 2, items, serverTime },
      });
    }
  );

  // POST /sync/push — push offline mutations (last-write-wins)
  app.post<{ Body: { items: SyncItem[] } }>(
    '/push',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth!.sub;
      const parsed = pushBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid body' });
      }

      const accepted: string[] = [];
      const conflicts: Array<{ table: string; id: string; field: string; rejected: string; kept: string }> = [];

      for (const item of parsed.data.items) {
        try {
          if (item.table === 'taskTag') {
            // Handle task-tag join table separately
            const [taskId, tagId] = item.id.split(':');
            if (!taskId || !tagId) continue;

            const existing = await prisma.taskTag.findUnique({
              where: { taskId_tagId: { taskId, tagId } },
            });

            const incomingUpdated = new Date(item.updatedAt);
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            if (item.data.deletedAt) {
              // Soft delete the relation
              await prisma.taskTag.update({
                where: { taskId_tagId: { taskId, tagId } },
                data: { deletedAt: new Date(item.data.deletedAt as string), updatedAt: incomingUpdated },
              });
            } else if (existing) {
              await prisma.taskTag.update({
                where: { taskId_tagId: { taskId, tagId } },
                data: { updatedAt: incomingUpdated },
              });
            } else {
              await prisma.taskTag.create({
                data: {
                  taskId,
                  tagId,
                  createdAt: item.data.createdAt ? new Date(item.data.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
            continue;
          }

          // Standard table sync (task, project, tag, section)
          const table = item.table as SyncTable;
          const incomingUpdated = new Date(item.updatedAt);

          if (table === 'task') {
            const existing = await prisma.task.findFirst({
              where: { id: item.id, userId },
            });

            if (item.version === 3) {
              const rawPatch = (item.data.patch ?? item.data) as Record<string, FieldVersion>;
              const currentVersions = (existing?.fieldVersions as Record<string, string> | null | undefined) ?? {};
              const tombstoneAt = existing?.deletedAt
                ? currentVersions.deletedAt ?? existing.updatedAt.toISOString()
                : null;
              const restore = tombstoneAt
                && rawPatch.deletedAt?.value === null
                && new Date(rawPatch.deletedAt.at).getTime() > new Date(tombstoneAt).getTime();
              const tombstoneConflicts = tombstoneAt && !restore
                ? Object.entries(rawPatch)
                    .filter(([field, change]) => field !== 'deletedAt' && typeof change?.at === 'string')
                    .map(([field, change]) => ({ field, rejected: change.at, kept: tombstoneAt }))
                : [];
              const patch = tombstoneConflicts.length > 0
                ? Object.fromEntries(Object.entries(rawPatch).filter(([field]) => field === 'deletedAt'))
                : rawPatch;
              const merged = mergeFieldPatch(
                patch,
                currentVersions,
                existing?.updatedAt.toISOString() ?? new Date(0).toISOString(),
                ['title', 'description', 'color', 'projectId', 'sectionId', 'parentId', 'priority',
                  'deadlineDate', 'deadlineTime', 'deadlineTimeZone', 'startDate',
                  'estimateMin', 'rrule', 'completedAt', 'snoozedUntil', 'sortOrder', 'deletedAt'],
              );
              for (const conflict of [...tombstoneConflicts, ...merged.conflicts]) {
                conflicts.push({ table, id: item.id, ...conflict });
                await prisma.syncLog.create({ data: {
                  userId,
                  direction: 'push',
                  action: 'conflict',
                  taskId: item.id,
                  details: JSON.stringify({ table, ...conflict }),
                } });
              }
              if (Object.keys(merged.accepted).length === 0) continue;
              const data: Record<string, unknown> = {
                ...merged.accepted,
                fieldVersions: merged.fieldVersions,
                // A delayed offline patch must never move the row cursor backwards.
                updatedAt: nextServerUpdatedAt(existing?.updatedAt),
              };
              for (const key of ['deadlineDate', 'startDate', 'completedAt', 'snoozedUntil', 'deletedAt']) {
                if (key in data) data[key] = data[key] ? new Date(data[key] as string) : null;
              }
              if (existing) {
                await prisma.task.update({ where: { id: item.id }, data: data as any });
              } else if (typeof data.title === 'string' && data.title.trim()) {
                await prisma.task.create({
                  data: {
                    id: item.id,
                    userId,
                    title: data.title,
                    ...data,
                    createdAt: new Date(),
                  } as any,
                });
              } else {
                continue;
              }
              accepted.push(item.id);
              continue;
            }

            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.task.update({
                  where: { id: item.id },
                  data: {
                    deletedAt: new Date(d.deletedAt as string),
                    updatedAt: incomingUpdated,
                  },
                });
              } else {
                await prisma.task.update({
                  where: { id: item.id },
                  data: {
                    title: d.title as string,
                    description: (d.description as string) ?? null,
                    color: (d.color as string) ?? null,
                    projectId: (d.projectId as string) ?? null,
                    sectionId: (d.sectionId as string) ?? null,
                    parentId: (d.parentId as string) ?? null,
                    priority: (d.priority as number) ?? null,
                    deadlineDate: (d.deadlineDate ?? d.dueDate) ? new Date((d.deadlineDate ?? d.dueDate) as string) : null,
                    deadlineTime: (d.deadlineTime ?? d.dueTime as string) ?? null,
                    deadlineTimeZone: (d.deadlineTimeZone as string) ?? null,
                    startDate: d.startDate ? new Date(d.startDate as string) : null,
                    estimateMin: (d.estimateMin as number) ?? (d.durationMin as number) ?? null,
                    rrule: (d.rrule as string) ?? null,
                    completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                    snoozedUntil: d.snoozedUntil ? new Date(d.snoozedUntil as string) : null,
                    sortOrder: (d.sortOrder as number) ?? 0,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.task.create({
                data: {
                  id: item.id,
                  userId,
                  title: d.title as string,
                  description: (d.description as string) ?? null,
                  color: (d.color as string) ?? null,
                  projectId: (d.projectId as string) ?? null,
                  sectionId: (d.sectionId as string) ?? null,
                  parentId: (d.parentId as string) ?? null,
                  priority: (d.priority as number) ?? null,
                  deadlineDate: (d.deadlineDate ?? d.dueDate) ? new Date((d.deadlineDate ?? d.dueDate) as string) : null,
                  deadlineTime: ((d.deadlineTime ?? d.dueTime) as string | undefined) ?? null,
                  deadlineTimeZone: (d.deadlineTimeZone as string) ?? null,
                  startDate: d.startDate ? new Date(d.startDate as string) : null,
                  estimateMin: (d.estimateMin as number) ?? (d.durationMin as number) ?? null,
                  rrule: (d.rrule as string) ?? null,
                  completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                  snoozedUntil: d.snoozedUntil ? new Date(d.snoozedUntil as string) : null,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'timeBlock') {
            const existing = await prisma.timeBlock.findFirst({
              where: { id: item.id, userId },
            });
            if (item.version === 3) {
              const patch = (item.data.patch ?? item.data) as Record<string, FieldVersion>;
              const merged = mergeFieldPatch(
                patch,
                (existing?.fieldVersions as Record<string, string> | null | undefined) ?? {},
                existing?.updatedAt.toISOString() ?? new Date(0).toISOString(),
                ['taskId', 'startAt', 'endAt', 'timeZone', 'allDay', 'source', 'completedAt', 'actualMin', 'deletedAt'],
              );
              for (const conflict of merged.conflicts) {
                conflicts.push({ table, id: item.id, ...conflict });
                await prisma.syncLog.create({ data: {
                  userId,
                  direction: 'push',
                  action: 'conflict',
                  details: JSON.stringify({ table, ...conflict }),
                } });
              }
              if (Object.keys(merged.accepted).length === 0) continue;
              const data: Record<string, unknown> = {
                ...merged.accepted,
                fieldVersions: merged.fieldVersions,
                updatedAt: nextServerUpdatedAt(existing?.updatedAt),
              };
              for (const key of ['startAt', 'endAt', 'completedAt', 'deletedAt']) {
                if (key in data) data[key] = data[key] ? new Date(data[key] as string) : null;
              }
              const taskId = (data.taskId ?? existing?.taskId) as string | undefined;
              if (!taskId) continue;
              const ownedTask = await prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } });
              if (!ownedTask) continue;
              data.taskId = ownedTask.id;
              if (existing) await prisma.timeBlock.update({ where: { id: item.id }, data: data as any });
              else if (data.startAt && data.endAt && data.timeZone) await prisma.timeBlock.create({ data: { id: item.id, userId, ...data, createdAt: new Date() } as any });
              else continue;
              accepted.push(item.id);
              continue;
            }
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            const ownedTask = await prisma.task.findFirst({
              where: { id: d.taskId as string, userId, deletedAt: null },
              select: { id: true },
            });
            if (!ownedTask) continue;

            if (existing) {
              await prisma.timeBlock.update({
                where: { id: item.id },
                data: d.deletedAt
                  ? {
                      deletedAt: new Date(d.deletedAt as string),
                      updatedAt: incomingUpdated,
                    }
                  : {
                      taskId: ownedTask.id,
                      startAt: new Date(d.startAt as string),
                      endAt: new Date(d.endAt as string),
                      timeZone: d.timeZone as string,
                      allDay: (d.allDay as boolean) ?? false,
                      source: (d.source as any) ?? 'MANUAL',
                      completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                      actualMin: (d.actualMin as number) ?? null,
                      deletedAt: null,
                      updatedAt: incomingUpdated,
                    },
              });
            } else if (!d.deletedAt) {
              await prisma.timeBlock.create({
                data: {
                  id: item.id,
                  userId,
                  taskId: ownedTask.id,
                  startAt: new Date(d.startAt as string),
                  endAt: new Date(d.endAt as string),
                  timeZone: d.timeZone as string,
                  allDay: (d.allDay as boolean) ?? false,
                      source: (d.source as any) ?? 'MANUAL',
                      completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                      actualMin: (d.actualMin as number) ?? null,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'project') {
            const existing = await prisma.project.findFirst({
              where: { id: item.id, userId },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.project.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.project.update({
                  where: { id: item.id },
                  data: {
                    name: d.name as string,
                    color: (d.color as string) ?? null,
                    isArchived: (d.isArchived as boolean) ?? false,
                    sortOrder: (d.sortOrder as number) ?? 0,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.project.create({
                data: {
                  id: item.id,
                  userId,
                  name: d.name as string,
                  color: (d.color as string) ?? null,
                  isArchived: (d.isArchived as boolean) ?? false,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'tag') {
            const existing = await prisma.tag.findFirst({
              where: { id: item.id, userId },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.tag.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.tag.update({
                  where: { id: item.id },
                  data: {
                    name: d.name as string,
                    color: (d.color as string) ?? null,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.tag.create({
                data: {
                  id: item.id,
                  userId,
                  name: d.name as string,
                  color: (d.color as string) ?? null,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'section') {
            const existing = await prisma.section.findFirst({
              where: { id: item.id, project: { userId } },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.section.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.section.update({
                  where: { id: item.id },
                  data: {
                    name: d.name as string,
                    sortOrder: (d.sortOrder as number) ?? 0,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.section.create({
                data: {
                  id: item.id,
                  projectId: d.projectId as string,
                  name: d.name as string,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'note') {
            const existing = await prisma.note.findFirst({
              where: { id: item.id, userId },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.note.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.note.update({
                  where: { id: item.id },
                  data: {
                    title: (d.title as string) ?? null,
                    content: (d.content as string) ?? null,
                    taskId: (d.taskId as string) ?? null,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.note.create({
                data: {
                  id: item.id,
                  userId,
                  title: (d.title as string) ?? null,
                  content: (d.content as string) ?? null,
                  taskId: (d.taskId as string) ?? null,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'countdown') {
            const existing = await prisma.countdown.findFirst({
              where: { id: item.id, userId },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.countdown.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.countdown.update({
                  where: { id: item.id },
                  data: {
                    title: d.title as string,
                    targetDate: new Date(d.targetDate as string),
                    color: (d.color as string) ?? null,
                    imageUrl: (d.imageUrl as string) ?? null,
                    reminderDaysBefore: (d.reminderDaysBefore as number) ?? null,
                    showInCalendar: Boolean(d.showInCalendar),
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.countdown.create({
                data: {
                  id: item.id,
                  userId,
                  title: d.title as string,
                  targetDate: new Date(d.targetDate as string),
                  color: (d.color as string) ?? null,
                  imageUrl: (d.imageUrl as string) ?? null,
                  reminderDaysBefore: (d.reminderDaysBefore as number) ?? null,
                  showInCalendar: Boolean(d.showInCalendar),
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'reminder') {
            const existing = await prisma.reminder.findFirst({
              where: { id: item.id, task: { userId } },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              await prisma.reminder.update({
                where: { id: item.id },
                data: {
                  remindAt: new Date(d.remindAt as string),
                  type: d.type as any,
                  isSent: (d.isSent as boolean) ?? false,
                  updatedAt: incomingUpdated,
                },
              });
            } else {
              await prisma.reminder.create({
                data: {
                  id: item.id,
                  taskId: d.taskId as string,
                  remindAt: new Date(d.remindAt as string),
                  type: (d.type as any) ?? 'push',
                  isSent: (d.isSent as boolean) ?? false,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'projectColumn') {
            const existing = await prisma.projectColumn.findFirst({
              where: { id: item.id, project: { userId } },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              if (d.deletedAt) {
                await prisma.projectColumn.update({
                  where: { id: item.id },
                  data: { deletedAt: new Date(d.deletedAt as string), updatedAt: incomingUpdated },
                });
              } else {
                await prisma.projectColumn.update({
                  where: { id: item.id },
                  data: {
                    name: d.name as string,
                    color: (d.color as string) ?? 'slate',
                    isDone: (d.isDone as boolean) ?? false,
                    sortOrder: (d.sortOrder as number) ?? 0,
                    updatedAt: incomingUpdated,
                  },
                });
              }
            } else {
              await prisma.projectColumn.create({
                data: {
                  id: item.id,
                  projectId: d.projectId as string,
                  name: d.name as string,
                  color: (d.color as string) ?? 'slate',
                  isDone: (d.isDone as boolean) ?? false,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'taskChecklistItem') {
            const existing = await prisma.taskChecklistItem.findFirst({
              where: { id: item.id, task: { userId } },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              await prisma.taskChecklistItem.update({
                where: { id: item.id },
                data: {
                  title: d.title as string,
                  completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  updatedAt: incomingUpdated,
                },
              });
            } else {
              await prisma.taskChecklistItem.create({
                data: {
                  id: item.id,
                  taskId: d.taskId as string,
                  title: d.title as string,
                  completedAt: d.completedAt ? new Date(d.completedAt as string) : null,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          } else if (table === 'area') {
            const existing = await prisma.area.findFirst({
              where: { id: item.id, userId },
            });
            if (existing && incomingUpdated <= existing.updatedAt) continue;

            const d = item.data;
            if (existing) {
              await prisma.area.update({
                where: { id: item.id },
                data: {
                  name: d.name as string,
                  color: (d.color as string) ?? null,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  updatedAt: incomingUpdated,
                },
              });
            } else {
              await prisma.area.create({
                data: {
                  id: item.id,
                  userId,
                  name: d.name as string,
                  color: (d.color as string) ?? null,
                  sortOrder: (d.sortOrder as number) ?? 0,
                  createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
                  updatedAt: incomingUpdated,
                },
              });
            }
            accepted.push(item.id);
          }
        } catch {
          // Skip items that fail (e.g., foreign key violations)
          continue;
        }
      }

      const serverTime = new Date().toISOString();

      return reply.send({
        success: true,
        data: { version: 3, accepted, conflicts, serverTime },
      });
    }
  );
}
