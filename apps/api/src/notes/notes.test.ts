import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { noteRoutes } from './routes.js';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

let app: ReturnType<typeof Fastify>;
let userId: string;
let token: string;

beforeEach(async () => {
  app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(noteRoutes);
  await app.ready();

  const testUser = await createTestUser(`notes-test-${Date.now()}@test.com`);
  userId = testUser.user.id;
  token = testUser.token;
});

afterEach(async () => {
  await cleanupUsers([userId]);
  await app.close();
});

describe('GET /notes', () => {
  it('returns empty array for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('returns notes ordered by updatedAt desc', async () => {
    await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'First' },
    });
    await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Second' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    const notes = res.json().data;
    expect(notes.length).toBe(2);
    expect(notes[0].title).toBe('Second');
    expect(notes[1].title).toBe('First');
  });

  it('excludes soft-deleted notes', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'To delete' },
    });
    const noteId = create.json().data.id;
    await app.inject({
      method: 'DELETE',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().data.length).toBe(0);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/notes' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /notes/search', () => {
  it('searches by title', async () => {
    await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Meeting notes', content: 'Discussed Q3 roadmap' },
    });
    await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Shopping list', content: 'Milk, eggs' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/notes/search?q=meeting',
      headers: { authorization: `Bearer ${token}` },
    });
    const notes = res.json().data;
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe('Meeting notes');
  });

  it('searches by content', async () => {
    await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Ideas', content: 'Build a todo app' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/notes/search?q=todo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().data.length).toBe(1);
  });

  it('returns empty for empty query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notes/search?q=',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().data).toEqual([]);
  });
});

describe('GET /notes/:id', () => {
  it('returns a note by id', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Test note', content: '# Hello' },
    });
    const noteId = create.json().data.id;
    const res = await app.inject({
      method: 'GET',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().data.title).toBe('Test note');
    expect(res.json().data.content).toBe('# Hello');
  });

  it('returns 404 for non-existent note', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notes/nonexistent',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /notes', () => {
  it('creates a note with title and content', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'My note', content: '# Markdown content' },
    });
    expect(res.statusCode).toBe(201);
    const note = res.json().data;
    expect(note.title).toBe('My note');
    expect(note.content).toBe('# Markdown content');
    expect(note.userId).toBe(userId);
  });

  it('creates a note with only title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Quick note' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.title).toBe('Quick note');
    expect(res.json().data.content).toBeNull();
  });

  it('creates a note attached to a task', async () => {
    // Create a real task first (foreign key constraint)
    const taskRes = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Parent task' },
    });
    // /tasks not registered — use prisma directly
    const task = await prisma.task.create({
      data: { userId, title: 'Parent task' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Task note', taskId: task.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.taskId).toBe(task.id);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { title: 'Test' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /notes/:id', () => {
  it('updates note title and content', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Original', content: 'v1' },
    });
    const noteId = create.json().data.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Updated', content: 'v2' },
    });
    expect(res.json().data.title).toBe('Updated');
    expect(res.json().data.content).toBe('v2');
  });

  it('returns 404 for non-existent note', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/notes/nonexistent',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('cannot update another user\'s note', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'My note' },
    });
    const noteId = create.json().data.id;

    // Create second user
    const testUser2 = await createTestUser(`notes-test-other-${Date.now()}@test.com`);
    const res = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${testUser2.token}` },
      payload: { title: 'Hacked' },
    });
    expect(res.statusCode).toBe(404);
    await cleanupUsers([testUser2.user.id]);
  });
});

describe('DELETE /notes/:id', () => {
  it('soft-deletes a note', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'To delete' },
    });
    const noteId = create.json().data.id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    // Verify it's gone from GET
    const get = await app.inject({
      method: 'GET',
      url: `/notes/${noteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 for non-existent note', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/notes/nonexistent',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
