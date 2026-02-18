import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import {
  createNote,
  updateNote,
  deleteNote,
  getNotesForAccount,
  getNotesForOpportunity,
  getNote,
} from '../services/notes.service.js';
import { BadRequestError } from '../utils/errors.js';
import { createNoteSchema, updateNoteSchema } from '@siesta/shared';

export async function notesRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * POST /api/notes
   * Create a new note. Any authenticated SE can create on any account/opportunity.
   */
  app.post('/api/notes', async (request, reply) => {
    const parsed = createNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const note = await createNote(request.user.id, parsed.data);
    return reply.status(201).send(note);
  });

  /**
   * PUT /api/notes/:id
   * Update a note. Only the author can update their own note.
   */
  app.put<{ Params: { id: string } }>(
    '/api/notes/:id',
    async (request, reply) => {
      const { id } = request.params;

      const parsed = updateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
      }

      const note = await updateNote(id, request.user.id, parsed.data);
      return reply.send(note);
    },
  );

  /**
   * DELETE /api/notes/:id
   * Delete a note. Only the author can delete their own note.
   */
  app.delete<{ Params: { id: string } }>(
    '/api/notes/:id',
    async (request, reply) => {
      const { id } = request.params;
      await deleteNote(id, request.user.id);
      return reply.status(204).send();
    },
  );

  /**
   * GET /api/notes
   * List notes with optional filters for accountId and opportunityId.
   * Supports pagination via page and pageSize query params.
   */
  app.get<{
    Querystring: {
      accountId?: string;
      opportunityId?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/api/notes', async (request, reply) => {
    const { accountId, opportunityId, page, pageSize } = request.query;

    if (!accountId && !opportunityId) {
      throw new BadRequestError('Either accountId or opportunityId must be provided');
    }

    const pageNum = page ? parseInt(page, 10) : undefined;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : undefined;

    if (accountId) {
      const result = await getNotesForAccount(accountId, pageNum, pageSizeNum);
      return reply.send(result);
    }

    const result = await getNotesForOpportunity(opportunityId!, pageNum, pageSizeNum);
    return reply.send(result);
  });

  /**
   * GET /api/notes/:id
   * Get a single note by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/api/notes/:id',
    async (request, reply) => {
      const { id } = request.params;
      const note = await getNote(id);
      return reply.send(note);
    },
  );
}
