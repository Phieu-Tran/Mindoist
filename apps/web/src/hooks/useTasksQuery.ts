import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskRequest, Task, UpdateTaskRequest } from '@mindoist/shared/types';
import type { SidebarView } from './useApi';
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
import { queryKeys } from '@/lib/query-client';

function mergeTask(current: Task | undefined, response: Task): Task {
  return {
    ...current,
    ...response,
    tagIds: response.tagIds ?? current?.tagIds ?? [],
  } as Task;
}

function optimisticTask(request: CreateTaskRequest): Task {
  const { title, description, ...rest } = request;
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    title,
    description: description ?? null,
    completedAt: null,
    deletedAt: null,
    tagIds: (request as CreateTaskRequest & { tagIds?: string[] }).tagIds ?? [],
    ...rest,
  } as Task;
}

/** Query owns both task reads and mutations. Every mutation updates the active
 * view optimistically, rolls back on failure, then invalidates dependent data
 * so other views reconcile with the server response. */
export function useTasksQuery(view: SidebarView, enabled: boolean, projectId?: string, tagId?: string) {
  const queryClient = useQueryClient();
  const taskKey = queryKeys.tasks(view, projectId, tagId);
  const query = useQuery({
    queryKey: taskKey,
    queryFn: () => listTasks({ view, projectId, tagId }),
    enabled,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskCounts() }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['summary'] }),
    ]);
  };

  const settleCreate = async () => {
    await Promise.all([
      // Mark task views stale without refetching the active view while another
      // optimistic create may still be pending in that cache.
      queryClient.invalidateQueries({ queryKey: ['tasks'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskCounts() }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['summary'] }),
    ]);
  };

  const addMutation = useMutation({
    mutationFn: (request: CreateTaskRequest) => createTask(request),
    onMutate: request => {
      // Do not make the UI wait for a slow/stuck list GET before showing the
      // new task. The active query is cancelled in the background, then the
      // optimistic row is written synchronously like completion/reopen.
      void queryClient.cancelQueries({ queryKey: taskKey }, { revert: false });
      const optimistic = optimisticTask(request);
      queryClient.setQueryData<Task[]>(taskKey, current => [...(current ?? []), optimistic]);
      return { optimisticId: optimistic.id };
    },
    onError: (_error, _request, context) => {
      queryClient.setQueryData<Task[]>(taskKey, current => (
        (current ?? []).filter(item => item.id !== context?.optimisticId)
      ));
    },
    onSuccess: (task, _request, context) => {
      queryClient.setQueryData<Task[]>(taskKey, current => (
        (current ?? []).map(item => item.id === context?.optimisticId ? mergeTask(item, task) : item)
      ));
    },
    onSettled: settleCreate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateTaskRequest }) => updateTaskRequest(id, request),
    onMutate: async ({ id, request }) => {
      await queryClient.cancelQueries({ queryKey: taskKey });
      const previous = queryClient.getQueryData<Task[]>(taskKey);
      queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(task => task.id === id ? { ...task, ...request } as Task : task));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSuccess: task => queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(item => item.id === task.id ? mergeTask(item, task) : item)),
    onSettled: invalidate,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeTaskRequest(id),
    onMutate: id => {
      void queryClient.cancelQueries({ queryKey: taskKey }, { revert: false });
      const previous = queryClient.getQueryData<Task[]>(taskKey);
      queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(task => task.id === id ? { ...task, completedAt: new Date().toISOString() } : task));
      return { previous };
    },
    onError: (_error, _id, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSuccess: task => queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(item => item.id === task.id ? mergeTask(item, task) : item)),
    onSettled: invalidate,
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => reopenTaskRequest(id),
    onMutate: id => {
      void queryClient.cancelQueries({ queryKey: taskKey }, { revert: false });
      const previous = queryClient.getQueryData<Task[]>(taskKey);
      queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(task => task.id === id ? { ...task, completedAt: null } : task));
      return { previous };
    },
    onError: (_error, _id, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSuccess: task => queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(item => item.id === task.id ? mergeTask(item, task) : item)),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTaskRequest(id),
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: taskKey });
      const previous = queryClient.getQueryData<Task[]>(taskKey);
      queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).filter(task => task.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSettled: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreTaskRequest(id),
    onSuccess: task => queryClient.setQueryData<Task[]>(taskKey, current => {
      const next = current ?? [];
      return next.some(item => item.id === task.id) ? next.map(item => item.id === task.id ? mergeTask(item, task) : item) : [...next, task];
    }),
    onSettled: invalidate,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, columnId }: { id: string; columnId: string }) => moveTaskRequest(id, columnId),
    onMutate: async ({ id, columnId }) => {
      await queryClient.cancelQueries({ queryKey: taskKey });
      const previous = queryClient.getQueryData<Task[]>(taskKey);
      queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(task => task.id === id ? { ...task, projectColumnId: columnId } : task));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(taskKey, context?.previous),
    onSuccess: task => queryClient.setQueryData<Task[]>(taskKey, current => (current ?? []).map(item => item.id === task.id ? mergeTask(item, task) : item)),
    onSettled: invalidate,
  });

  const pomodoroMutation = useMutation({ mutationFn: (id: string) => completeTaskPomodoro(id), onSettled: invalidate });
  const tasks = useMemo(() => enabled ? (query.data ?? []) : [], [enabled, query.data]);

  return {
    tasks,
    loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    addTask: (request: CreateTaskRequest) => addMutation.mutateAsync(request),
    updateTask: (id: string, request: UpdateTaskRequest) => updateMutation.mutateAsync({ id, request }),
    moveTask: (id: string, columnId: string) => moveMutation.mutateAsync({ id, columnId }),
    completeTask: (id: string) => completeMutation.mutateAsync(id),
    completePomodoro: (id: string) => pomodoroMutation.mutateAsync(id),
    reopenTask: (id: string) => reopenMutation.mutateAsync(id),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    restoreTask: (id: string) => restoreMutation.mutateAsync(id),
    refetch: async () => { await query.refetch(); },
  };
}
