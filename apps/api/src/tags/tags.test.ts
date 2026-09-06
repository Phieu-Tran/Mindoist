import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { tagRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(tagRoutes);

  const user = await createTestUser('tag-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('tag-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.taskTag.deleteMany({ where: { task: { userId: { in: [userId, otherId] } } } });
  await prisma.tag.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe('Tag CRUD', () => {
  it('delete unlinks tasks and recreation reuses the name without restoring old links', async () => {
    const headers = { authorization: `Bearer ${userToken}` };
    const created = await app.inject({ method: 'POST', url: '/tags', headers, payload: { name: 'Reusable' } });
    const id = created.json().data.id;
    const task = await prisma.task.create({ data: { userId, title: 'Keep this task', taskTags: { create: { tagId: id } } } });
    const removed = await app.inject({ method: 'DELETE', url: `/tags/${id}`, headers });
    expect(removed.statusCode).toBe(200);
    expect(await prisma.taskTag.count({ where: { tagId: id } })).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).deletedAt).toBeNull();
    const recreated = await app.inject({ method: 'POST', url: '/tags', headers, payload: { name: 'Reusable', color: '#112233' } });
    expect(recreated.statusCode).toBe(201);
    expect(recreated.json().data).toMatchObject({ id, color: '#112233', deletedAt: null });
    expect(await prisma.taskTag.count({ where: { tagId: id } })).toBe(0);
  });

  it('concurrent creation returns one success and one name conflict', async () => {
    const results = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/tags',
      headers: { authorization: `Bearer ${userToken}` }, payload: { name: 'Same name' } })));
    expect(results.map(result => result.statusCode).sort()).toEqual([201, 409]);
    expect(await prisma.tag.count({ where: { userId, name: 'Same name' } })).toBe(1);
  });

  it('concurrent recreation claims a deleted tag only once and clears its old color', async () => {
    const tag = await prisma.tag.create({ data: { userId, name: 'Deleted name', color: '#112233', deletedAt: new Date() } });
    const results = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/tags',
      headers: { authorization: `Bearer ${userToken}` }, payload: { name: tag.name } })));
    expect(results.map(result => result.statusCode).sort()).toEqual([201, 409]);
    expect((await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).color).toBeNull();
  });


  it('POST /tags creates a tag', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tags',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Urgent', color: '#FF0000' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('Urgent');
    expect(body.data.userId).toBe(userId);
  });

  it('POST /tags rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tags',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /tags lists user tags', async () => {
    await prisma.tag.create({ data: { userId, name: 'Tag1' } });
    await prisma.tag.create({ data: { userId, name: 'Tag2' } });

    const res = await app.inject({
      method: 'GET',
      url: '/tags',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveLength(2);
  });

  it('GET /tags excludes soft-deleted', async () => {
    await prisma.tag.create({ data: { userId, name: 'Active' } });
    await prisma.tag.create({
      data: { userId, name: 'Deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tags',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(JSON.parse(res.body).data).toHaveLength(1);
  });

  it('PATCH /tags/:id updates tag', async () => {
    const t = await prisma.tag.create({ data: { userId, name: 'Old' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tags/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe('New');
  });

  it('DELETE /tags/:id soft-deletes', async () => {
    const t = await prisma.tag.create({ data: { userId, name: 'Doomed' } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/tags/${t.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const db = await prisma.tag.findUnique({ where: { id: t.id } });
    expect(db?.deletedAt).not.toBeNull();
  });

  it('User isolation: other user cannot read tag', async () => {
    const t = await prisma.tag.create({ data: { userId, name: 'Secret' } });
    const res = await app.inject({
      method: 'GET',
      url: '/tags',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(JSON.parse(res.body).data).toHaveLength(0);
  });
});
