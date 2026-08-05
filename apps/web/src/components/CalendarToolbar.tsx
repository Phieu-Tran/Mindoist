import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from './ui/select';

export type CalendarViewType =
  | 'dayGridMonth'
  | 'timeGridWeek'
  | 'timeGridDay'
  | 'timeGrid3Day'
  | 'timeGrid5Day';

interface Props {
  title: string;
  view: CalendarViewType;
  todayDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (view: CalendarViewType) => void;
}

// The time-grid views are a day-count spectrum rather than named periods, so
// the switcher labels them by how many days are on screen ("5 days") the way
// Akiflow does. Month stays named because it isn't a fixed day count.
const DAY_COUNTS: { type: CalendarViewType; days: number }[] = [
  { type: 'timeGridDay', days: 1 },
  { type: 'timeGrid3Day', days: 3 },
  { type: 'timeGrid5Day', days: 5 },
  { type: 'timeGridWeek', days: 7 },
];

// Custom replacement for FullCalendar's own headerToolbar - driven
// imperatively via the calendar API (see CalendarView) so the exact
// left-nav / centered-title / right-view-switch layout and spacing
// can be controlled directly instead of fighting FullCalendar's generated
// toolbar markup with CSS overrides.
export function CalendarToolbar({ title, view, todayDisabled, onPrev, onNext, onToday, onChangeView }: Props) {
  const { t } = useTranslation('tasks');

  const options = useMemo(() => [
    ...DAY_COUNTS.map(({ type, days }) => ({ value: type, label: t('calendar.dayCount', { count: days }) })),
    { value: 'dayGridMonth', label: t('calendar.month') },
  ], [t]);

  return (
    <div className="calendar-toolbar">
      <div className="calendar-toolbar-nav">
        <button
          type="button"
          className="calendar-toolbar-nav-btn"
          onClick={onPrev}
          aria-label={t('calendar.previousPeriod')}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="calendar-toolbar-nav-btn"
          onClick={onNext}
          aria-label={t('calendar.nextPeriod')}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="calendar-toolbar-today"
          onClick={onToday}
          disabled={todayDisabled}
        >
          {t('calendar.today')}
        </button>
      </div>
      <h3 className="calendar-toolbar-title">{title}</h3>
      <Select
        className="calendar-toolbar-views"
        value={view}
        options={options}
        onChange={value => onChangeView(value as CalendarViewType)}
        size="sm"
        align="right"
        aria-label={t('calendar.viewSwitcher')}
        data-testid="calendar-view-switch"
      />
    </div>
  );
}
