import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

export interface Resource {
  id: string;
  name: string;
  type: 'link' | 'markdown' | 'file';
  url: string | null;
  description: string | null;
  content: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export function useResources(tags?: string[]) {
  return useQuery<Resource[]>({
    queryKey: ['resources', tags],
    queryFn: () => {
      const params = tags && tags.length > 0 ? `?tags=${tags.join(',')}` : '';
      return api.get<Resource[]>(`/resources${params}`);
    },
  });
}

export function useResourceTags() {
  return useQuery<string[]>({
    queryKey: ['resource-tags'],
    queryFn: () => api.get<string[]>('/resources/tags'),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.postFormData<Resource>('/resources', formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-tags'] });
    },
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      api.patchFormData<Resource>(`/resources/${id}`, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-tags'] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['resource-tags'] });
    },
  });
}

export function getResourceFileUrl(id: string): string {
  return `/api/resources/${id}/file`;
}
