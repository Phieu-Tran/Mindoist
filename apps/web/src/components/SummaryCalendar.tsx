import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import './SummaryDashboard.css';

interface Props {
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function SummaryCalendar({ tasks, onSelectTask }: Props) {
  const { t, i18n } = useTranslation('tasks');
  const today = atNoon(new Date());
  const todayKey = dayKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const tasksByDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    const addToDay = (key: string, task: Task) => {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(task);
    };
    tasks.forEach(task => {
      if (!task.deadline) return;
      const dueKey = task.deadline.date;
      const startKey = task.startDate ? task.startDate.slice(0, 10) : dueKey;
      if (startKey >= dueKey) {
        addToDay(dueKey, task);
        return;
      }
      // Multi-day range: show the task on every day it spans (dot per day,
      // shows up when that day is selected) — same as the main Calendar
      // view. It's still ONE task everywhere that counts uniquely (overall
      // stats, the "X task" label for a selected day) since each day just
      // references the same task object, nothing sums across days here.
      const cursor = new Date(`${startKey}T12:00:00`);
      const end = new Date(`${dueKey}T12:00:00`);
      while (cursor <= end) {
        addToDay(dayKey(cursor), task);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    grouped.forEach(dayTasks => dayTasks.sort((a, b) => (
      (a.deadline?.time || '23:59').localeCompare(b.deadline?.time || '23:59') || a.title.localeCompare(b.title)
    )));
    return grouped;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const start = new Date(visibleMonth);
    start.setDate(1 - visibleMonth.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 6, 19 + index, 12);
    return date.toLocaleDateString(i18n.language, { weekday: 'short' });
  }), [i18n.language]);

  const selectedTasks = tasksByDay.get(selectedKey) || [];
  const selectedDate = new Date(`${selectedKey}T12:00:00`);
  const selectedLabel = selectedDate.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    setVisibleMonth(next);
    setSelectedKey(dayKey(next));
  };

  const returnToToday = () => {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    setSelectedKey(todayKey);
  };

  return (
    <article data-testid="summary-calendar" className="summary-panel summary-calendar-panel">
      <div className="summary-calendar-heading">
        <div>
          <h3>{t('summary.calendarOverview')}</h3>
          <p>{t('summary.calendarDescription')}</p>
        </div>
        <div className="summary-calendar-controls">
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label={t('summary.previousMonth')}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={returnToToday}>{t('calendar.today')}</Button>
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label={t('summary.nextMonth')}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="summary-calendar-layout">
        <div className="summary-month">
          <h4 data-testid="summary-calendar-month">
            {visibleMonth.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
          </h4>
          <div className="summary-weekdays" aria-hidden="true">
            {weekdays.map(weekday => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="summary-month-grid" role="grid" aria-label={t('summary.calendarOverview')}>
            {calendarDays.map(date => {
              const key = dayKey(date);
              const dayTasks = tasksByDay.get(key) || [];
              const outside = date.getMonth() !== visibleMonth.getMonth();
              const fullLabel = date.toLocaleDateString(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  data-testid={`summary-calendar-day-${key}`}
                  data-selected={selectedKey === key}
                  aria-label={t('summary.calendarDay', { date: fullLabel, count: dayTasks.length })}
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'summary-calendar-day',
                    outside && 'summary-calendar-day-outside',
                    key === todayKey && 'summary-calendar-day-today',
                  )}
                >
                  <span>{date.getDate()}</span>
                  {dayTasks.length > 0 && (
                    <span className="summary-calendar-dots" aria-hidden="true">
                      {dayTasks.slice(0, 3).map(task => {
                        const priority = task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : 'none';
                        return (
                          <span
                            key={task.id}
                            className={cn(`summary-priority-${priority}`, task.completedAt && 'summary-dot-completed')}
                          />
                        );
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="summary-day-agenda" aria-labelledby="summary-day-title">
          <div className="summary-day-heading">
            <CalendarDays aria-hidden="true" />
            <div>
              <h4 id="summary-day-title">{selectedLabel}</h4>
              <p>{t('summary.taskCount', { count: selectedTasks.length })}</p>
            </div>
          </div>
          {selectedTasks.length === 0 ? (
            <p data-testid="summary-day-empty" className="summary-day-empty">{t('summary.noTasksForDate')}</p>
          ) : (
            <ul data-testid="summary-day-tasks" className="summary-day-tasks">
              {selectedTasks.map(task => (
                <li key={task.id}>
                  <button type="button" onClick={() => onSelectTask?.(task)}>
                    <span className={`summary-agenda-priority summary-priority-${task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : 'none'}`} aria-hidden="true" />
                    <span className={cn('summary-agenda-title', task.completedAt && 'summary-agenda-completed')}>{task.title}</span>
                    <span className="summary-agenda-meta">
                      {task.deadline?.time || t('calendar.allDay')}{task.priority != null ? ` · P${task.priority}` : ''}
                    </span>
                    {task.completedAt && <CheckCircle2 aria-label={t('summary.completed')} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </article>
  );
}
