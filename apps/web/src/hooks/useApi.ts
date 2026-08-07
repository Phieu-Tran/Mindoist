import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!enabled) {
      setTasks([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [active, completed] = await Promise.all([
        apiFetch<Task[]>('/tasks'),
        apiFetch<Task[]>('/tasks?filter=completed'),
      ]);
      const unique = new Map([...active, ...completed].map(task => [task.id, task]));
      setTasks(Array.from(unique.values()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
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
  const [columns, setColumns] = useState<ProjectColumn[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const fetchColumns = useCallback(async () => {
    if (!projectId) {
      setColumns([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      setColumns(await apiFetch<ProjectColumn[]>(`/projects/${projectId}/columns`));
      setError(null);
    } catch (e) {
      setColumns([]);
      setError(e instanceof Error ? e.message : 'Failed to load project columns');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchColumns(); }, [fetchColumns]);

  const createColumn = async (request: CreateProjectColumnRequest) => {
    if (!projectId) throw new Error('Project is required');
    const column = await apiFetch<ProjectColumn>(`/projects/${projectId}/columns`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    setColumns(previous => [...previous, column].sort((a, b) => a.sortOrder - b.sortOrder));
    return column;
  };

  const updateColumn = async (id: string, request: UpdateProjectColumnRequest) => {
    if (!projectId) throw new Error('Project is required');
    const column = await apiFetch<ProjectColumn>(`/projects/${projectId}/columns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    setColumns(previous => previous
      .map(item => item.id === id ? column : item)
      .sort((a, b) => a.sortOrder - b.sortOrder));
    return column;
  };

  const deleteColumn = async (id: string) => {
    if (!projectId) throw new Error('Project is required');
    await apiFetch<void>(`/projects/${projectId}/columns/${id}`, { method: 'DELETE' });
    setColumns(previous => previous.filter(item => item.id !== id));
  };

  return { columns, loading, error, createColumn, updateColumn, deleteColumn, refetch: fetchColumns };
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!enabled) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<Note[]>(`${API_BASE}/notes`);
      setNotes(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch notes');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const addNote = async (req: CreateNoteRequest): Promise<Note> => {
    const note = await apiFetch<Note>(`${API_BASE}/notes`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
    setNotes(prev => [note, ...prev]);
    return note;
  };

  const updateNote = async (id: string, req: UpdateNoteRequest): Promise<void> => {
    const updated = await apiFetch<Note>(`${API_BASE}/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
  };

  const deleteNote = async (id: string): Promise<void> => {
    await apiFetch<void>(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return { notes, loading, error, addNote, updateNote, deleteNote, refetch: fetchNotes };
}

export function useCountdowns(enabled: boolean) {
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCountdowns = useCallback(async () => {
    if (!enabled) { setCountdowns([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<Countdown[]>(`${API_BASE}/countdowns`);
      setCountdowns(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch countdowns');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetchCountdowns(); }, [fetchCountdowns]);

  const addCountdown = async (req: CreateCountdownRequest): Promise<Countdown> => {
    const countdown = await apiFetch<Countdown>(`${API_BASE}/countdowns`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
    setCountdowns(prev => [...prev, countdown]);
    return countdown;
  };

  const updateCountdown = async (id: string, req: UpdateCountdownRequest): Promise<void> => {
    const updated = await apiFetch<Countdown>(`${API_BASE}/countdowns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    setCountdowns(prev => prev.map(c => c.id === id ? updated : c));
  };

  const deleteCountdown = async (id: string): Promise<void> => {
    await apiFetch<void>(`${API_BASE}/countdowns/${id}`, { method: 'DELETE' });
    setCountdowns(prev => prev.filter(c => c.id !== id));
  };

  return { countdowns, loading, error, addCountdown, updateCountdown, deleteCountdown, refetch: fetchCountdowns };
}

export function useGCalEvents(enabled: boolean) {
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    fetch(`${API_BASE}/gcal/events`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(body => { if (body.success) setEvents(body.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  return { events, loading };
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
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBackups = useCallback(async () => {
    if (!enabled) { setBackups([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<BackupFile[]>(`${API_BASE}/drive/backups`);
      setBackups(data);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const createBackup = useCallback(async (): Promise<{
    fileId: string;
    fileName: string;
    sizeBytes: number;
  }> => {
    const result = await apiFetch<{
      fileId: string;
      fileName: string;
      sizeBytes: number;
      exportedAt: string;
    }>(`${API_BASE}/drive/backup`, { method: 'POST' });
    await fetchBackups();
    return result;
  }, [fetchBackups]);

  const restoreBackup = useCallback(async (fileId: string): Promise<{
    tasks: number;
    projects: number;
    tags: number;
    notes: number;
  }> => {
    return apiFetch(`${API_BASE}/drive/restore/${fileId}`, { method: 'POST' });
  }, []);

  const deleteBackup = useCallback(async (fileId: string): Promise<void> => {
    await apiFetch<void>(`${API_BASE}/drive/backup/${fileId}`, { method: 'DELETE' });
    await fetchBackups();
  }, [fetchBackups]);

  return { backups, loading, createBackup, restoreBackup, deleteBackup, refetch: fetchBackups };
}

export function useSettings(enabled: boolean) {
  const [hiddenNavItems, setHiddenNavItems] = useState<SidebarView[]>([]);
  const [pomodoroWorkMinutes, setPomodoroWorkMinutes] = useState(25);
  const [pomodoroBreakMinutes, setPomodoroBreakMinutes] = useState(5);
  const [workHoursPerDay, setWorkHoursPerDay] = useState(8);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    apiFetch<{ hiddenNavItems: SidebarView[]; pomodoroWorkMinutes: number; pomodoroBreakMinutes: number; workHoursPerDay: number; timeZone: string | null }>('/settings')
      .then(data => {
        setHiddenNavItems(data.hiddenNavItems ?? []);
        setPomodoroWorkMinutes(data.pomodoroWorkMinutes ?? 25);
        setPomodoroBreakMinutes(data.pomodoroBreakMinutes ?? 5);
        setWorkHoursPerDay(data.workHoursPerDay ?? 8);
        setLoading(false);

        // Keep the server's notion of "where this user is" in sync with the
        // browser automatically - no settings toggle needed, and it
        // self-heals if someone travels (each load re-checks and re-syncs).
        const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detectedTimeZone && detectedTimeZone !== data.timeZone) {
          apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ timeZone: detectedTimeZone }) }).catch(() => {});
        }
      })
      .catch(() => { setLoading(false); });
  }, [enabled]);

  const updateHiddenNavItems = useCallback(async (items: SidebarView[]) => {
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ hiddenNavItems: items }) });
    setHiddenNavItems(items);
  }, []);

  const updatePomodoroDurations = useCallback(async (work: number, brk: number) => {
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ pomodoroWorkMinutes: work, pomodoroBreakMinutes: brk }) });
    setPomodoroWorkMinutes(work);
    setPomodoroBreakMinutes(brk);
  }, []);

  const updateWorkHoursPerDay = useCallback(async (hours: number) => {
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ workHoursPerDay: hours }) });
    setWorkHoursPerDay(hours);
  }, []);

  return {
    hiddenNavItems, loading, updateHiddenNavItems,
    pomodoroWorkMinutes, pomodoroBreakMinutes, updatePomodoroDurations,
    workHoursPerDay, updateWorkHoursPerDay,
  };
}
