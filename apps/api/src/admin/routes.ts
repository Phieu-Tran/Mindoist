import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { revokeAllForUser } from '../auth/refresh-tokens.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireAgentAuth } from '../telegram/auth.js';
import { testProviderConnection } from './provider-adapters.js';
import {
  agentProviderProjection,
  createProvider,
  providerDto,
  updateProvider,
  writeAudit,
} from './provider-service.js';
import { decryptProviderSecret } from './provider-crypto.js';

const providerTypes = ['GEMINI', 'ANTHROPIC', 'OPENAI', 'OPENROUTER', 'OPENAI_COMPATIBLE'] as const;
const providerBaseSchema = z.object({
  label: z.string().trim().min(1).max(80),
  provider: z.enum(providerTypes),
  model: z.string().trim().min(1).max(160),
  apiBase: z.string().trim().url().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(10000).default(100),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
});
const createProviderSchema = providerBaseSchema.extend({ apiKey: z.string().trim().min(8).max(4096) });
const updateProviderSchema = providerBaseSchema.partial().extend({ apiKey: z.string().trim().min(8).max(4096).optional() });
const userUpdateSchema = z.object({ role: z.enum(['USER', 'ADMIN']).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() })
  .refine(value => value.role !== undefined || value.status !== undefined);
const ADMIN_INVARIANT_LOCK_ID = 1_296_649_796;
const PROVIDER_CAPACITY_LOCK_ID = 1_296_649_797;

function validApiBase(provider: string, apiBase?: string | null) {
  if (provider === 'OPENAI_COMPATIBLE' && !apiBase) return false;
  if (!apiBase) return true;
  const url = new URL(apiBase);
  if (url.username || url.password) return false;
  return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:');
}

async function protectAdminInvariant(tx: Prisma.TransactionClient, actorId: string, targetId: string, role?: 'USER' | 'ADMIN', status?: 'ACTIVE' | 'SUSPENDED') {
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false as const, statusCode: 404, error: 'User not found' };
  if (actorId === targetId && role === 'USER') {
    return { ok: false as const, statusCode: 409, error: 'You cannot remove your own administrator role' };
  }
  if (actorId === targetId && status === 'SUSPENDED') {
    return { ok: false as const, statusCode: 409, error: 'You cannot suspend your own account' };
  }
  const removesActiveAdmin = target.role === 'ADMIN' && target.status === 'ACTIVE'
    && (role === 'USER' || status === 'SUSPENDED');
  if (removesActiveAdmin) {
    const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) return { ok: false as const, statusCode: 409, error: 'At least one active administrator is required' };
  }
  return { ok: true as const, target };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/overview', { preHandler: requireAdmin }, async (_request, reply) => {
    const [users, activeUsers, suspendedUsers, providers, enabledProviders, telegramConnections] = await Promise.all([
      prisma.user.count(), prisma.user.count({ where: { status: 'ACTIVE' } }), prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.aiProviderConfig.count(), prisma.aiProviderConfig.count({ where: { enabled: true } }), prisma.telegramConnection.count(),
    ]);
    return reply.send({ success: true, data: { users, activeUsers, suspendedUsers, providers, enabledProviders, telegramConnections } });
  });

  app.get('/admin/users', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = z.object({ q: z.string().trim().max(100).optional(), offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid user query' });
    const where = parsed.data.q ? { OR: [
      { email: { contains: parsed.data.q, mode: 'insensitive' as const } },
      { name: { contains: parsed.data.q, mode: 'insensitive' as const } },
    ] } : {};
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where, skip: parsed.data.offset, take: parsed.data.limit, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true, status: true, timeZone: true, onboardingRequired: true, createdAt: true, telegramConnection: { select: { telegramUsername: true, linkedAt: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    return reply.send({ success: true, data: { items, total } });
  });

  app.patch<{ Params: { id: string } }>('/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = userUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid user update' });
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_INVARIANT_LOCK_ID})`;
      const guard = await protectAdminInvariant(tx, request.currentUser!.id, request.params.id, parsed.data.role, parsed.data.status);
      if (!guard.ok) return guard;
      const user = await tx.user.update({ where: { id: request.params.id }, data: parsed.data, select: { id: true, email: true, name: true, role: true, status: true } });
      await writeAudit(request.currentUser!.id, 'user.updated', 'user', user.id, parsed.data, tx);
      return { ok: true as const, user };
    });
    if (!result.ok) return reply.status(result.statusCode).send({ success: false, error: result.error });
    const { user } = result;
    if (parsed.data.status === 'SUSPENDED') await revokeAllForUser(user.id);
    return reply.send({ success: true, data: user });
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/revoke-sessions', { preHandler: requireAdmin }, async (request, reply) => {
    const exists = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!exists) return reply.status(404).send({ success: false, error: 'User not found' });
    await revokeAllForUser(exists.id);
    await writeAudit(request.currentUser!.id, 'user.sessions_revoked', 'user', exists.id);
    return reply.send({ success: true });
  });

  app.get('/admin/providers', { preHandler: requireAdmin }, async (_request, reply) => {
    const providers = await prisma.aiProviderConfig.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    return reply.send({ success: true, data: providers.map(providerDto) });
  });

  app.post('/admin/providers', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createProviderSchema.safeParse(request.body);
    if (!parsed.success || !validApiBase(parsed.success ? parsed.data.provider : '', parsed.success ? parsed.data.apiBase : null)) {
      return reply.status(400).send({ success: false, error: 'Invalid provider configuration' });
    }
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PROVIDER_CAPACITY_LOCK_ID})`;
      if (parsed.data.enabled && await tx.aiProviderConfig.count({ where: { enabled: true } }) >= 6) {
        return { ok: false as const, statusCode: 409, error: 'At most six AI providers can be enabled' };
      }
      return { ok: true as const, provider: await createProvider(request.currentUser!.id, parsed.data, tx) };
    });
    if (!result.ok) return reply.status(result.statusCode).send({ success: false, error: result.error });
    return reply.status(201).send({ success: true, data: providerDto(result.provider) });
  });

  app.patch<{ Params: { id: string } }>('/admin/providers/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = updateProviderSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid provider configuration' });
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PROVIDER_CAPACITY_LOCK_ID})`;
      const current = await tx.aiProviderConfig.findUnique({ where: { id: request.params.id } });
      if (!current) return { ok: false as const, statusCode: 404, error: 'Provider not found' };
      if (!validApiBase(parsed.data.provider || current.provider, parsed.data.apiBase === undefined ? current.apiBase : parsed.data.apiBase)) {
        return { ok: false as const, statusCode: 400, error: 'Invalid provider base URL' };
      }
      if (parsed.data.enabled === true && !current.enabled && await tx.aiProviderConfig.count({ where: { enabled: true } }) >= 6) {
        return { ok: false as const, statusCode: 409, error: 'At most six AI providers can be enabled' };
      }
      if (parsed.data.enabled === false && current.enabled && await tx.aiProviderConfig.count({ where: { enabled: true } }) <= 1) {
        return { ok: false as const, statusCode: 409, error: 'At least one AI provider must remain enabled' };
      }
      return { ok: true as const, provider: await updateProvider(request.currentUser!.id, current.id, parsed.data, tx) };
    });
    if (!result.ok) return reply.status(result.statusCode).send({ success: false, error: result.error });
    return reply.send({ success: true, data: providerDto(result.provider) });
  });

  app.delete<{ Params: { id: string } }>('/admin/providers/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PROVIDER_CAPACITY_LOCK_ID})`;
      const provider = await tx.aiProviderConfig.findUnique({ where: { id: request.params.id } });
      if (!provider) return { ok: false as const, statusCode: 404, error: 'Provider not found' };
      if (provider.enabled && await tx.aiProviderConfig.count({ where: { enabled: true } }) <= 1) {
        return { ok: false as const, statusCode: 409, error: 'At least one AI provider must remain enabled' };
      }
      await tx.aiProviderConfig.delete({ where: { id: provider.id } });
      await writeAudit(request.currentUser!.id, 'provider.deleted', 'ai_provider', provider.id, { provider: provider.provider, model: provider.model }, tx);
      return { ok: true as const };
    });
    if (!result.ok) return reply.status(result.statusCode).send({ success: false, error: result.error });
    return reply.send({ success: true });
  });

  app.post<{ Params: { id: string } }>('/admin/providers/:id/test', { preHandler: requireAdmin }, async (request, reply) => {
    const provider = await prisma.aiProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!provider) return reply.status(404).send({ success: false, error: 'Provider not found' });
    const result = await testProviderConnection({ ...provider, apiKey: decryptProviderSecret(provider.encryptedApiKey) });
    const testedAt = new Date();
    await prisma.aiProviderConfig.update({
      where: { id: provider.id },
      data: {
        lastTestStatus: result.ok ? 'HEALTHY' : 'FAILED',
        lastTestedAt: testedAt,
        lastTestLatencyMs: result.latencyMs,
        lastTestHttpStatus: 'status' in result ? result.status : null,
        lastTestError: result.ok ? null : result.message,
      },
    });
    await writeAudit(request.currentUser!.id, 'provider.tested', 'ai_provider', provider.id, {
      ok: result.ok,
      status: 'status' in result ? result.status : undefined,
    });
    return reply.status(result.ok ? 200 : 502).send({
      success: result.ok,
      data: { ...result, testedAt },
      error: result.ok ? undefined : result.message,
    });
  });

  app.get('/admin/audit', { preHandler: requireAdmin }, async (_request, reply) => {
    const items = await prisma.adminAuditLog.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true, email: true } } } });
    return reply.send({ success: true, data: items });
  });

  app.get('/internal/agent/ai-config', { preHandler: requireAgentAuth }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.send({ success: true, data: await agentProviderProjection() });
  });
}
