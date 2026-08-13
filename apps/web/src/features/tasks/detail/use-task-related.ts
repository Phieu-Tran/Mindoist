import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useCallback, useContext, useState } from 'react';
import type { Task } from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';

export interface ChecklistItem {
  id: string;
  title: string;
  completedAt: string | null;
  sortOrder: number;
}

export interface TaskReminder {
  id: string;
  remindAt: string;
  type: string;
  isSent: boolean;
}

export function useTaskRelated(taskId: string) {
  const contextClient = useContext(QueryClientContext);
  const [localClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  }));
  const queryClient = contextClient ?? localClient;
  const subtasksKey = ['tasks', taskId, 'subtasks'] as const;
  const checklistKey = ['tasks', taskId, 'checklist'] as const;
  const remindersKey = ['tasks', taskId, 'reminders'] as const;
  const subtasks = useQuery({ queryKey: subtasksKey, queryFn: () => apiFetch<Task[]>(`/tasks/${taskId}/subtasks`) }, queryClient);
  const checklist = useQuery({ queryKey: checklistKey, queryFn: () => apiFetch<ChecklistItem[]>(`/tasks/${taskId}/checklist-items`) }, queryClient);
  const reminders = useQuery({ queryKey: remindersKey, queryFn: () => apiFetch<TaskReminder[]>(`/tasks/${taskId}/reminders`) }, queryClient);

  const setSubtasks = useCallback((update: Task[] | ((current: Task[]) => Task[])) => {
    queryClient.setQueryData<Task[]>(subtasksKey, current => typeof update === 'function' ? update(current ?? []) : update);
  }, [queryClient, taskId]);
  const setChecklistItems = useCallback((update: ChecklistItem[] | ((current: ChecklistItem[]) => ChecklistItem[])) => {
    queryClient.setQueryData<ChecklistItem[]>(checklistKey, current => typeof update === 'function' ? update(current ?? []) : update);
  }, [queryClient, taskId]);
  const setReminders = useCallback((update: TaskReminder[] | ((current: TaskReminder[]) => TaskReminder[])) => {
    queryClient.setQueryData<TaskReminder[]>(remindersKey, current => typeof update === 'function' ? update(current ?? []) : update);
  }, [queryClient, taskId]);

  return {
    subtasks: subtasks.data ?? [],
    checklistItems: checklist.data ?? [],
    reminders: reminders.data ?? [],
    loading: subtasks.isPending || checklist.isPending || reminders.isPending,
    setSubtasks,
    setChecklistItems,
    setReminders,
  };
}
