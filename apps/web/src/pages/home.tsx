import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useHomeData, useMyActionItems } from '../api/queries/home';
import { useCompleteActionItem, useUncompleteActionItem } from '../api/queries/accounts';
import type { POCSummaryResponse } from '../api/queries/accounts';
import { useOpportunities } from '../api/queries/opportunities';
import { api } from '../api/client';
import { useAuth } from '../contexts/auth-context';
import { PageLoading } from '../components/common/loading';
import { CompanyLogo } from '../components/common/company-logo';
import { formatCompactCurrency } from '../lib/currency';
import { formatDate, formatRelative } from '../lib/date';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos dias';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Stat Card ──

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-[#191726] dark:text-[#f2f2f2] tabular-nums">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198]">{sub}</p>
      )}
    </div>
  );
}

// ── Health Dot ──

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

// ── Section Header ──

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
        {title}
      </h2>
      {count != null && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-1.5 text-[10px] font-bold text-[#6b26d9] dark:text-[#8249df] tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main Page ──

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error } = useHomeData();
  const { data: myActionItemsData, isLoading: aiItemsLoading } = useMyActionItems();
  const completeAction = useCompleteActionItem();
  const uncompleteAction = useUncompleteActionItem();
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  const allAiItems = useMemo(() => myActionItemsData?.items ?? [], [myActionItemsData]);
  const openAiItems = useMemo(() => allAiItems.filter((i) => i.status === 'open'), [allAiItems]);
  const completedAiItems = useMemo(() => allAiItems.filter((i) => i.status === 'done'), [allAiItems]);

  const groupedAiItems = useMemo(() => {
    const map = new Map<string, { accountId: string; accountName: string; items: typeof openAiItems }>();
    for (const item of openAiItems) {
      if (!map.has(item.accountId)) {
        map.set(item.accountId, { accountId: item.accountId, accountName: item.accountName, items: [] });
      }
      map.get(item.accountId)!.items.push(item);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [openAiItems]);

  const totalPipeline = useMemo(() => {
    const accounts = data?.myAccounts ?? [];
    return accounts.reduce((sum, a) => sum + (a.openPipeline ?? 0), 0);
  }, [data]);

  // Prefetch POC summaries for account health dots
  const accountIds = useMemo(() => {
    return (data?.myAccounts ?? []).map((a) => a.id);
  }, [data]);

  const pocQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'poc-summary'],
      queryFn: () => api.get<POCSummaryResponse>(`/accounts/${id}/poc-summary`),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const healthMap = useMemo(() => {
    const map = new Map<string, { rating: 'green' | 'yellow' | 'red'; reason: string }>();
    accountIds.forEach((id, i) => {
      const health = pocQueries[i]?.data?.health;
      if (health) map.set(id, health);
    });
    return map;
  }, [accountIds, pocQueries]);

  // Fetch interactions for staleness (days since last Gong call)
  const interactionQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'interactions', { sourceTypes: ['gong_call'], limit: 1 }],
      queryFn: () => api.get<Array<{ date: string }>>(`/accounts/${id}/interactions?sourceTypes=gong_call&limit=5`),
      staleTime: 5 * 60 * 1000,
      enabled: accountIds.length > 0,
    })),
  });

  // Fetch opportunities for opp stage
  const { data: opportunities } = useOpportunities();

  const accountExtras = useMemo(() => {
    const map = new Map<string, { oppStage: string | null; oppAmount: number | null; oppCloseDate: string | null; lastCallDate: string | null; daysSinceLastCall: number | null }>();
    accountIds.forEach((id, idx) => {
      const interactions = interactionQueries[idx]?.data;
      const lastCall = Array.isArray(interactions)
        ? interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;
      const daysSinceLastCall = lastCall?.date
        ? Math.floor((Date.now() - new Date(lastCall.date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const accountOpps = (opportunities ?? []).filter(
        (o) => o.accountId === id && !o.isClosed,
      );
      const primaryOpp = accountOpps[0];

      map.set(id, {
        oppStage: primaryOpp?.stage ?? null,
        oppAmount: primaryOpp?.amount ?? null,
        oppCloseDate: primaryOpp?.closeDate ?? null,
        lastCallDate: lastCall?.date ?? null,
        daysSinceLastCall,
      });
    });
    return map;
  }, [accountIds, interactionQueries, opportunities]);

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Failed to load dashboard data.</p>
      </div>
    );
  }

  if (!data) return null;

  const myAccounts = data.myAccounts ?? [];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Welcome + stats row */}
      <div className="flex flex-col gap-4 md:gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
            {getGreeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-[#6b677e] dark:text-[#858198]">
            {formatTodayDate()}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
          <StatCard
            label="Accounts"
            value={myAccounts.length}
          />
          <StatCard
            label="Open Pipeline"
            value={formatCompactCurrency(totalPipeline)}
          />
          <StatCard
            label="Open Items"
            value={aiItemsLoading ? '...' : openAiItems.length}
          />
        </div>
      </div>

      {/* Two-column layout: Accounts + Action Items */}
      <div className="grid grid-cols-1 gap-4 md:gap-8 xl:grid-cols-5">
        {/* My Accounts — left column */}
        <div className="xl:col-span-3">
          <SectionHeader title="My Accounts" count={myAccounts.length} />
          {myAccounts.length === 0 ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
              <p className="text-sm text-[#6b677e] dark:text-[#858198]">No accounts assigned</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_36px_80px_60px_72px_72px_44px] gap-2 px-4 py-2 border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f6f5f9] dark:bg-[#1a1825]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">Account</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Health</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">Stage</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-right">Amount</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Close</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Last Call</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] text-center">Stale</span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
                {myAccounts.map((account) => {
                  const health = healthMap.get(account.id);
                  const extras = accountExtras.get(account.id);
                  const days = extras?.daysSinceLastCall;
                  const isStale = days !== null && days !== undefined && days > 14;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: account.id } })}
                      className="grid grid-cols-[1fr_36px_80px_60px_72px_72px_44px] gap-2 px-4 py-2.5 items-center w-full text-left hover:bg-[#f6f5f9]/50 dark:hover:bg-[#1a1825]/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CompanyLogo name={account.name} size={20} />
                        <span className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate">
                          {account.name}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <HealthDot rating={health?.rating ?? null} reason={health?.reason} />
                      </div>
                      <span className="text-xs text-[#6b677e] dark:text-[#858198] truncate">
                        {extras?.oppStage ?? '--'}
                      </span>
                      <span className="text-xs font-medium text-[#191726] dark:text-[#f2f2f2] text-right tabular-nums">
                        {extras?.oppAmount != null ? formatCompactCurrency(extras.oppAmount) : '--'}
                      </span>
                      <span className="text-xs text-[#6b677e] dark:text-[#858198] text-center">
                        {extras?.oppCloseDate ? formatDate(extras.oppCloseDate) : '--'}
                      </span>
                      <span className="text-xs text-[#6b677e] dark:text-[#858198] text-center">
                        {extras?.lastCallDate ? formatDate(extras.lastCallDate) : '--'}
                      </span>
                      <div className="flex justify-center">
                        {days != null ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isStale
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : days > 7
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                          }`}>
                            {days}d
                          </span>
                        ) : (
                          <span className="text-xs text-[#6b677e] dark:text-[#858198]">--</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Items — right column */}
        <div className="xl:col-span-2">
          <div className="flex items-baseline gap-2.5 mb-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
              My Action Items
            </h2>
            {!aiItemsLoading && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-1.5 text-[10px] font-bold text-[#6b26d9] dark:text-[#8249df] tabular-nums">
                {openAiItems.length}
              </span>
            )}
            {!aiItemsLoading && allAiItems.length > 0 && (
              <button
                type="button"
                onClick={() => navigate({ to: '/action-items' })}
                className="ml-auto text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
              >
                Show all ({allAiItems.length})
              </button>
            )}
          </div>

          {aiItemsLoading ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
                <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading your action items...</p>
              </div>
            </div>
          ) : openAiItems.length === 0 && completedAiItems.length === 0 ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
              <p className="text-sm text-[#6b677e] dark:text-[#858198]">Nothing outstanding -- you're all caught up</p>
            </div>
          ) : (
            <ActionItemsPanel
              openItems={openAiItems}
              completedItems={completedAiItems}
              grouped={groupedAiItems}
              expandedAccounts={expandedAccounts}
              setExpandedAccounts={setExpandedAccounts}
              showCompleted={showCompleted}
              setShowCompleted={setShowCompleted}
              completeAction={completeAction}
              uncompleteAction={uncompleteAction}
              navigate={navigate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Source Badge ──

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

// ── Action Items Panel ──

type ActionItem = {
  id: string;
  action: string;
  accountId: string;
  accountName: string;
  source: string;
  sourceType: string;
  recordId?: string | null;
  date: string;
  status: string;
  owner?: string;
  completedAt?: string;
};

function ActionItemsPanel({
  openItems,
  completedItems,
  grouped,
  expandedAccounts,
  setExpandedAccounts,
  showCompleted,
  setShowCompleted,
  completeAction,
  uncompleteAction,
  navigate,
}: {
  openItems: ActionItem[];
  completedItems: ActionItem[];
  grouped: Array<{ accountId: string; accountName: string; items: ActionItem[] }>;
  expandedAccounts: Set<string>;
  setExpandedAccounts: React.Dispatch<React.SetStateAction<Set<string>>>;
  showCompleted: boolean;
  setShowCompleted: React.Dispatch<React.SetStateAction<boolean>>;
  completeAction: { mutate: (args: { accountId: string; hash: string }) => void };
  uncompleteAction: { mutate: (args: { accountId: string; hash: string }) => void };
  navigate: ReturnType<typeof useNavigate>;
}) {
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
          <div key={accountId} className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f6f5f9] dark:bg-[#1a1825]">
              <button
                type="button"
                onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId } })}
                className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] hover:text-[#6b26d9] dark:hover:text-[#8249df]"
              >
                {accountName}
              </button>
            </div>
            <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {items.map((item) => {
                const isOverdue = item.date && (now - new Date(item.date).getTime() > fourteenDaysMs);
                return (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
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
          </div>
        ))}

      {/* Show all items if none expanded */}
      {expandedAccounts.size === 0 && (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
          {openItems.map((item) => {
            const isOverdue = item.date && (now - new Date(item.date).getTime() > fourteenDaysMs);
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
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
