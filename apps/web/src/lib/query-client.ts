import { QueryClient } from '@tanstack/react-query';

/** Shared cache policy for server state. Local/offline state remains outside Query. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

export const queryKeys = {
  tasks: (view: string, projectId?: string | null, tagId?: string | null) =>
    ['tasks', { view, projectId: projectId ?? null, tagId: tagId ?? null }] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
  taskCounts: () => ['task-counts'] as const,
  projects: () => ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  tags: () => ['tags'] as const,
  projection: (from: string, to: string, timezone: string) =>
    ['calendar', 'projection', { from, to, timezone }] as const,
  timeBlocks: (taskId?: string | null) => ['time-blocks', { taskId: taskId ?? null }] as const,
  summary: (range: string) => ['summary', range] as const,
  projectColumns: (projectId?: string | null) => ['projects', projectId ?? null, 'columns'] as const,
  notes: () => ['notes'] as const,
  countdowns: () => ['countdowns'] as const,
  googleCalendarEvents: () => ['calendar', 'google-events'] as const,
  googleCalendarStatus: () => ['calendar', 'google-status'] as const,
  driveBackups: () => ['drive', 'backups'] as const,
  settings: () => ['settings'] as const,
};
