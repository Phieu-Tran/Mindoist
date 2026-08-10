import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { sectionRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let projectId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(sectionRoutes);

  const user = await createTestUser('section-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('section-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  // Scoped cleanup: only this user's data
  const tags = await prisma.taskTag.findMany({ where: { task: { userId } } });
  if (tags.length) await prisma.taskTag.deleteMany({ where: { task: { userId } } });
  await prisma.task.deleteMany({ where: { userId } });
  await prisma.section.deleteMany({ where: { project: { userId } } });
  await prisma.project.deleteMany({ where: { userId } });

  const p = await prisma.project.create({ data: { userId, name: 'Test Project' } });
  projectId = p.id;
});

describe('Section CRUD', () => {
  it('POST /projects/:projectId/sections creates section', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/sections`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'To Do' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('To Do');
    expect(body.data.projectId).toBe(projectId);
  });

  it('POST /projects/:projectId/sections rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/sections`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /projects/:projectId/sections lists sections', async () => {
    await prisma.section.create({ data: { projectId, name: 'S1' } });
    await prisma.section.create({ data: { projectId, name: 'S2' } });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/sections`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveLength(2);
  });

  it('GET /projects/:projectId/sections excludes soft-deleted', async () => {
    await prisma.section.create({ data: { projectId, name: 'Active' } });
    await prisma.section.create({
      data: { projectId, name: 'Deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/sections`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(res.body).data).toHaveLength(1);
  });

  it('PATCH /sections/:id updates section', async () => {
    const s = await prisma.section.create({ data: { projectId, name: 'Old' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/sections/${s.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe('New');
  });

  it('DELETE /sections/:id soft-deletes', async () => {
    const s = await prisma.section.create({ data: { projectId, name: 'Doomed' } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/sections/${s.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const db = await prisma.section.findUnique({ where: { id: s.id } });
    expect(db?.deletedAt).not.toBeNull();
  });

  it('User isolation: other user cannot list sections', async () => {
    await prisma.section.create({ data: { projectId, name: 'Private' } });
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/sections`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('User isolation: other user cannot update section', async () => {
    const s = await prisma.section.create({ data: { projectId, name: 'Secret' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/sections/${s.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(404);
  });
});
