import { Link } from '@tanstack/react-router';
import type { SearchResult } from '../../api/queries/search';

interface SearchResultCardProps {
  result: SearchResult;
}

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
 * Search result card for transcript search.
 * Shows call title, date, matched snippet with HTML highlighting,
 * and links to the associated account/opportunity.
 * Clicking the title navigates to the full transcript view.
 */
export default function SearchResultCard({ result }: SearchResultCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            to="/gong/$callId"
            params={{ callId: result.callId }}
            className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
          >
            {result.callTitle || 'Untitled Call'}
          </Link>

          {result.callDate && (
            <p className="mt-1 text-sm text-gray-500">
              {formatDate(result.callDate)}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            {result.accountName && (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <span className="font-medium text-gray-500">Account:</span>
                {result.accountId ? (
                  <Link
                    to="/accounts/$accountId"
                    params={{ accountId: result.accountId }}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    {result.accountName}
                  </Link>
                ) : (
                  result.accountName
                )}
              </span>
            )}

            {result.opportunityName && (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <span className="font-medium text-gray-500">Opportunity:</span>
                {result.opportunityId ? (
                  <Link
                    to="/opportunities/$opportunityId"
                    params={{ opportunityId: result.opportunityId }}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    {result.opportunityName}
                  </Link>
                ) : (
                  result.opportunityName
                )}
              </span>
            )}
          </div>
        </div>

        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
          {(result.rank * 100).toFixed(0)}% match
        </span>
      </div>

      {result.snippet && (
        <div
          className="mt-3 rounded-md bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:rounded"
          dangerouslySetInnerHTML={{ __html: result.snippet }}
        />
      )}
    </div>
  );
}
