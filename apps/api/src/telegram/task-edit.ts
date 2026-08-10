import { type TelegramTaskEditDraft } from '@prisma/client';
import { prisma } from '../db.js';
import { pushTaskToGCal } from '../gcal/service.js';
import { TelegramLinkError } from './service.js';
import {
  assertValidDateRange,
  cancelOtherPendingDrafts,
  dateOnly,
  lockDraftOwner,
  resolveProject,
  resolveTelegramOwner,
  telegramTaskColors,
  type TelegramTaskColor,
} from './task-drafts.js';

const DRAFT_TTL_MS = 10 * 60 * 1000;
const MAX_CANDIDATES = 6;

export type TelegramTaskEditInput = {
  telegramChatId: string;
  locale: 'vi' | 'en';
  searchText: string;
  title?: string;
  projectName?: string;
  color?: TelegramTaskColor;
  priority?: number | null;
  startDate?: string;
  dueDate?: string;
  dueTime?: string;
};

type TaskCandidate = {
  id: string;
  title: string;
  dueDate: Date | null;
  dueTime: string | null;
  project: { name: string } | null;
};

function candidateDueLabel(task: TaskCandidate, locale: 'vi' | 'en') {
  if (!task.dueDate) return locale === 'vi' ? 'không hạn' : 'no due date';
  const day = task.dueDate.toISOString().slice(0, 10);
  return task.dueTime ? `${day} ${task.dueTime}` : day;
}

function candidateLine(task: TaskCandidate, index: number, locale: 'vi' | 'en') {
  const project = task.project?.name ?? (locale === 'vi' ? 'Hộp thư' : 'Inbox');
  return `${index + 1}. ${task.title} — ${project}, ${candidateDueLabel(task, locale)}`;
}

async function searchOwnedTasks(userId: string, searchText: string): Promise<TaskCandidate[]> {
  const query = searchText.trim();
  if (!query) return [];
  return prisma.task.findMany({
    where: { userId, deletedAt: null, title: { contains: query, mode: 'insensitive' } },
    select: { id: true, title: true, dueDate: true, dueTime: true, project: { select: { name: true } } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: MAX_CANDIDATES,
  });
}

function fieldChangeLines(draft: TelegramTaskEditDraft, locale: 'vi' | 'en') {
  const lines: string[] = [];
  const push = (viLabel: string, enLabel: string, value: string) => {
    lines.push(locale === 'vi' ? `${viLabel}: ${value}` : `${enLabel}: ${value}`);
  };
  if (draft.title) push('Tên mới', 'New title', draft.title);
  if (draft.projectName) push('Dự án mới', 'New project', draft.projectName);
  if (draft.color) push('Màu mới', 'New color', draft.color);
  if (draft.priority != null) push('Ưu tiên mới', 'New priority', `P${draft.priority}`);
  if (draft.startDate) push('Bắt đầu mới', 'New start', draft.startDate.toISOString().slice(0, 10));
  if (draft.dueDate) {
    const day = draft.dueDate.toISOString().slice(0, 10);
    push('Hạn mới', 'New due', draft.dueTime ? `${day} ${draft.dueTime}` : day);
  } else if (draft.dueTime) {
    push('Giờ mới', 'New time', draft.dueTime);
  }
  return lines;
}

function editDraftForm(draft: TelegramTaskEditDraft, locale: 'vi' | 'en') {
  const changes = fieldChangeLines(draft, locale);
  if (locale === 'en') {
    return [
      'Confirm task edit (not applied yet)',
      `Task: ${draft.taskTitle}`,
      ...changes,
      'This is the only active draft; it replaces any earlier unconfirmed draft.',
      'Reply: confirm / cancel',
    ].join('\n');
  }
  return [
    'Xác nhận sửa công việc (chưa áp dụng)',
    `Công việc: ${draft.taskTitle}`,
    ...changes,
    'Đây là bản nháp đang hoạt động duy nhất; mọi bản nháp chưa xác nhận trước đó đã được thay thế.',
    'Trả lời: xác nhận / hủy',
  ].join('\n');
}

export async function prepareTelegramTaskEditDraft(input: TelegramTaskEditInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const searchText = input.searchText.trim();
  if (!searchText) {
    throw new TelegramLinkError('Search text is required', 400, 'INVALID_DRAFT');
  }
  const candidates = await searchOwnedTasks(userId, searchText);
  if (candidates.length === 0) {
    throw new TelegramLinkError('No matching task was found', 404, 'TELEGRAM_TASK_NOT_FOUND');
  }
  if (candidates.length > 1) {
    const lines = candidates.map((task, index) => candidateLine(task, index, input.locale));
    const header = input.locale === 'vi'
      ? `Có ${candidates.length} công việc khớp với "${searchText}". Hãy nhắc lại yêu cầu với tên rõ hơn hoặc kèm hạn để chọn đúng công việc:`
      : `Found ${candidates.length} tasks matching "${searchText}". Repeat your request with a more specific title or due date to pick one:`;
    return { state: 'ambiguous' as const, form: [header, '', ...lines].join('\n') };
  }

  const task = candidates[0]!;
  const project = await resolveProject(userId, input.projectName);
  const color = input.color && !telegramTaskColors.includes(input.color)
    ? null
    : input.color;
  const startDate = dateOnly(input.startDate);
  const dueDate = dateOnly(input.dueDate);
  if (startDate || dueDate) {
    const existing = await prisma.task.findUnique({ where: { id: task.id }, select: { startDate: true, dueDate: true } });
    assertValidDateRange(startDate ?? existing?.startDate ?? null, dueDate ?? existing?.dueDate ?? null);
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const draft = await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, input.telegramChatId);
    await cancelOtherPendingDrafts(tx, userId);
    return tx.telegramTaskEditDraft.create({
      data: {
        userId,
        telegramChatId: input.telegramChatId,
        taskId: task.id,
        taskTitle: task.title,
        title: input.title?.trim() || null,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        color: color ?? null,
        priority: input.priority ?? null,
        startDate,
        dueDate,
        dueTime: input.dueTime ?? null,
        expiresAt,
      },
    });
  });
  return {
    state: 'ready' as const,
    editDraftId: draft.id,
    expiresAt: draft.expiresAt.toISOString(),
    form: editDraftForm(draft, input.locale),
  };
}

export async function confirmTelegramTaskEditDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const result = await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, telegramChatId);
    const draft = await tx.telegramTaskEditDraft.findFirst({
      where: { userId, telegramChatId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new TelegramLinkError('No task edit draft is waiting for confirmation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
    }
    if (draft.status === 'CONFIRMED') {
      return { title: draft.taskTitle, alreadyConfirmed: true };
    }
    if (draft.status !== 'PENDING') {
      throw new TelegramLinkError('Task edit draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
    }
    if (draft.expiresAt.getTime() <= Date.now()) {
      throw new TelegramLinkError('Task edit draft has expired', 410, 'TELEGRAM_DRAFT_EXPIRED');
    }
    const task = await tx.task.findFirst({
      where: { id: draft.taskId, userId, deletedAt: null },
      select: { id: true, startDate: true, dueDate: true },
    });
    if (!task) {
      throw new TelegramLinkError('Task is no longer available', 409, 'TELEGRAM_TASK_UNAVAILABLE');
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
    const finalStartDate = draft.startDate ?? task.startDate;
    const finalDueDate = draft.dueDate ?? task.dueDate;
    assertValidDateRange(finalStartDate, finalDueDate);

    const claimed = await tx.telegramTaskEditDraft.updateMany({
      where: { id: draft.id, userId, telegramChatId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (claimed.count !== 1) {
      const current = await tx.telegramTaskEditDraft.findUnique({ where: { id: draft.id } });
      if (current?.status === 'CONFIRMED') {
        return { title: current.taskTitle, alreadyConfirmed: true };
      }
      throw new TelegramLinkError('Task edit draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
    }

    const updated = await tx.task.update({
      where: { id: draft.taskId },
      data: {
        ...(draft.title ? { title: draft.title } : {}),
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
        ...(draft.color ? { color: draft.color } : {}),
        ...(draft.priority != null ? { priority: draft.priority } : {}),
        ...(draft.startDate ? { startDate: draft.startDate } : {}),
        ...(draft.dueDate ? { dueDate: draft.dueDate, deadlineDate: draft.dueDate } : {}),
        ...(draft.dueTime ? { dueTime: draft.dueTime, deadlineTime: draft.dueTime } : {}),
      },
    });
    return { title: updated.title, alreadyConfirmed: false, task: updated };
  });

  if ('task' in result && result.task) void pushTaskToGCal(userId, result.task).catch(() => undefined);
  return {
    alreadyConfirmed: result.alreadyConfirmed,
    message: locale === 'vi'
      ? `Đã cập nhật công việc: ${result.title}`
      : `Task updated: ${result.title}`,
  };
}

export async function cancelTelegramTaskEditDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, telegramChatId);
    const draft = await tx.telegramTaskEditDraft.findFirst({
      where: { userId, telegramChatId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new TelegramLinkError('No task edit draft is waiting for cancellation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
    }
    if (draft.status === 'CONFIRMED') {
      throw new TelegramLinkError('Confirmed task edit cannot be cancelled as a draft', 409, 'TELEGRAM_DRAFT_CONFIRMED');
    }
    if (draft.status === 'PENDING') {
      await tx.telegramTaskEditDraft.updateMany({
        where: { id: draft.id, userId, telegramChatId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }
  });
  return {
    cancelled: true,
    message: locale === 'vi' ? 'Đã hủy bản nháp sửa công việc.' : 'Task edit draft cancelled.',
  };
}
