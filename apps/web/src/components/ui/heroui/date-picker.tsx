import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button as HeroButton, Calendar as HeroCalendar, Popover as HeroPopover } from '@heroui/react';
import { I18nProvider } from 'react-aria-components';
import { parseDate, today, getLocalTimeZone, type CalendarDate, type DateValue } from '@internationalized/date';
import { cn } from '@/lib/utils';
import {
  DateRangeTriggers,
  TimePicker,
  formatDateDisplay,
  type DatePickerProps,
  type DateRangePickerProps,
} from '../legacy/date-picker';

/**
 * HeroUI date pickers behind the legacy props. The trigger buttons keep the
 * legacy markup (same test ids, labels and "dd/mm/yyyy" display); the popup
 * is a React Aria Popover + HeroUI Calendar, which brings roving-focus grid
 * navigation, PageUp/PageDown month paging and locale-aware headings.
 *
 * TimePicker stays on the legacy implementation: HeroUI only offers a
 * segmented TimeField, not the quick-pick list Mindoist uses.
 */

function toCalendarDate(value: string): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function todayIso() {
  return today(getLocalTimeZone()).toString();
}

function useLocale(locale?: string) {
  const { i18n } = useTranslation();
  return locale ?? i18n.resolvedLanguage ?? i18n.language ?? 'en';
}

/**
 * Escape closes just the date popover even before React Aria has moved focus
 * into the calendar (React Aria only sees Escape from inside the overlay).
 * Capture phase + stopPropagation, like the legacy picker, so TaskDetail's and
 * Quick Capture's own Escape handlers don't close their panel underneath.
 */
function useEscapeToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [close, open]);
}

interface CalendarPanelProps {
  ariaLabel: string;
  value: string;
  onSelect: (iso: string) => void;
  previousMonthLabel: string;
  nextMonthLabel: string;
  focusedValue?: string;
  minValue?: string;
  maxValue?: string;
  dayClassName?: (iso: string) => string | undefined;
  onHoverDay?: (iso: string | null) => void;
}

function CalendarPanel({
  ariaLabel,
  value,
  onSelect,
  previousMonthLabel,
  nextMonthLabel,
  focusedValue,
  minValue,
  maxValue,
  dayClassName,
  onHoverDay,
}: CalendarPanelProps) {
  const selected = toCalendarDate(value);
  const focus = toCalendarDate(focusedValue ?? '') ?? selected ?? undefined;
  const [focused, setFocused] = useState<DateValue | undefined>(focus);
  useEffect(() => {
    if (focus) setFocused(focus);
    // Re-centre only when the date we are editing changes, not on every
    // render (that would fight keyboard navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedValue, value]);

  return (
    <HeroCalendar
      aria-label={ariaLabel}
      className="mindoist-calendar"
      value={selected}
      onChange={date => onSelect(date.toString())}
      focusedValue={focused}
      onFocusChange={setFocused}
      firstDayOfWeek="mon"
      autoFocus
      minValue={toCalendarDate(minValue ?? '') ?? undefined}
      maxValue={toCalendarDate(maxValue ?? '') ?? undefined}
    >
      <HeroCalendar.Header>
        <HeroCalendar.NavButton slot="previous" aria-label={previousMonthLabel} />
        <HeroCalendar.Heading />
        <HeroCalendar.NavButton slot="next" aria-label={nextMonthLabel} />
      </HeroCalendar.Header>
      <HeroCalendar.Grid>
        <HeroCalendar.GridHeader>
          {day => <HeroCalendar.HeaderCell>{day}</HeroCalendar.HeaderCell>}
        </HeroCalendar.GridHeader>
        <HeroCalendar.GridBody>
          {date => {
            const iso = date.toString();
            return (
              <HeroCalendar.Cell
                date={date}
                data-calendar-day={iso}
                className={dayClassName?.(iso)}
                onHoverStart={() => onHoverDay?.(iso)}
                onHoverEnd={() => onHoverDay?.(null)}
              />
            );
          }}
        </HeroCalendar.GridBody>
      </HeroCalendar.Grid>
    </HeroCalendar>
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  testId,
  className,
  align = 'left',
  ariaLabel = 'Pick date',
  locale,
  todayLabel = 'Today',
  clearLabel = 'Clear',
  previousMonthLabel = 'Previous month',
  nextMonthLabel = 'Next month',
  onOpenChange,
  portalContainerRef,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resolvedLocale = useLocale(locale);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  const pick = useCallback((iso: string) => {
    onChange(iso);
    setOpen(false);
  }, [onChange]);
  const closePicker = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useEscapeToClose(open, closePicker);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        onClick={() => setOpen(current => !current)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'mindoist-date-trigger flex h-7 w-full items-center gap-1.5 rounded-control border border-input bg-background px-2 text-xs',
          'hover:border-muted-foreground hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !value && 'text-muted-foreground',
        )}
      >
        <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{value ? formatDateDisplay(value) : placeholder}</span>
      </button>

      <I18nProvider locale={resolvedLocale}>
        <HeroPopover.Content
          triggerRef={triggerRef}
          isOpen={open}
          onOpenChange={setOpen}
          shouldCloseOnInteractOutside={element => !containerRef.current?.contains(element)}
          placement={align === 'right' ? 'bottom end' : 'bottom start'}
          UNSTABLE_portalContainer={portalContainerRef?.current?.parentElement ?? undefined}
          className="mindoist-date-popover w-[304px] max-w-[calc(100vw-1rem)]"
        >
          <HeroPopover.Dialog aria-label={ariaLabel} className="p-3">
            <CalendarPanel
              ariaLabel={ariaLabel}
              value={value}
              onSelect={pick}
              previousMonthLabel={previousMonthLabel}
              nextMonthLabel={nextMonthLabel}
            />
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
              <HeroButton size="sm" variant="ghost" type="button" className="text-primary" onPress={() => pick(todayIso())}>
                {todayLabel}
              </HeroButton>
              {value && (
                <HeroButton size="sm" variant="ghost" type="button" className="text-muted-foreground" onPress={() => pick('')}>
                  {clearLabel}
                </HeroButton>
              )}
            </div>
          </HeroPopover.Dialog>
        </HeroPopover.Content>
      </I18nProvider>
    </div>
  );
}

export function DateRangePicker({
  startValue,
  dueValue,
  onStartChange,
  onDueChange,
  startLabel = 'From',
  dueLabel = 'Due',
  startTestId,
  dueTestId,
  todayLabel = 'Today',
  clearLabel = 'Clear',
  dueIsOverdue = false,
  compact = false,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState<'start' | 'due'>('due');
  const [rangeMode, setRangeMode] = useState(Boolean(startValue));
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedLocale = useLocale();

  useEffect(() => {
    setHoverDate(null);
  }, [activeField, open]);

  const closeRange = useCallback(() => setOpen(false), []);
  useEscapeToClose(open, closeRange);

  const openFor = (field: 'start' | 'due') => {
    if (field === 'start') setRangeMode(true);
    else if (!startValue) setRangeMode(false);
    setActiveField(field);
    setOpen(true);
  };

  const select = useCallback((iso: string) => {
    if (activeField === 'start') {
      onStartChange(iso);
      setActiveField('due');
    } else {
      onDueChange(iso);
      setOpen(false);
    }
  }, [activeField, onStartChange, onDueChange]);

  const activeValue = activeField === 'start' ? startValue : dueValue;

  // Same band as the legacy picker: solid start/due ends, a wash between
  // them, and a live preview while the second end is being chosen.
  const dayClassName = useMemo(() => (iso: string) => {
    const isEdge = iso === startValue || iso === dueValue;
    const inRange = Boolean(startValue && dueValue && iso > startValue && iso < dueValue);
    const preview = Boolean(hoverDate) && !isEdge && (
      (activeField === 'due' && Boolean(startValue) && iso > startValue && iso <= hoverDate!)
      || (activeField === 'start' && Boolean(dueValue) && iso < dueValue && iso >= hoverDate!)
    );
    return cn(isEdge && 'mindoist-range-edge', (inRange || preview) && 'mindoist-range-band');
  }, [activeField, dueValue, hoverDate, startValue]);

  return (
    <div ref={containerRef} className={cn('relative flex shrink-0 items-center gap-1', className)}>
      <DateRangeTriggers
        compact={compact}
        startValue={startValue}
        dueValue={dueValue}
        startLabel={startLabel}
        dueLabel={dueLabel}
        startTestId={startTestId}
        dueTestId={dueTestId}
        dueIsOverdue={dueIsOverdue}
        open={open}
        activeField={activeField}
        onOpenFor={openFor}
      />

      <I18nProvider locale={resolvedLocale}>
        <HeroPopover.Content
          triggerRef={containerRef}
          isOpen={open}
          onOpenChange={setOpen}
          shouldCloseOnInteractOutside={element => !containerRef.current?.contains(element)}
          placement="bottom start"
          className="mindoist-date-popover w-[288px] max-w-[calc(100vw-2rem)]"
        >
          <HeroPopover.Dialog aria-label="Pick date" className="p-3">
            {rangeMode || startValue ? (
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-control bg-muted/50 p-0.5" role="tablist">
                {(['start', 'due'] as const).map(field => (
                  <button
                    key={field}
                    type="button"
                    role="tab"
                    aria-selected={activeField === field}
                    data-testid={field === 'start' ? 'date-range-start-tab' : 'date-range-due-tab'}
                    onClick={() => setActiveField(field)}
                    className={cn(
                      'truncate rounded-chip py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      activeField === field ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {field === 'start' ? startLabel : dueLabel}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-xs font-semibold text-foreground">{dueLabel}</span>
                <HeroButton
                  size="sm"
                  variant="ghost"
                  type="button"
                  data-testid="date-range-add-start"
                  className="text-primary"
                  onPress={() => { setRangeMode(true); setActiveField('start'); }}
                >
                  + {startLabel}
                </HeroButton>
              </div>
            )}

            <CalendarPanel
              ariaLabel={activeField === 'start' ? startLabel : dueLabel}
              value={activeValue}
              focusedValue={activeValue || startValue || dueValue}
              onSelect={select}
              previousMonthLabel="Previous month"
              nextMonthLabel="Next month"
              // A due date before the start (or a start after the due) can't
              // exist, so those days are unavailable rather than rejected later.
              minValue={activeField === 'due' ? startValue || undefined : undefined}
              maxValue={activeField === 'start' ? dueValue || undefined : undefined}
              dayClassName={dayClassName}
              onHoverDay={setHoverDate}
            />

            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
              <HeroButton size="sm" variant="ghost" type="button" className="text-primary" onPress={() => select(todayIso())}>
                {todayLabel}
              </HeroButton>
              {activeValue && (
                <HeroButton
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="text-muted-foreground"
                  onPress={() => {
                    if (activeField === 'start') {
                      onStartChange('');
                      setRangeMode(false);
                      setActiveField('due');
                    } else onDueChange('');
                  }}
                >
                  {clearLabel}
                </HeroButton>
              )}
            </div>
          </HeroPopover.Dialog>
        </HeroPopover.Content>
      </I18nProvider>
    </div>
  );
}

export { TimePicker };
