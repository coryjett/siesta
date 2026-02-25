import type { Opportunity } from '@siesta/shared';
import OpportunityCard from './opportunity-card';
import EmptyState from '../common/empty-state';

interface OpportunityListProps {
  opportunities: Opportunity[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export default function OpportunityList({
  opportunities,
  emptyTitle = 'No opportunities',
  emptyDescription = 'No opportunities found matching your criteria.',
  className,
}: OpportunityListProps) {
  if (opportunities.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((opp) => (
          <OpportunityCard key={opp.id} opportunity={opp} />
        ))}
      </div>
    </div>
  );
}
