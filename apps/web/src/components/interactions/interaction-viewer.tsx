import type { InteractionDetail } from '@siesta/shared';
import { formatDateTime } from '../../lib/date';

interface InteractionViewerProps {
  interaction: InteractionDetail;
}

export default function InteractionViewer({ interaction }: InteractionViewerProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-400 capitalize">
            {interaction.sourceType}
          </span>
          {interaction.sentiment && (
            <span className={`text-sm font-medium ${
              interaction.sentiment === 'negative' ? 'text-red-600' :
              interaction.sentiment === 'positive' ? 'text-green-600' :
              'text-gray-500'
            }`}>
              {interaction.sentiment}
            </span>
          )}
        </div>
        <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          {interaction.title}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {formatDateTime(interaction.date)}
        </p>
      </div>

      {/* Participants */}
      {interaction.participants?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Participants
          </h3>
          <div className="space-y-1">
            {interaction.participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                {p.email && (
                  <a href={`mailto:${p.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    {p.email}
                  </a>
                )}
                {p.role && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">({p.role})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {interaction.summary && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Summary</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{interaction.summary}</p>
        </div>
      )}

      {/* Content */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Content</h3>
        <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 whitespace-pre-wrap">
          {interaction.content}
        </div>
      </div>
    </div>
  );
}
