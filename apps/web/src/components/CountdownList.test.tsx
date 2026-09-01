import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { CountdownList } from './CountdownList';
import type { Countdown } from '@mindoist/shared/types';

const makeCountdown = (id: string, title: string, targetDate: string, overrides: Partial<Countdown> = {}): Countdown => ({
  id,
  userId: 'u1',
  title,
  targetDate,
  color: 'indigo',
  imageUrl: null,
  reminderDaysBefore: null,
  showInCalendar: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  ...overrides,
});

describe('CountdownList', () => {
  let onCreate: ReturnType<typeof vi.fn>;
  let onUpdate: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onCreate = vi.fn().mockResolvedValue(undefined);
    onUpdate = vi.fn().mockResolvedValue(undefined);
    onDelete = vi.fn();
  });

  const renderList = (countdowns: Countdown[] = []) =>
    render(
      <I18nextProvider i18n={i18n}>
        <CountdownList countdowns={countdowns} loading={false} error={null} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
      </I18nextProvider>
    );

  it('shows an empty state when there are no countdowns', () => {
    renderList([]);
    expect(screen.getByText(/no countdowns yet/i)).toBeInTheDocument();
  });

  it('renders a card per countdown with its day count', () => {
    renderList([makeCountdown('1', 'Birthday', '2999-01-01T00:00:00.000Z')]);
    const card = screen.getByTestId('countdown-card-1');
    expect(card).toHaveTextContent('Birthday');
    expect(card).toHaveTextContent('days left');
  });

  it('shows "days ago" for a date in the past', () => {
    renderList([makeCountdown('1', 'Old event', '2000-01-01T00:00:00.000Z')]);
    expect(screen.getByTestId('countdown-card-1')).toHaveTextContent('days ago');
  });

  it('submits the add form with title, date, and color', async () => {
    renderList([]);
    fireEvent.click(screen.getByTestId('countdown-add-toggle'));
    fireEvent.change(screen.getByTestId('countdown-title-input'), { target: { value: 'Trip' } });
    fireEvent.click(screen.getByTestId('countdown-date-input'));
    fireEvent.click(screen.getByText('15', { selector: 'button' }));
    fireEvent.click(screen.getByTestId('countdown-submit'));
    const today = new Date();
    const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Trip', targetDate: expectedDate }));
  });

  it('deletes a countdown', () => {
    renderList([makeCountdown('1', 'Birthday', '2999-01-01T00:00:00.000Z')]);
    fireEvent.click(screen.getByLabelText('Delete countdown'));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('edits an existing countdown without creating a duplicate', async () => {
    renderList([makeCountdown('1', 'Birthday', '2030-06-15T00:00:00.000Z')]);
    fireEvent.click(screen.getByLabelText(/Edit countdown|countdown\.edit/));
    expect(screen.getByTestId('countdown-title-input')).toHaveValue('Birthday');
    fireEvent.change(screen.getByTestId('countdown-title-input'), { target: { value: 'Family birthday' } });
    fireEvent.click(screen.getByTestId('countdown-submit'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ title: 'Family birthday', targetDate: '2030-06-15' }),
    ));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
