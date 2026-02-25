import type { Issue } from '@siesta/shared';
import Badge from '../common/badge';
import EmptyState from '../common/empty-state';
import { formatDate } from '../../lib/date';

interface IssueListProps {
  issues: Issue[];
}

function getPriorityVariant(priority: string | null): 'danger' | 'warning' | 'info' | 'default' {
  switch (priority?.toLowerCase()) {
    case 'critical':
    case 'urgent':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
    case 'normal':
      return 'info';
    default:
      return 'default';
  }
}

export default function IssueList({ issues }: IssueListProps) {
  if (issues.length === 0) {
    return <EmptyState title="No open issues" description="No open issues found for this account." />;
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {issue.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="capitalize">{issue.sourceSystem}</span>
              {issue.assignee && <span>Assigned: {issue.assignee}</span>}
              <span>Created: {formatDate(issue.createdDate)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {issue.priority && (
              <Badge variant={getPriorityVariant(issue.priority)}>{issue.priority}</Badge>
            )}
            <Badge variant={issue.status === 'open' ? 'info' : 'default'}>{issue.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
