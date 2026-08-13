import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { syncRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { projectRoutes } from '../projects/routes.js';
import { tagRoutes } from '../tags/routes.js';
import { taskRoutes } from '../tasks/routes.js';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: ReturnType<typeof Fastify>;
let userId: string;
let token: string;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(projectRoutes);
  await app.register(tagRoutes);
  await app.register(taskRoutes);
  await app.register(syncRoutes, { prefix: '/sync' });
  await app.ready();

  const testUser = await createTestUser(`sync-test-${Date.now()}@test.com`);
  userId = testUser.user.id;
  token = testUser.token;
});

afterEach(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

describe('GET /sync/changes', () => {
  it('returns empty items for fresh sync', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sync/changes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.serverTime).toBeDefined();
  });

  it('returns all tasks since epoch', async () => {
    await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Sync task' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/sync/changes',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    const tasks = body.data.items.filter((i: any) => i.table === 'task');
    expect(tasks.length).toBe(1);
    expect(tasks[0].data.title).toBe('Sync task');
  });

  it('returns only changes after the since cursor', async () => {
    // Create task 1
    await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Old task' },
    });

    // Get cursor
    const mid = await app.inject({
      method: 'GET',
      url: '/sync/changes',
      headers: { authorization: `Bearer ${token}` },
    });
    const cursor = mid.json().data.serverTime;

    // Small delay
    await new Promise(r => setTimeout(r, 50));

    // Create task 2
    await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'New task' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/sync/changes?since=${cursor}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    const tasks = body.data.items.filter((i: any) => i.table === 'task');
    expect(tasks.length).toBe(1);
    expect(tasks[0].data.title).toBe('New task');
  });

  it('returns deleted items (soft delete)', async () => {
    // Create task
    const create = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'To delete' },
    });
    const taskId = create.json().data.id;

    // Delete it
    await app.inject({
      method: 'DELETE',
      url: `/tasks/${taskId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/sync/changes',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    const task = body.data.items.find((i: any) => i.table === 'task' && i.id === taskId);
    expect(task).toBeDefined();
    expect(task.data.deletedAt).not.toBeNull();
  });

  it('returns projects and tags', async () => {
    await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Sync project', color: '#ff0000' },
    });
    await app.inject({
      method: 'POST',
      url: '/tags',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'sync-tag' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/sync/changes',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.data.items.some((i: any) => i.table === 'project')).toBe(true);
    expect(body.data.items.some((i: any) => i.table === 'tag')).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/sync/changes' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid since parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sync/changes?since=not-a-date',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /sync/push', () => {
  it('accepts a new task from client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'task',
            id: 'offline-task-1',
            data: { title: 'Offline task', priority: 2, createdAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.accepted).toContain('offline-task-1');

    // Verify it exists
    const task = await prisma.task.findUnique({ where: { id: 'offline-task-1' } });
    expect(task).not.toBeNull();
    expect(task!.title).toBe('Offline task');
    expect(task!.userId).toBe(userId);
  });

  it('updates existing task when incoming is newer', async () => {
    // Create on server
    const create = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Original' },
    });
    const taskId = create.json().data.id;
    const createdAt = create.json().data.createdAt;

    // Push update with newer timestamp
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'task',
            id: taskId,
            data: { title: 'Updated from offline', createdAt },
            updatedAt: new Date(Date.now() + 1000).toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).toContain(taskId);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.title).toBe('Updated from offline');
  });

  it('merges independent v3 task fields from different clients and rejects only a stale field', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Original' },
    });
    const taskId = create.json().data.id as string;
    const firstAt = new Date(Date.now() + 5_000).toISOString();
    const secondAt = new Date(Date.now() + 6_000).toISOString();

    const titlePush = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: taskId,
          data: { patch: { title: { value: 'Edited on web', at: firstAt } } },
          updatedAt: firstAt,
        }],
      },
    });
    expect(titlePush.json().data.accepted).toContain(taskId);

    const priorityPush = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: taskId,
          data: { patch: { priority: { value: 3, at: secondAt } } },
          updatedAt: secondAt,
        }],
      },
    });
    expect(priorityPush.json().data.accepted).toContain(taskId);

    const staleTitlePush = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: taskId,
          data: { patch: { title: { value: 'Stale mobile title', at: new Date(Date.now() + 1_000).toISOString() } } },
          updatedAt: new Date(Date.now() + 7_000).toISOString(),
        }],
      },
    });
    expect(staleTitlePush.json().data.accepted).not.toContain(taskId);
    expect(staleTitlePush.json().data.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'task', id: taskId, field: 'title' }),
    ]));

    const saved = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(saved.title).toBe('Edited on web');
    expect(saved.priority).toBe(3);
  });

  it('accepts a three-day-old offline edit to an independently versioned field without regressing the sync cursor', async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1_000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000);
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Before online edit',
        priority: 0,
        updatedAt: fourDaysAgo,
        fieldVersions: {
          title: fourDaysAgo.toISOString(),
          priority: fourDaysAgo.toISOString(),
        },
      },
    });
    const onlineAt = new Date().toISOString();

    const onlineTitle = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: task.id,
          data: { patch: { title: { value: 'Online title', at: onlineAt } } },
          updatedAt: onlineAt,
        }],
      },
    });
    expect(onlineTitle.json().data.accepted).toContain(task.id);
    const cursorAfterOnlineEdit = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt;

    const delayedOfflinePriority = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: task.id,
          data: { patch: { priority: { value: 2, at: threeDaysAgo.toISOString() } } },
          updatedAt: threeDaysAgo.toISOString(),
        }],
      },
    });
    expect(delayedOfflinePriority.json().data.accepted).toContain(task.id);

    const saved = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.title).toBe('Online title');
    expect(saved.priority).toBe(2);
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(cursorAfterOnlineEdit.getTime());
  });

  it('keeps a task tombstone when another device edits it and records the rejected field conflict', async () => {
    const baseline = new Date(Date.now() - 10_000).toISOString();
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Delete wins',
        fieldVersions: { title: baseline, deletedAt: baseline },
      },
    });
    const deletedAt = new Date().toISOString();
    const deleteResponse = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: task.id,
          data: { patch: { deletedAt: { value: deletedAt, at: deletedAt } } },
          updatedAt: deletedAt,
        }],
      },
    });
    expect(deleteResponse.json().data.accepted).toContain(task.id);

    const editAt = new Date(Date.now() + 5_000).toISOString();
    const editResponse = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{
          table: 'task',
          version: 3,
          id: task.id,
          data: { patch: { title: { value: 'Should not resurrect', at: editAt } } },
          updatedAt: editAt,
        }],
      },
    });
    expect(editResponse.json().data.accepted).not.toContain(task.id);
    expect(editResponse.json().data.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'task', id: task.id, field: 'title' }),
    ]));

    const saved = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.title).toBe('Delete wins');
    expect(saved.deletedAt?.toISOString()).toBe(deletedAt);
    expect(await prisma.syncLog.count({ where: { taskId: task.id, action: 'conflict' } })).toBe(1);
  });

  it('rejects incoming update when server is newer (last-write-wins)', async () => {
    // Create on server with a recent timestamp
    const create = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Server version' },
    });
    const taskId = create.json().data.id;
    const createdAt = create.json().data.createdAt;

    // Push update with older timestamp
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'task',
            id: taskId,
            data: { title: 'Stale offline version', createdAt },
            updatedAt: new Date(Date.now() - 60000).toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).not.toContain(taskId);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.title).toBe('Server version');
  });

  it('handles soft delete from client', async () => {
    // Create on server
    const create = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'To soft delete' },
    });
    const taskId = create.json().data.id;
    const createdAt = create.json().data.createdAt;

    // Push soft delete
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'task',
            id: taskId,
            data: { title: 'To soft delete', deletedAt: new Date().toISOString(), createdAt },
            updatedAt: new Date(Date.now() + 1000).toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).toContain(taskId);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.deletedAt).not.toBeNull();
  });

  it('accepts a new project from client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'project',
            id: 'offline-proj-1',
            data: { name: 'Offline Project', color: '#00ff00', createdAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).toContain('offline-proj-1');

    const proj = await prisma.project.findUnique({ where: { id: 'offline-proj-1' } });
    expect(proj).not.toBeNull();
    expect(proj!.name).toBe('Offline Project');
    expect(proj!.userId).toBe(userId);
  });

  it('accepts a new tag from client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'tag',
            id: 'offline-tag-1',
            data: { name: 'offline-tag', createdAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).toContain('offline-tag-1');

    const tag = await prisma.tag.findUnique({ where: { id: 'offline-tag-1' } });
    expect(tag).not.toBeNull();
    expect(tag!.name).toBe('offline-tag');
  });

  it('handles taskTag relation', async () => {
    // Create task and tag
    const t = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Tagged task' },
    });
    const tag = await app.inject({
      method: 'POST',
      url: '/tags',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'my-tag' },
    });
    const taskId = t.json().data.id;
    const tagId = tag.json().data.id;

    // Push taskTag relation
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'taskTag',
            id: `${taskId}:${tagId}`,
            data: { taskId, tagId, createdAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.json().data.accepted).toContain(`${taskId}:${tagId}`);

    const tt = await prisma.taskTag.findUnique({
      where: { taskId_tagId: { taskId, tagId } },
    });
    expect(tt).not.toBeNull();
  });

  it('rejects invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: { items: 'not-an-array' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('processes multiple items in batch', async () => {
    const now = new Date().toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          { table: 'task', id: 'batch-1', data: { title: 'Batch task 1', createdAt: now }, updatedAt: now },
          { table: 'task', id: 'batch-2', data: { title: 'Batch task 2', createdAt: now }, updatedAt: now },
          { table: 'project', id: 'batch-proj', data: { name: 'Batch project', createdAt: now }, updatedAt: now },
        ],
      },
    });
    expect(res.json().data.accepted.length).toBe(3);
  });

  it('pushes and pulls time blocks as independent sync entities', async () => {
    const task = await prisma.task.create({
      data: { userId, title: 'Offline scheduled task' },
    });
    const now = new Date(Date.now() + 1_000).toISOString();
    const timeBlockId = crypto.randomUUID();

    const push = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'timeBlock',
            id: timeBlockId,
            data: {
              taskId: task.id,
              startAt: '2026-08-03T02:00:00.000Z',
              endAt: '2026-08-03T03:00:00.000Z',
              timeZone: 'Asia/Ho_Chi_Minh',
              allDay: false,
              source: 'MANUAL',
              createdAt: now,
            },
            updatedAt: now,
          },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    expect(push.json().data.accepted).toContain(timeBlockId);

    const pull = await app.inject({
      method: 'GET',
      url: '/sync/changes?since=1970-01-01T00:00:00.000Z',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pull.json().data.items).toContainEqual(
      expect.objectContaining({
        table: 'timeBlock',
        id: timeBlockId,
        data: expect.objectContaining({
          taskId: task.id,
          timeZone: 'Asia/Ho_Chi_Minh',
        }),
      }),
    );
  });

  it('includes the new deadline contract while retaining legacy task fields', async () => {
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Synced deadline',
        deadlineDate: new Date('2026-08-04T00:00:00.000Z'),
        deadlineTime: '17:30',
        deadlineTimeZone: 'Asia/Ho_Chi_Minh',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/sync/changes?since=1970-01-01T00:00:00.000Z',
      headers: { authorization: `Bearer ${token}` },
    });
    const item = response
      .json()
      .data.items.find((candidate: { id: string }) => candidate.id === task.id);

    expect(response.json().data.version).toBe(2);
    expect(item.version).toBe(2);
    expect(item.data).toMatchObject({
      dueDate: '2026-08-04T10:30:00.000Z',
      dueTime: '17:30',
      deadlineDate: '2026-08-04T00:00:00.000Z',
      deadlineTime: '17:30',
      deadlineTimeZone: 'Asia/Ho_Chi_Minh',
    });
  });
});

describe('countdown sync', () => {
  it('pulls countdowns as sync items', async () => {
    const countdown = await prisma.countdown.create({
      data: {
        userId,
        title: 'Ky thi',
        targetDate: new Date('2026-12-25T00:00:00.000Z'),
        color: '#10B981',
        reminderDaysBefore: 3,
        showInCalendar: true,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/sync/changes?since=1970-01-01T00:00:00.000Z',
      headers: { authorization: `Bearer ${token}` },
    });

    const item = response
      .json()
      .data.items.find((candidate: { id: string }) => candidate.id === countdown.id);

    expect(item).toBeTruthy();
    expect(item.table).toBe('countdown');
    expect(item.data).toMatchObject({
      title: 'Ky thi',
      targetDate: '2026-12-25T00:00:00.000Z',
      reminderDaysBefore: 3,
      showInCalendar: true,
    });
  });

  it('creates a countdown from a client-generated id', async () => {
    // Offline creates pick their own id so the row does not have to be
    // reconciled once the device is back online.
    const id = '11111111-2222-3333-4444-555555555555';

    const response = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'countdown',
            id,
            data: {
              title: 'Tao offline',
              targetDate: '2026-09-15T00:00:00.000Z',
              color: '#6366F1',
              reminderDaysBefore: 1,
              showInCalendar: false,
            },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.accepted).toContain(id);

    const stored = await prisma.countdown.findFirst({ where: { id, userId } });
    expect(stored?.title).toBe('Tao offline');
    expect(stored?.reminderDaysBefore).toBe(1);
  });

  it('ignores a push older than what the server already has', async () => {
    const countdown = await prisma.countdown.create({
      data: { userId, title: 'Moi hon', targetDate: new Date('2026-10-01T00:00:00.000Z') },
    });

    await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'countdown',
            id: countdown.id,
            data: { title: 'Cu hon', targetDate: '2026-10-01T00:00:00.000Z' },
            updatedAt: new Date(countdown.updatedAt.getTime() - 60_000).toISOString(),
          },
        ],
      },
    });

    const stored = await prisma.countdown.findUnique({ where: { id: countdown.id } });
    expect(stored?.title).toBe('Moi hon');
  });

  it('soft deletes a countdown pushed with deletedAt', async () => {
    const countdown = await prisma.countdown.create({
      data: { userId, title: 'Se xoa', targetDate: new Date('2026-10-01T00:00:00.000Z') },
    });

    await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            table: 'countdown',
            id: countdown.id,
            data: { deletedAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    const stored = await prisma.countdown.findUnique({ where: { id: countdown.id } });
    expect(stored?.deletedAt).not.toBeNull();
  });
});
