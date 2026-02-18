import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/guards.js';
import { listUsers, updateUserRole } from '../services/users.service.js';
import { BadRequestError } from '../utils/errors.js';
import { userRoleUpdateSchema } from '@siesta/shared';

export async function usersRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/users
   * List all users. Requires se_manager or admin role.
   */
  app.get('/api/users', {
    preHandler: [requireRole('se_manager')],
  }, async (_request, reply) => {
    const users = await listUsers();
    return reply.send(users);
  });

  /**
   * PUT /api/users/:id/role
   * Update a user's role. Requires admin role.
   */
  app.put<{ Params: { id: string } }>(
    '/api/users/:id/role',
    {
      preHandler: [requireRole('admin')],
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as { role: string; sfUserId?: string | null };

      const parsed = userRoleUpdateSchema.safeParse({
        userId: id,
        role: body.role,
        sfUserId: body.sfUserId,
      });

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
      }

      const updatedUser = await updateUserRole(
        parsed.data.userId,
        parsed.data.role,
        parsed.data.sfUserId,
      );

      return reply.send(updatedUser);
    },
  );
}
