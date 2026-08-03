import { Prisma, type TelegramTaskDraft } from '@prisma/client';
import { prisma } from '../db.js';
import { pushTaskToGCal } from '../gcal/service.js';
import { TelegramLinkError } from './service.js';

const DRAFT_TTL_MS = 10 * 60 * 1000;

export const telegramTaskColors = [
  'slate', 'sky', 'indigo', 'violet', 'rose', 'amber', 'jade', 'lime',
] as const;

export type TelegramTaskColor = typeof telegramTaskColors[number];

export type TelegramTaskDraftInput = {
  telegramChatId: string;
  locale: 'vi' | 'en';
  title: string;
  description?: string;
  projectName?: string;
  color?: TelegramTaskColor;
  tagNames?: string[];
  priority?: number | null;
  dueDate?: string;
  dueTime?: string;
};

function dateOnly(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function priorityLabel(priority: number | null, locale: 'vi' | 'en') {
  if (priority == null) return locale === 'vi' ? 'Không' : 'None';
  return `P${priority}`;
}

function colorLabel(color: string | null, locale: 'vi' | 'en') {
  if (!color) return locale === 'vi' ? 'Không' : 'None';
  const labels: Record<string, { vi: string; en: string }> = {
    slate: { vi: 'Xám', en: 'Slate' },
    sky: { vi: 'Xanh da trời', en: 'Sky' },
    indigo: { vi: 'Chàm', en: 'Indigo' },
    violet: { vi: 'Tím', en: 'Violet' },
    rose: { vi: 'Đỏ hồng', en: 'Rose' },
    amber: { vi: 'Cam vàng', en: 'Amber' },
    jade: { vi: 'Xanh ngọc', en: 'Jade' },
    lime: { vi: 'Xanh chanh', en: 'Lime' },
  };
  return labels[color]?.[locale] ?? color;
}

function tagLabel(tagNames: string[], locale: 'vi' | 'en') {
  if (!tagNames.length) return locale === 'vi' ? 'Không' : 'None';
  return tagNames.map(name => `#${name}`).join(', ');
}

function dueLabel(draft: Pick<TelegramTaskDraft, 'dueDate' | 'dueTime'>, locale: 'vi' | 'en') {
  if (!draft.dueDate) return locale === 'vi' ? 'Không' : 'None';
  const day = draft.dueDate.toISOString().slice(0, 10);
  return draft.dueTime ? `${day} ${draft.dueTime}` : day;
}

function draftForm(draft: TelegramTaskDraft, locale: 'vi' | 'en') {
  if (locale === 'en') {
    return [
      'Confirm task creation (not created yet)',
      `Title: ${draft.title}`,
      ...(draft.description ? [`Description: ${draft.description}`] : []),
      `Project: ${draft.projectName ?? 'Inbox'}`,
      `Due: ${dueLabel(draft, locale)}`,
      `Color: ${colorLabel(draft.color, locale)}`,
      `Tags: ${tagLabel(draft.tagNames, locale)}`,
      `Priority: ${priorityLabel(draft.priority, locale)}`,
      'This is the only active draft; it replaces any earlier unconfirmed draft.',
      'Reply: confirm / edit <changes> / cancel',
    ].join('\n');
  }
  return [
    'Xác nhận tạo công việc (chưa tạo)',
    `Tên: ${draft.title}`,
    ...(draft.description ? [`Mô tả: ${draft.description}`] : []),
    `Dự án: ${draft.projectName ?? 'Inbox'}`,
    `Hạn: ${dueLabel(draft, locale)}`,
    `Màu: ${colorLabel(draft.color, locale)}`,
    `Thẻ: ${tagLabel(draft.tagNames, locale)}`,
    `Ưu tiên: ${priorityLabel(draft.priority, locale)}`,
    'Đây là bản nháp đang hoạt động duy nhất; mọi bản nháp chưa xác nhận trước đó đã được thay thế.',
    'Trả lời: xác nhận / sửa <nội dung> / hủy',
  ].join('\n');
}

export async function resolveTelegramOwner(telegramChatId: string) {
  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramChatId },
    select: { userId: true },
  });
  if (!connection) {
    throw new TelegramLinkError('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
  }
  return connection.userId;
}

export async function resolveProject(userId: string, projectName: string | undefined) {
  const normalized = projectName?.trim();
  if (!normalized) return null;
  const projects = await prisma.project.findMany({
    where: {
      userId,
      isArchived: false,
      deletedAt: null,
      name: { equals: normalized, mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 2,
  });
  if (projects.length === 0) {
    throw new TelegramLinkError('Project not found', 404, 'TELEGRAM_PROJECT_NOT_FOUND');
  }
  if (projects.length > 1) {
    throw new TelegramLinkError('Project name is ambiguous', 409, 'TELEGRAM_PROJECT_AMBIGUOUS');
  }
  return projects[0]!;
}

function normalizedTagNames(tagNames: string[] | undefined) {
  const unique = new Map<string, string>();
  for (const rawName of tagNames ?? []) {
    const name = rawName.trim().replace(/^#+/, '').trim();
    if (name) unique.set(name.toLocaleLowerCase('vi'), name);
  }
  return [...unique.values()];
}

export async function resolveTags(userId: string, tagNames: string[] | undefined) {
  const requested = normalizedTagNames(tagNames);
  const resolved: Array<{ id: string; name: string }> = [];
  for (const name of requested) {
    const tags = await prisma.tag.findMany({
      where: { userId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 2,
    });
    if (tags.length === 0) {
      throw new TelegramLinkError('Tag not found', 404, 'TELEGRAM_TAG_NOT_FOUND');
    }
    if (tags.length > 1) {
      throw new TelegramLinkError('Tag name is ambiguous', 409, 'TELEGRAM_TAG_AMBIGUOUS');
    }
    resolved.push(tags[0]!);
  }
  return resolved;
}

async function lockDraftOwner(tx: Prisma.TransactionClient, userId: string, telegramChatId: string) {
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
  const connection = await tx.telegramConnection.findUnique({
    where: { telegramChatId },
    select: { userId: true },
  });
  if (connection?.userId !== userId) {
    throw new TelegramLinkError('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
  }
}

export async function prepareTelegramTaskDraft(input: TelegramTaskDraftInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const project = await resolveProject(userId, input.projectName);
  const tags = await resolveTags(userId, input.tagNames);
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const draft = await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, input.telegramChatId);
    await tx.telegramTaskDraft.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return tx.telegramTaskDraft.create({
      data: {
        userId,
        telegramChatId: input.telegramChatId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        color: input.color ?? null,
        tagIds: tags.map(tag => tag.id),
        tagNames: tags.map(tag => tag.name),
        priority: input.priority ?? null,
        dueDate: dateOnly(input.dueDate),
        dueTime: input.dueTime ?? null,
        expiresAt,
      },
    });
  });
  return {
    draftId: draft.id,
    expiresAt: draft.expiresAt.toISOString(),
    form: draftForm(draft, input.locale),
  };
}

export async function confirmTelegramTaskDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const result = await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, telegramChatId);
    const draft = await tx.telegramTaskDraft.findFirst({
      where: { userId, telegramChatId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new TelegramLinkError('No task draft is waiting for confirmation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
    }
    if (draft.status === 'CONFIRMED' && draft.confirmedTaskId) {
      return { taskId: draft.confirmedTaskId, title: draft.title, alreadyConfirmed: true, task: null };
    }
    if (draft.status !== 'PENDING') {
      throw new TelegramLinkError('Task draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
    }
    if (draft.expiresAt.getTime() <= Date.now()) {
      throw new TelegramLinkError('Task draft has expired', 410, 'TELEGRAM_DRAFT_EXPIRED');
    }
    if (draft.projectId) {
      const ownedProject = await tx.project.findFirst({
        where: { id: draft.projectId, userId, isArchived: false, deletedAt: null },
        select: { id: true },
      });
      if (!ownedProject) {
        throw new TelegramLinkError('Project is no longer available', 409, 'TELEGRAM_PROJECT_UNAVAILABLE');
      }
    }
    if (draft.tagIds.length) {
      const ownedTagCount = await tx.tag.count({
        where: { id: { in: draft.tagIds }, userId, deletedAt: null },
      });
      if (ownedTagCount !== draft.tagIds.length) {
        throw new TelegramLinkError('A tag is no longer available', 409, 'TELEGRAM_TAG_UNAVAILABLE');
      }
    }

    const claimed = await tx.telegramTaskDraft.updateMany({
      where: { id: draft.id, userId, telegramChatId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (claimed.count !== 1) {
      const current = await tx.telegramTaskDraft.findUnique({ where: { id: draft.id } });
      if (current?.status === 'CONFIRMED' && current.confirmedTaskId) {
        return { taskId: current.confirmedTaskId, title: current.title, alreadyConfirmed: true, task: null };
      }
      throw new TelegramLinkError('Task draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
    }

    const task = await tx.task.create({
      data: {
        userId,
        projectId: draft.projectId,
        title: draft.title,
        description: draft.description,
        color: draft.color,
        priority: draft.priority,
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        deadlineDate: draft.dueDate,
        deadlineTime: draft.dueTime,
      },
    });
    if (draft.tagIds.length) {
      await tx.taskTag.createMany({
        data: draft.tagIds.map(tagId => ({ taskId: task.id, tagId })),
      });
    }
    await tx.telegramTaskDraft.update({
      where: { id: draft.id },
      data: { confirmedTaskId: task.id },
    });
    return { taskId: task.id, title: task.title, alreadyConfirmed: false, task };
  });

  if (result.task) void pushTaskToGCal(userId, result.task).catch(() => undefined);
  return {
    taskId: result.taskId,
    alreadyConfirmed: result.alreadyConfirmed,
    message: locale === 'vi'
      ? `Đã tạo công việc: ${result.title}`
      : `Task created: ${result.title}`,
  };
}

export async function cancelTelegramTaskDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, telegramChatId);
    const draft = await tx.telegramTaskDraft.findFirst({
      where: { userId, telegramChatId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new TelegramLinkError('No task draft is waiting for cancellation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
    }
    if (draft.status === 'CONFIRMED') {
      throw new TelegramLinkError('Confirmed task cannot be cancelled as a draft', 409, 'TELEGRAM_DRAFT_CONFIRMED');
    }
    if (draft.status === 'PENDING') {
      await tx.telegramTaskDraft.updateMany({
        where: { id: draft.id, userId, telegramChatId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }
  });
  return {
    cancelled: true,
    message: locale === 'vi' ? 'Đã hủy bản nháp công việc.' : 'Task draft cancelled.',
  };
}
