import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// These popups render inside TaskDetail's form, which is `overflow-x-hidden`
// (needed elsewhere to stop the panel itself from scrolling sideways - see
// d9a4cf3). An in-flow `position: absolute` popup gets clipped by that
// ancestor whenever the panel is too narrow for the popup's fixed width, so
// position it via a portal instead. Most pickers use document.body; nested
// modal pickers can portal into that modal's content so focus and pointer
// events remain inside its accessibility boundary.
function usePopupPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  popupRef: React.RefObject<HTMLElement | null>,
  align: 'left' | 'right',
  portalContainerRef?: React.RefObject<HTMLElement | null>,
) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      // A capture-phase scroll can fire while React is removing the anchor
      // during a route change. Read the ref once and tolerate that transition
      // instead of crashing the whole workspace.
      const anchor = anchorRef.current;
      if (!anchor?.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const popupRect = popupRef.current?.getBoundingClientRect();
      const popupWidth = popupRect?.width ?? 280;
      const popupHeight = popupRect?.height ?? 0;
      const viewportGap = 8;
      const triggerGap = 6;
      const preferredLeft = align === 'right' ? rect.right - popupWidth : rect.left;
      const left = Math.max(viewportGap, Math.min(preferredLeft, window.innerWidth - popupWidth - viewportGap));
      const fitsBelow = rect.bottom + triggerGap + popupHeight <= window.innerHeight - viewportGap;
      const top = fitsBelow
        ? rect.bottom + triggerGap
        : Math.max(viewportGap, rect.top - popupHeight - triggerGap);
      const portalContainer = portalContainerRef?.current?.parentElement;
      const portalRect = portalContainer?.getBoundingClientRect();

      setStyle(portalRect
        ? { position: 'absolute', top: top - portalRect.top, left: left - portalRect.left }
        : { position: 'fixed', top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, popupRef, align, portalContainerRef]);

  return style;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
  align?: 'left' | 'right';
  ariaLabel?: string;
  locale?: string;
  todayLabel?: string;
  clearLabel?: string;
  previousMonthLabel?: string;
  nextMonthLabel?: string;
  onOpenChange?: (open: boolean) => void;
  portalContainerRef?: React.RefObject<HTMLElement | null>;
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
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupStyle = usePopupPosition(open, ref, popupRef, align, portalContainerRef);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const preferredDay = popupRef.current?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="date"], [data-calendar-day]');
      preferredDay?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const today = new Date();
  const initial = value ? (() => {
    const [y, m, d] = value.split('-').map(Number);
    return { year: y, month: m - 1 };
  })() : { year: today.getFullYear(), month: today.getMonth() };

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  const handleSelect = useCallback((day: number) => {
    onChange(formatDateISO(viewYear, viewMonth, day));
    closeAndRestoreFocus();
  }, [viewYear, viewMonth, onChange, closeAndRestoreFocus]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeAndRestoreFocus(); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    // Capture phase: close just this popup, not the panel underneath it —
    // TaskDetail has its own document-level Escape listener that closes the
    // whole panel; without stopping propagation here (which only works from
    // the capture phase, since both listeners are bound to `document`),
    // Escape would fire both and close the panel out from under the popup.
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open, closeAndRestoreFocus]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = (firstDayOfMonth(viewYear, viewMonth) + 6) % 7;
  const todayStr = formatDateISO(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else { setViewMonth(m => m - 1); }
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else { setViewMonth(m => m + 1); }
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString(locale, { month: 'long', year: 'numeric' });
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => (
    new Date(2024, 0, index + 1).toLocaleDateString(locale, { weekday: 'narrow' })
  ));

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-control border border-input bg-background px-2 text-xs',
          'hover:border-muted-foreground hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !value && 'text-muted-foreground'
        )}
      >
        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{value ? formatDateDisplay(value) : placeholder}</span>
      </button>

      {/* Popup */}
      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="mindoist-date-picker-popup frosted-surface z-[80] w-[304px] max-w-[calc(100vw-1rem)] rounded-panel border border-border bg-card p-3 shadow-lg shadow-black/10 dark:shadow-black/30"
          role="dialog"
          aria-label={ariaLabel}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            const target = (event.target as HTMLElement).closest<HTMLElement>('[data-calendar-day]');
            if (!target) return;
            const dayButtons = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[data-calendar-day]') ?? []);
            const index = dayButtons.indexOf(target as HTMLButtonElement);
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? dayButtons.length - 1
                : Math.max(0, Math.min(dayButtons.length - 1, index + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key] ?? 0)));
            event.preventDefault();
            dayButtons[nextIndex]?.focus();
          }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="grid h-9 w-9 place-items-center rounded-control transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={previousMonthLabel}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="grid h-9 w-9 place-items-center rounded-control transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={nextMonthLabel}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {weekdayLabels.map((w, index) => (
              <div key={`${w}-${index}`} className="text-center text-[0.65rem] font-medium text-muted-foreground/70 py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;
              const dateStr = formatDateISO(viewYear, viewMonth, day);
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  data-calendar-day={dateStr}
                  onClick={() => handleSelect(day)}
                  aria-label={new Date(viewYear, viewMonth, day).toLocaleDateString(locale, { dateStyle: 'full' })}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'flex h-9 w-full items-center justify-center rounded-control text-sm transition-colors',
                    'hover:bg-muted',
                    isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    isToday && !isSelected && 'font-bold text-primary',
                    !isSelected && !isToday && 'text-foreground'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today + Clear */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => { onChange(todayStr); closeAndRestoreFocus(); }}
              className="min-h-9 rounded-control px-2 text-xs font-medium text-primary hover:bg-primary/10"
            >
              {todayLabel}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); closeAndRestoreFocus(); }}
                className="min-h-9 rounded-control px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {clearLabel}
              </button>
            )}
          </div>
        </div>,
        portalContainerRef?.current?.parentElement ?? document.body
      )}
    </div>
  );
}

interface DateRangePickerProps {
  startValue: string;
  dueValue: string;
  onStartChange: (date: string) => void;
  onDueChange: (date: string) => void;
  startLabel?: string;
  dueLabel?: string;
  startTestId?: string;
  dueTestId?: string;
  todayLabel?: string;
  clearLabel?: string;
  dueIsOverdue?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * One shared popup + one calendar for a start/due date pair — clicking either
 * field opens the same popup with tabs to switch which date you're setting,
 * instead of two independent DatePicker popups that can't see each other's
 * month/selection.
 */
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
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupStyle = usePopupPosition(open, ref, popupRef, 'left');

  // A stale preview from the last field would otherwise linger onto the next
  // one (e.g. switching from the Due tab back to Start keeps showing a Due
  // hover trail until the mouse happens to cross a day button again).
  useEffect(() => {
    setHoverDate(null);
  }, [activeField, open]);

  const today = new Date();
  const todayStr = formatDateISO(today.getFullYear(), today.getMonth(), today.getDate());

  const referenceValue = (activeField === 'start' ? startValue : dueValue) || startValue || dueValue;
  const initial = referenceValue ? (() => {
    const [y, m] = referenceValue.split('-').map(Number);
    return { year: y, month: m - 1 };
  })() : { year: today.getFullYear(), month: today.getMonth() };

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  const jumpToField = useCallback((field: 'start' | 'due') => {
    setActiveField(field);
    const val = field === 'start' ? startValue : dueValue;
    if (val) {
      const [y, m] = val.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [startValue, dueValue]);

  const openFor = (field: 'start' | 'due') => {
    if (field === 'start') setRangeMode(true);
    else if (!startValue) setRangeMode(false);
    jumpToField(field);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  const handleSelect = useCallback((day: number) => {
    const dateStr = formatDateISO(viewYear, viewMonth, day);
    if (activeField === 'start') {
      onStartChange(dateStr);
      setActiveField('due'); // move on to the due date next, same popup
    } else {
      onDueChange(dateStr);
      setOpen(false); // due date is the last step — close like a single picker would
    }
  }, [viewYear, viewMonth, activeField, onStartChange, onDueChange]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else { setViewMonth(m => m - 1); }
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else { setViewMonth(m => m + 1); }
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString('en', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const activeValue = activeField === 'start' ? startValue : dueValue;

  return (
    <div ref={ref} className={cn('relative flex shrink-0 items-center gap-1', className)}>
      {compact ? (
        <button
          type="button"
          data-testid={dueTestId}
          onClick={event => {
            const target = event.target as HTMLElement;
            const clickedStart = Boolean(target.closest('[data-range-field="start"]'));
            openFor(clickedStart || (Boolean(startValue) && !dueValue) ? 'start' : 'due');
          }}
          aria-label={startValue && dueValue
            ? `${startLabel}: ${formatDateDisplay(startValue)}; ${dueLabel}: ${formatDateDisplay(dueValue)}`
            : startValue
              ? `${startLabel}: ${formatDateDisplay(startValue)}`
              : dueValue
                ? `${dueLabel}: ${formatDateDisplay(dueValue)}`
                : dueLabel}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border bg-background px-1.5 text-xs transition-colors hover:border-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            open ? 'border-primary' : 'border-input',
            dueValue && dueIsOverdue && 'border-destructive/40 font-medium',
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {startValue && dueValue ? (
            <>
              <span data-range-field="start" data-testid={startTestId}>
                {formatDateDisplay(startValue)}
              </span>
              <span className="text-muted-foreground" aria-hidden="true">→</span>
              <span className={cn(dueIsOverdue && 'text-destructive')}>
                {formatDateDisplay(dueValue)}
              </span>
            </>
          ) : startValue ? (
            <span data-range-field="start" data-testid={startTestId}>
              {formatDateDisplay(startValue)}
            </span>
          ) : (
            <>
              <span data-testid={startTestId} className="sr-only">{startLabel}</span>
              <span className={cn(
                !dueValue && 'text-muted-foreground',
                dueValue && dueIsOverdue && 'text-destructive',
              )}>
                {dueValue ? formatDateDisplay(dueValue) : dueLabel}
              </span>
            </>
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            data-testid={startTestId}
            onClick={() => openFor('start')}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border bg-background px-1.5 text-xs text-left transition-colors hover:border-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              open && activeField === 'start' ? 'border-primary' : 'border-input',
              !startValue && 'text-muted-foreground'
            )}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{startValue ? formatDateDisplay(startValue) : startLabel}</span>
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">–</span>
          <button
            type="button"
            data-testid={dueTestId}
            onClick={() => openFor('due')}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border bg-background px-1.5 text-xs text-left transition-colors hover:border-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              open && activeField === 'due' ? 'border-primary' : 'border-input',
              !dueValue && 'text-muted-foreground',
              dueValue && dueIsOverdue && 'border-destructive/40 font-medium text-destructive'
            )}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{dueValue ? formatDateDisplay(dueValue) : dueLabel}</span>
          </button>
        </>
      )}

      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="frosted-surface z-50 w-[280px] max-w-[calc(100vw-2rem)] rounded-panel border border-border bg-card p-3 shadow-lg shadow-black/10 dark:shadow-black/30"
          role="dialog"
          aria-label="Pick date"
        >
          {rangeMode || startValue ? (
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-control bg-muted/50 p-0.5">
              <button
                type="button"
                data-testid="date-range-start-tab"
                onClick={() => jumpToField('start')}
                className={cn(
                  'truncate rounded-chip py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeField === 'start' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {startLabel}
              </button>
              <button
                type="button"
                data-testid="date-range-due-tab"
                onClick={() => jumpToField('due')}
                className={cn(
                  'truncate rounded-chip py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeField === 'due' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {dueLabel}
              </button>
            </div>
          ) : (
            <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-semibold text-foreground">{dueLabel}</span>
              <button
                type="button"
                data-testid="date-range-add-start"
                onClick={() => {
                  setRangeMode(true);
                  jumpToField('start');
                }}
                className="rounded-control px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                + {startLabel}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="rounded-control p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="rounded-control p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[0.65rem] font-medium text-muted-foreground/70 py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;
              const dateStr = formatDateISO(viewYear, viewMonth, day);
              const isStart = dateStr === startValue;
              const isDue = dateStr === dueValue;
              const isInRange = !!startValue && !!dueValue && dateStr > startValue && dateStr < dueValue;
              const isToday = dateStr === todayStr;
              const col = i % 7;

              // A due date before the start (or a start after the due) is
              // not a task that can exist - disable those days outright
              // instead of letting the click through and only warning
              // after the fact, so the range can't be built backwards.
              const disabled =
                (activeField === 'due' && !!startValue && dateStr < startValue) ||
                (activeField === 'start' && !!dueValue && dateStr > dueValue);

              // Live preview of the span while the second date is still
              // being chosen - a shaded trail follows the cursor, the same
              // pattern Airbnb/Google Flights-style range pickers use, so
              // the range is visible before the closing click commits it.
              const isPreview =
                !disabled && !!hoverDate && !isStart && !isDue &&
                ((activeField === 'due' && !!startValue && dateStr > startValue && dateStr <= hoverDate) ||
                  (activeField === 'start' && !!dueValue && dateStr < dueValue && dateStr >= hoverDate));

              // The hovered candidate reads as a live "other end" marker
              // (solid, like the real start/due) rather than just more
              // wash - only while a band is actually forming.
              const bandForming = (activeField === 'due' && !!startValue) || (activeField === 'start' && !!dueValue);
              const isHoverEdge = bandForming && !disabled && !isStart && !isDue && dateStr === hoverDate;

              // One continuous strip, not a row of separate rounded chips:
              // start/due/hover-edge get the solid circular marker: everything
              // between them is a flat-sided wash that only rounds off where a
              // row visually wraps (so each row segment still reads as one
              // connected bar, matching how macOS/Google Calendar draw a
              // multi-day span across week rows).
              const isEdge = isStart || isDue || isHoverEdge;
              const inBand = isEdge || isInRange || isPreview;
              const roundLeft = isEdge || (inBand && col === 0);
              const roundRight = isEdge || (inBand && col === 6);

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(day)}
                  onMouseEnter={() => setHoverDate(dateStr)}
                  onMouseLeave={() => setHoverDate(current => (current === dateStr ? null : current))}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center text-sm transition-colors',
                    !inBand && 'rounded-control',
                    disabled ? 'cursor-not-allowed opacity-30' : !inBand && 'hover:bg-muted',
                    inBand && !isEdge && 'bg-primary/10',
                    inBand && !isEdge && roundLeft && 'rounded-l-control',
                    inBand && !isEdge && roundRight && 'rounded-r-control',
                    isEdge && 'rounded-full bg-primary text-primary-foreground hover:bg-primary/90',
                    isToday && !isEdge && 'font-bold text-primary',
                    !isEdge && !isToday && 'text-foreground'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => {
                if (activeField === 'start') { onStartChange(todayStr); setActiveField('due'); }
                else { onDueChange(todayStr); setOpen(false); }
              }}
              className="text-xs text-primary hover:underline"
            >
              {todayLabel}
            </button>
            {activeValue && (
              <button
                type="button"
                onClick={() => {
                  if (activeField === 'start') {
                    onStartChange('');
                    setRangeMode(false);
                    setActiveField('due');
                  }
                  else onDueChange('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {clearLabel}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
  ariaLabel?: string;
  align?: 'left' | 'right';
  pickerLabel?: string;
  allDayLabel?: string;
  onOpenChange?: (open: boolean) => void;
  portalContainerRef?: React.RefObject<HTMLElement | null>;
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'HH:mm',
  testId,
  className,
  ariaLabel,
  align = 'left',
  pickerLabel = 'Pick time',
  allDayLabel = 'All day',
  onOpenChange,
  portalContainerRef,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupStyle = usePopupPosition(open, ref, popupRef, align, portalContainerRef);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selectedOption = popupRef.current?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]');
      selectedOption?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const TIME_OPTIONS: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeAndRestoreFocus(); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    // Capture phase: close just this popup, not the panel underneath it —
    // TaskDetail has its own document-level Escape listener that closes the
    // whole panel; without stopping propagation here (which only works from
    // the capture phase, since both listeners are bound to `document`),
    // Escape would fire both and close the panel out from under the popup.
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open, closeAndRestoreFocus]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-control border border-input bg-background px-2 text-xs',
          'hover:border-muted-foreground hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !value && 'text-muted-foreground'
        )}
      >
        <Clock3 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">{value || placeholder}</span>
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="mindoist-time-picker-popup frosted-surface z-[80] w-[152px] max-w-[calc(100vw-1rem)] max-h-[240px] overflow-y-auto rounded-panel border border-border bg-card p-1 shadow-lg shadow-black/10 dark:shadow-black/30"
          role="listbox"
          aria-label={pickerLabel}
          onKeyDown={event => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const options = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
            const index = options.indexOf(event.target as HTMLButtonElement);
            const nextIndex = Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
            event.preventDefault();
            options[nextIndex]?.focus();
          }}
        >
          <button
            type="button"
            onClick={() => { onChange(''); closeAndRestoreFocus(); }}
            className={cn(
              'min-h-9 w-full rounded-control px-3 py-2 text-sm text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
              !value && 'bg-muted font-medium'
            )}
            role="option"
            aria-selected={!value}
          >
            {allDayLabel}
          </button>
          {TIME_OPTIONS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); closeAndRestoreFocus(); }}
              className={cn(
                'min-h-9 w-full rounded-control px-3 py-2 text-sm text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                t === value && 'bg-primary text-primary-foreground'
              )}
              role="option"
              aria-selected={t === value}
            >
              {t}
            </button>
          ))}
        </div>,
        portalContainerRef?.current?.parentElement ?? document.body
      )}
    </div>
  );
}
