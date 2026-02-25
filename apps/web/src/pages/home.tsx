import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useHomeData } from '../api/queries/home';
import { useAuth } from '../contexts/auth-context';
import { PageLoading } from '../components/common/loading';
import { formatCompactCurrency } from '../lib/currency';
import { formatDate } from '../lib/date';
import type { Account, AccountActionItem } from '@siesta/shared';

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

// ── Type Indicator ──

function TypeIndicator({ type }: { type: 'task' | 'issue' | 'commitment' }) {
  if (type === 'issue') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-100 dark:bg-red-900/20" title="Issue">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>
    );
  }
  if (type === 'commitment') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/20" title="Verbal commitment from call">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#6b26d9]/10 dark:bg-[#8249df]/20" title="Task">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b26d9] dark:text-[#8249df]">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    </span>
  );
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

// ── Account Row ──

function AccountRow({ account, onClick }: { account: Account; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4 transition-all hover:border-[#6b26d9]/30 dark:hover:border-[#8249df]/30 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate">
          {account.name}
        </p>
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

// ── Action Item Row ──

function ActionItemRow({ item, onClick }: { item: AccountActionItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#e9e8ed]/60 dark:hover:bg-[#25232f]/60"
    >
      <div className="mt-0.5">
        <TypeIndicator type={item.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#191726] dark:text-[#f2f2f2] truncate group-hover:text-[#6b26d9] dark:group-hover:text-[#8249df] transition-colors">
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198] truncate">
          {item.accountName}
          {item.sourceSystem && <span className="ml-1.5 opacity-60">via {item.sourceSystem}</span>}
        </p>
        {item.type === 'commitment' && item.snippet && (
          <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198] italic line-clamp-2">
            &ldquo;{item.snippet}&rdquo;
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.dueDate && (
          <span className="text-xs tabular-nums text-[#6b677e] dark:text-[#858198]">
            {formatDate(item.dueDate)}
          </span>
        )}
        {item.type === 'commitment' && item.createdDate && (
          <span className="text-xs tabular-nums text-[#6b677e] dark:text-[#858198]">
            {formatDate(item.createdDate)}
          </span>
        )}
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

  const { issues, commitments } = useMemo(() => {
    if (!data?.actionItems) return { issues: [], commitments: [] };
    return {
      issues: data.actionItems.filter((i) => i.type === 'issue'),
      commitments: data.actionItems.filter((i) => i.type === 'commitment'),
    };
  }, [data]);

  const totalPipeline = useMemo(() => {
    const accounts = data?.myAccounts ?? [];
    return accounts.reduce((sum, a) => sum + (a.openPipeline ?? 0), 0);
  }, [data]);

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
  const actionItems = data.actionItems ?? [];

  const subParts: string[] = [];
  if (issues.length > 0) subParts.push(`${issues.length} issues`);
  if (commitments.length > 0) subParts.push(`${commitments.length} from calls`);

  return (
    <div className="space-y-8">
      {/* Welcome + stats row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
            {getGreeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-[#6b677e] dark:text-[#858198]">
            {formatTodayDate()}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:gap-4">
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
            value={actionItems.length}
            sub={subParts.length > 0 ? subParts.join(', ') : undefined}
          />
        </div>
      </div>

      {/* Two-column layout: Accounts + Action Items */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-5">
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
          <SectionHeader title="Action Items" count={actionItems.length} />
          {actionItems.length === 0 ? (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
              <p className="text-sm text-[#6b677e] dark:text-[#858198]">Nothing outstanding -- you're all caught up</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {actionItems.map((item) => (
                <ActionItemRow
                  key={`${item.type}-${item.id}`}
                  item={item}
                  onClick={() =>
                    navigate({ to: '/accounts/$accountId', params: { accountId: item.accountId } })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
