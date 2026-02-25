import { logger } from '../utils/logger.js';
import { db } from '../db/client.js';
import { userMcpTokens } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { decrypt } from './encryption.service.js';
import {
  listAccounts,
  getAccount,
  getAccountInteractions,
  getAccountOpportunities,
  getAccountSentiment,
} from './mcp-accounts.service.js';
import { getPortfolioStats } from './mcp-portfolio.service.js';
import { listSupportTools, callSupportTool } from '../integrations/mcp/support-client.js';

const SUPPORT_SERVER_KEY = 'support-agent-tools';

export interface WarmupState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  accountCount: number | null;
  error: string | null;
}

let warmupState: WarmupState = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  accountCount: null,
  error: null,
};

export function getWarmupState(): WarmupState {
  return { ...warmupState };
}

/**
 * Warm up the Redis cache on server startup by pre-fetching commonly accessed data.
 * Runs in the background — does not block server startup.
 * Uses small sequential batches to avoid overwhelming the MCP server / Agent Gateway.
 */
export async function warmUpCache(): Promise<void> {
  logger.info('Cache warm-up starting');
  const start = Date.now();
  warmupState = {
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    accountCount: null,
    error: null,
  };

  try {
    // Phase 1: Portfolio stats + account list (2 concurrent calls)
    const [, accounts] = await Promise.all([
      getPortfolioStats().catch((e) => {
        logger.warn({ err: e.message }, 'Cache warm-up: failed to fetch portfolio stats');
        return null;
      }),
      listAccounts({}).catch((e) => {
        logger.warn({ err: e.message }, 'Cache warm-up: failed to fetch accounts');
        return [] as Record<string, unknown>[];
      }),
    ]);

    // Phase 2: Per-account data — sequentially, one account at a time
    // This warms the MCP server without overwhelming the gateway
    if (accounts && accounts.length > 0) {
      logger.info({ accountCount: accounts.length }, 'Cache warm-up: warming per-account data');

      const BATCH_SIZE = 3;
      for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map(async (account: Record<string, unknown>) => {
            const id = account.id as string;
            // Run per-account calls sequentially to avoid concurrent MCP overload
            await getAccount(id).catch(() => null);
            await getAccountOpportunities(id).catch(() => null);
            await getAccountInteractions(id, { sourceTypes: ['gong_call'] }).catch(() => null);
            await getAccountInteractions(id, { sourceTypes: ['gmail_email'] }).catch(() => null);
            await getAccountSentiment(id).catch(() => null);
          }),
        );

        logger.info(
          { batch: Math.floor(i / BATCH_SIZE) + 1, total: Math.ceil(accounts.length / BATCH_SIZE) },
          'Cache warm-up: batch complete',
        );
      }
    }

    // Phase 3: Support MCP data for connected users
    await warmSupportMcpCache();

    const elapsed = Date.now() - start;
    warmupState = {
      status: 'completed',
      startedAt: warmupState.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: elapsed,
      accountCount: accounts?.length ?? 0,
      error: null,
    };
    logger.info({ elapsed, accountCount: accounts?.length ?? 0 }, 'Cache warm-up complete');
  } catch (err) {
    const elapsed = Date.now() - start;
    warmupState = {
      status: 'failed',
      startedAt: warmupState.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: elapsed,
      accountCount: null,
      error: (err as Error).message,
    };
    logger.warn({ err: (err as Error).message }, 'Cache warm-up failed (non-fatal)');
  }
}

/**
 * Warm up support MCP cache for all users who have stored tokens.
 */
async function warmSupportMcpCache(): Promise<void> {
  const tokens = await db
    .select()
    .from(userMcpTokens)
    .where(eq(userMcpTokens.serverKey, SUPPORT_SERVER_KEY));

  if (tokens.length === 0) {
    logger.info('Cache warm-up: no users connected to support MCP, skipping');
    return;
  }

  logger.info({ userCount: tokens.length }, 'Cache warm-up: warming support MCP data');

  for (const row of tokens) {
    // Skip expired tokens
    if (row.expiresAt && row.expiresAt < new Date()) continue;

    try {
      const accessToken = decrypt(row.accessTokenEncrypted);

      // Discover available tools
      const tools = await listSupportTools(row.userId, accessToken);

      // Call read-only tools that return list data (common patterns)
      const listTools = (tools as Array<{ name: string }>)
        .filter((t) => t.name.startsWith('list_') || t.name.startsWith('get_'))
        .slice(0, 10); // Cap to avoid excessive calls

      if (listTools.length > 0) {
        await Promise.allSettled(
          listTools.map((tool) =>
            callSupportTool(row.userId, accessToken, tool.name, {}).catch(() => null),
          ),
        );
      }

      logger.info({ userId: row.userId, toolCount: listTools.length }, 'Cache warm-up: warmed support MCP for user');
    } catch (err) {
      logger.warn({ userId: row.userId, err: (err as Error).message }, 'Cache warm-up: failed for support MCP user');
    }
  }
}
