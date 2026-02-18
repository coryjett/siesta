import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useHomepageData } from '../api/queries/home';
import { useAuth } from '../contexts/auth-context';
import { PageLoading } from '../components/common/loading';
import Card from '../components/common/card';
import Badge from '../components/common/badge';
import OpportunityList from '../components/opportunities/opportunity-list';
import CallCard from '../components/gong/call-card';
import SortableCardList, {
  type SortableSection,
} from '../components/common/sortable-card-list';
import { formatCurrency } from '../lib/currency';
import { formatDate, formatDateTime } from '../lib/date';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error } = useHomepageData();

  const sections: SortableSection[] = useMemo(() => {
    if (!data) return [];
    const { activeOpps, attentionItems, upcomingActivities, recentCalls } =
      data;
    const hasAttentionItems =
      attentionItems.overdue.length > 0 || attentionItems.stale.length > 0;

    const result: SortableSection[] = [];

    if (hasAttentionItems) {
      result.push({
        id: 'attention',
        render: (dragHandleProps) => (
          <Card title="Attention Items" dragHandleProps={dragHandleProps}>
            {attentionItems.overdue.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  Overdue Deals ({attentionItems.overdue.length})
                </h4>
                <div className="space-y-2">
                  {attentionItems.overdue.map((opp) => (
                    <Link
                      key={opp.id}
                      to="/opportunities/$opportunityId"
                      params={{ opportunityId: opp.id }}
                      className="flex items-center justify-between rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {opp.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {opp.accountName} -- Close:{' '}
                          {formatDate(opp.closeDate)}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {formatCurrency(opp.amount)}
                        </span>
                        <Badge variant="danger">Overdue</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {attentionItems.stale.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                  Stale Deals ({attentionItems.stale.length})
                </h4>
                <div className="space-y-2">
                  {attentionItems.stale.map((opp) => (
                    <Link
                      key={opp.id}
                      to="/opportunities/$opportunityId"
                      params={{ opportunityId: opp.id }}
                      className="flex items-center justify-between rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 transition-colors hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {opp.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {opp.accountName} --{' '}
                          {opp.lastActivityDate
                            ? `Last activity: ${formatDate(opp.lastActivityDate)}`
                            : 'No recent activity'}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {formatCurrency(opp.amount)}
                        </span>
                        <Badge variant="warning">Stale</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ),
      });
    }

    result.push({
      id: 'active-opps',
      render: (dragHandleProps) => (
        <Card
          title={`Active Opportunities (${activeOpps.length})`}
          dragHandleProps={dragHandleProps}
        >
          <OpportunityList
            opportunities={activeOpps}
            emptyTitle="No active opportunities"
            emptyDescription="You have no open opportunities at this time."
          />
        </Card>
      ),
    });

    result.push({
      id: 'upcoming-activities',
      render: (dragHandleProps) => (
        <Card
          title="Upcoming Activities (Next 7 Days)"
          dragHandleProps={dragHandleProps}
        >
          {upcomingActivities.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No upcoming activities in the next 7 days.
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {activity.subject || 'Untitled Activity'}
                    </p>
                    {activity.description && (
                      <p className="mt-0.5 text-xs text-gray-500 truncate">
                        {activity.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-gray-500">
                      {formatDateTime(activity.activityDate)}
                    </span>
                    <Badge variant="info">{activity.activityType}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ),
    });

    result.push({
      id: 'recent-calls',
      render: (dragHandleProps) => (
        <Card title="Recent Gong Calls" dragHandleProps={dragHandleProps}>
          {recentCalls.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent Gong calls.</p>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <CallCard
                  key={call.id}
                  call={call}
                  onClick={() =>
                    navigate({
                      to: '/gong/$callId',
                      params: { callId: call.id },
                    })
                  }
                />
              ))}
            </div>
          )}
        </Card>
      ),
    });

    return result;
  }, [data, navigate]);

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load homepage data.</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Here is your pipeline overview.
        </p>
      </div>

      <SortableCardList
        pageKey="home"
        sections={sections}
        className="space-y-8"
      />
    </div>
  );
}
