import type { Task } from '@siesta/shared';
import Badge from '../common/badge';
import EmptyState from '../common/empty-state';
import { formatDate } from '../../lib/date';

interface TaskListProps {
  tasks: Task[];
}

function getStatusVariant(status: string): 'success' | 'warning' | 'info' | 'default' {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'done':
      return 'success';
    case 'in progress':
    case 'in_progress':
      return 'warning';
    case 'open':
    case 'todo':
      return 'info';
    default:
      return 'default';
  }
}

export default function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return <EmptyState title="No tasks" description="No tasks found for this account." />;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {task.title}
              </p>
              {task.description && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                  {task.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {task.assignee && <span>Assigned: {task.assignee}</span>}
                {task.dueDate && <span>Due: {formatDate(task.dueDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {task.priority && <Badge variant="default">{task.priority}</Badge>}
              <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
