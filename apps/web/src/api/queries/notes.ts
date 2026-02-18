import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { Note, PaginatedResponse } from '@siesta/shared';

export function useNotes(filters: { accountId?: string; opportunityId?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.opportunityId) params.set('opportunityId', filters.opportunityId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  return useQuery<PaginatedResponse<Note>>({
    queryKey: ['notes', filters],
    queryFn: () => api.get(`/notes?${params.toString()}`),
  });
}

export function useNote(id: string) {
  return useQuery<Note>({
    queryKey: ['notes', id],
    queryFn: () => api.get(`/notes/${id}`),
    enabled: !!id,
  });
}
