import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useAccountInteractions,
  useAccountOpportunities,
  useAccountOverview,
  useAccountActionItems,
  useAccountContacts,
  useAccountTechnicalDetails,
  useEmailThreadSummary,
  useWarmGongBriefs,
  useAccountPOCSummary,
  useCompleteActionItem,
  useUncompleteActionItem,
  useContactInsights,
} from '../../api/queries/accounts';
import type { ActionItem, ContactInsight, ContactPersonalInfoEntry } from '../../api/queries/accounts';
import { useAuth } from '../../contexts/auth-context';
import { useInteractionDetail } from '../../api/queries/interactions';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import ActivityTimeline from '../../components/accounts/activity-timeline';
import NoteList from '../../components/notes/note-list';
import { formatDateTime, formatDate } from '../../lib/date';
import { formatCurrency, formatCompactCurrency } from '../../lib/currency';
import type { Account, Contact, Interaction, Opportunity } from '@siesta/shared';

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
    <CollapsibleSection
      title="Emails"
      count={threads.length}
      isLoading={isLoading}
      error={error}
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
    </CollapsibleSection>
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

function AccountSummarySection({
  overview,
  isLoading,
  error,
  accountId,
}: {
  overview: { overview: string | null } | undefined;
  isLoading: boolean;
  error: Error | null;
  accountId: string;
}) {
  const navigate = useNavigate();
  const preview = useMemo(() => {
    if (!overview?.overview) return [];
    const sections = parseSummary(overview.overview);
    // Show first 3 sections, first bullet each
    return sections.slice(0, 3).map((s) => ({
      heading: s.heading,
      bullet: s.bullets[0] ?? '',
    }));
  }, [overview]);

  return (
    <Card title="Account Summary">
      {error ? (
        <SectionError message="Failed to load account overview." />
      ) : isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            Generating account overview...
          </p>
        </div>
      ) : preview.length > 0 ? (
        <div className="space-y-3">
          {preview.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] mb-0.5">
                  {s.heading}
                </p>
              )}
              {s.bullet && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {s.bullet}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              navigate({
                to: '/accounts/$accountId/summary',
                params: { accountId },
              })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline"
          >
            View full summary
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No overview available.</p>
      )}
    </Card>
  );
}

function POCHealthBadge({ health }: { health: { rating: 'green' | 'yellow' | 'red'; reason: string } }) {
  const config = {
    green: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', label: 'Healthy' },
    yellow: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'Caution' },
    red: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', label: 'At Risk' },
  }[health.rating];

  return (
    <div className="relative group">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
        <div className="rounded-lg bg-gray-900 dark:bg-gray-700 px-3 py-2 text-xs text-white shadow-lg max-w-60 text-center whitespace-normal">
          {health.reason}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      </div>
    </div>
  );
}

function POCHealthDot({ health }: { health: { rating: 'green' | 'yellow' | 'red'; reason: string } }) {
  const color = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' }[health.rating];
  const label = { green: 'Healthy', yellow: 'Caution', red: 'At Risk' }[health.rating];

  return (
    <span className="relative group shrink-0" title={`${label}: ${health.reason}`}>
      <span className={`inline-block h-3 w-3 rounded-full ${color} shadow-sm`} />
    </span>
  );
}

function POCStatusSection({
  pocData,
  isLoading,
  error,
  accountId,
}: {
  pocData: { summary: string | null; health: { rating: 'green' | 'yellow' | 'red'; reason: string } | null } | undefined;
  isLoading: boolean;
  error: Error | null;
  accountId: string;
}) {
  const navigate = useNavigate();
  const preview = useMemo(() => {
    if (!pocData?.summary) return [];
    const sections = parseSummary(pocData.summary);
    return sections.slice(0, 3).map((s) => ({
      heading: s.heading,
      bullet: s.bullets[0] ?? '',
    }));
  }, [pocData]);

  return (
    <Card
      title="POC Status"
      headerRight={pocData?.health ? <POCHealthBadge health={pocData.health} /> : undefined}
    >
      {error ? (
        <SectionError message="Failed to load POC summary." />
      ) : isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            Analyzing POC activity...
          </p>
        </div>
      ) : preview.length > 0 ? (
        <div className="space-y-3">
          {preview.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] mb-0.5">
                  {s.heading}
                </p>
              )}
              {s.bullet && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {s.bullet}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              navigate({
                to: '/accounts/$accountId/poc-status',
                params: { accountId },
              })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline"
          >
            View full POC details
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
      <span className="text-sm text-red-600 dark:text-red-400">{message}</span>
    </div>
  );
}

/**
 * Truncate a summary string to roughly `maxLen` characters,
 * breaking at the last whitespace before the limit.
 */
/**
 * Extract just the summary paragraph from a Gong call brief.
 * The brief typically starts with "Summary:\n..." followed by
 * sections like "Key Highlights:", "Action Items:", etc.
 */
function extractSummaryParagraph(content: string): string {
  // Strip "Summary:" / "Summary:\n" prefix
  let text = content.replace(/^summary:?\s*/i, '').trim();
  // Stop before the first section header (Key Highlights, Action Items, Next Steps, etc.)
  const sectionMatch = text.search(/\n\s*(?:key highlights|action items|next steps|key points|follow[- ]?up|outcomes|decisions)[\s:]/i);
  if (sectionMatch > 0) {
    text = text.slice(0, sectionMatch).trim();
  }
  return text;
}

function CallItem({
  call,
  accountId,
}: {
  call: Interaction;
  accountId: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: detail, isLoading } = useInteractionDetail(
    open ? accountId : undefined,
    open ? call.sourceType : undefined,
    open ? call.id : undefined,
    call.title,
  );

  // Check if the detail content is an MCP error (short error string, not real content)
  const isMcpError = (text: string | null | undefined): boolean => {
    if (!text) return true;
    if (text.length > 200) return false;
    const lower = text.toLowerCase().trim();
    return lower.includes('no rows in result set') || lower === 'not found' || lower.startsWith('error:');
  };

  const hasFullContent = !isMcpError(detail?.content);
  // Inline expand: show just the summary paragraph
  const inlineSummary = hasFullContent
    ? extractSummaryParagraph(detail!.content)
    : (detail?.summary ?? call.preview ?? '');
  const participants = detail?.participants ?? [];

  const goToDetail = () =>
    navigate({
      to: '/interactions/$accountId/$sourceType/$recordId',
      params: {
        accountId,
        sourceType: call.sourceType,
        recordId: call.id,
      },
      search: { title: call.title },
    });

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
            ) : inlineSummary ? (
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
                  {inlineSummary}
                </div>
                {hasFullContent && (
                  <button
                    type="button"
                    onClick={goToDetail}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline"
                  >
                    View full call brief
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
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

function CollapsibleSection({
  title,
  count,
  isLoading,
  error,
  defaultCollapsed = true,
  children,
}: {
  title: string;
  count: number;
  isLoading: boolean;
  error: Error | null;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="bg-white dark:bg-[#14131b] rounded-xl shadow-sm border border-[#dedde4] dark:border-[#2a2734]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4 text-left hover:bg-gray-50/50 dark:hover:bg-[#1e1c27]/50 transition-colors rounded-xl"
      >
        <h3 className="font-display text-base md:text-lg font-semibold text-[#191726] dark:text-[#f2f2f2] flex items-center gap-2">
          {title}
          {!error && !isLoading && (
            <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">
              ({count})
            </span>
          )}
        </h3>
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
          className={`shrink-0 text-[#6b677e] dark:text-[#858198] transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!collapsed && (
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          {children}
        </div>
      )}
    </div>
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
    <CollapsibleSection
      title="Calls"
      count={allCalls.length}
      isLoading={isLoading}
      error={error}
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
    </CollapsibleSection>
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

const INSIGHT_LABELS: Record<string, string> = {
  location: 'Location',
  interests: 'Interests',
  family: 'Family',
  hobbies: 'Hobbies',
  background: 'Background',
  travel: 'Travel',
  other: 'Other',
};

function ContactsSection({
  contacts,
  isLoading,
  error,
  insights,
}: {
  contacts: Contact[] | undefined;
  isLoading: boolean;
  error: Error | null;
  insights?: ContactInsight[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const allContacts = contacts ?? [];
  const hasMore = allContacts.length > PREVIEW_COUNT;
  const visible = expanded ? allContacts : allContacts.slice(0, PREVIEW_COUNT);

  const insightMap = useMemo(() => {
    if (!insights) return new Map<string, ContactInsight>();
    const map = new Map<string, ContactInsight>();
    for (const insight of insights) {
      map.set(insight.contactName.toLowerCase(), insight);
    }
    return map;
  }, [insights]);

  const toggleInsight = (contactName: string) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      if (next.has(contactName)) {
        next.delete(contactName);
      } else {
        next.add(contactName);
      }
      return next;
    });
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Contacts
          {!error && !isLoading && (
            <span className="text-xs font-normal text-[#6b677e] dark:text-[#858198]">
              ({allContacts.length})
            </span>
          )}
        </span>
      }
    >
      {error ? (
        <SectionError message="Failed to load contacts." />
      ) : isLoading ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading contacts...</p>
      ) : allContacts.length === 0 ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No contacts found.</p>
      ) : (
        <>
          <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
            {visible.map((contact) => {
              const insight = insightMap.get((contact.name ?? '').toLowerCase());
              const isInsightExpanded = expandedInsights.has(contact.name ?? '');
              const infoEntries = insight
                ? Object.entries(insight.personalInfo).filter(([, v]) => v)
                : [];

              return (
                <div key={contact.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20">
                      <span className="text-sm font-semibold text-[#6b26d9] dark:text-[#8249df]">
                        {(contact.name ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate">
                        {contact.name ?? 'Unknown'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                        {contact.title && <span>{contact.title}</span>}
                        {contact.title && contact.email && (
                          <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                        )}
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-[#6b26d9] dark:text-[#8249df] hover:underline truncate"
                          >
                            {contact.email}
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                        {contact.gongCallCount > 0 && (
                          <span>{contact.gongCallCount} call{contact.gongCallCount !== 1 ? 's' : ''}</span>
                        )}
                        {contact.emailCount > 0 && (
                          <>
                            {contact.gongCallCount > 0 && (
                              <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                            )}
                            <span>{contact.emailCount} email{contact.emailCount !== 1 ? 's' : ''}</span>
                          </>
                        )}
                        {contact.lastInteractionDate && (
                          <>
                            {(contact.gongCallCount > 0 || contact.emailCount > 0) && (
                              <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                            )}
                            <span>Last: {formatDate(contact.lastInteractionDate)}</span>
                          </>
                        )}
                      </div>
                      {infoEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleInsight(contact.name ?? '')}
                          className="mt-1 text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline"
                        >
                          {isInsightExpanded ? 'Hide personal notes' : 'Personal notes'}
                        </button>
                      )}
                    </div>
                  </div>
                  {isInsightExpanded && insight && infoEntries.length > 0 && (
                    <div className="mt-2 ml-12 rounded-lg bg-[#f8f7fa] dark:bg-[#1e1b2e] p-3 text-xs">
                      <div className="space-y-1.5">
                        {infoEntries.map(([key, value]) => {
                          const entry = (typeof value === 'string' ? { value } : value) as ContactPersonalInfoEntry;
                          return (
                            <div key={key} className="flex gap-2">
                              <span className="font-medium text-[#191726] dark:text-[#f2f2f2] shrink-0">
                                {INSIGHT_LABELS[key] ?? key}:
                              </span>
                              <span className="text-[#6b677e] dark:text-[#858198]">
                                {entry.value}
                                {entry.date && (
                                  <span className="ml-1.5 text-[10px] text-[#9e9ab0] dark:text-[#6b677e]">
                                    ({formatDate(entry.date)})
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10px] text-[#9e9ab0] dark:text-[#6b677e]">
                        from {insight.sourceCallTitles.length} call{insight.sourceCallTitles.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-3 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-2 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
            >
              {expanded ? `Show top ${PREVIEW_COUNT}` : `View all ${allContacts.length} contacts`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function TechnicalDetailsSection({
  techDetails,
  isLoading,
  error,
  accountId,
}: {
  techDetails: { details: string | null } | undefined;
  isLoading: boolean;
  error: Error | null;
  accountId: string;
}) {
  const navigate = useNavigate();
  const preview = useMemo(() => {
    if (!techDetails?.details) return [];
    const sections = parseSummary(techDetails.details);
    // Show first 3 sections, first bullet each
    return sections.slice(0, 3).map((s) => ({
      heading: s.heading,
      bullet: s.bullets[0] ?? '',
    }));
  }, [techDetails]);

  return (
    <Card title="Technical Details">
      {error ? (
        <SectionError message="Failed to load technical details." />
      ) : isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            Analyzing calls, emails, and architecture docs...
          </p>
        </div>
      ) : preview.length > 0 ? (
        <div className="space-y-3">
          {preview.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] mb-0.5">
                  {s.heading}
                </p>
              )}
              {s.bullet && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {s.bullet}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              navigate({
                to: '/accounts/$accountId/technical-details',
                params: { accountId },
              })
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline"
          >
            View full technical details
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No technical details available.</p>
      )}
    </Card>
  );
}

function MeetingsSection({
  meetings,
  isLoading,
  error,
  onInteractionClick,
}: {
  meetings: Interaction[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onInteractionClick: (interaction: { id: string; sourceType: string }) => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const [expandedUpcoming, setExpandedUpcoming] = useState(false);
  const [expandedPast, setExpandedPast] = useState(false);

  const now = new Date();
  const { upcoming, past } = useMemo(() => {
    const all = meetings ?? [];
    const upcoming: Interaction[] = [];
    const past: Interaction[] = [];
    for (const m of all) {
      if (new Date(m.date) >= now) {
        upcoming.push(m);
      } else {
        past.push(m);
      }
    }
    // Upcoming: soonest first
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // Past: most recent first
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { upcoming, past };
  }, [meetings]);

  const upcomingHasMore = upcoming.length > PREVIEW_COUNT;
  const pastHasMore = past.length > PREVIEW_COUNT;
  const visibleUpcoming = expandedUpcoming ? upcoming : upcoming.slice(0, PREVIEW_COUNT);
  const visiblePast = expandedPast ? past : past.slice(0, PREVIEW_COUNT);

  return (
    <CollapsibleSection
      title="Meetings"
      count={(meetings ?? []).length}
      isLoading={isLoading}
      error={error}
    >
      {error ? (
        <SectionError message="Failed to load meetings." />
      ) : isLoading ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">Loading meetings...</p>
      ) : (meetings ?? []).length === 0 ? (
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">No meetings found.</p>
      ) : (
        <div className="space-y-4">
          {/* Upcoming Meetings */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b26d9] dark:text-[#8249df] mb-2">
                Upcoming ({upcoming.length})
              </p>
              <ActivityTimeline
                interactions={visibleUpcoming}
                onInteractionClick={onInteractionClick}
              />
              {upcomingHasMore && (
                <button
                  type="button"
                  onClick={() => setExpandedUpcoming(!expandedUpcoming)}
                  className="mt-2 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-1.5 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
                >
                  {expandedUpcoming ? `Show next ${PREVIEW_COUNT}` : `View all ${upcoming.length} upcoming`}
                </button>
              )}
            </div>
          )}

          {/* Past Meetings */}
          {past.length > 0 && (
            <div>
              {upcoming.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowPast(!showPast)}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#6b677e] dark:text-[#858198] mb-2 hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${showPast ? 'rotate-90' : ''}`}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  Past ({past.length})
                </button>
              ) : (
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b677e] dark:text-[#858198] mb-2">
                  Past ({past.length})
                </p>
              )}
              {(upcoming.length === 0 || showPast) && (
                <>
                  <ActivityTimeline
                    interactions={visiblePast}
                    onInteractionClick={onInteractionClick}
                  />
                  {pastHasMore && (
                    <button
                      type="button"
                      onClick={() => setExpandedPast(!expandedPast)}
                      className="mt-2 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-1.5 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:bg-[#6b26d9]/5 dark:hover:bg-[#8249df]/10 transition-colors"
                    >
                      {expandedPast ? `Show last ${PREVIEW_COUNT}` : `View all ${past.length} past`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

export default function AccountDetailPage() {
  const { accountId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: account, isLoading: accountLoading, error: accountError } = useAccount(accountId);
  const { data: calls, isLoading: callsLoading, error: callsError } = useAccountInteractions(accountId, { sourceTypes: ['gong_call'] });
  const { data: emails, isLoading: emailsLoading, error: emailsError } = useAccountInteractions(accountId, { sourceTypes: ['gmail_email'] });
  const { data: meetings, isLoading: meetingsLoading, error: meetingsError } = useAccountInteractions(accountId, { sourceTypes: ['calendar_event'] });
  const { data: opportunities } = useAccountOpportunities(accountId);
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useAccountOverview(accountId);
  const { data: actionItemsData, isLoading: actionItemsLoading, error: actionItemsError } = useAccountActionItems(accountId);
  const { data: contacts, isLoading: contactsLoading, error: contactsError } = useAccountContacts(accountId);
  const { data: contactInsightsData } = useContactInsights(accountId);
  const { data: techDetailsData, isLoading: techDetailsLoading, error: techDetailsError } = useAccountTechnicalDetails(accountId);
  const { data: pocData, isLoading: pocLoading, error: pocError } = useAccountPOCSummary(accountId);

  const completeAction = useCompleteActionItem();
  const uncompleteAction = useUncompleteActionItem();
  const [showAllItems, setShowAllItems] = useState(false);

  // Pre-warm Gong call briefs when calls load
  const warmGongBriefs = useWarmGongBriefs();
  const warmedRef = useRef<string | null>(null);
  useEffect(() => {
    if (accountId && calls && calls.length > 0 && warmedRef.current !== accountId) {
      warmedRef.current = accountId;
      warmGongBriefs.mutate(accountId);
    }
  }, [accountId, calls]);

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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2] truncate">{displayAccount.name}</h1>
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

      {/* Account Summary & Technical Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AccountSummarySection
          overview={overviewData}
          isLoading={overviewLoading}
          error={overviewError}
          accountId={accountId!}
        />
        <TechnicalDetailsSection
          techDetails={techDetailsData}
          isLoading={techDetailsLoading}
          error={techDetailsError}
          accountId={accountId!}
        />
      </div>

      {/* POC Summary */}
      {(pocLoading || pocData?.summary) && (
        <POCStatusSection
          pocData={pocData}
          isLoading={pocLoading}
          error={pocError}
          accountId={accountId!}
        />
      )}

      {/* Action Items */}
      <Card title={
        <span className="flex items-center gap-3">
          Action Items
          {actionItemsData?.items && actionItemsData.items.length > 0 && (
            <span className="flex rounded-lg border border-[#dedde4] dark:border-[#2a2734] overflow-hidden text-[10px] font-semibold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setShowAllItems(false)}
                className={`px-2.5 py-1 transition-colors cursor-pointer ${!showAllItems ? 'bg-[#6b26d9] dark:bg-[#8249df] text-white' : 'text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'}`}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => setShowAllItems(true)}
                className={`px-2.5 py-1 transition-colors cursor-pointer ${showAllItems ? 'bg-[#6b26d9] dark:bg-[#8249df] text-white' : 'text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'}`}
              >
                All
              </button>
            </span>
          )}
        </span>
      }>
        {actionItemsError ? (
          <SectionError message="Failed to load action items." />
        ) : actionItemsLoading ? (
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
            <p className="text-sm text-[#6b677e] dark:text-[#858198]">
              Extracting action items...
            </p>
          </div>
        ) : actionItemsData?.items && actionItemsData.items.length > 0 ? (() => {
          const allItems = actionItemsData.items;
          const myItems = allItems.filter((i: ActionItem) => {
            if (!i.owner || !user?.name) return false;
            const ownerLower = i.owner.toLowerCase();
            const nameLower = user.name.toLowerCase();
            return ownerLower.includes(nameLower) || nameLower.includes(ownerLower)
              || nameLower.split(' ').some((part) => part.length > 1 && ownerLower.includes(part));
          });
          const baseItems = showAllItems ? allItems : myItems;
          const openItems = baseItems.filter((i: ActionItem) => i.status === 'open');
          const doneItems = baseItems.filter((i: ActionItem) => i.status === 'done');
          const displayItems = openItems;

          return (
            <>
              {displayItems.length === 0 ? (
                <p className="text-sm text-[#6b677e] dark:text-[#858198]">
                  {showAllItems ? 'No action items found.' : 'No action items assigned to you.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {displayItems.map((item: ActionItem) => {
                    const isDone = item.status === 'done';
                    const isOwner = item.owner && user?.name && (() => {
                      const ownerLower = item.owner!.toLowerCase();
                      const nameLower = user.name.toLowerCase();
                      return ownerLower.includes(nameLower) || nameLower.includes(ownerLower)
                        || nameLower.split(' ').some((part) => part.length > 1 && ownerLower.includes(part));
                    })();
                    return (
                      <li key={item.id} className={`flex items-start gap-3${isDone ? ' opacity-60' : ''}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!accountId) return;
                            if (isDone) {
                              uncompleteAction.mutate({ accountId, hash: item.id });
                            } else {
                              completeAction.mutate({ accountId, hash: item.id });
                            }
                          }}
                          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedde4] dark:border-[#2a2734] transition-colors hover:border-[#6b26d9] dark:hover:border-[#8249df] cursor-pointer"
                        >
                          {isDone ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b26d9] dark:text-[#8249df]">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className="h-2 w-2 rounded-sm bg-[#6b26d9]/40 dark:bg-[#8249df]/40" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm text-[#191726] dark:text-[#f2f2f2]${isDone ? ' line-through' : ''}`}>
                            {item.action}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
                            {item.sourceType && item.recordId ? (
                              <button
                                type="button"
                                onClick={() => navigate({
                                  to: '/interactions/$accountId/$sourceType/$recordId',
                                  params: { accountId: accountId!, sourceType: item.sourceType, recordId: item.recordId! },
                                  search: { title: item.source },
                                } as never)}
                                className="text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                              >
                                {item.source}
                              </button>
                            ) : (
                              <span>{item.source}</span>
                            )}
                            <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                            <span>{formatDateTime(item.date)}</span>
                            {item.owner && (
                              <>
                                <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                                <span className={isOwner ? 'font-semibold text-[#6b26d9] dark:text-[#8249df]' : ''}>{item.owner}</span>
                              </>
                            )}
                            {isDone && item.completedAt && (
                              <>
                                <span className="text-[#dedde4] dark:text-[#2a2734]">|</span>
                                <span>Completed {formatDateTime(item.completedAt)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {doneItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/action-items' })}
                  className="mt-4 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] hover:underline cursor-pointer"
                >
                  View all ({doneItems.length} completed)
                </button>
              )}
            </>
          );
        })() : (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No action items found.</p>
        )}
      </Card>

      {/* Contacts & Opportunities */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContactsSection
          contacts={contacts}
          isLoading={contactsLoading}
          error={contactsError}
          insights={contactInsightsData?.insights}
        />
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
                      <div className="flex shrink-0 items-center gap-3">
                        {val != null && val > 0 && (
                          <span className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                            {formatCurrency(val)}
                          </span>
                        )}
                        {pocData?.health && <POCHealthDot health={pocData.health} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>
      </div>

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
        <MeetingsSection
          meetings={meetings}
          isLoading={meetingsLoading}
          error={meetingsError}
          onInteractionClick={handleInteractionClick}
        />
      </div>

      {/* Notes */}
      <NoteList accountId={accountId} />
    </div>
  );
}
