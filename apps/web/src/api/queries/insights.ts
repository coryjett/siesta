import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

export interface TechnologyPattern {
  pattern: string;
  accounts: string[];
  frequency: number;
  detail: string;
}

export interface ConversationTrend {
  topic: string;
  accounts: string[];
  recentMentions: number;
  trend: 'rising' | 'stable' | 'declining';
  detail: string;
}

export interface CrossTeamInsight {
  insight: string;
  accounts: string[];
}

export interface InsightsResponse {
  technologyPatterns: TechnologyPattern[];
  conversationTrends: ConversationTrend[];
  crossTeamInsights: CrossTeamInsight[];
}

export function useInsights() {
  return useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: () => api.get<InsightsResponse>('/insights'),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server Redis TTL
    retry: 1,
  });
}
