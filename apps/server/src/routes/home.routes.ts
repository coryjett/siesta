import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getHomepageData } from '../services/mcp-home.service.js';

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
}
