import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Command as CommandMenu } from 'cmdk';
import { ArrowRight, AtSign, CalendarClock, CalendarDays, Check, Clock3, Command as CommandIcon, CornerDownLeft, Flag, FolderOpen, ListChecks, Plus, Search, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseQuickAdd } from '@mindoist/shared/nlparse';
import type { ParsedQuickAdd } from '@mindoist/shared/nlparse';
import type { Project, Tag, Task } from '@mindoist/shared/types';
import type { SidebarView } from '../hooks/useApi';
import { Button } from './ui/button';
import { commandMode, commandQuery, rankTaskMatches } from '../features/command-bar/model';

interface Props {
  onAdd: (parsed: ParsedQuickAdd) => void | Promise<void>;
  locale?: 'en' | 'vi';
  tasks?: Task[];
  projects?: Project[];
  tags?: Tag[];
  currentView?: SidebarView;
  selectedTask?: Task | null;
  onNavigate?: (view: SidebarView, projectId?: string) => void;
  onSelectTask?: (task: Task) => void;
  onCompleteTask?: (task: Task) => void | Promise<void>;
  onScheduleTask?: (task: Task) => void;
  onMoveTask?: (task: Task, projectId: string) => void | Promise<void>;
  onAssignTag?: (task: Task, tagId: string) => void | Promise<void>;
  onDismiss?: () => void;
}

interface PreviewEdits {
  date: string;
  time: string;
  projectId: string;
  priority: string;
  estimateMin: string;
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DESTINATIONS: { view: SidebarView; labelKey: string; aliases: string[] }[] = [
  { view: 'today', labelKey: 'sidebar.today', aliases: ['today', 'my day', 'hôm nay'] },
  { view: 'calendar', labelKey: 'sidebar.calendar', aliases: ['calendar', 'schedule', 'lịch'] },
  { view: 'countdown', labelKey: 'sidebar.countdown', aliases: ['countdown', 'deadline', 'đếm ngày', 'đếm ngược'] },
  { view: 'projects', labelKey: 'sidebar.projects', aliases: ['projects', 'project', 'dự án'] },
  { view: 'summary', labelKey: 'sidebar.summary', aliases: ['review', 'summary', 'tổng kết'] },
  { view: 'settings', labelKey: 'sidebar.settings', aliases: ['settings', 'preferences', 'cài đặt'] },
];

function applyPreviewEdits(parsed: ParsedQuickAdd, edits: PreviewEdits): ParsedQuickAdd {
  const priority = Number(edits.priority);
  const estimateMin = Number(edits.estimateMin);
  return {
    ...parsed,
    deadline: edits.date ? { date: edits.date, ...(edits.time ? { time: edits.time } : {}) } : undefined,
    projectId: edits.projectId || undefined,
    priority: priority >= 1 && priority <= 4 ? priority as 1 | 2 | 3 | 4 : undefined,
    estimateMin: estimateMin > 0 ? estimateMin : undefined,
  };
}

export function GlobalQuickCapture({
  onAdd,
  locale,
  tasks = [],
  projects = [],
  tags = [],
  currentView = 'today',
  selectedTask = null,
  onNavigate,
  onSelectTask,
  onCompleteTask,
  onScheduleTask,
  onMoveTask,
  onAssignTag,
  onDismiss,
}: Props) {
  const { i18n, t } = useTranslation('tasks');
  const effectiveLocale = locale ?? (i18n.language?.startsWith('vi') ? 'vi' : 'en');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [edits, setEdits] = useState<Partial<PreviewEdits>>({});
  const triggerElementRef = useRef<Element | null>(null);
  const mode = commandMode(input);
  const query = commandQuery(input).toLocaleLowerCase();

  const parsed = useMemo(() => {
    if (mode !== 'create' || !input.trim()) return null;
    return parseQuickAdd(input.trim(), { locale: effectiveLocale, now: new Date() });
  }, [effectiveLocale, input, mode]);
  const parsedEdits = useMemo<PreviewEdits>(() => ({
    date: parsed?.deadline?.date ?? '',
    time: parsed?.deadline?.time ?? '',
    projectId: parsed?.projectId ?? '',
    priority: parsed?.priority ? String(parsed.priority) : '',
    estimateMin: parsed?.estimateMin ? String(parsed.estimateMin) : '',
  }), [parsed]);
  const resolvedEdits = useMemo<PreviewEdits>(() => ({ ...parsedEdits, ...edits }), [edits, parsedEdits]);
  const preview = useMemo(() => parsed ? applyPreviewEdits(parsed, resolvedEdits) : null, [parsed, resolvedEdits]);
  const today = localDateValue(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDateValue(tomorrowDate);
  const matchingTasks = useMemo(() => rankTaskMatches(tasks, query), [query, tasks]);
  const matchingDestinations = useMemo(() => DESTINATIONS.filter(item => (
    !query || [t(item.labelKey), item.view, ...item.aliases].some(value => value.toLocaleLowerCase().includes(query))
  )), [query, t]);
  const matchingProjects = useMemo(() => projects.filter(project => !query || `project ${project.name}`.toLocaleLowerCase().includes(query)), [projects, query]);
  const modeLabel = t(`quickAdd.command.mode.${mode}`);
  const currentViewLabel = t(`sidebar.${currentView}`, { defaultValue: currentView });

  const resetAndClose = useCallback(() => {
    setOpen(false);
    setInput('');
    setEdits({});
    onDismiss?.();
  }, [onDismiss]);

  const openCommandBar = useCallback((initialInput = '') => {
    triggerElementRef.current = document.activeElement;
    setInput(initialInput);
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandBar();
      }
    };
    const handleOpenEvent = (event: Event) => {
      const initialInput = (event as CustomEvent<{ input?: string }>).detail?.input ?? '';
      openCommandBar(initialInput);
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mindoist:global-capture', handleOpenEvent);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('mindoist:global-capture', handleOpenEvent);
    };
  }, [openCommandBar]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    resetAndClose();
    window.setTimeout(() => (triggerElementRef.current as HTMLElement | null)?.focus?.(), 0);
  }, [resetAndClose]);

  const createTask = useCallback(async () => {
    if (!preview?.title.trim()) return;
    await onAdd(preview);
    resetAndClose();
  }, [onAdd, preview, resetAndClose]);

  const run = useCallback(async (action: () => void | Promise<void>) => {
    await action();
    resetAndClose();
  }, [resetAndClose]);

  return (
    <CommandMenu.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t('quickAdd.globalCapture')}
      shouldFilter={false}
      loop
      overlayClassName="command-overlay"
      contentClassName="command-dialog"
    >
      <div data-testid="global-quick-capture" className="command-surface frosted-surface">
        <div className="command-input-row">
          <span className="command-leading-icon" aria-hidden="true"><Plus className="size-5" /></span>
          <CommandMenu.Input
            value={input}
            onValueChange={setInput}
            placeholder={t('quickAdd.command.placeholder')}
            aria-label={t('quickAdd.globalCapture')}
            name="global-command"
            autoComplete="off"
            className="command-input"
            data-testid="global-quick-capture-input"
          />
          <kbd className="command-escape">Esc</kbd>
          {mode === 'create' && (
            <Button type="button" size="sm" className="command-submit" onClick={() => { void createTask(); }} disabled={!preview?.title.trim()} data-testid="global-quick-capture-submit">
              {t('quickAdd.add')}
            </Button>
          )}
        </div>

        <div className="command-context-row">
          <span className={`command-mode is-${mode}`}><CommandIcon className="size-3.5" aria-hidden="true" />{modeLabel}</span>
          <span className="command-context-divider" aria-hidden="true" />
          <span>{t('quickAdd.command.inView', { view: currentViewLabel })}</span>
          {selectedTask && <span className="command-selected-task">{t('quickAdd.command.selected', { title: selectedTask.title })}</span>}
        </div>

        {mode === 'create' && (
          <div className="command-quick-fields" aria-label={t('quickAdd.command.planTask')} data-testid="command-quick-fields">
            <div className="command-quick-fields-inner" data-testid={preview ? 'command-preview' : undefined}>
              <span className="command-quick-caption">{t('quickAdd.command.planTask')}</span>
              <label className="command-quick-control is-project">
                <FolderOpen className="size-3.5" aria-hidden="true" />
                <select aria-label="Parsed project" name="quick-add-project" autoComplete="off" value={resolvedEdits.projectId} onChange={event => setEdits(current => ({ ...current, projectId: event.target.value }))}>
                  <option value="">{t('quickAdd.command.noProject')}</option>
                  {resolvedEdits.projectId && !projects.some(project => project.name === resolvedEdits.projectId) && <option value={resolvedEdits.projectId}>{resolvedEdits.projectId}</option>}
                  {projects.map(project => <option key={project.id} value={project.name}>{project.name}</option>)}
                </select>
              </label>
              <span className="command-quick-separator" aria-hidden="true" />
              <div className="command-date-shortcuts" aria-label={t('quickAdd.command.date')}>
                <button type="button" className={resolvedEdits.date === today ? 'is-active' : ''} onClick={() => setEdits(current => ({ ...current, date: today }))}>{t('quickAdd.command.today')}</button>
                <button type="button" className={resolvedEdits.date === tomorrow ? 'is-active' : ''} onClick={() => setEdits(current => ({ ...current, date: tomorrow }))}>{t('quickAdd.command.tomorrow')}</button>
              </div>
              <label className="command-quick-control">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                <input aria-label="Parsed date" name="quick-add-date" autoComplete="off" type="date" value={resolvedEdits.date} onChange={event => setEdits(current => ({ ...current, date: event.target.value }))} />
              </label>
              <label className="command-quick-control">
                <Clock3 className="size-3.5" aria-hidden="true" />
                <input aria-label="Parsed time" name="quick-add-time" autoComplete="off" type="time" value={resolvedEdits.time} onChange={event => {
                  const time = event.target.value;
                  setEdits(current => ({ ...current, time, ...(!resolvedEdits.date && time ? { date: today } : {}) }));
                }} />
              </label>
              <label className="command-quick-control is-priority">
                <Flag className="size-3.5" aria-hidden="true" />
                <select aria-label="Parsed priority" name="quick-add-priority" autoComplete="off" value={resolvedEdits.priority} onChange={event => setEdits(current => ({ ...current, priority: event.target.value }))}>
                  <option value="">{t('quickAdd.command.noPriority')}</option>
                  {[1, 2, 3, 4].map(priority => <option key={priority} value={priority}>P{priority}</option>)}
                </select>
              </label>
              {resolvedEdits.estimateMin && (
                <label className="command-quick-control">
                  <Timer className="size-3.5" aria-hidden="true" />
                  <input aria-label="Parsed estimate" name="quick-add-estimate" autoComplete="off" inputMode="numeric" type="number" min="1" value={resolvedEdits.estimateMin} onChange={event => setEdits(current => ({ ...current, estimateMin: event.target.value }))} />
                  <span>{t('quickAdd.command.minutes')}</span>
                </label>
              )}
            </div>
          </div>
        )}

        <CommandMenu.List className="command-results" data-testid="command-results">
          {input.trim() && !(mode === 'action' && !selectedTask) && <CommandMenu.Empty className="command-empty">{t('quickAdd.command.noResults')}</CommandMenu.Empty>}

          {mode === 'create' && !input.trim() && (
            <CommandMenu.Group heading={t('quickAdd.command.shortcuts')} className="command-group command-welcome">
              <div className="command-welcome-copy">
                <strong>{t('quickAdd.command.emptyTitle')}</strong>
                <span>{t('quickAdd.command.emptyDescription')}</span>
              </div>
              <CommandMenu.Item value="shortcut actions" onSelect={() => setInput('>')} className="command-item command-shortcut-item">
                <span className="command-item-icon"><ListChecks className="size-4" aria-hidden="true" /></span><span className="command-item-copy"><strong>{t('quickAdd.command.actions')}</strong><small>{t('quickAdd.command.actionsHint')}</small></span><kbd>&gt;</kbd>
              </CommandMenu.Item>
              <CommandMenu.Item value="shortcut navigate" onSelect={() => setInput('@')} className="command-item command-shortcut-item">
                <span className="command-item-icon"><AtSign className="size-4" aria-hidden="true" /></span><span className="command-item-copy"><strong>{t('quickAdd.command.navigate')}</strong><small>{t('quickAdd.command.navigateHint')}</small></span><kbd>@</kbd>
              </CommandMenu.Item>
              <CommandMenu.Item value="shortcut search" onSelect={() => setInput('?')} className="command-item command-shortcut-item">
                <span className="command-item-icon"><Search className="size-4" aria-hidden="true" /></span><span className="command-item-copy"><strong>{t('quickAdd.command.search')}</strong><small>{t('quickAdd.command.searchHint')}</small></span><kbd>?</kbd>
              </CommandMenu.Item>
            </CommandMenu.Group>
          )}

          {mode === 'create' && preview && (
            <CommandMenu.Group heading={t('quickAdd.command.createTask')} className="command-group">
              <CommandMenu.Item value={`create ${input}`} onSelect={() => { void createTask(); }} className="command-item">
                <span className="command-item-icon"><CornerDownLeft className="size-4" aria-hidden="true" /></span><span className="command-item-copy"><strong>{t('quickAdd.command.createNamed', { title: preview.title })}</strong></span><kbd>Enter</kbd>
              </CommandMenu.Item>
            </CommandMenu.Group>
          )}

          {mode === 'action' && selectedTask && (
            <CommandMenu.Group heading={t('quickAdd.command.actionsFor', { title: selectedTask.title })} className="command-group">
              {!selectedTask.completedAt && onCompleteTask && (!query || 'complete done finish'.includes(query)) && <CommandMenu.Item value="complete selected task" onSelect={() => { void run(() => onCompleteTask(selectedTask)); }} className="command-item"><Check className="size-4" aria-hidden="true" />{t('quickAdd.command.completeTask')}</CommandMenu.Item>}
              {onScheduleTask && (!query || 'schedule tomorrow calendar plan'.includes(query)) && <CommandMenu.Item value="schedule tomorrow calendar" onSelect={() => { void run(() => onScheduleTask(selectedTask)); }} className="command-item"><CalendarClock className="size-4" aria-hidden="true" />{t('quickAdd.command.scheduleTask')}</CommandMenu.Item>}
              {onMoveTask && projects.filter(project => !query || `move to project ${project.name}`.toLocaleLowerCase().includes(query)).map(project => <CommandMenu.Item key={project.id} value={`move to project ${project.name}`} onSelect={() => { void run(() => onMoveTask(selectedTask, project.id)); }} className="command-item"><FolderOpen className="size-4" aria-hidden="true" />{t('quickAdd.command.moveTo', { project: project.name })}</CommandMenu.Item>)}
              {onAssignTag && tags.filter(tag => !query || `tag ${tag.name}`.toLocaleLowerCase().includes(query)).map(tag => <CommandMenu.Item key={tag.id} value={`tag ${tag.name}`} onSelect={() => { void run(() => onAssignTag(selectedTask, tag.id)); }} className="command-item"><span aria-hidden="true">#</span>{t('quickAdd.command.tagWith', { tag: tag.name })}</CommandMenu.Item>)}
            </CommandMenu.Group>
          )}

          {mode === 'action' && !selectedTask && <CommandMenu.Group heading={t('quickAdd.command.actions')} className="command-group"><div className="command-empty">{t('quickAdd.command.selectFirst')}</div></CommandMenu.Group>}

          {mode === 'navigate' && (
            <>
              <CommandMenu.Group heading={t('quickAdd.command.navigate')} className="command-group">
                {matchingDestinations.map(item => <CommandMenu.Item key={item.view} value={`@${t(item.labelKey)}`} onSelect={() => { void run(() => onNavigate?.(item.view)); }} className="command-item"><ArrowRight className="size-4" aria-hidden="true" />{t(item.labelKey)}</CommandMenu.Item>)}
              </CommandMenu.Group>
              {matchingProjects.length > 0 && <CommandMenu.Group heading={t('quickAdd.command.projects')} className="command-group">{matchingProjects.map(project => <CommandMenu.Item key={project.id} value={`@project ${project.name}`} onSelect={() => { void run(() => onNavigate?.('projects', project.id)); }} className="command-item"><FolderOpen className="size-4" aria-hidden="true" />{project.name}</CommandMenu.Item>)}</CommandMenu.Group>}
            </>
          )}

          {mode === 'search' && (
            <CommandMenu.Group heading={t('quickAdd.command.tasks')} className="command-group">
              {matchingTasks.map(task => <CommandMenu.Item key={task.id} value={`?${task.title}`} onSelect={() => { void run(() => onSelectTask?.(task)); }} className="command-item"><Search className="size-4" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{task.title}</span>{task.description && <span className="max-w-40 truncate text-xs text-muted-foreground">{task.description}</span>}</CommandMenu.Item>)}
            </CommandMenu.Group>
          )}
        </CommandMenu.List>

        <div className="command-footer">
          <span><kbd>{t('quickAdd.command.text')}</kbd>{t('quickAdd.command.mode.create')}</span><span><kbd>&gt;</kbd>{t('quickAdd.command.mode.action')}</span><span><kbd>@</kbd>{t('quickAdd.command.mode.navigate')}</span><span><kbd>?</kbd>{t('quickAdd.command.mode.search')}</span><span className="command-footer-close"><kbd>Esc</kbd>{t('quickAdd.command.close')}</span>
        </div>
      </div>
    </CommandMenu.Dialog>
  );
}
