import type { SentimentTrend } from '@siesta/shared';

interface SentimentChartProps {
  trends: SentimentTrend[];
}

export default function SentimentChart({ trends }: SentimentChartProps) {
  if (trends.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No sentiment data available.</p>;
  }

  const maxScore = Math.max(...trends.map((t) => Math.abs(t.score)), 1);

  return (
    <div className="space-y-3">
      {trends.map((trend, i) => {
        const widthPercent = Math.abs(trend.score / maxScore) * 100;
        const isPositive = trend.score >= 0;

        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400 text-right">
              {trend.period}
            </span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full relative overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isPositive
                    ? 'bg-green-400 dark:bg-green-600'
                    : 'bg-red-400 dark:bg-red-600'
                }`}
                style={{ width: `${Math.max(widthPercent, 5)}%` }}
              />
            </div>
            <span className={`w-16 shrink-0 text-xs font-medium ${
              isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {trend.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
