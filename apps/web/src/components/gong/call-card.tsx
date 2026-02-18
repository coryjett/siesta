import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { GongCall } from '@siesta/shared';

interface CallCardProps {
  call: GongCall & {
    accountName?: string | null;
    opportunityName?: string | null;
  };
  className?: string;
  onClick?: () => void;
}

/**
 * Format a duration in seconds to a human-readable string (e.g., "45m", "1h 23m").
 */
function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Format a date string to a readable display format.
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Card component for displaying a Gong call summary.
 * Shows title, date, duration, participant count, and linked account/opportunity.
 * Clicking navigates to the call detail or triggers an onClick handler.
 */
export default function CallCard({ call, className, onClick }: CallCardProps) {
  const participantCount = call.participants?.length ?? 0;
  const internalCount = call.participants?.filter((p) => p.role === 'internal').length ?? 0;
  const externalCount = participantCount - internalCount;

  const content = (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {call.title || 'Untitled Call'}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {call.started && (
              <span>{formatDate(call.started)}</span>
            )}
            {call.duration != null && (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {formatDuration(call.duration)}
              </span>
            )}
            {participantCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-1.053M18 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6.75 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                {participantCount} ({internalCount} int / {externalCount} ext)
              </span>
            )}
          </div>
        </div>

        {call.media && (
          <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 capitalize">
            {call.media}
          </span>
        )}
      </div>

      {(call.accountName || call.opportunityName) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {call.accountName && (
            <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-500 dark:text-gray-400">Account:</span>
              {call.accountId ? (
                <Link
                  to="/accounts/$accountId"
                  params={{ accountId: call.accountId }}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.accountName}
                </Link>
              ) : (
                call.accountName
              )}
            </span>
          )}

          {call.opportunityName && (
            <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-500 dark:text-gray-400">Opportunity:</span>
              {call.opportunityId ? (
                <Link
                  to="/opportunities/$opportunityId"
                  params={{ opportunityId: call.opportunityId }}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.opportunityName}
                </Link>
              ) : (
                call.opportunityName
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return content;
}
