import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { callTool } from '../integrations/mcp/client.js';
import type { McpOpportunity } from '../integrations/mcp/types.js';

export async function opportunitiesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/opportunities
   * List opportunities, optionally filtered by account.
   */
  app.get<{
    Querystring: { accountId?: string };
  }>('/api/opportunities', async (request, reply) => {
    const { accountId } = request.query;
    const args: Record<string, unknown> = {};
    if (accountId) args.account_id = accountId;

    const result = await callTool<McpOpportunity[]>('get_opportunities', args);
    return reply.send(result);
  });

  /**
   * GET /api/opportunities/:id
   * Get a single opportunity by ID.
   * Since MCP opportunities are account-scoped, we search across accounts.
   */
  app.get<{ Params: { id: string } }>(
    '/api/opportunities/:id',
    async (_request, reply) => {
      return reply.status(404).send({
        statusCode: 404,
        error: 'NotFound',
        message: 'Individual opportunity lookup is not supported. View opportunities through the account detail page.',
      });
    },
  );
}
