import crypto from 'node:crypto';
import { callTool } from '../integrations/mcp/client.js';
import { cachedCall } from './cache.service.js';

function hashFilters(obj: Record<string, unknown>): string {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('md5').update(sorted).digest('hex').slice(0, 12);
}

/**
 * Extract an array from an MCP response that may be wrapped in an object.
 * e.g. {"accounts": [...]} → [...], or [...] → [...]
 */
function unwrapArray<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') {
    const values = Object.values(result as Record<string, unknown>);
    const arr = values.find((v) => Array.isArray(v));
    if (arr) return arr as T[];
  }
  return [];
}

/**
 * Extract a single object from an MCP response that may be wrapped.
 */
function unwrapObject<T>(result: unknown): T {
  return result as T;
}

/**
 * Map MCP snake_case / variant field names to our camelCase frontend types.
 */
function mapAccount(raw: Record<string, unknown>) {
  return {
    id: raw.id,
    name: raw.name,
    arr: raw.arr ?? null,
    openPipeline: raw.openPipeline ?? raw.open_pipeline ?? raw.pipeline ?? raw.openOpportunitiesTotal ?? raw.open_opportunities_total ?? null,
    healthStatus: raw.healthStatus ?? raw.health_status ?? raw.health ?? null,
    csmOwner: raw.csmOwner ?? raw.csm_owner ?? null,
    cseOwner: raw.cseOwner ?? raw.cse_owner ?? raw.technicalLead ?? raw.technical_lead ?? raw.se_owner ?? raw.se ?? null,
    renewalDate: raw.renewalDate ?? raw.renewal_date ?? null,
    region: raw.region ?? raw.territoryRegion ?? raw.territory_region ?? null,
    products: raw.products ?? raw.productsOwned ?? raw.products_owned ?? [],
    lifecyclePhase: raw.lifecyclePhase ?? raw.lifecycle_phase ?? null,
    productionStatus: raw.productionStatus ?? raw.production_status ?? null,
    openOpportunityCount: 0,
  };
}

export async function listAccounts(filters: {
  search?: string;
  healthStatus?: string;
  region?: string;
  csmOwner?: string;
  minArr?: number;
  maxArr?: number;
  renewalWithinDays?: number;
  products?: string[];
} = {}) {
  const args: Record<string, unknown> = {};
  if (filters.search) args.query = filters.search;
  if (filters.healthStatus) args.health_status = filters.healthStatus;
  if (filters.region) args.region = filters.region;
  if (filters.csmOwner) args.csm_owner = filters.csmOwner;
  if (filters.minArr != null) args.min_arr = filters.minArr;
  if (filters.maxArr != null) args.max_arr = filters.maxArr;
  if (filters.renewalWithinDays != null) args.renewal_within_days = filters.renewalWithinDays;
  if (filters.products?.length) args.products = filters.products;

  const cacheKey = `mcp:accounts:${hashFilters(args)}`;

  return cachedCall(cacheKey, 600, async () => {
    const result = await callTool<unknown>('filter_accounts', args);
    const accounts = unwrapArray<Record<string, unknown>>(result);
    const mapped = accounts.map(mapAccount);

    // Enrich with open non-renewal opportunity counts
    const oppResults = await Promise.allSettled(
      mapped.map((acct) =>
        callTool<unknown>('get_opportunities', { company_id: acct.id as string })
      ),
    );

    for (let i = 0; i < mapped.length; i++) {
      const r = oppResults[i];
      if (r?.status === 'fulfilled') {
        const opps = unwrapArray<Record<string, unknown>>(r.value);
        mapped[i].openOpportunityCount = opps.filter((o) => {
          const closed = o.isClosed ?? o.is_closed ?? false;
          const type = String(o.type ?? o.opportunityType ?? '').toLowerCase();
          return !closed && !type.includes('renewal');
        }).length;
      }
    }

    return mapped;
  });
}

export async function getAccount(id: string) {
  return cachedCall(`mcp:account:${id}`, 300, async () => {
    const [detailRaw, infoRaw] = await Promise.all([
      callTool<unknown>('get_account_details', { account_ids: [id] }),
      callTool<unknown>('get_account_info', { company_id: id }).catch(() => null),
    ]);

    // get_account_details returns {"accounts":[{...}]} — extract first account
    const detailAccounts = unwrapArray<Record<string, unknown>>(detailRaw);
    const detail = detailAccounts[0] ?? {};
    const info = infoRaw ? unwrapObject<Record<string, unknown>>(infoRaw) : null;

    return {
      ...mapAccount(detail),
      openIssuesCount: detail.openIssuesCount ?? detail.open_issues_count ?? (detail.openIssues as Record<string, unknown>)?.total ?? 0,
      recentInteractions: unwrapArray(detail.recentInteractions ?? detail.recent_interactions ?? []),
      topContacts: unwrapArray(detail.topContacts ?? detail.top_contacts ?? []),
      sentimentSummary: detail.sentimentSummary ?? detail.sentiment_summary ?? detail.sentiment ?? null,
      description: detail.description ?? info?.description ?? null,
    };
  });
}

/**
 * Derive a display name from an email address.
 * e.g. "john.doe@example.com" → "John Doe"
 */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function mapContact(raw: Record<string, unknown>) {
  const email = (raw.email ?? raw.email_address ?? raw.emailAddress ?? null) as string | null;
  const rawName = (raw.name ?? raw.full_name ?? raw.fullName ?? raw.contact_name ?? raw.contactName ?? null) as string | null;
  const name = rawName || (email ? nameFromEmail(email) : null);

  return {
    id: raw.id ?? raw.contact_id ?? raw.contactId ?? '',
    name,
    email,
    title: raw.title ?? raw.job_title ?? raw.jobTitle ?? raw.role ?? null,
    phone: raw.phone ?? raw.phone_number ?? raw.phoneNumber ?? null,
    gongCallCount: raw.gongCallCount ?? raw.gong_call_count ?? raw.callCount ?? raw.call_count ?? 0,
    emailCount: raw.emailCount ?? raw.email_count ?? 0,
    lastInteractionDate: raw.lastInteractionDate ?? raw.last_interaction_date ?? raw.lastActivityDate ?? raw.last_activity_date ?? null,
  };
}

export async function getAccountContacts(id: string) {
  return cachedCall(`mcp:account:${id}:contacts`, 600, async () => {
    const result = await callTool<unknown>('get_contacts', { company_id: id });
    const contacts = unwrapArray<Record<string, unknown>>(result);
    return contacts.map(mapContact);
  });
}

function mapInteraction(raw: Record<string, unknown>) {
  return {
    id: raw.id ?? '',
    sourceType: raw.sourceType ?? raw.source_type ?? '',
    date: raw.date ?? '',
    title: raw.title ?? '',
    preview: raw.preview ?? null,
    sentiment: raw.sentiment ?? null,
    participants: raw.participants ?? [],
  };
}

export async function getAccountInteractions(id: string, filters: {
  sourceTypes?: string[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}) {
  const args: Record<string, unknown> = { company_id: id };
  if (filters.sourceTypes?.length) args.source_types = filters.sourceTypes;
  if (filters.fromDate) args.from_date = filters.fromDate;
  if (filters.toDate) args.to_date = filters.toDate;
  if (filters.limit != null) args.limit = filters.limit;

  const hash = hashFilters(filters as unknown as Record<string, unknown>);
  return cachedCall(`mcp:account:${id}:interactions:${hash}`, 300, async () => {
    const result = await callTool<unknown>('get_recent_activity', args);
    const interactions = unwrapArray<Record<string, unknown>>(result);
    return interactions.map(mapInteraction);
  });
}

export async function getAccountOpportunities(id: string) {
  return cachedCall(`mcp:account:${id}:opportunities`, 600, async () => {
    const result = await callTool<unknown>('get_opportunities', { company_id: id });
    return unwrapArray(result);
  });
}

export async function getAccountIssues(id: string) {
  return cachedCall(`mcp:account:${id}:issues`, 300, async () => {
    const result = await callTool<unknown>('get_open_issues', { company_id: id });
    return unwrapArray(result);
  });
}

export async function getAccountTasks(id: string) {
  return cachedCall(`mcp:account:${id}:tasks`, 300, async () => {
    const result = await callTool<unknown>('get_tasks', { company_id: id });
    return unwrapArray(result);
  });
}

export async function getAccountArchitecture(id: string) {
  return cachedCall(`mcp:account:${id}:architecture`, 900, async () => {
    const result = await callTool<unknown>('get_architecture_doc', { company_id: id });
    return unwrapObject(result);
  });
}

export async function getAccountSentiment(id: string) {
  return cachedCall(`mcp:account:${id}:sentiment`, 900, async () => {
    const result = await callTool<unknown>('get_sentiment_trends', { company_id: id });
    return unwrapObject(result);
  });
}
