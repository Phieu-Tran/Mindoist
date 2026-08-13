import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectRequest,
  Project,
  UpdateProjectRequest,
} from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/** Query-backed project state. The legacy useProjects hook remains available for isolated consumers. */
export function useProjectsQuery(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => apiFetch<Project[]>('/projects'),
    enabled,
  });

  const createProject = async (request: CreateProjectRequest) => {
    const project = await apiFetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    queryClient.setQueryData<Project[]>(queryKeys.projects(), previous => [...(previous ?? []), project]);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    return project;
  };

  const updateProject = async (id: string, request: UpdateProjectRequest) => {
    const project = await apiFetch<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    queryClient.setQueryData<Project[]>(queryKeys.projects(), previous =>
      (previous ?? []).map(item => item.id === id ? project : item),
    );
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    return project;
  };

  const deleteProject = async (id: string) => {
    await apiFetch<void>(`/projects/${id}`, { method: 'DELETE' });
    queryClient.setQueryData<Project[]>(queryKeys.projects(), previous =>
      (previous ?? []).filter(item => item.id !== id),
    );
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  return {
    projects: enabled ? (query.data ?? []) : [],
    loading: enabled && query.isPending,
    loaded: !enabled || query.isFetched,
    error: query.error instanceof Error ? query.error.message : null,
    createProject,
    updateProject,
    deleteProject,
    refetch: async () => { await query.refetch(); },
  };
}
