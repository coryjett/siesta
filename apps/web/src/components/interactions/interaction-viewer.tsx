import type { InteractionDetail } from '@siesta/shared';
import { formatDateTime } from '../../lib/date';

/** Simple markdown renderer for AI-generated call briefs (## headings + bullet points). */
function renderContent(text: string) {
  // If content has markdown headings, render structured sections
  if (/^##\s/m.test(text)) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 space-y-1 mb-4">
            {listItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>,
        );
        listItems = [];
      }
    };

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) {
        flushList();
        elements.push(
          <h4 key={`h-${elements.length}`} className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2 first:mt-0">
            {headingMatch[1]}
          </h4>,
        );
      } else if (line.match(/^[-*]\s+/)) {
        listItems.push(line.replace(/^[-*]\s+/, ''));
      } else if (line.trim()) {
        flushList();
        elements.push(
          <p key={`p-${elements.length}`} className="mb-2">{line}</p>,
        );
      }
    }
    flushList();
    return <>{elements}</>;
  }

  // Plain text fallback
  return <div className="whitespace-pre-wrap">{text}</div>;
}

interface InteractionViewerProps {
  interaction: InteractionDetail;
}

export default function InteractionViewer({ interaction }: InteractionViewerProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-400 capitalize">
            {interaction.sourceType}
          </span>
          {interaction.sentiment && (
            <span className={`text-sm font-medium ${
              interaction.sentiment === 'negative' ? 'text-red-600' :
              interaction.sentiment === 'positive' ? 'text-green-600' :
              'text-gray-500'
            }`}>
              {interaction.sentiment}
            </span>
          )}
        </div>
        <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          {interaction.title}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {formatDateTime(interaction.date)}
        </p>
      </div>

      {/* Participants */}
      {interaction.participants?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Participants
          </h3>
          <div className="space-y-1">
            {interaction.participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                {p.email && (
                  <a href={`mailto:${p.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    {p.email}
                  </a>
                )}
                {p.role && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">({p.role})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {interaction.summary && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Summary</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{interaction.summary}</p>
        </div>
      )}

      {/* Content */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Content</h3>
        <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          {renderContent(interaction.content)}
        </div>
      </div>
    </div>
  );
}
