import { useParams, Link } from '@tanstack/react-router';
import { useAccountPOCSummary, useAccount } from '../../api/queries/accounts';
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

    const bullet = line.match(/^[-*•]\s+(.+)/);
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

export default function POCStatusPage() {
  const { accountId } = useParams({ strict: false });
  const { data: account } = useAccount(accountId);
  const { data: pocData, isLoading, error } = useAccountPOCSummary(accountId);
  const sections = useMemo(
    () => (pocData?.summary ? parseSummary(pocData.summary) : []),
    [pocData],
  );

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/accounts/$accountId"
          params={{ accountId: accountId! }}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          Back to {account?.name ?? 'account'}
        </Link>
      </div>

      <Card
        title="POC Status"
        headerRight={pocData?.health ? <POCHealthBadge health={pocData.health} /> : undefined}
      >
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <span className="text-sm text-red-600 dark:text-red-400">Failed to load POC summary.</span>
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No POC activity detected.</p>
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
    </div>
  );
}
