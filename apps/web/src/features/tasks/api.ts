import type { CreateTaskRequest, Task, UpdateTaskRequest } from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';

export type TaskQueryView =
  | 'all'
  | 'inbox'
  | 'today'
  | 'next7'
  | 'overdue'
  | 'completed'
  | 'trashed'
  | 'calendar'
  | string;

export interface TaskQuery {
  view: TaskQueryView;
  projectId?: string;
  tagId?: string;
}

export function buildTaskQuery({ view, projectId, tagId }: TaskQuery): string {
  const params = new URLSearchParams();

  if (view === 'all' || view === 'inbox' || view === 'today') params.set('filter', 'inbox');
  else if (view === 'next7') params.set('filter', 'upcoming');
  else if (view === 'overdue') params.set('filter', 'overdue');
  else if (view === 'completed') params.set('filter', 'completed');
  else if (view === 'trashed') params.set('filter', 'trashed');

  if (projectId) params.set('projectId', projectId);
  if (tagId) params.set('tagId', tagId);

  return params.toString() ? `?${params}` : '';
}

export function listTasks(query: TaskQuery) {
  return apiFetch<Task[]>(`/tasks${buildTaskQuery(query)}`);
}

export function createTask(request: CreateTaskRequest) {
  return apiFetch<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function updateTask(taskId: string, request: UpdateTaskRequest) {
  return apiFetch<Task>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  });
}

export function moveTask(taskId: string, columnId: string, order?: number) {
  return apiFetch<Task>(`/tasks/${taskId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ columnId, order }),
  });
}

export function completeTask(taskId: string) {
  return apiFetch<Task>(`/tasks/${taskId}/complete`, { method: 'POST' });
}

export function completeTaskPomodoro(taskId: string) {
  return apiFetch<Task>(`/tasks/${taskId}/pomodoro/complete`, { method: 'POST' });
}

export function reopenTask(taskId: string) {
  return apiFetch<Task>(`/tasks/${taskId}/reopen`, { method: 'POST' });
}

export function deleteTask(taskId: string) {
  return apiFetch<void>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export function restoreTask(taskId: string) {
  return apiFetch<Task>(`/tasks/${taskId}/restore`, { method: 'POST' });
}
