import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import {
  AgentDraftError,
  cancelAgentDraft,
  confirmAgentDraft,
  latestAgentDraft,
  type CreatePayload,
} from '../agent-drafts/service.js';
import { syncTimeBlocksToProvider } from '../calendar/provider-sync.js';
import { googleCalendarProvider } from '../calendar/providers/google.js';
import { zonedDateTimeToUtc } from '../tasks/deadline.js';
import { TelegramLinkError } from './service.js';

const DRAFT_TTL_MS = 10 * 60 * 1000;

export async function syncTelegramTaskCalendar(userId: string, taskId: string): Promise<void> {
  if (!await googleCalendarProvider.isConnected(userId)) return;
  await syncTimeBlocksToProvider(googleCalendarProvider, userId, { taskId });
}

export const telegramTaskColors = [
  'slate', 'sky', 'indigo', 'violet', 'rose', 'amber', 'jade', 'lime',
] as const;

export type TelegramTaskColor = typeof telegramTaskColors[number];

// These names are kept at the Telegram HTTP boundary for one compatibility
// window. They are immediately normalized into AgentDraft.deadline/plannedTime;
// no legacy draft or Task schedule column is written.
export type TelegramTaskDraftInput = {
  telegramChatId: string;
  locale: 'vi' | 'en';
  title: string;
  description?: string;
  projectName?: string;
  color?: TelegramTaskColor;
  tagNames?: string[];
  priority?: number | null;
  startDate?: string;
  dueDate?: string;
  dueTime?: string;
  endTime?: string;
};

export type TelegramTaskBatchDraftInput = {
  telegramChatId: string;
  locale: 'vi' | 'en';
  titles: string[];
  projectName?: string;
  color?: TelegramTaskColor;
  tagNames?: string[];
  createTagNames?: string[];
  priority?: number | null;
  startDate?: string;
  dueDate?: string;
  dueTime?: string;
};

type DraftView = {
  title: string;
  description?: string;
  projectName: string | null;
  color: string | null;
  tagNames: string[];
  priority: number | null;
  startDate: string | null;
  deadlineDate: string | null;
  deadlineTime: string | null;
  blockEndTime: string | null;
};

export function dateOnly(value: string | undefined) {
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

function deadlineLabel(view: DraftView, locale: 'vi' | 'en') {
  if (!view.deadlineDate) return locale === 'vi' ? 'Không' : 'None';
  if (!view.deadlineTime) return view.deadlineDate;
  if (view.blockEndTime) return `${view.deadlineDate} ${view.deadlineTime}-${view.blockEndTime}`;
  return `${view.deadlineDate} ${view.deadlineTime}`;
}

function startLabel(value: string | null, locale: 'vi' | 'en') {
  return value ?? (locale === 'vi' ? 'Không' : 'None');
}

export function assertValidDateRange(startDate: Date | null, deadlineDate: Date | null) {
  if (startDate && deadlineDate && startDate > deadlineDate) {
    throw new TelegramLinkError('Start date must be on or before the deadline', 400, 'TELEGRAM_INVALID_DATE_RANGE');
  }
}

function draftForm(view: DraftView, locale: 'vi' | 'en') {
  if (locale === 'en') {
    return [
      'Confirm task creation (not created yet)',
      `Title: ${view.title}`,
      ...(view.description ? [`Description: ${view.description}`] : []),
      `Project: ${view.projectName ?? 'Inbox'}`,
      `Start: ${startLabel(view.startDate, locale)}`,
      `Due: ${deadlineLabel(view, locale)}`,
      `Color: ${colorLabel(view.color, locale)}`,
      `Tags: ${tagLabel(view.tagNames, locale)}`,
      `Priority: ${priorityLabel(view.priority, locale)}`,
      'This is the only active draft; it replaces any earlier unconfirmed draft.',
      'Reply: confirm / edit <changes> / cancel',
    ].join('\n');
  }
  return [
    'Xác nhận tạo công việc (chưa tạo)',
    `Tên: ${view.title}`,
    ...(view.description ? [`Mô tả: ${view.description}`] : []),
    `Dự án: ${view.projectName ?? 'Inbox'}`,
    `Bắt đầu: ${startLabel(view.startDate, locale)}`,
    `Hạn: ${deadlineLabel(view, locale)}`,
    `Màu: ${colorLabel(view.color, locale)}`,
    `Thẻ: ${tagLabel(view.tagNames, locale)}`,
    `Ưu tiên: ${priorityLabel(view.priority, locale)}`,
    'Đây là bản nháp đang hoạt động duy nhất; mọi bản nháp chưa xác nhận trước đó đã được thay thế.',
    'Trả lời: xác nhận / sửa <nội dung> / hủy',
  ].join('\n');
}

function batchDraftForm(views: DraftView[], createTagNames: string[], locale: 'vi' | 'en') {
  const first = views[0]!;
  const taskLines = views.map((view, index) => `${index + 1}. ${view.title}`);
  if (locale === 'en') {
    return [
      `Confirm creation of ${views.length} tasks (not created yet)`,
      `Project: ${first.projectName ?? 'Inbox'}`,
      `Start: ${startLabel(first.startDate, locale)}`,
      `Due: ${deadlineLabel(first, locale)}`,
      `Color: ${colorLabel(first.color, locale)}`,
      `Existing tags: ${tagLabel(first.tagNames, locale)}`,
      `Tags to create: ${tagLabel(createTagNames, locale)}`,
      `Priority: ${priorityLabel(first.priority, locale)}`,
      '', ...taskLines, '', 'Reply: confirm / cancel',
    ].join('\n');
  }
  return [
    `Xác nhận tạo ${views.length} công việc (chưa tạo)`,
    `Dự án: ${first.projectName ?? 'Hộp thư'}`,
    `Bắt đầu: ${startLabel(first.startDate, locale)}`,
    `Hạn: ${deadlineLabel(first, locale)}`,
    `Màu: ${colorLabel(first.color, locale)}`,
    `Thẻ đã có: ${tagLabel(first.tagNames, locale)}`,
    `Thẻ sẽ tạo: ${tagLabel(createTagNames, locale)}`,
    `Ưu tiên: ${priorityLabel(first.priority, locale)}`,
    '', ...taskLines, '', 'Trả lời: xác nhận / hủy',
  ].join('\n');
}

export async function resolveTelegramOwner(telegramChatId: string) {
  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramChatId },
    select: { userId: true },
  });
  if (!connection) throw new TelegramLinkError('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
  return connection.userId;
}

export async function resolveProject(userId: string, projectName: string | undefined) {
  const normalized = projectName?.trim();
  if (!normalized) return null;
  const projects = await prisma.project.findMany({
    where: { userId, isArchived: false, deletedAt: null, name: { equals: normalized, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 2,
  });
  if (projects.length === 0) throw new TelegramLinkError('Project not found', 404, 'TELEGRAM_PROJECT_NOT_FOUND');
  if (projects.length > 1) throw new TelegramLinkError('Project name is ambiguous', 409, 'TELEGRAM_PROJECT_AMBIGUOUS');
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
  const resolved: Array<{ id: string; name: string }> = [];
  for (const name of normalizedTagNames(tagNames)) {
    const tags = await prisma.tag.findMany({
      where: { userId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 2,
    });
    if (tags.length === 0) throw new TelegramLinkError('Tag not found', 404, 'TELEGRAM_TAG_NOT_FOUND');
    if (tags.length > 1) throw new TelegramLinkError('Tag name is ambiguous', 409, 'TELEGRAM_TAG_AMBIGUOUS');
    resolved.push(tags[0]!);
  }
  return resolved;
}

async function resolveBatchTags(userId: string, tagNames: string[] | undefined, createTagNames: string[] | undefined) {
  const existing = await resolveTags(userId, tagNames);
  const pendingCreate: string[] = [];
  const resolved = new Map(existing.map(tag => [tag.name.toLocaleLowerCase('vi'), tag]));
  for (const name of normalizedTagNames(createTagNames)) {
    const tags = await prisma.tag.findMany({
      where: { userId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 2,
    });
    if (tags.length > 1) throw new TelegramLinkError('Tag name is ambiguous', 409, 'TELEGRAM_TAG_AMBIGUOUS');
    if (tags[0]) resolved.set(tags[0].name.toLocaleLowerCase('vi'), tags[0]);
    else pendingCreate.push(name);
  }
  return { existing: [...resolved.values()], pendingCreate };
}

export async function lockDraftOwner(tx: Prisma.TransactionClient, userId: string, telegramChatId: string) {
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
  const connection = await tx.telegramConnection.findUnique({ where: { telegramChatId }, select: { userId: true } });
  if (connection?.userId !== userId) {
    throw new TelegramLinkError('Telegram account is not connected', 403, 'TELEGRAM_NOT_CONNECTED');
  }
}

export async function cancelOtherPendingDrafts(tx: Prisma.TransactionClient, userId: string) {
  await tx.agentDraft.updateMany({ where: { userId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
}

async function ownerTimeZone(userId: string) {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  return owner?.timeZone || 'Asia/Ho_Chi_Minh';
}

function createPayload(
  input: Omit<TelegramTaskDraftInput, 'telegramChatId' | 'locale' | 'projectName' | 'tagNames'>,
  projectId: string | undefined,
  tagIds: string[],
  createTagNames: string[],
  timeZone: string,
): CreatePayload {
  const deadline = input.dueDate
    ? { date: input.dueDate, ...(input.dueTime ? { time: input.dueTime, timeZone } : {}) }
    : undefined;
  const plannedTime = input.dueDate && input.dueTime && input.endTime
    ? {
        startAt: zonedDateTimeToUtc(input.dueDate, input.dueTime, timeZone).toISOString(),
        endAt: zonedDateTimeToUtc(input.dueDate, input.endTime, timeZone).toISOString(),
        timeZone,
        allDay: false,
      }
    : undefined;
  return {
    title: input.title.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(projectId ? { projectId } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(deadline ? { deadline } : {}),
    ...(plannedTime ? { plannedTime } : {}),
    tagIds,
    createTagNames,
  };
}

function viewFor(input: TelegramTaskDraftInput, projectName: string | null, tagNames: string[]): DraftView {
  return {
    title: input.title.trim(),
    description: input.description?.trim(),
    projectName,
    color: input.color ?? null,
    tagNames,
    priority: input.priority ?? null,
    startDate: input.startDate ?? null,
    deadlineDate: input.dueDate ?? null,
    deadlineTime: input.dueTime ?? null,
    blockEndTime: input.endTime ?? null,
  };
}

async function storeTelegramDraft(
  userId: string,
  telegramChatId: string,
  kind: 'CREATE_TASK' | 'CREATE_TASK_BATCH',
  payload: Prisma.InputJsonValue,
) {
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  return prisma.$transaction(async tx => {
    await lockDraftOwner(tx, userId, telegramChatId);
    await cancelOtherPendingDrafts(tx, userId);
    return tx.agentDraft.create({
      data: { userId, transport: 'TELEGRAM', transportRef: telegramChatId, kind, payload, expiresAt },
    });
  });
}

export async function prepareTelegramTaskDraft(input: TelegramTaskDraftInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const project = await resolveProject(userId, input.projectName);
  const tags = await resolveTags(userId, input.tagNames);
  assertValidDateRange(dateOnly(input.startDate), dateOnly(input.dueDate));
  if (input.endTime && (!input.dueTime || input.endTime <= input.dueTime)) {
    throw new TelegramLinkError('End time must be after the planned start time', 400, 'TELEGRAM_INVALID_TIME_RANGE');
  }
  const payload = createPayload(input, project?.id, tags.map(tag => tag.id), [], await ownerTimeZone(userId));
  const draft = await storeTelegramDraft(userId, input.telegramChatId, 'CREATE_TASK', payload as Prisma.InputJsonValue);
  return {
    draftId: draft.id,
    expiresAt: draft.expiresAt.toISOString(),
    form: draftForm(viewFor(input, project?.name ?? null, tags.map(tag => tag.name)), input.locale),
  };
}

export async function prepareTelegramTaskBatchDraft(input: TelegramTaskBatchDraftInput) {
  const userId = await resolveTelegramOwner(input.telegramChatId);
  const project = await resolveProject(userId, input.projectName);
  const tagPlan = await resolveBatchTags(userId, input.tagNames, input.createTagNames);
  assertValidDateRange(dateOnly(input.startDate), dateOnly(input.dueDate));
  const timeZone = await ownerTimeZone(userId);
  const taskInputs = input.titles.map(title => ({ ...input, title }));
  const tasks = taskInputs.map(task => createPayload(
    task,
    project?.id,
    tagPlan.existing.map(tag => tag.id),
    tagPlan.pendingCreate,
    timeZone,
  ));
  const draft = await storeTelegramDraft(
    userId,
    input.telegramChatId,
    'CREATE_TASK_BATCH',
    { tasks } as Prisma.InputJsonValue,
  );
  const views = taskInputs.map(task => viewFor(task, project?.name ?? null, tagPlan.existing.map(tag => tag.name)));
  return {
    batchDraftId: draft.id,
    expiresAt: draft.expiresAt.toISOString(),
    form: batchDraftForm(views, tagPlan.pendingCreate, input.locale),
  };
}

function translateAgentDraftError(error: unknown): never {
  if (!(error instanceof AgentDraftError)) throw error;
  const code = error.message === 'A tag is no longer available' ? 'TELEGRAM_TAG_UNAVAILABLE'
    : error.statusCode === 410 ? 'TELEGRAM_DRAFT_EXPIRED'
    : error.statusCode === 404 ? 'TELEGRAM_DRAFT_NOT_FOUND'
      : 'TELEGRAM_DRAFT_CLOSED';
  throw new TelegramLinkError(error.message, error.statusCode, code);
}

async function latestTelegramDraft(userId: string, telegramChatId: string, kinds: Array<'CREATE_TASK' | 'CREATE_TASK_BATCH' | 'EDIT_TASK'>) {
  const draft = await latestAgentDraft(userId, 'TELEGRAM', telegramChatId, kinds);
  if (!draft) throw new TelegramLinkError('No task draft is waiting', 404, 'TELEGRAM_DRAFT_NOT_FOUND');
  return draft;
}

export async function confirmTelegramTaskDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const draft = await latestTelegramDraft(userId, telegramChatId, ['CREATE_TASK']);
  let confirmed;
  try {
    confirmed = await confirmAgentDraft(userId, draft.id);
  } catch (error) {
    translateAgentDraftError(error);
  }
  if (confirmed.status === 'EXPIRED') {
    throw new TelegramLinkError('Task draft has expired', 410, 'TELEGRAM_DRAFT_EXPIRED');
  }
  if (confirmed.status !== 'CONFIRMED' || !confirmed.resultIds[0]) {
    throw new TelegramLinkError('Task draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
  }
  const payload = confirmed.payload as unknown as CreatePayload;
  const taskId = confirmed.resultIds[0];
  if (draft.status !== 'CONFIRMED') void syncTelegramTaskCalendar(userId, taskId).catch(() => undefined);
  return {
    taskId,
    alreadyConfirmed: draft.status === 'CONFIRMED',
    message: locale === 'vi' ? `Đã tạo công việc: ${payload.title}` : `Task created: ${payload.title}`,
  };
}

export async function confirmTelegramTaskBatchDraft(telegramChatId: string, locale: 'vi' | 'en') {
  const userId = await resolveTelegramOwner(telegramChatId);
  const draft = await latestTelegramDraft(userId, telegramChatId, ['CREATE_TASK_BATCH']);
  let confirmed;
  try {
    confirmed = await confirmAgentDraft(userId, draft.id);
  } catch (error) {
    translateAgentDraftError(error);
  }
  if (confirmed.status === 'EXPIRED') {
    throw new TelegramLinkError('Task batch draft has expired', 410, 'TELEGRAM_DRAFT_EXPIRED');
  }
  const payload = confirmed.payload as unknown as { tasks: CreatePayload[] };
  const taskIds = confirmed.resultIds.slice(0, payload.tasks.length);
  if (confirmed.status !== 'CONFIRMED' || taskIds.length !== payload.tasks.length) {
    throw new TelegramLinkError('Task batch draft is no longer pending', 409, 'TELEGRAM_DRAFT_CLOSED');
  }
  if (draft.status !== 'CONFIRMED') {
    for (const taskId of taskIds) void syncTelegramTaskCalendar(userId, taskId).catch(() => undefined);
  }
  return {
    taskIds,
    alreadyConfirmed: draft.status === 'CONFIRMED',
    message: locale === 'vi' ? `Đã tạo ${taskIds.length} công việc.` : `Created ${taskIds.length} tasks.`,
  };
}

async function cancelLatest(telegramChatId: string, kinds: Array<'CREATE_TASK' | 'CREATE_TASK_BATCH'>) {
  const userId = await resolveTelegramOwner(telegramChatId);
  const draft = await latestTelegramDraft(userId, telegramChatId, kinds);
  try {
    await cancelAgentDraft(userId, draft.id);
  } catch (error) {
    translateAgentDraftError(error);
  }
}

export async function cancelTelegramTaskDraft(telegramChatId: string, locale: 'vi' | 'en') {
  await cancelLatest(telegramChatId, ['CREATE_TASK']);
  return { cancelled: true, message: locale === 'vi' ? 'Đã hủy bản nháp công việc.' : 'Task draft cancelled.' };
}

export async function cancelTelegramTaskBatchDraft(telegramChatId: string, locale: 'vi' | 'en') {
  await cancelLatest(telegramChatId, ['CREATE_TASK_BATCH']);
  return { cancelled: true, message: locale === 'vi' ? 'Đã hủy danh sách công việc.' : 'Task batch draft cancelled.' };
}
