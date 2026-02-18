import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { SfOpportunity } from '@siesta/shared';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import Badge from '../common/badge';

interface OpportunityCardProps {
  opportunity: SfOpportunity;
  className?: string;
}

function getCloseDateStatus(closeDate: string): 'overdue' | 'soon' | 'normal' {
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
  if (lower.includes('closed won')) return 'success';
  if (lower.includes('closed lost')) return 'danger';
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
    <Link
      to="/opportunities/$opportunityId"
      params={{ opportunityId: opportunity.id }}
      className={clsx(
        'block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900 truncate">
          {opportunity.name}
        </h4>
        <Badge variant={getStageBadgeVariant(opportunity.stageName)}>
          {opportunity.stageName}
        </Badge>
      </div>

      {opportunity.accountName && (
        <p className="mt-1 text-xs text-gray-500 truncate">
          {opportunity.accountName}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">
          {formatCurrency(opportunity.amount)}
        </span>
        <span
          className={clsx(
            'font-medium',
            closeDateStatus === 'overdue' && 'text-red-600',
            closeDateStatus === 'soon' && 'text-yellow-600',
            closeDateStatus === 'normal' && 'text-gray-500',
          )}
        >
          {formatDate(opportunity.closeDate)}
        </span>
      </div>

      {opportunity.assignedSeName && (
        <p className="mt-2 text-xs text-gray-400 truncate">
          SE: {opportunity.assignedSeName}
        </p>
      )}
    </Link>
  );
}
