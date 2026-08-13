import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { QueryClient, QueryClientContext, useMutation, useQuery } from '@tanstack/react-query';
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectColumn,
  CreateProjectColumnRequest,
  UpdateProjectColumnRequest,
  Tag,
  CreateTagRequest,
  UpdateTagRequest,
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  Countdown,
  CreateCountdownRequest,
  UpdateCountdownRequest,
} from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import {
  completeTask as completeTaskRequest,
  completeTaskPomodoro,
  createTask,
  deleteTask as deleteTaskRequest,
  listTasks,
  moveTask as moveTaskRequest,
  reopenTask as reopenTaskRequest,
  restoreTask as restoreTaskRequest,
  updateTask as updateTaskRequest,
} from '@/features/tasks/api';

export type SidebarView = 'summary' | 'all' | 'inbox' | 'today' | 'next7' | 'overdue' | 'completed' | 'trashed' | 'projects' | 'tags' | 'notes' | 'calendar' | 'countdown' | 'import' | 'settings' | 'export' | 'admin';

export interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
}

function useResourceQueryClient() {
  const contextClient = useContext(QueryClientContext);
  const [localClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  }));
  return contextClient ?? localClient;
}

function mergeTaskResponse(current: Task | undefined, response: Task): Task {
  return {
    ...current,
    ...response,
    tagIds: response.tagIds ?? current?.tagIds ?? [],
  } as Task;
}

export function useTasks(view: SidebarView, enabled: boolean, projectId?: string, tagId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mutationRevisionRef = useRef(0);
  const fetchSequenceRef = useRef(0);

  const commitTaskMutation = useCallback((update: (current: Task[]) => Task[]) => {
    mutationRevisionRef.current += 1;
    setTasks(update);
  }, []);

  const fetchTasks = useCallback(async () => {
    const requestId = ++fetchSequenceRef.current;
    if (!enabled) {
      setTasks([]);
      setError(null);
      setLoading(false);
      return;
    }

    const mutationRevision = mutationRevisionRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listTasks({ view, projectId, tagId });
      if (requestId === fetchSequenceRef.current && mutationRevision === mutationRevisionRef.current) {
        setTasks(data);
      }
    } catch (e) {
      if (requestId === fetchSequenceRef.current && mutationRevision === mutationRevisionRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load tasks');
        setTasks([]);
      }
    } finally {
      if (requestId === fetchSequenceRef.current) setLoading(false);
    }
  }, [enabled, view, projectId, tagId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const addTask = async (req: CreateTaskRequest) => {
    try {
      const task = await createTask(req);
      const normalizedTask = mergeTaskResponse(undefined, task);
      commitTaskMutation(prev => [...prev, normalizedTask]);
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add task');
      throw e;
    }
  };

  const updateTask = async (id: string, req: UpdateTaskRequest) => {
    try {
      const task = await updateTaskRequest(id, req);
      const normalizedTask = mergeTaskResponse(tasks.find(t => t.id === id), task);
      commitTaskMutation(prev => prev.map(t => t.id === id ? normalizedTask : t));
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task');
      throw e;
    }
  };

  const completeTask = async (id: string) => {
    try {
      const task = await completeTaskRequest(id);
      const normalizedTask = mergeTaskResponse(tasks.find(t => t.id === id), task);
      commitTaskMutation(prev => prev.map(t => t.id === id ? normalizedTask : t));
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete task');
      throw e;
    }
  };

  const moveTask = async (id: string, columnId: string, order?: number) => {
    try {
      const movedTask = await moveTaskRequest(id, columnId, order);
      const currentTask = tasks.find(item => item.id === id);
      const normalizedTask = mergeTaskResponse(currentTask, movedTask);
      commitTaskMutation(previous => previous.map(item => item.id === id ? normalizedTask : item));
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move task');
      throw e;
    }
  };

  const completePomodoro = async (id: string) => {
    try {
      const task = await completeTaskPomodoro(id);
      const normalizedTask = mergeTaskResponse(tasks.find(t => t.id === id), task);
      commitTaskMutation(prev => prev.map(t => t.id === id ? normalizedTask : t));
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete Pomodoro');
      throw e;
    }
  };

  const reopenTask = async (id: string) => {
    try {
      const task = await reopenTaskRequest(id);
      const normalizedTask = mergeTaskResponse(tasks.find(t => t.id === id), task);
      commitTaskMutation(prev => prev.map(t => t.id === id ? normalizedTask : t));
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen task');
      throw e;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteTaskRequest(id);
      commitTaskMutation(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task');
      throw e;
    }
  };

  const restoreTask = async (id: string) => {
    try {
      const task = await restoreTaskRequest(id);
      const normalizedTask = mergeTaskResponse(tasks.find(t => t.id === id), task);
      commitTaskMutation(prev => prev.some(t => t.id === id)
        ? prev.map(t => t.id === id ? normalizedTask : t)
        : [...prev, normalizedTask]);
      return normalizedTask;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore task');
      throw e;
    }
  };

  return { tasks, loading, error, addTask, updateTask, moveTask, completeTask, completePomodoro, reopenTask, deleteTask, restoreTask, refetch: fetchTasks };
}

export function useSummaryTasks(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const query = useQuery({
    queryKey: queryKeys.summary('all'),
    enabled,
    queryFn: async () => {
      const [active, completed] = await Promise.all([
        apiFetch<Task[]>('/tasks'),
        apiFetch<Task[]>('/tasks?filter=completed'),
      ]);
      const unique = new Map([...active, ...completed].map(task => [task.id, task]));
      return Array.from(unique.values());
    },
  }, queryClient);
  return {
    tasks: enabled ? query.data ?? [] : [],
    loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load summary' : null,
    refetch: query.refetch,
  };
}

export interface TaskCounts {
  inbox: number;
  today: number;
  next7: number;
  overdue: number;
  completed: number;
}

const EMPTY_TASK_COUNTS: TaskCounts = { inbox: 0, today: 0, next7: 0, overdue: 0, completed: 0 };

export function useTaskCounts(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const query = useQuery({
    queryKey: queryKeys.taskCounts(),
    enabled,
    queryFn: () => apiFetch<TaskCounts>('/task-counts'),
  }, queryClient);
  return { counts: enabled ? query.data ?? EMPTY_TASK_COUNTS : EMPTY_TASK_COUNTS, loading: enabled && query.isPending };
}

export function useProjects(enabled = true) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!enabled) {
      setProjects([]);
      setLoading(false);
      setLoaded(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      setProjects(await apiFetch<Project[]>('/projects'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async (request: CreateProjectRequest) => {
    const project = await apiFetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    setProjects(previous => [...previous, project]);
    return project;
  };

  const updateProject = async (id: string, request: UpdateProjectRequest) => {
    const project = await apiFetch<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    setProjects(previous => previous.map(item => item.id === id ? project : item));
    return project;
  };

  const deleteProject = async (id: string) => {
    await apiFetch<void>(`/projects/${id}`, { method: 'DELETE' });
    setProjects(previous => previous.filter(item => item.id !== id));
  };

  return { projects, loading, loaded, error, createProject, updateProject, deleteProject, refetch: fetchProjects };
}

export function useProjectColumns(projectId?: string) {
  const queryClient = useResourceQueryClient();
  const key = queryKeys.projectColumns(projectId);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(projectId),
    queryFn: () => apiFetch<ProjectColumn[]>(`/projects/${projectId}/columns`),
  }, queryClient);
  const createMutation = useMutation({ mutationFn: async (request: CreateProjectColumnRequest) => {
    if (!projectId) throw new Error('Project is required');
    return apiFetch<ProjectColumn>(`/projects/${projectId}/columns`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, onSuccess: column => queryClient.setQueryData<ProjectColumn[]>(key, previous => [...(previous ?? []), column].sort((a, b) => a.sortOrder - b.sortOrder)) }, queryClient);
  const updateMutation = useMutation({ mutationFn: async ({ id, request }: { id: string; request: UpdateProjectColumnRequest }) => {
    if (!projectId) throw new Error('Project is required');
    return apiFetch<ProjectColumn>(`/projects/${projectId}/columns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
  }, onSuccess: column => queryClient.setQueryData<ProjectColumn[]>(key, previous => (previous ?? []).map(item => item.id === column.id ? column : item).sort((a, b) => a.sortOrder - b.sortOrder)) }, queryClient);
  const deleteMutation = useMutation({ mutationFn: async (id: string) => {
    if (!projectId) throw new Error('Project is required');
    await apiFetch<void>(`/projects/${projectId}/columns/${id}`, { method: 'DELETE' });
    return id;
  }, onSuccess: id => queryClient.setQueryData<ProjectColumn[]>(key, previous => (previous ?? []).filter(item => item.id !== id)) }, queryClient);
  return {
    columns: projectId ? query.data ?? [] : [],
    loading: Boolean(projectId) && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load project columns' : null,
    createColumn: (request: CreateProjectColumnRequest) => createMutation.mutateAsync(request),
    updateColumn: (id: string, request: UpdateProjectColumnRequest) => updateMutation.mutateAsync({ id, request }),
    deleteColumn: (id: string) => deleteMutation.mutateAsync(id).then(() => undefined),
    refetch: query.refetch,
  };
}

export function useTags(enabled: boolean) {
  const [tags, setTags] = useState<Tag[]>([]);
  const fetchTags = useCallback(() => {
    // Unlike useNotes/useCountdowns, this had no enabled gate at all - it
    // fired on every mount regardless of auth state, including on the
    // login screen with no token yet, which is what actually produced the
    // "Missing token" 401 seen while debugging the split-domain deploy.
    if (!enabled) { setTags([]); return; }
    apiFetch<Tag[]>('/tags').then(setTags).catch(() => {});
  }, [enabled]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  const createTag = async (req: CreateTagRequest): Promise<Tag> => {
    const tag = await apiFetch<Tag>('/tags', { method: 'POST', body: JSON.stringify(req) });
    setTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  };

  const updateTag = async (id: string, req: UpdateTagRequest): Promise<void> => {
    const updated = await apiFetch<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(req) });
    setTags(prev => prev.map(t => t.id === id ? updated : t).sort((a, b) => a.name.localeCompare(b.name)));
  };

  const deleteTag = async (id: string): Promise<void> => {
    await apiFetch<void>(`/tags/${id}`, { method: 'DELETE' });
    setTags(prev => prev.filter(t => t.id !== id));
  };

  return { tags, createTag, updateTag, deleteTag, refetch: fetchTags };
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function useNotes(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const key = queryKeys.notes();
  const query = useQuery({ queryKey: key, enabled, queryFn: () => apiFetch<Note[]>(`${API_BASE}/notes`) }, queryClient);
  const addMutation = useMutation({ mutationFn: (req: CreateNoteRequest) => apiFetch<Note>(`${API_BASE}/notes`, {
      method: 'POST',
      body: JSON.stringify(req),
    }), onSuccess: note => queryClient.setQueryData<Note[]>(key, previous => [note, ...(previous ?? [])]) }, queryClient);
  const updateMutation = useMutation({ mutationFn: ({ id, req }: { id: string; req: UpdateNoteRequest }) => apiFetch<Note>(`${API_BASE}/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    }), onSuccess: note => queryClient.setQueryData<Note[]>(key, previous => (previous ?? []).map(item => item.id === note.id ? note : item)) }, queryClient);
  const deleteMutation = useMutation({ mutationFn: async (id: string) => {
    await apiFetch<void>(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
    return id;
  }, onSuccess: id => queryClient.setQueryData<Note[]>(key, previous => (previous ?? []).filter(item => item.id !== id)) }, queryClient);
  return {
    notes: enabled ? query.data ?? [] : [], loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to fetch notes' : null,
    addNote: (req: CreateNoteRequest) => addMutation.mutateAsync(req),
    updateNote: (id: string, req: UpdateNoteRequest) => updateMutation.mutateAsync({ id, req }).then(() => undefined),
    deleteNote: (id: string) => deleteMutation.mutateAsync(id).then(() => undefined),
    refetch: query.refetch,
  };
}

export function useCountdowns(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const key = queryKeys.countdowns();
  const query = useQuery({ queryKey: key, enabled, queryFn: () => apiFetch<Countdown[]>(`${API_BASE}/countdowns`) }, queryClient);
  const addMutation = useMutation({ mutationFn: (req: CreateCountdownRequest) => apiFetch<Countdown>(`${API_BASE}/countdowns`, {
      method: 'POST',
      body: JSON.stringify(req),
    }), onSuccess: countdown => queryClient.setQueryData<Countdown[]>(key, previous => [...(previous ?? []), countdown]) }, queryClient);
  const updateMutation = useMutation({ mutationFn: ({ id, req }: { id: string; req: UpdateCountdownRequest }) => apiFetch<Countdown>(`${API_BASE}/countdowns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    }), onSuccess: countdown => queryClient.setQueryData<Countdown[]>(key, previous => (previous ?? []).map(item => item.id === countdown.id ? countdown : item)) }, queryClient);
  const deleteMutation = useMutation({ mutationFn: async (id: string) => {
    await apiFetch<void>(`${API_BASE}/countdowns/${id}`, { method: 'DELETE' });
    return id;
  }, onSuccess: id => queryClient.setQueryData<Countdown[]>(key, previous => (previous ?? []).filter(item => item.id !== id)) }, queryClient);
  return {
    countdowns: enabled ? query.data ?? [] : [], loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to fetch countdowns' : null,
    addCountdown: (req: CreateCountdownRequest) => addMutation.mutateAsync(req),
    updateCountdown: (id: string, req: UpdateCountdownRequest) => updateMutation.mutateAsync({ id, req }).then(() => undefined),
    deleteCountdown: (id: string) => deleteMutation.mutateAsync(id).then(() => undefined),
    refetch: query.refetch,
  };
}

export function useGCalEvents(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const query = useQuery({ queryKey: queryKeys.googleCalendarEvents(), enabled, queryFn: () => apiFetch<GCalEvent[]>(`${API_BASE}/gcal/events`) }, queryClient);
  return { events: enabled ? query.data ?? [] : [], loading: enabled && query.isPending };
}

export function useGoogleCalendarStatus(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const query = useQuery({
    queryKey: queryKeys.googleCalendarStatus(),
    enabled,
    queryFn: () => apiFetch<{ connected: boolean }>(`${API_BASE}/gcal/status`),
  }, queryClient);
  return { connected: query.data?.connected ?? false, loading: enabled && query.isPending };
}

// ---------------------------------------------------------------------------
// Google Drive Backup
// ---------------------------------------------------------------------------

export interface BackupFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export function useDriveBackups(enabled: boolean) {
  const queryClient = useResourceQueryClient();
  const key = queryKeys.driveBackups();
  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: () => apiFetch<BackupFile[]>(`${API_BASE}/drive/backups`),
  }, queryClient);
  const createMutation = useMutation({
    mutationFn: async (): Promise<{
      fileId: string;
      fileName: string;
      sizeBytes: number;
      exportedAt: string;
    }> => apiFetch(`${API_BASE}/drive/backup`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  }, queryClient);
  const restoreMutation = useMutation({
    mutationFn: (fileId: string): Promise<{
      tasks: number;
      projects: number;
      tags: number;
      notes: number;
    }> => apiFetch(`${API_BASE}/drive/restore/${fileId}`, { method: 'POST' }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes() }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['summary'] }),
    ]),
  }, queryClient);
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => apiFetch<void>(`${API_BASE}/drive/backup/${fileId}`, { method: 'DELETE' }),
    onSuccess: (_result, fileId) => {
      queryClient.setQueryData<BackupFile[]>(key, current => current?.filter(backup => backup.fileId !== fileId) ?? []);
    },
  }, queryClient);

  const createBackup = useCallback(async (): Promise<{
    fileId: string;
    fileName: string;
    sizeBytes: number;
  }> => createMutation.mutateAsync(), [createMutation]);

  const restoreBackup = useCallback(async (fileId: string): Promise<{
    tasks: number;
    projects: number;
    tags: number;
    notes: number;
  }> => restoreMutation.mutateAsync(fileId), [restoreMutation]);

  const deleteBackup = useCallback(async (fileId: string): Promise<void> => {
    await deleteMutation.mutateAsync(fileId);
  }, [deleteMutation]);

  return {
    backups: enabled ? query.data ?? [] : [],
    loading: enabled && query.isPending,
    createBackup,
    restoreBackup,
    deleteBackup,
    refetch: query.refetch,
  };
}

export function useSettings(enabled: boolean) {
  type SettingsData = { pomodoroWorkMinutes: number; pomodoroBreakMinutes: number; workHoursPerDay: number; timeZone: string | null };
  const queryClient = useResourceQueryClient();
  const key = queryKeys.settings();
  const query = useQuery({ queryKey: key, enabled, queryFn: () => apiFetch<SettingsData>('/settings') }, queryClient);
  const settings = query.data;
  useEffect(() => {
    if (!enabled || !settings) return;
    const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detectedTimeZone && detectedTimeZone !== settings.timeZone) {
      apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ timeZone: detectedTimeZone }) }).catch(() => {});
    }
  }, [enabled, settings]);

  const updatePomodoroDurations = useCallback(async (work: number, brk: number) => {
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ pomodoroWorkMinutes: work, pomodoroBreakMinutes: brk }) });
    queryClient.setQueryData<SettingsData>(key, current => ({ pomodoroWorkMinutes: work, pomodoroBreakMinutes: brk, workHoursPerDay: current?.workHoursPerDay ?? 8, timeZone: current?.timeZone ?? null }));
  }, [queryClient]);

  const updateWorkHoursPerDay = useCallback(async (hours: number) => {
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ workHoursPerDay: hours }) });
    queryClient.setQueryData<SettingsData>(key, current => ({ pomodoroWorkMinutes: current?.pomodoroWorkMinutes ?? 25, pomodoroBreakMinutes: current?.pomodoroBreakMinutes ?? 5, workHoursPerDay: hours, timeZone: current?.timeZone ?? null }));
  }, [queryClient]);

  return {
    loading: enabled && query.isPending,
    pomodoroWorkMinutes: settings?.pomodoroWorkMinutes ?? 25,
    pomodoroBreakMinutes: settings?.pomodoroBreakMinutes ?? 5,
    updatePomodoroDurations,
    workHoursPerDay: settings?.workHoursPerDay ?? 8,
    updateWorkHoursPerDay,
  };
}
