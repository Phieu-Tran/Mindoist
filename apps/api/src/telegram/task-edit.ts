import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import {
  AgentDraftError,
  cancelAgentDraft,
  confirmAgentDraft,
  latestAgentDraft,
} from '../agent-drafts/service.js';
import { TelegramLinkError } from './service.js';
import {
  assertValidDateRange,
  cancelOtherPendingDrafts,
  dateOnly,
  lockDraftOwner,
  resolveProject,
  resolveTelegramOwner,
  syncTelegramTaskCalendar,
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
  deadlineDate: Date | null;
  deadlineTime: string | null;
  deadlineTimeZone: string | null;
  startDate: Date | null;
  project: { name: string } | null;
};

type EditPreview = {
  taskTitle: string;
  title?: string;
  projectName?: string;
  color?: string;
  priority?: number | null;
  startDate?: string;
  deadlineDate?: string;
  deadlineTime?: string;
};

function candidateDeadlineLabel(task: TaskCandidate, locale: 'vi' | 'en') {
  if (!task.deadlineDate) return locale === 'vi' ? 'không hạn' : 'no deadline';
  const day = task.deadlineDate.toISOString().slice(0, 10);
  return task.deadlineTime ? `${day} ${task.deadlineTime}` : day;
}

function candidateLine(task: TaskCandidate, index: number, locale: 'vi' | 'en') {
  const project = task.project?.name ?? (locale === 'vi' ? 'Hộp thư' : 'Inbox');
  return `${index + 1}. ${task.title} — ${project}, ${candidateDeadlineLabel(task, locale)}`;
}

async function searchOwnedTasks(userId: string, searchText: string): Promise<TaskCandidate[]> {
  const query = searchText.trim();
  if (!query) return [];
  return prisma.task.findMany({
    where: { userId, deletedAt: null, title: { contains: query, mode: 'insensitive' } },
    select: {
      id: true,
      title: true,
      deadlineDate: true,
      deadlineTime: true,
      deadlineTimeZone: true,
      startDate: true,
      project: { select: { name: true } },
    },
    orderBy: [{ deadlineDate: 'asc' }, { createdAt: 'desc' }],
    take: MAX_CANDIDATES,
  });
}

function fieldChangeLines(preview: EditPreview, locale: 'vi' | 'en') {
  const lines: string[] = [];
  const push = (viLabel: string, enLabel: string, value: string) => {
    lines.push(locale === 'vi' ? `${viLabel}: ${value}` : `${enLabel}: ${value}`);
  };
  if (preview.title) push('Tên mới', 'New title', preview.title);
  if (preview.projectName) push('Dự án mới', 'New project', preview.projectName);
  if (preview.color) push('Màu mới', 'New color', preview.color);
  if (preview.priority !== undefined) {
    push('Ưu tiên mới', 'New priority', preview.priority == null ? (locale === 'vi' ? 'Không' : 'None') : `P${preview.priority}`);
  }
  if (preview.startDate) push('Bắt đầu mới', 'New start', preview.startDate);
  if (preview.deadlineDate) {
    push('Hạn mới', 'New deadline', preview.deadlineTime ? `${preview.deadlineDate} ${preview.deadlineTime}` : preview.deadlineDate);
  } else if (preview.deadlineTime) {
    push('Giờ mới', 'New time', preview.deadlineTime);
  }
  return lines;
}

function editDraftForm(preview: EditPreview, locale: 'vi' | 'en') {
  const changes = fieldChangeLines(preview, locale);
  if (locale === 'en') {
    return [
      'Confirm task edit (not applied yet)',
      `Task: ${preview.taskTitle}`,
      ...changes,
      'This is the only active draft; it replaces any earlier unconfirmed draft.',
      'Reply: confirm / cancel',
    ].join('\n');
  }
  return [
    'Xác nhận sửa công việc (chưa áp dụng)',
    `Công việc: ${preview.taskTitle}`,
    ...changes,
    'Đây là bản nháp đang hoạt động duy nhất; mọi bản nháp chưa xác nhận trước đó đã được thay thế.',
    'Trả lời: xác nhận / hủy',
  ].join('\n');
}

function translateAgentDraftError(error: unknown): never {
  if (!(error instanceof AgentDraftError)) throw error;
  const code = error.statusCode === 410 ? 'TELEGRAM_DRAFT_EXPIRED'
    : error.statusCode === 404 ? 'TELEGRAM_DRAFT_NOT_FOUND'
      : 'TELEGRAM_DRAFT_CLOSED';
  throw new TelegramLinkError(error.message, error.statusCode, code);
}

export async function prepareTelegramTaskEditDraft(input: TelegramTaskEditInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const searchText = input.searchText.trim();
  if (!searchText) throw new TelegramLinkError('Search text is required', 400, 'INVALID_DRAFT');

  const candidates = await searchOwnedTasks(userId, searchText);
  if (candidates.length === 0) {
    throw new TelegramLinkError('No matching task was found', 404, 'TELEGRAM_TASK_NOT_FOUND');
  }
  if (candidates.length > 1) {
    const lines = candidates.map((task, index) => candidateLine(task, index, input.locale));
    const header = input.locale === 'vi'
      ? `Có ${candidates.length} công việc khớp với "${searchText}". Hãy nhắc lại yêu cầu với tên rõ hơn hoặc kèm hạn để chọn đúng công việc:`
      : `Found ${candidates.length} tasks matching "${searchText}". Repeat your request with a more specific title or deadline to pick one:`;
    return { state: 'ambiguous' as const, form: [header, '', ...lines].join('\n') };
  }

  const task = candidates[0]!;
  const project = await resolveProject(userId, input.projectName);
  const color = input.color && !telegramTaskColors.includes(input.color) ? undefined : input.color;
  const nextStartDate = input.startDate ? dateOnly(input.startDate) : task.startDate;
  const nextDeadlineDate = input.dueDate ? dateOnly(input.dueDate) : task.deadlineDate;
  if (input.startDate || input.dueDate) assertValidDateRange(nextStartDate, nextDeadlineDate);

  const patch: Record<string, unknown> = {};
  if (input.title?.trim()) patch.title = input.title.trim();
  if (project) patch.projectId = project.id;
  if (color) patch.color = color;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.startDate) patch.startDate = input.startDate;
  if (input.dueDate || input.dueTime) {
    const day = input.dueDate ?? task.deadlineDate?.toISOString().slice(0, 10);
    if (!day) throw new TelegramLinkError('A deadline time requires a deadline date', 400, 'TELEGRAM_INVALID_DATE_RANGE');
    const time = input.dueTime ?? (input.dueDate ? undefined : task.deadlineTime ?? undefined);
    patch.deadline = {
      date: day,
      ...(time ? { time, timeZone: task.deadlineTimeZone || 'Asia/Ho_Chi_Minh' } : {}),
    };
  }
  if (Object.keys(patch).length === 0) {
    throw new TelegramLinkError('At least one edit is required', 400, 'INVALID_DRAFT');
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const draft = await prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, input.telegramChatId);
    await cancelOtherPendingDrafts(tx, userId);
    return tx.agentDraft.create({
      data: {
        userId,
        transport: 'TELEGRAM',
        transportRef: input.telegramChatId,
        kind: 'EDIT_TASK',
        payload: { taskId: task.id, patch } as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  });
  const preview: EditPreview = {
    taskTitle: task.title,
    title: input.title?.trim(),
    projectName: project?.name,
    color,
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    startDate: input.startDate,
    deadlineDate: input.dueDate,
    deadlineTime: input.dueTime,
  };
  return {
    state: 'ready' as const,
    editDraftId: draft.id,
    expiresAt: draft.expiresAt.toISOString(),
    form: editDraftForm(preview, input.locale),
  };
}

export async function confirmTelegramTaskEditDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const draft = await latestAgentDraft(userId, 'TELEGRAM', telegramChatId, ['EDIT_TASK']);
  if (!draft) throw new TelegramLinkError('No task edit draft is waiting for confirmation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
  let confirmed;
  try {
    confirmed = await confirmAgentDraft(userId, draft.id);
  } catch (error) {
    translateAgentDraftError(error);
  }
  if (confirmed.status === 'EXPIRED') {
    throw new TelegramLinkError('Task edit draft has expired', 410, 'TELEGRAM_DRAFT_EXPIRED');
  }
  const payload = confirmed.payload as unknown as { taskId: string };
  const task = await prisma.task.findFirst({ where: { id: payload.taskId, userId, deletedAt: null }, select: { id: true, title: true } });
  if (confirmed.status !== 'CONFIRMED' || !task) {
    throw new TelegramLinkError('Task edit draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
  }
  if (draft.status !== 'CONFIRMED') void syncTelegramTaskCalendar(userId, task.id).catch(() => undefined);
  return {
    alreadyConfirmed: draft.status === 'CONFIRMED',
    message: locale === 'vi' ? `Đã cập nhật công việc: ${task.title}` : `Task updated: ${task.title}`,
  };
}

export async function cancelTelegramTaskEditDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const draft = await latestAgentDraft(userId, 'TELEGRAM', telegramChatId, ['EDIT_TASK']);
  if (!draft) throw new TelegramLinkError('No task edit draft is waiting for cancellation', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
  try {
    await cancelAgentDraft(userId, draft.id);
  } catch (error) {
    translateAgentDraftError(error);
  }
  return {
    cancelled: true,
    message: locale === 'vi' ? 'Đã hủy bản nháp sửa công việc.' : 'Task edit draft cancelled.',
  };
}
