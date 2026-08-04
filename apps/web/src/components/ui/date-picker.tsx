import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export function DatePicker({ value, onChange, placeholder = 'dd/mm/yyyy', testId, className, align = 'left' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    setOpen(false);
  }, [viewYear, viewMonth, onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  }, [onChange]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
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
  }, [open]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfMonth(viewYear, viewMonth);
  const todayStr = formatDateISO(today.getFullYear(), today.getMonth(), today.getDate());

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

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-control border border-input bg-background px-2 text-xs',
          'hover:border-muted-foreground hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !value && 'text-muted-foreground'
        )}
      >
        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{value ? formatDateDisplay(value) : placeholder}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as any); }}
            className="text-muted-foreground hover:text-foreground text-xs leading-none"
            aria-label="Clear date"
          >
            ×
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div
          className={cn(
            'frosted-surface absolute z-50 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-panel border border-border bg-card p-3 shadow-lg shadow-black/10 dark:shadow-black/30',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          role="dialog"
          aria-label="Pick date"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="rounded-control p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="rounded-control p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[0.65rem] font-medium text-muted-foreground/70 py-1">
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
                  onClick={() => handleSelect(day)}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-control text-sm transition-colors',
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
              onClick={() => { onChange(todayStr); setOpen(false); }}
              className="text-xs text-primary hover:underline"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
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
  const ref = useRef<HTMLDivElement>(null);

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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

      {open && (
        <div
          className="frosted-surface absolute z-50 left-0 top-full mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-panel border border-border bg-card p-3 shadow-lg shadow-black/10 dark:shadow-black/30"
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
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => handleSelect(day)}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-control text-sm transition-colors',
                    'hover:bg-muted',
                    isInRange && 'bg-primary/10',
                    (isStart || isDue) && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    isToday && !isStart && !isDue && 'font-bold text-primary',
                    !isStart && !isDue && !isToday && 'text-foreground'
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
        </div>
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
}

export function TimePicker({ value, onChange, placeholder = 'HH:mm', testId, className, ariaLabel, align = 'left' }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const TIME_OPTIONS: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
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
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-control border border-input bg-background px-2 text-xs',
          'hover:border-muted-foreground hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !value && 'text-muted-foreground'
        )}
      >
        <span className="flex-1">{value || placeholder}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(''); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            className="text-muted-foreground hover:text-foreground text-xs leading-none"
            aria-label="Clear time"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'frosted-surface absolute z-50 mt-1 w-[140px] max-w-[calc(100vw-2rem)] max-h-[200px] overflow-y-auto rounded-panel border border-border bg-card shadow-lg shadow-black/10 dark:shadow-black/30',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          role="listbox"
          aria-label="Pick time"
        >
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={cn(
              'w-full rounded-control px-3 py-1.5 text-sm text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
              !value && 'bg-muted font-medium'
            )}
            role="option"
            aria-selected={!value}
          >
            All day
          </button>
          {TIME_OPTIONS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); setOpen(false); }}
              className={cn(
                'w-full rounded-control px-3 py-1.5 text-sm text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                t === value && 'bg-primary text-primary-foreground'
              )}
              role="option"
              aria-selected={t === value}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
