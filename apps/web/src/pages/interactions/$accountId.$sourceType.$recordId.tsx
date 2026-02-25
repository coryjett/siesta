import { useParams, Link, useSearch } from '@tanstack/react-router';
import { useInteractionDetail } from '../../api/queries/interactions';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import InteractionViewer from '../../components/interactions/interaction-viewer';

export default function InteractionDetailPage() {
  const { accountId, sourceType, recordId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const title = search?.title;

  const { data: interaction, isLoading, error } = useInteractionDetail(
    accountId,
    sourceType,
    recordId,
    title,
    { brief: sourceType === 'gong_call' },
  );

  if (isLoading) return <PageLoading />;

  if (error) {
    const message = (error as Error)?.message || 'Failed to load interaction details.';
    const isNotFound = message.includes('no rows') || message.includes('not found');
    const isUnsupported = message.toLowerCase().includes('unsupported');
    return (
      <div className="space-y-6 p-6">
        <div>
          <Link
            to="/accounts/$accountId"
            params={{ accountId: accountId! }}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Back to account
          </Link>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          {isUnsupported
            ? `Detail view is not yet available for ${sourceType?.replace(/_/g, ' ')} interactions.`
            : isNotFound
            ? 'This interaction could not be found in the data source. It may have been deleted or is not yet synced.'
            : `Failed to load interaction details: ${message}`}
        </p>
      </div>
    );
  }

  if (!interaction) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Interaction not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/accounts/$accountId"
          params={{ accountId: accountId! }}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          Back to account
        </Link>
      </div>

      <Card>
        <InteractionViewer interaction={interaction} />
      </Card>
    </div>
  );
}
