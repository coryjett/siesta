import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { OpportunityWithAccount } from '@siesta/shared';

export function useOpportunities(filters: { accountId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  const qs = params.toString();

  return useQuery<OpportunityWithAccount[]>({
    queryKey: ['opportunities', filters],
    queryFn: () => api.get<OpportunityWithAccount[]>(`/opportunities${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60 * 1000, // 5 min — matches server Redis TTL
  });
}
