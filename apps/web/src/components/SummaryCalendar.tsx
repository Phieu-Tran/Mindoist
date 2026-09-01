import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCopy,
  Code2,
  ExternalLink,
  ListTree,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project, Task } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import {
  buildObsidianNewNoteUri,
  isObsidianConfigured,
  renderObsidianNotePath,
  type ObsidianReviewPeriod,
  type ObsidianSettings,
} from '@/lib/obsidian-settings';
import './SummaryDashboard.css';

interface Props {
  tasks: Task[];
  projects?: Project[];
  onSelectTask?: (task: Task) => void;
  obsidianSettings?: ObsidianSettings;
  onConfigureObsidian?: () => void;
}

type SummaryPeriodView = 'calendar' | 'week' | 'month';
type ReviewEntry = {
  dateKey: string;
  source: 'completed' | 'deadline' | 'created';
  task: Task;
};

function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date: Date) {
  return dayKey(date).slice(0, 7);
}

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function reviewEntry(task: Task): ReviewEntry {
  if (task.completedAt) {
    const completedAt = new Date(task.completedAt);
    if (!Number.isNaN(completedAt.getTime())) {
      return { dateKey: dayKey(completedAt), source: 'completed', task };
    }
  }
  if (task.deadline?.date) {
    return { dateKey: task.deadline.date.slice(0, 10), source: 'deadline', task };
  }
  const createdAt = new Date(task.createdAt);
  return {
    dateKey: Number.isNaN(createdAt.getTime()) ? task.createdAt.slice(0, 10) : dayKey(createdAt),
    source: 'created',
    task,
  };
}

function inlineMarkdown(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function startOfWeek(date: Date) {
  const start = atNoon(date);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function SummaryCalendar({
  tasks,
  projects = [],
  onSelectTask,
  obsidianSettings,
  onConfigureObsidian,
}: Props) {
  const { t, i18n } = useTranslation('tasks');
  const today = atNoon(new Date());
  const todayKey = dayKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [periodView, setPeriodView] = useState<SummaryPeriodView>('calendar');
  const [obsidianStatus, setObsidianStatus] = useState<'idle' | 'opening' | 'ready' | 'error'>('idle');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

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

  const projectNames = useMemo(
    () => new Map(projects.map(project => [project.id, project.name])),
    [projects],
  );
  const selectedTasks = tasksByDay.get(selectedKey) || [];
  const selectedDate = new Date(`${selectedKey}T12:00:00`);
  const selectedLabel = selectedDate.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = addDays(weekStart, 6);
  const weekStartKey = dayKey(weekStart);
  const weekEndKey = dayKey(weekEnd);
  const weekLabel = t('summary.weekRange', {
    start: weekStart.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
    end: weekEnd.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
  });
  const visibleMonthKey = monthKey(visibleMonth);
  const visibleMonthLabel = visibleMonth.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  const monthEndKey = dayKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 12));
  const reviewKind = periodView === 'week' ? 'week' : 'month';
  const reviewStartKey = reviewKind === 'week' ? weekStartKey : `${visibleMonthKey}-01`;
  const reviewEndKey = reviewKind === 'week' ? weekEndKey : monthEndKey;
  const reviewLabel = reviewKind === 'week' ? weekLabel : visibleMonthLabel;
  const reviewPeriod: ObsidianReviewPeriod = {
    kind: reviewKind,
    key: reviewKind === 'week' ? weekStartKey : visibleMonthKey,
  };
  const obsidianConfigured = isObsidianConfigured(obsidianSettings);
  const obsidianPath = obsidianConfigured
    ? renderObsidianNotePath(obsidianSettings, reviewPeriod)
    : null;
  const reviewEntries = useMemo(() => tasks
    .map(reviewEntry)
    .filter(entry => entry.dateKey >= reviewStartKey && entry.dateKey <= reviewEndKey)
    .sort((a, b) => (
      a.dateKey.localeCompare(b.dateKey)
      || (a.task.deadline?.time || '23:59').localeCompare(b.task.deadline?.time || '23:59')
      || a.task.title.localeCompare(b.task.title)
    )), [reviewEndKey, reviewStartKey, tasks]);
  const reviewGroups = useMemo(() => {
    const groups = new Map<string, ReviewEntry[]>();
    reviewEntries.forEach(entry => {
      if (!groups.has(entry.dateKey)) groups.set(entry.dateKey, []);
      groups.get(entry.dateKey)!.push(entry);
    });
    return Array.from(groups, ([dateKeyValue, entries]) => ({ dateKey: dateKeyValue, entries }));
  }, [reviewEntries]);
  const reviewStats = useMemo(() => {
    const completed = reviewEntries.filter(entry => Boolean(entry.task.completedAt)).length;
    const overdue = reviewEntries.filter(entry => (
      !entry.task.completedAt && entry.task.deadline && entry.task.deadline.date.slice(0, 10) < todayKey
    )).length;
    return {
      total: reviewEntries.length,
      completed,
      open: reviewEntries.length - completed,
      overdue,
    };
  }, [reviewEntries, todayKey]);

  const reviewMarkdown = useMemo(() => {
    const isWeekly = reviewKind === 'week';
    const lines = [
      '---',
      `type: mindoist-${isWeekly ? 'weekly' : 'monthly'}-review`,
      `period: ${reviewKind}`,
      ...(isWeekly
        ? [`week_start: ${weekStartKey}`, `week_end: ${weekEndKey}`]
        : [`month: ${visibleMonthKey}`, `period_start: ${reviewStartKey}`, `period_end: ${reviewEndKey}`]),
      `generated: ${todayKey}`,
      'source: Mindoist',
      '---',
      '',
      `# ${isWeekly
        ? t('summary.obsidianWeeklyNoteTitle', { range: reviewLabel })
        : t('summary.obsidianNoteTitle', { month: reviewLabel })}`,
      '',
      `> ${isWeekly ? t('summary.weeklyDigest', reviewStats) : t('summary.monthlyDigest', reviewStats)}`,
      '',
    ];
    reviewGroups.forEach(group => {
      const date = new Date(`${group.dateKey}T12:00:00`);
      lines.push(`## ${date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}`);
      group.entries.forEach(({ source, task }) => {
        const project = task.projectId ? projectNames.get(task.projectId) : null;
        const status = source === 'completed'
          ? t('summary.completed')
          : source === 'deadline'
            ? task.deadline?.time
              ? t('summary.dueAt', { time: task.deadline.time })
              : t('summary.due')
            : t('summary.added');
        const meta = [project, task.priority != null ? `P${task.priority}` : null, status].filter(Boolean).join(' · ');
        lines.push(`- [${task.completedAt ? 'x' : ' '}] ${inlineMarkdown(task.title)}${meta ? ` — ${meta}` : ''}`);
      });
      lines.push('');
    });
    if (reviewGroups.length === 0) {
      lines.push(t(isWeekly ? 'summary.noTasksForWeek' : 'summary.noTasksForMonth'));
    }
    return lines.join('\n').trim();
  }, [
    i18n.language,
    projectNames,
    reviewEndKey,
    reviewGroups,
    reviewKind,
    reviewLabel,
    reviewStartKey,
    reviewStats,
    t,
    todayKey,
    visibleMonthKey,
    weekEndKey,
    weekStartKey,
  ]);

  const resetReviewFeedback = () => {
    setObsidianStatus('idle');
    setCopyStatus('idle');
  };

  const selectPeriodView = (nextView: SummaryPeriodView) => {
    setPeriodView(nextView);
    resetReviewFeedback();
  };

  const movePeriod = (offset: number) => {
    if (periodView === 'week') {
      const next = addDays(selectedDate, offset * 7);
      setSelectedKey(dayKey(next));
      setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1, 12));
      resetReviewFeedback();
      return;
    }
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    setVisibleMonth(next);
    setSelectedKey(dayKey(next));
    resetReviewFeedback();
  };

  const returnToToday = () => {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    setSelectedKey(todayKey);
    resetReviewFeedback();
  };

  const openInObsidian = async () => {
    if (!obsidianConfigured || reviewEntries.length === 0 || obsidianStatus === 'opening') return;
    setObsidianStatus('opening');
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reviewMarkdown);
        copied = true;
      }
    } catch {
      copied = false;
    }

    try {
      const uri = buildObsidianNewNoteUri(obsidianSettings, reviewPeriod, reviewMarkdown, copied);
      const link = document.createElement('a');
      link.href = uri;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setObsidianStatus('ready');
    } catch {
      setObsidianStatus('error');
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(reviewMarkdown);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <article data-testid="summary-calendar" className="summary-panel summary-calendar-panel">
      <div className="summary-calendar-heading">
        <div>
          <h3>{t('summary.calendarOverview')}</h3>
          <p>
            {periodView === 'calendar'
              ? t('summary.calendarDescription')
              : periodView === 'week'
                ? t('summary.weeklyListDescription')
                : t('summary.monthlyListDescription')}
          </p>
        </div>
        <div className="summary-calendar-actions">
          <div className="summary-range summary-view-switch" role="group" aria-label={t('summary.periodView')}>
            <button
              type="button"
              data-testid="summary-view-calendar"
              aria-pressed={periodView === 'calendar'}
              onClick={() => selectPeriodView('calendar')}
            >
              <CalendarDays aria-hidden="true" />
              {t('summary.calendarView')}
            </button>
            <button
              type="button"
              data-testid="summary-view-week"
              aria-pressed={periodView === 'week'}
              onClick={() => selectPeriodView('week')}
            >
              <ListTree aria-hidden="true" />
              {t('summary.weeklyList')}
            </button>
            <button
              type="button"
              data-testid="summary-view-list"
              aria-pressed={periodView === 'month'}
              onClick={() => selectPeriodView('month')}
            >
              <ListTree aria-hidden="true" />
              {t('summary.monthlyList')}
            </button>
          </div>
          <div className="summary-calendar-controls">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => movePeriod(-1)}
              aria-label={t(periodView === 'week' ? 'summary.previousWeek' : 'summary.previousMonth')}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={returnToToday}>{t('calendar.today')}</Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => movePeriod(1)}
              aria-label={t(periodView === 'week' ? 'summary.nextWeek' : 'summary.nextMonth')}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {periodView === 'calendar' ? (
        <div className="summary-calendar-layout">
          <div className="summary-month">
            <h4 data-testid="summary-calendar-month">{visibleMonthLabel}</h4>
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
      ) : (
        <section
          data-testid={periodView === 'week' ? 'summary-weekly-list' : 'summary-monthly-list'}
          className="summary-monthly-list"
          aria-labelledby="summary-period-list-title"
        >
          <div className="summary-monthly-list-heading">
            <div>
              <h4 id="summary-period-list-title" data-testid={periodView === 'week' ? 'summary-week-range' : 'summary-month-list-month'}>
                {reviewLabel}
              </h4>
              <p>
                {obsidianConfigured
                  ? t('summary.obsidianDestination', { vault: obsidianSettings.vault, path: obsidianPath })
                  : t('summary.obsidianNeedsSetup')}
              </p>
            </div>
            <div className="summary-ledger-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="summary-preview-markdown"
                aria-expanded={templateOpen}
                aria-controls="summary-markdown-preview"
                onClick={() => {
                  setTemplateOpen(value => !value);
                  setCopyStatus('idle');
                }}
              >
                <Code2 aria-hidden="true" />
                {templateOpen ? t('summary.hideMarkdown') : t('summary.previewMarkdown')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="summary-open-obsidian"
                disabled={obsidianConfigured && (reviewEntries.length === 0 || obsidianStatus === 'opening')}
                onClick={() => {
                  if (obsidianConfigured) void openInObsidian();
                  else onConfigureObsidian?.();
                }}
              >
                {obsidianConfigured
                  ? <ExternalLink aria-hidden="true" />
                  : <Settings2 aria-hidden="true" />}
                {obsidianConfigured
                  ? obsidianStatus === 'opening' ? t('summary.obsidianOpening') : t('summary.openObsidian')
                  : t('summary.configureObsidian')}
              </Button>
            </div>
          </div>

          <div
            className="summary-monthly-stats"
            role="list"
            aria-label={t(periodView === 'week' ? 'summary.weeklyStats' : 'summary.monthlyStats')}
          >
            {(['total', 'completed', 'open', 'overdue'] as const).map(stat => (
              <div key={stat} role="listitem" data-testid={`summary-${periodView}-${stat}`}>
                <strong>{reviewStats[stat]}</strong>
                <span>{t(`summary.month${stat[0].toUpperCase()}${stat.slice(1)}`)}</span>
              </div>
            ))}
          </div>

          {obsidianStatus !== 'idle' && obsidianStatus !== 'opening' && (
            <p className={cn('summary-obsidian-status', obsidianStatus === 'error' && 'summary-obsidian-error')} role="status" aria-live="polite">
              {obsidianStatus === 'ready' ? t('summary.obsidianReady') : t('summary.obsidianError')}
            </p>
          )}

          {templateOpen && (
            <section
              id="summary-markdown-preview"
              data-testid="summary-markdown-preview"
              className="summary-markdown-preview"
              aria-labelledby="summary-markdown-preview-title"
            >
              <header>
                <div>
                  <h5 id="summary-markdown-preview-title">{t('summary.markdownPreviewTitle')}</h5>
                  <p>{t('summary.markdownPreviewHint')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="summary-copy-markdown"
                  onClick={() => void copyMarkdown()}
                >
                  <ClipboardCopy aria-hidden="true" />
                  {t('summary.copyMarkdown')}
                </Button>
              </header>
              {copyStatus !== 'idle' && (
                <p
                  className={cn('summary-obsidian-status', copyStatus === 'error' && 'summary-obsidian-error')}
                  role="status"
                  aria-live="polite"
                >
                  {t(copyStatus === 'copied' ? 'summary.markdownCopied' : 'summary.markdownCopyError')}
                </p>
              )}
              <pre><code>{reviewMarkdown}</code></pre>
            </section>
          )}

          {reviewGroups.length === 0 ? (
            <p
              data-testid={periodView === 'week' ? 'summary-week-empty' : 'summary-month-empty'}
              className="summary-day-empty"
            >
              {t(periodView === 'week' ? 'summary.noTasksForWeek' : 'summary.noTasksForMonth')}
            </p>
          ) : (
            <ol className="summary-month-groups">
              {reviewGroups.map(group => {
                const date = new Date(`${group.dateKey}T12:00:00`);
                const fullDate = date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                return (
                  <li key={group.dateKey} className="summary-month-group">
                    <h5>
                      <time dateTime={group.dateKey} aria-label={fullDate}>
                        <span>{date.toLocaleDateString(i18n.language, { weekday: 'short' })}</span>
                        <strong>{date.getDate()}</strong>
                        <span>{date.toLocaleDateString(i18n.language, { month: 'short' })}</span>
                      </time>
                    </h5>
                    <ul>
                      {group.entries.map(({ source, task }) => {
                        const projectName = task.projectId ? projectNames.get(task.projectId) : null;
                        const sourceLabel = source === 'completed'
                          ? t('summary.completed')
                          : source === 'deadline'
                            ? task.deadline?.time
                              ? t('summary.dueAt', { time: task.deadline.time })
                              : t('summary.due')
                            : t('summary.added');
                        return (
                          <li key={task.id}>
                            <button type="button" onClick={() => onSelectTask?.(task)} aria-label={t('summary.openTask', { title: task.title })}>
                              <span className={`summary-agenda-priority summary-priority-${task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : 'none'}`} aria-hidden="true" />
                              <span className={cn('summary-month-task-title', task.completedAt && 'summary-agenda-completed')}>{task.title}</span>
                              <span className="summary-month-task-meta">
                                {[projectName, task.priority != null ? `P${task.priority}` : null, sourceLabel].filter(Boolean).join(' · ')}
                              </span>
                              {task.completedAt
                                ? <CheckCircle2 aria-label={t('summary.completed')} />
                                : <Circle aria-hidden="true" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </article>
  );
}
