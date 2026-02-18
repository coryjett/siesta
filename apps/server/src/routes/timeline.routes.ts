import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getUnifiedTimeline } from '../services/timeline.service.js';

export async function timelineRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/timeline
   * Get a unified timeline of activities, calls, and notes.
   * Supports filters for accountId, opportunityId, and pagination.
   */
  app.get<{
    Querystring: {
      accountId?: string;
      opportunityId?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/api/timeline', async (request, reply) => {
    const { accountId, opportunityId, page, pageSize } = request.query;

    const pageNum = page ? parseInt(page, 10) : undefined;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : undefined;

    const result = await getUnifiedTimeline(accountId, opportunityId, pageNum, pageSizeNum);
    return reply.send(result);
  });
}
