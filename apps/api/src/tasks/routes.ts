import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { nextOccurrence } from '@mindoist/shared/recurrence';
import { pushTaskToGCal, removeTaskFromGCal } from '../gcal/service.js';
import { deleteSyncedTaskEvents, syncTimeBlocksToProvider } from '../calendar/provider-sync.js';
import { googleCalendarProvider } from '../calendar/providers/google.js';
import { createTaskSchema, moveTaskSchema, updateTaskSchema } from './schema.js';
import { endOfDay, startOfDay } from './date.js';
import { isValidRrule } from './recurrence.js';
import { taskTagsInclude } from './repository.js';
import { toTaskResponse } from './mapper.js';
import { getTaskCounts } from './service.js';
import { applyDeadlineInput, mirrorLegacyDeadline } from './deadline.js';

export async function taskRoutes(app: FastifyInstance) {
  // Sidebar counts (lightweight — no full task objects)
  app.get('/task-counts', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const counts = await getTaskCounts(userId);
    return reply.send({ success: true, data: counts });
  });

  // Subtasks for a specific parent
  app.get('/tasks/:id/subtasks', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    const subtasks = await prisma.task.findMany({
      where: { parentId: id, userId: request.auth!.sub, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ success: true, data: subtasks });
  });

  // --- Checklist Items CRUD ---

  // GET /tasks/:id/checklist-items — list items for a task
  app.get('/tasks/:id/checklist-items', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    const items = await prisma.taskChecklistItem.findMany({
      where: { taskId: id },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ success: true, data: items });
  });

  // POST /tasks/:id/checklist-items — create a new checklist item
  app.post('/tasks/:id/checklist-items', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    const body = request.body as { title: string; sortOrder?: number };
    if (!body.title?.trim()) {
      return reply.status(400).send({ success: false, error: 'Title is required' });
    }
    // If sortOrder not provided, append to end
    const sortOrder = body.sortOrder ?? (await prisma.taskChecklistItem.count({ where: { taskId: id } })) + 1;
    const item = await prisma.taskChecklistItem.create({
      data: {
        taskId: id,
        title: body.title.trim(),
        sortOrder,
      },
    });
    return reply.status(201).send({ success: true, data: item });
  });

  // PATCH /checklist-items/:id — update (toggle, edit title, reorder)
  app.patch('/checklist-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.taskChecklistItem.findFirst({
      where: { id, task: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Checklist item not found' });
    }
    const body = request.body as { title?: string; completedAt?: string | null; sortOrder?: number };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.completedAt !== undefined) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const updated = await prisma.taskChecklistItem.update({ where: { id }, data });
    return reply.send({ success: true, data: updated });
  });

  // DELETE /checklist-items/:id — delete an item
  app.delete('/checklist-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.taskChecklistItem.findFirst({
      where: { id, task: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Checklist item not found' });
    }
    await prisma.taskChecklistItem.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // List tasks with optional smart list filter and search
  app.get('/tasks', { preHandler: requireAuth }, async (request, reply) => {
    const { filter, projectId, tagId, q } = request.query as {
      filter?: string;
      projectId?: string;
      tagId?: string;
      q?: string;
    };

    const where: any = { userId: request.auth!.sub, deletedAt: null };

    if (projectId) {
      // Roll up tasks from sub-projects too, so a parent project's board/list
      // shows work tracked under its children (mirrors GET /projects/:id/workspace).
      const userProjects = await prisma.project.findMany({
        where: { userId: request.auth!.sub, deletedAt: null },
        select: { id: true, parentId: true },
      });
      const descendantIds = new Set([projectId]);
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
      where.projectId = { in: Array.from(descendantIds) };
    }

    if (tagId) {
      where.taskTags = { some: { tagId } };
    }

    // Global search on title + description (case-insensitive)
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (filter) {
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const next7End = new Date(todayEnd);
      next7End.setDate(next7End.getDate() + 7);

      switch (filter) {
        case 'inbox':
          where.completedAt = null;
          break;
        case 'today':
          where.completedAt = null;
          where.dueDate = { gte: todayStart, lte: todayEnd };
          break;
        case 'upcoming':
          where.completedAt = null;
          where.dueDate = { gt: todayEnd, lte: next7End };
          break;
        case 'overdue':
          where.completedAt = null;
          where.dueDate = { lt: todayStart };
          break;
        case 'completed':
          where.completedAt = { not: null };
          break;
        case 'trashed':
          where.deletedAt = { not: null };
          break;
      }
    }

    // Ensure subtasks are always included in the response regardless of the
    // view filter, so the frontend can compute accurate subtask stats
    // (done / total) on the parent row.  Without this, completing a subtask
    // sets its completedAt, which causes the inbox/today/upcoming/overdue
    // filter (completedAt: null) to exclude it, and the subtaskStats useMemo
    // under-counts because the completed subtask is simply absent from the
    // array. The dueDate range (today/upcoming/overdue) must move into the
    // same branch too — subtasks are created without their own dueDate, so
    // leaving dueDate as a top-level AND condition would still exclude every
    // subtask from those three views.
    if (where.completedAt === null) {
      const existingOr = where.OR;
      const existingDueDate = where.dueDate;
      delete where.completedAt;
      delete where.dueDate;
      const viewBranch: any = { completedAt: null };
      if (existingDueDate) viewBranch.dueDate = existingDueDate;
      if (existingOr) viewBranch.OR = existingOr;
      where.OR = [
        { parentId: { not: null } },
        viewBranch,
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: taskTagsInclude,
    });
    return reply.send({ success: true, data: tasks.map(toTaskResponse) });
  });

  // Create task
  app.post('/tasks', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    if (!isValidRrule(parsed.data.rrule)) {
      return reply.status(400).send({ success: false, error: 'Invalid RRULE' });
    }

    if (parsed.data.parentId) {
      const parentTask = await prisma.task.findFirst({
        where: { id: parsed.data.parentId, userId: request.auth!.sub, deletedAt: null },
      });
      if (!parentTask) {
        return reply.status(400).send({ success: false, error: 'Parent task not found' });
      }
      if (parentTask.parentId) {
        return reply.status(400).send({ success: false, error: 'Cannot nest subtask under another subtask' });
      }
    }

    const { dueDate, dueTime, startDate, deadline, ...rest } = parsed.data;
    const data: any = { userId: request.auth!.sub, ...rest };
    if (deadline !== undefined) {
      applyDeadlineInput(data, deadline);
    } else {
      if (dueDate) data.dueDate = new Date(dueDate);
      if (dueTime !== undefined) data.dueTime = dueTime;
      mirrorLegacyDeadline(data, data.dueDate ?? null, dueTime ?? null);
    }
    if (startDate) data.startDate = new Date(startDate);

    // Validate startDate <= dueDate when both present
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
      return reply.status(400).send({ success: false, error: 'Start date must be before or equal to due date' });
    }

    if (data.projectColumnId) {
      const column = await prisma.projectColumn.findFirst({
        where: {
          id: data.projectColumnId,
          deletedAt: null,
          project: { userId: request.auth!.sub, deletedAt: null },
        },
      });
      if (!column || (data.projectId && data.projectId !== column.projectId)) {
        return reply.status(400).send({ success: false, error: 'Invalid project column' });
      }
      data.projectId = column.projectId;
    }

    const task = await prisma.task.create({ data });
    pushTaskToGCal(request.auth!.sub, task).catch(() => {});
    return reply.status(201).send({ success: true, data: toTaskResponse(task) });
  });

  // Get single task
  app.get('/tasks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
      include: taskTagsInclude,
    });

    if (!task) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    return reply.send({ success: true, data: toTaskResponse(task) });
  });

  app.patch('/tasks/:id/move', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = moveTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map(issue => issue.message).join(', ') });
    }
    const task = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!task) return reply.status(404).send({ success: false, error: 'Task not found' });
    const columnId = parsed.data.columnId || parsed.data.projectColumnId!;
    const column = await prisma.projectColumn.findFirst({
      where: {
        id: columnId,
        deletedAt: null,
        project: { userId: request.auth!.sub, deletedAt: null },
      },
    });
    if (!column) return reply.status(400).send({ success: false, error: 'Invalid project column' });
    // A project's workspace board rolls up tasks from its sub-projects too (see
    // GET /tasks descendant-projectId handling above), so this task may actually
    // belong to a *different* project than the one whose column was dropped on.
    // Only silently reassign projectId when the task didn't already belong to a
    // project (the normal "drag an Inbox task onto a board" flow) — otherwise a
    // rolled-up sub-project task would get silently reparented into the parent
    // just by moving it between columns in that shared board view.
    if (task.projectId && task.projectId !== column.projectId) {
      return reply.status(400).send({ success: false, error: 'Cannot move a task into a column from a different project' });
    }
    const updated = await prisma.task.update({
      where: { id },
      data: {
        projectId: column.projectId,
        projectColumnId: column.id,
        sortOrder: parsed.data.order ?? parsed.data.sortOrder ?? task.sortOrder,
      },
    });
    pushTaskToGCal(request.auth!.sub, updated).catch(() => {});
    if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
      await syncTimeBlocksToProvider(googleCalendarProvider, request.auth!.sub, { taskId: id })
        .catch(error => request.log.warn(error, 'Task Calendar sync failed'));
    }
    return reply.send({ success: true, data: updated });
  });

  // Update task
  app.patch('/tasks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    if (!isValidRrule(parsed.data.rrule)) {
      return reply.status(400).send({ success: false, error: 'Invalid RRULE' });
    }

    if (parsed.data.parentId) {
      if (parsed.data.parentId === id) {
        return reply.status(400).send({ success: false, error: 'A task cannot be its own parent' });
      }
      const parentTask = await prisma.task.findFirst({
        where: { id: parsed.data.parentId, userId: request.auth!.sub, deletedAt: null },
      });
      if (!parentTask) {
        return reply.status(400).send({ success: false, error: 'Parent task not found' });
      }
      if (parentTask.parentId === id) {
        return reply.status(400).send({ success: false, error: 'Cannot nest tasks in a cycle' });
      }
      if (parentTask.parentId) {
        return reply.status(400).send({ success: false, error: 'Cannot nest subtask under another subtask' });
      }
    }

    const { dueDate, dueTime, startDate, deadline, tagIds, ...rest } = parsed.data;
    const data: any = { ...rest };
    const scheduleChanged = deadline !== undefined || dueDate !== undefined || dueTime !== undefined;
    if (deadline !== undefined) {
      applyDeadlineInput(data, deadline);
    } else {
      if (dueDate !== undefined) {
        data.dueDate = dueDate ? new Date(dueDate) : null;
      }
      if (dueTime !== undefined) {
        data.dueTime = dueTime;
      }
      if (dueDate !== undefined || dueTime !== undefined) {
        const finalLegacyDueDate = data.dueDate !== undefined ? data.dueDate : existing.dueDate;
        const finalLegacyDueTime = data.dueTime !== undefined ? data.dueTime : existing.dueTime;
        mirrorLegacyDeadline(
          data,
          finalLegacyDueDate,
          finalLegacyDueTime,
          existing.deadlineTimeZone,
        );
      }
    }
    if (scheduleChanged) {
      data.dueNotificationSentAt = null;
    }
    if (startDate !== undefined) {
      data.startDate = startDate ? new Date(startDate) : null;
    }
    if (tagIds !== undefined && tagIds.length > 0) {
      const ownedCount = await prisma.tag.count({
        where: { id: { in: tagIds }, userId: request.auth!.sub, deletedAt: null },
      });
      if (ownedCount !== tagIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more tags not found' });
      }
    }
    if (tagIds !== undefined) {
      // Replace the full set atomically rather than diffing - simpler, and
      // the join table carries no data of its own worth preserving per row.
      data.taskTags = { deleteMany: {}, create: tagIds.map(tagId => ({ tagId })) };
    }

    // Validate startDate <= dueDate when both present after merge
    const finalStartDate = data.startDate !== undefined ? data.startDate : existing.startDate;
    const finalDueDate = data.dueDate !== undefined ? data.dueDate : existing.dueDate;
    if (finalStartDate && finalDueDate && finalStartDate > finalDueDate) {
      return reply.status(400).send({ success: false, error: 'Start date must be before or equal to due date' });
    }

    if (data.projectColumnId) {
      const column = await prisma.projectColumn.findFirst({
        where: {
          id: data.projectColumnId,
          deletedAt: null,
          project: { userId: request.auth!.sub, deletedAt: null },
        },
      });
      const targetProjectId = data.projectId === undefined ? existing.projectId : data.projectId;
      if (!column || (targetProjectId && targetProjectId !== column.projectId)) {
        return reply.status(400).send({ success: false, error: 'Invalid project column' });
      }
      data.projectId = column.projectId;
    } else if (data.projectId !== undefined && data.projectId !== existing.projectId) {
      data.projectColumnId = null;
    }

    const task = await prisma.task.update({ where: { id }, data, include: taskTagsInclude });
    pushTaskToGCal(request.auth!.sub, task).catch(() => {});
    if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
      await syncTimeBlocksToProvider(googleCalendarProvider, request.auth!.sub, { taskId: id })
        .catch(error => request.log.warn(error, 'Task Calendar sync failed'));
    }
    return reply.send({ success: true, data: toTaskResponse(task) });
  });

  // Delete task (soft)
  app.delete('/tasks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
      await deleteSyncedTaskEvents(googleCalendarProvider, request.auth!.sub, id);
    }

    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    removeTaskFromGCal(request.auth!.sub, id).catch(() => {});
    return reply.send({ success: true });
  });

  // Restore a soft-deleted task
  app.post('/tasks/:id/restore', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { deletedAt: null },
      include: taskTagsInclude,
    });
    pushTaskToGCal(request.auth!.sub, task).catch(() => {});
    return reply.send({ success: true, data: toTaskResponse(task) });
  });

  // Complete task
  app.post('/tasks/:id/complete', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { completedAt: new Date() },
      include: taskTagsInclude,
    });

    let nextTask: any = null;
    if (task.rrule && task.dueDate) {
      const dueDateObj = new Date(task.dueDate);
      // B2.9b: use completion date as reference when recurrenceBasis is COMPLETION_DATE
      const referenceDate = task.recurrenceBasis === 'COMPLETION_DATE' ? new Date() : dueDateObj;
      const nextDueDate = nextOccurrence(task.rrule, dueDateObj, referenceDate);
      if (nextDueDate) {
        const tags = await prisma.taskTag.findMany({
          where: { taskId: id },
          select: { tagId: true },
        });

        // Offset startDate by the same number of days as dueDate shifted
        let nextStartDate: Date | null = null;
        if (task.startDate) {
          const oldStart = new Date(task.startDate);
          const dayOffset = Math.round((dueDateObj.getTime() - oldStart.getTime()) / 86_400_000);
          nextStartDate = new Date(nextDueDate.getTime() - dayOffset * 86_400_000);
        }

        nextTask = await prisma.task.create({
          data: {
            userId: task.userId,
            projectId: task.projectId,
            projectColumnId: task.projectColumnId,
            sectionId: task.sectionId,
            parentId: task.parentId,
            title: task.title,
            description: task.description,
            color: task.color,
            priority: task.priority,
            dueDate: nextDueDate,
            startDate: nextStartDate,
            dueTime: task.dueTime,
            durationMin: task.durationMin,
            rrule: task.rrule,
            sortOrder: task.sortOrder,
            taskTags: tags.length > 0 ? { create: tags.map(t => ({ tagId: t.tagId })) } : undefined,
          },
        });

        // Create reminders for the next occurrence using the same relative offset
        const reminders = await prisma.reminder.findMany({
          where: { taskId: id },
        });
        for (const rem of reminders) {
          const oldRemindAt = new Date(rem.remindAt);
          const offsetMs = dueDateObj.getTime() - oldRemindAt.getTime();
          const nextRemindAt = new Date(nextDueDate.getTime() - offsetMs);
          await prisma.reminder.create({
            data: {
              taskId: nextTask.id,
              remindAt: nextRemindAt,
              type: rem.type,
            },
          });
        }

        // B2.9: Copy subtasks and checklist items based on recurringResetMode
        if (task.recurringResetMode !== 'KEEP') {
          // RESET mode: copy subtasks with completedAt=null
          const subtasks = await prisma.task.findMany({
            where: { parentId: id, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          });
          for (const sub of subtasks) {
            const subTags = await prisma.taskTag.findMany({
              where: { taskId: sub.id },
              select: { tagId: true },
            });
            await prisma.task.create({
              data: {
                userId: sub.userId,
                projectId: sub.projectId,
                projectColumnId: sub.projectColumnId,
                title: sub.title,
                description: sub.description,
                color: sub.color,
                priority: sub.priority,
                parentId: nextTask.id,
                sortOrder: sub.sortOrder,
                taskTags: subTags.length > 0 ? { create: subTags.map(t => ({ tagId: t.tagId })) } : undefined,
              },
            });
          }

          // RESET mode: copy checklist items with completedAt=null
          const checklistItems = await prisma.taskChecklistItem.findMany({
            where: { taskId: id },
            orderBy: { sortOrder: 'asc' },
          });
          for (const ci of checklistItems) {
            await prisma.taskChecklistItem.create({
              data: {
                taskId: nextTask.id,
                title: ci.title,
                sortOrder: ci.sortOrder,
              },
            });
          }
        }

        // Push new task to Google Calendar (fresh link, not copied from old task)
        pushTaskToGCal(request.auth!.sub, nextTask).catch(() => {});
      }
    }

    return reply.send({ success: true, data: { ...toTaskResponse(task), nextTask } });
  });

  // Record a completed Pomodoro work session
  app.post('/tasks/:id/pomodoro/complete', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { pomodoroCount: { increment: 1 } },
      include: taskTagsInclude,
    });
    return reply.send({ success: true, data: toTaskResponse(task) });
  });

  // ── Reminders CRUD ──────────────────────────────────────────────────────────

  // List reminders for a task
  app.get('/tasks/:id/reminders', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    const reminders = await prisma.reminder.findMany({
      where: { taskId: id },
      orderBy: { remindAt: 'asc' },
    });
    return reply.send({ success: true, data: reminders });
  });

  // Create reminder for a task
  app.post('/tasks/:id/reminders', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }
    const body = request.body as { remindAt: string; type?: 'email' | 'push' };
    if (!body.remindAt) {
      return reply.status(400).send({ success: false, error: 'remindAt is required' });
    }
    const remindAt = new Date(body.remindAt);
    if (Number.isNaN(remindAt.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid remindAt date' });
    }
    if (remindAt.getTime() <= Date.now()) {
      return reply
        .status(400)
        .send({ success: false, error: 'remindAt must be in the future' });
    }
    const reminder = await prisma.reminder.create({
      data: {
        taskId: id,
        remindAt,
        type: body.type || 'push',
      },
    });
    return reply.status(201).send({ success: true, data: reminder });
  });

  // Update reminder (snooze)
  app.patch('/reminders/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findFirst({
      where: { id, task: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Reminder not found' });
    }
    const body = request.body as { remindAt?: string; isSent?: boolean };
    const data: Record<string, unknown> = {};
    if (body.remindAt !== undefined) {
      const d = new Date(body.remindAt);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ success: false, error: 'Invalid remindAt date' });
      }
      if (d.getTime() <= Date.now()) {
        return reply
          .status(400)
          .send({ success: false, error: 'remindAt must be in the future' });
      }
      data.remindAt = d;
      data.isSent = false; // reset on snooze
    }
    if (body.isSent !== undefined) data.isSent = body.isSent;
    const reminder = await prisma.reminder.update({ where: { id }, data });
    return reply.send({ success: true, data: reminder });
  });

  // Delete reminder
  app.delete('/reminders/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findFirst({
      where: { id, task: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Reminder not found' });
    }
    await prisma.reminder.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Snooze reminder (convenience endpoint)
  app.post('/reminders/:id/snooze', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.reminder.findFirst({
      where: { id, task: { userId: request.auth!.sub } },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Reminder not found' });
    }
    const body = request.body as { minutes?: number };
    const minutes = body.minutes || 10;
    const newRemindAt = new Date(Date.now() + minutes * 60_000);
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { remindAt: newRemindAt, isSent: false },
    });
    return reply.send({ success: true, data: reminder });
  });

  // Reopen task
  app.post('/tasks/:id/reopen', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.task.findFirst({
      where: { id, userId: request.auth!.sub, deletedAt: null },
    });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { completedAt: null },
      include: taskTagsInclude,
    });
    return reply.send({ success: true, data: toTaskResponse(task) });
  });
}
