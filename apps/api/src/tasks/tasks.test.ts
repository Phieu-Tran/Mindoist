import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { taskRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let projectId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(taskRoutes);

  const user = await createTestUser('task-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('task-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;

  const p = await prisma.project.create({ data: { userId, name: 'Test Project' } });
  projectId = p.id;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  // Scoped cleanup: only this user's tasks
  const tags = await prisma.taskTag.findMany({ where: { task: { userId } } });
  if (tags.length) {
    await prisma.taskTag.deleteMany({ where: { task: { userId } } });
  }
  await prisma.task.deleteMany({ where: { userId } });
});

function today() {
  return new Date();
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

describe('Task CRUD', () => {
  it('POST /tasks creates a task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'My Task', projectId },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe('My Task');
    expect(body.data.projectId).toBe(projectId);
    expect(body.data.completedAt).toBeNull();
  });

  it('POST /tasks rejects empty title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /tasks/:id returns task', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Detail Task', projectId },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.title).toBe('Detail Task');
  });

  it('GET /tasks/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks/nonexistent',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /tasks/:id updates task', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Old', projectId },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'New', priority: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.title).toBe('New');
    expect(body.data.priority).toBe(1);
  });

  it('DELETE /tasks/:id soft-deletes', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Doomed', projectId },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const db = await prisma.task.findUnique({ where: { id: t.id } });
    expect(db?.deletedAt).not.toBeNull();
  });

  it('DELETE /tasks/:id excludes soft-deleted from list', async () => {
    const active = await prisma.task.create({
      data: { userId, title: 'Active', projectId },
    });
    await prisma.task.create({
      data: { userId, title: 'Deleted', projectId, deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(active.id);
  });

  it('POST /tasks/:id/restore restores a soft-deleted task', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Restore me', projectId, deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/restore`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe(t.id);
    expect(body.data.deletedAt).toBeNull();
    await expect(prisma.task.findUnique({ where: { id: t.id } }))
      .resolves.toMatchObject({ deletedAt: null });
  });

  it('POST /tasks/:id/restore does not restore another user task', async () => {
    const t = await prisma.task.create({
      data: { userId: otherId, title: 'Other deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/restore`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(404);
    await expect(prisma.task.findUnique({ where: { id: t.id } }))
      .resolves.toMatchObject({ deletedAt: expect.any(Date) });
  });
});

describe('Subtask nesting guard (B2.5: at most one level of parentId)', () => {
  it('POST /tasks rejects parentId pointing at a task that is itself a subtask', async () => {
    const grandparent = await prisma.task.create({ data: { userId, title: 'Parent' } });
    const child = await prisma.task.create({ data: { userId, title: 'Child', parentId: grandparent.id } });

    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Grandchild', parentId: child.id },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/nest subtask/i);
  });

  it('POST /tasks accepts parentId pointing at a top-level task', async () => {
    const parent = await prisma.task.create({ data: { userId, title: 'Parent' } });

    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Child', parentId: parent.id },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.parentId).toBe(parent.id);
  });

  it('PATCH /tasks/:id rejects parentId pointing at a task that is itself a subtask', async () => {
    const grandparent = await prisma.task.create({ data: { userId, title: 'Parent' } });
    const child = await prisma.task.create({ data: { userId, title: 'Child', parentId: grandparent.id } });
    const standalone = await prisma.task.create({ data: { userId, title: 'Standalone' } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${standalone.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { parentId: child.id },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/nest subtask/i);
  });
});

describe('Checklist items (B2.8)', () => {
  it('GET /tasks/:id/checklist-items returns empty for a fresh task', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });

  it('GET /tasks/:id/checklist-items 404s for another user\'s task', async () => {
    const task = await prisma.task.create({ data: { userId: otherId, title: 'Not yours' } });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /tasks/:id/checklist-items creates an item and auto-assigns sortOrder', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const first = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'First item' },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body).data;
    expect(firstBody.title).toBe('First item');
    expect(firstBody.completedAt).toBeNull();

    const second = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Second item' },
    });
    const secondBody = JSON.parse(second.body).data;
    expect(secondBody.sortOrder).toBeGreaterThan(firstBody.sortOrder);
  });

  it('POST /tasks/:id/checklist-items rejects an empty title', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks/:id/checklist-items 404s for another user\'s task', async () => {
    const task = await prisma.task.create({ data: { userId: otherId, title: 'Not yours' } });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checklist-items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Sneaky item' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /checklist-items/:id toggles completedAt', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'Item', sortOrder: 1 } });

    const complete = await app.inject({
      method: 'PATCH',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { completedAt: '2026-07-24T10:00:00.000Z' },
    });
    expect(complete.statusCode).toBe(200);
    expect(JSON.parse(complete.body).data.completedAt).not.toBeNull();

    const reopen = await app.inject({
      method: 'PATCH',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { completedAt: null },
    });
    expect(JSON.parse(reopen.body).data.completedAt).toBeNull();
  });

  it('PATCH /checklist-items/:id renames the item', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'Old title', sortOrder: 1 } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'New title' },
    });
    expect(JSON.parse(res.body).data.title).toBe('New title');
  });

  it('PATCH /checklist-items/:id 404s for another user\'s item', async () => {
    const task = await prisma.task.create({ data: { userId: otherId, title: 'Not yours' } });
    const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'Item', sortOrder: 1 } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /checklist-items/:id removes the item', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Task with checklist' } });
    const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'Item', sortOrder: 1 } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    await expect(prisma.taskChecklistItem.findUnique({ where: { id: item.id } })).resolves.toBeNull();
  });

  it('DELETE /checklist-items/:id 404s for another user\'s item', async () => {
    const task = await prisma.task.create({ data: { userId: otherId, title: 'Not yours' } });
    const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'Item', sortOrder: 1 } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/checklist-items/${item.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
    await expect(prisma.taskChecklistItem.findUnique({ where: { id: item.id } })).resolves.not.toBeNull();
  });
});

describe('Task startDate (date range)', () => {
  it('POST /tasks creates a task with startDate + dueDate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Ranged', startDate: '2026-07-20', dueDate: '2026-07-25' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.startDate).toContain('2026-07-20');
    expect(body.data.dueDate).toContain('2026-07-25');
  });

  it('POST /tasks creates a task without startDate (null)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'No range', dueDate: '2026-07-25' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.startDate).toBeNull();
  });

  it('POST /tasks rejects startDate after dueDate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Bad range', startDate: '2026-07-26', dueDate: '2026-07-25' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /tasks/:id sets and clears startDate', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Patch range', dueDate: new Date('2026-07-25') },
    });
    const set = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { startDate: '2026-07-20' },
    });
    expect(set.statusCode).toBe(200);
    expect(JSON.parse(set.body).data.startDate).toContain('2026-07-20');

    const clear = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { startDate: null },
    });
    expect(clear.statusCode).toBe(200);
    expect(JSON.parse(clear.body).data.startDate).toBeNull();
  });

  it('PATCH /tasks/:id rejects startDate after the existing dueDate', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Patch bad range', dueDate: new Date('2026-07-25') },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { startDate: '2026-08-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /tasks/:id rejects moving dueDate before the existing startDate', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Patch bad due', startDate: new Date('2026-07-20'), dueDate: new Date('2026-07-25') },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { dueDate: '2026-07-10' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Task smart list filters', () => {
  it('filter=inbox excludes completed tasks (Inbox is an active worklist, not everything)', async () => {
    await prisma.task.create({
      data: { userId, title: 'Open, no date' },
    });
    await prisma.task.create({
      data: { userId, title: 'Done, no date', completedAt: new Date() },
    });
    await prisma.task.create({
      data: { userId, title: 'Open, has due date', dueDate: tomorrow() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=inbox',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    const titles = body.data.map((t: { title: string }) => t.title).sort();
    expect(titles).toEqual(['Open, has due date', 'Open, no date']);
  });

  it('filter=today returns today tasks', async () => {
    await prisma.task.create({
      data: { userId, title: 'Today Task', dueDate: today() },
    });
    await prisma.task.create({
      data: { userId, title: 'Yesterday Task', dueDate: yesterday() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=today',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Today Task');
  });

  it('filter=upcoming returns future tasks', async () => {
    await prisma.task.create({
      data: { userId, title: 'Tomorrow', dueDate: tomorrow() },
    });
    await prisma.task.create({
      data: { userId, title: 'Yesterday', dueDate: yesterday() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=upcoming',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Tomorrow');
  });

  it('filter=upcoming excludes tasks due more than 7 days out (Next 7 Days is not just "any future task")', async () => {
    await prisma.task.create({
      data: { userId, title: 'In 3 days', dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; })() },
    });
    await prisma.task.create({
      data: { userId, title: 'In 10 days', dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 10); return d; })() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=upcoming',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['In 3 days']);
  });

  it('filter=overdue returns past tasks', async () => {
    await prisma.task.create({
      data: { userId, title: 'Late', dueDate: yesterday() },
    });
    await prisma.task.create({
      data: { userId, title: 'Future', dueDate: tomorrow() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=overdue',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Late');
  });

  it('filter=completed returns completed tasks', async () => {
    await prisma.task.create({
      data: { userId, title: 'Done', completedAt: new Date() },
    });
    await prisma.task.create({
      data: { userId, title: 'Open' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?filter=completed',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Done');
  });

  it('filter=today/upcoming/overdue still include subtasks (no dueDate of their own) so the frontend can compute accurate done/total counts', async () => {
    const parentToday = await prisma.task.create({ data: { userId, title: 'Parent due today', dueDate: today() } });
    await prisma.task.create({ data: { userId, title: 'Open subtask', parentId: parentToday.id } });
    await prisma.task.create({ data: { userId, title: 'Done subtask', parentId: parentToday.id, completedAt: new Date() } });

    const parentUpcoming = await prisma.task.create({ data: { userId, title: 'Parent due tomorrow', dueDate: tomorrow() } });
    await prisma.task.create({ data: { userId, title: 'Upcoming subtask', parentId: parentUpcoming.id } });

    const parentOverdue = await prisma.task.create({ data: { userId, title: 'Parent overdue', dueDate: yesterday() } });
    await prisma.task.create({ data: { userId, title: 'Overdue subtask', parentId: parentOverdue.id } });

    for (const [filter, parent, subtaskCount] of [
      ['today', parentToday, 2],
      ['upcoming', parentUpcoming, 1],
      ['overdue', parentOverdue, 1],
    ] as const) {
      const res = await app.inject({
        method: 'GET',
        url: `/tasks?filter=${filter}`,
        headers: { authorization: `Bearer ${userToken}` },
      });
      const body = JSON.parse(res.body);
      const subtasks = body.data.filter((t: { parentId: string | null }) => t.parentId === parent.id);
      expect(subtasks).toHaveLength(subtaskCount);
    }
  });
});

describe('Task complete/reopen', () => {
  it('POST /tasks/:id/complete marks done', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Do this', projectId },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.completedAt).not.toBeNull();
  });

  it('POST /tasks/:id/reopen clears completedAt', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Reopen me', completedAt: new Date(), projectId },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/reopen`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.completedAt).toBeNull();
  });
});

describe('Task Pomodoro completion', () => {
  it('increments pomodoroCount for the task owner', async () => {
    const task = await prisma.task.create({
      data: { userId, title: 'Focus session', projectId, pomodoroCount: 1 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/pomodoro/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.pomodoroCount).toBe(2);
    await expect(prisma.task.findUnique({ where: { id: task.id } }))
      .resolves.toMatchObject({ pomodoroCount: 2 });
  });

  it('does not let another user increment the task', async () => {
    const task = await prisma.task.create({
      data: { userId: otherId, title: 'Private focus session' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/pomodoro/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(404);
    await expect(prisma.task.findUnique({ where: { id: task.id } }))
      .resolves.toMatchObject({ pomodoroCount: 0 });
  });

  it('returns not found for a soft-deleted task', async () => {
    const task = await prisma.task.create({
      data: { userId, title: 'Deleted focus session', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/pomodoro/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(404);
    await expect(prisma.task.findUnique({ where: { id: task.id } }))
      .resolves.toMatchObject({ pomodoroCount: 0 });
  });

  it('returns not found for an unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/00000000-0000-0000-0000-000000000000/pomodoro/complete',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('Recurring tasks (RRULE)', () => {
  it('complete task with DAILY rrule creates next occurrence +1 day', async () => {
    const t = await prisma.task.create({
      data: {
        userId,
        title: 'Daily Standup',
        projectId,
        dueDate: new Date('2026-07-18T00:00:00Z'),
        rrule: 'FREQ=DAILY',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.data.completedAt).not.toBeNull();
    expect(body.data.nextTask).not.toBeNull();
    expect(body.data.nextTask.title).toBe('Daily Standup');
    expect(body.data.nextTask.dueDate).toBe('2026-07-19T00:00:00.000Z');
    expect(body.data.nextTask.rrule).toBe('FREQ=DAILY');
  });

  it('complete task with COUNT=1 rrule does NOT create next occurrence', async () => {
    const t = await prisma.task.create({
      data: {
        userId,
        title: 'One-off',
        projectId,
        dueDate: new Date('2026-07-18T00:00:00Z'),
        rrule: 'FREQ=DAILY;COUNT=1',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.completedAt).not.toBeNull();
    expect(body.data.nextTask).toBeNull();
  });

  it('complete task without rrule does NOT create next occurrence', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Normal', projectId },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.completedAt).not.toBeNull();
    expect(body.data.nextTask).toBeNull();
  });

  it('reopen does not spawn a new occurrence', async () => {
    const t = await prisma.task.create({
      data: {
        userId,
        title: 'Reopen R',
        projectId,
        dueDate: new Date('2026-07-18T00:00:00Z'),
        rrule: 'FREQ=DAILY',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/reopen`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.completedAt).toBeNull();
    expect(body.data.nextTask).toBeUndefined();
  });

  it('create task rejects invalid rrule', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Bad', projectId, rrule: 'NOT-A-RULE' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('update task rejects invalid rrule', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Valid', projectId },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { rrule: 'INVALID' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('next task inherits title/description/priority/project/tags/rrule', async () => {
    const tag = await prisma.tag.create({ data: { userId, name: 'recurring-tag' } });
    const t = await prisma.task.create({
      data: {
        userId,
        title: 'Recurring Tagged',
        description: 'with desc',
        projectId,
        priority: 1,
        dueDate: new Date('2026-07-18T00:00:00Z'),
        dueTime: '09:00',
        rrule: 'FREQ=WEEKLY',
        taskTags: { create: { tagId: tag.id } },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const nt = body.data.nextTask;
    expect(nt).not.toBeNull();
    expect(nt.title).toBe('Recurring Tagged');
    expect(nt.description).toBe('with desc');
    expect(nt.priority).toBe(1);
    expect(nt.projectId).toBe(projectId);
    expect(nt.rrule).toBe('FREQ=WEEKLY');

    // Verify tags copied
    const tags = await prisma.taskTag.findMany({ where: { taskId: nt.id } });
    expect(tags).toHaveLength(1);
    expect(tags[0].tagId).toBe(tag.id);
  });

  it('next task respects user isolation (belongs to same user)', async () => {
    const t = await prisma.task.create({
      data: {
        userId,
        title: 'Isolated DAILY',
        projectId,
        dueDate: new Date('2026-07-18T00:00:00Z'),
        rrule: 'FREQ=DAILY',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${t.id}/complete`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const nt = JSON.parse(res.body).data.nextTask;
    expect(nt).not.toBeNull();
    expect(nt.userId).toBe(userId);

    // Other user cannot see the new task
    const read = await app.inject({
      method: 'GET',
      url: `/tasks/${nt.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(read.statusCode).toBe(404);
  });
});

describe('Project workspace columns', () => {
  it('infers the project from an owned column and rejects a foreign column', async () => {
    const column = await prisma.projectColumn.create({
      data: { projectId, name: 'Review', sortOrder: 20 },
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Review release', projectColumnId: column.id },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(JSON.parse(createResponse.body).data).toMatchObject({
      projectId,
      projectColumnId: column.id,
    });

    const foreignProject = await prisma.project.create({
      data: { userId: otherId, name: 'Foreign board' },
    });
    const foreignColumn = await prisma.projectColumn.create({
      data: { projectId: foreignProject.id, name: 'Private' },
    });
    const foreignResponse = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Cannot move here', projectColumnId: foreignColumn.id },
    });
    expect(foreignResponse.statusCode).toBe(400);
  });

  it('clears the workspace column when a task leaves its project', async () => {
    const column = await prisma.projectColumn.create({
      data: { projectId, name: 'Doing', sortOrder: 21 },
    });
    const task = await prisma.task.create({
      data: { userId, projectId, projectColumnId: column.id, title: 'Move out' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { projectId: null },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toMatchObject({
      projectId: null,
      projectColumnId: null,
    });
  });

  it('moves a task through the dedicated workspace endpoint', async () => {
    const column = await prisma.projectColumn.create({
      data: { projectId, name: 'Destination', sortOrder: 22 },
    });
    const task = await prisma.task.create({
      data: { userId, title: 'Drag me' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/move`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { columnId: column.id, order: 4 },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toMatchObject({
      projectId,
      projectColumnId: column.id,
      sortOrder: 4,
    });
  });

  it('rejects moving a task already in a project into a column from a different project (rollup boards must not silently reparent sub-project tasks)', async () => {
    const otherProject = await prisma.project.create({
      data: { userId, name: 'Sub-project', parentId: projectId },
    });
    const otherColumn = await prisma.projectColumn.create({
      data: { projectId: otherProject.id, name: 'Backlog', sortOrder: 0 },
    });
    const task = await prisma.task.create({
      data: { userId, projectId: otherProject.id, title: 'Belongs to sub-project' },
    });
    const column = await prisma.projectColumn.create({
      data: { projectId, name: 'Parent column', sortOrder: 23 },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/move`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { columnId: column.id },
    });
    expect(response.statusCode).toBe(400);

    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.projectId).toBe(otherProject.id);
    expect(unchanged.projectColumnId).toBeNull();

    // Moving within its own sub-project's columns still works.
    const withinOwnProject = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/move`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { columnId: otherColumn.id },
    });
    expect(withinOwnProject.statusCode).toBe(200);
    expect(JSON.parse(withinOwnProject.body).data).toMatchObject({
      projectId: otherProject.id,
      projectColumnId: otherColumn.id,
    });
  });
});

describe('Task sort order', () => {
  it('PATCH /tasks/:id updates sortOrder', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Sortable', projectId },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { sortOrder: 10.5 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.sortOrder).toBe(10.5);
  });

  it('GET /tasks returns sorted by sortOrder', async () => {
    await prisma.task.create({
      data: { userId, title: 'Second', projectId, sortOrder: 2 },
    });
    await prisma.task.create({
      data: { userId, title: 'First', projectId, sortOrder: 1 },
    });
    await prisma.task.create({
      data: { userId, title: 'Third', projectId, sortOrder: 3 },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.map((t: any) => t.title)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });
});

describe('Task user isolation', () => {
  it('other user cannot read', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Secret', projectId },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('other user cannot update', async () => {
    const t = await prisma.task.create({
      data: { userId, title: 'Nope', projectId },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { title: 'Hacked' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Task search (q=)', () => {
  it('matches title case-insensitive', async () => {
    await prisma.task.create({ data: { userId, title: 'Buy Milk', projectId } });
    await prisma.task.create({ data: { userId, title: 'buy eggs', projectId } });
    await prisma.task.create({ data: { userId, title: 'WALK DOG', projectId } });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?q=buy',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((t: any) => t.title).sort()).toEqual(['Buy Milk', 'buy eggs']);
  });

  it('matches description case-insensitive', async () => {
    await prisma.task.create({ data: { userId, title: 'Task 1', description: 'meeting at noon', projectId } });
    await prisma.task.create({ data: { userId, title: 'Task 2', description: 'call mom', projectId } });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?q=meeting',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Task 1');
  });

  it('combines q= with filter=completed', async () => {
    await prisma.task.create({ data: { userId, title: 'Done milk', completedAt: new Date(), projectId } });
    await prisma.task.create({ data: { userId, title: 'Open milk', projectId } });
    await prisma.task.create({ data: { userId, title: 'Done eggs', completedAt: new Date(), projectId } });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?q=milk&filter=completed',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Done milk');
  });

  it('does not leak other user tasks', async () => {
    await prisma.task.create({ data: { userId, title: 'My task', projectId } });
    await prisma.task.create({ data: { userId: otherId, title: 'Other task', projectId } });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?q=task',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('My task');
  });

  it('excludes soft-deleted tasks from search', async () => {
    await prisma.task.create({ data: { userId, title: 'Active task', projectId } });
    await prisma.task.create({ data: { userId, title: 'Deleted task', projectId, deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?q=task',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Active task');
  });
});

describe('GET /task-counts', () => {
  it('excludes subtasks from every count so sidebar badges match the visible list', async () => {
    const parent = await prisma.task.create({ data: { userId, title: 'Parent', dueDate: today() } });
    // No due date -> would land in "inbox" if counted like a top-level task.
    await prisma.task.create({ data: { userId, title: 'Sub inbox', parentId: parent.id } });
    // Due today -> would land in "today".
    await prisma.task.create({ data: { userId, title: 'Sub today', parentId: parent.id, dueDate: today() } });
    // Completed -> would land in "completed".
    await prisma.task.create({ data: { userId, title: 'Sub completed', parentId: parent.id, completedAt: new Date() } });
    // Soft-deleted -> would land in "trashed".
    await prisma.task.create({ data: { userId, title: 'Sub trashed', parentId: parent.id, deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: '/task-counts',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.inbox).toBe(0);
    expect(body.data.today).toBe(1);
    expect(body.data.completed).toBe(0);
    expect(body.data.trashed).toBe(0);
  });
});

describe('Task tags', () => {
  it('GET/POST /tasks report an empty tagIds array for an untagged task', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Untagged' },
    });
    expect(JSON.parse(created.body).data.tagIds).toEqual([]);

    const listed = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const task = JSON.parse(listed.body).data.find((t: { title: string }) => t.title === 'Untagged');
    expect(task.tagIds).toEqual([]);
  });

  it('PATCH /tasks/:id with tagIds assigns tags and GET reflects them', async () => {
    const tag = await prisma.tag.create({ data: { userId, name: 'urgent' } });
    const t = await prisma.task.create({ data: { userId, title: 'Tag me' } });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { tagIds: [tag.id] },
    });
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).data.tagIds).toEqual([tag.id]);

    const fetched = await app.inject({
      method: 'GET',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(fetched.body).data.tagIds).toEqual([tag.id]);
  });

  it('PATCH /tasks/:id with tagIds: [] clears existing tags', async () => {
    const tag = await prisma.tag.create({ data: { userId, name: 'clear-me' } });
    const t = await prisma.task.create({
      data: { userId, title: 'Untag me', taskTags: { create: [{ tagId: tag.id }] } },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { tagIds: [] },
    });
    expect(JSON.parse(res.body).data.tagIds).toEqual([]);
  });

  it('PATCH /tasks/:id rejects a tag id owned by another user', async () => {
    const otherTag = await prisma.tag.create({ data: { userId: otherId, name: 'not-yours' } });
    const t = await prisma.task.create({ data: { userId, title: 'Mine' } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { tagIds: [otherTag.id] },
    });
    expect(res.statusCode).toBe(400);

    await prisma.tag.delete({ where: { id: otherTag.id } });
  });
});
