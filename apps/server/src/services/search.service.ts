import { db } from '../db/client.js';
import { gongTranscripts, gongCalls, sfAccounts, sfOpportunities } from '../db/schema/index.js';
import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import { parsePagination, buildPaginatedResponse } from '../utils/pagination.js';
import { logger } from '../utils/logger.js';

interface SearchFilters {
  query: string;
  accountId?: string;
  opportunityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

interface SearchResult {
  callId: string;
  transcriptId: string;
  callTitle: string | null;
  callDate: string | null;
  accountId: string | null;
  accountName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  snippet: string;
  rank: number;
}

export async function searchTranscripts(filters: SearchFilters) {
  const { page, pageSize, offset } = parsePagination(filters);
  const tsQuery = filters.query.trim().split(/\s+/).join(' & ');

  // Build WHERE conditions
  const conditions = [
    sql`${gongTranscripts.searchVector} @@ to_tsquery('english', ${tsQuery})`
  ];

  if (filters.accountId) {
    conditions.push(eq(gongCalls.accountId, filters.accountId));
  }
  if (filters.opportunityId) {
    conditions.push(eq(gongCalls.opportunityId, filters.opportunityId));
  }
  if (filters.fromDate) {
    conditions.push(gte(gongCalls.started, new Date(filters.fromDate)));
  }
  if (filters.toDate) {
    conditions.push(lte(gongCalls.started, new Date(filters.toDate)));
  }

  // Main search query with ts_rank and ts_headline
  const results = await db.execute(sql`
    SELECT
      ${gongCalls.id} as "callId",
      ${gongTranscripts.id} as "transcriptId",
      ${gongCalls.title} as "callTitle",
      ${gongCalls.started} as "callDate",
      ${gongCalls.accountId} as "accountId",
      ${sfAccounts.name} as "accountName",
      ${gongCalls.opportunityId} as "opportunityId",
      ${sfOpportunities.name} as "opportunityName",
      ts_headline('english', ${gongTranscripts.fullText}, to_tsquery('english', ${tsQuery}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=3, FragmentDelimiter= ... '
      ) as snippet,
      ts_rank(${gongTranscripts.searchVector}, to_tsquery('english', ${tsQuery})) as rank
    FROM ${gongTranscripts}
    INNER JOIN ${gongCalls} ON ${gongCalls.id} = ${gongTranscripts.callId}
    LEFT JOIN ${sfAccounts} ON ${sfAccounts.id} = ${gongCalls.accountId}
    LEFT JOIN ${sfOpportunities} ON ${sfOpportunities.id} = ${gongCalls.opportunityId}
    WHERE ${and(...conditions)}
    ORDER BY rank DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  // Count query
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM ${gongTranscripts}
    INNER JOIN ${gongCalls} ON ${gongCalls.id} = ${gongTranscripts.callId}
    LEFT JOIN ${sfAccounts} ON ${sfAccounts.id} = ${gongCalls.accountId}
    LEFT JOIN ${sfOpportunities} ON ${sfOpportunities.id} = ${gongCalls.opportunityId}
    WHERE ${and(...conditions)}
  `);

  const total = Number(((countResult as any).rows?.[0] as any)?.total ?? 0);

  return buildPaginatedResponse((results as any).rows as unknown as SearchResult[], total, page, pageSize);
}

// Fuzzy search fallback using pg_trgm
export async function fuzzySearchTranscripts(filters: SearchFilters) {
  const { page, pageSize, offset } = parsePagination(filters);

  const conditions = [
    sql`${gongTranscripts.fullText} % ${filters.query}`
  ];

  if (filters.accountId) {
    conditions.push(eq(gongCalls.accountId, filters.accountId));
  }
  if (filters.opportunityId) {
    conditions.push(eq(gongCalls.opportunityId, filters.opportunityId));
  }

  const results = await db.execute(sql`
    SELECT
      ${gongCalls.id} as "callId",
      ${gongTranscripts.id} as "transcriptId",
      ${gongCalls.title} as "callTitle",
      ${gongCalls.started} as "callDate",
      ${gongCalls.accountId} as "accountId",
      ${sfAccounts.name} as "accountName",
      ${gongCalls.opportunityId} as "opportunityId",
      ${sfOpportunities.name} as "opportunityName",
      similarity(${gongTranscripts.fullText}, ${filters.query}) as rank
    FROM ${gongTranscripts}
    INNER JOIN ${gongCalls} ON ${gongCalls.id} = ${gongTranscripts.callId}
    LEFT JOIN ${sfAccounts} ON ${sfAccounts.id} = ${gongCalls.accountId}
    LEFT JOIN ${sfOpportunities} ON ${sfOpportunities.id} = ${gongCalls.opportunityId}
    WHERE ${and(...conditions)}
    ORDER BY rank DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = 0; // Simplified for fuzzy
  return buildPaginatedResponse((results as any).rows as unknown as SearchResult[], total, page, pageSize);
}

// Combined search: try tsvector first, fallback to trigram if no results
export async function search(filters: SearchFilters) {
  const primary = await searchTranscripts(filters);
  if (primary.total > 0) return primary;

  logger.debug({ query: filters.query }, 'No tsvector results, trying fuzzy search');
  return fuzzySearchTranscripts(filters);
}
