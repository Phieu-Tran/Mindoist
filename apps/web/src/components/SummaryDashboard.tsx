import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Circle, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project, Task, TimeBlock } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { SummaryCalendar } from './SummaryCalendar';
import { SummaryPlannedActual } from './SummaryPlannedActual';
import type { ObsidianSettings } from '@/lib/obsidian-settings';
import './SummaryDashboard.css';

interface Props {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectTask?: (task: Task) => void;
  timeBlocks?: TimeBlock[];
  obsidianSettings?: ObsidianSettings;
  onConfigureObsidian?: () => void;
}

type TrendRange = 'week' | 'month' | 'year';

const trendRanges: TrendRange[] = ['week', 'month', 'year'];

function localDayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function level(value: number, max: number) {
  if (value === 0 || max === 0) return 0;
  return Math.max(1, Math.ceil((value / max) * 10));
}

function startOfCurrentWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function rangeStart(range: TrendRange, now: Date) {
  if (range === 'week') return startOfCurrentWeek(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'month') {
    start.setDate(1);
    return start;
  }
  start.setMonth(0, 1);
  return start;
}

export function SummaryDashboard({
  tasks,
  projects,
  loading,
  error,
  onRetry,
  onSelectTask,
  timeBlocks,
  obsidianSettings,
  onConfigureObsidian,
}: Props) {
  const { t, i18n } = useTranslation('tasks');
  const [projectId, setProjectId] = useState('all');
  const [range, setRange] = useState<TrendRange>('week');
  const timeStoryRange = useMemo(() => {
    const now = new Date();
    return { from: rangeStart(range, now).toISOString(), to: now.toISOString() };
  }, [range]);

  const filteredTasks = useMemo(
    () => projectId === 'all' ? tasks : tasks.filter(task => (task.projectId || 'none') === projectId),
    [projectId, tasks],
  );

  const periodTasks = useMemo(() => {
    const now = new Date();
    const start = rangeStart(range, now);
    return filteredTasks.filter(task => {
      const date = task.completedAt || task.deadline?.date || task.createdAt;
      return date && new Date(date) >= start && new Date(date) <= now;
    });
  }, [filteredTasks, range]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = localDayKey(now);
    const start = rangeStart(range, now);
    const completed = periodTasks.filter(task => task.completedAt).length;
    const open = periodTasks.filter(task => !task.completedAt).length;
    const overdue = periodTasks.filter(task => (
      !task.completedAt && task.deadline && task.deadline.date < today
    )).length;
    const completedInPeriod = filteredTasks.filter(task => (
      task.completedAt && new Date(task.completedAt) >= start && new Date(task.completedAt) <= now
    )).length;
    return {
      total: periodTasks.length,
      open,
      completed,
      completedInPeriod,
      overdue,
      completionRate: periodTasks.length ? Math.round((completed / periodTasks.length) * 100) : 0,
    };
  }, [filteredTasks, periodTasks, range]);

  const priorityData = useMemo(() => {
    const counts = new Map<number | 'none', number>([[1, 0], [2, 0], [3, 0], [4, 0], ['none', 0]]);
    periodTasks.forEach(task => {
      const key = task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : 'none';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const max = Math.max(...counts.values(), 0);
    return [
      { priority: 1 as const, count: counts.get(1) || 0, level: level(counts.get(1) || 0, max) },
      { priority: 2 as const, count: counts.get(2) || 0, level: level(counts.get(2) || 0, max) },
      { priority: 3 as const, count: counts.get(3) || 0, level: level(counts.get(3) || 0, max) },
      { priority: 4 as const, count: counts.get(4) || 0, level: level(counts.get(4) || 0, max) },
      { priority: 'none' as const, count: counts.get('none') || 0, level: level(counts.get('none') || 0, max) },
    ];
  }, [periodTasks]);

  const projectData = useMemo(() => {
    const counts = new Map<string, number>();
    periodTasks.forEach(task => {
      const id = task.projectId || 'none';
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    const names = new Map(projects.map(project => [project.id, project.name]));
    const values = Array.from(counts, ([id, count]) => ({
      id,
      count,
      name: id === 'none' ? t('summary.noProject') : names.get(id) || t('summary.unknownProject'),
    })).sort((a, b) => b.count - a.count).slice(0, 6);
    const max = Math.max(...values.map(item => item.count), 0);
    return values.map(item => ({ ...item, level: level(item.count, max) }));
  }, [projects, t, periodTasks]);

  const trend = useMemo(() => {
    const completedByKey = new Map<string, number>();
    filteredTasks.forEach(task => {
      if (!task.completedAt) return;
      const completedAt = new Date(task.completedAt);
      if (range === 'year') {
        const key = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}`;
        completedByKey.set(key, (completedByKey.get(key) || 0) + 1);
        return;
      }
      const key = localDayKey(completedAt);
      completedByKey.set(key, (completedByKey.get(key) || 0) + 1);
    });

    const now = new Date();
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 12;
    const buckets = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      if (range === 'year') {
        date.setMonth(now.getMonth() - (days - index - 1), 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return {
          key,
          count: completedByKey.get(key) || 0,
          label: date.toLocaleDateString(i18n.language, { month: 'short' }),
        };
      }
      date.setDate(date.getDate() - (days - index - 1));
      const key = localDayKey(date);
      return {
        key,
        count: completedByKey.get(key) || 0,
        label: date.toLocaleDateString(i18n.language, range === 'week'
          ? { weekday: 'narrow' }
          : { day: 'numeric' }),
      };
    });
    const max = Math.max(...buckets.map(day => day.count), 0);
    return buckets.map(day => ({ ...day, level: level(day.count, max) }));
  }, [filteredTasks, i18n.language, range]);

  if (loading) {
    return (
      <div data-testid="summary-loading" className="grid gap-4 animate-pulse" aria-label={t('summary.loading')}>
        <div className="h-9 w-52 rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map(item => <div key={item} className="h-28 rounded-xl bg-muted" />)}
        </div>
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="summary-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
        <p className="m-0">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t('list.retry')}
        </Button>
      </div>
    );
  }

  return (
    <section data-testid="summary-dashboard" className="summary-dashboard" aria-labelledby="summary-title">
      <header className="summary-header">
        <div>
          <p className="summary-eyebrow">{t('summary.eyebrow')}</p>
          <h2 id="summary-title" className="summary-title">{t('summary.title')}</h2>
          <p className="summary-subtitle">{t('summary.subtitle')}</p>
        </div>
        <label className="summary-project-filter">
          <span>{t('summary.projectFilter')}</span>
          <select data-testid="summary-project-filter" value={projectId} onChange={event => setProjectId(event.target.value)}>
            <option value="all">{t('summary.allProjects')}</option>
            <option value="none">{t('summary.noProject')}</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </header>

      {tasks.length === 0 ? (
        <div data-testid="summary-empty" className="summary-empty">
          <BarChart3 aria-hidden="true" />
          <h3>{t('summary.emptyTitle')}</h3>
          <p>{t('summary.emptyDescription')}</p>
        </div>
      ) : (
        <>
          <div className="summary-stats">
            <article data-testid="summary-total" className="summary-stat">
              <Target aria-hidden="true" />
              <div><span>{t('summary.total')}</span><strong>{stats.total}</strong></div>
            </article>
            <article data-testid="summary-open" className="summary-stat">
              <Circle aria-hidden="true" />
              <div><span>{t('summary.open')}</span><strong>{stats.open}</strong></div>
            </article>
            <article data-testid="summary-completed" className="summary-stat summary-stat-success">
              <CheckCircle2 aria-hidden="true" />
              <div><span>{t('summary.completed')}</span><strong>{stats.completed}</strong><small>{stats.completionRate}%</small></div>
            </article>
            <article data-testid="summary-completed-period" className="summary-stat summary-stat-success">
              <BarChart3 aria-hidden="true" />
              <div><span>{t(`summary.${range}`)}</span><strong>{stats.completedInPeriod}</strong></div>
            </article>
            <article data-testid="summary-overdue" className="summary-stat summary-stat-danger">
              <AlertTriangle aria-hidden="true" />
              <div><span>{t('summary.overdue')}</span><strong>{stats.overdue}</strong></div>
            </article>
          </div>

          <div className="summary-grid">
            <SummaryPlannedActual
              from={timeStoryRange.from}
              to={timeStoryRange.to}
              taskIds={filteredTasks.map(task => task.id)}
              timeBlocks={timeBlocks}
            />
            <article className="summary-panel summary-trend-panel">
              <div className="summary-panel-heading">
                <div>
                  <h3>{t('summary.trend')}</h3>
                  <p>{t('summary.trendDescription')}</p>
                </div>
                <div className="summary-range" role="group" aria-label={t('summary.range')}>
                  {trendRanges.map(nextRange => (
                    <button
                      key={nextRange}
                      type="button"
                      data-testid={`summary-range-${nextRange}`}
                      aria-pressed={range === nextRange}
                      onClick={() => setRange(nextRange)}
                    >
                      {t(`summary.${nextRange}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className={cn('summary-trend', range === 'month' && 'summary-trend-month', range === 'year' && 'summary-trend-year')} role="list" aria-label={t('summary.trendAria', { range: t(`summary.${range}`) })}>
                {trend.map(day => (
                  <div key={day.key} role="listitem" className="summary-trend-column" aria-label={t('summary.bucketCompleted', { date: day.key, count: day.count })}>
                    <span className="summary-trend-value">{day.count || ''}</span>
                    <span className={`summary-trend-bar summary-level-${day.level}`} aria-hidden="true" />
                    <span className="summary-trend-label">{day.label}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="summary-panel">
              <div className="summary-panel-heading"><h3>{t('summary.byPriority')}</h3></div>
              <div className="summary-bars">
                {priorityData.map(item => (
                  <div key={item.priority} className="summary-bar-row" data-testid={`summary-priority-${item.priority}`}>
                    <span className={`summary-priority-marker summary-priority-${item.priority}`} aria-hidden="true" />
                    <span className="summary-bar-label">{item.priority === 'none' ? t('detail.noPriority') : `P${item.priority}`}</span>
                    <span className="summary-bar-track"><span className={`summary-bar-fill summary-priority-${item.priority} summary-level-${item.level}`} /></span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="summary-panel">
              <div className="summary-panel-heading">
                <h3>{projectId === 'all' ? t('summary.byProject') : t('summary.projectTasks')}</h3>
              </div>
              {projectId === 'all' ? (
                <div className="summary-bars">
                  {projectData.map(item => (
                    <div key={item.id} className="summary-bar-row">
                      <span className="summary-bar-label summary-project-label">{item.name}</span>
                      <span className="summary-bar-track"><span className={`summary-bar-fill summary-project-fill summary-level-${item.level}`} /></span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              ) : periodTasks.length === 0 ? (
                <p data-testid="summary-project-tasks-empty" className="summary-day-empty">{t('summary.noTasksForProject')}</p>
              ) : (
                <ul data-testid="summary-project-tasks" className="summary-day-tasks">
                  {periodTasks.map(task => (
                    <li key={task.id}>
                      <button type="button" onClick={() => onSelectTask?.(task)}>
                        <span className={`summary-agenda-priority summary-priority-${task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : 'none'}`} aria-hidden="true" />
                        <span className={cn('summary-agenda-title', task.completedAt && 'summary-agenda-completed')}>{task.title}</span>
                        <span className="summary-agenda-meta">
                          {[task.deadline?.date, task.priority != null ? `P${task.priority}` : null].filter(Boolean).join(' · ')}
                        </span>
                        {task.completedAt && <CheckCircle2 aria-label={t('summary.completed')} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <SummaryCalendar
              tasks={filteredTasks}
              projects={projects}
              onSelectTask={onSelectTask}
              obsidianSettings={obsidianSettings}
              onConfigureObsidian={onConfigureObsidian}
            />
          </div>
        </>
      )}
    </section>
  );
}
