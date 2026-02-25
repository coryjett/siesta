import type { PortfolioStats } from '@siesta/shared';
import { formatCurrency } from '../../lib/currency';
import HealthCard from './health-card';

interface StatsOverviewProps {
  stats: PortfolioStats;
  onHealthClick?: (status: string) => void;
}

export default function StatsOverview({ stats, onHealthClick }: StatsOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4">
        <div>
          <p className="text-sm font-medium text-[#6b677e] dark:text-[#858198]">Total Accounts</p>
          <p className="text-3xl font-bold font-display text-[#191726] dark:text-[#f2f2f2]">{stats.totalAccounts}</p>
        </div>
        <div className="ml-8">
          <p className="text-sm font-medium text-[#6b677e] dark:text-[#858198]">Total ARR</p>
          <p className="text-3xl font-bold font-display text-[#191726] dark:text-[#f2f2f2]">{formatCurrency(stats.totalArr)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <HealthCard
          title="Healthy"
          count={stats.healthDistribution.healthy.count}
          arr={stats.healthDistribution.healthy.arr}
          variant="healthy"
          onClick={() => onHealthClick?.('healthy')}
        />
        <HealthCard
          title="Needs Attention"
          count={stats.healthDistribution.needsAttention.count}
          arr={stats.healthDistribution.needsAttention.arr}
          variant="needs_attention"
          onClick={() => onHealthClick?.('needs_attention')}
        />
        <HealthCard
          title="At Risk"
          count={stats.healthDistribution.atRisk.count}
          arr={stats.healthDistribution.atRisk.arr}
          variant="at_risk"
          onClick={() => onHealthClick?.('at_risk')}
        />
      </div>
    </div>
  );
}
