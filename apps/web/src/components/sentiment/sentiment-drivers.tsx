interface SentimentDriver {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

interface SentimentDriversProps {
  drivers: SentimentDriver[];
}

const impactConfig = {
  positive: { icon: '+', className: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
  negative: { icon: '-', className: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
  neutral: { icon: '~', className: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700' },
};

export default function SentimentDrivers({ drivers }: SentimentDriversProps) {
  if (drivers.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No sentiment drivers available.</p>;
  }

  return (
    <div className="space-y-2">
      {drivers.map((driver, i) => {
        const config = impactConfig[driver.impact];
        return (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${config.className}`}>
              {config.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{driver.factor}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{driver.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
