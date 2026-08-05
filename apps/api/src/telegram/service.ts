import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { configuredAgentToken } from './auth.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CONSUMED_RETENTION_MS = 24 * 60 * 60 * 1000;
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const INBOUND_MESSAGE_MAX_AGE_MS = 3 * 60 * 1000;
const INBOUND_MESSAGE_FUTURE_TOLERANCE_MS = 60 * 1000;
const INBOUND_MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class TelegramLinkError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function hashTelegramChallenge(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function configuredTelegramBotUsername() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return username;
}

export async function getTelegramStatus(userId: string) {
  const botUsername = configuredTelegramBotUsername();
  if (!botUsername || !configuredAgentToken()) return { state: 'unavailable' as const };

  const connection = await prisma.telegramConnection.findUnique({
    where: { userId },
    select: {
      telegramUsername: true,
      telegramDisplayName: true,
      linkedAt: true,
    },
  });
  if (connection) {
    return {
      state: 'connected' as const,
      botUsername,
      telegramUsername: connection.telegramUsername,
      telegramDisplayName: connection.telegramDisplayName,
      linkedAt: connection.linkedAt.toISOString(),
    };
  }

  const pending = await prisma.telegramLinkChallenge.findFirst({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { expiresAt: true },
  });
  if (pending) {
    return {
      state: 'pending' as const,
      botUsername,
      expiresAt: pending.expiresAt.toISOString(),
    };
  }

  return { state: 'unlinked' as const, botUsername };
}

export async function createTelegramLinkChallenge(userId: string) {
  const botUsername = configuredTelegramBotUsername();
  if (!botUsername || !configuredAgentToken()) {
    throw new TelegramLinkError('Telegram integration is unavailable', 503, 'TELEGRAM_UNAVAILABLE');
  }

  const existingConnection = await prisma.telegramConnection.findUnique({ where: { userId }, select: { id: true } });
  if (existingConnection) {
    throw new TelegramLinkError('Telegram is already connected', 409, 'TELEGRAM_ALREADY_CONNECTED');
  }

  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.$transaction([
    prisma.telegramLinkChallenge.deleteMany({ where: { userId } }),
    prisma.telegramLinkChallenge.create({
      data: { userId, codeHash: hashTelegramChallenge(code), expiresAt },
    }),
  ]);

  return {
    state: 'pending' as const,
    botUsername,
    expiresAt: expiresAt.toISOString(),
    deepLink: `https://t.me/${botUsername}?start=mindoist_${code}`,
  };
}

export type TelegramIdentity = {
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername?: string;
  telegramDisplayName?: string;
};

function safeDisplayValue(value: string | undefined, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function consumeTelegramLinkChallenge(code: string, identity: TelegramIdentity) {
  const codeHash = hashTelegramChallenge(code);
  const challenge = await prisma.telegramLinkChallenge.findUnique({
    where: { codeHash },
    select: { id: true, userId: true, expiresAt: true, consumedAt: true },
  });
  if (!challenge) {
    throw new TelegramLinkError('Invalid or expired link', 400, 'TELEGRAM_LINK_INVALID');
  }

  const exactConnection = await prisma.telegramConnection.findUnique({
    where: { userId: challenge.userId },
    select: { id: true, telegramUserId: true, telegramChatId: true },
  });
  if (challenge.consumedAt) {
    if (exactConnection?.telegramUserId === identity.telegramUserId
      && exactConnection.telegramChatId === identity.telegramChatId) {
      return { connectionId: exactConnection.id, userId: challenge.userId, alreadyConnected: true };
    }
    throw new TelegramLinkError('Link has already been used', 409, 'TELEGRAM_LINK_USED');
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new TelegramLinkError('Link has expired', 410, 'TELEGRAM_LINK_EXPIRED');
  }
  if (exactConnection) {
    throw new TelegramLinkError('Telegram is already connected', 409, 'TELEGRAM_ALREADY_CONNECTED');
  }

  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${challenge.userId} FOR UPDATE`;
      const currentConnection = await tx.telegramConnection.findUnique({
        where: { userId: challenge.userId },
        select: { id: true, telegramUserId: true, telegramChatId: true },
      });
      if (currentConnection) {
        if (currentConnection.telegramUserId === identity.telegramUserId
          && currentConnection.telegramChatId === identity.telegramChatId) {
          return { connectionId: currentConnection.id, userId: challenge.userId, alreadyConnected: true };
        }
        throw new TelegramLinkError('Telegram is already connected', 409, 'TELEGRAM_ALREADY_CONNECTED');
      }

      const consumed = await tx.telegramLinkChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new TelegramLinkError('Link has already been used', 409, 'TELEGRAM_LINK_USED');
      }

      const connection = await tx.telegramConnection.create({
        data: {
          userId: challenge.userId,
          telegramUserId: identity.telegramUserId,
          telegramChatId: identity.telegramChatId,
          telegramUsername: safeDisplayValue(identity.telegramUsername?.replace(/^@/, ''), 64),
          telegramDisplayName: safeDisplayValue(identity.telegramDisplayName, 128),
        },
        select: { id: true, userId: true },
      });
      return { connectionId: connection.id, userId: connection.userId, alreadyConnected: false };
    });
  } catch (error) {
    if (error instanceof TelegramLinkError) {
      if (error.code === 'TELEGRAM_LINK_USED') {
        const connection = await prisma.telegramConnection.findUnique({
          where: { userId: challenge.userId },
          select: { id: true, telegramUserId: true, telegramChatId: true },
        });
        if (connection?.telegramUserId === identity.telegramUserId
          && connection.telegramChatId === identity.telegramChatId) {
          return { connectionId: connection.id, userId: challenge.userId, alreadyConnected: true };
        }
      }
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const connection = await prisma.telegramConnection.findUnique({
        where: { userId: challenge.userId },
        select: { id: true, telegramUserId: true, telegramChatId: true },
      });
      if (connection?.telegramUserId === identity.telegramUserId
        && connection.telegramChatId === identity.telegramChatId) {
        return { connectionId: connection.id, userId: challenge.userId, alreadyConnected: true };
      }
      throw new TelegramLinkError('Telegram account is already connected', 409, 'TELEGRAM_IDENTITY_IN_USE');
    }
    throw error;
  }
}

type TelegramInboundMessageIdentity = {
  telegramMessageId?: string;
  telegramMessageDate?: number;
};

export async function authorizeTelegramMessage(
  telegramUserId: string,
  telegramChatId: string,
  inbound: TelegramInboundMessageIdentity = {},
) {
  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramUserId },
    select: { id: true, userId: true, telegramChatId: true, lastSeenAt: true },
  });
  if (!connection || connection.telegramChatId !== telegramChatId) {
    throw new TelegramLinkError('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
  }

  const now = new Date();
  const shouldTouchLastSeen = now.getTime() - connection.lastSeenAt.getTime() >= LAST_SEEN_WRITE_INTERVAL_MS;
  const hasMessageIdentity = inbound.telegramMessageId !== undefined && inbound.telegramMessageDate !== undefined;
  if (!hasMessageIdentity) {
    if (shouldTouchLastSeen) {
      await prisma.telegramConnection.update({
        where: { id: connection.id },
        data: { lastSeenAt: now },
      });
    }
    return { connectionId: connection.id, userId: connection.userId, accepted: true as const };
  }

  const telegramSentAt = new Date(inbound.telegramMessageDate! * 1000);
  const ageMs = now.getTime() - telegramSentAt.getTime();
  const accepted = ageMs <= INBOUND_MESSAGE_MAX_AGE_MS
    && ageMs >= -INBOUND_MESSAGE_FUTURE_TOLERANCE_MS;

  try {
    await prisma.$transaction(async tx => {
      await tx.telegramInboundMessage.create({
        data: {
          connectionId: connection.id,
          telegramChatId,
          telegramMessageId: inbound.telegramMessageId!,
          telegramSentAt,
          accepted,
        },
      });
      if (shouldTouchLastSeen) {
        await tx.telegramConnection.update({
          where: { id: connection.id },
          data: { lastSeenAt: now },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        connectionId: connection.id,
        userId: connection.userId,
        accepted: false as const,
        reason: 'duplicate' as const,
      };
    }
    throw error;
  }

  return accepted
    ? { connectionId: connection.id, userId: connection.userId, accepted: true as const }
    : {
        connectionId: connection.id,
        userId: connection.userId,
        accepted: false as const,
        reason: 'stale' as const,
      };
}

export async function disconnectTelegram(userId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.telegramLinkChallenge.deleteMany({ where: { userId } });
    await tx.telegramTaskDraft.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    await tx.telegramTaskBatchDraft.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    const deleted = await tx.telegramConnection.deleteMany({ where: { userId } });
    return { disconnected: deleted.count > 0 };
  });
}

export async function pruneTelegramLinkChallenges(now = new Date()) {
  const consumedBefore = new Date(now.getTime() - CONSUMED_RETENTION_MS);
  const inboundBefore = new Date(now.getTime() - INBOUND_MESSAGE_RETENTION_MS);
  await prisma.telegramInboundMessage.deleteMany({ where: { createdAt: { lt: inboundBefore } } });
  return prisma.telegramLinkChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { consumedAt: { lt: consumedBefore } },
      ],
    },
  });
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function startTelegramChallengePruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    void pruneTelegramLinkChallenges().catch(() => undefined);
  }, 15 * 60 * 1000);
  pruneTimer.unref?.();
}

export function stopTelegramChallengePruner() {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = null;
}
