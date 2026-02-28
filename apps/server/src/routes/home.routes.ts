import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getHomepageData } from '../services/mcp-home.service.js';
import { getUserActionItemsAcrossAccounts } from '../services/action-items.service.js';
import { getUpcomingMeetings } from '../services/meetings.service.js';
import { generateInsights, generateCompetitiveAnalysis, generateCallCoaching } from '../services/openai-summary.service.js';
import { listAccounts } from '../services/mcp-accounts.service.js';
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
}
