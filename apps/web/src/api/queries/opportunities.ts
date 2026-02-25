import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { Opportunity } from '@siesta/shared';

export function useOpportunities(filters: { accountId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  const qs = params.toString();

  return useQuery<Opportunity[]>({
    queryKey: ['opportunities', filters],
    queryFn: () => api.get<Opportunity[]>(`/opportunities${qs ? `?${qs}` : ''}`),
  });
}
