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
