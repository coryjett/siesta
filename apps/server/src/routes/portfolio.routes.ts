import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getPortfolioStats } from '../services/mcp-portfolio.service.js';

export async function portfolioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/portfolio/stats
   * Portfolio health dashboard data.
   */
  app.get('/api/portfolio/stats', async (_request, reply) => {
    const stats = await getPortfolioStats();
    return reply.send(stats);
  });
}
