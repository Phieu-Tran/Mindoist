import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeBlock } from '@mindoist/shared/types';
import { useTimeBlocks } from './use-time-blocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryClient as defaults, queryKeys } from '@/lib/query-client';
import type { PropsWithChildren } from 'react';

const api = vi.hoisted(() => ({
  listTimeBlocks: vi.fn(),
  createTimeBlock: vi.fn(),
  updateTimeBlock: vi.fn(),
  deleteTimeBlock: vi.fn(),
}));

vi.mock('./api', () => api);

const block: TimeBlock = {
  id: 'block-1',
  userId: 'user-1',
  taskId: 'task-1',
  startAt: '2026-08-12T09:00:00.000Z',
  endAt: '2026-08-12T10:00:00.000Z',
  timeZone: 'UTC',
  allDay: false,
  source: 'MANUAL',
  createdAt: '2026-08-12T08:00:00.000Z',
  updatedAt: '2026-08-12T08:00:00.000Z',
  deletedAt: null,
  completedAt: null,
  actualMin: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('useTimeBlocks optimistic mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTimeBlocks.mockResolvedValue([block]);
  });

  it('reuses saved blocks on reopen and keeps a late mutation in its original task cache', async () => {
    const client = new QueryClient({ defaultOptions: defaults.getDefaultOptions() });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const first = renderHook(() => useTimeBlocks('task-1'), { wrapper });
    await waitFor(() => expect(first.result.current.timeBlocks).toEqual([block]));
    first.unmount();
    const { result, rerender, unmount } = renderHook(({ taskId }) => useTimeBlocks(taskId), { wrapper, initialProps: { taskId: 'task-1' } });
    expect(result.current.timeBlocks).toEqual([block]);
    expect(api.listTimeBlocks).toHaveBeenCalledTimes(1);
    const pending = deferred<TimeBlock>();
    api.updateTimeBlock.mockReturnValue(pending.promise);
    let mutation!: Promise<TimeBlock>;
    act(() => { mutation = result.current.update(block.id, { actualMin: 25 }); });
    api.listTimeBlocks.mockResolvedValue([]);
    rerender({ taskId: 'task-2' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { pending.resolve({ ...block, actualMin: 25 }); await mutation; });
    expect(result.current.timeBlocks).toEqual([]);
    expect(client.getQueryData<TimeBlock[]>(queryKeys.timeBlocks('task-1'))?.[0].actualMin).toBe(25);
    unmount();
    client.clear();
  });

  it('shows an update before the API settles and rolls it back on failure', async () => {
    const pending = deferred<TimeBlock>();
    api.updateTimeBlock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useTimeBlocks('task-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.update('block-1', { endAt: '2026-08-12T10:30:00.000Z' }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.timeBlocks[0]?.endAt).toBe('2026-08-12T10:30:00.000Z'));

    await act(async () => {
      pending.reject(new Error('offline'));
      await mutation;
    });
    await waitFor(() => expect(result.current.timeBlocks[0]?.endAt).toBe(block.endAt));
  });

  it('inserts a temporary block immediately and replaces it with the server block', async () => {
    const pending = deferred<TimeBlock>();
    api.createTimeBlock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useTimeBlocks('task-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let mutation!: Promise<TimeBlock>;
    act(() => {
      mutation = result.current.create({
        startAt: '2026-08-12T11:00:00.000Z', endAt: '2026-08-12T11:30:00.000Z', timeZone: 'UTC', allDay: false,
      });
    });
    await waitFor(() => expect(result.current.timeBlocks).toHaveLength(2));
    expect(result.current.timeBlocks[1]?.id).toMatch(/^optimistic-/);

    const created = { ...block, id: 'block-2', startAt: '2026-08-12T11:00:00.000Z', endAt: '2026-08-12T11:30:00.000Z' };
    await act(async () => {
      pending.resolve(created);
      await mutation;
    });
    await waitFor(() => expect(result.current.timeBlocks.map(item => item.id)).toEqual(['block-1', 'block-2']));
  });

  it('removes immediately and restores the block when deletion fails', async () => {
    const pending = deferred<void>();
    api.deleteTimeBlock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useTimeBlocks('task-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.remove('block-1').catch(() => undefined);
    });
    await waitFor(() => expect(result.current.timeBlocks).toEqual([]));

    await act(async () => {
      pending.reject(new Error('offline'));
      await mutation;
    });
    await waitFor(() => expect(result.current.timeBlocks).toEqual([block]));
  });
});
