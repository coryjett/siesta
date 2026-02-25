import { useState, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useAccountInteractions,
  useAccountOpportunities,
  useAccountOverview,
  useAccountActionItems,
  useEmailThreadSummary,
} from '../../api/queries/accounts';
import type { ActionItem } from '../../api/queries/accounts';
import { useInteractionDetail } from '../../api/queries/interactions';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import ActivityTimeline from '../../components/accounts/activity-timeline';
import NoteList from '../../components/notes/note-list';
import { formatDateTime, formatDate } from '../../lib/date';
import { formatCurrency, formatCompactCurrency } from '../../lib/currency';
import type { Account, Interaction, Opportunity } from '@siesta/shared';

const PREVIEW_COUNT = 5;

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re:\s*|fwd?:\s*)+/gi, '').trim();
}

interface EmailThread {
  normalizedSubject: string;
  emails: Interaction[];
  latestDate: string;
  participants: string[];
}

function groupEmailsByThread(emails: Interaction[]): EmailThread[] {
  const threadMap = new Map<string, Interaction[]>();

  for (const email of emails) {
    const key = normalizeSubject(email.title).toLowerCase();
    const group = threadMap.get(key) ?? [];
    group.push(email);
    threadMap.set(key, group);
  }

  return Array.from(threadMap.entries())
    .map(([, threadEmails]) => {
      const sorted = [...threadEmails].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      const allParticipants = [
        ...new Set(sorted.flatMap((e) => e.participants ?? [])),
      ];
      return {
        normalizedSubject: normalizeSubject(sorted[0].title),
        emails: sorted,
        latestDate: sorted[0].date,
        participants: allParticipants,
      };
    })
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
}

/**
 * Extract the first N content bullet points from a markdown summary string.
 * Skips lines that are just section headings (short text ending in `:` with no detail).
 */
function extractBullets(summary: string, count: number): string[] {
  return summary
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*•]/.test(line))
    .map((line) => line.replace(/^[-*•]\s*(\*\*)?/, '').replace(/\*\*$/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, count);
}

/**
 * Get a one-line preview from a summary — the first substantive content line,
 * skipping section headings (lines that are just bold headings or end with `:` only).
 */
function getPreviewLine(summary: string): string {
  const lines = summary
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Skip section headings like "**Key Points:**" or "### Heading"
    if (/^\*\*[^*]+\*\*:?$/.test(line)) continue;
    if (/^#{2,4}\s+/.test(line)) continue;
    // Skip bullet lines that are just headings (short, ends with colon, no detail)
    const stripped = line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim();
    if (stripped.endsWith(':') && stripped.length < 40) continue;
    // Found a substantive line — clean it up
    if (stripped.length > 0) {
      return stripped;
    }
  }
  // Fallback: return the first non-empty line
  return lines[0]?.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim() ?? '';
}

function EmailThreadItem({
  thread,
  accountId,
}: {
  thread: EmailThread;
  accountId: string;
}) {
  const [open, setOpen] = useState(false);
  const emailIds = useMemo(() => thread.emails.map((e) => e.id), [thread.emails]);
  const emailFallbacks = useMemo(
    () =>
      thread.emails.map((e) => ({
        id: e.id,
        title: e.title,
        preview: e.preview ?? undefined,
        date: e.date,
        participants: e.participants,
      })),
    [thread.emails],
  );
  const { data: summaryData, isLoading: summaryLoading } = useEmailThreadSummary(
    accountId,
    emailIds,
    emailFallbacks,
  );

  const allBullets = summaryData?.summary ? extractBullets(summaryData.summary, 20) : [];

  // One-line preview when collapsed: first substantive content line from summary
  const previewText = summaryData?.summary
    ? getPreviewLine(summaryData.summary)
    : thread.emails[0]?.preview ?? '';

  return (
    <li>
      <div className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] transition-colors">
        {/* Thread header row */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#1e1c27] transition-colors ${open ? 'rounded-t-lg' : 'rounded-lg'}`}
        >
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
            className={`shrink-0 mt-0.5 text-[#6b677e] dark:text-[#858198] transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {thread.normalizedSubject}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {formatDateTime(thread.latestDate)}
              </span>
              {thread.emails.length > 1 && (
                <span className="inline-flex items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 py-0.5 text-xs font-medium text-[#6b26d9] dark:text-[#8249df]">
                  {thread.emails.length} emails
                </span>
              )}
            </div>
            {/* Collapsed preview */}
            {!open && previewText && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {previewText}
              </p>
            )}
          </div>
        </button>

        {/* Expanded full summary */}
        {open && (
          <div className="border-t border-[#dedde4] dark:border-[#2a2734] px-4 py-3 bg-gray-50/50 dark:bg-[#0d0c12]/50 rounded-b-lg">
            {summaryLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
                <p className="text-xs text-[#6b677e] dark:text-[#858198]">Summarizing...</p>
              </div>
            ) : allBullets.length > 0 ? (
              <ul className="space-y-1.5">
                {allBullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b26d9]/60 dark:bg-[#8249df]/60" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : summaryData?.summary ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {summaryData.summary}
              </p>
            ) : (
              <p className="text-xs text-[#6b677e] dark:text-[#858198]">Summary unavailable.</p>
            )}
            {summaryData?.participants && summaryData.participants.length > 0 && (
              <p className="mt-2 pt-2 border-t border-[#dedde4] dark:border-[#2a2734] text-xs text-[#6b677e] dark:text-[#858198]">
                {summaryData.participants.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function EmailThreadSection({
  emails,
  isLoading,
  error,
  accountId,
}: {
  emails: Interaction[] | undefined;
  isLoading: boolean;
  error: Error | null;
  accountId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const threads = useMemo(
    () => groupEmailsByThread(emails ?? []),
    [emails],
  );

  const hasMore = threads.length > PREVIEW_COUNT;
  const visible = expanded ? threads : threads.slice(0, PREVIEW_COUNT);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Emails
          {!error && !isLoading && (
            <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">
              ({threads.length} thread{threads.length !== 1 ? 's' : ''})
            </span>
          )}
        </span>
      }
    >
      {error ? (
        <SectionError message="Failed to load emails." />
      ) : isLoading ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading emails...</p>
      ) : threads.length === 0 ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No emails found.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((thread) => (
              <EmailThreadItem
                key={thread.normalizedSubject}
                thread={thread}
                accountId={accountId}
              />
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-3 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-2 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
            >
              {expanded
                ? `Show last ${PREVIEW_COUNT}`
                : `View all ${threads.length} threads`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

interface SummarySection {
  heading: string;
  bullets: string[];
}

function parseSummary(text: string): SummarySection[] {
  const sections: SummarySection[] = [];
  let current: SummarySection | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Detect section headings: "**Heading:**", "**Heading**", "### Heading", "## Heading"
    const boldHeading = line.match(/^\*\*(.+?)(?::)?\*\*(?::)?$/);
    const mdHeading = line.match(/^#{2,4}\s+(.+)/);

    if (boldHeading || mdHeading) {
      current = { heading: (boldHeading?.[1] ?? mdHeading?.[1] ?? '').trim(), bullets: [] };
      sections.push(current);
      continue;
    }

    // Bullet line: "- text", "* text", "• text"
    const bullet = line.match(/^[-*•]\s+(.+)/);
    if (bullet) {
      const text = bullet[1].replace(/^\*\*(.+?)\*\*[:\s]*/, '$1: ').trim();
      if (current) {
        current.bullets.push(text);
      } else {
        // Bullet before any heading — create an unnamed section
        current = { heading: '', bullets: [text] };
        sections.push(current);
      }
      continue;
    }

    // Inline bold heading with content: "**Heading:** some text here"
    const inlineBold = line.match(/^\*\*(.+?)\*\*[:\s]+(.+)/);
    if (inlineBold) {
      current = { heading: inlineBold[1].trim(), bullets: [inlineBold[2].trim()] };
      sections.push(current);
      continue;
    }

    // Plain text — append to current section as a bullet
    if (current) {
      current.bullets.push(line);
    } else {
      current = { heading: '', bullets: [line] };
      sections.push(current);
    }
  }

  return sections;
}

function AccountSummaryContent({ overview }: { overview: string }) {
  const sections = useMemo(() => parseSummary(overview), [overview]);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-gray-700 dark:text-gray-300">{overview}</p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <p className="text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-1.5">
              {section.heading}
            </p>
          )}
          {section.bullets.length > 0 && (
            <ul className="space-y-1 ml-1">
              {section.bullets.map((bullet, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b26d9]/60 dark:bg-[#8249df]/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
      <span className="text-sm text-red-600 dark:text-red-400">{message}</span>
    </div>
  );
}

function CallItem({
  call,
  accountId,
}: {
  call: Interaction;
  accountId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: detail, isLoading } = useInteractionDetail(
    open ? accountId : undefined,
    open ? call.sourceType : undefined,
    open ? call.id : undefined,
  );

  // Check if the detail content is an MCP error
  const detailContent = (() => {
    if (!detail?.content) return null;
    const lower = detail.content.toLowerCase();
    if (lower.includes('no rows in result set') || lower.includes('not found')) return null;
    return detail.content;
  })();

  const summary = detail?.summary ?? detailContent ?? call.preview;
  const participants = detail?.participants ?? [];

  return (
    <li>
      <div className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] transition-colors">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#1e1c27] transition-colors ${open ? 'rounded-t-lg' : 'rounded-lg'}`}
        >
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
            className={`shrink-0 mt-0.5 text-[#6b677e] dark:text-[#858198] transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {call.title}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {formatDateTime(call.date)}
              </span>
              {call.participants?.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {call.participants.join(', ')}
                </span>
              )}
            </div>
            {!open && call.preview && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {call.preview}
              </p>
            )}
          </div>
        </button>

        {open && (
          <div className="border-t border-[#dedde4] dark:border-[#2a2734] px-4 py-3 bg-gray-50/50 dark:bg-[#0d0c12]/50 rounded-b-lg">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
                <p className="text-xs text-[#6b677e] dark:text-[#858198]">Loading call summary...</p>
              </div>
            ) : summary ? (
              <div className="space-y-3">
                {participants.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#6b677e] dark:text-[#858198]">Participants</p>
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
              <p className="text-xs text-[#6b677e] dark:text-[#858198]">
                {call.preview || 'Call summary unavailable.'}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CallSection({
  calls,
  isLoading,
  error,
  accountId,
}: {
  calls: Interaction[] | undefined;
  isLoading: boolean;
  error: Error | null;
  accountId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const allCalls = calls ?? [];
  const hasMore = allCalls.length > PREVIEW_COUNT;
  const visible = expanded ? allCalls : allCalls.slice(0, PREVIEW_COUNT);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Calls
          {!error && !isLoading && (
            <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">
              ({allCalls.length})
            </span>
          )}
        </span>
      }
    >
      {error ? (
        <SectionError message="Failed to load calls." />
      ) : isLoading ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading calls...</p>
      ) : allCalls.length === 0 ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No calls found.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((call) => (
              <CallItem key={call.id} call={call} accountId={accountId} />
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-3 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-2 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
            >
              {expanded ? `Show last ${PREVIEW_COUNT}` : `View all ${allCalls.length} calls`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function InteractionSection({
  title,
  items,
  isLoading,
  error,
  onInteractionClick,
}: {
  title: string;
  items: Interaction[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onInteractionClick: (interaction: { id: string; sourceType: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allItems = items ?? [];
  const hasMore = allItems.length > PREVIEW_COUNT;
  const visible = expanded ? allItems : allItems.slice(0, PREVIEW_COUNT);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {title}
          {!error && !isLoading && <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">({allItems.length})</span>}
        </span>
      }
    >
      {error ? (
        <SectionError message={`Failed to load ${title.toLowerCase()}.`} />
      ) : isLoading ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading {title.toLowerCase()}...</p>
      ) : (
        <>
          <ActivityTimeline
            interactions={visible}
            onInteractionClick={onInteractionClick}
          />
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-3 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-2 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
            >
              {expanded ? `Show last ${PREVIEW_COUNT}` : `View all ${allItems.length} ${title.toLowerCase()}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

export default function AccountDetailPage() {
  const { accountId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: account, isLoading: accountLoading, error: accountError } = useAccount(accountId);
  const { data: calls, isLoading: callsLoading, error: callsError } = useAccountInteractions(accountId, { sourceTypes: ['gong_call'] });
  const { data: emails, isLoading: emailsLoading, error: emailsError } = useAccountInteractions(accountId, { sourceTypes: ['gmail_email'] });
  const { data: meetings, isLoading: meetingsLoading, error: meetingsError } = useAccountInteractions(accountId, { sourceTypes: ['calendar_event'] });
  const { data: opportunities } = useAccountOpportunities(accountId);
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useAccountOverview(accountId);
  const { data: actionItemsData, isLoading: actionItemsLoading, error: actionItemsError } = useAccountActionItems(accountId);

  const totalOpportunityValue = useMemo(() => {
    if (!opportunities) return null;
    const openOpps = opportunities.filter((o: Opportunity) => {
      const stage = (o.stage ?? '').toLowerCase();
      const name = (o.name ?? '').toLowerCase();
      return !stage.includes('closed') && !name.includes('renewal');
    });
    if (openOpps.length === 0) return null;
    // Use amount if available, fall back to arr from raw MCP data
    return openOpps.reduce((sum: number, o: Opportunity) => {
      const val = o.amount ?? (o as unknown as Record<string, unknown>).arr as number ?? 0;
      return sum + val;
    }, 0);
  }, [opportunities]);

  // Try to get basic account info from cached list data while detail loads
  const cachedAccounts = queryClient.getQueryData<Account[]>(['accounts', {}]);
  const cachedAccount = cachedAccounts?.find((a) => a.id === accountId);

  const handleInteractionClick = (interaction: { id: string; sourceType: string }) =>
    navigate({
      to: '/interactions/$accountId/$sourceType/$recordId',
      params: {
        accountId: accountId!,
        sourceType: interaction.sourceType,
        recordId: interaction.id,
      },
    });

  // Show full-page loading only if we have no data at all (no cached list data either)
  if (accountLoading && !account && !cachedAccount) return <PageLoading />;

  // Use detail account if available, fall back to cached list account for the header
  const displayAccount = account ?? cachedAccount;

  if (accountError && !displayAccount) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Failed to load account. The data source may be temporarily unavailable.</p>
      </div>
    );
  }
  if (!displayAccount) {
    return (
      <div className="p-6">
        <p className="text-[#6b677e]">Account not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">{displayAccount.name}</h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[#6b677e] dark:text-[#858198]">
            {displayAccount.region && <span>{displayAccount.region}</span>}
            {displayAccount.products?.length > 0 && (
              <span>{displayAccount.products.join(', ')}</span>
            )}
          </div>
          {accountError && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Some account details could not be loaded.
            </p>
          )}
        </div>
        {totalOpportunityValue !== null && (
          <div className="shrink-0 text-right">
            <p className="text-xs font-medium text-[#6b677e] dark:text-[#858198] uppercase tracking-wide">
              Open Pipeline
            </p>
            <p className="text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
              {formatCompactCurrency(totalOpportunityValue)}
            </p>
          </div>
        )}
      </div>

      {/* AI Account Overview */}
      <Card title="Account Summary">
        {overviewError ? (
          <SectionError message="Failed to load account overview." />
        ) : overviewLoading ? (
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
            <p className="text-sm text-[#6b677e] dark:text-[#858198]">
              Generating account overview...
            </p>
          </div>
        ) : overviewData?.overview ? (
          <AccountSummaryContent overview={overviewData.overview} />
        ) : (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No overview available.</p>
        )}
      </Card>

      {/* Action Items */}
      <Card title="Action Items">
        {actionItemsError ? (
          <SectionError message="Failed to load action items." />
        ) : actionItemsLoading ? (
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
            <p className="text-sm text-[#6b677e] dark:text-[#858198]">
              Extracting action items...
            </p>
          </div>
        ) : actionItemsData?.items && actionItemsData.items.length > 0 ? (
          <ul className="space-y-3">
            {actionItemsData.items.map((item: ActionItem, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734]">
                  <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#191726] dark:text-[#f2f2f2]">
                    {item.action}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                    <span>{item.source}</span>
                    <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                    <span>{formatDateTime(item.date)}</span>
                    {item.owner && (
                      <>
                        <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                        <span>{item.owner}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No action items found.</p>
        )}
      </Card>

      {/* Opportunities */}
      <Card
        title={
          <span className="flex items-center gap-2">
            Opportunities
            {opportunities && (
              <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">
                ({opportunities.filter((o: Opportunity) => {
                  const stage = (o.stage ?? '').toLowerCase();
                  return !stage.includes('closed');
                }).length} open)
              </span>
            )}
          </span>
        }
      >
        {!opportunities ? (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading opportunities...</p>
        ) : (() => {
          const openOpps = opportunities
            .filter((o: Opportunity) => {
              const stage = (o.stage ?? '').toLowerCase();
              return !stage.includes('closed');
            })
            .sort((a: Opportunity, b: Opportunity) => {
              const da = a.closeDate ?? '';
              const db = b.closeDate ?? '';
              return da.localeCompare(db);
            });
          return openOpps.length === 0 ? (
            <p className="text-sm text-[#6b677e] dark:text-[#858198]">No open opportunities.</p>
          ) : (
            <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
              {openOpps.map((opp: Opportunity) => {
                const val = opp.amount ?? (opp as unknown as Record<string, unknown>).arr as number | null;
                return (
                  <div
                    key={opp.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate">
                        {opp.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                        <span className="inline-flex items-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 py-0.5 text-xs font-medium text-[#6b26d9] dark:text-[#8249df]">
                          {opp.stage}
                        </span>
                        {opp.closeDate && (
                          <>
                            <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                            <span>Close {formatDate(opp.closeDate)}</span>
                          </>
                        )}
                        {opp.owner && (
                          <>
                            <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                            <span>{opp.owner}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {val != null && val > 0 && (
                      <span className="shrink-0 text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                        {formatCurrency(val)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {/* Calls, Emails & Meetings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CallSection
          calls={calls}
          isLoading={callsLoading}
          error={callsError}
          accountId={accountId!}
        />
        <EmailThreadSection
          emails={emails}
          isLoading={emailsLoading}
          error={emailsError}
          accountId={accountId!}
        />
        <InteractionSection
          title="Meetings"
          items={meetings}
          isLoading={meetingsLoading}
          error={meetingsError}
          onInteractionClick={handleInteractionClick}
        />
      </div>

      {/* Notes */}
      <Card title="Notes">
        <NoteList accountId={accountId} />
      </Card>
    </div>
  );
}
