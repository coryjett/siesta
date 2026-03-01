import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { cachedCall } from './cache.service.js';

/**
 * Customer360 REST API client.
 * Used to fetch data not available through the MCP tool layer
 * (e.g. closed opportunities).
 */

interface EntityQueryRequest {
  columns: string[];
  filters?: {
    logic: 'AND' | 'OR';
    conditions: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  sort?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

interface EntityQueryResponse<T> {
  data: T[];
  total: number;
}

export interface ClosedOpportunity {
  id: string;
  name: string;
  stage_name: string;
  arr: number | null;
  close_date: string | null;
  company_id: string;
  company_name: string;
}

async function queryEntities<T>(
  entityType: string,
  query: EntityQueryRequest,
): Promise<EntityQueryResponse<T>> {
  if (!env.CUSTOMER360_API_KEY) {
    throw new Error('CUSTOMER360_API_KEY not configured');
  }

  const url = `${env.CUSTOMER360_URL}/api/entities/${entityType}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CUSTOMER360_API_KEY}`,
    },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Customer360 API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<EntityQueryResponse<T>>;
}

/**
 * Fetch all closed opportunities from Customer360 REST API.
 * Returns both Closed Won and Closed Lost opportunities with company info.
 * Cached for 1 hour.
 */
export async function getClosedOpportunities(): Promise<ClosedOpportunity[]> {
  if (!env.CUSTOMER360_API_KEY) {
    logger.debug('CUSTOMER360_API_KEY not configured, skipping closed opportunity fetch');
    return [];
  }

  return cachedCall<ClosedOpportunity[]>('c360:closed-opportunities', 3600, async () => {
    try {
      const result = await queryEntities<ClosedOpportunity>('opportunities', {
        columns: ['id', 'name', 'stage_name', 'arr', 'close_date', 'company_id', 'company_name'],
        filters: {
          logic: 'OR',
          conditions: [
            { field: 'stage_name', operator: 'contains', value: 'Closed' },
            { field: 'stage_name', operator: 'contains', value: 'closed' },
          ],
        },
        sort: [{ field: 'close_date', direction: 'desc' }],
        limit: 5000,
      });

      logger.info(
        { total: result.total, fetched: result.data.length },
        '[customer360] Fetched closed opportunities',
      );

      return result.data;
    } catch (err) {
      logger.error({ err }, '[customer360] Failed to fetch closed opportunities');
      return [];
    }
  });
}

/**
 * Check whether the Customer360 REST API integration is configured and reachable.
 */
export function isCustomer360Configured(): boolean {
  return !!env.CUSTOMER360_API_KEY;
}
