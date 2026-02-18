import { useMemo } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useCall } from '../../api/queries/gong';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import Badge from '../../components/common/badge';
import TranscriptViewer from '../../components/gong/transcript-viewer';
import SortableCardList, {
  type SortableSection,
} from '../../components/common/sortable-card-list';

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CallDetailPage() {
  const { callId } = useParams({ strict: false });
  const { data: call, isLoading, error } = useCall(callId);

  const sections: SortableSection[] = useMemo(() => {
    if (!call) return [];

    const internalParticipants =
      call.participants?.filter((p) => p.role === 'internal') ?? [];
    const externalParticipants =
      call.participants?.filter((p) => p.role === 'external') ?? [];

    return [
      {
        id: 'participants',
        render: (dragHandleProps) => (
          <Card
            title={`Participants (${call.participants?.length ?? 0})`}
            dragHandleProps={dragHandleProps}
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {internalParticipants.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-blue-700">
                    Internal ({internalParticipants.length})
                  </h4>
                  <ul className="space-y-1">
                    {internalParticipants.map((p, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {p.name}
                        {p.email && (
                          <span className="ml-2 text-gray-400">{p.email}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {externalParticipants.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-600">
                    External ({externalParticipants.length})
                  </h4>
                  <ul className="space-y-1">
                    {externalParticipants.map((p, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {p.name}
                        {p.email && (
                          <span className="ml-2 text-gray-400">{p.email}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {(!call.participants || call.participants.length === 0) && (
              <p className="text-sm text-gray-500">
                No participant data available.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'transcript',
        render: (dragHandleProps) => (
          <Card title="Transcript" dragHandleProps={dragHandleProps}>
            {call.transcript && call.transcript.segments?.length > 0 ? (
              <TranscriptViewer segments={call.transcript.segments} />
            ) : (
              <p className="text-sm text-gray-500 italic">
                No transcript available for this call.
              </p>
            )}
          </Card>
        ),
      },
    ];
  }, [call]);

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load call details.</p>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Call not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {call.title || 'Untitled Call'}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>{formatDate(call.started)}</span>
          <span>{formatDuration(call.duration)}</span>
          {call.media && (
            <Badge variant="default" className="capitalize">
              {call.media}
            </Badge>
          )}
          {call.direction && (
            <Badge variant="info" className="capitalize">
              {call.direction}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          {call.accountName && call.accountId && (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <span className="font-medium text-gray-500">Account:</span>
              <Link
                to="/accounts/$accountId"
                params={{ accountId: call.accountId }}
                className="text-indigo-600 hover:text-indigo-800"
              >
                {call.accountName}
              </Link>
            </span>
          )}
          {call.opportunityName && call.opportunityId && (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <span className="font-medium text-gray-500">Opportunity:</span>
              <Link
                to="/opportunities/$opportunityId"
                params={{ opportunityId: call.opportunityId }}
                className="text-indigo-600 hover:text-indigo-800"
              >
                {call.opportunityName}
              </Link>
            </span>
          )}
        </div>
      </div>

      <SortableCardList
        pageKey="gong-call-detail"
        sections={sections}
        className="space-y-6"
      />
    </div>
  );
}
