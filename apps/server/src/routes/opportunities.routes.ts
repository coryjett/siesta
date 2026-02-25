import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { listAccounts, getAccountOpportunities } from '../services/mcp-accounts.service.js';
import { cachedCall } from '../services/cache.service.js';

function deriveIsClosed(opp: Record<string, unknown>): boolean {
  if (opp.isClosed === true || opp.is_closed === true) return true;
  const stage = String(opp.stage ?? '').toLowerCase();
  return stage.includes('closed');
}

function deriveIsWon(opp: Record<string, unknown>): boolean {
  if (opp.isWon === true || opp.is_won === true) return true;
  const stage = String(opp.stage ?? '').toLowerCase();
  return stage.includes('closed won');
}

export async function opportunitiesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/opportunities
   * List all opportunities across accounts, enriched with account info.
   * Optionally filtered by accountId.
   */
  app.get<{
    Querystring: { accountId?: string };
  }>('/api/opportunities', async (request, reply) => {
    const { accountId } = request.query;

    // If filtered by a single account, fetch just that account's opportunities
    if (accountId) {
      const opps = await getAccountOpportunities(accountId) as Array<Record<string, unknown>>;
      const mapped = opps.map((o) => ({
        id: o.id,
        name: o.name,
        stage: o.stage,
        amount: o.amount ?? o.arr ?? null,
        closeDate: o.closeDate ?? o.close_date ?? null,
        probability: o.probability ?? null,
        owner: o.owner ?? null,
        type: o.type ?? o.opportunityType ?? null,
        isClosed: deriveIsClosed(o),
        isWon: deriveIsWon(o),
        accountId,
        accountName: '',
      }));
      return reply.send(mapped);
    }

    // Fetch all accounts and their opportunities, cached for 5 minutes
    const result = await cachedCall('mcp:all-opportunities', 300, async () => {
      const accounts = await listAccounts();
      const allOpps: Array<Record<string, unknown>> = [];

      const oppResults = await Promise.allSettled(
        accounts.map((acct: Record<string, unknown>) =>
          getAccountOpportunities(String(acct.id)).then((opps) => ({
            accountId: String(acct.id),
            accountName: String(acct.name),
            opps: opps as Array<Record<string, unknown>>,
          })),
        ),
      );

      for (const r of oppResults) {
        if (r.status === 'fulfilled') {
          for (const o of r.value.opps) {
            allOpps.push({
              id: o.id,
              name: o.name,
              stage: o.stage,
              amount: o.amount ?? o.arr ?? null,
              closeDate: o.closeDate ?? o.close_date ?? null,
              probability: o.probability ?? null,
              owner: o.owner ?? null,
              type: o.type ?? o.opportunityType ?? null,
              isClosed: deriveIsClosed(o),
              isWon: deriveIsWon(o),
              accountId: r.value.accountId,
              accountName: r.value.accountName,
            });
          }
        }
      }

      return allOpps;
    });

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
