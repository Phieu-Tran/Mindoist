import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTaskQuery, listTasks, moveTask } from './api';

describe('task feature API', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps calendar unfiltered so completed tasks remain visible', () => {
    expect(buildTaskQuery({ view: 'calendar' })).toBe('');
  });

  it('maps product views to the existing API contract', () => {
    expect(buildTaskQuery({ view: 'today', projectId: 'project-1' })).toBe(
      '?filter=inbox&projectId=project-1',
    );
    expect(buildTaskQuery({ view: 'next7', tagId: 'tag-1' })).toBe(
      '?filter=upcoming&tagId=tag-1',
    );
  });

  it('uses the shared authenticated client for task requests', async () => {
    localStorage.setItem('token', 'test-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ success: true, data: [] }),
    } as Response);

    await listTasks({ view: 'calendar' });

    expect(fetchMock).toHaveBeenCalledWith('/tasks', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('preserves the legacy move payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ success: true, data: { id: 'task-1' } }),
    } as Response);

    await moveTask('task-1', 'column-1', 3);

    expect(fetchMock).toHaveBeenCalledWith('/tasks/task-1/move', {
      method: 'PATCH',
      body: JSON.stringify({ columnId: 'column-1', order: 3 }),
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
