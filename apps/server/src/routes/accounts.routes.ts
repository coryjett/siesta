import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import {
  listAccounts,
  getAccount,
  getAccountOpportunities,
  getAccountContacts,
  getAccountActivities,
} from '../services/accounts.service.js';

export async function accountsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/accounts
   * List accounts with optional search and pagination.
   */
  app.get<{
    Querystring: { search?: string; page?: string; pageSize?: string };
  }>('/api/accounts', async (request, reply) => {
    const { search, page, pageSize } = request.query;

    const result = await listAccounts({
      search: search || undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /api/accounts/:id
   * Get a single account by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id',
    async (request, reply) => {
      const account = await getAccount(request.params.id);
      return reply.send(account);
    },
  );

  /**
   * GET /api/accounts/:id/opportunities
   * Get all opportunities for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/opportunities',
    async (request, reply) => {
      const opportunities = await getAccountOpportunities(request.params.id);
      return reply.send(opportunities);
    },
  );

  /**
   * GET /api/accounts/:id/contacts
   * Get all contacts for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/contacts',
    async (request, reply) => {
      const contacts = await getAccountContacts(request.params.id);
      return reply.send(contacts);
    },
  );

  /**
   * GET /api/accounts/:id/activities
   * Get all activities for an account.
   */
  app.get<{ Params: { id: string } }>(
    '/api/accounts/:id/activities',
    async (request, reply) => {
      const activities = await getAccountActivities(request.params.id);
      return reply.send(activities);
    },
  );
}
