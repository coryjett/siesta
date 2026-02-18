import { useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import {
  useOpportunity,
  useOpportunityContacts,
  useOpportunityActivities,
} from '../../api/queries/opportunities';
import { useCalls } from '../../api/queries/gong';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import Badge from '../../components/common/badge';
import DataTable, { type Column } from '../../components/common/data-table';
import ActivityTimeline from '../../components/accounts/activity-timeline';
import CallCard from '../../components/gong/call-card';
import NoteList from '../../components/notes/note-list';
import SortableCardList, {
  type SortableSection,
} from '../../components/common/sortable-card-list';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import type { SfOppContactRole } from '@siesta/shared';

function getStageBadgeVariant(
  stageName: string,
): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const lower = stageName.toLowerCase();
  if (lower.includes('closed won')) return 'success';
  if (lower.includes('closed lost')) return 'danger';
  if (lower.includes('negotiation') || lower.includes('proposal')) return 'warning';
  if (lower.includes('qualification') || lower.includes('discovery')) return 'info';
  return 'default';
}

export default function OpportunityDetailPage() {
  const { opportunityId } = useParams({ strict: false });
  const navigate = useNavigate();

  const { data: opp, isLoading: oppLoading } = useOpportunity(opportunityId);
  const { data: contacts, isLoading: contactsLoading } =
    useOpportunityContacts(opportunityId);
  const { data: activities, isLoading: activitiesLoading } =
    useOpportunityActivities(opportunityId);
  const { data: callsData, isLoading: callsLoading } =
    useCalls({ opportunityId });

  const contactColumns: Column<SfOppContactRole>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (row) =>
          `${row.contact?.firstName || ''} ${row.contact?.lastName || ''}`.trim(),
      },
      {
        key: 'title',
        header: 'Title',
        render: (row) => row.contact?.title || '',
      },
      {
        key: 'email',
        header: 'Email',
        render: (row) =>
          row.contact?.email ? (
            <a
              href={`mailto:${row.contact.email}`}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {row.contact.email}
            </a>
          ) : (
            ''
          ),
      },
      {
        key: 'phone',
        header: 'Phone',
        render: (row) => row.contact?.phone || '',
      },
      {
        key: 'role',
        header: 'Role',
        render: (row) => row.role || '',
      },
      {
        key: 'isPrimary',
        header: 'Primary',
        render: (row) =>
          row.isPrimary ? <Badge variant="info">Primary</Badge> : null,
      },
    ],
    [],
  );

  const sections: SortableSection[] = useMemo(() => {
    if (!opp) return [];
    return [
      {
        id: 'details',
        render: (dragHandleProps) => (
          <Card title="Details" dragHandleProps={dragHandleProps}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Stage" value={opp.stageName} />
              <DetailField label="Amount" value={formatCurrency(opp.amount)} />
              <DetailField label="Close Date" value={formatDate(opp.closeDate)} />
              <DetailField
                label="Probability"
                value={opp.probability != null ? `${opp.probability}%` : null}
              />
              <DetailField label="Type" value={opp.type} />
              <DetailField label="Lead Source" value={opp.leadSource} />
              <DetailField label="Owner" value={opp.ownerName} />
              <DetailField label="Assigned SE" value={opp.assignedSeName} />
              <DetailField label="Account" value={opp.accountName} />
              <DetailField
                label="Last Activity"
                value={formatDate(opp.lastActivityDate)}
              />
              <DetailField label="Next Step" value={opp.nextStep} />
              <DetailField
                label="Closed"
                value={opp.isClosed ? (opp.isWon ? 'Won' : 'Lost') : 'Open'}
              />
            </div>
            {opp.description && (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Description
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {opp.description}
                </p>
              </div>
            )}
          </Card>
        ),
      },
      {
        id: 'contacts',
        render: (dragHandleProps) => (
          <Card title="Contacts" dragHandleProps={dragHandleProps}>
            {contactsLoading ? (
              <p className="text-sm text-gray-500">Loading contacts...</p>
            ) : contacts && contacts.length > 0 ? (
              <DataTable
                columns={contactColumns}
                data={contacts as unknown as Record<string, unknown>[]}
                keyExtractor={(row) => (row as unknown as SfOppContactRole).id}
              />
            ) : (
              <p className="text-sm text-gray-500">
                No contacts associated with this opportunity.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'activities',
        render: (dragHandleProps) => (
          <Card title="Activities" dragHandleProps={dragHandleProps}>
            {activitiesLoading ? (
              <p className="text-sm text-gray-500">Loading activities...</p>
            ) : (
              <ActivityTimeline activities={activities ?? []} />
            )}
          </Card>
        ),
      },
      {
        id: 'gong-calls',
        render: (dragHandleProps) => (
          <Card
            title={`Gong Calls (${callsData?.calls.length ?? 0})`}
            dragHandleProps={dragHandleProps}
          >
            {callsLoading ? (
              <p className="text-sm text-gray-500">Loading calls...</p>
            ) : callsData && callsData.calls.length > 0 ? (
              <div className="space-y-3">
                {callsData.calls.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    onClick={() =>
                      navigate({
                        to: '/gong/$callId',
                        params: { callId: call.id },
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No Gong calls linked to this opportunity.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'notes',
        render: (dragHandleProps) => (
          <Card title="Notes" dragHandleProps={dragHandleProps}>
            <NoteList opportunityId={opportunityId} />
          </Card>
        ),
      },
    ];
  }, [
    opp,
    contacts,
    contactsLoading,
    contactColumns,
    activities,
    activitiesLoading,
    callsData,
    callsLoading,
    navigate,
    opportunityId,
  ]);

  if (oppLoading) return <PageLoading />;
  if (!opp) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Opportunity not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{opp.name}</h1>
          <Badge variant={getStageBadgeVariant(opp.stageName)}>
            {opp.stageName}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {formatCurrency(opp.amount)}
          </span>
          <span>Close Date: {formatDate(opp.closeDate)}</span>
          {opp.accountName && <span>Account: {opp.accountName}</span>}
          {opp.assignedSeName && <span>SE: {opp.assignedSeName}</span>}
        </div>
      </div>

      <SortableCardList
        pageKey="opportunity-detail"
        sections={sections}
        className="space-y-6"
      />
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{value || '--'}</p>
    </div>
  );
}
