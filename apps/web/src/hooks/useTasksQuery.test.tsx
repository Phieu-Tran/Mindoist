import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Task } from '@mindoist/shared/types';
import { useTasksQuery } from './useTasksQuery';
import { queryKeys } from '@/lib/query-client';

const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  completeTaskPomodoro: vi.fn(),
  reopenTask: vi.fn(),
  deleteTask: vi.fn(),
  restoreTask: vi.fn(),
}));

vi.mock('@/features/tasks/api', () => api);

const task = (overrides: Partial<Task> = {}) => ({
  id: 'task-1',
  title: 'Original',
  description: null,
  completedAt: null,
  deletedAt: null,
  tagIds: [],
  ...overrides,
} as Task);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapper(client = createClient()) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTasksQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listTasks.mockResolvedValue([task()]);
  });

  it('owns task reads and rolls back an optimistic update on failure', async () => {
    api.updateTask.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useTasksQuery('all', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tasks[0]?.title).toBe('Original'));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.updateTask('task-1', { title: 'Optimistic' });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect(result.current.tasks[0]?.title).toBe('Original');
  });

  it('updates completion state without waiting for a pending API response', async () => {
    const response = deferred<Task>();
    api.completeTask.mockReturnValue(response.promise);
    const { result } = renderHook(() => useTasksQuery('all', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tasks[0]?.completedAt).toBeNull());

    let request!: Promise<Task>;
    act(() => { request = result.current.completeTask('task-1'); });
    await waitFor(() => expect(result.current.tasks[0]?.completedAt).not.toBeNull());

    response.resolve(task({ completedAt: '2026-09-03T00:00:00Z' }));
    await act(async () => { await request; });
    expect(api.completeTask).toHaveBeenCalledWith('task-1');
  });

  it('shows a created task before a pending list response resolves', async () => {
    const listResponse = deferred<Task[]>();
    const createResponse = deferred<Task>();
    api.listTasks.mockReturnValueOnce(listResponse.promise);
    api.createTask.mockReturnValue(createResponse.promise);
    const { result } = renderHook(() => useTasksQuery('all', true), { wrapper: wrapper() });

    let request!: Promise<Task>;
    act(() => { request = result.current.addTask({ title: 'Immediate' }); });
    await waitFor(() => expect(result.current.tasks.map(item => item.title)).toContain('Immediate'));

    createResponse.resolve(task({ id: 'task-created', title: 'Immediate' }));
    await act(async () => { await request; });
    listResponse.resolve([task()]);

    await waitFor(() => expect(result.current.tasks.map(item => item.id)).toContain('task-created'));
  });

  it('resolves create before dependent view refetches finish', async () => {
    const dependentResponse = deferred<{ inbox: number; today: number; next7: number; overdue: number; completed: number }>();
    api.createTask.mockResolvedValue(task({ id: 'task-created', title: 'Fast' }));
    const client = createClient();
    const { result } = renderHook(() => {
      useQuery({
        queryKey: queryKeys.taskCounts(),
        queryFn: () => dependentResponse.promise,
      });
      return useTasksQuery('all', true);
    }, { wrapper: wrapper(client) });

    await waitFor(() => expect(api.listTasks).toHaveBeenCalled());
    await expect(result.current.addTask({ title: 'Fast' })).resolves.toMatchObject({ id: 'task-created' });
    dependentResponse.resolve({ inbox: 1, today: 1, next7: 1, overdue: 0, completed: 0 });
  });

  it('reconciles concurrent optimistic creates independently when responses finish out of order', async () => {
    const first = deferred<Task>();
    const second = deferred<Task>();
    api.createTask
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useTasksQuery('all', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    let firstRequest!: Promise<Task>;
    let secondRequest!: Promise<Task>;
    act(() => {
      firstRequest = result.current.addTask({ title: 'First' });
      secondRequest = result.current.addTask({ title: 'Second' });
    });
    await waitFor(() => expect(result.current.tasks.filter(item => item.id.startsWith('optimistic-'))).toHaveLength(2));

    await act(async () => {
      second.resolve(task({ id: 'task-second', title: 'Second' }));
      await secondRequest;
    });
    await waitFor(() => expect(result.current.tasks.map(item => item.id)).toContain('task-second'));
    expect(result.current.tasks.map(item => item.title)).toEqual(['Original', 'First', 'Second']);
    expect(result.current.tasks.filter(item => item.id.startsWith('optimistic-'))).toHaveLength(1);

    await act(async () => {
      first.resolve(task({ id: 'task-first', title: 'First' }));
      await firstRequest;
    });
    await waitFor(() => expect(result.current.tasks.map(item => item.id)).toEqual(['task-1', 'task-first', 'task-second']));
  });

  it('removes only the failed placeholder when another concurrent create succeeds', async () => {
    const failed = deferred<Task>();
    const successful = deferred<Task>();
    api.createTask
      .mockImplementationOnce(() => failed.promise)
      .mockImplementationOnce(() => successful.promise);
    const { result } = renderHook(() => useTasksQuery('all', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    let failedRequest!: Promise<Task>;
    let successfulRequest!: Promise<Task>;
    act(() => {
      failedRequest = result.current.addTask({ title: 'Fails' });
      successfulRequest = result.current.addTask({ title: 'Survives' });
    });
    await waitFor(() => expect(result.current.tasks.filter(item => item.id.startsWith('optimistic-'))).toHaveLength(2));

    await act(async () => {
      successful.resolve(task({ id: 'task-survives', title: 'Survives' }));
      await successfulRequest;
    });

    let failure: unknown;
    await act(async () => {
      failed.reject(new Error('network down'));
      try {
        await failedRequest;
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    await waitFor(() => expect(result.current.tasks.map(item => item.id)).toEqual(['task-1', 'task-survives']));
  });
});
