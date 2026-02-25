import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { searchPortfolio } from '../services/mcp-search.service.js';

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/search
   * Semantic search across portfolio interactions.
   */
  app.get<{
    Querystring: {
      q: string;
      sourceTypes?: string;
      fromDate?: string;
      toDate?: string;
    };
  }>('/api/search', async (request, reply) => {
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
}
