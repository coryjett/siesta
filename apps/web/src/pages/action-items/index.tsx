import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMyActionItems } from '../../api/queries/home';
import { useCompleteActionItem, useUncompleteActionItem } from '../../api/queries/accounts';
import { PageLoading } from '../../components/common/loading';
import { formatDateTime } from '../../lib/date';

const SOURCE_LABELS: Record<string, string> = {
  gong_call: 'Call',
  gmail_email: 'Email',
  calendar_event: 'Meeting',
  zendesk_ticket: 'Ticket',
};

function SourceIcon({ sourceType }: { sourceType: string }) {
  const label = SOURCE_LABELS[sourceType];
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#6b26d9] dark:text-[#8249df]">
      {label}
    </span>
  );
}

function matchesFilter(item: { action: string; accountName: string; source: string }, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.action.toLowerCase().includes(q) ||
    item.accountName.toLowerCase().includes(q) ||
    item.source.toLowerCase().includes(q)
  );
}

export default function ActionItemsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyActionItems();
  const completeAction = useCompleteActionItem();
  const uncompleteAction = useUncompleteActionItem();
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [filter, setFilter] = useState('');

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const openItems = useMemo(() => allItems.filter((i) => i.status === 'open'), [allItems]);
  const completedItems = useMemo(() => allItems.filter((i) => i.status === 'done'), [allItems]);

  const filteredOpen = useMemo(
    () => (filter ? openItems.filter((i) => matchesFilter(i, filter)) : openItems),
    [openItems, filter],
  );
  const filteredCompleted = useMemo(
    () => (filter ? completedItems.filter((i) => matchesFilter(i, filter)) : completedItems),
    [completedItems, filter],
  );

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
            Action Items
          </h1>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 text-xs font-bold text-[#6b26d9] dark:text-[#8249df] tabular-nums">
            {openItems.length}
          </span>
        </div>
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b677e] dark:text-[#858198]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            className="w-full sm:w-72 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] pl-9 pr-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
        </div>
      </div>

      {/* Open items */}
      {filteredOpen.length === 0 ? (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            {filter ? 'No matching open items' : "Nothing outstanding -- you're all caught up"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
          {filteredOpen.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => completeAction.mutate({ accountId: item.accountId, hash: item.id })}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734] hover:border-[#6b26d9] dark:hover:border-[#8249df] transition-colors cursor-pointer"
              >
                <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#191726] dark:text-[#f2f2f2]">{item.action}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: item.accountId } })}
                    className="font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                  >
                    {item.accountName}
                  </button>
                  <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                  {item.sourceType && item.recordId ? (
                    <button
                      type="button"
                      onClick={() => navigate({
                        to: '/interactions/$accountId/$sourceType/$recordId',
                        params: { accountId: item.accountId, sourceType: item.sourceType, recordId: item.recordId! },
                        search: { title: item.source },
                      } as never)}
                      className="inline-flex items-center gap-1 font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                    >
                      <SourceIcon sourceType={item.sourceType} />
                      {item.source}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <SourceIcon sourceType={item.sourceType} />
                      {item.source}
                    </span>
                  )}
                  <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                  <span>{formatDateTime(item.date)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed items */}
      {filteredCompleted.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setCompletedExpanded(!completedExpanded)}
            className="flex items-center gap-2 mb-3 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-[#6b677e] dark:text-[#858198] transition-transform ${completedExpanded ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
              Completed
            </h2>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b677e]/10 dark:bg-[#858198]/20 px-1.5 text-[10px] font-bold text-[#6b677e] dark:text-[#858198] tabular-nums">
              {filteredCompleted.length}
            </span>
          </button>

          {completedExpanded && (
            <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {filteredCompleted.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3 opacity-50">
                  <button
                    type="button"
                    onClick={() => uncompleteAction.mutate({ accountId: item.accountId, hash: item.id })}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#6b26d9] bg-[#6b26d9] dark:border-[#8249df] dark:bg-[#8249df] transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm line-through text-[#6b677e] dark:text-[#858198]">{item.action}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                      <button
                        type="button"
                        onClick={() => navigate({ to: '/accounts/$accountId', params: { accountId: item.accountId } })}
                        className="font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                      >
                        {item.accountName}
                      </button>
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      {item.sourceType && item.recordId ? (
                        <button
                          type="button"
                          onClick={() => navigate({
                            to: '/interactions/$accountId/$sourceType/$recordId',
                            params: { accountId: item.accountId, sourceType: item.sourceType, recordId: item.recordId! },
                            search: { title: item.source },
                          } as never)}
                          className="inline-flex items-center gap-1 font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                        >
                          <SourceIcon sourceType={item.sourceType} />
                          {item.source}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <SourceIcon sourceType={item.sourceType} />
                          {item.source}
                        </span>
                      )}
                      <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                      <span>{formatDateTime(item.date)}</span>
                      {item.completedAt && (
                        <>
                          <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                          <span>Completed {formatDateTime(item.completedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
