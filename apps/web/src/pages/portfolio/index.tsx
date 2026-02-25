import { useNavigate } from '@tanstack/react-router';
import { usePortfolioStats } from '../../api/queries/portfolio';
import { PageLoading } from '../../components/common/loading';
import StatsOverview from '../../components/portfolio/stats-overview';

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading, error } = usePortfolioStats();

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load portfolio data.</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">Portfolio Dashboard</h1>
        <p className="mt-1 text-sm text-[#6b677e] dark:text-[#858198]">
          Overview of your account portfolio health and ARR distribution.
        </p>
      </div>

      <StatsOverview
        stats={stats}
        onHealthClick={(status) =>
          navigate({ to: '/accounts', search: { healthStatus: status } as never })
        }
      />
    </div>
  );
}
