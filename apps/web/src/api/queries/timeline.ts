import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

interface TimelineItem {
  id: string;
  type: 'activity' | 'call' | 'note';
  date: string;
  title: string;
  preview: string;
  metadata: Record<string, unknown>;
}

interface PaginatedTimeline {
  data: TimelineItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useTimeline(filters: { accountId?: string; opportunityId?: string; page?: number }) {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.opportunityId) params.set('opportunityId', filters.opportunityId);
  if (filters.page) params.set('page', String(filters.page));

  return useQuery<PaginatedTimeline>({
    queryKey: ['timeline', filters],
    queryFn: () => api.get(`/timeline?${params.toString()}`),
  });
}
