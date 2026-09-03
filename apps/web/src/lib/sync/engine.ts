import { db, type PendingMutation, type SyncCursor } from './db';
import { getAccessToken } from '../auth-tokens';

const API_BASE = import.meta.env.VITE_API_URL || '';

// --- Types ---

interface SyncItem {
  table: 'task' | 'timeBlock' | 'project' | 'tag' | 'section' | 'taskTag' | 'note' | 'reminder' | 'projectColumn' | 'taskChecklistItem' | 'area';
  version?: 1 | 2 | 3;
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

interface SyncChangesResponse {
  success: boolean;
  data: { items: SyncItem[]; serverTime: string };
}

interface SyncPushResponse {
  success: boolean;
  data: { accepted: string[]; serverTime: string };
}

export const SYNC_APPLIED_EVENT = 'mindoist:sync-applied';

export type SyncPhase = 'offline' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  online: boolean;
  phase: SyncPhase;
  pendingCount: number;
  lastSyncedAt: string | null;
  error: string | null;
}

type SyncStatusCallback = (status: SyncStatus) => void;

const syncStatusListeners = new Set<SyncStatusCallback>();
let syncStatus: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  phase: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
};

function publishSyncStatus(patch: Partial<SyncStatus>): void {
  syncStatus = { ...syncStatus, ...patch };
  const snapshot = { ...syncStatus };
  syncStatusListeners.forEach(listener => listener(snapshot));
}

async function hydrateSyncStatus(): Promise<void> {
  const [pendingCount, cursor] = await Promise.all([
    db.pendingMutations.count(),
    db.syncCursor.get('singleton'),
  ]);
  publishSyncStatus({
    pendingCount,
    lastSyncedAt: cursor?.updatedAt ?? syncStatus.lastSyncedAt,
  });
}

function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Sync failed';
}

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

export function onSyncStatusChange(callback: SyncStatusCallback): () => void {
  syncStatusListeners.add(callback);
  callback(getSyncStatus());
  void hydrateSyncStatus().catch(() => {});
  return () => syncStatusListeners.delete(callback);
}

// --- Auth helper ---

function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- Queue ---

let queueCounter = 0;

export function enqueueMutation(
  table: PendingMutation['table'],
  entityId: string,
  operation: PendingMutation['operation'],
  data: Record<string, unknown>,
  updatedAt: string
): string {
  const id = `mut-${Date.now()}-${++queueCounter}`;
  publishSyncStatus({ pendingCount: syncStatus.pendingCount + 1 });
  void db.pendingMutations.add({
    id,
    table,
    entityId,
    operation,
    data,
    updatedAt,
    createdAt: new Date().toISOString(),
  }).then(async () => {
    await hydrateSyncStatus();
    scheduleMutationSync();
  }).catch(async error => {
    publishSyncStatus({
      phase: 'error',
      pendingCount: await db.pendingMutations.count().catch(() => 0),
      error: syncErrorMessage(error),
    });
  });
  return id;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  return db.pendingMutations.toArray();
}

export async function clearPendingMutations(ids: string[]): Promise<void> {
  await db.pendingMutations.bulkDelete(ids);
  await hydrateSyncStatus();
}

// --- Cursor ---

async function getCursor(): Promise<string> {
  const cursor = await db.syncCursor.get('singleton');
  return cursor?.serverTime || new Date(0).toISOString();
}

async function setCursor(serverTime: string): Promise<void> {
  await db.syncCursor.put({
    key: 'singleton',
    serverTime,
    updatedAt: new Date().toISOString(),
  });
}

// --- Pull ---

interface PullResult {
  version?: number;
  items: SyncItem[];
  serverTime: string;
}

async function pullChanges(since: string): Promise<PullResult> {
  const res = await fetch(`${API_BASE}/sync/changes?since=${encodeURIComponent(since)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
  const json: SyncChangesResponse = await res.json();
  if (!json.success) throw new Error('Sync pull failed');
  return { items: json.data.items, serverTime: json.data.serverTime };
}

async function applyPull(items: SyncItem[]): Promise<void> {
  await db.transaction('rw', [db.tasks, db.timeBlocks, db.projects, db.tags, db.sections, db.taskTags, db.notes, db.reminders, db.projectColumns, db.taskChecklistItems, db.areas], async () => {
    for (const item of items) {
      const isDeleted = item.data.deletedAt != null;

      if (item.table === 'task') {
        if (isDeleted) {
          await db.tasks.delete(item.id);
        } else {
          await db.tasks.put({
            id: item.id,
            title: item.data.title as string,
            description: (item.data.description as string) ?? null,
            color: (item.data.color as string) ?? null,
            projectId: (item.data.projectId as string) ?? null,
            sectionId: (item.data.sectionId as string) ?? null,
            parentId: (item.data.parentId as string) ?? null,
            priority: (item.data.priority as number) ?? null,
            deadlineDate: (item.data.deadlineDate as string) ?? null,
            deadlineTime: (item.data.deadlineTime as string) ?? null,
            deadlineTimeZone: (item.data.deadlineTimeZone as string) ?? null,
            startDate: (item.data.startDate as string) ?? null,
            estimateMin: (item.data.estimateMin as number) ?? null,
            snoozedUntil: (item.data.snoozedUntil as string) ?? null,
            fieldVersions: (item.data.fieldVersions as Record<string, string>) ?? null,
            rrule: (item.data.rrule as string) ?? null,
            completedAt: (item.data.completedAt as string) ?? null,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'timeBlock') {
        if (isDeleted) {
          await db.timeBlocks.delete(item.id);
        } else {
          await db.timeBlocks.put({
            id: item.id,
            taskId: item.data.taskId as string,
            startAt: item.data.startAt as string,
            endAt: item.data.endAt as string,
            timeZone: item.data.timeZone as string,
            allDay: (item.data.allDay as boolean) ?? false,
            source:
              (item.data.source as 'MANUAL' | 'RECURRENCE' | 'IMPORT' | 'EXTERNAL') ??
              'MANUAL',
            completedAt: (item.data.completedAt as string) ?? null,
            actualMin: (item.data.actualMin as number) ?? null,
            fieldVersions: (item.data.fieldVersions as Record<string, string>) ?? null,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'project') {
        if (isDeleted) {
          await db.projects.delete(item.id);
        } else {
          await db.projects.put({
            id: item.id,
            name: item.data.name as string,
            color: (item.data.color as string) ?? null,
            isArchived: (item.data.isArchived as boolean) ?? false,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'tag') {
        if (isDeleted) {
          await db.tags.delete(item.id);
        } else {
          await db.tags.put({
            id: item.id,
            name: item.data.name as string,
            color: (item.data.color as string) ?? null,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'section') {
        if (isDeleted) {
          await db.sections.delete(item.id);
        } else {
          await db.sections.put({
            id: item.id,
            projectId: item.data.projectId as string,
            name: item.data.name as string,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'taskTag') {
        if (isDeleted) {
          await db.taskTags.delete(item.id);
        } else {
          await db.taskTags.put({
            id: item.id,
            taskId: item.data.taskId as string,
            tagId: item.data.tagId as string,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'note') {
        if (isDeleted) {
          await db.notes.delete(item.id);
        } else {
          await db.notes.put({
            id: item.id,
            userId: item.data.userId as string,
            taskId: (item.data.taskId as string) ?? null,
            title: (item.data.title as string) ?? null,
            content: (item.data.content as string) ?? null,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'reminder') {
        if (isDeleted) {
          await db.reminders.delete(item.id);
        } else {
          await db.reminders.put({
            id: item.id,
            taskId: item.data.taskId as string,
            remindAt: item.data.remindAt as string,
            type: item.data.type as string,
            isSent: (item.data.isSent as boolean) ?? false,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
          });
        }
      } else if (item.table === 'projectColumn') {
        if (isDeleted) {
          await db.projectColumns.delete(item.id);
        } else {
          await db.projectColumns.put({
            id: item.id,
            projectId: item.data.projectId as string,
            name: item.data.name as string,
            color: (item.data.color as string) ?? 'slate',
            isDone: (item.data.isDone as boolean) ?? false,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
            deletedAt: null,
          });
        }
      } else if (item.table === 'taskChecklistItem') {
        if (isDeleted) {
          await db.taskChecklistItems.delete(item.id);
        } else {
          await db.taskChecklistItems.put({
            id: item.id,
            taskId: item.data.taskId as string,
            title: item.data.title as string,
            completedAt: (item.data.completedAt as string) ?? null,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
          });
        }
      } else if (item.table === 'area') {
        if (isDeleted) {
          await db.areas.delete(item.id);
        } else {
          await db.areas.put({
            id: item.id,
            name: item.data.name as string,
            color: (item.data.color as string) ?? null,
            sortOrder: (item.data.sortOrder as number) ?? 0,
            createdAt: item.data.createdAt as string,
            updatedAt: item.updatedAt,
          });
        }
      }
    }
  });
}

// --- Push ---

interface PushResult {
  version?: number;
  accepted: string[];
  serverTime: string;
}

async function pushMutations(mutations: PendingMutation[]): Promise<PushResult> {
  const items: SyncItem[] = mutations.map(m => {
    const supportsFieldMerge = m.table === 'task' || m.table === 'timeBlock';
    const patch = Object.fromEntries(
      Object.entries(m.data)
        .filter(([field]) => field !== 'fieldVersions')
        .map(([field, value]) => [field, { value, at: m.updatedAt }]),
    );
    return {
      table: m.table,
      id: m.entityId,
      version: supportsFieldMerge ? 3 : 2,
      data: supportsFieldMerge ? { patch } : m.data,
      updatedAt: m.updatedAt,
    };
  });

  const res = await fetch(`${API_BASE}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
  const json: SyncPushResponse = await res.json();
  if (!json.success) throw new Error('Sync push failed');
  return { accepted: json.data.accepted, serverTime: json.data.serverTime };
}

// --- Sync engine ---

let syncing = false;
let lastSyncTime = 0;
const MIN_SYNC_INTERVAL = 30_000; // 30s debounce
const MUTATION_SYNC_DEBOUNCE_MS = 1_500;
const FALLBACK_SYNC_INTERVAL_MS = 5 * 60_000;
let mutationSyncTimer: number | null = null;
let fallbackSyncInterval: number | null = null;

function canSyncInForeground(): boolean {
  return navigator.onLine && document.visibilityState === 'visible';
}

function scheduleMutationSync(): void {
  if (mutationSyncTimer !== null) {
    window.clearTimeout(mutationSyncTimer);
  }

  mutationSyncTimer = window.setTimeout(() => {
    mutationSyncTimer = null;
    if (!canSyncInForeground()) return;
    if (syncing) {
      scheduleMutationSync();
      return;
    }
    void syncOnce(true);
  }, MUTATION_SYNC_DEBOUNCE_MS);
}

function runFallbackSync(): void {
  if (canSyncInForeground()) {
    void syncOnce();
  }
}

export async function syncOnce(force = false): Promise<boolean> {
  if (syncing) return false;
  if (!navigator.onLine) {
    publishSyncStatus({ online: false, phase: 'offline' });
    return false;
  }

  const now = Date.now();
  if (!force && now - lastSyncTime < MIN_SYNC_INTERVAL) return false;

  syncing = true;
  publishSyncStatus({ online: true, phase: 'syncing', error: null });
  try {
    // 1. Push pending mutations
    const pending = await getPendingMutations();
    publishSyncStatus({ pendingCount: pending.length });
    const sinceCursor = await getCursor();
    let pushServerTime = sinceCursor;
    if (pending.length > 0) {
      const { accepted, serverTime } = await pushMutations(pending);
      // The API acknowledges entity ids, while IndexedDB keys each queued
      // mutation with a client-generated `mut-*` id. Translate the contract
      // before deleting or accepted mutations would be replayed forever.
      const acceptedEntityIds = new Set(accepted);
      const acceptedMutationIds = pending
        .filter(mutation => acceptedEntityIds.has(mutation.entityId))
        .map(mutation => mutation.id);
      await clearPendingMutations(acceptedMutationIds);
      pushServerTime = serverTime;
    }

    // 2. Pull changes since last cursor
    const { items, serverTime: pullServerTime } = await pullChanges(sinceCursor);
    if (items.length > 0) {
      await applyPull(items);
      const tables = Array.from(new Set(items.map(item => item.table)));
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { tables } }));
    }

    // 3. Update cursor — use serverTime from push/pull, not client clock
    const newCursor = pushServerTime > pullServerTime ? pushServerTime : pullServerTime;
    await setCursor(newCursor);

    lastSyncTime = Date.now();
    publishSyncStatus({
      online: true,
      phase: 'idle',
      pendingCount: await db.pendingMutations.count(),
      lastSyncedAt: new Date().toISOString(),
      error: null,
    });
    return true;
  } catch (err) {
    console.error('[sync] error:', err);
    publishSyncStatus({
      online: true,
      phase: 'error',
      pendingCount: await db.pendingMutations.count().catch(() => syncStatus.pendingCount),
      error: syncErrorMessage(err),
    });
    return false;
  } finally {
    syncing = false;
  }
}

export function retrySync(): Promise<boolean> {
  return syncOnce(true);
}

// --- Online status ---

type OnlineCallback = (online: boolean) => void;
const onlineListeners: Set<OnlineCallback> = new Set();

export function onOnlineStatusChange(cb: OnlineCallback): () => void {
  onlineListeners.add(cb);
  return () => onlineListeners.delete(cb);
}

function handleOnline() {
  onlineListeners.forEach(cb => cb(true));
  publishSyncStatus({ online: true, phase: 'idle', error: null });
  void syncOnce(true);
}

function handleOffline() {
  onlineListeners.forEach(cb => cb(false));
  publishSyncStatus({ online: false, phase: 'offline' });
}

// Visibility change → sync when tab becomes visible
function handleVisibility() {
  if (document.visibilityState === 'visible') {
    syncOnce();
  }
}

// --- Lifecycle ---

let initialized = false;
let initialSyncTimer: number | null = null;

export function initSync(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  fallbackSyncInterval = window.setInterval(runFallbackSync, FALLBACK_SYNC_INTERVAL_MS);
  publishSyncStatus({
    online: navigator.onLine,
    phase: navigator.onLine ? 'idle' : 'offline',
  });
  void hydrateSyncStatus().catch(() => {});

  // Initial sync
  if (navigator.onLine) {
    // Let the first screen's critical queries start before sync uses the
    // same API connection. Sync remains automatic, just one task later.
    initialSyncTimer = window.setTimeout(() => {
      initialSyncTimer = null;
      if (initialized && navigator.onLine) void syncOnce();
    }, 0);
  }
}

export function destroySync(): void {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibility);
  if (initialSyncTimer !== null) {
    window.clearTimeout(initialSyncTimer);
    initialSyncTimer = null;
  }
  if (mutationSyncTimer !== null) {
    window.clearTimeout(mutationSyncTimer);
    mutationSyncTimer = null;
  }
  if (fallbackSyncInterval !== null) {
    window.clearInterval(fallbackSyncInterval);
    fallbackSyncInterval = null;
  }
  lastSyncTime = 0;
  initialized = false;
}
