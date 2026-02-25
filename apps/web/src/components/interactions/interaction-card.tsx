import { formatDateTime } from '../../lib/date';

interface InteractionCardProps {
  sourceType: string;
  date: string;
  title: string;
  preview?: string | null;
  sentiment?: string | null;
  accountName?: string;
  onClick?: () => void;
}

const typeColors: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  call: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ticket: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function InteractionCard({
  sourceType,
  date,
  title,
  preview,
  sentiment,
  accountName,
  onClick,
}: InteractionCardProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 ${onClick ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColors[sourceType] ?? typeColors.email}`}>
            {sourceType}
          </span>
          {accountName && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{accountName}</span>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(date)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      {preview && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{preview}</p>
      )}
      {sentiment && (
        <span className={`mt-2 inline-block text-xs font-medium ${
          sentiment === 'negative' ? 'text-red-600 dark:text-red-400' :
          sentiment === 'positive' ? 'text-green-600 dark:text-green-400' :
          'text-gray-500'
        }`}>
          Sentiment: {sentiment}
        </span>
      )}
    </div>
  );
}
