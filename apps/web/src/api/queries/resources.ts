import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

export interface Resource {
  id: string;
  name: string;
  url: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}

export function useResources() {
  return useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get<Resource[]>('/resources'),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string; description?: string }) =>
      api.post<Resource>('/resources', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
