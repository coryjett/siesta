import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { search } from '../services/search.service.js';

export async function searchRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/search
   * Search transcripts with full-text search.
   */
  app.get('/api/search', async (request, reply) => {
    const { q, accountId, opportunityId, fromDate, toDate, page, pageSize } = request.query as Record<string, string>;

    if (!q || q.trim().length < 2) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'Search query must be at least 2 characters'
      });
    }

    const results = await search({
      query: q,
      accountId,
      opportunityId,
      fromDate,
      toDate,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });

    return results;
  });
}
