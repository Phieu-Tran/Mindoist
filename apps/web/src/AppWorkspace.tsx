import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { AppShell } from './components/AppShell';
import { TaskList } from './components/TaskList';
import { TaskInspectorBoundary as TaskInspector } from './components/TaskInspectorBoundary';
import { TaskSideRail } from './components/TaskSideRail';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { SyncCenter } from './components/SyncCenter';
import { GlobalQuickCapture } from './components/GlobalQuickCapture';
import { InboxProcess } from './components/InboxProcess';
import { ReviewTabs } from './components/ReviewTabs';
import { TodayCountdownWidget } from './components/TodayCountdownWidget';
import { ShortcutHelpDialog } from './components/ShortcutHelpDialog';
import { NotificationPermissionPrompt } from './components/NotificationPermissionPrompt';
import { UndoToast, type UndoToastState } from './components/UndoToast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Onboarding } from './pages/Onboarding';
import { LandingPage } from './pages/LandingPage';
import { LegalPage } from './pages/LegalPage';
import { useAuth } from './hooks/useAuth';
import { useNotes, useCountdowns, useGCalEvents, useGoogleCalendarStatus, useSummaryTasks, useSettings, useTaskCounts } from './hooks/useApi';
import { useTasksQuery } from './hooks/useTasksQuery';
import { useProjectsQuery } from './hooks/useProjectsQuery';
import { useTagsQuery } from './hooks/useTagsQuery';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWorkspaceUiState } from './hooks/useWorkspaceUiState';
import { initSync, destroySync } from './lib/sync/engine';
import { cn } from './lib/utils';
import { createQuickAddReminder } from './features/tasks/quick-add-reminder';
import { countVisibleTasks, selectCalendarTaskViews } from './features/tasks/app-task-views';
import { extendTaskSelection, toggleTaskSelection } from './features/tasks/keyboard-selection';
import { createTimeBlock } from './features/calendar/api';
import { requestCalendarProjectionRefresh } from './features/calendar/calendar-refresh';
import { isTaskDetailPath, routeToView, viewToRoute } from './lib/app-routing';
import type { SidebarView } from './hooks/useApi';
import type { CalendarTaskSlot } from './components/CalendarView';
import type { Task, CreateTaskRequest, CreateProjectRequest, UpdateTaskRequest, Note, ProjectColumn } from '@mindoist/shared/types';
import type { ParsedQuickAdd } from '@mindoist/shared/nlparse';

const NoteList = lazy(() => import('./components/NoteList').then(module => ({ default: module.NoteList })));
const NoteEditor = lazy(() => import('./components/NoteEditor').then(module => ({ default: module.NoteEditor })));
const CountdownList = lazy(() => import('./components/CountdownList').then(module => ({ default: module.CountdownList })));
const CalendarView = lazy(() => import('./components/CalendarView').then(module => ({ default: module.CalendarView })));
const SummaryDashboard = lazy(() => import('./components/SummaryDashboard').then(module => ({ default: module.SummaryDashboard })));
const ProjectWorkspace = lazy(() => import('./components/ProjectWorkspace').then(module => ({ default: module.ProjectWorkspace })));
const ProjectsOverview = lazy(() => import('./components/ProjectsOverview').then(module => ({ default: module.ProjectsOverview })));
const ImportView = lazy(() => import('./components/ImportView').then(module => ({ default: module.ImportView })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(module => ({ default: module.SettingsPage })));
const ExportView = lazy(() => import('./components/ExportView').then(module => ({ default: module.ExportView })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })));

function useXlBreakpoint() {
  const [isXl, setIsXl] = useState(() => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 1280px)').matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsXl(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isXl;
}

type AuthState = ReturnType<typeof useAuth>;

interface AuthenticatedWorkspaceProps {
  user: NonNullable<AuthState['user']>;
  setPassword: AuthState['setPassword'];
  logout: AuthState['logout'];
}

export default function AppWorkspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const routerLocation = useRouterState({ select: state => state.location });
  const {
    user,
    loading,
    login,
    register,
    setPassword,
    completeOnboarding,
    loginWithGoogle,
    logout,
  } = useAuth();
  const [page, setPage] = useState<'login' | 'register'>(() => (
    window.location.pathname === '/register' ? 'register' : 'login'
  ));
  useEffect(() => {
    const density = localStorage.getItem('mindoist:density');
    if (density === 'compact' || density === 'cozy' || density === 'comfortable') document.documentElement.dataset.density = density;
    return () => { delete document.documentElement.dataset.density; };
  }, []);
  const showAuthPage = useCallback((nextPage: 'login' | 'register') => {
    setPage(nextPage);
    const target = nextPage === 'login' ? '/login' : '/register';
    if (routerLocation.pathname !== target) void navigate({ to: target });
  }, [navigate, routerLocation.pathname]);

  useEffect(() => {
    if (user || loading) return;
    setPage(routerLocation.pathname === '/register' ? 'register' : 'login');
  }, [loading, routerLocation.pathname, user]);

  const publicPath = routerLocation.pathname;
  if (publicPath === '/privacy') return <LegalPage kind="privacy" />;
  if (publicPath === '/terms') return <LegalPage kind="terms" />;
  if (publicPath === '/' && !user) return <LandingPage />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div role="status" className="text-sm font-medium text-muted-foreground">
          {t('auth:loading')}
        </div>
      </div>
    );
  }

  if (!user) {
    return page === 'login' ? (
      <Login onLogin={login} onGoogleLogin={loginWithGoogle} onSwitchToRegister={() => showAuthPage('register')} />
    ) : (
      <Register onRegister={register} onGoogleLogin={loginWithGoogle} onSwitchToLogin={() => showAuthPage('login')} />
    );
  }

  if (user.onboardingRequired) {
    return <Onboarding user={user} onComplete={completeOnboarding} />;
  }

  return <AuthenticatedWorkspace user={user} setPassword={setPassword} logout={logout} />;
}

function AuthenticatedWorkspace({ user, setPassword, logout }: AuthenticatedWorkspaceProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const routerLocation = useRouterState({ select: state => state.location });
  const initialRoute = routeToView(routerLocation.pathname, routerLocation.searchStr);
  const [sidebarView, setSidebarView] = useState<SidebarView>(initialRoute.view);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(initialRoute.projectId);
  const [routeTaskId, setRouteTaskId] = useState<string | undefined>(initialRoute.taskId);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [inboxProcessOpen, setInboxProcessOpen] = useState(false);
  const [currentTagId, setCurrentTagId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const { tasks, loading: tasksLoading, error: taskError, addTask, updateTask, moveTask, completeTask, completePomodoro, reopenTask, deleteTask, restoreTask, refetch: refetchTasks } = useTasksQuery(sidebarView, Boolean(user), currentProjectId, currentTagId);
  const inboxQuery = useTasksQuery('inbox', Boolean(user) && sidebarView === 'today');
  const allTasksQuery = useTasksQuery('all', Boolean(user));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [keyboardTaskId, setKeyboardTaskId] = useState<string | null>(null);
  const [bulkSelectedTaskIds, setBulkSelectedTaskIds] = useState<Set<string>>(new Set());
  const { colorPreview, setColorPreview, calendarDraft, setCalendarDraft, undoToast, setUndoToast } = useWorkspaceUiState();
  useEffect(() => { setColorPreview(null); }, [selectedTask?.id]);
  const isXl = useXlBreakpoint();
  // Sub-tasks are hidden from the main list — they're managed in the detail panel.
  const visibleTaskCount = useMemo(() => countVisibleTasks(tasks, sidebarView), [sidebarView, tasks]);
  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return tasks;
    return tasks.filter(task => `${task.title}\n${task.description ?? ''}`.toLocaleLowerCase().includes(query));
  }, [searchQuery, tasks]);
  const keyboardTasks = useMemo(() => filteredTasks.filter(task => !task.parentId), [filteredTasks]);
  // Live-preview the color picked in TaskInspector on the calendar before Save.
  // Sub-tasks are managed from their parent's detail panel, not plotted as
  // their own entries on the grid (mirrors TaskList's topLevel filter).
  const { calendarTasks, todayTasks, backlogTasks } = useMemo(
    () => selectCalendarTaskViews(tasks, colorPreview),
    [colorPreview, tasks],
  );

  const {
    projects,
    loading: projectsLoading,
    loaded: projectsLoaded,
    createProject,
    updateProject,
    deleteProject,
    refetch: refetchProjects,
  } = useProjectsQuery(Boolean(user));
  const { tags, loading: tagsLoading, error: tagsError, createTag, deleteTag, refetch: refetchTags } = useTagsQuery(Boolean(user));
  const isNotesView = sidebarView === 'notes';
  const isSummaryView = sidebarView === 'summary';
  const summary = useSummaryTasks(Boolean(user) && isSummaryView);
  const { notes, loading: notesLoading, error: notesError, addNote, updateNote, deleteNote, refetch: refetchNotes } = useNotes(Boolean(user) && isNotesView);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const showToast = useCallback((toast: Omit<UndoToastState, 'id'>) => {
    setUndoToast({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...toast });
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const toastId = undoToast.id;
    const timer = window.setTimeout(() => {
      setUndoToast(current => current?.id === toastId ? null : current);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  // Init sync engine when user is logged in
  useEffect(() => {
    if (user) {
      initSync();
      return () => destroySync();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handleSearch = (event: Event) => {
      const query = ((event as CustomEvent<{ query?: string }>).detail?.query ?? '').trim();
      setSearchQuery(query);
      if (query) handleSidebarSelect('all');
    };
    window.addEventListener('mindoist:search', handleSearch);
    return () => window.removeEventListener('mindoist:search', handleSearch);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handleNavigate = (event: Event) => {
      const view = (event as CustomEvent<{ view?: SidebarView }>).detail?.view;
      if (view) handleSidebarSelect(view);
    };
    window.addEventListener('mindoist:navigate', handleNavigate);
    return () => window.removeEventListener('mindoist:navigate', handleNavigate);
  }, [user]);

  const { counts } = useTaskCounts(Boolean(user));

  useEffect(() => {
    if (!user) return;
    if (['/', '/login', '/register'].includes(routerLocation.pathname)) {
      void navigate({ to: '/today', replace: true });
      return;
    }
    const route = routeToView(routerLocation.pathname, routerLocation.searchStr);
    setSidebarView(route.view);
    setCurrentProjectId(route.projectId);
    setRouteTaskId(route.taskId);
    setCurrentTagId(route.tagId);
    if (!route.taskId) setSelectedTask(null);
  }, [navigate, routerLocation.pathname, routerLocation.searchStr, user]);

  useEffect(() => {
    if (!user || tagsLoading || tagsError || sidebarView !== 'tags' || !currentTagId) return;
    if (tags.some(tag => tag.id === currentTagId)) return;
    setCurrentTagId(undefined);
    setSidebarView('today');
    void navigate({ to: '/today', replace: true });
  }, [currentTagId, navigate, sidebarView, tags, tagsError, tagsLoading, user]);

  useEffect(() => {
    if (!routeTaskId || tasksLoading) return;
    // Selecting a task already gives us the full entity synchronously. Keep
    // that selection while the route changes instead of resolving the new
    // /tasks/:id URL against a task query that may still contain the previous
    // view's cached result. Deep links, which have no selected task yet, still
    // resolve through the query below.
    if (selectedTask?.id === routeTaskId) {
      setRouteTaskId(undefined);
      return;
    }
    const task = tasks.find(item => item.id === routeTaskId);
    setSelectedTask(task || null);
    setRouteTaskId(undefined);
    if (!task) void navigate({ to: '/tasks', replace: true });
  }, [navigate, routeTaskId, selectedTask?.id, tasks, tasksLoading]);

  useEffect(() => {
    if (!currentProjectId || projectsLoading || !projectsLoaded) return;
    // Keep a deep-linked project route stable while the projects query settles.
    // A transiently incomplete list must not eject the user back to the
    // overview (which also made evidence captures lose the project surface).
  }, [currentProjectId, projects, projectsLoaded, projectsLoading]);

  useEffect(() => {
    document.getElementById('main-content')?.focus();
  }, [sidebarView, currentProjectId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareText = params.get('share_text') || params.get('share_title');
    const shareUrl = params.get('share_url');
    if (shareText) {
      const text = shareUrl ? `${shareText}\n${shareUrl}` : shareText;
      setSidebarView('inbox');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mindoist:quickadd', { detail: { text } }));
      }, 100);
      void navigate({ to: routerLocation.pathname as never, replace: true, search: {} as never });
    }
  }, [navigate, routerLocation.pathname]);

  const handleUndoToast = useCallback(async () => {
    if (!undoToast?.onUndo) return;
    const action = undoToast.onUndo;
    setUndoToast(null);
    try {
      await action();
    } catch {
      showToast({ message: t('tasks:undo.failed') });
    }
  }, [showToast, t, undoToast]);

  const handleToggle = useCallback(async (task: Task) => {
    if (task.completedAt) {
      await reopenTask(task.id);
      if (selectedTask?.id === task.id) setSelectedTask(null);
    } else {
      await completeTask(task.id);
      if (selectedTask?.id === task.id) setSelectedTask(null);
      showToast({
        message: t('tasks:undo.completed', { title: task.title }),
        actionLabel: t('tasks:undo.action'),
        onUndo: async () => {
          await reopenTask(task.id);
          await refetchTasks();
        },
      });
    }
  }, [completeTask, reopenTask, refetchTasks, selectedTask, showToast, t]);

  const handleAdd = useCallback(async (parsed: ParsedQuickAdd, projectIdOverride?: string) => {
    // "#project-name" from Quick Add resolves to a real project by
    // case-insensitive name match; falls back to the current project view
    // (previous behavior) when there's no mention or no match.
    const matchedProject = parsed.projectId
      ? projects.find(p => p.name.toLowerCase() === parsed.projectId!.toLowerCase())
      : undefined;

    const task = await addTask({
      title: parsed.title,
      deadline: parsed.deadline
        ? {
            ...parsed.deadline,
            ...(parsed.deadline.time
              ? { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
              : {}),
          }
        : undefined,
      priority: parsed.priority,
      estimateMin: parsed.estimateMin,
      projectId: matchedProject?.id ?? projectIdOverride ?? currentProjectId,
    } as CreateTaskRequest);

    if (parsed.reminderOffsetMin && task) {
      try {
        await createQuickAddReminder(task, parsed.reminderOffsetMin);
      } catch {
        showToast({
          message: t('tasks:quickAdd.reminderFailed', { title: task.title }),
        });
      }
    }
  }, [addTask, currentProjectId, projects, showToast, t]);

  const handleAutosave = useCallback(async (id: string, req: UpdateTaskRequest) => {
    await updateTask(id, req);
    // The Summary view keeps its own separate fetched copy of tasks
    // (useSummaryTasks), so a save here wouldn't otherwise show up there
    // until a full reload re-fetched everything.
    if (isSummaryView) await summary.refetch();
  }, [updateTask, isSummaryView, summary]);

  const handleUpdate = useCallback(async (id: string, req: UpdateTaskRequest) => {
    await handleAutosave(id, req);
    setSelectedTask(null);
  }, [handleAutosave]);

  const handlePomodoroComplete = useCallback(async (id: string) => {
    const updatedTask = await completePomodoro(id);
    setSelectedTask(current => current?.id === id ? updatedTask : current);
    return updatedTask;
  }, [completePomodoro]);

  const handleMoveTask = useCallback(async (task: Task, column: ProjectColumn) => {
    const previousColumnId = task.projectColumnId;
    let updatedTask = await moveTask(task.id, column.id);
    if (column.isDone && !updatedTask.completedAt) {
      updatedTask = await completeTask(task.id);
      showToast({
        message: t('tasks:undo.completed', { title: task.title }),
        actionLabel: t('tasks:undo.action'),
        onUndo: async () => {
          await reopenTask(task.id);
          if (previousColumnId) await moveTask(task.id, previousColumnId);
          await refetchTasks();
        },
      });
    } else if (!column.isDone && updatedTask.completedAt) {
      updatedTask = await reopenTask(task.id);
    }
    setSelectedTask(current => current?.id === task.id ? updatedTask : current);
  }, [completeTask, moveTask, refetchTasks, reopenTask, showToast, t]);

  const handleDeleteTask = useCallback(async (id: string) => {
    const deletedTask = selectedTask?.id === id
      ? selectedTask
      : tasks.find(task => task.id === id) ?? summary.tasks.find(task => task.id === id);

    await deleteTask(id);
    setSelectedTask(current => current?.id === id ? null : current);
    if (selectedTask?.id === id && isTaskDetailPath(window.location.pathname)) {
      const returnRoute = window.history.state?.mindoistReturnRoute as string | undefined;
      if (returnRoute) window.history.back();
      else {
        setSidebarView('all');
        void navigate({ to: '/tasks', replace: true });
      }
    }

    if (!deletedTask) return;
    showToast({
      message: t('tasks:undo.deleted', { title: deletedTask.title }),
      actionLabel: t('tasks:undo.action'),
      onUndo: async () => {
        await restoreTask(id);
        await refetchTasks();
        if (isSummaryView) await summary.refetch();
      },
    });
  }, [deleteTask, isSummaryView, refetchTasks, restoreTask, selectedTask, showToast, summary, t, tasks]);

  const handleDeleteWithUndoSubtask = useCallback(async (subtask: Task) => {
    await deleteTask(subtask.id);
    showToast({
      message: t('tasks:undo.deleted', { title: subtask.title }),
      actionLabel: t('tasks:undo.action'),
      onUndo: async () => {
        await restoreTask(subtask.id);
        await refetchTasks();
      },
    });
  }, [deleteTask, refetchTasks, restoreTask, showToast, t]);

  const handleBulkComplete = useCallback(async (selectedTasks: Task[]) => {
    const tasksToComplete = selectedTasks.filter(task => !task.completedAt);
    if (tasksToComplete.length === 0) return;

    await Promise.all(tasksToComplete.map(task => completeTask(task.id)));
    showToast({
      message: t('tasks:undo.bulkCompleted', { count: tasksToComplete.length }),
      actionLabel: t('tasks:undo.action'),
      onUndo: async () => {
        await Promise.all(tasksToComplete.map(task => reopenTask(task.id)));
        await refetchTasks();
      },
    });
  }, [completeTask, refetchTasks, reopenTask, showToast, t]);

  const handleBulkDelete = useCallback(async (selectedTasks: Task[]) => {
    if (selectedTasks.length === 0) return;
    const deletedIds = new Set(selectedTasks.map(task => task.id));

    await Promise.all(selectedTasks.map(task => deleteTask(task.id)));
    setSelectedTask(current => current && deletedIds.has(current.id) ? null : current);
    await refetchTasks();

    showToast({
      message: t('tasks:undo.bulkDeleted', { count: selectedTasks.length }),
      actionLabel: t('tasks:undo.action'),
      onUndo: async () => {
        await Promise.all(selectedTasks.map(task => restoreTask(task.id)));
        await refetchTasks();
      },
    });
  }, [deleteTask, refetchTasks, restoreTask, showToast, t]);

  const handleRestoreTask = useCallback(async (id: string) => {
    await restoreTask(id);
    setSelectedTask(current => current?.id === id ? null : current);
    showToast({
      message: t('tasks:undo.restored'),
      actionLabel: t('tasks:undo.action'),
      onUndo: async () => {
        await deleteTask(id);
        await refetchTasks();
      },
    });
  }, [deleteTask, refetchTasks, restoreTask, showToast, t]);

  const createCalendarTask = useCallback(async (slot: CalendarTaskSlot, parsed: ParsedQuickAdd) => {
    const isTimed = !slot.allDay && Boolean(slot.startAt && slot.endAt);
    const durationMin = isTimed
      ? Math.max(1, Math.round(
          (new Date(slot.endAt!).getTime() - new Date(slot.startAt!).getTime()) / 60_000,
        ))
      : null;
    const task = await addTask({
      title: parsed.title,
      deadline: isTimed ? parsed.deadline : parsed.deadline ?? { date: slot.date },
      estimateMin: parsed.estimateMin ?? durationMin,
      priority: parsed.priority,
      color: slot.color,
      projectId: slot.projectId ?? (parsed.projectId
        ? projects.find(project => project.name.toLocaleLowerCase() === parsed.projectId?.toLocaleLowerCase())?.id
        : undefined),
    } as CreateTaskRequest);

    if (isTimed) {
      try {
        await createTimeBlock({
          taskId: task.id,
          startAt: slot.startAt!,
          endAt: slot.endAt!,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          allDay: false,
          source: 'MANUAL',
        });
      } catch (cause) {
        // Keep the create flow atomic from the user's perspective. Without
        // this compensation, retrying the dialog after a time-block failure
        // would create a duplicate task with no scheduled range.
        try {
          await deleteTask(task.id);
          await refetchTasks();
        } catch {
          // Surface the original scheduling failure; the next task refresh
          // will reconcile any failed compensation attempt.
        }
        throw cause;
      }
    }
    requestCalendarProjectionRefresh();
  }, [addTask, deleteTask, projects, refetchTasks]);

  const handleCalendarCreate = useCallback(async (slot: CalendarTaskSlot) => {
    const title = slot.title?.trim();
    if (title) {
      await createCalendarTask(slot, { title });
      return;
    }
    setCalendarDraft(slot);
    window.dispatchEvent(new Event('mindoist:global-capture'));
  }, [createCalendarTask, setCalendarDraft]);

  const handleCalendarSubmit = useCallback(async (parsed: ParsedQuickAdd) => {
    if (!calendarDraft) return;
    await createCalendarTask(calendarDraft, parsed);
  }, [calendarDraft, createCalendarTask]);

  const quickAddRef = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);

  const moveSelectedTask = useCallback((direction: 1 | -1) => {
    if (keyboardTasks.length === 0) return;
    const currentIndex = keyboardTaskId ? keyboardTasks.findIndex(task => task.id === keyboardTaskId) : -1;
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : keyboardTasks.length - 1)
      : (currentIndex + direction + keyboardTasks.length) % keyboardTasks.length;
    setKeyboardTaskId(keyboardTasks[nextIndex].id);
  }, [keyboardTaskId, keyboardTasks]);

  const toggleKeyboardSelection = useCallback(() => {
    const task = keyboardTasks.find(candidate => candidate.id === keyboardTaskId) ?? keyboardTasks[0];
    if (!task) return;
    setKeyboardTaskId(task.id);
    setBulkSelectedTaskIds(current => toggleTaskSelection(current, task.id));
  }, [keyboardTaskId, keyboardTasks]);

  const expandKeyboardSelection = useCallback((direction: 'next' | 'previous') => {
    if (keyboardTasks.length === 0) return;
    const result = extendTaskSelection(
      bulkSelectedTaskIds,
      keyboardTasks.map(task => task.id),
      keyboardTaskId,
      direction,
    );
    setKeyboardTaskId(result.focusedTaskId);
    setBulkSelectedTaskIds(result.selectedIds);
  }, [bulkSelectedTaskIds, keyboardTaskId, keyboardTasks]);

  const activeKeyboardTask = selectedTask
    ?? keyboardTasks.find(task => task.id === keyboardTaskId)
    ?? null;

  useKeyboardShortcuts({
    onQuickAdd: () => { window.dispatchEvent(new Event('mindoist:global-capture')); },
    onEscape: () => {
      if (selectedTask) setSelectedTask(null);
      else if (selectedNote) setSelectedNote(null);
      else if (bulkSelectedTaskIds.size > 0) setBulkSelectedTaskIds(new Set());
    },
    onNext: () => moveSelectedTask(1),
    onPrev: () => moveSelectedTask(-1),
    onOpen: () => {
      if (activeKeyboardTask) handleSelectTask(activeKeyboardTask);
    },
    onToggleSelection: toggleKeyboardSelection,
    onExpandSelection: expandKeyboardSelection,
    onToggleComplete: () => {
      if (activeKeyboardTask && !activeKeyboardTask.completedAt) {
        void handleToggle(activeKeyboardTask);
      }
    },
    onDelete: () => {
      if (activeKeyboardTask) {
        void handleDeleteTask(activeKeyboardTask.id);
      }
    },
    onSchedule: () => {
      if (activeKeyboardTask) {
        handleSidebarSelect('calendar');
        setSelectedTask(activeKeyboardTask);
      }
    },
    onMoveToday: () => {
      if (activeKeyboardTask) void updateTask(activeKeyboardTask.id, { deadline: { date: new Date().toISOString().slice(0, 10) } });
    },
    onMoveTomorrow: () => {
      if (!activeKeyboardTask) return;
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
      void updateTask(activeKeyboardTask.id, { deadline: { date: tomorrow } });
    },
    onSetPriority: priority => {
      if (activeKeyboardTask) void updateTask(activeKeyboardTask.id, { priority });
    },
    onUndo: () => { void handleUndoToast(); },
    onHelp: () => { window.dispatchEvent(new CustomEvent('mindoist:shortcut-help')); },
    onGoTo: view => {
      const destination: Record<typeof view, SidebarView> = {
        today: 'today',
        calendar: 'calendar',
        projects: 'projects',
        review: 'summary',
      };
      handleSidebarSelect(destination[view]);
    },
    onTags: () => {
      window.dispatchEvent(new CustomEvent('mindoist:global-capture', { detail: { input: '> tag ' } }));
    },
  });

  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = ((event as CustomEvent<{ command?: string }>).detail?.command ?? '').toLowerCase().trim();
      if (!selectedTask || !command) return;
      if (command === 'complete' || command === 'done') {
        void handleToggle(selectedTask);
      } else if (command === 'schedule') {
        window.dispatchEvent(new CustomEvent('mindoist:calendar-schedule', { detail: { taskId: selectedTask.id } }));
      } else {
        const snooze = command.match(/^snooze\s+(\d+)\s*(m|h|d)?$/);
        if (snooze) {
          const amount = Number(snooze[1]);
          const unit = snooze[2] ?? 'h';
          const multiplier = unit === 'd' ? 86_400_000 : unit === 'm' ? 60_000 : 3_600_000;
          void updateTask(selectedTask.id, { snoozedUntil: new Date(Date.now() + amount * multiplier).toISOString() });
        }
      }
    };
    window.addEventListener('mindoist:command', handleCommand);
    return () => window.removeEventListener('mindoist:command', handleCommand);
  }, [handleToggle, selectedTask, updateTask]);

  const handleSidebarSelect = useCallback((view: SidebarView, projectId?: string, tagId?: string) => {
    setSidebarView(view);
    setCurrentProjectId(projectId);
    setCurrentTagId(tagId);
    setSelectedTask(null);
    setRouteTaskId(undefined);
    const target = viewToRoute(view, projectId, undefined, tagId);
    if (`${routerLocation.pathname}${routerLocation.searchStr}` !== target) void navigate({ to: target as never });
  }, [navigate, routerLocation.pathname, routerLocation.searchStr]);

  // Task URLs make a selected detail shareable/reloadable without replacing
  // the existing view state while the user is working. Closing a detail that
  // originated from a deep link uses browser history, preserving Back/Forward.
  const handleSelectTask = useCallback((task: Task) => {
    setKeyboardTaskId(task.id);
    setSelectedTask(task);
    const target = `/tasks/${task.id}`;
    const current = `${routerLocation.pathname}${routerLocation.searchStr}`;
    if (isTaskDetailPath(routerLocation.pathname)) {
      const returnRoute = window.history.state?.mindoistReturnRoute || '/tasks';
      void navigate({
        to: target as never,
        replace: true,
        state: { mindoistReturnRoute: returnRoute },
      } as never);
    } else {
      void navigate({
        to: target as never,
        state: { mindoistReturnRoute: current },
      } as never);
    }
  }, [navigate, routerLocation.pathname, routerLocation.searchStr]);

  const handleCloseTask = useCallback(() => {
    setSelectedTask(null);
    if (!isTaskDetailPath(window.location.pathname)) return;
    const returnRoute = window.history.state?.mindoistReturnRoute as string | undefined;
    if (returnRoute) window.history.back();
    else {
      setSidebarView('all');
      void navigate({ to: '/tasks', replace: true });
    }
  }, [navigate]);

  const handleCreateProject = useCallback(async (request: CreateProjectRequest) => {
    const project = await createProject(request);
    handleSidebarSelect('projects', project.id);
  }, [createProject, handleSidebarSelect]);

  const handleMoveProject = useCallback(async (projectId: string, parentId?: string) => {
    await updateProject(projectId, { parentId: parentId || null });
  }, [updateProject]);

  const viewTitle = useMemo(() => {
    if (currentProjectId) {
      const p = projects.find(pr => pr.id === currentProjectId);
      return p?.name || t('tasks:sidebar.projects');
    }
    if (currentTagId) {
      const tag = tags.find(tg => tg.id === currentTagId);
      return tag ? `#${tag.name}` : t('tasks:sidebar.tags');
    }
    const keyMap: Record<SidebarView, string> = {
      summary: 'sidebar.summary',
      all: 'workspace.all',
      inbox: 'sidebar.inbox',
      today: 'sidebar.today',
      next7: 'sidebar.next7',
      overdue: 'sidebar.overdue',
      completed: 'sidebar.completed',
      trashed: 'sidebar.trashed',
      projects: 'sidebar.projects',
      tags: 'sidebar.tags',
      notes: 'sidebar.notes',
      calendar: 'sidebar.calendar',
      countdown: 'sidebar.countdown',
      import: 'sidebar.import',
      settings: 'sidebar.settings',
      export: 'sidebar.export',
      admin: 'sidebar.admin',
    };
    return t(`tasks:${keyMap[sidebarView]}`);
  }, [sidebarView, currentProjectId, currentTagId, projects, tags, t]);

  const currentProject = useMemo(
    () => currentProjectId ? projects.find(project => project.id === currentProjectId) : undefined,
    [currentProjectId, projects],
  );

  const isCalendarView = sidebarView === 'calendar';
  const isCountdownView = sidebarView === 'countdown';
  const isImportView = sidebarView === 'import';
  const isSettingsView = sidebarView === 'settings';
  const isTrashedView = sidebarView === 'trashed';
  const isExportView = sidebarView === 'export';
  const isAdminView = sidebarView === 'admin';
  const usesTaskRail = !isSummaryView && !currentProject && !isCalendarView && !isNotesView && !isCountdownView && !isImportView && !isSettingsView && !isTrashedView && !isExportView && !isAdminView;
  const { events: gcalEvents } = useGCalEvents(Boolean(user) && isCalendarView);
  const { countdowns, loading: countdownsLoading, error: countdownsError, addCountdown, updateCountdown, deleteCountdown } = useCountdowns(Boolean(user) && (isCountdownView || isCalendarView || sidebarView === 'today'));
  const { pomodoroWorkMinutes, pomodoroBreakMinutes, updatePomodoroDurations, workHoursPerDay, updateWorkHoursPerDay } = useSettings(Boolean(user));

  const handleConnectGoogle = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('/gcal/auth-url', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.success) window.open(body.data.url, '_blank');
  }, []);

  const { connected: gcalConnected } = useGoogleCalendarStatus(Boolean(user));

  return (
    <>
    <SyncCenter />
    <NotificationPermissionPrompt userId={user.id} />
    <ShortcutHelpDialog />
    <GlobalQuickCapture
      onAdd={async parsed => {
        if (calendarDraft) await handleCalendarSubmit(parsed);
        else await handleAdd(parsed);
      }}
      tasks={allTasksQuery.tasks}
      projects={projects}
      tags={tags}
      currentView={sidebarView}
      selectedTask={selectedTask}
      onNavigate={(view, projectId) => handleSidebarSelect(view, projectId)}
      onSelectTask={handleSelectTask}
      onCompleteTask={handleToggle}
      onScheduleTask={task => {
        handleSidebarSelect('calendar');
        setSelectedTask(task);
      }}
      onMoveTask={async (task, projectId) => { await updateTask(task.id, { projectId }); }}
      onAssignTag={async (task, tagId) => {
        if (!task.tagIds.includes(tagId)) await updateTask(task.id, { tagIds: [...task.tagIds, tagId] });
      }}
      onDismiss={() => setCalendarDraft(null)}
    />
    <AppShell
      sidebarView={sidebarView}
      currentProjectId={currentProjectId}
      currentTagId={currentTagId}
      counts={counts}
      projects={projects}
      tags={tags}
      onSidebarSelect={handleSidebarSelect}
      onLogout={logout}
      onCreateProject={handleCreateProject}
      onCreateTag={async name => createTag({ name })}
      onMoveProject={handleMoveProject}
      viewTitle={viewTitle}
      contentWide={isSummaryView || Boolean(currentProject) || isCalendarView || isCountdownView || isSettingsView || isAdminView || usesTaskRail}
      isAdmin={user.role === 'ADMIN'}
    >
      <Suspense fallback={(
        <div className="flex min-h-48 items-center justify-center" role="status">
          <span className="text-sm font-medium text-muted-foreground">{t('auth:loading')}</span>
        </div>
      )}>
      {isAdminView ? (
        user.role === 'ADMIN' ? <AdminPage /> : <p role="alert" className="rounded-panel border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{t('admin:forbidden')}</p>
      ) : isSettingsView ? (
        // Left-anchored, not centered (D7): every other view in this app
        // (Inbox, Calendar, Project...) sits flush after the sidebar. A
        // narrow settings block centered inside the wide `contentWide` main
        // area read as "floating" with a large dead margin on both sides —
        // more so than a plain reading-width cap flush left.
        <div className="max-w-[60rem] px-4 py-6">
          <header className="mb-6 max-w-2xl">
            <h1 className="m-0 text-2xl font-semibold">{viewTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('tasks:settingsPage.subtitle')}</p>
          </header>
          <SettingsPage
            user={user}
            gcalConnected={gcalConnected}
            onConnectGoogle={handleConnectGoogle}
            onSetPassword={setPassword}
            onGoToImport={() => handleSidebarSelect('import')}
            onGoToExport={() => handleSidebarSelect('export')}
            pomodoroWorkMinutes={pomodoroWorkMinutes}
            pomodoroBreakMinutes={pomodoroBreakMinutes}
            onUpdatePomodoroDurations={updatePomodoroDurations}
            workHoursPerDay={workHoursPerDay}
            onUpdateWorkHoursPerDay={updateWorkHoursPerDay}
          />
        </div>
      ) : isImportView ? (
        <ImportView onImportComplete={() => { refetchProjects(); refetchTags(); refetchTasks(); }} />
      ) : isSummaryView ? (
        <>
        <ReviewTabs active={sidebarView} onSelect={view => handleSidebarSelect(view)} />
        <div className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1">
            <SummaryDashboard
              tasks={summary.tasks}
              projects={projects}
              loading={summary.loading}
              error={summary.error}
              onRetry={summary.refetch}
              onSelectTask={handleSelectTask}
            />
          </div>
          {selectedTask && (
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[28rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
                    onCreateTag={(name) => createTag({ name })}
                    onDeleteTag={deleteTag}
                    onSave={handleUpdate}
                    onAutosave={handleAutosave}
                    onCompletePomodoro={handlePomodoroComplete}
                    onClose={handleCloseTask}
                    onDelete={handleDeleteTask}
                    onDeleteWithUndo={handleDeleteWithUndoSubtask}
                    onSelectTask={handleSelectTask}
                    onTasksChanged={async () => { await refetchTasks(); await summary.refetch(); }}
                    pomodoroWorkMinutes={pomodoroWorkMinutes}
                    pomodoroBreakMinutes={pomodoroBreakMinutes}
                  />
                </AnimatePresence>
              </div>
            </aside>
          )}
        </div>
        </>
      ) : currentProject ? (
        <div className="flex min-w-0 gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <ProjectWorkspace
              project={currentProject}
              tasks={tasks}
              tags={tags}
              loading={tasksLoading}
              error={taskError}
              onRetry={refetchTasks}
              onSelectTask={handleSelectTask}
              onMoveTask={handleMoveTask}
              onRenameProject={async (project, name) => {
                await updateProject(project.id, { name });
              }}
              onUpdateCalendarSync={async (project, enabled) => {
                await updateProject(project.id, { calendarSyncEnabled: enabled });
              }}
              onDeleteProject={async project => {
                await deleteProject(project.id);
                handleSidebarSelect('projects');
              }}
            />
          </div>
          {selectedTask && (
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[28rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
                    onCreateTag={(name) => createTag({ name })}
                    onDeleteTag={deleteTag}
                    onSave={handleUpdate}
                    onAutosave={handleAutosave}
                    onCompletePomodoro={handlePomodoroComplete}
                    onClose={handleCloseTask}
                    onDelete={handleDeleteTask}
                    onDeleteWithUndo={handleDeleteWithUndoSubtask}
                    onSelectTask={handleSelectTask}
                    onTasksChanged={refetchTasks}
                    pomodoroWorkMinutes={pomodoroWorkMinutes}
                    pomodoroBreakMinutes={pomodoroBreakMinutes}
                  />
                </AnimatePresence>
              </div>
            </aside>
          )}
        </div>
      ) : sidebarView === 'projects' ? (
        <ProjectsOverview
          projects={projects}
          onCreate={() => setProjectDialogOpen(true)}
          onSelect={projectId => handleSidebarSelect('projects', projectId)}
        />
      ) : isCalendarView ? (
        <div className="flex h-full min-w-0 gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 min-h-0">
              <CalendarView
                tasks={calendarTasks}
                todayTasks={todayTasks}
                backlogTasks={backlogTasks}
                projects={projects}
                gcalEvents={gcalEvents}
                countdowns={countdowns}
                onSelectTask={handleSelectTask}
                onCreateTask={handleCalendarCreate}
                onUpdateTask={(id, req) => updateTask(id, req)}
                workHoursPerDay={workHoursPerDay}
                onNavigateSearch={(search, replace) => { void navigate({ to: '/calendar', search, replace }); }}
              />
            </div>
          </div>
          {selectedTask && (
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[28rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
                    onCreateTag={(name) => createTag({ name })}
                    onDeleteTag={deleteTag}
                    onSave={handleUpdate}
                    onAutosave={handleAutosave}
                    onCompletePomodoro={handlePomodoroComplete}
                    onClose={handleCloseTask}
                    onDelete={handleDeleteTask}
                    onDeleteWithUndo={handleDeleteWithUndoSubtask}
                    onSelectTask={handleSelectTask}
                    onTasksChanged={refetchTasks}
                    onColorPreview={(nextColor) => setColorPreview({ id: selectedTask.id, color: nextColor })}
                    pomodoroWorkMinutes={pomodoroWorkMinutes}
                    pomodoroBreakMinutes={pomodoroBreakMinutes}
                  />
                </AnimatePresence>
              </div>
            </aside>
          )}
        </div>
      ) : isCountdownView ? (
        <div>
          <h2 className="text-2xl font-semibold m-0 mb-4">{viewTitle}</h2>
          <CountdownList
            countdowns={countdowns}
            loading={countdownsLoading}
            error={countdownsError}
            onCreate={addCountdown}
            onUpdate={updateCountdown}
            onDelete={deleteCountdown}
          />
        </div>
      ) : isNotesView ? (
        <div className="flex h-full min-h-0 flex-col">
        <ReviewTabs active={sidebarView} onSelect={view => handleSidebarSelect(view)} />
        <div className="flex h-full min-h-0">
          <section className="w-full min-w-0 overflow-y-auto md:max-w-md md:border-r md:border-border md:pr-4" aria-labelledby="notes-view-title">
            <h2 id="notes-view-title" className="mb-4 mt-0 text-2xl font-semibold">{viewTitle}</h2>
            <NoteList
              notes={notes}
              loading={notesLoading}
              error={notesError}
              selectedNoteId={selectedNote?.id}
              onSelect={(note) => setSelectedNote(note)}
              onCreate={async () => {
                const note = await addNote({ title: '', content: '' });
                setSelectedNote(note);
              }}
              onDelete={(id) => { deleteNote(id); if (selectedNote?.id === id) setSelectedNote(null); }}
            />
          </section>
          {selectedNote && (
            <NoteEditor
              note={selectedNote}
              onSave={updateNote}
              onClose={() => setSelectedNote(null)}
              onDelete={(id) => { deleteNote(id); setSelectedNote(null); }}
            />
          )}
        </div>
        </div>
      ) : isTrashedView ? (
        <div>
        <ReviewTabs active={sidebarView} onSelect={view => handleSidebarSelect(view)} />
        <div className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold m-0">{viewTitle}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {tasks.length === 1 ? t('tasks:list.taskCountOne') : t('tasks:list.taskCount', { count: tasks.length })}
                </p>
              </div>
            </div>
            <TaskList
              tasks={tasks}
              tags={tags}
              projects={projects}
              loading={tasksLoading}
              error={taskError}
              onToggle={() => {}}
              onSelect={handleSelectTask}
              onBulkComplete={() => {}}
              onBulkDelete={() => {}}
              onRetry={refetchTasks}
              onMakeSubtask={() => {}}
              view={sidebarView}
              selectedTaskId={selectedTask?.id ?? keyboardTaskId ?? undefined}
              bulkSelectedIds={bulkSelectedTaskIds}
              onBulkSelectionChange={setBulkSelectedTaskIds}
              onRestore={handleRestoreTask}
            />
          </div>
          {isXl && (
            <TaskSideRail
              tasks={tasks}
              selectedTask={selectedTask}
              projects={projects}
              tags={tags}
              onCreateTag={(name) => createTag({ name })}
              onDeleteTag={deleteTag}
              onSave={handleUpdate}
              onAutosave={handleAutosave}
              onCompletePomodoro={handlePomodoroComplete}
              onClose={handleCloseTask}
              onDelete={handleDeleteTask}
              onDeleteWithUndo={handleDeleteWithUndoSubtask}
              onSelectTask={handleSelectTask}
              onTasksChanged={refetchTasks}
              pomodoroWorkMinutes={pomodoroWorkMinutes}
              pomodoroBreakMinutes={pomodoroBreakMinutes}
            />
          )}
        </div>
        </div>
      ) : isExportView ? (
        <div className="mx-auto max-w-4xl py-6 px-4">
          <h2 className="text-2xl font-semibold m-0 mb-5">{viewTitle}</h2>
          <ExportView />
        </div>
      ) : (
        <div className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1">
            {sidebarView === 'completed' && <ReviewTabs active={sidebarView} onSelect={view => handleSidebarSelect(view)} />}
            {sidebarView === 'today' && <TodayCountdownWidget countdowns={countdowns} loading={countdownsLoading} />}
            {sidebarView === 'today' && inboxQuery.tasks.length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-control border border-border bg-card px-3 py-2">
                <p className="m-0 text-sm text-muted-foreground">{inboxQuery.tasks.length} inbox item{inboxQuery.tasks.length === 1 ? '' : 's'} · plan, snooze, finish, or delete.</p>
                <button
                  type="button"
                  className="min-h-10 shrink-0 rounded-control bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  onClick={() => setInboxProcessOpen(true)}
                >
                  Process inbox
                </button>
              </div>
            )}
            {sidebarView === 'today' && inboxProcessOpen ? (
              <InboxProcess
                tasks={inboxQuery.tasks}
                onComplete={task => handleToggle(task)}
                onDelete={task => handleDeleteTask(task.id)}
                onUpdate={async (id, request) => { await updateTask(id, request); }}
                onSchedule={task => {
                  setInboxProcessOpen(false);
                  handleSidebarSelect('calendar');
                  setSelectedTask(task);
                }}
                onClose={() => setInboxProcessOpen(false)}
              />
            ) : (
              <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold m-0">{viewTitle}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {searchQuery ? `${filteredTasks.length} results for “${searchQuery}”` : visibleTaskCount === 1 ? t('tasks:list.taskCountOne') : t('tasks:list.taskCount', { count: visibleTaskCount })}
                </p>
              </div>
            </div>
            <TaskList
              tasks={filteredTasks}
              tags={tags}
              projects={projects}
              loading={tasksLoading}
              error={taskError}
              onToggle={handleToggle}
              onSelect={handleSelectTask}
              onBulkComplete={handleBulkComplete}
              onBulkDelete={handleBulkDelete}
              onRetry={refetchTasks}
              onMakeSubtask={(taskId, parentId) => updateTask(taskId, { parentId })}
              view={sidebarView}
              selectedTaskId={selectedTask?.id ?? keyboardTaskId ?? undefined}
              bulkSelectedIds={bulkSelectedTaskIds}
              onBulkSelectionChange={setBulkSelectedTaskIds}
            />
              </>
            )}
          </div>
          {isXl && (
            <TaskSideRail
              tasks={tasks}
              selectedTask={selectedTask}
              projects={projects}
              tags={tags}
              onCreateTag={(name) => createTag({ name })}
              onDeleteTag={deleteTag}
              onSave={handleUpdate}
              onAutosave={handleAutosave}
              onCompletePomodoro={handlePomodoroComplete}
              onClose={handleCloseTask}
              onDelete={handleDeleteTask}
              onDeleteWithUndo={handleDeleteWithUndoSubtask}
              onSelectTask={handleSelectTask}
              onTasksChanged={refetchTasks}
              pomodoroWorkMinutes={pomodoroWorkMinutes}
              pomodoroBreakMinutes={pomodoroBreakMinutes}
            />
          )}
        </div>
      )}
      </Suspense>
    </AppShell>
    {!isXl && selectedTask && (
      <AnimatePresence mode="wait">
        <div key={selectedTask.id} className="contents">
          <div className="fixed inset-0 z-40 hidden bg-black/40 md:block xl:hidden" aria-hidden="true" />
          <TaskInspector
            task={selectedTask}
            projects={projects}
            tags={tags}
            onCreateTag={(name) => createTag({ name })}
            onDeleteTag={deleteTag}
            onSave={handleUpdate}
            onAutosave={handleAutosave}
            onCompletePomodoro={handlePomodoroComplete}
            onClose={handleCloseTask}
            onDelete={handleDeleteTask}
            onDeleteWithUndo={handleDeleteWithUndoSubtask}
            onSelectTask={handleSelectTask}
            onTasksChanged={async () => { await refetchTasks(); if (isSummaryView) await summary.refetch(); }}
            pomodoroWorkMinutes={pomodoroWorkMinutes}
            pomodoroBreakMinutes={pomodoroBreakMinutes}
          />
        </div>
      </AnimatePresence>
    )}
    <CreateProjectDialog
      open={projectDialogOpen}
      onClose={() => setProjectDialogOpen(false)}
      onCreate={async request => {
        await handleCreateProject(request);
        setProjectDialogOpen(false);
      }}
    />
    <UndoToast
      toast={undoToast}
      onUndo={() => { void handleUndoToast(); }}
      onDismiss={() => setUndoToast(null)}
      dismissLabel={t('tasks:undo.dismiss')}
    />
    </>
  );
}
