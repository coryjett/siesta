import { useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import {
  useAccount,
  useAccountOpportunitiesWithCalls,
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
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import type { SfContact } from '@siesta/shared';

export default function AccountDetailPage() {
  const { accountId } = useParams({ strict: false });
  const navigate = useNavigate();

  const { data: account, isLoading: accountLoading } = useAccount(accountId);
  const { data: oppsWithCalls, isLoading: oppsLoading } =
    useAccountOpportunitiesWithCalls(accountId);
  const { data: contacts, isLoading: contactsLoading } =
    useAccountContacts(accountId);
  const { data: activities, isLoading: activitiesLoading } =
    useAccountActivities(accountId);

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
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
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
            title={`Opportunities (${oppsWithCalls?.opportunities.length ?? 0})`}
            dragHandleProps={dragHandleProps}
          >
            {oppsLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading opportunities...</p>
            ) : oppsWithCalls && oppsWithCalls.opportunities.length > 0 ? (
              <div className="space-y-4">
                {oppsWithCalls.opportunities.map((opp) => (
                  <div key={opp.id} className="rounded-lg border border-gray-200 dark:border-gray-700">
                    {/* Opportunity header */}
                    <div
                      className="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      onClick={() =>
                        navigate({
                          to: '/opportunities/$opportunityId',
                          params: { opportunityId: opp.id },
                        })
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {opp.name}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>{opp.stageName}</span>
                          {opp.amount && <span>{formatCurrency(opp.amount)}</span>}
                          <span>Close: {formatDate(opp.closeDate)}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {opp.isClosed ? (
                          <Badge variant={opp.isWon ? 'success' : 'danger'}>
                            {opp.isWon ? 'Won' : 'Lost'}
                          </Badge>
                        ) : (
                          <Badge variant="info">Open</Badge>
                        )}
                      </div>
                    </div>

                    {/* Nested Gong calls */}
                    {opp.calls.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                        <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Gong Calls ({opp.calls.length})
                        </p>
                        <div className="space-y-2">
                          {opp.calls.map((call) => (
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No opportunities for this account.
              </p>
            )}

            {/* Unlinked Gong calls (linked to account but not a specific opportunity) */}
            {oppsWithCalls && oppsWithCalls.unlinkedCalls.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Other Gong Calls ({oppsWithCalls.unlinkedCalls.length})
                </h4>
                <div className="space-y-2">
                  {oppsWithCalls.unlinkedCalls.map((call) => (
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
              </div>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading contacts...</p>
            ) : contacts && contacts.length > 0 ? (
              <DataTable
                columns={contactColumns}
                data={contacts as unknown as Record<string, unknown>[]}
                keyExtractor={(row) => (row as unknown as SfContact).id}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading activities...</p>
            ) : (
              <ActivityTimeline activities={activities ?? []} />
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
    oppsWithCalls,
    oppsLoading,
    contacts,
    contactsLoading,
    contactColumns,
    activities,
    activitiesLoading,
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{account.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
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
