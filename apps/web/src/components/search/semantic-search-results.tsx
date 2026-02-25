import { useState } from 'react';
import type { SearchResult } from '@siesta/shared';
import { useInteractionDetail } from '../../api/queries/interactions';
import { formatDateTime } from '../../lib/date';
import EmptyState from '../common/empty-state';

interface SemanticSearchResultsProps {
  results: SearchResult[];
}

const typeColors: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  call: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ticket: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const sourceTypeMap: Record<string, string> = {
  call: 'gong_call',
  meeting: 'calendar_event',
};

const expandableTypes = ['call', 'gong_call'];


function CallSearchResult({ result }: { result: SearchResult }) {
  const [open, setOpen] = useState(false);
  const mappedType = sourceTypeMap[result.sourceType] ?? result.sourceType;

  const { data: detail, isLoading } = useInteractionDetail(
    open ? result.accountId : undefined,
    open ? mappedType : undefined,
    open ? result.interactionId : undefined,
  );

  // Check if the detail content is an MCP error
  const detailContent = (() => {
    if (!detail?.content) return null;
    const lower = detail.content.toLowerCase();
    if (lower.includes('no rows in result set') || lower.includes('not found')) return null;
    return detail.content;
  })();

  const summary = detail?.summary ?? detailContent;
  const participants = detail?.participants ?? [];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full text-left p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${open ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColors[result.sourceType] ?? typeColors.call}`}>
              {result.sourceType}
            </span>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
              {result.accountName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Score: {(result.score * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDateTime(result.date)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{result.title}</p>
        {!open && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{result.snippet}</p>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/30 rounded-b-lg">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading call summary...</p>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {participants.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Participants</p>
                  <div className="flex flex-wrap gap-1.5">
                    {participants.map((p: { name: string; email: string | null; role?: string | null }, i: number) => (
                      <span key={i} className="text-xs text-gray-600 dark:text-gray-400">
                        {p.name}{p.role ? ` (${p.role})` : ''}{i < participants.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {summary}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {result.snippet || 'Call summary unavailable.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SemanticSearchResults({ results }: SemanticSearchResultsProps) {
  if (results.length === 0) {
    return <EmptyState title="No results" description="No matching interactions found. Try a different search query." />;
  }

  return (
    <div className="space-y-3">
      {results.map((result) => {
        const isExpandable = expandableTypes.includes(result.sourceType);

        if (isExpandable) {
          return (
            <CallSearchResult
              key={`${result.accountId}-${result.interactionId}`}
              result={result}
            />
          );
        }

        return (
          <div
            key={`${result.accountId}-${result.interactionId}`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColors[result.sourceType] ?? typeColors.email}`}>
                  {result.sourceType}
                </span>
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {result.accountName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Score: {(result.score * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTime(result.date)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{result.title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{result.snippet}</p>
          </div>
        );
      })}
    </div>
  );
}
