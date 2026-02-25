import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAccounts } from '../../api/queries/accounts';
import { useOpportunities } from '../../api/queries/opportunities';
import { useSemanticSearch } from '../../api/queries/search';
import type { Account, OpportunityWithAccount, SearchResult } from '@siesta/shared';

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalize(query);
  return fields.some((f) => f && normalize(f).includes(q));
}

const MAX_PER_CATEGORY = 5;

const sourceTypeLabels: Record<string, string> = {
  email: 'Emails',
  call: 'Calls',
  meeting: 'Meetings',
  ticket: 'Tickets',
};

const sourceTypeIcons: Record<string, { letter: string; bg: string; text: string }> = {
  email: { letter: 'E', bg: 'bg-blue-500/10 dark:bg-blue-400/20', text: 'text-blue-600 dark:text-blue-400' },
  call: { letter: 'C', bg: 'bg-amber-500/10 dark:bg-amber-400/20', text: 'text-amber-600 dark:text-amber-400' },
  meeting: { letter: 'M', bg: 'bg-violet-500/10 dark:bg-violet-400/20', text: 'text-violet-600 dark:text-violet-400' },
  ticket: { letter: 'T', bg: 'bg-rose-500/10 dark:bg-rose-400/20', text: 'text-rose-600 dark:text-rose-400' },
};

interface FlatResult {
  id: string;
  navigateTo: string;
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: accounts } = useAccounts();
  const { data: opportunities } = useOpportunities();
  const { data: searchResults, isFetching: isSearching } = useSemanticSearch({ q: debouncedQuery });

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Client-side: filter accounts & opportunities
  const accountResults = useMemo<Account[]>(() => {
    if (!debouncedQuery || !accounts) return [];
    return accounts
      .filter((a) => matchesQuery(debouncedQuery, a.name, a.cseOwner, a.region))
      .slice(0, MAX_PER_CATEGORY);
  }, [debouncedQuery, accounts]);

  const opportunityResults = useMemo<OpportunityWithAccount[]>(() => {
    if (!debouncedQuery || !opportunities) return [];
    return opportunities
      .filter((o) => matchesQuery(debouncedQuery, o.name, o.accountName, o.stage, o.owner))
      .slice(0, MAX_PER_CATEGORY);
  }, [debouncedQuery, opportunities]);

  // Server-side: group interaction search results by sourceType
  const interactionGroups = useMemo<Record<string, SearchResult[]>>(() => {
    if (!searchResults || searchResults.length === 0) return {};
    const groups: Record<string, SearchResult[]> = {};
    for (const r of searchResults) {
      const type = r.sourceType;
      if (!groups[type]) groups[type] = [];
      if (groups[type].length < MAX_PER_CATEGORY) {
        groups[type].push(r);
      }
    }
    return groups;
  }, [searchResults]);

  const interactionTypes = useMemo(
    () => Object.keys(interactionGroups).sort((a, b) => (sourceTypeLabels[a] ?? a).localeCompare(sourceTypeLabels[b] ?? b)),
    [interactionGroups],
  );

  // Flat list for keyboard navigation
  const allResults = useMemo(() => {
    const items: FlatResult[] = [];
    for (const a of accountResults) items.push({ id: `a-${a.id}`, navigateTo: `/accounts/${a.id}` });
    for (const o of opportunityResults) items.push({ id: `o-${o.id}`, navigateTo: `/opportunities/${o.id}` });
    for (const type of interactionTypes) {
      for (const r of interactionGroups[type]) {
        items.push({
          id: `i-${r.interactionId}`,
          navigateTo: `/interactions/${r.accountId}/${r.sourceType}/${r.interactionId}`,
        });
      }
    }
    return items;
  }, [accountResults, opportunityResults, interactionTypes, interactionGroups]);

  const hasResults = allResults.length > 0;
  const showDropdown = open && debouncedQuery.length > 0;

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigateToResult = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(-1);
      navigate({ to: path });
    },
    [navigate],
  );

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown || !hasResults) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < allResults.length) {
      e.preventDefault();
      navigateToResult(allResults[activeIndex].navigateTo);
    }
  }

  // Track the flat index for keyboard highlighting
  let flatIndex = -1;
  const sectionCount = (accountResults.length > 0 ? 1 : 0) + (opportunityResults.length > 0 ? 1 : 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-full md:max-w-md">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858198]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-full rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#1a1825] py-2 pl-9 pr-3 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#858198] outline-none focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] transition-colors"
        />
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] shadow-lg">
          {!hasResults && !isSearching && (
            <div className="px-4 py-3 text-sm text-[#858198]">No results found</div>
          )}

          {!hasResults && isSearching && (
            <div className="px-4 py-3 text-sm text-[#858198]">Searching...</div>
          )}

          {/* Accounts — always first */}
          {accountResults.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#858198]">
                Accounts
              </div>
              {accountResults.map((account) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                      activeIndex === idx
                        ? 'bg-[#6b26d9]/10 dark:bg-[#8249df]/20'
                        : 'hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => navigateToResult(`/accounts/${account.id}`)}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-xs font-semibold text-[#6b26d9] dark:text-[#8249df]">
                      A
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#191726] dark:text-[#f2f2f2]">
                        {account.name}
                      </p>
                      <p className="truncate text-xs text-[#858198]">
                        {[account.region, account.cseOwner].filter(Boolean).join(' \u00b7 ')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Opportunities — second */}
          {opportunityResults.length > 0 && (
            <div>
              {accountResults.length > 0 && (
                <div className="mx-4 border-t border-[#dedde4] dark:border-[#2a2734]" />
              )}
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#858198]">
                Opportunities
              </div>
              {opportunityResults.map((opp) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={opp.id}
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                      activeIndex === idx
                        ? 'bg-[#6b26d9]/10 dark:bg-[#8249df]/20'
                        : 'hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => navigateToResult(`/opportunities/${opp.id}`)}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-400/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      O
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#191726] dark:text-[#f2f2f2]">
                        {opp.name}
                      </p>
                      <p className="truncate text-xs text-[#858198]">
                        {[opp.accountName, opp.stage].filter(Boolean).join(' \u00b7 ')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Interactions — grouped by type, after accounts & opportunities */}
          {interactionTypes.map((type, groupIdx) => {
            const results = interactionGroups[type];
            const icon = sourceTypeIcons[type] ?? { letter: type[0]?.toUpperCase() ?? '?', bg: 'bg-gray-500/10', text: 'text-gray-500' };
            return (
              <div key={type}>
                {(sectionCount > 0 || groupIdx > 0) && (
                  <div className="mx-4 border-t border-[#dedde4] dark:border-[#2a2734]" />
                )}
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#858198]">
                  {sourceTypeLabels[type] ?? type}
                </div>
                {results.map((r) => {
                  flatIndex++;
                  const idx = flatIndex;
                  return (
                    <button
                      key={r.interactionId}
                      type="button"
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                        activeIndex === idx
                          ? 'bg-[#6b26d9]/10 dark:bg-[#8249df]/20'
                          : 'hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
                      }`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() =>
                        navigateToResult(`/interactions/${r.accountId}/${r.sourceType}/${r.interactionId}`)
                      }
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${icon.bg} ${icon.text}`}
                      >
                        {icon.letter}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[#191726] dark:text-[#f2f2f2]">
                          {r.title}
                        </p>
                        <p className="truncate text-xs text-[#858198]">
                          {r.accountName}
                          {r.date && ` \u00b7 ${new Date(r.date).toLocaleDateString()}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Show loading indicator when interactions are still loading but we have local results */}
          {hasResults && isSearching && (
            <div className="border-t border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-xs text-[#858198]">
              Searching interactions...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
