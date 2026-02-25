import { callTool } from '../integrations/mcp/client.js';
import { cachedCall } from './cache.service.js';
import type { McpPortfolioStats } from '../integrations/mcp/types.js';

export async function getPortfolioStats() {
  return cachedCall<McpPortfolioStats>('mcp:portfolio:stats', 900, () =>
    callTool<McpPortfolioStats>('get_portfolio_stats', {}),
  );
}
