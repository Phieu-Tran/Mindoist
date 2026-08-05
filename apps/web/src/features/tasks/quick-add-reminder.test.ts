import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api-client';
import { createQuickAddReminder, quickAddReminderAt } from './quick-add-reminder';

vi.mock('../../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe('Quick Add reminders', () => {
  beforeEach(() => mockedApiFetch.mockReset());

  it('calculates the reminder from the task due date and time', () => {
    expect(quickAddReminderAt({
      id: 'task-1',
      dueDate: '2026-08-03',
      dueTime: '10:30',
    }, 30)).toBe(new Date('2026-08-03T10:00:00').toISOString());
  });

  it('waits for the reminder API and propagates failures', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(createQuickAddReminder({
      id: 'task-1',
      dueDate: '2026-08-03',
      dueTime: '10:30',
    }, 30)).rejects.toThrow('network unavailable');

    expect(mockedApiFetch).toHaveBeenCalledWith('/tasks/task-1/reminders', expect.objectContaining({
      method: 'POST',
    }));
  });
});
