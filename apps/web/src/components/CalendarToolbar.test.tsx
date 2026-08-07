import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { CalendarToolbar } from './CalendarToolbar';

describe('CalendarToolbar', () => {
  const renderToolbar = (overrides: Partial<React.ComponentProps<typeof CalendarToolbar>> = {}) => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onToday = vi.fn();
    const onChangeView = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <CalendarToolbar
          title="Jul 26 – Aug 1, 2026"
          view="timeGridWeek"
          todayDisabled={false}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
          onChangeView={onChangeView}
          {...overrides}
        />
      </I18nextProvider>
    );
    return { onPrev, onNext, onToday, onChangeView };
  };

  it('renders the title centered between nav and view switch', () => {
    renderToolbar();
    expect(screen.getByText('Jul 26 – Aug 1, 2026')).toBeInTheDocument();
  });

  it('shows the active view as the switcher value', () => {
    renderToolbar({ view: 'timeGridWeek' });
    expect(screen.getByTestId('calendar-view-switch')).toHaveTextContent('7 days');
  });

  it('offers the day counts and month, and reports the picked view', async () => {
    const user = userEvent.setup();
    const { onChangeView } = renderToolbar();
    await user.click(screen.getByTestId('calendar-view-switch'));

    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      '1 day', '3 days', '5 days', '7 days', 'Month',
    ]);

    await user.click(screen.getByRole('option', { name: '5 days' }));
    expect(onChangeView).toHaveBeenCalledWith('timeGrid5Day');
  });

  it('calls onPrev, onNext, and onToday', async () => {
    const user = userEvent.setup();
    const { onPrev, onNext, onToday } = renderToolbar();
    await user.click(screen.getByLabelText('Previous'));
    await user.click(screen.getByLabelText('Next'));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('disables the today button when todayDisabled is true', () => {
    renderToolbar({ todayDisabled: true });
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});
