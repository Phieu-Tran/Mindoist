import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

// Short enough that a stolen access token is worth little, long enough that
// the refresh round-trip is rare. Both are env-overridable so a deployment can
// tighten them without a code change.
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1h';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;

// Every access token expires at the same instant in every open tab, so two of
// them routinely reach for the same refresh token at once. The loser of that
// race is holding a token that was valid a moment ago, which is a race and not
// a theft - a stolen token is replayed hours or days later, not inside a few
// seconds of its legitimate use.
export const ROTATION_GRACE_MS = Number(process.env.REFRESH_ROTATION_GRACE_MS) || 30_000;

const PRUNE_INTERVAL_MS = Number(process.env.REFRESH_PRUNE_INTERVAL_MS) || 24 * 60 * 60 * 1000;
let pruneInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Only the hash is ever persisted, so a dump of `refresh_tokens` cannot be
 * replayed as a session. SHA-256 is enough here (unlike a password): the token
 * is 256 bits of entropy, so there is nothing to brute-force.
 */
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from = new Date()) {
  return new Date(from.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function issueRefreshToken(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: refreshTokenExpiry(),
    },
  });
  return token;
}

export type RefreshResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'reused' };

/**
 * Consumes a refresh token: valid ones are revoked here and the caller issues
 * a replacement (rotation), so each token works exactly once.
 *
 * A token that is already revoked gets read three different ways:
 *
 * - rotated seconds ago -> a second tab racing the first. Let it through; both
 *   end up with a working session, which is what the user expects.
 * - rotated long ago -> a genuine replay. Indistinguishable from a stolen
 *   token, so the whole family is dropped.
 * - revoked without ever being rotated -> the user logged out. Refuse it, but
 *   do not punish their other devices for a stale retry.
 */
export async function consumeRefreshToken(
  token: string,
  now = new Date(),
): Promise<RefreshResult> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record) return { ok: false, reason: 'unknown' };

  if (record.revokedAt) {
    if (!record.rotatedAt) return { ok: false, reason: 'revoked' };

    const withinGrace = now.getTime() - record.rotatedAt.getTime() <= ROTATION_GRACE_MS;
    if (withinGrace && record.expiresAt > now) return { ok: true, userId: record.userId };

    await revokeAllForUser(record.userId);
    return { ok: false, reason: 'reused' };
  }

  if (record.expiresAt <= now) {
    return { ok: false, reason: 'expired' };
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: now, rotatedAt: now },
  });

  return { ok: true, userId: record.userId };
}

/** Sign-out for this device only. Unknown tokens are ignored. */
export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rows stay behind after they are revoked or expire so reuse detection still
 * works for a while. This clears the ones old enough to be useless.
 *
 * Started by the API on boot - without it the table only ever grows, and a
 * long-lived deployment ends up carrying every session it has ever issued.
 */
export function startRefreshTokenPruner() {
  if (pruneInterval || process.env.REFRESH_PRUNE_DISABLED === 'true') return;

  const run = async () => {
    try {
      const removed = await pruneExpiredRefreshTokens();
      if (removed > 0) console.log(`[RefreshTokens] pruned ${removed} stale rows`);
    } catch (err) {
      console.error('[RefreshTokens] prune failed:', err);
    }
  };

  void run();
  pruneInterval = setInterval(run, PRUNE_INTERVAL_MS);
}

export function stopRefreshTokenPruner() {
  if (!pruneInterval) return;
  clearInterval(pruneInterval);
  pruneInterval = null;
}

export async function pruneExpiredRefreshTokens(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return count;
}
