import { useState, useEffect } from 'react';
import { useNavigate, useSearch as useRouterSearch } from '@tanstack/react-router';
import { useSearch } from '../../api/queries/search';
import SearchResultCard from '../../components/gong/search-results';
import FilterBar from '../../components/common/filter-bar';
import EmptyState from '../../components/common/empty-state';
import { Spinner } from '../../components/common/loading';

const DEBOUNCE_MS = 300;

interface SearchParams {
  q?: string;
  accountId?: string;
  opportunityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
}

export default function GongSearchPage() {
  const routerSearch = useRouterSearch({ strict: false }) as SearchParams;
  const navigate = useNavigate();

  const [inputValue, setInputValue] = useState(routerSearch.q ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(routerSearch.q ?? '');

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, q: inputValue || undefined, page: undefined };
          if (!next.q) delete next.q;
          if (!next.page) delete next.page;
          return next;
        },
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [inputValue, navigate]);

  // Sync input if URL changes externally
  useEffect(() => {
    if (routerSearch.q !== undefined && routerSearch.q !== inputValue) {
      setInputValue(routerSearch.q);
      setDebouncedQuery(routerSearch.q);
    }
    // Only sync on URL changes, not on input changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerSearch.q]);

  const currentPage = routerSearch.page ?? 1;

  const { data, isLoading, isFetching } = useSearch({
    q: debouncedQuery,
    accountId: routerSearch.accountId,
    opportunityId: routerSearch.opportunityId,
    fromDate: routerSearch.fromDate,
    toDate: routerSearch.toDate,
    page: currentPage,
    pageSize: 25,
  });

  function updateFilter(updates: Partial<SearchParams>) {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev, ...updates, page: undefined };
        // Remove empty values
        for (const [key, value] of Object.entries(next)) {
          if (value === undefined || value === '') {
            delete next[key];
          }
        }
        return next;
      },
    });
  }

  function goToPage(page: number) {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        page: page > 1 ? page : undefined,
      }),
    });
  }

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search call transcripts..."
          className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-11 pr-4 text-base text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {isFetching && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-account" className="text-sm font-medium text-gray-600">
            Account
          </label>
          <input
            id="filter-account"
            type="text"
            value={routerSearch.accountId ?? ''}
            onChange={(e) => updateFilter({ accountId: e.target.value || undefined })}
            placeholder="Account ID"
            className="w-40 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-opportunity" className="text-sm font-medium text-gray-600">
            Opportunity
          </label>
          <input
            id="filter-opportunity"
            type="text"
            value={routerSearch.opportunityId ?? ''}
            onChange={(e) => updateFilter({ opportunityId: e.target.value || undefined })}
            placeholder="Opportunity ID"
            className="w-40 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-from" className="text-sm font-medium text-gray-600">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={routerSearch.fromDate ?? ''}
            onChange={(e) => updateFilter({ fromDate: e.target.value || undefined })}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-to" className="text-sm font-medium text-gray-600">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={routerSearch.toDate ?? ''}
            onChange={(e) => updateFilter({ toDate: e.target.value || undefined })}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {(routerSearch.accountId || routerSearch.opportunityId || routerSearch.fromDate || routerSearch.toDate) && (
          <button
            type="button"
            onClick={() =>
              updateFilter({
                accountId: undefined,
                opportunityId: undefined,
                fromDate: undefined,
                toDate: undefined,
              })
            }
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </FilterBar>

      {/* Results Area */}
      {!debouncedQuery || debouncedQuery.length < 2 ? (
        <EmptyState
          icon={
            <svg
              className="h-12 w-12"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          }
          title="Search call transcripts"
          description="Enter at least 2 characters to search across all Gong call transcripts."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : data && data.data.length > 0 ? (
        <div className="space-y-4">
          {/* Result Count */}
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * (data.pageSize ?? 25) + 1}
            {' '}-{' '}
            {Math.min(currentPage * (data.pageSize ?? 25), data.total)} of{' '}
            {data.total} result{data.total !== 1 ? 's' : ''}
          </p>

          {/* Result Cards */}
          <div className="space-y-3">
            {data.data.map((result) => (
              <SearchResultCard key={result.transcriptId} result={result} />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    // Show first, last, and pages around current
                    return (
                      page === 1 ||
                      page === data.totalPages ||
                      Math.abs(page - currentPage) <= 2
                    );
                  })
                  .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                      acc.push('ellipsis');
                    }
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-gray-400"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        className={`min-w-[2rem] rounded-md px-3 py-2 text-sm font-medium ${
                          item === currentPage
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
              </div>

              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= data.totalPages}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={
            <svg
              className="h-12 w-12"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          }
          title="No results found"
          description={`No transcripts matched "${debouncedQuery}". Try a different search term or adjust your filters.`}
        />
      )}
    </div>
  );
}
