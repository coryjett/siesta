import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/guards.js';
import { db } from '../db/client.js';
import { syncState } from '../db/schema/index.js';
import { BadRequestError } from '../utils/errors.js';

export async function syncRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/sync/status
   * Get sync status for all provider/entity combinations.
   */
  app.get('/api/sync/status', async (_request, reply) => {
    const states = await db.select().from(syncState);

    return reply.send(
      states.map((s) => ({
        provider: s.provider,
        entity: s.entity,
        status: s.status,
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
        lastError: s.lastError,
        recordsProcessed: s.recordsProcessed,
      })),
    );
  });

  /**
   * POST /api/sync/trigger/:provider
   * Trigger a manual sync for a provider.
   * Requires admin role.
   */
  app.post<{ Params: { provider: string } }>(
    '/api/sync/trigger/:provider',
    {
      preHandler: [requireRole('admin')],
    },
    async (request, reply) => {
      const { provider } = request.params;

      if (provider !== 'salesforce' && provider !== 'gong') {
        throw new BadRequestError('Invalid provider. Must be "salesforce" or "gong".');
      }

      // Check if any sync is already running for this provider
      const running = await db
        .select()
        .from(syncState)
        .where(eq(syncState.provider, provider));

      const isRunning = running.some((s) => s.status === 'running');
      if (isRunning) {
        throw new BadRequestError(`Sync is already running for ${provider}`);
      }

      // Mark all entities for this provider as 'running'
      // In a real implementation, this would also enqueue a background job
      const entities = running.map((s) => s.entity);
      for (const entity of entities) {
        await db
          .update(syncState)
          .set({ status: 'running', updatedAt: new Date() })
          .where(eq(syncState.provider, provider));
      }

      return reply.send({
        success: true,
        message: `Sync triggered for ${provider}`,
        entities,
      });
    },
  );
}
