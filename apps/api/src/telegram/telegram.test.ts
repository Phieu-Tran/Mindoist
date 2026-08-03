import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.js';
import { cleanupUsers, createTestUser } from '../test-helpers.js';
import { hitTelegramRateLimit, resetTelegramRateLimits } from './rate-limit.js';
import { telegramRoutes } from './routes.js';
import { hashTelegramChallenge } from './service.js';

const AGENT_TOKEN = 'telegram-test-agent-token-with-enough-entropy';
const originalBotUsername = process.env.TELEGRAM_BOT_USERNAME;
const originalAgentToken = process.env.MINDOIST_AGENT_TOKEN;

describe('Telegram account linking', () => {
  let app: FastifyInstance;
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_USERNAME = '@MindoistTestBot';
    process.env.MINDOIST_AGENT_TOKEN = AGENT_TOKEN;
    app = Fastify({ logger: false });
    await app.register(telegramRoutes);
    userA = await createTestUser('telegram-a@example.com');
    userB = await createTestUser('telegram-b@example.com');
  });

  beforeEach(async () => {
    resetTelegramRateLimits();
    await prisma.telegramLinkChallenge.deleteMany({ where: { userId: { in: [userA.user.id, userB.user.id] } } });
    await prisma.telegramConnection.deleteMany({ where: { userId: { in: [userA.user.id, userB.user.id] } } });
  });

  afterAll(async () => {
    await cleanupUsers([userA?.user.id, userB?.user.id]);
    await app.close();
    if (originalBotUsername === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
    else process.env.TELEGRAM_BOT_USERNAME = originalBotUsername;
    if (originalAgentToken === undefined) delete process.env.MINDOIST_AGENT_TOKEN;
    else process.env.MINDOIST_AGENT_TOKEN = originalAgentToken;
  });

  async function createChallenge(token = userA.token) {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/telegram/link-challenges',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = response.json();
    const code = new URL(body.data.deepLink).searchParams.get('start')?.replace(/^mindoist_/, '');
    if (!code) throw new Error('Challenge code missing from deep link');
    return { response, body, code };
  }

  async function consume(code: string, telegramUserId: string, telegramChatId = telegramUserId) {
    return app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/link-challenges/consume',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: {
        code,
        telegramUserId,
        telegramChatId,
        chatType: 'private',
        telegramUsername: `user_${telegramUserId}`,
        telegramDisplayName: `Telegram ${telegramUserId}`,
      },
    });
  }

  it('requires user authentication for status and challenge creation', async () => {
    expect((await app.inject({ method: 'GET', url: '/integrations/telegram/status' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/integrations/telegram/link-challenges' })).statusCode).toBe(401);
  });

  it('creates a ten-minute single-use deep link and stores only its hash', async () => {
    const { response, body, code } = await createChallenge();
    expect(response.statusCode).toBe(201);
    expect(body.data).toMatchObject({ state: 'pending', botUsername: 'MindoistTestBot' });
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

    const stored = await prisma.telegramLinkChallenge.findUnique({ where: { codeHash: hashTelegramChallenge(code) } });
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe(code);
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('fails safely when the shared bot is not configured', async () => {
    const username = process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_BOT_USERNAME;
    try {
      const status = await app.inject({
        method: 'GET',
        url: '/integrations/telegram/status',
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(status.json().data.state).toBe('unavailable');
      const challenge = await app.inject({
        method: 'POST',
        url: '/integrations/telegram/link-challenges',
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(challenge.statusCode).toBe(503);
    } finally {
      process.env.TELEGRAM_BOT_USERNAME = username;
    }
  });

  it('fails safely when the agent credential is missing or too weak', async () => {
    const token = process.env.MINDOIST_AGENT_TOKEN;
    process.env.MINDOIST_AGENT_TOKEN = 'too-short';
    try {
      const status = await app.inject({
        method: 'GET',
        url: '/integrations/telegram/status',
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(status.json().data.state).toBe('unavailable');
      const challenge = await app.inject({
        method: 'POST',
        url: '/integrations/telegram/link-challenges',
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(challenge.statusCode).toBe(503);
    } finally {
      process.env.MINDOIST_AGENT_TOKEN = token;
    }
  });

  it('requires the separate agent credential for internal endpoints', async () => {
    const { code } = await createChallenge();
    const missing = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/link-challenges/consume',
      payload: { code, telegramUserId: '10001', telegramChatId: '10001', chatType: 'private' },
    });
    const wrong = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/link-challenges/consume',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { code, telegramUserId: '10001', telegramChatId: '10001', chatType: 'private' },
    });
    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
  });

  it('connects a private Telegram identity and authorizes only its exact private chat', async () => {
    const { code } = await createChallenge();
    const linked = await consume(code, '10001');
    expect(linked.statusCode).toBe(200);
    expect(linked.json().data.userId).toBe(userA.user.id);

    const status = await app.inject({
      method: 'GET',
      url: '/integrations/telegram/status',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(status.json().data).toMatchObject({
      state: 'connected',
      telegramUsername: 'user_10001',
      telegramDisplayName: 'Telegram 10001',
    });

    const authorized = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/message/authorize',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: { telegramUserId: '10001', telegramChatId: '10001', chatType: 'private' },
    });
    const wrongChat = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/message/authorize',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: { telegramUserId: '10001', telegramChatId: '99999', chatType: 'private' },
    });
    const group = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/message/authorize',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: { telegramUserId: '10001', telegramChatId: '10001', chatType: 'group' },
    });
    expect(authorized.json().data.userId).toBe(userA.user.id);
    expect(wrongChat.statusCode).toBe(403);
    expect(group.statusCode).toBe(400);
  });

  it('is idempotent for the same consumed identity but rejects a different replay', async () => {
    const { code } = await createChallenge();
    expect((await consume(code, '10002')).statusCode).toBe(200);
    const same = await consume(code, '10002');
    const different = await consume(code, '10003');
    expect(same.statusCode).toBe(200);
    expect(same.json().data.alreadyConnected).toBe(true);
    expect(different.statusCode).toBe(409);
  });

  it('stays idempotent when the same identity consumes a challenge concurrently', async () => {
    const { code } = await createChallenge();
    const results = await Promise.all([
      consume(code, '10008'),
      consume(code, '10008'),
    ]);
    expect(results.map(result => result.statusCode)).toEqual([200, 200]);
    expect(await prisma.telegramConnection.count({ where: { userId: userA.user.id } })).toBe(1);
  });

  it('rejects expired challenges', async () => {
    const { code } = await createChallenge();
    await prisma.telegramLinkChallenge.update({
      where: { codeHash: hashTelegramChallenge(code) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await consume(code, '10004')).statusCode).toBe(410);
  });

  it('prevents one Telegram identity from linking to two Mindoist users', async () => {
    const first = await createChallenge(userA.token);
    expect((await consume(first.code, '10005')).statusCode).toBe(200);
    const second = await createChallenge(userB.token);
    const duplicate = await consume(second.code, '10005', '10006');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).not.toContain(userA.user.email);
  });

  it('rate-limits repeated consume attempts by Telegram identity', async () => {
    const attempts = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(await consume('x'.repeat(32), '10009'));
    }
    expect(attempts.slice(0, 10).every(result => result.statusCode === 400)).toBe(true);
    expect(attempts.at(-1)?.statusCode).toBe(429);
  });

  it('keeps two users isolated while messages are interleaved', async () => {
    const first = await createChallenge(userA.token);
    expect((await consume(first.code, '11001')).statusCode).toBe(200);
    const second = await createChallenge(userB.token);
    expect((await consume(second.code, '22002')).statusCode).toBe(200);

    const authorize = (telegramUserId: string) => app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/message/authorize',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: { telegramUserId, telegramChatId: telegramUserId, chatType: 'private' },
    });
    expect((await authorize('11001')).json().data.userId).toBe(userA.user.id);
    expect((await authorize('22002')).json().data.userId).toBe(userB.user.id);
    expect((await authorize('11001')).json().data.userId).toBe(userA.user.id);
  });

  it('disconnects immediately and invalidates authorization', async () => {
    const { code } = await createChallenge();
    expect((await consume(code, '10007')).statusCode).toBe(200);
    const disconnected = await app.inject({
      method: 'DELETE',
      url: '/integrations/telegram/connection',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json().data.disconnected).toBe(true);

    const authorization = await app.inject({
      method: 'POST',
      url: '/internal/agent/telegram/message/authorize',
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
      payload: { telegramUserId: '10007', telegramChatId: '10007', chatType: 'private' },
    });
    expect(authorization.statusCode).toBe(403);
  });

  it('revokes connections and pending challenges when the Mindoist account is deleted', async () => {
    const disposable = await createTestUser('telegram-cascade@example.com');
    try {
      const { code } = await createChallenge(disposable.token);
      expect((await consume(code, '10010')).statusCode).toBe(200);
      await prisma.telegramLinkChallenge.create({
        data: {
          userId: disposable.user.id,
          codeHash: hashTelegramChallenge('pending-cascade-challenge'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await prisma.user.delete({ where: { id: disposable.user.id } });
      expect(await prisma.telegramConnection.count({ where: { userId: disposable.user.id } })).toBe(0);
      expect(await prisma.telegramLinkChallenge.count({ where: { userId: disposable.user.id } })).toBe(0);
    } finally {
      await cleanupUsers([disposable.user.id]);
    }
  });

  it('rate-limits repeated challenge creation', async () => {
    const results = [];
    for (let index = 0; index < 6; index += 1) {
      results.push(await app.inject({
        method: 'POST',
        url: '/integrations/telegram/link-challenges',
        headers: { authorization: `Bearer ${userA.token}` },
      }));
    }
    expect(results.at(-1)?.statusCode).toBe(429);
  });

  it('keeps the in-memory rate-limit store bounded at capacity', () => {
    hitTelegramRateLimit('oldest', 1, 60_000);
    for (let index = 0; index < 9_999; index += 1) {
      hitTelegramRateLimit(`filler:${index}`, 1, 60_000);
    }
    hitTelegramRateLimit('overflow', 1, 60_000);
    expect(hitTelegramRateLimit('oldest', 1, 60_000).limited).toBe(false);
  });
});
