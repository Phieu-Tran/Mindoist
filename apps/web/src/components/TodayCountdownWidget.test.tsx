import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Countdown } from '@mindoist/shared/types';
import { TodayCountdownWidget } from './TodayCountdownWidget';

const countdown = (id: string, targetDate: string, overrides: Partial<Countdown> = {}): Countdown => ({
  id, title: id, userId: 'u1', targetDate, color: 'indigo', imageUrl: null,
  reminderDaysBefore: null, showInCalendar: false, deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
});

describe('TodayCountdownWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows only the nearest three upcoming events, with a cover and today kept for date-only events', () => {
    const { container } = render(<TodayCountdownWidget countdowns={[
      countdown('past', '2026-09-19T00:00:00Z'),
      countdown('elapsed today', new Date('2026-09-20T11:59:00').toISOString()),
      countdown('far', '2026-10-01T00:00:00Z'),
      countdown('tomorrow', '2026-09-21T00:00:00Z'),
      countdown('today', '2026-09-20T00:00:00Z'),
      countdown('soon', new Date('2026-09-20T12:30:00').toISOString(), { imageUrl: 'https://example.test/cover.jpg' }),
      countdown('deleted', new Date('2026-09-20T12:10:00').toISOString(), { deletedAt: '2026-09-20T10:00:00Z' }),
      countdown('invalid', 'invalid'),
    ]} />);
    expect(screen.getAllByRole('article').map(card => card.querySelector('p')?.textContent)).toEqual(['soon', 'today', 'tomorrow']);
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('30m');
    expect(screen.getAllByRole('article')[1]).toHaveTextContent('Today');
    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://example.test/cover.jpg');
    fireEvent.error(image);
    expect(image.hidden).toBe(true);
    expect(screen.getByText('soon')).toBeVisible();
  });

  it('removes expired events while the page stays open and hides an empty widget', () => {
    render(<TodayCountdownWidget countdowns={[countdown('ending', new Date('2026-09-20T12:00:15').toISOString())]} />);
    expect(screen.getByText('ending')).toBeVisible();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByTestId('today-countdown-widget')).not.toBeInTheDocument();
  });

  it('keeps a date-only event until local midnight', () => {
    vi.setSystemTime(new Date('2026-09-20T23:59:50'));
    render(<TodayCountdownWidget countdowns={[countdown('all day', '2026-09-20T00:00:00Z')]} />);
    expect(screen.getByText('all day')).toBeVisible();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByTestId('today-countdown-widget')).not.toBeInTheDocument();
  });
});
