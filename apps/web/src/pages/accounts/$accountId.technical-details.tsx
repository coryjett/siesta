import { useParams, Link } from '@tanstack/react-router';
import { useAccountTechnicalDetails, useAccount } from '../../api/queries/accounts';
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

export default function TechnicalDetailsPage() {
  const { accountId } = useParams({ strict: false });
  const { data: account } = useAccount(accountId);
  const { data: techDetailsData, isLoading, error } = useAccountTechnicalDetails(accountId);
  const sections = useMemo(
    () => (techDetailsData?.details ? parseSummary(techDetailsData.details) : []),
    [techDetailsData],
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

      <Card title="Technical Details">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <span className="text-sm text-red-600 dark:text-red-400">Failed to load technical details.</span>
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">No technical details available.</p>
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
