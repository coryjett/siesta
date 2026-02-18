import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SfOpportunity, SfActivity, GongCall } from '@siesta/shared';

export interface HomepageData {
  activeOpps: SfOpportunity[];
  attentionItems: {
    overdue: SfOpportunity[];
    stale: SfOpportunity[];
  };
  upcomingActivities: SfActivity[];
  recentCalls: Array<GongCall & { accountName?: string | null; opportunityName?: string | null }>;
}

/**
 * Fetch homepage data for the current user.
 */
export function useHomepageData() {
  return useQuery<HomepageData>({
    queryKey: ['home'],
    queryFn: () => api.get<HomepageData>('/home'),
  });
}
