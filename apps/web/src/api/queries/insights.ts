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

export interface CompetitiveBattlecard {
  competitor: string;
  category: string;
  soloStrengths: string[];
  competitorWeaknesses: string[];
  differentiators: string[];
  winStrategy: string;
}

export interface MarketPlayer {
  name: string;
  category: string;
  description: string;
  soloAdvantage: string;
  threat: 'high' | 'medium' | 'low';
}

export interface StrategicRecommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  competitors: string[];
}

export interface CompetitiveAnalysisResponse {
  competitorMentions: CompetitorMention[];
  productAlignment: ProductAlignment[];
  competitiveThreats: CompetitiveThreat[];
  battlecards: CompetitiveBattlecard[];
  marketLandscape: MarketPlayer[];
  strategicRecommendations: StrategicRecommendation[];
}

export function useCompetitiveAnalysis() {
  return useQuery<CompetitiveAnalysisResponse>({
    queryKey: ['competitive-analysis'],
    queryFn: () => api.get<CompetitiveAnalysisResponse>('/competitive-analysis'),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server Redis TTL
    retry: 1,
  });
}

// ── Competitor Detail types ──

export interface FeatureComparison {
  feature: string;
  solo: string;
  competitor: string;
  advantage: 'solo' | 'competitor' | 'tie';
}

export interface CommonObjection {
  objection: string;
  response: string;
}

export interface CompetitorDetailResponse {
  competitor: string;
  category: string;
  overview: string;
  soloProduct: string;
  featureComparison: FeatureComparison[];
  soloStrengths: string[];
  competitorStrengths: string[];
  idealCustomerProfile: string;
  winStrategy: string;
  commonObjections: CommonObjection[];
  pricingInsight: string;
  marketTrend: string;
}

export function useCompetitorDetail(competitor: string, category: string) {
  return useQuery<CompetitorDetailResponse>({
    queryKey: ['competitor-detail', competitor],
    queryFn: () => api.get<CompetitorDetailResponse>(
      `/competitive-analysis/detail?competitor=${encodeURIComponent(competitor)}&category=${encodeURIComponent(category)}`,
    ),
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days — matches server Redis TTL
    retry: 1,
    enabled: !!competitor,
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

// ── Win/Loss Analysis types ──

export interface WinLossStats {
  totalClosed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalWonAmount: number;
  totalLostAmount: number;
  avgWonAmount: number;
  avgLostAmount: number;
}

export interface WinLossFactor {
  factor: string;
  detail: string;
  accounts: string[];
}

export interface WinLossRecommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface WinLossAnalysisResponse {
  summary: string;
  stats: WinLossStats;
  winFactors: WinLossFactor[];
  lossFactors: WinLossFactor[];
  recommendations: WinLossRecommendation[];
}

export function useWinLossAnalysis() {
  return useQuery<WinLossAnalysisResponse>({
    queryKey: ['win-loss-analysis'],
    queryFn: () => api.get<WinLossAnalysisResponse>('/win-loss-analysis'),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server Redis TTL
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
