import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { exportRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(exportRoutes);

  const user = await createTestUser('export-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('export-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.project.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.note.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.tag.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe('Export JSON', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/export/json' });
    expect(res.statusCode).toBe(401);
  });

  it('exports the user\'s own tasks/projects/notes/tags and nothing from another user', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Mine' } });
    await prisma.task.create({ data: { userId, title: 'My task', projectId: project.id } });
    await prisma.note.create({ data: { userId, title: 'My note', content: 'hi' } });
    await prisma.tag.create({ data: { userId, name: 'mytag' } });

    await prisma.project.create({ data: { userId: otherId, name: 'Not mine' } });
    await prisma.task.create({ data: { userId: otherId, title: 'Not my task' } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/json',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('My task');
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe('Mine');
    expect(body.notes).toHaveLength(1);
    expect(body.tags).toHaveLength(1);
    expect(body.exportedAt).toBeTruthy();
  });

  it('excludes soft-deleted tasks', async () => {
    await prisma.task.create({ data: { userId, title: 'Alive' } });
    await prisma.task.create({ data: { userId, title: 'Deleted', deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/json',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('Alive');
  });

  it('sets a downloadable attachment header with a dated filename', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/export/json',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="mindoist-export-\d{4}-\d{2}-\d{2}\.json"/);
  });
});

describe('Export CSV', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/export/csv' });
    expect(res.statusCode).toBe(401);
  });

  it('includes a header row and one row per task, with the project name resolved', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Work' } });
    await prisma.task.create({ data: { userId, title: 'Ship feature', projectId: project.id, priority: 1 } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/csv',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('id,title,description,priority,dueDate,dueTime,startDate,durationMin,completedAt,deletedAt,rrule,color,projectId,projectName,parentId,createdAt,updatedAt');
    expect(lines[1]).toContain('Ship feature');
    expect(lines[1]).toContain('Work');
  });

  it('quotes CSV fields that contain a comma', async () => {
    await prisma.task.create({ data: { userId, title: 'Buy milk, eggs, and bread' } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/csv',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const lines = res.body.trim().split('\n');
    expect(lines[1]).toContain('"Buy milk, eggs, and bread"');
  });

  it('escapes embedded double quotes by doubling them', async () => {
    await prisma.task.create({ data: { userId, title: 'Say "hello"' } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/csv',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const lines = res.body.trim().split('\n');
    expect(lines[1]).toContain('"Say ""hello"""');
  });

  it('does not leak another user\'s tasks', async () => {
    await prisma.task.create({ data: { userId: otherId, title: 'Secret task' } });

    const res = await app.inject({
      method: 'GET',
      url: '/export/csv',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.body).not.toContain('Secret task');
  });
});
