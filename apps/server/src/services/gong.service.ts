import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gongCalls, gongTranscripts, sfAccounts, sfOpportunities } from '../db/schema/index.js';
import { NotFoundError } from '../utils/errors.js';

export interface GongCallFilters {
  accountId?: string;
  opportunityId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCalls {
  calls: Array<typeof gongCalls.$inferSelect & {
    accountName?: string | null;
    opportunityName?: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * List Gong calls with optional filters and pagination.
 */
export async function listCalls(filters: GongCallFilters): Promise<PaginatedCalls> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions = [];

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

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gongCalls)
    .where(whereClause);

  const total = countResult[0].count;

  // Get paginated calls with joined account/opportunity names
  const calls = await db
    .select({
      call: gongCalls,
      accountName: sfAccounts.name,
      opportunityName: sfOpportunities.name,
    })
    .from(gongCalls)
    .leftJoin(sfAccounts, eq(gongCalls.accountId, sfAccounts.id))
    .leftJoin(sfOpportunities, eq(gongCalls.opportunityId, sfOpportunities.id))
    .where(whereClause)
    .orderBy(desc(gongCalls.started))
    .limit(pageSize)
    .offset(offset);

  return {
    calls: calls.map((row) => ({
      ...row.call,
      accountName: row.accountName,
      opportunityName: row.opportunityName,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single Gong call by ID, including its transcript.
 */
export async function getCall(id: string) {
  const result = await db
    .select({
      call: gongCalls,
      accountName: sfAccounts.name,
      opportunityName: sfOpportunities.name,
    })
    .from(gongCalls)
    .leftJoin(sfAccounts, eq(gongCalls.accountId, sfAccounts.id))
    .leftJoin(sfOpportunities, eq(gongCalls.opportunityId, sfOpportunities.id))
    .where(eq(gongCalls.id, id))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Gong call', id);
  }

  const row = result[0];

  // Also fetch transcript
  const transcripts = await db
    .select()
    .from(gongTranscripts)
    .where(eq(gongTranscripts.callId, id))
    .limit(1);

  return {
    ...row.call,
    accountName: row.accountName,
    opportunityName: row.opportunityName,
    transcript: transcripts.length > 0 ? transcripts[0] : null,
  };
}

/**
 * Get the transcript for a specific call.
 */
export async function getCallTranscript(callId: string) {
  const result = await db
    .select()
    .from(gongTranscripts)
    .where(eq(gongTranscripts.callId, callId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Gong transcript for call', callId);
  }

  return result[0];
}

/**
 * Get all Gong calls linked to a Salesforce opportunity.
 */
export async function getCallsForOpportunity(opportunityId: string) {
  const calls = await db
    .select({
      call: gongCalls,
      accountName: sfAccounts.name,
      opportunityName: sfOpportunities.name,
    })
    .from(gongCalls)
    .leftJoin(sfAccounts, eq(gongCalls.accountId, sfAccounts.id))
    .leftJoin(sfOpportunities, eq(gongCalls.opportunityId, sfOpportunities.id))
    .where(eq(gongCalls.opportunityId, opportunityId))
    .orderBy(desc(gongCalls.started));

  return calls.map((row) => ({
    ...row.call,
    accountName: row.accountName,
    opportunityName: row.opportunityName,
  }));
}

/**
 * Get all Gong calls linked to a Salesforce account.
 */
export async function getCallsForAccount(accountId: string) {
  const calls = await db
    .select({
      call: gongCalls,
      accountName: sfAccounts.name,
      opportunityName: sfOpportunities.name,
    })
    .from(gongCalls)
    .leftJoin(sfAccounts, eq(gongCalls.accountId, sfAccounts.id))
    .leftJoin(sfOpportunities, eq(gongCalls.opportunityId, sfOpportunities.id))
    .where(eq(gongCalls.accountId, accountId))
    .orderBy(desc(gongCalls.started));

  return calls.map((row) => ({
    ...row.call,
    accountName: row.accountName,
    opportunityName: row.opportunityName,
  }));
}

/**
 * Get the most recent Gong calls.
 */
export async function getRecentCalls(limit: number = 10) {
  const calls = await db
    .select({
      call: gongCalls,
      accountName: sfAccounts.name,
      opportunityName: sfOpportunities.name,
    })
    .from(gongCalls)
    .leftJoin(sfAccounts, eq(gongCalls.accountId, sfAccounts.id))
    .leftJoin(sfOpportunities, eq(gongCalls.opportunityId, sfOpportunities.id))
    .orderBy(desc(gongCalls.started))
    .limit(limit);

  return calls.map((row) => ({
    ...row.call,
    accountName: row.accountName,
    opportunityName: row.opportunityName,
  }));
}
