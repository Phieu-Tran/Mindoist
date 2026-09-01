import { createHash } from 'node:crypto';
import type { AiProviderConfig, AiProviderType, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { decryptProviderSecret, encryptProviderSecret, providerSecretHint } from './provider-crypto.js';

type ProviderDbClient = Pick<typeof prisma, 'adminAuditLog' | 'aiProviderConfig'>;

export interface ProviderWriteInput {
  label: string;
  provider: AiProviderType;
  model: string;
  apiBase?: string | null;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  requestTimeoutMs: number;
}

export function providerDto(provider: AiProviderConfig) {
  return {
    id: provider.id,
    label: provider.label,
    provider: provider.provider,
    model: provider.model,
    apiBase: provider.apiBase,
    enabled: provider.enabled,
    priority: provider.priority,
    requestTimeoutMs: provider.requestTimeoutMs,
    hasApiKey: true,
    apiKeyHint: provider.apiKeyHint,
    lastTestStatus: provider.lastTestStatus,
    lastTestedAt: provider.lastTestedAt,
    lastTestLatencyMs: provider.lastTestLatencyMs,
    lastTestHttpStatus: provider.lastTestHttpStatus,
    lastTestError: provider.lastTestError,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export async function writeAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Prisma.InputJsonValue,
  client: ProviderDbClient = prisma,
) {
  return client.adminAuditLog.create({
    data: { actorUserId, action, entityType, entityId: entityId || null, metadata },
  });
}

export async function createProvider(actorUserId: string, input: ProviderWriteInput & { apiKey: string }, client: ProviderDbClient = prisma) {
  const { apiKey, ...data } = input;
  const provider = await client.aiProviderConfig.create({
    data: {
      ...data,
      encryptedApiKey: encryptProviderSecret(apiKey),
      apiKeyHint: providerSecretHint(apiKey),
    },
  });
  await writeAudit(actorUserId, 'provider.created', 'ai_provider', provider.id, {
    provider: provider.provider, model: provider.model, enabled: provider.enabled, priority: provider.priority,
  }, client);
  return provider;
}

export async function updateProvider(actorUserId: string, id: string, input: Partial<ProviderWriteInput>, client: ProviderDbClient = prisma) {
  const { apiKey, ...data } = input;
  const connectionChanged = Boolean(apiKey) || ['provider', 'model', 'apiBase'].some(field => field in data);
  const provider = await client.aiProviderConfig.update({
    where: { id },
    data: {
      ...data,
      ...(apiKey ? { encryptedApiKey: encryptProviderSecret(apiKey), apiKeyHint: providerSecretHint(apiKey) } : {}),
      ...(connectionChanged ? {
        lastTestStatus: null,
        lastTestedAt: null,
        lastTestLatencyMs: null,
        lastTestHttpStatus: null,
        lastTestError: null,
      } : {}),
    },
  });
  await writeAudit(actorUserId, 'provider.updated', 'ai_provider', provider.id, {
    fields: Object.keys(data), keyReplaced: Boolean(apiKey),
  }, client);
  return provider;
}

export async function agentProviderProjection() {
  const providers = await prisma.aiProviderConfig.findMany({
    where: { enabled: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  const projected = providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    provider: provider.provider,
    model: provider.model,
    apiBase: provider.apiBase,
    priority: provider.priority,
    requestTimeoutMs: provider.requestTimeoutMs,
    apiKey: decryptProviderSecret(provider.encryptedApiKey),
  }));
  const revision = createHash('sha256').update(JSON.stringify(projected)).digest('hex');
  return { revision, providers: projected };
}
