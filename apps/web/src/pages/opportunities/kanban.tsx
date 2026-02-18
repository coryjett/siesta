import { useState } from 'react';
import { useKanbanData } from '../../api/queries/opportunities';
import { useUsers } from '../../api/queries/settings';
import { useAuth } from '../../contexts/auth-context';
import { PageLoading } from '../../components/common/loading';
import FilterBar from '../../components/common/filter-bar';
import Badge from '../../components/common/badge';
import OpportunityCard from '../../components/opportunities/opportunity-card';
import { formatCurrency } from '../../lib/currency';

export default function KanbanPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'se_manager' || user?.role === 'admin';
  const [seFilter, setSeFilter] = useState<string>('');

  const { data: users } = useUsers();
  const { data: kanbanData, isLoading, error } = useKanbanData(
    seFilter ? { assignedSeUserId: seFilter } : {},
  );

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load kanban data.</p>
      </div>
    );
  }

  if (!kanbanData) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Pipeline Kanban
        </h1>
      </div>

      {/* Filter Bar */}
      {isManager && (
        <FilterBar>
          <div className="flex items-center gap-2">
            <label
              htmlFor="se-filter"
              className="text-sm font-medium text-gray-700"
            >
              SE:
            </label>
            <select
              id="se-filter"
              value={seFilter}
              onChange={(e) => setSeFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All SEs</option>
              {users
                ?.filter((u) => u.role === 'se')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        </FilterBar>
      )}

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {kanbanData.map((column) => {
            const totalAmount = column.opportunities.reduce(
              (sum, opp) => sum + (opp.amount ? Number(opp.amount) : 0),
              0,
            );

            return (
              <div
                key={column.stage.id}
                className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-gray-200 bg-gray-50"
              >
                {/* Lane Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {column.stage.stageName}
                    </h3>
                    <Badge variant="default">
                      {column.opportunities.length}
                    </Badge>
                  </div>
                  {totalAmount > 0 && (
                    <span className="text-xs font-medium text-gray-500">
                      {formatCurrency(totalAmount)}
                    </span>
                  )}
                </div>

                {/* Lane Content */}
                <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: '70vh' }}>
                  {column.opportunities.length === 0 ? (
                    <p className="py-8 text-center text-xs text-gray-400">
                      No opportunities
                    </p>
                  ) : (
                    column.opportunities.map((opp) => (
                      <OpportunityCard key={opp.id} opportunity={opp} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
