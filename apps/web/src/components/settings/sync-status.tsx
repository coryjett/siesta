import type { SyncStatus as SyncStatusType } from '@siesta/shared';
import Card from '../common/card';
import Badge from '../common/badge';

interface SyncStatusProps {
  statuses: SyncStatusType[];
  onTriggerSync: (provider: string) => void;
  isSyncing: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'idle':
      return <Badge variant="default">Idle</Badge>;
    case 'running':
      return <Badge variant="info">Running</Badge>;
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'failed':
      return <Badge variant="danger">Failed</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function SyncStatusTable({ statuses, onTriggerSync, isSyncing }: SyncStatusProps) {
  // Group by provider for trigger buttons
  const providers = [...new Set(statuses.map((s) => s.provider))];

  return (
    <Card title="Sync Status">
      <div className="flex gap-3 mb-4">
        {providers.map((provider) => {
          const isRunning = statuses.some(
            (s) => s.provider === provider && s.status === 'running',
          );

          return (
            <button
              key={provider}
              onClick={() => onTriggerSync(provider)}
              disabled={isSyncing || isRunning}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? `${capitalizeFirst(provider)} Syncing...` : `Sync ${capitalizeFirst(provider)}`}
            </button>
          );
        })}
        {providers.length === 0 && (
          <p className="text-sm text-gray-500">No sync state entries found.</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Sync
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Records
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Error
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {statuses.map((status) => (
              <tr key={`${status.provider}-${status.entity}`} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                  {capitalizeFirst(status.provider)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {capitalizeFirst(status.entity)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {getStatusBadge(status.status)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {formatDateTime(status.lastSyncAt)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {status.recordsProcessed ?? '--'}
                </td>
                <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate">
                  {status.lastError ?? '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {statuses.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">
            No sync status data available.
          </p>
        )}
      </div>
    </Card>
  );
}
