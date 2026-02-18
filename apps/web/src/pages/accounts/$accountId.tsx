import { useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import {
  useAccount,
  useAccountOpportunities,
  useAccountContacts,
  useAccountActivities,
} from '../../api/queries/accounts';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';
import Badge from '../../components/common/badge';
import DataTable, { type Column } from '../../components/common/data-table';
import AccountOverview from '../../components/accounts/account-overview';
import ActivityTimeline from '../../components/accounts/activity-timeline';
import CallCard from '../../components/gong/call-card';
import NoteList from '../../components/notes/note-list';
import SortableCardList, {
  type SortableSection,
} from '../../components/common/sortable-card-list';
import { useCalls } from '../../api/queries/gong';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import type { SfOpportunity, SfContact } from '@siesta/shared';

export default function AccountDetailPage() {
  const { accountId } = useParams({ strict: false });
  const navigate = useNavigate();

  const { data: account, isLoading: accountLoading } = useAccount(accountId);
  const { data: opportunities, isLoading: oppsLoading } =
    useAccountOpportunities(accountId);
  const { data: contacts, isLoading: contactsLoading } =
    useAccountContacts(accountId);
  const { data: activities, isLoading: activitiesLoading } =
    useAccountActivities(accountId);
  const { data: callsData, isLoading: callsLoading } =
    useCalls({ accountId });

  const oppColumns: Column<SfOpportunity>[] = useMemo(
    () => [
      { key: 'name', header: 'Name' },
      { key: 'stageName', header: 'Stage' },
      {
        key: 'amount',
        header: 'Amount',
        render: (row) => formatCurrency(row.amount),
      },
      {
        key: 'closeDate',
        header: 'Close Date',
        render: (row) => formatDate(row.closeDate),
      },
      {
        key: 'isClosed',
        header: 'Status',
        render: (row) =>
          row.isClosed ? (
            <Badge variant={row.isWon ? 'success' : 'danger'}>
              {row.isWon ? 'Won' : 'Lost'}
            </Badge>
          ) : (
            <Badge variant="info">Open</Badge>
          ),
      },
    ],
    [],
  );

  const contactColumns: Column<SfContact>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (row) =>
          `${row.firstName || ''} ${row.lastName}`.trim(),
      },
      { key: 'title', header: 'Title' },
      {
        key: 'email',
        header: 'Email',
        render: (row) =>
          row.email ? (
            <a
              href={`mailto:${row.email}`}
              className="text-indigo-600 hover:text-indigo-700"
            >
              {row.email}
            </a>
          ) : (
            ''
          ),
      },
      { key: 'phone', header: 'Phone' },
      { key: 'department', header: 'Department' },
    ],
    [],
  );

  const sections: SortableSection[] = useMemo(() => {
    if (!account) return [];
    return [
      {
        id: 'overview',
        render: (dragHandleProps) => (
          <Card title="Overview" dragHandleProps={dragHandleProps}>
            <AccountOverview account={account} />
          </Card>
        ),
      },
      {
        id: 'opportunities',
        render: (dragHandleProps) => (
          <Card
            title={`Opportunities (${opportunities?.length ?? 0})`}
            dragHandleProps={dragHandleProps}
          >
            {oppsLoading ? (
              <p className="text-sm text-gray-500">Loading opportunities...</p>
            ) : opportunities && opportunities.length > 0 ? (
              <DataTable
                columns={oppColumns}
                data={opportunities as unknown as Record<string, unknown>[]}
                keyExtractor={(row) => (row as unknown as SfOpportunity).id}
                onRowClick={(row) => {
                  const opp = row as unknown as SfOpportunity;
                  navigate({
                    to: '/opportunities/$opportunityId',
                    params: { opportunityId: opp.id },
                  });
                }}
              />
            ) : (
              <p className="text-sm text-gray-500">
                No opportunities for this account.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'contacts',
        render: (dragHandleProps) => (
          <Card
            title={`Contacts (${contacts?.length ?? 0})`}
            dragHandleProps={dragHandleProps}
          >
            {contactsLoading ? (
              <p className="text-sm text-gray-500">Loading contacts...</p>
            ) : contacts && contacts.length > 0 ? (
              <DataTable
                columns={contactColumns}
                data={contacts as unknown as Record<string, unknown>[]}
                keyExtractor={(row) => (row as unknown as SfContact).id}
              />
            ) : (
              <p className="text-sm text-gray-500">
                No contacts for this account.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'activity-timeline',
        render: (dragHandleProps) => (
          <Card title="Activity Timeline" dragHandleProps={dragHandleProps}>
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
                No Gong calls linked to this account.
              </p>
            )}
          </Card>
        ),
      },
      {
        id: 'notes',
        render: (dragHandleProps) => (
          <Card title="Notes" dragHandleProps={dragHandleProps}>
            <NoteList accountId={accountId} />
          </Card>
        ),
      },
    ];
  }, [
    account,
    opportunities,
    oppsLoading,
    oppColumns,
    contacts,
    contactsLoading,
    contactColumns,
    activities,
    activitiesLoading,
    callsData,
    callsLoading,
    navigate,
    accountId,
  ]);

  if (accountLoading) return <PageLoading />;
  if (!account) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Account not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          {account.industry && (
            <Badge variant="default">{account.industry}</Badge>
          )}
          {account.type && <Badge variant="info">{account.type}</Badge>}
          {account.billingCity && (
            <span>
              {[account.billingCity, account.billingState, account.billingCountry]
                .filter(Boolean)
                .join(', ')}
            </span>
          )}
        </div>
      </div>

      <SortableCardList
        pageKey="account-detail"
        sections={sections}
        className="space-y-6"
      />
    </div>
  );
}
