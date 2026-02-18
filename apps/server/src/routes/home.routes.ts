import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getHomepageData } from '../services/home.service.js';

export async function homeRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/home
   * Homepage data for the current user.
   */
  app.get('/api/home', async (request, reply) => {
    const user = request.user;
    const data = await getHomepageData(user.id, user.role);
    return reply.send(data);
  });
}
