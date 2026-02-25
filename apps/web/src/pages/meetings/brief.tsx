import { useParams, useSearch, Link } from '@tanstack/react-router';
import { useAccount, useMeetingBrief } from '../../api/queries/accounts';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import { useMemo } from 'react';

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

    const boldHeading = line.match(/^\*\*(.+?)(?::)?\*\*(?::)?$/);
    const mdHeading = line.match(/^#{2,4}\s+(.+)/);

    if (boldHeading || mdHeading) {
      current = { heading: (boldHeading?.[1] ?? mdHeading?.[1] ?? '').trim(), bullets: [] };
      sections.push(current);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      const text = bullet[1].replace(/^\*\*(.+?)\*\*[:\s]*/, '$1: ').trim();
      if (current) {
        current.bullets.push(text);
      } else {
        current = { heading: '', bullets: [text] };
        sections.push(current);
      }
      continue;
    }

    const inlineBold = line.match(/^\*\*(.+?)\*\*[:\s]+(.+)/);
    if (inlineBold) {
      current = { heading: inlineBold[1].trim(), bullets: [inlineBold[2].trim()] };
      sections.push(current);
      continue;
    }

    if (current) {
      current.bullets.push(line);
    } else {
      current = { heading: '', bullets: [line] };
      sections.push(current);
    }
  }

  return sections;
}

function formatBriefDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function MeetingBriefPage() {
  const { accountId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { title?: string; date?: string };
  const title = search.title ?? '';
  const date = search.date ?? '';

  const { data: account } = useAccount(accountId);
  const { data: briefData, isLoading, error } = useMeetingBrief(accountId, title || undefined, date || undefined);

  const sections = useMemo(
    () => (briefData?.brief ? parseSummary(briefData.brief) : []),
    [briefData],
  );

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/accounts/$accountId"
          params={{ accountId: accountId! }}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          Back to {account?.name ?? 'account'}
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-[#191726] dark:text-[#f2f2f2]">
          {title || 'Meeting Brief'}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-[#6b677e] dark:text-[#858198]">
          {account && (
            <Link
              to="/accounts/$accountId"
              params={{ accountId: accountId! }}
              className="hover:text-[#6b26d9] dark:hover:text-[#8249df] transition-colors"
            >
              {account.name}
            </Link>
          )}
          {account && date && <span>-</span>}
          {date && <span>{formatBriefDate(date)}</span>}
        </div>
      </div>

      {/* Brief content */}
      <Card title="Meeting Prep Brief">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <span className="text-sm text-red-600 dark:text-red-400">Failed to generate meeting brief.</span>
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No brief available.</p>
        ) : (
          <div className="space-y-6">
            {sections.map((section, i) => (
              <div key={i}>
                {section.heading && (
                  <p className="text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-2">
                    {section.heading}
                  </p>
                )}
                {section.bullets.length > 0 && (
                  <ul className="space-y-1.5 ml-1">
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
        )}
      </Card>

      {/* Quick Links */}
      <Card title="Quick Links">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/accounts/$accountId"
            params={{ accountId: accountId! }}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
          >
            Account Overview
          </Link>
          <Link
            to="/accounts/$accountId/summary"
            params={{ accountId: accountId! }}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
          >
            AI Summary
          </Link>
          <Link
            to="/accounts/$accountId/technical-details"
            params={{ accountId: accountId! }}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
          >
            Technical Details
          </Link>
          <Link
            to="/accounts/$accountId/poc-status"
            params={{ accountId: accountId! }}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
          >
            POC Status
          </Link>
        </div>
      </Card>
    </div>
  );
}
