import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateTaskDialog } from './CreateTaskDialog';

describe('CreateTaskDialog', () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a task for the selected calendar slot', async () => {
    render(
      <CreateTaskDialog
        open
        date="2026-07-20"
        startTime="09:30"
        endTime="11:00"
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByText('2026-07-20 · 09:30 → 11:00')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Interview prep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Interview prep'));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open when creation fails', async () => {
    onCreate.mockRejectedValueOnce(new Error('Network down'));
    render(
      <CreateTaskDialog
        open
        date="2026-07-20"
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Write notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(onClose).not.toHaveBeenCalled();
  });
});
