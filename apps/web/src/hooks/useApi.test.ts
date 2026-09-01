import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks, useProjects, useProjectColumns, useSummaryTasks, useTags } from './useApi';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockToken = 'test-token';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.setItem('token', mockToken);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  });
});

afterEach(() => {
  localStorage.removeItem('token');
});

describe('useApi hooks', () => {
  describe('useTasks', () => {
    const mockTasks = [
      { id: '1', userId: 'u1', title: 'Task 1', completedAt: null, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null, tagIds: [] } as any,
      { id: '2', userId: 'u1', title: 'Task 2', completedAt: null, sortOrder: 1, createdAt: '', updatedAt: '', deletedAt: null, tagIds: [] } as any,
    ];

    it('fetches tasks on mount with inbox view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTasks }),
      });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.tasks).toEqual(mockTasks);
      expect(mockFetch).toHaveBeenCalledWith('/tasks?filter=inbox', expect.any(Object));
    });

    it('waits for authentication before requesting tasks', async () => {
      const { result, rerender } = renderHook(({ enabled }) => useTasks('inbox', enabled), {
        initialProps: { enabled: false },
      });
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTasks }),
      });
      rerender({ enabled: true });
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.tasks).toEqual(mockTasks);
      expect(mockFetch).toHaveBeenCalledWith('/tasks?filter=inbox', expect.any(Object));
    });

    it('sets error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'Server error' }),
      });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.error).toBe('Server error');
      expect(result.current.tasks).toEqual([]);
    });

    it('clears error on successful refetch', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'fail' }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.error).toBe('fail');

      mockFetch.mockResolvedValueOnce({
        ok: true, json: async () => ({ success: true, data: mockTasks }),
      });
      await act(async () => { await result.current.refetch(); });
      expect(result.current.error).toBeNull();
      expect(result.current.tasks).toEqual(mockTasks);
    });

    it('fetches tasks with filter for today view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTasks }),
      });
      const { result } = renderHook(() => useTasks('today', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(mockFetch).toHaveBeenCalledWith('/tasks?filter=inbox', expect.any(Object));
    });

    it('fetches tasks with filter for next7 view', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTasks }),
      });
      const { result } = renderHook(() => useTasks('next7', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(mockFetch).toHaveBeenCalledWith('/tasks?filter=upcoming', expect.any(Object));
    });

    it('fetches the calendar view with no completedAt filter, so completed tasks still plot (dimmed)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTasks }),
      });
      const { result } = renderHook(() => useTasks('calendar', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(mockFetch).toHaveBeenCalledWith('/tasks', expect.any(Object));
    });

    it('adds task and updates local state', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: '3', title: 'New' } }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.addTask({ title: 'New' }); });
      expect(result.current.tasks).toHaveLength(3);
    });

    it('completes task and updates local state', async () => {
      const completedTask = { ...mockTasks[0], completedAt: '2026-01-01T00:00:00Z' };
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: completedTask }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.completeTask('1'); });
      expect(result.current.tasks[0].completedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('does not let a stale initial fetch overwrite newer task mutations', async () => {
      const createdTask = { ...mockTasks[0], id: '3', title: 'New task' };
      const completedTask = { ...createdTask, completedAt: '2026-01-01T00:00:00Z' };
      let resolveInitialFetch!: (body: { success: true; data: unknown[] }) => void;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => new Promise(resolve => { resolveInitialFetch = resolve; }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: createdTask }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: completedTask }) });

      const { result } = renderHook(() => useTasks('today', true));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await result.current.addTask({ title: createdTask.title }); });
      await act(async () => { await result.current.completeTask(createdTask.id); });

      await act(async () => {
        resolveInitialFetch({ success: true, data: [] });
        await Promise.resolve();
      });

      expect(result.current.tasks).toEqual([completedTask]);
    });

    it('moves a task while preserving tag ids omitted by the move response', async () => {
      const taggedTasks = [{ ...mockTasks[0], tagIds: ['tag-1'] }, mockTasks[1]];
      const { tagIds: _omittedTagIds, ...taskWithoutTags } = mockTasks[0];
      const movedTask = { ...taskWithoutTags, projectColumnId: 'column-2' };
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: taggedTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: movedTask }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });

      let returnedTask: typeof taggedTasks[number] | undefined;
      await act(async () => { returnedTask = await result.current.moveTask('1', 'column-2'); });

      expect(result.current.tasks[0]).toMatchObject({
        projectColumnId: 'column-2',
        tagIds: ['tag-1'],
      });
      expect(returnedTask?.tagIds).toEqual(['tag-1']);
    });

    it('records a Pomodoro and updates local state', async () => {
      const focusedTask = { ...mockTasks[0], pomodoroCount: 1 };
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: focusedTask }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.completePomodoro('1'); });
      expect(result.current.tasks[0].pomodoroCount).toBe(1);
      expect(mockFetch).toHaveBeenLastCalledWith('/tasks/1/pomodoro/complete', expect.objectContaining({ method: 'POST' }));
    });

    it('reopens task and updates local state', async () => {
      const reopenedTask = { ...mockTasks[0], completedAt: null };
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: reopenedTask }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.reopenTask('1'); });
      expect(result.current.tasks[0].completedAt).toBeNull();
    });

    it('deletes task and updates local state', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTasks }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: {} }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.deleteTask('1'); });
      expect(result.current.tasks).toHaveLength(1);
    });

    it('restores a soft-deleted task and adds it back to local state', async () => {
      const restoredTask = { ...mockTasks[0], deletedAt: null };
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [mockTasks[1]] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: restoredTask }) });
      const { result } = renderHook(() => useTasks('inbox', true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      await act(async () => { await result.current.restoreTask('1'); });
      expect(mockFetch).toHaveBeenLastCalledWith('/tasks/1/restore', expect.objectContaining({ method: 'POST' }));
      expect(result.current.tasks).toEqual([mockTasks[1], restoredTask]);
    });
  });

  describe('useSummaryTasks', () => {
    it('combines active and completed tasks without duplicates', async () => {
      const active = [{ id: '1', title: 'Open task', completedAt: null }];
      const completed = [
        { id: '1', title: 'Open task duplicate', completedAt: null },
        { id: '2', title: 'Done task', completedAt: '2026-07-20T09:00:00Z' },
      ];
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: active }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: completed }) });

      const { result } = renderHook(() => useSummaryTasks(true));
      await waitFor(() => expect(result.current.tasks).toHaveLength(2));
      expect(mockFetch).toHaveBeenCalledWith('/tasks', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('/tasks?filter=completed', expect.any(Object));
    });
  });

  describe('useProjects', () => {
    const mockProjects = [
      { id: '1', userId: 'u1', name: 'Project 1', color: '#fff', isArchived: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null } as any,
    ];

    it('fetches projects on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockProjects }),
      });
      const { result } = renderHook(() => useProjects());
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.projects).toEqual(mockProjects);
      expect(result.current.loaded).toBe(true);
    });
  });

  describe('useProjectColumns', () => {
    const firstColumn = { id: 'c1', projectId: 'p1', name: 'Backlog', isDone: false, sortOrder: 0 } as any;
    const secondColumn = { id: 'c2', projectId: 'p1', name: 'Done', isDone: true, sortOrder: 1 } as any;

    it('fetches columns and keeps create, update, and delete changes in local state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [firstColumn] }),
      });
      const { result } = renderHook(() => useProjectColumns('p1'));
      await waitFor(() => expect(result.current.columns).toEqual([firstColumn]));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: secondColumn }),
      });
      await act(async () => { await result.current.createColumn({ name: 'Done', isDone: true, sortOrder: 1 }); });
      await waitFor(() => expect(result.current.columns).toEqual([firstColumn, secondColumn]));

      const renamed = { ...secondColumn, name: 'Complete' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: renamed }),
      });
      await act(async () => { await result.current.updateColumn('c2', { name: 'Complete' }); });
      await waitFor(() => expect(result.current.columns[1].name).toBe('Complete'));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      await act(async () => { await result.current.deleteColumn('c2'); });
      await waitFor(() => expect(result.current.columns).toEqual([firstColumn]));
    });
  });

  describe('useTags', () => {
    const mockTags = [
      { id: '1', userId: 'u1', name: 'tag1', color: '#fff', createdAt: '', updatedAt: '' } as any,
    ];

    it('fetches tags on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTags }),
      });
      const { result } = renderHook(() => useTags(true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.tags).toEqual(mockTags);
    });

    it('refetches tags on demand', async () => {
      const updatedTags = [...mockTags, { id: '2', userId: 'u1', name: 'tag2', color: '#000', createdAt: '', updatedAt: '' } as any];
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTags }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: updatedTags }) });
      const { result } = renderHook(() => useTags(true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.tags).toEqual(mockTags);

      await act(async () => { result.current.refetch(); await new Promise(r => setTimeout(r, 0)); });
      expect(result.current.tags).toEqual(updatedTags);
    });

    it('does not fetch when disabled - was previously unconditional, firing even on the login screen with no token', async () => {
      renderHook(() => useTags(false));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('createTag posts the new tag and adds it to state', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: mockTags[0] }) });
      const { result } = renderHook(() => useTags(true));
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });

      await act(async () => { await result.current.createTag({ name: 'tag1' }); });
      expect(result.current.tags).toEqual(mockTags);
      expect(mockFetch).toHaveBeenLastCalledWith('/tags', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'tag1' }),
      }));
    });
  });
});
