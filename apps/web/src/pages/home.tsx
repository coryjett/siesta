import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useHomeData, useMyActionItems } from '../api/queries/home';
import { useCompleteActionItem, useUncompleteActionItem } from '../api/queries/accounts';
import type { POCSummaryResponse } from '../api/queries/accounts';
import { api } from '../api/client';
import { useAuth } from '../contexts/auth-context';
import { PageLoading } from '../components/common/loading';
import { CompanyLogo } from '../components/common/company-logo';
import { formatCompactCurrency } from '../lib/currency';
import { formatDate, formatDateTime } from '../lib/date';
import type { Account } from '@siesta/shared';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

// ── POC Health Dot ──

function POCHealthDot({ health }: { health: { rating: 'green' | 'yellow' | 'red'; reason: string } }) {
  const color = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' }[health.rating];
  const label = { green: 'Healthy', yellow: 'Caution', red: 'At Risk' }[health.rating];

  return (
    <span
      className="absolute bottom-2.5 right-2.5"
      title={`${label}: ${health.reason}`}
    >
      <span className={`inline-block h-3 w-3 rounded-full ${color} shadow-sm`} />
    </span>
  );
}

// ── Account Row ──

function AccountRow({ account, health, onClick }: { account: Account; health?: { rating: 'green' | 'yellow' | 'red'; reason: string } | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4 transition-all hover:border-[#6b26d9]/30 dark:hover:border-[#8249df]/30 hover:shadow-sm"
    >
      {health && <POCHealthDot health={health} />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CompanyLogo name={account.name} />
          <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate">
            {account.name}
          </p>
        </div>
        {account.openPipeline != null && account.openPipeline > 0 && (
          <span className="shrink-0 text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
            {formatCompactCurrency(account.openPipeline)}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-4 text-xs text-[#6b677e] dark:text-[#858198]">
        {account.renewalDate && <span>Renewal {formatDate(account.renewalDate)}</span>}
        {account.region && <span>{account.region}</span>}
      </div>
    </button>
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

  const openAiItems = useMemo(() => {
    return (myActionItemsData?.items ?? []).filter((i) => i.status === 'open');
  }, [myActionItemsData]);

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
        <div className="xl:col-span-2">
          <SectionHeader title="My Accounts" count={myAccounts.length} />
          {myAccounts.length === 0 ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
              <p className="text-sm text-[#6b677e] dark:text-[#858198]">No accounts assigned</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  health={healthMap.get(account.id)}
                  onClick={() =>
                    navigate({ to: '/accounts/$accountId', params: { accountId: account.id } })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Action Items — right column */}
        <div className="xl:col-span-3">
          <SectionHeader title="My Action Items" count={aiItemsLoading ? undefined : openAiItems.length} />

          {aiItemsLoading ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
                <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading your action items...</p>
              </div>
            </div>
          ) : openAiItems.length === 0 ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
              <p className="text-sm text-[#6b677e] dark:text-[#858198]">Nothing outstanding -- you're all caught up</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {openAiItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      completeAction.mutate({ accountId: item.accountId, hash: item.id });
                    }}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734] transition-colors hover:border-[#6b26d9] dark:hover:border-[#8249df] cursor-pointer"
                  >
                    <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#191726] dark:text-[#f2f2f2]">
                      {item.action}
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
                      <span>{item.source}</span>
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      <span>{formatDateTime(item.date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
