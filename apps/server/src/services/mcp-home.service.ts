import { callTool } from '../integrations/mcp/client.js';
import { cachedCall } from './cache.service.js';
import { getAccountIssues, getAccountOpportunities } from './mcp-accounts.service.js';
import { searchPortfolio } from './mcp-search.service.js';
import type { AccountActionItem } from '@siesta/shared';

/**
 * Extract an array from an MCP response that may be wrapped in an object.
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
 * Map MCP account fields to frontend Account shape.
 */
function mapAccount(raw: Record<string, unknown>) {
  return {
    id: raw.id as string,
    name: raw.name as string,
    arr: (raw.arr as number | null) ?? null,
    openPipeline: raw.openPipeline ?? raw.open_pipeline ?? raw.pipeline ?? raw.openOpportunitiesTotal ?? raw.open_opportunities_total ?? null,
    healthStatus: raw.healthStatus ?? raw.health_status ?? raw.health ?? null,
    csmOwner: raw.csmOwner ?? raw.csm_owner ?? null,
    cseOwner: raw.cseOwner ?? raw.cse_owner ?? raw.technicalLead ?? raw.technical_lead ?? raw.se_owner ?? raw.se ?? null,
    renewalDate: raw.renewalDate ?? raw.renewal_date ?? null,
    region: raw.region ?? null,
    products: raw.products ?? raw.productsOwned ?? raw.products_owned ?? [],
    lifecyclePhase: raw.lifecyclePhase ?? raw.lifecycle_phase ?? null,
    productionStatus: raw.productionStatus ?? raw.production_status ?? null,
  };
}

/**
 * Map MCP portfolio stats to frontend PortfolioStats shape.
 */
function mapPortfolioStats(raw: Record<string, unknown>) {
  const hd = (raw.healthDistribution ?? raw.health_distribution ?? {}) as Record<string, unknown>;
  const healthy = (hd.healthy ?? {}) as Record<string, unknown>;
  const needsAttention = (hd.needsAttention ?? hd.needs_attention ?? {}) as Record<string, unknown>;
  const atRisk = (hd.atRisk ?? hd.at_risk ?? {}) as Record<string, unknown>;

  return {
    totalAccounts: raw.totalAccounts ?? raw.total_accounts ?? 0,
    totalArr: raw.totalArr ?? raw.totalARR ?? raw.total_arr ?? 0,
    healthDistribution: {
      healthy: { count: healthy.count ?? 0, arr: healthy.arr ?? 0 },
      needsAttention: { count: needsAttention.count ?? 0, arr: needsAttention.arr ?? 0 },
      atRisk: { count: atRisk.count ?? 0, arr: atRisk.arr ?? 0 },
    },
  };
}

/**
 * Search Gong call transcripts for verbal commitments and action items.
 * Returns results filtered to the given account IDs.
 */
async function getVerbalCommitments(accountIds: Set<string>): Promise<AccountActionItem[]> {
  const query = 'action item OR commitment OR follow up OR will deliver OR next steps OR promised OR agreed to';
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const results = await searchPortfolio(query, {
    sourceTypes: ['call'],
    fromDate: thirtyDaysAgo.toISOString().split('T')[0],
  });

  const items: AccountActionItem[] = [];
  const seen = new Set<string>();

  for (const r of results as unknown as Record<string, unknown>[]) {
    const accountId = (r.accountId ?? r.account_id) as string;
    if (!accountId || !accountIds.has(accountId)) continue;

    const interactionId = (r.interactionId ?? r.interaction_id) as string;
    // Deduplicate by interaction — one commitment entry per call
    if (seen.has(interactionId)) continue;
    seen.add(interactionId);

    items.push({
      type: 'commitment',
      id: `commitment-${interactionId}`,
      accountId,
      accountName: (r.accountName ?? r.account_name ?? '') as string,
      title: (r.title ?? 'Verbal commitment from call') as string,
      status: 'open',
      priority: 'high',
      dueDate: null,
      sourceSystem: 'gong',
      createdDate: (r.date as string | null) ?? null,
      snippet: (r.snippet as string | null) ?? null,
      interactionId,
    });
  }

  return items;
}

export async function getHomepageData(userName?: string, userEmail?: string) {
  return cachedCall(`mcp:home:${userName ?? 'all'}`, 300, async () => {
    const [portfolioStatsRaw, accountsRaw] = await Promise.all([
      callTool<unknown>('get_portfolio_stats', {}),
      callTool<unknown>('filter_accounts', {}),
    ]);

    const allAccounts = unwrapArray<Record<string, unknown>>(accountsRaw).map(mapAccount);

    // Find accounts where the user has been a participant in interactions
    let participantAccountIds = new Set<string>();
    if (userName) {
      const searchQueries = [userName];
      if (userEmail) searchQueries.push(userEmail);

      const searchResults = await Promise.all(
        searchQueries.map((q) =>
          searchPortfolio(q, {
            sourceTypes: ['call', 'email', 'meeting'],
          }).catch(() => []),
        ),
      );

      for (const results of searchResults) {
        for (const r of results as unknown as Record<string, unknown>[]) {
          const accountId = (r.accountId ?? r.account_id) as string;
          if (accountId) participantAccountIds.add(accountId);
        }
      }
    }

    // Include accounts where user is CSE owner OR has participated in interactions
    const candidateAccounts = userName
      ? allAccounts.filter((a) => {
          const cse = (a.cseOwner as string | null) ?? '';
          const isCseOwner = cse.toLowerCase().includes(userName.toLowerCase());
          const isParticipant = participantAccountIds.has(a.id);
          return isCseOwner || isParticipant;
        })
      : allAccounts;

    // Enrich with open pipeline and filter to accounts with open non-renewal opportunities
    const enriched = await Promise.all(
      candidateAccounts.map(async (account) => {
        try {
          const opps = await getAccountOpportunities(account.id) as Array<{ arr?: number; amount?: number; stage?: string; name?: string }>;
          const openNonRenewal = opps
            .filter((o) => o.stage && !o.stage.toLowerCase().includes('closed'))
            .filter((o) => !(o.name ?? '').toLowerCase().includes('renewal'));
          const openPipeline = openNonRenewal.reduce((sum, o) => sum + (o.arr ?? o.amount ?? 0), 0);
          return { ...account, openPipeline, hasOpenOpportunities: openNonRenewal.length > 0 };
        } catch {
          return { ...account, openPipeline: null, hasOpenOpportunities: false };
        }
      }),
    );

    // Only show accounts with open non-renewal opportunities
    const myAccounts = enriched.filter((a) => a.hasOpenOpportunities);

    // Fetch issues and verbal commitments in parallel
    const actionItems: AccountActionItem[] = [];

    if (myAccounts.length > 0) {
      const accountIds = new Set(myAccounts.map((a) => a.id));

      const [issueResults, commitments] = await Promise.all([
        // Issues per account
        Promise.allSettled(
          myAccounts.map((account) =>
            getAccountIssues(account.id).then((issues) =>
              (issues as Record<string, unknown>[]).map(
                (i): AccountActionItem => ({
                  type: 'issue',
                  id: i.id as string,
                  accountId: account.id,
                  accountName: account.name,
                  title: i.title as string,
                  status: i.status as string,
                  priority: (i.priority as string | null) ?? null,
                  dueDate: null,
                  sourceSystem: (i.sourceSystem as string | null) ?? (i.source_system as string | null) ?? null,
                  createdDate: (i.createdDate as string | null) ?? (i.created_date as string | null) ?? null,
                  snippet: null,
                  interactionId: null,
                }),
              ),
            ),
          ),
        ),
        // Verbal commitments from Gong calls
        getVerbalCommitments(accountIds).catch(() => [] as AccountActionItem[]),
      ]);

      for (const result of issueResults) {
        if (result.status === 'fulfilled') {
          actionItems.push(...result.value);
        }
      }

      actionItems.push(...commitments);
    }

    // Filter out Zendesk items
    const filtered = actionItems.filter(
      (item) => !(item.sourceSystem ?? '').toLowerCase().includes('zendesk'),
    );

    // Sort: high priority first, then by due date, then by created date
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    filtered.sort((a, b) => {
      const pa = priorityOrder[a.priority?.toLowerCase() ?? ''] ?? 99;
      const pb = priorityOrder[b.priority?.toLowerCase() ?? ''] ?? 99;
      if (pa !== pb) return pa - pb;
      // By date, most recent first
      const da = a.dueDate ?? a.createdDate ?? '';
      const db = b.dueDate ?? b.createdDate ?? '';
      return db.localeCompare(da);
    });

    return {
      portfolioStats: mapPortfolioStats(portfolioStatsRaw as Record<string, unknown>),
      myAccounts,
      actionItems: filtered,
    };
  });
}
