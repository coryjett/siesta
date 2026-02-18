import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import {
  listOpportunities,
  getOpportunity,
  getOpportunityContacts,
  getOpportunityActivities,
  getKanbanData,
} from '../services/opportunities.service.js';

export async function opportunitiesRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/opportunities/kanban
   * Kanban data: stages + grouped opportunities.
   * Must be registered before the :id route to avoid conflict.
   */
  app.get<{
    Querystring: { assignedSeUserId?: string };
  }>('/api/opportunities/kanban', async (request, reply) => {
    const { assignedSeUserId } = request.query;
    const user = request.user;

    // SEs are scoped to their own opportunities; managers/admins can filter by SE
    let seFilter: string | undefined;
    if (user.role === 'se') {
      seFilter = user.id;
    } else if (assignedSeUserId) {
      seFilter = assignedSeUserId;
    }

    const result = await getKanbanData({
      assignedSeUserId: seFilter,
    });

    return reply.send(result);
  });

  /**
   * GET /api/opportunities
   * List opportunities with filters and pagination.
   */
  app.get<{
    Querystring: {
      assignedSeUserId?: string;
      stageName?: string;
      accountId?: string;
      search?: string;
      minAmount?: string;
      maxAmount?: string;
      closeDateFrom?: string;
      closeDateTo?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/api/opportunities', async (request, reply) => {
    const {
      assignedSeUserId,
      stageName,
      accountId,
      search,
      minAmount,
      maxAmount,
      closeDateFrom,
      closeDateTo,
      page,
      pageSize,
    } = request.query;

    const user = request.user;

    // SEs are scoped to their own assigned opportunities
    let seFilter: string | undefined;
    if (user.role === 'se') {
      seFilter = user.id;
    } else if (assignedSeUserId) {
      seFilter = assignedSeUserId;
    }

    const result = await listOpportunities({
      assignedSeUserId: seFilter,
      stageName: stageName || undefined,
      accountId: accountId || undefined,
      search: search || undefined,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      closeDateFrom: closeDateFrom || undefined,
      closeDateTo: closeDateTo || undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /api/opportunities/:id
   * Get a single opportunity by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/api/opportunities/:id',
    async (request, reply) => {
      const opportunity = await getOpportunity(request.params.id);
      return reply.send(opportunity);
    },
  );

  /**
   * GET /api/opportunities/:id/contacts
   * Get contacts with roles for an opportunity.
   */
  app.get<{ Params: { id: string } }>(
    '/api/opportunities/:id/contacts',
    async (request, reply) => {
      const contacts = await getOpportunityContacts(request.params.id);
      return reply.send(contacts);
    },
  );

  /**
   * GET /api/opportunities/:id/activities
   * Get activities for an opportunity.
   */
  app.get<{ Params: { id: string } }>(
    '/api/opportunities/:id/activities',
    async (request, reply) => {
      const activities = await getOpportunityActivities(request.params.id);
      return reply.send(activities);
    },
  );
}
