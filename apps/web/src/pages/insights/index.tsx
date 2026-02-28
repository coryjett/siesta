import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useInsights, useCompetitiveAnalysis, useCallCoaching, useWinLossAnalysis, useWarmupStatus } from '../../api/queries/insights';
import { useHomeData } from '../../api/queries/home';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';

type TabId = 'tech' | 'trends' | 'competitive' | 'coaching' | 'winloss';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tech', label: 'Technology Patterns' },
  { id: 'trends', label: 'Conversation Trends' },
  { id: 'competitive', label: 'Competitive Analysis' },
  { id: 'coaching', label: 'Call Quality' },
  { id: 'winloss', label: 'Win/Loss' },
];

function useWarmingMessage(): string | undefined {
  const { data } = useWarmupStatus();
  if (!data || data.status !== 'warming') return undefined;
  const phaseLabels: Record<string, string> = {
    'gong-briefs': 'Generating call briefs',
    'contact-insights': 'Analyzing contacts',
    'poc-summaries': 'Generating POC summaries',
    'action-items': 'Extracting action items',
  };
  const phaseLabel = phaseLabels[data.phase] ?? 'Processing data';
  return `Cache is still warming up (${phaseLabel}). This may take a moment.`;
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('tech');

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
        Insights
      </h1>

      <div className="border-b border-[#dedde4] dark:border-[#2a2734]">
        <nav className="-mb-px flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-[#6b26d9] text-[#6b26d9] dark:text-[#8249df]'
                  : 'border-transparent text-[#6b677e] dark:text-[#858198] hover:text-[#191726] dark:hover:text-[#f2f2f2] hover:border-[#dedde4] dark:hover:border-[#2a2734]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'tech' && <TechnologyPatternsTab />}
      {activeTab === 'trends' && <ConversationTrendsTab />}
      {activeTab === 'competitive' && <CompetitiveAnalysisTab />}
      {activeTab === 'coaching' && <CallCoachingTab />}
      {activeTab === 'winloss' && <WinLossTab />}
    </div>
  );
}

// ── Technology Patterns Tab ──

function TechnologyPatternsTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useInsights();
  const { data: homeData } = useHomeData();
  const warmingMessage = useWarmingMessage();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading message={warmingMessage} />;

  const patterns = data?.technologyPatterns ?? [];

  if (patterns.length === 0) {
    return (
      <EmptyState message="No technology patterns detected across your accounts yet. Patterns are identified from Gong call briefs." />
    );
  }

  return (
    <div className="space-y-4">
      {data?.crossTeamInsights && data.crossTeamInsights.length > 0 && (
        <Card title="Cross-Team Observations">
          <div className="space-y-3">
            {data.crossTeamInsights.map((insight, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b26d9] dark:text-[#8249df]">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#191726] dark:text-[#f2f2f2]">{insight.insight}</p>
                  {insight.accounts.length > 0 && (
                    <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198]">
                      {insight.accounts.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {patterns.map((pattern, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                {pattern.pattern}
              </h3>
              <span className="shrink-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 text-xs font-bold text-[#6b26d9] dark:text-[#8249df] tabular-nums">
                {pattern.frequency}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
              {pattern.detail}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pattern.accounts.map((accountName) => (
                <AccountLink key={accountName} name={accountName} accountMap={accountMap} navigate={navigate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Conversation Trends Tab ──

function ConversationTrendsTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useInsights();
  const warmingMessage = useWarmingMessage();
  const { data: homeData } = useHomeData();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading message={warmingMessage} />;

  const trends = data?.conversationTrends ?? [];

  if (trends.length === 0) {
    return (
      <EmptyState message="No conversation trends detected yet. Trends are identified from recent Gong calls across your accounts." />
    );
  }

  return (
    <div className="space-y-4">
      {trends.map((trend, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5"
        >
          <div className="flex items-center gap-3">
            <TrendIcon direction={trend.trend} />
            <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] flex-1">
              {trend.topic}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#6b677e] dark:text-[#858198]">
                {trend.recentMentions} mention{trend.recentMentions !== 1 ? 's' : ''}
              </span>
              <TrendBadge direction={trend.trend} />
            </div>
          </div>
          <p className="mt-2 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed ml-8">
            {trend.detail}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 ml-8">
            {trend.accounts.map((accountName) => (
              <AccountLink key={accountName} name={accountName} accountMap={accountMap} navigate={navigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendIcon({ direction }: { direction: 'rising' | 'stable' | 'declining' }) {
  if (direction === 'rising') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      </span>
    );
  }
  if (direction === 'declining') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
          <polyline points="17 18 23 18 23 12" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#eeedf3] dark:bg-[#1e1b29]">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b677e] dark:text-[#858198]">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}

function TrendBadge({ direction }: { direction: 'rising' | 'stable' | 'declining' }) {
  const config = {
    rising: { label: 'Rising', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
    stable: { label: 'Stable', bg: 'bg-[#eeedf3] dark:bg-[#1e1b29]', text: 'text-[#6b677e] dark:text-[#858198]', border: 'border-[#dedde4] dark:border-[#2a2734]' },
    declining: { label: 'Declining', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  }[direction];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}


// ── Competitive Analysis Tab ──

function CompetitiveAnalysisTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useCompetitiveAnalysis();
  const { data: homeData } = useHomeData();
  const warmingMessage = useWarmingMessage();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading message={warmingMessage} />;

  const mentions = data?.competitorMentions ?? [];
  const alignment = data?.productAlignment ?? [];
  const threats = data?.competitiveThreats ?? [];

  if (mentions.length === 0 && alignment.length === 0 && threats.length === 0) {
    return (
      <EmptyState message="No competitive intelligence detected across your accounts yet. Data is extracted from Gong call briefs." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Competitive Threats */}
      {threats.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
            Competitive Threats
          </h2>
          {threats.map((threat, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-5 ${
                threat.severity === 'high'
                  ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                  : threat.severity === 'medium'
                    ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10'
                    : 'border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b]'
              }`}
            >
              <div className="flex items-start gap-3">
                <SeverityBadge severity={threat.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {threat.threat}
                  </p>
                  <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                    {threat.recommendation}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {threat.accounts.map((name) => (
                      <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Competitor Landscape */}
      {mentions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
            Competitor Landscape
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mentions.map((mention, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {mention.competitor}
                  </h3>
                  <span className="shrink-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 text-xs font-bold text-[#6b26d9] dark:text-[#8249df] tabular-nums">
                    {mention.mentionCount}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#dedde4] dark:border-[#2a2734] bg-[#eeedf3] dark:bg-[#1e1b29] px-2 py-0.5 text-[10px] font-semibold text-[#6b677e] dark:text-[#858198]">
                    vs {mention.soloProduct}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                  {mention.context}
                </p>
                <div className="mt-3 rounded-lg bg-[#f6f5f9] dark:bg-[#1a1825] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-1">
                    Positioning
                  </p>
                  <p className="text-xs text-[#191726] dark:text-[#f2f2f2] leading-relaxed">
                    {mention.positioning}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mention.accounts.map((name) => (
                    <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Solo.io Product Alignment */}
      {alignment.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
            Solo.io Product Alignment
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {alignment.map((product, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {product.product}
                  </h3>
                  <AdoptionStageBadge stage={product.adoptionStage} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {product.useCases.map((useCase, ucIdx) => (
                    <div key={ucIdx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b26d9] dark:bg-[#8249df]" />
                      <span className="text-xs text-[#6b677e] dark:text-[#858198]">{useCase}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {product.accounts.map((name) => (
                    <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { label: 'High', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
    medium: { label: 'Medium', bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' },
    low: { label: 'Low', bg: 'bg-[#eeedf3] dark:bg-[#1e1b29]', text: 'text-[#6b677e] dark:text-[#858198]', border: 'border-[#dedde4] dark:border-[#2a2734]' },
  }[severity];

  return (
    <span className={`mt-0.5 shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

function AdoptionStageBadge({ stage }: { stage: 'evaluating' | 'testing' | 'deploying' | 'expanding' }) {
  const config = {
    evaluating: { label: 'Evaluating', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
    testing: { label: 'Testing', bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' },
    deploying: { label: 'Deploying', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
    expanding: { label: 'Expanding', bg: 'bg-[#6b26d9]/5 dark:bg-[#8249df]/10', text: 'text-[#6b26d9] dark:text-[#8249df]', border: 'border-[#6b26d9]/30 dark:border-[#8249df]/30' },
  }[stage];

  return (
    <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
}

// ── Call Quality Tab ──

function CallCoachingTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useCallCoaching();
  const { data: homeData } = useHomeData();
  const warmingMessage = useWarmingMessage();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading message={warmingMessage} />;

  if (!data || data.totalCallsAnalyzed === 0) {
    return (
      <EmptyState message="No call quality data available yet. Quality analysis is generated from your Gong call transcripts." />
    );
  }

  const scoreColor =
    data.overallScore >= 7
      ? 'text-green-600 dark:text-green-400'
      : data.overallScore >= 5
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';

  const scoreBg =
    data.overallScore >= 7
      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      : data.overallScore >= 5
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';

  const strengths = data.highlights.filter((h) => h.type === 'strength');
  const improvements = data.highlights.filter((h) => h.type === 'improvement');

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <div className={`rounded-xl border p-6 ${scoreBg}`}>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
              {data.overallScore}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mt-1">
              / 10
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#191726] dark:text-[#f2f2f2] leading-relaxed">
              {data.summary}
            </p>
            <p className="mt-2 text-xs text-[#6b677e] dark:text-[#858198]">
              Based on {data.totalCallsAnalyzed} call{data.totalCallsAnalyzed !== 1 ? 's' : ''} analyzed
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
          Quality Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.metrics.map((metric, idx) => {
            const metricColor =
              metric.score >= 7
                ? 'bg-green-500'
                : metric.score >= 5
                  ? 'bg-yellow-500'
                  : 'bg-red-500';
            const metricTextColor =
              metric.score >= 7
                ? 'text-green-600 dark:text-green-400'
                : metric.score >= 5
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400';

            return (
              <div
                key={idx}
                className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {metric.label}
                  </h3>
                  <span className={`text-lg font-bold tabular-nums ${metricTextColor}`}>
                    {metric.score}
                  </span>
                </div>
                {/* Score bar */}
                <div className="mt-3 h-1.5 w-full rounded-full bg-[#eeedf3] dark:bg-[#1e1b29]">
                  <div
                    className={`h-1.5 rounded-full ${metricColor} transition-all`}
                    style={{ width: `${metric.score * 10}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                  {metric.detail}
                </p>
                {metric.suggestion && (
                  <div className="mt-3 rounded-lg bg-[#f6f5f9] dark:bg-[#1a1825] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-1">
                      Suggestion
                    </p>
                    <p className="text-xs text-[#191726] dark:text-[#f2f2f2] leading-relaxed">
                      {metric.suggestion}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Highlights */}
      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Strengths */}
          {strengths.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                Strengths
              </h2>
              {strengths.map((h, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4"
                >
                  <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {h.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                    {h.detail}
                  </p>
                  {h.accounts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {h.accounts.map((name) => (
                        <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Areas for Improvement */}
          {improvements.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Areas for Improvement
              </h2>
              {improvements.map((h, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4"
                >
                  <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {h.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                    {h.detail}
                  </p>
                  {h.accounts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {h.accounts.map((name) => (
                        <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Win/Loss Analysis Tab ──

function WinLossTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useWinLossAnalysis();
  const { data: homeData } = useHomeData();
  const warmingMessage = useWarmingMessage();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading message={warmingMessage} />;

  if (!data || data.stats.totalClosed === 0) {
    return (
      <EmptyState message="No closed opportunities found across your accounts. Win/loss analysis requires closed-won and closed-lost deals." />
    );
  }

  const { stats } = data;
  const winRateColor =
    stats.winRate >= 60
      ? 'text-green-600 dark:text-green-400'
      : stats.winRate >= 40
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';
  const winRateBg =
    stats.winRate >= 60
      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      : stats.winRate >= 40
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';

  const formatAmount = (amount: number) => {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      {data.summary && (
        <div className={`rounded-xl border p-6 ${winRateBg}`}>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span className={`text-4xl font-bold tabular-nums ${winRateColor}`}>
                {stats.winRate}%
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mt-1">
                Win Rate
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#191726] dark:text-[#f2f2f2] leading-relaxed">
                {data.summary}
              </p>
              <p className="mt-2 text-xs text-[#6b677e] dark:text-[#858198]">
                Based on {stats.totalClosed} closed deal{stats.totalClosed !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Wins" value={String(stats.wins)} accent="text-green-600 dark:text-green-400" />
        <StatCard label="Losses" value={String(stats.losses)} accent="text-red-600 dark:text-red-400" />
        <StatCard label="Avg Won" value={formatAmount(stats.avgWonAmount)} accent="text-green-600 dark:text-green-400" />
        <StatCard label="Avg Lost" value={formatAmount(stats.avgLostAmount)} accent="text-red-600 dark:text-red-400" />
      </div>

      {/* Win Factors */}
      {data.winFactors.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
            Win Factors
          </h2>
          {data.winFactors.map((factor, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4"
            >
              <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                {factor.factor}
              </h3>
              <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                {factor.detail}
              </p>
              {factor.accounts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {factor.accounts.map((name) => (
                    <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Loss Factors */}
      {data.lossFactors.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            Loss Factors
          </h2>
          {data.lossFactors.map((factor, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-4"
            >
              <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                {factor.factor}
              </h3>
              <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                {factor.detail}
              </p>
              {factor.accounts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {factor.accounts.map((name) => (
                    <AccountLink key={name} name={name} accountMap={accountMap} navigate={navigate} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
            Recommendations
          </h2>
          {data.recommendations.map((rec, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-5 ${
                rec.priority === 'high'
                  ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                  : rec.priority === 'medium'
                    ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10'
                    : 'border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b]'
              }`}
            >
              <div className="flex items-start gap-3">
                <SeverityBadge severity={rec.priority} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                    {rec.title}
                  </p>
                  <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] leading-relaxed">
                    {rec.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4 text-center">
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
        {label}
      </p>
    </div>
  );
}

// ── Shared components ──

const SOURCE_LABELS: Record<string, string> = {
  gong_call: 'Call',
  gmail_email: 'Email',
  calendar_event: 'Meeting',
  zendesk_ticket: 'Ticket',
};

function SourceBadge({ sourceType }: { sourceType: string }) {
  const label = SOURCE_LABELS[sourceType];
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#6b26d9] dark:text-[#8249df]">
      {label}
    </span>
  );
}

function AccountLink({ name, accountMap, navigate }: { name: string; accountMap: Map<string, string>; navigate: ReturnType<typeof useNavigate> }) {
  const accountId = accountMap.get(name.toLowerCase());
  if (accountId) {
    return (
      <button
        type="button"
        onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId } })}
        className="inline-flex items-center rounded-full bg-[#eeedf3] dark:bg-[#1e1b29] px-2 py-0.5 text-[10px] font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/10 dark:hover:bg-[#8249df]/20 transition-colors cursor-pointer"
      >
        {name}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#eeedf3] dark:bg-[#1e1b29] px-2 py-0.5 text-[10px] font-medium text-[#6b677e] dark:text-[#858198]">
      {name}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
      <p className="text-sm text-[#6b677e] dark:text-[#858198]">{message}</p>
    </div>
  );
}
