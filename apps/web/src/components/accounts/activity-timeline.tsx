import type { Interaction } from '@siesta/shared';
import { formatDateTime } from '../../lib/date';
import EmptyState from '../common/empty-state';

interface ActivityTimelineProps {
  interactions: Interaction[];
  onInteractionClick?: (interaction: Interaction) => void;
  className?: string;
}

const sourceTypeConfig: Record<string, { label: string; bgClass: string; textClass: string }> = {
  email: { label: 'Email', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-600 dark:text-blue-400' },
  call: { label: 'Call', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-600 dark:text-green-400' },
  meeting: { label: 'Meeting', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-600 dark:text-purple-400' },
  ticket: { label: 'Ticket', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-600 dark:text-orange-400' },
};

function SourceTypeIcon({ type }: { type: string }) {
  const config = sourceTypeConfig[type] ?? sourceTypeConfig.email;
  return (
    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${config.bgClass} ${config.textClass}`}>
      <span className="text-xs font-bold">{config.label[0]}</span>
    </div>
  );
}

export default function ActivityTimeline({
  interactions,
  onInteractionClick,
  className,
}: ActivityTimelineProps) {
  if (interactions.length === 0) {
    return (
      <EmptyState
        title="No recent activity"
        description="No interactions found for this record."
      />
    );
  }

  return (
    <div className={className}>
      <div className="flow-root">
        <ul className="-mb-8">
          {interactions.map((interaction, idx) => (
            <li key={interaction.id}>
              <div className="relative pb-8">
                {idx < interactions.length - 1 && (
                  <span
                    className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`relative flex items-start gap-3 ${onInteractionClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded-lg' : ''}`}
                  onClick={() => onInteractionClick?.(interaction)}
                >
                  <SourceTypeIcon type={interaction.sourceType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {interaction.title}
                      </p>
                      <span className="whitespace-nowrap text-xs text-gray-500">
                        {formatDateTime(interaction.date)}
                      </span>
                    </div>
                    {interaction.preview && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {interaction.preview}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400 capitalize">{interaction.sourceType}</span>
                      {interaction.sentiment && (
                        <span className={`text-xs ${
                          interaction.sentiment === 'negative' ? 'text-red-500' :
                          interaction.sentiment === 'positive' ? 'text-green-500' :
                          'text-gray-400'
                        }`}>
                          {interaction.sentiment}
                        </span>
                      )}
                    </div>
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
