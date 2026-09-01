import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTagRequest, Tag, UpdateTagRequest } from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

export function useTagsQuery(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.tags(),
    queryFn: () => apiFetch<Tag[]>('/tags'),
    enabled,
  });

  const createTag = async (request: CreateTagRequest) => {
    const tag = await apiFetch<Tag>('/tags', { method: 'POST', body: JSON.stringify(request) });
    queryClient.setQueryData<Tag[]>(queryKeys.tags(), previous =>
      [...(previous ?? []), tag].sort((a, b) => a.name.localeCompare(b.name)),
    );
    // Creating an unattached tag does not change any task. Refetching tasks
    // here can race the immediate "create and assign" flow and overwrite its
    // optimistic inspector state with the pre-assignment task snapshot.
    return tag;
  };

  const updateTag = async (id: string, request: UpdateTagRequest) => {
    const tag = await apiFetch<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(request) });
    queryClient.setQueryData<Tag[]>(queryKeys.tags(), previous =>
      (previous ?? []).map(item => item.id === id ? tag : item).sort((a, b) => a.name.localeCompare(b.name)),
    );
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    return tag;
  };

  const deleteTag = async (id: string) => {
    await apiFetch<void>(`/tags/${id}`, { method: 'DELETE' });
    queryClient.setQueryData<Tag[]>(queryKeys.tags(), previous => (previous ?? []).filter(item => item.id !== id));
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  return {
    tags: enabled ? (query.data ?? []) : [],
    loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    createTag,
    updateTag,
    deleteTag,
    refetch: async () => { await query.refetch(); },
  };
}
