import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getHomepageData } from '../services/mcp-home.service.js';
import { getUserActionItemsAcrossAccounts } from '../services/action-items.service.js';
import { getUpcomingMeetings } from '../services/meetings.service.js';
import { generateInsights, generateCompetitiveAnalysis, generateCompetitorDetail, generateCallCoaching, generateWinLossAnalysis } from '../services/openai-summary.service.js';
import { listAccounts, getAccountOpportunities } from '../services/mcp-accounts.service.js';
import { getClosedOpportunities, isCustomer360Configured } from '../services/customer360.service.js';
import { cachedCall, getCache } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';

export async function homeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/home
   * Homepage data with portfolio stats and user's accounts.
   */
  app.get('/api/home', async (request, reply) => {
    const userName = request.user.name;
    const userEmail = request.user.email;
    const data = await getHomepageData(userName, userEmail);
    return reply.send(data);
  });

  /**
   * GET /api/home/my-action-items
   * AI-extracted action items assigned to the current user across all their accounts.
   * Cached for 10 min to avoid repeated slow OpenAI calls.
   */
  app.get('/api/home/my-action-items', async (request, reply) => {
    const userName = request.user.name;
    const userEmail = request.user.email;
    const userId = request.user.id;

    const cacheKey = `home:my-action-items:${userId}`;

    const result = await cachedCall(cacheKey, 600, async () => {
      try {
        const data = await getHomepageData(userName, userEmail);
        const accounts = (data.myAccounts ?? []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: a.name as string,
        }));

        if (accounts.length === 0) {
          return { items: [] };
        }

        const items = await getUserActionItemsAcrossAccounts(accounts, userName, userId);
        return { items };
      } catch (err) {
        logger.error({ err, userId }, '[my-action-items] Failed to fetch action items');
        return { items: [] };
      }
    });

    return reply.send(result);
  });

  /**
   * GET /api/home/upcoming-meetings
   * Upcoming calendar meetings for the current user across their accounts.
   */
  app.get('/api/home/upcoming-meetings', async (request, reply) => {
    const userName = request.user.name;
    const userEmail = request.user.email;

    // Fetch all accounts so we find meetings where the user is a participant
    // on any account, not just accounts they own
    const allAccountsRaw = await listAccounts();
    const accounts = (allAccountsRaw as Array<Record<string, unknown>>).map((a) => ({
      id: a.id as string,
      name: a.name as string,
    }));

    if (accounts.length === 0) {
      return reply.send({ meetings: [] });
    }

    const meetings = await getUpcomingMeetings(userName, userEmail, accounts);
    return reply.send({ meetings });
  });

  /**
   * GET /api/insights
   * AI-generated cross-account insights: technology patterns, conversation
   * trends, and cross-team observations. Cached 4 hours per user.
   */
  app.get('/api/insights', async (request, reply) => {
    const userName = request.user.name;
    const userEmail = request.user.email;
    const userId = request.user.id;
    const emptyResponse = { technologyPatterns: [], conversationTrends: [], crossTeamInsights: [] };

    try {
      // Fast path: return cached insights without fetching account data
      const cached = await getCache<Record<string, unknown>>(`openai:insights:${userId}`);
      if (cached) {
        return reply.send(cached);
      }

      // Cache miss: fetch account data in parallel, then generate
      const [data, allAccountsRaw] = await Promise.all([
        getHomepageData(userName, userEmail),
        listAccounts(),
      ]);

      const userAccounts = (data.myAccounts ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: a.name as string,
      }));

      const allAccounts = (allAccountsRaw as Array<Record<string, unknown>>).map((a) => ({
        id: a.id as string,
        name: a.name as string,
      }));

      const result = await generateInsights(userId, userAccounts, allAccounts);
      return reply.send(result ?? emptyResponse);
    } catch (err) {
      logger.error({ err, userId }, '[insights] Failed to generate insights');
      return reply.send(emptyResponse);
    }
  });

  /**
   * GET /api/competitive-analysis
   * AI-generated competitive intelligence: competitor mentions, product
   * alignment, and competitive threats. Cached 4 hours per user.
   */
  app.get('/api/competitive-analysis', async (request, reply) => {
    const userName = request.user.name;
    const userEmail = request.user.email;
    const userId = request.user.id;
    const emptyResponse = { competitorMentions: [], productAlignment: [], competitiveThreats: [] };

    try {
      // Fast path: return cached analysis without fetching account data
      const cached = await getCache<Record<string, unknown>>(`openai:competitive:${userId}`);
      if (cached) {
        return reply.send(cached);
      }

      // Cache miss: fetch account data, then generate
      const data = await getHomepageData(userName, userEmail);

      const userAccounts = (data.myAccounts ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: a.name as string,
      }));

      const result = await generateCompetitiveAnalysis(userId, userAccounts);
      return reply.send(result ?? emptyResponse);
    } catch (err) {
      logger.error({ err, userId }, '[competitive-analysis] Failed to generate competitive analysis');
      return reply.send(emptyResponse);
    }
  });

  /**
   * GET /api/competitive-analysis/detail
   * Detailed Solo.io vs competitor analysis. Cached 7 days per competitor.
   */
  app.get<{
    Querystring: { competitor: string; category?: string };
  }>('/api/competitive-analysis/detail', async (request, reply) => {
    const { competitor, category } = request.query;

    if (!competitor) {
      return reply.status(400).send({ error: 'competitor query parameter is required' });
    }

    try {
      const result = await generateCompetitorDetail(competitor, category ?? 'Unknown');
      return reply.send(result ?? {
        competitor,
        category: category ?? 'Unknown',
        overview: '',
        soloProduct: '',
        featureComparison: [],
        soloStrengths: [],
        competitorStrengths: [],
        idealCustomerProfile: '',
        winStrategy: '',
        commonObjections: [],
        pricingInsight: '',
        marketTrend: '',
      });
    } catch (err) {
      logger.error({ err, competitor }, '[competitor-detail] Failed to generate competitor detail');
      return reply.send({
        competitor,
        category: category ?? 'Unknown',
        overview: '',
        soloProduct: '',
        featureComparison: [],
        soloStrengths: [],
        competitorStrengths: [],
        idealCustomerProfile: '',
        winStrategy: '',
        commonObjections: [],
        pricingInsight: '',
        marketTrend: '',
      });
    }
  });

  /**
   * GET /api/call-coaching
   * AI-generated call quality analysis from Gong transcripts.
   * Cached 24 hours per user.
   */
  app.get('/api/call-coaching', async (request, reply) => {
    const userId = request.user.id;
    const emptyResponse = { overallScore: 0, totalCallsAnalyzed: 0, metrics: [], highlights: [], summary: '' };

    try {
      // Fast path: return cached analysis without fetching account data
      const cached = await getCache<Record<string, unknown>>(`openai:coaching:${userId}`);
      if (cached) {
        return reply.send(cached);
      }

      // Cache miss: fetch account data, then generate
      const data = await getHomepageData(request.user.name, request.user.email);

      const userAccounts = (data.myAccounts ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: a.name as string,
      }));

      const result = await generateCallCoaching(userId, userAccounts);
      return reply.send(result ?? emptyResponse);
    } catch (err) {
      logger.error({ err, userId }, '[call-coaching] Failed to generate call coaching');
      return reply.send(emptyResponse);
    }
  });

  /**
   * GET /api/win-loss-analysis
   * AI-generated win/loss analysis from closed opportunities and Gong call briefs.
   * Fetches closed opps from Customer360 REST API (MCP only returns open opps).
   * Cached 4 hours shared across all users.
   */
  app.get('/api/win-loss-analysis', async (request, reply) => {
    const userId = request.user.id;
    const emptyResponse = {
      summary: '',
      stats: { totalClosed: 0, wins: 0, losses: 0, winRate: 0, totalWonAmount: 0, totalLostAmount: 0, avgWonAmount: 0, avgLostAmount: 0 },
      winFactors: [],
      lossFactors: [],
      recommendations: [],
    };

    try {
      // Fast path: shared cache
      const cached = await getCache<Record<string, unknown>>('openai:winloss:all');
      if (cached) {
        return reply.send(cached);
      }

      // Try Customer360 REST API first for closed opportunities,
      // then fall back to MCP (which may only return open pipeline opps)
      let closedOpps: Array<{
        id: string; name: string; stage: string; amount: number | null;
        closeDate: string | null; isWon: boolean; accountId: string; accountName: string;
      }> = [];

      const c360Opps = await getClosedOpportunities();

      if (c360Opps.length > 0) {
        // Customer360 returned closed opportunities — use them
        logger.info(
          { closedCount: c360Opps.length, source: 'customer360' },
          '[win-loss] Fetched closed opportunities from Customer360 REST API',
        );
        closedOpps = c360Opps.map((o) => {
          const stage = (o.stage_name ?? '').toLowerCase();
          return {
            id: String(o.id),
            name: String(o.name ?? ''),
            stage: String(o.stage_name ?? ''),
            amount: typeof o.arr === 'number' ? o.arr : null,
            closeDate: o.close_date ?? null,
            isWon: stage.includes('closed won') || stage === 'won',
            accountId: String(o.company_id ?? ''),
            accountName: String(o.company_name ?? ''),
          };
        });
      } else {
        // Fallback: try MCP get_opportunities and filter for closed
        if (!isCustomer360Configured()) {
          logger.info('[win-loss] CUSTOMER360_API_KEY not set, falling back to MCP');
        }

        const allAccountsRaw = await listAccounts();
        const mcpAccounts = (allAccountsRaw as Array<Record<string, unknown>>).map((a) => ({
          id: a.id as string,
          name: a.name as string,
        }));

        if (mcpAccounts.length > 0) {
          const oppResults = await Promise.allSettled(
            mcpAccounts.map((acct) =>
              getAccountOpportunities(acct.id).then((opps) => ({
                accountId: acct.id,
                accountName: acct.name,
                opps: opps as Array<Record<string, unknown>>,
              })),
            ),
          );

          for (const r of oppResults) {
            if (r.status === 'fulfilled') {
              for (const o of r.value.opps) {
                const rawStage = String(o.stage ?? o.stageName ?? o.stage_name ?? '');
                const stage = rawStage.toLowerCase();
                const isClosed = o.isClosed === true || o.is_closed === true || stage.includes('closed');
                if (!isClosed) continue;
                const isWon = o.isWon === true || o.is_won === true || stage.includes('closed won');
                closedOpps.push({
                  id: String(o.id),
                  name: String(o.name ?? ''),
                  stage: rawStage,
                  amount: typeof o.amount === 'number' ? o.amount : (typeof o.arr === 'number' ? o.arr : null),
                  closeDate: (o.closeDate ?? o.close_date ?? null) as string | null,
                  isWon,
                  accountId: r.value.accountId,
                  accountName: r.value.accountName,
                });
              }
            }
          }

          logger.info(
            { closedCount: closedOpps.length, source: 'mcp' },
            '[win-loss] MCP fallback opportunity scan results',
          );
        }
      }

      // Build account list from the closed opps for Gong brief lookups
      const accountMap = new Map<string, string>();
      for (const o of closedOpps) {
        if (o.accountId && o.accountName) {
          accountMap.set(o.accountId, o.accountName);
        }
      }
      const allAccounts = [...accountMap.entries()].map(([id, name]) => ({ id, name }));

      const result = await generateWinLossAnalysis('all', allAccounts, closedOpps);
      return reply.send(result ?? emptyResponse);
    } catch (err) {
      logger.error({ err, userId }, '[win-loss] Failed to generate win/loss analysis');
      return reply.send(emptyResponse);
    }
  });
}
