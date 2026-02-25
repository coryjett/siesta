import type { ArchitectureDoc } from '@siesta/shared';
import { formatDate } from '../../lib/date';
import EmptyState from '../common/empty-state';

interface DocViewerProps {
  doc: ArchitectureDoc;
}

export default function DocViewer({ doc }: DocViewerProps) {
  if (!doc.content) {
    return <EmptyState title="No documentation" description="No architecture documentation available for this account." />;
  }

  return (
    <div>
      {doc.lastUpdated && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {formatDate(doc.lastUpdated)}
        </p>
      )}
      <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 whitespace-pre-wrap">
        {doc.content}
      </div>
    </div>
  );
}
