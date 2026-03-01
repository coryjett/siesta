import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useOpportunities } from '../../api/queries/opportunities';
import type { POCSummaryResponse } from '../../api/queries/accounts';
import { useHomeData } from '../../api/queries/home';
import { PageLoading } from '../../components/common/loading';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { api } from '../../api/client';
import type { OpportunityWithAccount } from '@siesta/shared';

// ── Fiscal Quarter Utils (FY starts February) ──

interface FiscalQuarter {
  label: string; // e.g. "FQ1 FY27"
  value: string; // e.g. "FY27Q1"
  start: Date;
  end: Date;
}

function getFiscalQuarter(date: Date): { fy: number; fq: number } {
  const month = date.getMonth(); // 0-indexed
  // FY starts in February (month 1)
  // Q1: Feb(1)-Apr(3), Q2: May(4)-Jul(6), Q3: Aug(7)-Oct(9), Q4: Nov(10)-Jan(0)
  if (month >= 1 && month <= 3) {
    return { fy: date.getFullYear() + 1, fq: 1 };
  } else if (month >= 4 && month <= 6) {
    return { fy: date.getFullYear() + 1, fq: 2 };
  } else if (month >= 7 && month <= 9) {
    return { fy: date.getFullYear() + 1, fq: 3 };
  } else {
    // Nov(10), Dec(11) = same calendar year + 1; Jan(0) = calendar year
    const fy = month === 0 ? date.getFullYear() : date.getFullYear() + 1;
    return { fy, fq: 4 };
  }
}

function buildFiscalQuarter(fy: number, fq: number): FiscalQuarter {
  // FY starts in February, so FY27 Q1 = Feb 2026
  const calendarYear = fy - 1;
  const startMonth = ((fq - 1) * 3 + 1) % 12; // Q1=1(Feb), Q2=4(May), Q3=7(Aug), Q4=10(Nov)
  const startYear = startMonth === 0 ? calendarYear + 1 : calendarYear; // Jan wraps
  // Actually Q4 starts Nov of calendarYear, but ends Jan of calendarYear+1
  // Let me recalculate:
  // Q1: Feb(1), Mar(2), Apr(3) of calendarYear
  // Q2: May(4), Jun(5), Jul(6) of calendarYear
  // Q3: Aug(7), Sep(8), Oct(9) of calendarYear
  // Q4: Nov(10), Dec(11) of calendarYear, Jan(0) of calendarYear+1

  let sYear: number, sMonth: number, eYear: number, eMonth: number;
  if (fq === 1) { sYear = calendarYear; sMonth = 1; eYear = calendarYear; eMonth = 4; }
  else if (fq === 2) { sYear = calendarYear; sMonth = 4; eYear = calendarYear; eMonth = 7; }
  else if (fq === 3) { sYear = calendarYear; sMonth = 7; eYear = calendarYear; eMonth = 10; }
  else { sYear = calendarYear; sMonth = 10; eYear = calendarYear + 1; eMonth = 1; }

  const fyShort = String(fy).slice(-2);
  return {
    label: `FQ${fq} FY${fyShort}`,
    value: `FY${fy}Q${fq}`,
    start: new Date(sYear, sMonth, 1),
    end: new Date(eYear, eMonth, 1), // exclusive
  };
}

function getQuarterOptions(): FiscalQuarter[] {
  const now = new Date();
  const { fy, fq } = getFiscalQuarter(now);
  const quarters: FiscalQuarter[] = [];

  // Show 2 quarters back + current + 4 quarters forward
  for (let offset = -2; offset <= 4; offset++) {
    let q = fq + offset;
    let y = fy;
    while (q < 1) { q += 4; y--; }
    while (q > 4) { q -= 4; y++; }
    quarters.push(buildFiscalQuarter(y, q));
  }

  return quarters;
}

function getCurrentQuarterValue(): string {
  const { fy, fq } = getFiscalQuarter(new Date());
  return `FY${fy}Q${fq}`;
}

function isDateInQuarter(dateStr: string, quarter: FiscalQuarter): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= quarter.start && d < quarter.end;
}

const STAGE_ORDER = [
  'Meeting Booked',
  'Discovery',
  'Technical Alignment',
  'Prove Solution',
  'Proposal Submission',
  'Negotiation',
  'Closing',
  'Closed Won',
  'Closed Lost',
];

function normalizeStage(stage: string): string {
  const lower = stage.toLowerCase();
  const match = STAGE_ORDER.find((s) => s.toLowerCase() === lower);
  return match ?? stage;
}

function stageIndex(stage: string): number {
  const lower = stage.toLowerCase();
  const idx = STAGE_ORDER.findIndex((s) => s.toLowerCase() === lower);
  return idx >= 0 ? idx : STAGE_ORDER.length;
}

const stageColors: Record<string, string> = {
  'meeting booked': 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  'discovery': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'technical alignment': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'prove solution': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'proposal submission': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'negotiation': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'closing': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'closed won': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'closed lost': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function POCHealthDot({ health }: { health: { rating: 'green' | 'yellow' | 'red'; reason: string } }) {
  const color = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' }[health.rating];
  const label = { green: 'Healthy', yellow: 'Caution', red: 'At Risk' }[health.rating];

  return (
    <span
      className="absolute top-2.5 right-2.5"
      title={`${label}: ${health.reason}`}
    >
      <span className={`inline-block h-3 w-3 rounded-full ${color} shadow-sm`} />
    </span>
  );
}

function OpportunityCard({ opp, health }: { opp: OpportunityWithAccount; health?: { rating: 'green' | 'yellow' | 'red'; reason: string } | null }) {
  const val = opp.amount ?? null;

  return (
    <div className="relative rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-3 shadow-sm hover:shadow-md transition-shadow">
      {health && <POCHealthDot health={health} />}
      <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate pr-5">
        {opp.name}
      </p>
      <Link
        to="/accounts/$accountId"
        params={{ accountId: opp.accountId }}
        className="mt-1 block text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline truncate"
      >
        {opp.accountName}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b677e] dark:text-[#858198]">
        {val != null && val > 0 && (
          <span className="font-semibold text-[#191726] dark:text-[#f2f2f2]">
            {formatCurrency(val)}
          </span>
        )}
        {opp.closeDate && (
          <span>{formatDate(opp.closeDate)}</span>
        )}
      </div>
      {opp.owner && (
        <p className="mt-1.5 text-xs text-[#6b677e] dark:text-[#858198] truncate">
          {opp.owner}
        </p>
      )}
    </div>
  );
}

function KanbanLane({
  stage,
  opportunities,
  healthMap,
}: {
  stage: string;
  opportunities: OpportunityWithAccount[];
  healthMap: Map<string, { rating: 'green' | 'yellow' | 'red'; reason: string }>;
}) {
  const colorClass = stageColors[stage.toLowerCase()] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300';
  const totalValue = opportunities.reduce((sum, o) => sum + (o.amount ?? 0), 0);

  return (
    <div className="flex w-64 md:w-72 shrink-0 flex-col rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12]">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#dedde4] dark:border-[#2a2734]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
            {stage}
          </span>
          <span className="text-xs text-[#6b677e] dark:text-[#858198]">
            {opportunities.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs font-medium text-[#6b677e] dark:text-[#858198] whitespace-nowrap">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {opportunities.length === 0 ? (
          <p className="text-center text-xs text-[#6b677e] dark:text-[#858198] py-4">
            No opportunities
          </p>
        ) : (
          opportunities.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} health={healthMap.get(opp.accountId)} />
          ))
        )}
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  const { data: opportunities, isLoading, error } = useOpportunities();
  const { data: homeData } = useHomeData();
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showRenewals, setShowRenewals] = useState(false);
  const [myAccountsOnly, setMyAccountsOnly] = useState(true);
  const quarterOptions = useMemo(() => getQuarterOptions(), []);
  const [quarterFilter, setQuarterFilter] = useState('ALL');

  const myAccountIds = useMemo(() => {
    if (!homeData?.myAccounts) return null;
    return new Set(homeData.myAccounts.map((a) => a.id));
  }, [homeData]);

  // Prefetch POC summaries for all unique account IDs in one batch
  const uniqueAccountIds = useMemo(() => {
    if (!opportunities) return [];
    return [...new Set(opportunities.map((o) => o.accountId))];
  }, [opportunities]);

  const pocQueries = useQueries({
    queries: uniqueAccountIds.map((id) => ({
      queryKey: ['accounts', id, 'poc-summary'],
      queryFn: () => api.get<POCSummaryResponse>(`/accounts/${id}/poc-summary`),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const healthMap = useMemo(() => {
    const map = new Map<string, { rating: 'green' | 'yellow' | 'red'; reason: string }>();
    uniqueAccountIds.forEach((id, i) => {
      const health = pocQueries[i]?.data?.health;
      if (health) map.set(id, health);
    });
    return map;
  }, [uniqueAccountIds, pocQueries]);

  const lanes = useMemo(() => {
    if (!opportunities) return [];

    let filtered = opportunities;

    // Filter by "My Accounts" if enabled and we have the data
    if (myAccountsOnly && myAccountIds) {
      filtered = filtered.filter((o) => myAccountIds.has(o.accountId));
    }

    // Filter by fiscal quarter
    if (quarterFilter !== 'ALL') {
      const quarter = quarterOptions.find((q) => q.value === quarterFilter);
      if (quarter) {
        filtered = filtered.filter((o) => isDateInQuarter(o.closeDate ?? '', quarter));
      }
    }

    // Filter out closed opportunities unless toggled
    if (!showClosed) {
      filtered = filtered.filter((o) => !o.isClosed);
    }

    // Filter out renewals unless toggled
    if (!showRenewals) {
      filtered = filtered.filter((o) => {
        const type = (o.type ?? '').toLowerCase();
        const name = o.name.toLowerCase();
        return !type.includes('renewal') && !name.includes('renewal');
      });
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.accountName.toLowerCase().includes(q) ||
          (o.owner ?? '').toLowerCase().includes(q),
      );
    }

    // Group by stage
    const map = new Map<string, OpportunityWithAccount[]>();
    for (const opp of filtered) {
      const stage = normalizeStage(opp.stage);
      const group = map.get(stage) ?? [];
      group.push(opp);
      map.set(stage, group);
    }

    // Sort lanes by pipeline order
    const entries = Array.from(map.entries()).sort(
      ([a], [b]) => stageIndex(a) - stageIndex(b),
    );

    // Sort opportunities within each lane by close date
    for (const [, opps] of entries) {
      opps.sort((a, b) => {
        const da = a.closeDate ?? '';
        const db = b.closeDate ?? '';
        return da.localeCompare(db);
      });
    }

    return entries;
  }, [opportunities, showClosed, showRenewals, search, myAccountsOnly, myAccountIds, quarterFilter, quarterOptions]);

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">
          Failed to load opportunities.
        </p>
      </div>
    );
  }

  const totalOpps = lanes.reduce((sum, [, opps]) => sum + opps.length, 0);
  const totalValue = lanes.reduce(
    (sum, [, opps]) => sum + opps.reduce((s, o) => s + (o.amount ?? 0), 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b677e] dark:text-[#858198]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search opportunities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] pl-9 pr-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder:text-[#6b677e] dark:placeholder:text-[#858198] focus:outline-none focus:ring-2 focus:ring-[#6b26d9]/30 dark:focus:ring-[#8249df]/30 focus:border-[#6b26d9] dark:focus:border-[#8249df]"
          />
        </div>

        {/* Fiscal quarter filter */}
        <select
          value={quarterFilter}
          onChange={(e) => setQuarterFilter(e.target.value)}
          className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#6b26d9]/30 dark:focus:ring-[#8249df]/30 focus:border-[#6b26d9] dark:focus:border-[#8249df]"
        >
          <option value="ALL">All Quarters</option>
          {quarterOptions.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>

        {/* My Accounts toggle */}
        <button
          type="button"
          onClick={() => setMyAccountsOnly(!myAccountsOnly)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            myAccountsOnly
              ? 'bg-[#6b26d9] text-white dark:bg-[#8249df]'
              : 'border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
          }`}
        >
          My Accounts
        </button>

        {/* Renewals toggle */}
        <button
          type="button"
          onClick={() => setShowRenewals(!showRenewals)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            showRenewals
              ? 'bg-[#6b26d9] text-white dark:bg-[#8249df]'
              : 'border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
          }`}
        >
          Renewals
        </button>

        {/* Show closed toggle */}
        <button
          type="button"
          onClick={() => setShowClosed(!showClosed)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            showClosed
              ? 'bg-[#6b26d9] text-white dark:bg-[#8249df]'
              : 'border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
          }`}
        >
          Show Closed
        </button>

        {/* Summary stats */}
        <div className="hidden sm:flex ml-auto items-center gap-4 text-sm text-[#6b677e] dark:text-[#858198]">
          <span>
            {totalOpps} opportunit{totalOpps === 1 ? 'y' : 'ies'}
          </span>
          {totalValue > 0 && (
            <span className="font-semibold text-[#191726] dark:text-[#f2f2f2]">
              {formatCurrency(totalValue)}
            </span>
          )}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {lanes.length === 0 ? (
          <div className="w-full rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-12 text-center">
            <p className="text-sm text-[#6b677e] dark:text-[#858198]">
              {search.trim()
                ? 'No opportunities match your search.'
                : 'No opportunities found.'}
            </p>
          </div>
        ) : (
          lanes.map(([stage, opps]) => (
            <KanbanLane key={stage} stage={stage} opportunities={opps} healthMap={healthMap} />
          ))
        )}
      </div>
    </div>
  );
}
