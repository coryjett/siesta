import type { SfActivity } from '@siesta/shared';
import { formatDateTime } from '../../lib/date';
import EmptyState from '../common/empty-state';

interface ActivityTimelineProps {
  activities: SfActivity[];
  className?: string;
}

function ActivityTypeIcon({ type }: { type: 'task' | 'event' }) {
  if (type === 'event') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  );
}

export default function ActivityTimeline({
  activities,
  className,
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title="No activities"
        description="No activities found for this record."
      />
    );
  }

  return (
    <div className={className}>
      <div className="flow-root">
        <ul className="-mb-8">
          {activities.map((activity, idx) => (
            <li key={activity.id}>
              <div className="relative pb-8">
                {idx < activities.length - 1 && (
                  <span
                    className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start gap-3">
                  <ActivityTypeIcon type={activity.activityType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.subject || 'Untitled Activity'}
                      </p>
                      <span className="whitespace-nowrap text-xs text-gray-500">
                        {formatDateTime(activity.activityDate)}
                      </span>
                    </div>
                    {activity.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {activity.description}
                      </p>
                    )}
                    {activity.ownerName && (
                      <p className="mt-1 text-xs text-gray-400">
                        {activity.ownerName}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
