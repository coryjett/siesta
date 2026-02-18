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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-lg font-semibold text-indigo-600 hover:text-indigo-700 truncate"
        >
          {value || '--'}
        </a>
      ) : (
        <p className="mt-1 text-lg font-semibold text-gray-900">
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
