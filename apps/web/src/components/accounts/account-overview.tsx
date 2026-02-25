import type { AccountDetail } from '@siesta/shared';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import AccountHealthBadge from './account-health-badge';

interface AccountOverviewProps {
  account: AccountDetail;
}

interface MetricCardProps {
  label: string;
  value: string | number | null;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {value || '--'}
      </p>
    </div>
  );
}

export default function AccountOverview({ account }: AccountOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="ARR" value={formatCurrency(account.arr)} />
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Health</p>
          <div className="mt-1">
            <AccountHealthBadge status={account.healthStatus} />
          </div>
        </div>
        <MetricCard label="CSM Owner" value={account.csmOwner} />
        <MetricCard label="CSE Owner" value={account.cseOwner} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Renewal Date" value={formatDate(account.renewalDate)} />
        <MetricCard label="Region" value={account.region} />
        <MetricCard label="Lifecycle Phase" value={account.lifecyclePhase} />
        <MetricCard label="Production Status" value={account.productionStatus} />
      </div>
      {account.products.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Products</p>
          <div className="flex flex-wrap gap-2">
            {account.products.map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
