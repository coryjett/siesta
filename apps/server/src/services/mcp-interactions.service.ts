import { callTool } from '../integrations/mcp/client.js';
import { cachedCall, getCache, setCache } from './cache.service.js';
import { logger } from '../utils/logger.js';

function isMcpError(text: string): boolean {
  if (!text || text.length > 200) return false;
  const lower = text.toLowerCase().trim();
  return lower.includes('no rows in result set') || lower.startsWith('error:') || lower === 'not found';
}

function mapInteractionDetail(raw: Record<string, unknown>) {
  return {
    id: String(raw.id ?? ''),
    sourceType: String(raw.sourceType ?? raw.source_type ?? ''),
    date: String(raw.date ?? ''),
    title: String(raw.title ?? ''),
    content: String(raw.content ?? ''),
    participants: (raw.participants ?? []) as Array<{ name: string; email: string | null; role: string | null }>,
    sentiment: raw.sentiment != null ? String(raw.sentiment) : null,
    summary: raw.summary != null ? String(raw.summary) : null,
  };
}

/**
 * Pick the best search result for a Gong call fallback.
 * Prefers results matching the title, then picks the one with
 * a "Summary:" prefix or the longest content.
 */
function pickBestResult(
  results: Array<Record<string, unknown>>,
  title: string,
): Record<string, unknown> | null {
  const titleMatches = results.filter(
    (r) => String(r.title ?? '') === title,
  );
  const candidates = titleMatches.length > 0 ? titleMatches : results;

  const valid = candidates.filter(
    (r) => r.content && !isMcpError(String(r.content)),
  );

  if (valid.length === 0) return null;

  // Prefer the result whose content starts with "Summary:" (Gong call brief)
  const summary = valid.find((r) =>
    String(r.content).trimStart().toLowerCase().startsWith('summary'),
  );
  if (summary) return summary;

  // Otherwise, pick the longest content
  return valid.reduce((best, r) =>
    String(r.content).length > String(best.content).length ? r : best,
  );
}

export async function getInteractionDetail(
  accountId: string,
  sourceType: string,
  recordId: string,
  title?: string,
) {
  const cacheKey = `mcp:interaction:${accountId}:${sourceType}:${recordId}`;

  // For non-gong calls, use standard caching (5 min)
  if (sourceType !== 'gong_call') {
    return cachedCall(cacheKey, 300, async () => {
      const result = await callTool<Record<string, unknown>>('get_conversation_details', {
        company_id: accountId,
        source_type: sourceType,
        record_id: recordId,
      });
      return mapInteractionDetail(result);
    });
  }

  // For gong_calls: check cache, but skip cached errors
  type MappedDetail = ReturnType<typeof mapInteractionDetail>;
  const cached = await getCache<MappedDetail>(cacheKey);
  if (cached && !isMcpError(cached.content)) {
    return cached;
  }

  // Primary lookup via get_conversation_details
  const result = await callTool<Record<string, unknown>>('get_conversation_details', {
    company_id: accountId,
    source_type: sourceType,
    record_id: recordId,
  });
  const mapped = mapInteractionDetail(result);

  // If primary lookup failed and we have a title, try semantic search fallback
  if (isMcpError(mapped.content) && title) {
    try {
      const searchResult = await callTool<Record<string, unknown>>('get_account_interactions', {
        company_id: accountId,
        query: title,
        source_types: ['gong_call'],
        limit: 5,
      });

      const results = (searchResult.results ?? []) as Array<Record<string, unknown>>;
      const match = pickBestResult(results, title);

      if (match) {
        logger.info(
          { accountId, recordId, title, contentLen: String(match.content).length },
          '[interaction-detail] Gong call content recovered via semantic search',
        );
        mapped.content = String(match.content);
        mapped.title = String(match.title ?? mapped.title);
        mapped.date = String(match.date ?? mapped.date);
      }
    } catch (err) {
      logger.warn(
        { accountId, recordId, err: (err as Error).message },
        '[interaction-detail] Semantic search fallback failed',
      );
    }
  }

  // Only cache successful results (24 hours for gong_calls)
  if (!isMcpError(mapped.content)) {
    await setCache(cacheKey, mapped, 86400);
  }

  return mapped;
}
