import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DueCountdown } from './DueCountdown';

describe('DueCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('updates a critical countdown in real time', () => {
    render(<DueCountdown dueDate="2026-07-20" dueTime="10:02" testId="countdown" />);
    const countdown = screen.getByTestId('countdown');
    expect(countdown).toHaveTextContent('Due in 2m');
    expect(countdown).toHaveAttribute('data-urgency', 'critical');

    act(() => vi.advanceTimersByTime(60_000));
    expect(countdown).toHaveTextContent('Due in 1m');
  });

  it('shows how long a task is overdue', () => {
    render(<DueCountdown dueDate="2026-07-20" dueTime="08:30" testId="countdown" />);
    const countdown = screen.getByTestId('countdown');
    expect(countdown).toHaveTextContent('1h 30m overdue');
    expect(countdown).toHaveAttribute('data-urgency', 'overdue');
  });

  it('treats a date-only deadline as the end of that day', () => {
    vi.setSystemTime(new Date('2026-07-20T20:00:00'));
    render(<DueCountdown dueDate="2026-07-20" testId="countdown" />);
    const countdown = screen.getByTestId('countdown');
    expect(countdown).toHaveTextContent('Due in 3h 59m');
    expect(countdown).toHaveAttribute('data-urgency', 'soon');
  });

  it('uses a compact day and hour label for upcoming tasks', () => {
    render(<DueCountdown dueDate="2026-07-23" dueTime="12:00" testId="countdown" />);
    const countdown = screen.getByTestId('countdown');
    expect(countdown).toHaveTextContent('Due in 3d 2h');
    expect(countdown).toHaveAttribute('data-urgency', 'upcoming');
  });

  it('does not render without a deadline or for a completed task', () => {
    const { container, rerender } = render(<DueCountdown dueDate={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<DueCountdown dueDate="2026-07-20" completedAt="2026-07-20T09:00:00Z" />);
    expect(container).toBeEmptyDOMElement();
  });
});
