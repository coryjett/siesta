import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useInsights } from '../../api/queries/insights';
import { useMyActionItems, useHomeData } from '../../api/queries/home';
import { useOpportunities } from '../../api/queries/opportunities';
import { useCompleteActionItem, useUncompleteActionItem } from '../../api/queries/accounts';
import type { POCSummaryResponse } from '../../api/queries/accounts';
import { api } from '../../api/client';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import { formatDate, formatRelative } from '../../lib/date';

type TabId = 'tech' | 'trends' | 'pocs' | 'actions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tech', label: 'Technology Patterns' },
  { id: 'trends', label: 'Conversation Trends' },
  { id: 'pocs', label: 'POC Activity' },
  { id: 'actions', label: 'Action Items' },
];

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
      {activeTab === 'pocs' && <POCActivityTab />}
      {activeTab === 'actions' && <ActionItemsTab />}
    </div>
  );
}

// ── Technology Patterns Tab ──

function TechnologyPatternsTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useInsights();
  const { data: homeData } = useHomeData();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading />;

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
  const { data: homeData } = useHomeData();

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>) {
      map.set(a.name.toLowerCase(), a.id);
    }
    return map;
  }, [homeData]);

  if (isLoading) return <PageLoading />;

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

// ── POC Activity Tab ──

function POCActivityTab() {
  const navigate = useNavigate();
  const { data: homeData, isLoading: homeLoading } = useHomeData();
  const { data: opportunities } = useOpportunities();

  const myAccounts = useMemo(() => {
    return (homeData?.myAccounts ?? []) as Array<{ id: string; name: string }>;
  }, [homeData]);

  const accountIds = useMemo(() => myAccounts.map((a) => a.id), [myAccounts]);

  // Fetch POC summaries for all user accounts
  const pocQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'poc-summary'],
      queryFn: () => api.get<POCSummaryResponse>(`/accounts/${id}/poc-summary`),
      staleTime: 60 * 60 * 1000,
      enabled: accountIds.length > 0,
    })),
  });

  // Fetch interactions for staleness calculation
  const interactionQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'interactions', { sourceTypes: ['gong_call'], limit: 1 }],
      queryFn: () => api.get<Array<{ date: string }>>(`/accounts/${id}/interactions?sourceTypes=gong_call&limit=5`),
      staleTime: 5 * 60 * 1000,
      enabled: accountIds.length > 0,
    })),
  });

  const pocRows = useMemo(() => {
    const rows: Array<{
      accountId: string;
      accountName: string;
      health: POCSummaryResponse['health'];
      lastCallDate: string | null;
      daysSinceLastCall: number | null;
      oppStage: string | null;
    }> = [];

    myAccounts.forEach((account, idx) => {
      const pocData = pocQueries[idx]?.data;
      const interactions = interactionQueries[idx]?.data;

      // Get last call date
      const lastCall = Array.isArray(interactions)
        ? interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;
      const lastCallDate = lastCall?.date ?? null;
      const daysSinceLastCall = lastCallDate
        ? Math.floor((Date.now() - new Date(lastCallDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Get opportunity stage
      const accountOpps = (opportunities ?? []).filter(
        (o) => o.accountId === account.id && !o.isClosed,
      );
      const primaryOpp = accountOpps[0];

      rows.push({
        accountId: account.id,
        accountName: account.name,
        health: pocData?.health ?? null,
        lastCallDate,
        daysSinceLastCall,
        oppStage: primaryOpp?.stage ?? null,
      });
    });

    // Sort: stale POCs first (most days since last call), then accounts without calls
    rows.sort((a, b) => {
      // Accounts with no calls at top
      if (a.daysSinceLastCall === null && b.daysSinceLastCall !== null) return -1;
      if (a.daysSinceLastCall !== null && b.daysSinceLastCall === null) return 1;
      if (a.daysSinceLastCall !== null && b.daysSinceLastCall !== null) {
        return b.daysSinceLastCall - a.daysSinceLastCall;
      }
      return a.accountName.localeCompare(b.accountName);
    });

    return rows;
  }, [myAccounts, pocQueries, interactionQueries, opportunities]);

  if (homeLoading) return <PageLoading />;

  if (pocRows.length === 0) {
    return <EmptyState message="No account data available. Your accounts will appear here." />;
  }

  return (
    <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_120px_100px] gap-2 px-4 py-2.5 border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f6f5f9] dark:bg-[#1a1825]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">Account</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Health</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Last Call</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">Opp Stage</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Staleness</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
        {pocRows.map((row) => {
          const isStale = row.daysSinceLastCall !== null && row.daysSinceLastCall > 14;
          return (
            <div
              key={row.accountId}
              className="grid grid-cols-[1fr_80px_100px_120px_100px] gap-2 px-4 py-3 items-center"
            >
              <button
                type="button"
                onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: row.accountId } })}
                className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] hover:text-[#6b26d9] dark:hover:text-[#8249df] text-left truncate"
              >
                {row.accountName}
              </button>
              <div className="flex justify-center">
                <HealthDot rating={row.health?.rating ?? null} reason={row.health?.reason} />
              </div>
              <span className="text-xs text-[#6b677e] dark:text-[#858198] text-center">
                {row.lastCallDate ? formatDate(row.lastCallDate) : '--'}
              </span>
              <span className="text-xs text-[#6b677e] dark:text-[#858198] truncate">
                {row.oppStage ?? '--'}
              </span>
              <div className="flex justify-center">
                {row.daysSinceLastCall !== null ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isStale
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                      : row.daysSinceLastCall > 7
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  }`}>
                    {row.daysSinceLastCall}d
                  </span>
                ) : (
                  <span className="text-xs text-[#6b677e] dark:text-[#858198]">--</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthDot({ rating, reason }: { rating: 'green' | 'yellow' | 'red' | null; reason?: string }) {
  if (!rating) {
    return <span className="h-2.5 w-2.5 rounded-full bg-[#dedde4] dark:bg-[#2a2734]" title="No POC data" />;
  }
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${colors[rating]}`}
      title={reason ?? rating}
    />
  );
}

// ── Action Items Tab ──

function ActionItemsTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyActionItems();
  const completeAction = useCompleteActionItem();
  const uncompleteAction = useUncompleteActionItem();
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const openItems = useMemo(() => allItems.filter((i) => i.status === 'open'), [allItems]);
  const completedItems = useMemo(() => allItems.filter((i) => i.status === 'done'), [allItems]);

  // Group by account, sorted by count descending
  const grouped = useMemo(() => {
    const map = new Map<string, { accountId: string; accountName: string; items: typeof openItems }>();
    for (const item of openItems) {
      if (!map.has(item.accountId)) {
        map.set(item.accountId, { accountId: item.accountId, accountName: item.accountName, items: [] });
      }
      map.get(item.accountId)!.items.push(item);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [openItems]);

  if (isLoading) return <PageLoading />;

  if (openItems.length === 0 && completedItems.length === 0) {
    return <EmptyState message="No action items found across your accounts." />;
  }

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const toggleAccount = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Heatmap summary */}
      <div className="flex flex-wrap gap-2">
        {grouped.map(({ accountId, accountName, items }) => (
          <button
            key={accountId}
            type="button"
            onClick={() => toggleAccount(accountId)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              expandedAccounts.has(accountId)
                ? 'border-[#6b26d9] dark:border-[#8249df] bg-[#6b26d9]/5 dark:bg-[#8249df]/10'
                : 'border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] hover:border-[#6b26d9]/50 dark:hover:border-[#8249df]/50'
            }`}
          >
            <span className="font-medium text-[#191726] dark:text-[#f2f2f2] truncate max-w-[150px]">{accountName}</span>
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
              items.length >= 5
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : items.length >= 3
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  : 'bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df]'
            }`}>
              {items.length}
            </span>
          </button>
        ))}
      </div>

      {/* Expanded account items */}
      {grouped
        .filter(({ accountId }) => expandedAccounts.has(accountId))
        .map(({ accountId, accountName, items }) => (
          <Card key={accountId} title={accountName}>
            <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60 -mt-1">
              {items.map((item) => {
                const isOverdue = item.date && (now - new Date(item.date).getTime() > fourteenDaysMs);
                return (
                  <div key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => completeAction.mutate({ accountId: item.accountId, hash: item.id })}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734] hover:border-[#6b26d9] dark:hover:border-[#8249df] transition-colors cursor-pointer"
                    >
                      <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-[#191726] dark:text-[#f2f2f2]'}`}>
                        {item.action}
                        {isOverdue && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:text-red-300 uppercase">
                            Overdue
                          </span>
                        )}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                        {item.sourceType && item.recordId ? (
                          <button
                            type="button"
                            onClick={() => navigate({
                              to: '/interactions/$accountId/$sourceType/$recordId',
                              params: { accountId: item.accountId, sourceType: item.sourceType, recordId: item.recordId! },
                              search: { title: item.source },
                            } as never)}
                            className="inline-flex items-center gap-1 font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                          >
                            <SourceBadge sourceType={item.sourceType} />
                            {item.source}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <SourceBadge sourceType={item.sourceType} />
                            {item.source}
                          </span>
                        )}
                        <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                        <span>{formatRelative(item.date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

      {/* Show all items if none expanded */}
      {expandedAccounts.size === 0 && (
        <Card title={`All Open Items (${openItems.length})`}>
          <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60 -mt-1">
            {openItems.map((item) => {
              const isOverdue = item.date && (now - new Date(item.date).getTime() > fourteenDaysMs);
              return (
                <div key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => completeAction.mutate({ accountId: item.accountId, hash: item.id })}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734] hover:border-[#6b26d9] dark:hover:border-[#8249df] transition-colors cursor-pointer"
                  >
                    <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-[#191726] dark:text-[#f2f2f2]'}`}>
                      {item.action}
                      {isOverdue && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:text-red-300 uppercase">
                          Overdue
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                      <button
                        type="button"
                        onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: item.accountId } })}
                        className="font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                      >
                        {item.accountName}
                      </button>
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      {item.sourceType && item.recordId ? (
                        <button
                          type="button"
                          onClick={() => navigate({
                            to: '/interactions/$accountId/$sourceType/$recordId',
                            params: { accountId: item.accountId, sourceType: item.sourceType, recordId: item.recordId! },
                            search: { title: item.source },
                          } as never)}
                          className="inline-flex items-center gap-1 font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                        >
                          <SourceBadge sourceType={item.sourceType} />
                          {item.source}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <SourceBadge sourceType={item.sourceType} />
                          {item.source}
                        </span>
                      )}
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      <span>{formatRelative(item.date)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Completed items */}
      {completedItems.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 mb-3 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-[#6b677e] dark:text-[#858198] transition-transform ${showCompleted ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
              Completed
            </h2>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b677e]/10 dark:bg-[#858198]/20 px-1.5 text-[10px] font-bold text-[#6b677e] dark:text-[#858198] tabular-nums">
              {completedItems.length}
            </span>
          </button>

          {showCompleted && (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {completedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3 opacity-50">
                  <button
                    type="button"
                    onClick={() => uncompleteAction.mutate({ accountId: item.accountId, hash: item.id })}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#6b26d9] bg-[#6b26d9] dark:border-[#8249df] dark:bg-[#8249df] transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm line-through text-[#6b677e] dark:text-[#858198]">{item.action}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                      <button
                        type="button"
                        onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: item.accountId } })}
                        className="font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                      >
                        {item.accountName}
                      </button>
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      <span>{formatRelative(item.date)}</span>
                      {item.completedAt && (
                        <>
                          <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                          <span>Completed {formatRelative(item.completedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
