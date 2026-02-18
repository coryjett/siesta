import type { SfAccount } from '@siesta/shared';
import { formatCurrency } from '../../lib/currency';

interface AccountOverviewProps {
  account: SfAccount;
}

interface MetricCardProps {
  label: string;
  value: string | number | null;
  href?: string | null;
}

function MetricCard({ label, value, href }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 truncate"
        >
          {value || '--'}
        </a>
      ) : (
        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {value || '--'}
        </p>
      )}
    </div>
  );
}

export default function AccountOverview({ account }: AccountOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard
        label="Annual Revenue"
        value={formatCurrency(account.annualRevenue)}
      />
      <MetricCard
        label="Employees"
        value={
          account.numberOfEmployees
            ? account.numberOfEmployees.toLocaleString()
            : null
        }
      />
      <MetricCard
        label="Website"
        value={account.website}
        href={
          account.website
            ? account.website.startsWith('http')
              ? account.website
              : `https://${account.website}`
            : null
        }
      />
    </div>
  );
}
