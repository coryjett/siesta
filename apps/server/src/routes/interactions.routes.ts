import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getInteractionDetail } from '../services/mcp-interactions.service.js';
import { generateGongCallBrief } from '../services/openai-summary.service.js';
import { searchPortfolio, getNegativeInteractions } from '../services/mcp-search.service.js';

export async function interactionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/interactions/search
   * Semantic search across interactions.
   */
  app.get<{
    Querystring: {
      q: string;
      sourceTypes?: string;
      fromDate?: string;
      toDate?: string;
    };
  }>('/api/interactions/search', async (request, reply) => {
    const { q, sourceTypes, fromDate, toDate } = request.query;

    if (!q || q.trim().length < 2) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'Search query must be at least 2 characters',
      });
    }

    const results = await searchPortfolio(q, {
      sourceTypes: sourceTypes ? sourceTypes.split(',') : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });

    return reply.send(results);
  });

  /**
   * GET /api/interactions/negative
   * Get interactions with negative sentiment.
   */
  app.get<{
    Querystring: { fromDate?: string; toDate?: string; limit?: string };
  }>('/api/interactions/negative', async (request, reply) => {
    const { fromDate, toDate, limit } = request.query;
    const results = await getNegativeInteractions({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return reply.send(results);
  });

  /**
   * GET /api/interactions/:accountId/:sourceType/:recordId
   * Get detailed conversation content for a specific interaction.
   */
  app.get<{
    Params: { accountId: string; sourceType: string; recordId: string };
    Querystring: { title?: string; brief?: string };
  }>(
    '/api/interactions/:accountId/:sourceType/:recordId',
    async (request, reply) => {
      const { accountId, sourceType, recordId } = request.params;
      const { title, brief } = request.query;
      const detail = await getInteractionDetail(accountId, sourceType, recordId, title);

      // For gong_calls with brief=true, synthesize a full call brief via OpenAI
      if (brief === 'true' && sourceType === 'gong_call' && title) {
        const fullBrief = await generateGongCallBrief(accountId, title);
        if (fullBrief) {
          return reply.send({ ...detail, content: fullBrief });
        }
      }

      return reply.send(detail);
    },
  );
}
