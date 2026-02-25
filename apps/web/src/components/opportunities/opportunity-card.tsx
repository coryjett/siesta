import clsx from 'clsx';
import type { Opportunity } from '@siesta/shared';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import Badge from '../common/badge';

interface OpportunityCardProps {
  opportunity: Opportunity;
  className?: string;
}

function getCloseDateStatus(closeDate: string | null): 'overdue' | 'soon' | 'normal' {
  if (!closeDate) return 'normal';
  const now = new Date();
  const close = new Date(closeDate);
  const diffMs = close.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'soon';
  return 'normal';
}

function getStageBadgeVariant(
  stageName: string,
): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const lower = stageName.toLowerCase();
  if (lower.includes('closed won') || lower.includes('won')) return 'success';
  if (lower.includes('closed lost') || lower.includes('lost')) return 'danger';
  if (lower.includes('negotiation') || lower.includes('proposal')) return 'warning';
  if (lower.includes('qualification') || lower.includes('discovery')) return 'info';
  return 'default';
}

export default function OpportunityCard({
  opportunity,
  className,
}: OpportunityCardProps) {
  const closeDateStatus = opportunity.isClosed
    ? 'normal'
    : getCloseDateStatus(opportunity.closeDate);

  return (
    <div
      className={clsx(
        'block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {opportunity.name}
        </h4>
        <Badge variant={getStageBadgeVariant(opportunity.stage)}>
          {opportunity.stage}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {formatCurrency(opportunity.amount)}
        </span>
        <span
          className={clsx(
            'font-medium',
            closeDateStatus === 'overdue' && 'text-red-600',
            closeDateStatus === 'soon' && 'text-yellow-600',
            closeDateStatus === 'normal' && 'text-gray-500 dark:text-gray-400',
          )}
        >
          {formatDate(opportunity.closeDate)}
        </span>
      </div>

      {opportunity.owner && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 truncate">
          Owner: {opportunity.owner}
        </p>
      )}
    </div>
  );
}
