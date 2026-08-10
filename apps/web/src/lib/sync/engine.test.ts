import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const pending = new Map<string, Record<string, unknown>>();
  let cursor: Record<string, unknown> | undefined;
  return {
    pending,
    reset() {
      pending.clear();
      cursor = undefined;
    },
    db: {
      pendingMutations: {
        add: vi.fn(async (item: Record<string, unknown>) => { pending.set(String(item.id), item); }),
        count: vi.fn(async () => pending.size),
        toArray: vi.fn(async () => [...pending.values()]),
        bulkDelete: vi.fn(async (ids: string[]) => ids.forEach(id => pending.delete(id))),
      },
      syncCursor: {
        get: vi.fn(async () => cursor),
        put: vi.fn(async (item: Record<string, unknown>) => { cursor = item; }),
      },
    },
  };
});

vi.mock('./db', () => ({ db: storage.db }));

import {
  destroySync,
  enqueueMutation,
  getSyncStatus,
  initSync,
  onSyncStatusChange,
  retrySync,
} from './engine';

describe('web sync status', () => {
  beforeEach(() => {
    destroySync();
    storage.reset();
    localStorage.setItem('token', 'token');
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    destroySync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports queued changes and clears them after a successful retry', async () => {
    const statuses: ReturnType<typeof getSyncStatus>[] = [];
    const unsubscribe = onSyncStatusChange(status => statuses.push(status));
    const mutationId = enqueueMutation('task', 'task-1', 'upsert', { title: 'Updated' }, new Date().toISOString());

    await vi.waitFor(() => expect(getSyncStatus().pendingCount).toBe(1));

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { accepted: [mutationId], serverTime: '2026-08-02T02:00:00.000Z' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { items: [], serverTime: '2026-08-02T02:00:01.000Z' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(retrySync()).resolves.toBe(true);
    expect(getSyncStatus()).toMatchObject({ phase: 'idle', pendingCount: 0, error: null });
    expect(getSyncStatus().lastSyncedAt).not.toBeNull();
    expect(statuses.some(status => status.phase === 'syncing')).toBe(true);
    unsubscribe();
  });

  it('debounces local changes and syncs them after 1.5 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T03:00:00.000Z'));
    let mutationId = '';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/sync/push')) {
        return new Response(JSON.stringify({
          success: true,
          data: { accepted: [mutationId], serverTime: '2026-08-02T03:00:01.000Z' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], serverTime: '2026-08-02T03:00:02.000Z' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    mutationId = enqueueMutation('task', 'task-2', 'upsert', { title: 'Debounced' }, new Date().toISOString());
    await vi.advanceTimersByTimeAsync(1_499);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.pending.size).toBe(0);
  });

  it('runs the fallback sync every five minutes only while the tab is visible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T04:00:00.000Z'));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { items: [], serverTime: new Date().toISOString() },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    initSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
