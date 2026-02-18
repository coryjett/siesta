import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import {
  listCalls,
  getCall,
  getCallTranscript,
} from '../services/gong.service.js';

export async function gongRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/gong/calls
   * List calls with filters.
   * Query params: accountId, opportunityId, fromDate, toDate, page, pageSize
   */
  app.get<{
    Querystring: {
      accountId?: string;
      opportunityId?: string;
      fromDate?: string;
      toDate?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/api/gong/calls', async (request, reply) => {
    const { accountId, opportunityId, fromDate, toDate, page, pageSize } = request.query;

    const result = await listCalls({
      accountId,
      opportunityId,
      fromDate,
      toDate,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /api/gong/calls/:id
   * Get a single call with its transcript.
   */
  app.get<{ Params: { id: string } }>(
    '/api/gong/calls/:id',
    async (request, reply) => {
      const { id } = request.params;
      const call = await getCall(id);
      return reply.send(call);
    },
  );

  /**
   * GET /api/gong/calls/:id/transcript
   * Get the transcript for a specific call.
   */
  app.get<{ Params: { id: string } }>(
    '/api/gong/calls/:id/transcript',
    async (request, reply) => {
      const { id } = request.params;
      const transcript = await getCallTranscript(id);
      return reply.send(transcript);
    },
  );
}
