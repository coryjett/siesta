import { useState, useMemo, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useAllContacts, type ContactWithAccount } from '../../api/queries/contacts';
import { useHomeData } from '../../api/queries/home';
import { useContactInsights, type ContactInsight, type ContactPersonalInfoEntry, type ContactInsightsResponse } from '../../api/queries/accounts';
import { api } from '../../api/client';
import { PageLoading } from '../../components/common/loading';
import { formatDate, formatRelative } from '../../lib/date';

const INSIGHT_LABELS: Record<string, string> = {
  engagement_style: 'Engagement Style',
  concerns: 'Priorities & Concerns',
  interests: 'Interests',
  location: 'Location',
  family: 'Family',
  hobbies: 'Hobbies',
  background: 'Background',
  travel: 'Travel',
  other: 'Other',
};

// Ordered display keys — engagement_style and concerns first since they're most useful
const INSIGHT_DISPLAY_ORDER = [
  'engagement_style',
  'concerns',
  'interests',
  'background',
  'location',
  'family',
  'hobbies',
  'travel',
  'other',
];

type SortKey = 'name' | 'title' | 'accountName' | 'lastInteractionDate' | 'gongCallCount';
type SortDir = 'asc' | 'desc';

function ContactAvatar({ name }: { name: string | null }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20">
      <span className="text-sm font-semibold text-[#6b26d9] dark:text-[#8249df]">
        {initials}
      </span>
    </div>
  );
}

interface ContactInteraction {
  id: string;
  sourceType: string;
  date: string;
  title: string;
}

const SOURCE_TYPE_MAP: Record<string, string> = {
  calendar_event: 'meeting',
  gong_call: 'call',
  gong: 'call',
  gmail: 'email',
  gmail_email: 'email',
  zendesk_ticket: 'ticket',
  github_issue: 'ticket',
};

function normalizeSourceType(raw: string): string {
  return SOURCE_TYPE_MAP[raw] ?? raw;
}

function ContactInteractions({
  accountId,
  contactName,
  contactEmail,
}: {
  accountId: string;
  contactName: string | null;
  contactEmail: string | null;
}) {
  const searchQuery = contactName || contactEmail || '';
  const { data: rawInteractions, isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['contact-interactions', accountId, searchQuery],
    queryFn: () => api.get<Record<string, unknown>[]>(
      `/contacts/${accountId}/${encodeURIComponent(searchQuery)}/interactions`,
    ),
    enabled: !!searchQuery,
    staleTime: 5 * 60 * 1000,
  });
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [showAllEmails, setShowAllEmails] = useState(false);

  const { calls, emails } = useMemo(() => {
    if (!rawInteractions) return { calls: [], emails: [] };

    const mapped: ContactInteraction[] = rawInteractions.map((r) => ({
      id: (r.id ?? r.interactionId ?? r.interaction_id ?? '') as string,
      sourceType: normalizeSourceType(
        ((r.sourceType ?? r.source_type ?? '') as string),
      ),
      date: (r.date ?? '') as string,
      title: (r.title ?? r.subject ?? '') as string,
    }));

    return {
      calls: mapped.filter((i) => i.sourceType === 'call'),
      emails: mapped.filter((i) => i.sourceType === 'email'),
    };
  }, [rawInteractions]);

  if (isLoading) {
    return (
      <div className="text-xs text-[#6b677e] dark:text-[#858198]">Loading interactions...</div>
    );
  }

  const visibleCalls = showAllCalls ? calls : calls.slice(0, 3);
  const visibleEmails = showAllEmails ? emails : emails.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Calls */}
      {calls.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-2">
            Calls ({calls.length})
          </h4>
          <div className="space-y-1.5">
            {visibleCalls.map((call) => (
              <div key={call.id} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 text-[#9e9ab0] dark:text-[#6b677e]">
                  {formatDate(call.date)}
                </span>
                <Link
                  to="/interactions/$accountId/$sourceType/$recordId"
                  params={{ accountId, sourceType: call.sourceType, recordId: call.id }}
                  className="truncate text-[#6b26d9] dark:text-[#8249df] hover:underline"
                >
                  {call.title}
                </Link>
              </div>
            ))}
          </div>
          {calls.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllCalls(!showAllCalls)}
              className="mt-1 text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline"
            >
              {showAllCalls ? 'Show less' : `Show all ${calls.length} calls`}
            </button>
          )}
        </div>
      )}

      {/* Emails */}
      {emails.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-2">
            Emails ({emails.length})
          </h4>
          <div className="space-y-1.5">
            {visibleEmails.map((email) => (
              <div key={email.id} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 text-[#9e9ab0] dark:text-[#6b677e]">
                  {formatDate(email.date)}
                </span>
                <span className="truncate text-[#191726] dark:text-[#f2f2f2]">
                  {email.title}
                </span>
              </div>
            ))}
          </div>
          {emails.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllEmails(!showAllEmails)}
              className="mt-1 text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline"
            >
              {showAllEmails ? 'Show less' : `Show all ${emails.length} emails`}
            </button>
          )}
        </div>
      )}

      {calls.length === 0 && emails.length === 0 && (
        <p className="text-xs text-[#9e9ab0] dark:text-[#6b677e]">No interaction history found.</p>
      )}
    </div>
  );
}

function ContactInsightsPanel({
  insight,
}: {
  insight: ContactInsight | undefined;
}) {
  if (!insight) {
    return (
      <p className="text-xs text-[#9e9ab0] dark:text-[#6b677e] italic">
        No personal notes yet. Insights are extracted from Gong call transcripts.
      </p>
    );
  }

  const infoEntries = INSIGHT_DISPLAY_ORDER
    .filter((key) => insight.personalInfo[key as keyof typeof insight.personalInfo])
    .map((key) => [key, insight.personalInfo[key as keyof typeof insight.personalInfo]!] as const);

  if (infoEntries.length === 0) {
    return (
      <p className="text-xs text-[#9e9ab0] dark:text-[#6b677e] italic">
        No personal notes extracted yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {infoEntries.map(([key, value]) => {
        const entry = (typeof value === 'string' ? { value } : value) as ContactPersonalInfoEntry;
        const isHighlight = key === 'engagement_style' || key === 'concerns';
        return (
          <div
            key={key}
            className={`flex gap-2 ${isHighlight ? 'rounded-md bg-[#6b26d9]/5 dark:bg-[#8249df]/10 p-2 -mx-2' : ''}`}
          >
            <span className="text-xs font-medium text-[#191726] dark:text-[#f2f2f2] shrink-0 min-w-[120px]">
              {INSIGHT_LABELS[key] ?? key}:
            </span>
            <span className="text-xs text-[#6b677e] dark:text-[#858198]">
              {entry.value}
              {entry.date && (
                <span className="ml-1.5 text-[10px] text-[#9e9ab0] dark:text-[#6b677e]">
                  ({formatDate(entry.date)})
                </span>
              )}
            </span>
          </div>
        );
      })}
      <p className="text-[10px] text-[#9e9ab0] dark:text-[#6b677e] pt-1">
        from {insight.sourceCallTitles.length} call{insight.sourceCallTitles.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function ExpandedContact({
  contact,
}: {
  contact: ContactWithAccount;
}) {
  const { data: insightsData, isLoading: insightsLoading } = useContactInsights(contact.accountId);

  const insight = useMemo(() => {
    if (!insightsData?.insights) return undefined;
    return insightsData.insights.find(
      (i) => i.contactName.toLowerCase() === (contact.name ?? '').toLowerCase(),
    );
  }, [insightsData, contact.name]);

  return (
    <div className="bg-[#f8f7fa] dark:bg-[#1e1b2e] rounded-xl p-5 mt-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Contact info + Personal insights */}
      <div className="space-y-5">
        {/* Contact details */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-3">
            Contact Details
          </h4>
          <div className="space-y-1.5 text-xs">
            {contact.title && (
              <div className="flex gap-2">
                <span className="font-medium text-[#191726] dark:text-[#f2f2f2] min-w-[120px] shrink-0">Role:</span>
                <span className="text-[#6b677e] dark:text-[#858198]">{contact.title}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex gap-2">
                <span className="font-medium text-[#191726] dark:text-[#f2f2f2] min-w-[120px] shrink-0">Email:</span>
                <a href={`mailto:${contact.email}`} className="text-[#6b26d9] dark:text-[#8249df] hover:underline">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex gap-2">
                <span className="font-medium text-[#191726] dark:text-[#f2f2f2] min-w-[120px] shrink-0">Phone:</span>
                <span className="text-[#6b677e] dark:text-[#858198]">{contact.phone}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="font-medium text-[#191726] dark:text-[#f2f2f2] min-w-[120px] shrink-0">Account:</span>
              <Link
                to="/accounts/$accountId"
                params={{ accountId: contact.accountId }}
                className="text-[#6b26d9] dark:text-[#8249df] hover:underline"
              >
                {contact.accountName}
              </Link>
            </div>
          </div>
        </div>

        {/* Personal insights */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-3">
            Personal Notes
          </h4>
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-xs text-[#6b677e] dark:text-[#858198]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6b26d9] border-t-transparent dark:border-[#8249df]" />
              Analyzing call transcripts...
            </div>
          ) : (
            <ContactInsightsPanel insight={insight} />
          )}
        </div>
      </div>

      {/* Right column: Calls and Emails */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] mb-3">
          Interaction History
        </h4>
        <ContactInteractions
          accountId={contact.accountId}
          contactName={contact.name}
          contactEmail={contact.email}
        />
      </div>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block ml-1 ${active ? 'text-[#6b26d9] dark:text-[#8249df]' : 'text-[#dedde4] dark:text-[#2a2734]'}`}
    >
      {dir === 'asc' || !active ? (
        <polyline points="18 15 12 9 6 15" />
      ) : (
        <polyline points="6 9 12 15 18 9" />
      )}
    </svg>
  );
}

export default function ContactsPage() {
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const initialSearch = searchParams?.search ?? '';
  const initialAccountId = searchParams?.account;

  const [search, setSearch] = useState(initialSearch);
  const [myAccountsOnly, setMyAccountsOnly] = useState(true);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: contacts, isLoading, error } = useAllContacts();
  const { data: homeData } = useHomeData();

  const myAccountIds = useMemo(() => {
    if (!homeData?.allUserAccountIds) return null;
    return new Set(homeData.allUserAccountIds);
  }, [homeData]);

  // Auto-expand contact from URL params
  useEffect(() => {
    if (initialSearch && initialAccountId && contacts) {
      const match = contacts.find(
        (c) =>
          c.accountId === initialAccountId &&
          (c.name ?? '').toLowerCase().includes(initialSearch.toLowerCase()),
      );
      if (match) {
        setExpandedContact(`${match.accountId}-${match.id}`);
      }
    }
  }, [initialSearch, initialAccountId, contacts]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'gongCallCount' || key === 'lastInteractionDate' ? 'desc' : 'asc');
    }
  };

  const filteredContacts = useMemo(() => {
    let list = contacts ?? [];

    if (myAccountsOnly && myAccountIds) {
      list = list.filter((c) => myAccountIds.has(c.accountId));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name ?? '').toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.title ?? '').toLowerCase().includes(q) ||
          c.accountName.toLowerCase().includes(q),
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '');
          break;
        case 'title':
          cmp = (a.title ?? '').localeCompare(b.title ?? '');
          break;
        case 'accountName':
          cmp = a.accountName.localeCompare(b.accountName);
          break;
        case 'gongCallCount':
          cmp = (a.gongCallCount ?? 0) - (b.gongCallCount ?? 0);
          break;
        case 'lastInteractionDate':
          cmp = (a.lastInteractionDate ?? '').localeCompare(b.lastInteractionDate ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [contacts, myAccountsOnly, myAccountIds, search, sortKey, sortDir]);

  // Prefetch contact insights for all unique account IDs to show insight icons
  const uniqueAccountIds = useMemo(() => {
    return [...new Set(filteredContacts.map((c) => c.accountId))];
  }, [filteredContacts]);

  const insightQueries = useQueries({
    queries: uniqueAccountIds.map((id) => ({
      queryKey: ['accounts', id, 'contact-insights'],
      queryFn: () => api.get<ContactInsightsResponse>(`/accounts/${id}/contact-insights`),
      staleTime: 24 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  // Build a set of "accountId:contactNameLower" keys for contacts that have insights
  const contactsWithInsights = useMemo(() => {
    const set = new Set<string>();
    uniqueAccountIds.forEach((accountId, i) => {
      const insights = insightQueries[i]?.data?.insights;
      if (!insights) return;
      for (const insight of insights) {
        const entries = Object.entries(insight.personalInfo).filter(([, v]) => v);
        if (entries.length > 0) {
          set.add(`${accountId}:${insight.contactName.toLowerCase()}`);
        }
      }
    });
    return set;
  }, [uniqueAccountIds, insightQueries]);

  const toggleExpand = (contactKey: string) => {
    setExpandedContact(expandedContact === contactKey ? null : contactKey);
  };

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-500">Failed to load contacts. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">Contacts</h1>
        <p className="mt-1 text-sm text-[#6b677e] dark:text-[#858198]">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''} across{' '}
          {new Set(filteredContacts.map((c) => c.accountId)).size} account
          {new Set(filteredContacts.map((c) => c.accountId)).size !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9e9ab0] dark:text-[#6b677e]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, title, or account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#0d0c12] py-2 pl-10 pr-9 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#9e9ab0] dark:placeholder-[#6b677e] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9e9ab0] dark:text-[#6b677e] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[#191726] dark:text-[#f2f2f2] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={myAccountsOnly}
            onChange={(e) => setMyAccountsOnly(e.target.checked)}
            className="h-4 w-4 rounded border-[#dedde4] dark:border-[#2a2734] text-[#6b26d9] focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
          My Accounts
        </label>
      </div>

      {/* Table */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#0d0c12] p-12 text-center">
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            {search ? 'No contacts match your search.' : 'No contacts found.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#0d0c12]">
          {/* Header row */}
          <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_80px_80px_100px] gap-4 px-5 py-3 border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f8f7fa] dark:bg-[#1a1826] text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
            <button type="button" onClick={() => handleSort('name')} className="text-left flex items-center hover:text-[#191726] dark:hover:text-[#f2f2f2]">
              Name <SortIcon active={sortKey === 'name'} dir={sortDir} />
            </button>
            <button type="button" onClick={() => handleSort('title')} className="text-left flex items-center hover:text-[#191726] dark:hover:text-[#f2f2f2]">
              Title <SortIcon active={sortKey === 'title'} dir={sortDir} />
            </button>
            <button type="button" onClick={() => handleSort('accountName')} className="text-left flex items-center hover:text-[#191726] dark:hover:text-[#f2f2f2]">
              Account <SortIcon active={sortKey === 'accountName'} dir={sortDir} />
            </button>
            <button type="button" onClick={() => handleSort('gongCallCount')} className="text-left flex items-center hover:text-[#191726] dark:hover:text-[#f2f2f2]">
              Calls <SortIcon active={sortKey === 'gongCallCount'} dir={sortDir} />
            </button>
            <span>Emails</span>
            <button type="button" onClick={() => handleSort('lastInteractionDate')} className="text-left flex items-center hover:text-[#191726] dark:hover:text-[#f2f2f2]">
              Last Active <SortIcon active={sortKey === 'lastInteractionDate'} dir={sortDir} />
            </button>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
            {filteredContacts.map((contact) => {
              const key = `${contact.accountId}-${contact.id}`;
              const isExpanded = expandedContact === key;
              const hasInsights = contactsWithInsights.has(
                `${contact.accountId}:${(contact.name ?? '').toLowerCase()}`,
              );

              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className={`w-full text-left px-5 py-3 transition-colors hover:bg-[#f8f7fa] dark:hover:bg-[#1a1826] ${
                      isExpanded ? 'bg-[#f8f7fa]/50 dark:bg-[#1a1826]/50' : ''
                    }`}
                  >
                    {/* Desktop layout */}
                    <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_80px_80px_100px] gap-4 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <ContactAvatar name={contact.name} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate flex items-center gap-1.5">
                            {contact.name ?? 'Unknown'}
                            {hasInsights && (
                              <span title="Personal notes available">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#6b26d9] dark:text-[#8249df]"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                              </span>
                            )}
                          </p>
                          {contact.email && (
                            <p className="text-xs text-[#9e9ab0] dark:text-[#6b677e] truncate">
                              {contact.email}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-[#6b677e] dark:text-[#858198] truncate">
                        {contact.title ?? '—'}
                      </span>
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: contact.accountId }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="text-sm text-[#6b26d9] dark:text-[#8249df] hover:underline truncate"
                      >
                        {contact.accountName}
                      </Link>
                      <span className="text-sm text-[#6b677e] dark:text-[#858198]">
                        {contact.gongCallCount || '—'}
                      </span>
                      <span className="text-sm text-[#6b677e] dark:text-[#858198]">
                        {contact.emailCount || '—'}
                      </span>
                      <span className="text-xs text-[#9e9ab0] dark:text-[#6b677e]">
                        {contact.lastInteractionDate ? formatRelative(contact.lastInteractionDate) : '—'}
                      </span>
                    </div>

                    {/* Mobile layout */}
                    <div className="md:hidden flex items-center gap-3">
                      <ContactAvatar name={contact.name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2] truncate flex items-center gap-1.5">
                          {contact.name ?? 'Unknown'}
                          {hasInsights && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#6b26d9] dark:text-[#8249df]"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                          )}
                        </p>
                        <p className="text-xs text-[#6b677e] dark:text-[#858198] truncate">
                          {contact.title && <span>{contact.title} · </span>}
                          <Link
                            to="/accounts/$accountId"
                            params={{ accountId: contact.accountId }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="text-[#6b26d9] dark:text-[#8249df] hover:underline"
                          >
                            {contact.accountName}
                          </Link>
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[#9e9ab0] dark:text-[#6b677e]">
                          {contact.gongCallCount > 0 && (
                            <span>{contact.gongCallCount} call{contact.gongCallCount !== 1 ? 's' : ''}</span>
                          )}
                          {contact.emailCount > 0 && (
                            <span>{contact.emailCount} email{contact.emailCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 text-[#9e9ab0] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <ExpandedContact contact={contact} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
