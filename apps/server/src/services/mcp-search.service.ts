import { callTool } from '../integrations/mcp/client.js';
import type { SearchResult } from '@siesta/shared';

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

/** Source type mapping from MCP values to our normalized types */
const SOURCE_TYPE_MAP: Record<string, string> = {
  calendar_event: 'meeting',
  gong_call: 'call',
  gong: 'call',
  gmail: 'email',
  zendesk_ticket: 'ticket',
  github_issue: 'ticket',
};

function normalizeSourceType(raw: string): string {
  return SOURCE_TYPE_MAP[raw] ?? raw;
}

/** Reverse mapping: UI filter types → MCP source types */
const REVERSE_SOURCE_TYPE_MAP: Record<string, string[]> = {
  meeting: ['calendar_event'],
  call: ['gong_call', 'gong'],
  email: ['gmail', 'gmail_email'],
  ticket: ['zendesk_ticket', 'github_issue'],
};

function expandSourceTypes(uiTypes: string[]): string[] {
  const expanded: string[] = [];
  for (const t of uiTypes) {
    const mapped = REVERSE_SOURCE_TYPE_MAP[t];
    if (mapped) {
      expanded.push(...mapped);
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

interface McpSearchAccount {
  id: string;
  name: string;
  matchInteractionId?: string;
  matchSourceType?: string;
  matchContext?: string;
  matchDate?: string;
  matchCount?: number;
  score?: number;
  snippet?: string;
  sourceType?: string;
  // May contain other fields like arr, health, etc.
  [key: string]: unknown;
}

export async function searchPortfolio(query: string, filters: {
  sourceTypes?: string[];
  fromDate?: string;
  toDate?: string;
} = {}): Promise<SearchResult[]> {
  const args: Record<string, unknown> = { query };
  if (filters.sourceTypes?.length) args.source_types = expandSourceTypes(filters.sourceTypes);
  if (filters.fromDate) args.from_date = filters.fromDate;
  if (filters.toDate) args.to_date = filters.toDate;

  const result = await callTool<unknown>('search_portfolio_interactions', args);
  const accounts = unwrapArray<McpSearchAccount>(result);

  return accounts.map((acct): SearchResult => ({
    accountId: acct.id,
    accountName: acct.name,
    interactionId: acct.matchInteractionId ?? acct.id,
    sourceType: normalizeSourceType(acct.matchSourceType ?? acct.sourceType ?? 'unknown'),
    score: acct.score ?? 0,
    date: acct.matchDate ?? '',
    title: acct.snippet ?? acct.matchContext ?? acct.name,
    snippet: acct.matchContext ?? acct.snippet ?? '',
  }));
}

export async function searchAccountInteractions(accountId: string, query: string) {
  const result = await callTool<unknown>('get_account_interactions', {
    company_id: accountId,
    query,
  });
  return unwrapArray(result);
}

export async function getNegativeInteractions(filters: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}) {
  const args: Record<string, unknown> = {};
  if (filters.fromDate) args.from_date = filters.fromDate;
  if (filters.toDate) args.to_date = filters.toDate;
  if (filters.limit != null) args.limit = filters.limit;

  const result = await callTool<unknown>('get_negative_interactions', args);
  return unwrapArray(result);
}
