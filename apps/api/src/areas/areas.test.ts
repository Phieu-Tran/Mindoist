import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { areaRoutes } from './routes.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: FastifyInstance;
let userToken: string;
let userId: string;
let otherToken: string;
let otherId: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(areaRoutes);

  const user = await createTestUser('areas-test@example.com');
  userId = user.user.id;
  userToken = user.token;

  const other = await createTestUser('areas-other@example.com');
  otherId = other.user.id;
  otherToken = other.token;
});

afterAll(async () => {
  await cleanupUsers([userId, otherId]);
  await app.close();
});

beforeEach(async () => {
  await prisma.area.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe('Areas', () => {
  it('GET /areas requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/areas' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /areas returns empty list for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/areas',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });

  it('POST /areas creates an area', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/areas',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Personal', color: 'indigo' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('Personal');
    expect(body.data.color).toBe('indigo');
    expect(body.data.userId).toBe(userId);
  });

  it('POST /areas rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/areas',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /areas rejects a duplicate name for the same user (409)', async () => {
    await prisma.area.create({ data: { userId, name: 'Work' } });
    const res = await app.inject({
      method: 'POST',
      url: '/areas',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Work' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('allows the same area name for two different users', async () => {
    await prisma.area.create({ data: { userId: otherId, name: 'Work' } });
    const res = await app.inject({
      method: 'POST',
      url: '/areas',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Work' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('PATCH /areas/:id renames an area', async () => {
    const area = await prisma.area.create({ data: { userId, name: 'Old name' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/areas/${area.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'New name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe('New name');
  });

  it('PATCH /areas/:id rejects renaming to a name already used by another area', async () => {
    await prisma.area.create({ data: { userId, name: 'Taken' } });
    const area = await prisma.area.create({ data: { userId, name: 'Mine' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/areas/${area.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Taken' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH /areas/:id returns 404 for another user\'s area', async () => {
    const area = await prisma.area.create({ data: { userId: otherId, name: 'Not yours' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/areas/${area.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
    await expect(prisma.area.findUnique({ where: { id: area.id } })).resolves.toMatchObject({ name: 'Not yours' });
  });

  it('DELETE /areas/:id removes the area and unlinks its projects (does not delete them)', async () => {
    const area = await prisma.area.create({ data: { userId, name: 'To delete' } });
    const project = await prisma.project.create({ data: { userId, name: 'Linked project', areaId: area.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/areas/${area.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);

    await expect(prisma.area.findUnique({ where: { id: area.id } })).resolves.toBeNull();
    const updatedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updatedProject).not.toBeNull();
    expect(updatedProject!.areaId).toBeNull();

    await prisma.project.delete({ where: { id: project.id } });
  });

  it('DELETE /areas/:id returns 404 for another user\'s area', async () => {
    const area = await prisma.area.create({ data: { userId: otherId, name: 'Not yours' } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/areas/${area.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
    await expect(prisma.area.findUnique({ where: { id: area.id } })).resolves.not.toBeNull();
  });
});
