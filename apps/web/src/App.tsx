import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/AppShell';
import { TaskList } from './components/TaskList';
import { QuickAdd } from './components/QuickAdd';
import { TaskInspectorBoundary as TaskInspector } from './components/TaskInspectorBoundary';
import { TaskSideRail } from './components/TaskSideRail';
import { CreateProjectDialog } from './components/CreateProjectDialog';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { SyncCenter } from './components/SyncCenter';
import { GlobalQuickCapture } from './components/GlobalQuickCapture';
import { NotificationPermissionPrompt } from './components/NotificationPermissionPrompt';
import { UndoToast, type UndoToastState } from './components/UndoToast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Onboarding } from './pages/Onboarding';
import { LandingPage } from './pages/LandingPage';
import { LegalPage } from './pages/LegalPage';
import { useAuth } from './hooks/useAuth';
import { useTasks, useProjects, useTags, useNotes, useCountdowns, useGCalEvents, useSummaryTasks, useSettings } from './hooks/useApi';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { initSync, destroySync } from './lib/sync/engine';
import { cn } from './lib/utils';
import { createQuickAddReminder } from './features/tasks/quick-add-reminder';
import { countVisibleTasks, selectCalendarTaskViews } from './features/tasks/app-task-views';
import { isTaskDetailPath, routeToView, viewToRoute } from './lib/app-routing';
import type { SidebarView } from './hooks/useApi';
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

export default function App() {
  const { t } = useTranslation();
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
  const showAuthPage = useCallback((nextPage: 'login' | 'register') => {
    setPage(nextPage);
    const target = nextPage === 'login' ? '/login' : '/register';
    if (window.location.pathname !== target) window.history.pushState({}, '', target);
  }, []);
  const initialRoute = routeToView(window.location.pathname);
  const [sidebarView, setSidebarView] = useState<SidebarView>(initialRoute.view);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(initialRoute.projectId);
  const [routeTaskId, setRouteTaskId] = useState<string | undefined>(initialRoute.taskId);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [currentTagId, setCurrentTagId] = useState<string | undefined>();
  const { tasks, loading: tasksLoading, error: taskError, addTask, updateTask, moveTask, completeTask, completePomodoro, reopenTask, deleteTask, restoreTask, refetch: refetchTasks } = useTasks(sidebarView, Boolean(user), currentProjectId, currentTagId);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [colorPreview, setColorPreview] = useState<{ id: string; color: string } | null>(null);
  useEffect(() => { setColorPreview(null); }, [selectedTask?.id]);
  const [calendarDraft, setCalendarDraft] = useState<{ date: string; time?: string } | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const isXl = useXlBreakpoint();
  // Sub-tasks are hidden from the main list — they're managed in the detail panel.
  const visibleTaskCount = useMemo(() => countVisibleTasks(tasks, sidebarView), [sidebarView, tasks]);
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
  } = useProjects(Boolean(user));
  const { tags, createTag, refetch: refetchTags } = useTags(Boolean(user));
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

  // Compute sidebar counts
  const [counts, setCounts] = useState({ inbox: 0, today: 0, next7: 0, overdue: 0, completed: 0 });

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('/task-counts', { headers })
      .then(r => r.json())
      .then(body => {
        if (body.success) {
          setCounts(body.data);
        }
      })
      .catch(() => {});
  }, [user, tasks]);

  useEffect(() => {
    if (user || loading) return;
    const syncAuthPage = () => {
      setPage(window.location.pathname === '/register' ? 'register' : 'login');
    };
    syncAuthPage();
    window.addEventListener('popstate', syncAuthPage);
    return () => window.removeEventListener('popstate', syncAuthPage);
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    if (['/', '/login', '/register'].includes(window.location.pathname)) {
      window.history.replaceState({}, '', '/today');
    }
    const onPopState = () => {
      const route = routeToView(window.location.pathname);
      setSidebarView(route.view);
      setCurrentProjectId(route.projectId);
      setRouteTaskId(route.taskId);
      setCurrentTagId(undefined);
      setSelectedTask(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  useEffect(() => {
    if (!routeTaskId || tasksLoading) return;
    const task = tasks.find(item => item.id === routeTaskId);
    setSelectedTask(task || null);
    setRouteTaskId(undefined);
    if (!task) window.history.replaceState({}, '', '/tasks');
  }, [routeTaskId, tasks, tasksLoading]);

  useEffect(() => {
    if (!currentProjectId || projectsLoading || !projectsLoaded) return;
    if (!projects.some(project => project.id === currentProjectId)) {
      setCurrentProjectId(undefined);
      setSidebarView('projects');
      window.history.replaceState({}, '', '/projects');
    }
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
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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

  const handleAdd = useCallback(async (parsed: ParsedQuickAdd) => {
    // "#project-name" from Quick Add resolves to a real project by
    // case-insensitive name match; falls back to the current project view
    // (previous behavior) when there's no mention or no match.
    const matchedProject = parsed.projectId
      ? projects.find(p => p.name.toLowerCase() === parsed.projectId!.toLowerCase())
      : undefined;

    const task = await addTask({
      title: parsed.title,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      durationMin: parsed.durationMin,
      projectId: matchedProject?.id ?? currentProjectId,
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
        window.history.replaceState({}, '', '/tasks');
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

  const handleCalendarCreate = useCallback((date: string, time?: string) => {
    setCalendarDraft({ date, time });
  }, []);

  const handleCalendarSubmit = useCallback(async (title: string) => {
    if (!calendarDraft) return;
    await addTask({
      title,
      dueDate: calendarDraft.date,
      dueTime: calendarDraft.time || null,
    } as CreateTaskRequest);
  }, [addTask, calendarDraft]);

  const quickAddRef = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);

  useKeyboardShortcuts({
    onQuickAdd: () => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="quick-add"] input');
      input?.focus();
    },
    onEscape: () => {
      if (selectedTask) setSelectedTask(null);
      else if (selectedNote) setSelectedNote(null);
    },
    onToggleComplete: () => {
      if (selectedTask && !selectedTask.completedAt) {
        void handleToggle(selectedTask);
        setSelectedTask(null);
      }
    },
    onDelete: () => {
      if (selectedTask) {
        void handleDeleteTask(selectedTask.id);
      }
    },
  });

  const handleSidebarSelect = useCallback((view: SidebarView, projectId?: string, tagId?: string) => {
    setSidebarView(view);
    setCurrentProjectId(projectId);
    setCurrentTagId(tagId);
    setSelectedTask(null);
    setRouteTaskId(undefined);
    const target = viewToRoute(view, projectId);
    if (`${window.location.pathname}${window.location.search}` !== target) window.history.pushState({}, '', target);
  }, []);

  // Task URLs make a selected detail shareable/reloadable without replacing
  // the existing view state while the user is working. Closing a detail that
  // originated from a deep link uses browser history, preserving Back/Forward.
  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task);
    const target = `/tasks/${task.id}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (isTaskDetailPath(window.location.pathname)) {
      const returnRoute = window.history.state?.mindoistReturnRoute || '/tasks';
      window.history.replaceState({ mindoistReturnRoute: returnRoute }, '', target);
    } else {
      window.history.pushState({ mindoistReturnRoute: current }, '', target);
    }
  }, []);

  const handleCloseTask = useCallback(() => {
    setSelectedTask(null);
    if (!isTaskDetailPath(window.location.pathname)) return;
    const returnRoute = window.history.state?.mindoistReturnRoute as string | undefined;
    if (returnRoute) window.history.back();
    else {
      setSidebarView('all');
      window.history.replaceState({}, '', '/tasks');
    }
  }, []);

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
  const { countdowns, loading: countdownsLoading, error: countdownsError, addCountdown, updateCountdown, deleteCountdown } = useCountdowns(Boolean(user) && (isCountdownView || isCalendarView));
  const { hiddenNavItems, updateHiddenNavItems, pomodoroWorkMinutes, pomodoroBreakMinutes, updatePomodoroDurations, workHoursPerDay, updateWorkHoursPerDay } = useSettings(Boolean(user));

  const handleConnectGoogle = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('/gcal/auth-url', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.success) window.open(body.data.url, '_blank');
  }, []);

  const [gcalConnected, setGcalConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/gcal/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(body => { if (body.success) setGcalConnected(body.data.connected); })
      .catch(() => {});
  }, [user]);

  const publicPath = window.location.pathname;
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

  return (
    <>
    <SyncCenter />
    <NotificationPermissionPrompt userId={user.id} />
    <GlobalQuickCapture onAdd={handleAdd} />
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
      onMoveProject={handleMoveProject}
      onCreateTag={name => createTag({ name }).then(() => {})}
      viewTitle={viewTitle}
      contentWide={isSummaryView || Boolean(currentProject) || isCalendarView || isCountdownView || isSettingsView || isAdminView || usesTaskRail}
      hiddenNavItems={hiddenNavItems}
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
            hiddenNavItems={hiddenNavItems}
            onUpdateHiddenNavItems={updateHiddenNavItems}
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
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[24rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
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
      ) : currentProject ? (
        <div className="flex min-w-0 gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3">
              <QuickAdd onAdd={handleAdd} />
            </div>
            <ProjectWorkspace
              project={currentProject}
              tasks={tasks}
              tags={tags}
              loading={tasksLoading}
              error={taskError}
              onRetry={refetchTasks}
              onSelectTask={handleSelectTask}
              onMoveTask={handleMoveTask}
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
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[24rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
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
              />
            </div>
          </div>
          {selectedTask && (
            <aside className="hidden xl:flex sticky top-0 z-10 h-[calc(100vh-2rem)] w-[24rem] shrink-0 flex-col overflow-hidden pl-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
                <AnimatePresence mode="wait">
                  <TaskInspector
                    key={selectedTask.id}
                    rail
                    task={selectedTask}
                    projects={projects}
                    tags={tags}
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
      ) : isTrashedView ? (
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
              selectedTaskId={selectedTask?.id}
              onRestore={handleRestoreTask}
            />
          </div>
          {isXl && (
            <TaskSideRail
              tasks={tasks}
              selectedTask={selectedTask}
              projects={projects}
              tags={tags}
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
      ) : isExportView ? (
        <div className="mx-auto max-w-4xl py-6 px-4">
          <h2 className="text-2xl font-semibold m-0 mb-5">{viewTitle}</h2>
          <ExportView />
        </div>
      ) : (
        <div className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1">
            {(['all', 'inbox', 'next7'] as SidebarView[]).includes(sidebarView) && (
              <nav className="mb-4 flex w-full max-w-md rounded-control border border-border bg-card p-1" aria-label={t('tasks:workspace.taskViews')}>
                {([
                  ['inbox', 'workspace.inbox'],
                  ['next7', 'workspace.upcoming'],
                  ['all', 'workspace.all'],
                ] as const).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    aria-current={sidebarView === view ? 'page' : undefined}
                    className={cn(
                      'min-h-11 min-w-0 flex-1 rounded-control px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      sidebarView === view && 'bg-accent font-semibold text-foreground',
                    )}
                    onClick={() => handleSidebarSelect(view)}
                  >
                    {t(`tasks:${label}`)}
                  </button>
                ))}
              </nav>
            )}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold m-0">{viewTitle}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {visibleTaskCount === 1 ? t('tasks:list.taskCountOne') : t('tasks:list.taskCount', { count: visibleTaskCount })}
                </p>
              </div>
            </div>
            <div className="mb-3">
              <QuickAdd onAdd={handleAdd} />
            </div>
            <TaskList
              tasks={tasks}
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
              selectedTaskId={selectedTask?.id}
            />
          </div>
          {isXl && (
            <TaskSideRail
              tasks={tasks}
              selectedTask={selectedTask}
              projects={projects}
              tags={tags}
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
    <CreateTaskDialog
      open={Boolean(calendarDraft)}
      date={calendarDraft?.date}
      time={calendarDraft?.time}
      onClose={() => setCalendarDraft(null)}
      onCreate={handleCalendarSubmit}
    />
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
