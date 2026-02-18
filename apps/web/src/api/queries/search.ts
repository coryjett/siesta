import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { PaginatedResponse } from '@siesta/shared';

interface SearchFilters {
  q: string;
  accountId?: string;
  opportunityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

interface SearchResult {
  callId: string;
  transcriptId: string;
  callTitle: string | null;
  callDate: string | null;
  accountId: string | null;
  accountName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  snippet: string;
  rank: number;
}

export type { SearchFilters, SearchResult };

export function useSearch(filters: SearchFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.opportunityId) params.set('opportunityId', filters.opportunityId);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  return useQuery<PaginatedResponse<SearchResult>>({
    queryKey: ['search', filters],
    queryFn: () => api.get(`/search?${params.toString()}`),
    enabled: filters.q.length >= 2,
    staleTime: 1000 * 60,
  });
}
