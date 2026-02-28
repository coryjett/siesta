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

export interface CompetitorMention {
  competitor: string;
  accounts: string[];
  mentionCount: number;
  context: string;
  soloProduct: string;
  positioning: string;
}

export interface ProductAlignment {
  product: string;
  accounts: string[];
  useCases: string[];
  adoptionStage: 'evaluating' | 'testing' | 'deploying' | 'expanding';
}

export interface CompetitiveThreat {
  threat: string;
  accounts: string[];
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface CompetitiveAnalysisResponse {
  competitorMentions: CompetitorMention[];
  productAlignment: ProductAlignment[];
  competitiveThreats: CompetitiveThreat[];
}

export function useCompetitiveAnalysis() {
  return useQuery<CompetitiveAnalysisResponse>({
    queryKey: ['competitive-analysis'],
    queryFn: () => api.get<CompetitiveAnalysisResponse>('/competitive-analysis'),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server Redis TTL
    retry: 1,
  });
}

// ── Call Coaching types ──

export interface CoachingMetric {
  label: string;
  score: number;
  detail: string;
  suggestion: string;
}

export interface CoachingHighlight {
  type: 'strength' | 'improvement';
  title: string;
  detail: string;
  accounts: string[];
}

export interface CallCoachingResponse {
  overallScore: number;
  totalCallsAnalyzed: number;
  metrics: CoachingMetric[];
  highlights: CoachingHighlight[];
  summary: string;
}

export function useCallCoaching() {
  return useQuery<CallCoachingResponse>({
    queryKey: ['call-coaching'],
    queryFn: () => api.get<CallCoachingResponse>('/call-coaching'),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours — matches server Redis TTL
    retry: 1,
  });
}

export interface WarmupStatus {
  status: 'idle' | 'warming' | 'complete' | 'error';
  phase: string;
}

export function useWarmupStatus() {
  return useQuery<WarmupStatus>({
    queryKey: ['warmup-status'],
    queryFn: () => api.get<WarmupStatus>('/settings/cache/warmup-status'),
    staleTime: 30 * 1000, // 30s — poll while warming
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'warming' ? 10_000 : false; // poll every 10s while warming
    },
  });
}
