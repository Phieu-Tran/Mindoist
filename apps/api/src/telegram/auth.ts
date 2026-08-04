import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

const MIN_AGENT_TOKEN_BYTES = 32;

function tokenDigest(value: string) {
  return createHash('sha256').update(value).digest();
}

export function configuredAgentToken() {
  const token = process.env.MINDOIST_AGENT_TOKEN?.trim();
  return token && Buffer.byteLength(token, 'utf8') >= MIN_AGENT_TOKEN_BYTES ? token : null;
}

export function isValidAgentToken(candidate: string | undefined) {
  const expected = configuredAgentToken();
  if (!expected || !candidate) return false;
  return timingSafeEqual(tokenDigest(candidate), tokenDigest(expected));
}

export async function requireAgentAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!configuredAgentToken()) {
    return reply.status(503).send({ success: false, error: 'Telegram agent integration is unavailable' });
  }

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!isValidAgentToken(token)) {
    return reply.status(401).send({ success: false, error: 'Invalid agent token' });
  }
}
