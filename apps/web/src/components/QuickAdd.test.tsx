import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { QuickAdd } from './QuickAdd';
import { parseQuickAdd } from '@mindoist/shared/nlparse';

// Fixed "now" — 2026-07-18 08:00 UTC+7
const NOW = new Date('2026-07-18T01:00:00Z');

// Compute expected values based on actual system timezone
// "tomorrow 9am" relative to NOW
const tomorrowAt9am = new Date(NOW);
tomorrowAt9am.setDate(tomorrowAt9am.getDate() + 1);
tomorrowAt9am.setHours(9, 0, 0, 0);
const expectedDateTomorrow = tomorrowAt9am.toISOString().slice(0, 10);

// "thứ 6" (Friday) from Saturday
const friday = new Date(NOW);
friday.setDate(friday.getDate() + 6);
const expectedDateFriday = friday.toISOString().slice(0, 10);

// Helper to get local date string in YYYY-MM-DD
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Expected "tomorrow" date in local time
const expTomorrow = localDateStr(new Date(NOW.getTime() + 86400000));
const expFriday = localDateStr(new Date(NOW.getTime() + 6 * 86400000));

describe('QuickAdd', () => {
  let onAddMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onAddMock = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderQuickAdd = (locale?: 'en' | 'vi') => render(
    <I18nextProvider i18n={i18n}>
      <QuickAdd onAdd={onAddMock} now={NOW} locale={locale} />
    </I18nextProvider>
  );

  const renderQuickAddRuntimeNow = () => render(
    <I18nextProvider i18n={i18n}>
      <QuickAdd onAdd={onAddMock} />
    </I18nextProvider>
  );

  it('renders input with placeholder', () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder');
  });

  it('does not loop when typing without an injected now prop', async () => {
    renderQuickAddRuntimeNow();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'plain task');
    expect(input).toHaveValue('plain task');
    expect(screen.queryByTestId('quick-add-preview')).not.toBeInTheDocument();
  });

  it('shows preview chips when typing date and time', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'buy milk tomorrow 9am');
    await waitFor(() => {
      expect(screen.getByTestId('preview-due-date')).toBeInTheDocument();
      expect(screen.getByTestId('preview-due-time')).toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-due-date')).toHaveTextContent(expTomorrow);
    expect(screen.getByTestId('preview-due-time')).toHaveTextContent('09:00');
  });

  it('parser returns correct time in test env', () => {
    const NOW = new Date('2026-07-18T01:00:00Z');
    const result = parseQuickAdd('buy milk tomorrow 9am', { locale: 'en', now: NOW });
    console.log('parser result:', JSON.stringify(result));
    expect(result.dueTime).toBe('09:00');
  });

  it('shows priority chip when typing p1', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'fix bug p1');
    await waitFor(() => {
      expect(screen.getByTestId('preview-priority')).toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-priority')).toHaveTextContent('Priority 1');
  });

  it('shows reminder chip and calls onAdd with reminderOffsetMin (B2.21)', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'call dentist remind me 15m before tomorrow 9am');
    await waitFor(() => {
      expect(screen.getByTestId('preview-reminder')).toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-reminder')).toHaveTextContent('15m before');
    await userEvent.keyboard('[Enter]');
    await waitFor(() => {
      expect(onAddMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'call dentist',
        reminderOffsetMin: 15,
      }));
    });
  });

  it('calls onAdd with parsed data on Enter', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'buy milk tomorrow 9am p2');
    await waitFor(() => {
      expect(screen.getByTestId('preview-due-date')).toBeInTheDocument();
    });
    await userEvent.keyboard('[Enter]');
    await waitFor(() => {
      expect(onAddMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'buy milk',
        dueDate: expTomorrow,
        dueTime: '09:00',
        priority: 2,
      }));
    });
  });

  it('does not call onAdd for empty input', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.keyboard('[Enter]');
    expect(onAddMock).not.toHaveBeenCalled();
  });

  it('calls onAdd with title when form is submitted', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'New task');
    await userEvent.keyboard('[Enter]');
    await waitFor(() => {
      expect(onAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task' }));
    });
  });

  it('does not submit whitespace-only task', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, '   ');
    await userEvent.keyboard('[Enter]');
    expect(onAddMock).not.toHaveBeenCalled();
  });

  it('dismisses preview when clicking X button', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'buy milk tomorrow 9am');
    await waitFor(() => {
      expect(screen.getByTestId('preview-due-date')).toBeInTheDocument();
    });
    const dismissBtn = screen.getByTestId('dismiss-preview');
    fireEvent.click(dismissBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('quick-add-preview')).not.toBeInTheDocument();
    });
    expect(input).toHaveValue('buy milk tomorrow 9am');
  });

  it('renders only title when no date/time in input', async () => {
    renderQuickAdd();
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'just a plain task');
    await waitFor(() => {
      expect(screen.queryByTestId('quick-add-preview')).not.toBeInTheDocument();
    });
  });

  it('shows chips for Vietnamese input when locale is vi', async () => {
    renderQuickAdd('vi');
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'mua sữa ngày mai 9h p1');
    await waitFor(() => {
      expect(screen.getByTestId('preview-due-date')).toBeInTheDocument();
      expect(screen.getByTestId('preview-due-time')).toBeInTheDocument();
      expect(screen.getByTestId('preview-priority')).toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-due-date')).toHaveTextContent(expTomorrow);
    expect(screen.getByTestId('preview-due-time')).toHaveTextContent('09:00');
    expect(screen.getByTestId('preview-priority')).toHaveTextContent('Ưu tiên 1');
  });

  it('calls onAdd with correct payload for Vietnamese input', async () => {
    renderQuickAdd('vi');
    const input = screen.getByTestId('add-task-input');
    await userEvent.type(input, 'họp nhóm thứ 6 p3');
    await waitFor(() => {
      expect(screen.getByTestId('preview-due-date')).toBeInTheDocument();
    });
    await userEvent.keyboard('[Enter]');
    await waitFor(() => {
      expect(onAddMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'họp nhóm',
        dueDate: expFriday,
        priority: 3,
      }));
    });
  });
});
