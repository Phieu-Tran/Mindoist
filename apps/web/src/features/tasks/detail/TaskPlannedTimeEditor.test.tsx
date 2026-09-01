import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannedTimeEditor } from './TaskPlannedTimeEditor';

const timeBlockHook = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/features/calendar/use-time-blocks', () => ({
  useTimeBlocks: () => ({
    timeBlocks: [],
    loading: false,
    error: null,
    create: timeBlockHook.create,
    update: timeBlockHook.update,
    remove: timeBlockHook.remove,
  }),
}));

describe('TaskPlannedTimeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    timeBlockHook.create.mockResolvedValue({ id: 'tb-1' });
  });

  it('creates a clear start-to-end time block for a task', async () => {
    render(<TaskPlannedTimeEditor taskId="task-1" defaultDate="2026-08-10" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add time block' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time block' }));

    await waitFor(() => expect(timeBlockHook.create).toHaveBeenCalledWith(expect.objectContaining({
      startAt: new Date('2026-08-10T15:00:00').toISOString(),
      endAt: new Date('2026-08-10T17:00:00').toISOString(),
      allDay: false,
      source: 'MANUAL',
    })));
  });

  it('explains when the end time is not after the start time', () => {
    render(<TaskPlannedTimeEditor taskId="task-1" defaultDate="2026-08-10" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add time block' }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time block' }));

    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time.');
    expect(timeBlockHook.create).not.toHaveBeenCalled();
  });
});
