import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAccounts } from '../../api/queries/accounts';
import { useAuth } from '../../contexts/auth-context';
import { PageLoading } from '../../components/common/loading';
import { formatCurrency } from '../../lib/currency';
import type { Account } from '@siesta/shared';

type SortKey = 'name' | 'openPipeline' | 'openOpportunityCount' | 'cseOwner';
type SortDir = 'asc' | 'desc';

export default function AccountsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [myAccountsOnly, setMyAccountsOnly] = useState(false);
  const [hasPipelineOnly, setHasPipelineOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Fetch full list once; filter client-side for instant search
  const { data: accounts, isLoading, error } = useAccounts();

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'openPipeline' ? 'desc' : 'asc');
    }
  };

  const accountList = useMemo(() => {
    let list = accounts ?? [];
    if (myAccountsOnly && user?.name) {
      list = list.filter((a: Account) => a.cseOwner === user.name);
    }
    if (hasPipelineOnly) {
      list = list.filter((a: Account) => (a.openPipeline ?? 0) > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a: Account) =>
        a.name.toLowerCase().includes(q) ||
        a.cseOwner?.toLowerCase().includes(q) ||
        a.region?.toLowerCase().includes(q),
      );
    }
    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'openPipeline') {
        cmp = (a.openPipeline ?? 0) - (b.openPipeline ?? 0);
      } else if (sortKey === 'openOpportunityCount') {
        cmp = (a.openOpportunityCount ?? 0) - (b.openOpportunityCount ?? 0);
      } else if (sortKey === 'cseOwner') {
        cmp = (a.cseOwner ?? '').localeCompare(b.cseOwner ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [accounts, search, myAccountsOnly, hasPipelineOnly, user?.name, sortKey, sortDir]);

  if (isLoading && !accounts) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load accounts.</p>
      </div>
    );
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const filterBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-[#6b26d9] text-white shadow-lg shadow-purple-500/20'
          : 'border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] text-[#6b677e] dark:text-[#858198] hover:border-[#6b26d9] dark:hover:border-[#8249df]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">Accounts</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-4 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] shadow-sm placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] focus:outline-none focus:ring-1 focus:ring-[#6b26d9]"
        />
        {filterBtn(myAccountsOnly, () => setMyAccountsOnly(!myAccountsOnly), 'My Accounts')}
        {filterBtn(hasPipelineOnly, () => setHasPipelineOnly(!hasPipelineOnly), 'Has Pipeline')}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#dedde4] dark:border-[#2a2734]">
        <table className="min-w-full divide-y divide-[#dedde4] dark:divide-[#2a2734]">
          <thead className="bg-[#f9f9fb] dark:bg-[#14131b]">
            <tr>
              {([
                ['name', 'Name'],
                ['openOpportunityCount', 'Open Opps'],
                ['openPipeline', 'Open Pipeline'],
                ['cseOwner', 'Technical Lead'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#6b677e] dark:text-[#858198] cursor-pointer select-none hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
                >
                  {label}{sortIndicator(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#dedde4] dark:divide-[#2a2734] bg-white dark:bg-[#0d0c12]">
            {accountList.map((account: Account) => (
              <tr
                key={account.id}
                className="cursor-pointer hover:bg-[#f9f9fb] dark:hover:bg-[#14131b] transition-colors"
                onClick={() =>
                  navigate({ to: '/accounts/$accountId', params: { accountId: account.id } })
                }
              >
                <td className="px-4 py-3 text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                  {account.name}
                </td>
                <td className="px-4 py-3 text-sm text-[#191726] dark:text-[#f2f2f2] tabular-nums">
                  {account.openOpportunityCount ?? 0}
                </td>
                <td className="px-4 py-3 text-sm text-[#191726] dark:text-[#f2f2f2]">
                  {formatCurrency(account.openPipeline)}
                </td>
                <td className="px-4 py-3 text-sm text-[#6b677e] dark:text-[#858198]">
                  {account.cseOwner || '--'}
                </td>
              </tr>
            ))}
            {accountList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#6b677e] dark:text-[#858198]">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
