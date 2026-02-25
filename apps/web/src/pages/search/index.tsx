import { useState } from 'react';
import { useSemanticSearch, type SearchFilters } from '../../api/queries/search';
import { Spinner } from '../../components/common/loading';
import SemanticSearchResults from '../../components/search/semantic-search-results';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sourceTypes, setSourceTypes] = useState<string[]>(['email', 'call', 'meeting', 'ticket']);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateString(d);
  });
  const [toDate, setToDate] = useState(() => toDateString(new Date()));

  const filters: SearchFilters = {
    q: submittedQuery,
    sourceTypes: sourceTypes.length > 0 ? sourceTypes : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  };

  const { data: results, isLoading, isFetching } = useSemanticSearch(filters);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const toggleSourceType = (type: string) => {
    setSourceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Search</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Semantic search across all portfolio interactions.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search interactions..."
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={query.length < 2}
            className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Type:</span>
            {['email', 'call', 'meeting', 'ticket'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleSourceType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sourceTypes.includes(type)
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
            />
          </div>
        </div>
      </form>

      {/* Results */}
      {(isLoading || isFetching) && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {submittedQuery && results && !isLoading && (
        <SemanticSearchResults results={results} />
      )}
    </div>
  );
}
