import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UndoToast } from './UndoToast';

describe('UndoToast', () => {
  it('renders a calm undo action', () => {
    const onUndo = vi.fn();
    render(
      <UndoToast
        toast={{ id: 'toast-1', message: 'Completed “Task”', actionLabel: 'Undo', onUndo }}
        onUndo={onUndo}
        onDismiss={vi.fn()}
        dismissLabel="Dismiss"
      />,
    );

    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Completed “Task”');
    fireEvent.click(screen.getByTestId('undo-toast-action'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('can dismiss without an undo action', () => {
    const onDismiss = vi.fn();
    render(
      <UndoToast
        toast={{ id: 'toast-2', message: "Couldn't undo. Try again." }}
        onUndo={vi.fn()}
        onDismiss={onDismiss}
        dismissLabel="Dismiss"
      />,
    );

    expect(screen.queryByTestId('undo-toast-action')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('undo-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
