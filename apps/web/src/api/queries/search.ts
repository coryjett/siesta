import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SearchResult, NegativeInteraction } from '@siesta/shared';

interface SearchFilters {
  q: string;
  sourceTypes?: string[];
  fromDate?: string;
  toDate?: string;
}

export type { SearchFilters };

export function useSemanticSearch(filters: SearchFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.sourceTypes?.length) params.set('sourceTypes', filters.sourceTypes.join(','));
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);

  return useQuery<SearchResult[]>({
    queryKey: ['search', filters],
    queryFn: () => api.get<SearchResult[]>(`/search?${params.toString()}`),
    enabled: filters.q.length >= 2,
    staleTime: 1000 * 60,
  });
}

export function useNegativeInteractions(filters: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.limit) params.set('limit', String(filters.limit));

  return useQuery<NegativeInteraction[]>({
    queryKey: ['interactions', 'negative', filters],
    queryFn: () => api.get<NegativeInteraction[]>(`/interactions/negative?${params.toString()}`),
  });
}
