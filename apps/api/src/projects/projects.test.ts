import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { projectRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(projectRoutes);

  const user = await createTestUser('project-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('project-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.taskTag.deleteMany({ where: { task: { userId: { in: [userId, otherId] } } } });
  await prisma.task.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.section.deleteMany({ where: { project: { userId: { in: [userId, otherId] } } } });
  await prisma.project.updateMany({
    where: { userId: { in: [userId, otherId] } },
    data: { parentId: null },
  });
  await prisma.project.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe('Project CRUD', () => {
  it('POST /projects creates a project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'My Project', color: '#FF0000' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('My Project');
    expect(body.data.color).toBe('#FF0000');
    expect(body.data.userId).toBe(userId);

    const columns = await prisma.projectColumn.findMany({
      where: { projectId: body.data.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    expect(columns.map(column => [column.name, column.isDone])).toEqual([
      ['Backlog', false],
      ['In progress', false],
      ['Done', true],
    ]);
  });

  it('POST /projects rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /projects rejects unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /projects lists user projects', async () => {
    await prisma.project.create({ data: { userId, name: 'P1' } });
    await prisma.project.create({ data: { userId, name: 'P2' } });

    const res = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
  });

  it('GET /projects excludes soft-deleted', async () => {
    await prisma.project.create({ data: { userId, name: 'Active' } });
    await prisma.project.create({
      data: { userId, name: 'Deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Active');
  });

  it('GET /projects/:id returns project', async () => {
    const p = await prisma.project.create({ data: { userId, name: 'Detail' } });
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${p.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe('Detail');
  });

  it('GET /projects/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects/nonexistent',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /projects/:id updates project', async () => {
    const p = await prisma.project.create({ data: { userId, name: 'Old' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${p.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'New', color: '#00FF00', calendarSyncEnabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({
      name: 'New',
      calendarSyncEnabled: true,
    });
  });

  it('DELETE /projects/:id soft-deletes', async () => {
    const p = await prisma.project.create({ data: { userId, name: 'Doomed' } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/projects/${p.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);

    const db = await prisma.project.findUnique({ where: { id: p.id } });
    expect(db?.deletedAt).not.toBeNull();
  });

  it('User isolation: other user cannot read', async () => {
    const p = await prisma.project.create({ data: { userId, name: 'Secret' } });
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${p.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('creates sub-projects and rejects foreign parents and hierarchy cycles', async () => {
    const parent = await prisma.project.create({ data: { userId, name: 'Parent' } });
    const foreignParent = await prisma.project.create({ data: { userId: otherId, name: 'Foreign' } });

    const childResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Child', parentId: parent.id },
    });
    expect(childResponse.statusCode).toBe(201);
    const child = JSON.parse(childResponse.body).data;
    expect(child.parentId).toBe(parent.id);

    const foreignResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Not mine', parentId: foreignParent.id },
    });
    expect(foreignResponse.statusCode).toBe(400);

    const cycleResponse = await app.inject({
      method: 'PATCH',
      url: `/projects/${parent.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { parentId: child.id },
    });
    expect(cycleResponse.statusCode).toBe(400);
    expect(JSON.parse(cycleResponse.body).error).toMatch(/cycle/i);
  });

  it('supports project column CRUD and keeps columns isolated by owner', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Board' } });

    const initialResponse = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/columns`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(initialResponse.statusCode).toBe(200);
    expect(JSON.parse(initialResponse.body).data).toHaveLength(3);

    const createResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/columns`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Review', sortOrder: 3 },
    });
    expect(createResponse.statusCode).toBe(201);
    const column = JSON.parse(createResponse.body).data;

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}/columns/${column.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Ready for review', isDone: true },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(JSON.parse(updateResponse.body).data).toMatchObject({
      name: 'Ready for review',
      isDone: true,
    });

    const isolatedResponse = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}/columns/${column.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { name: 'Stolen' },
    });
    expect(isolatedResponse.statusCode).toBe(404);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/columns/${column.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(await prisma.projectColumn.findUnique({ where: { id: column.id } })).toMatchObject({
      deletedAt: expect.any(Date),
    });
  });

  it('creates the selected project template and custom column presets', async () => {
    const jobResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Career move', type: 'JOB' },
    });
    expect(jobResponse.statusCode).toBe(201);
    const job = JSON.parse(jobResponse.body).data;
    expect(job.type).toBe('JOB');
    const jobColumns = await prisma.projectColumn.findMany({
      where: { projectId: job.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(jobColumns.map(column => column.name)).toEqual(['Applied', 'Screen', 'Interview', 'Offer', 'Rejected']);
    expect(jobColumns.find(column => column.name === 'Offer')).toMatchObject({ isDone: true, color: 'jade' });

    const customResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Editorial', type: 'CUSTOM', customColumns: ['Pitch', 'Draft', 'Published'] },
    });
    expect(customResponse.statusCode).toBe(201);
    const custom = JSON.parse(customResponse.body).data;
    const customColumns = await prisma.projectColumn.findMany({
      where: { projectId: custom.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(customColumns.map(column => [column.name, column.isDone])).toEqual([
      ['Pitch', false],
      ['Draft', false],
      ['Published', true],
    ]);
  });

  it('returns a workspace with descendant projects and their tasks without leaking unrelated tasks', async () => {
    const parent = await prisma.project.create({ data: { userId, name: 'Workspace' } });
    const child = await prisma.project.create({ data: { userId, name: 'Child', parentId: parent.id } });
    const unrelated = await prisma.project.create({ data: { userId, name: 'Other' } });
    await prisma.projectColumn.create({ data: { projectId: parent.id, name: 'Queue' } });
    await prisma.task.createMany({
      data: [
        { userId, projectId: parent.id, title: 'Parent task' },
        { userId, projectId: child.id, title: 'Child task' },
        { userId, projectId: unrelated.id, title: 'Unrelated task' },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${parent.id}/workspace`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(response.statusCode).toBe(200);
    const workspace = JSON.parse(response.body).data;
    expect(workspace.project.id).toBe(parent.id);
    expect(workspace.subProjects.map((project: { id: string }) => project.id)).toEqual([child.id]);
    expect(workspace.columns).toHaveLength(1);
    expect(workspace.tasks.map((task: { title: string }) => task.title).sort()).toEqual(['Child task', 'Parent task']);
  });
});
