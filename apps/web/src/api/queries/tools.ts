import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

export interface Tool {
  id: string;
  name: string;
  url: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}

export function useTools() {
  return useQuery<Tool[]>({
    queryKey: ['tools'],
    queryFn: () => api.get<Tool[]>('/tools'),
  });
}

export function useCreateTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string; description?: string }) =>
      api.post<Tool>('/tools', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}

export function useDeleteTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}
