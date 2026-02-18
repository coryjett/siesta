import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from './session.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { users } from '../db/schema/index.js';

const COOKIE_NAME = 'siesta_session';

type User = typeof users.$inferSelect;

// Extend FastifyRequest to include the authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

// Role hierarchy: admin > se_manager > se
const ROLE_LEVELS: Record<string, number> = {
  se: 0,
  se_manager: 1,
  admin: 2,
};

/**
 * Fastify preHandler hook that validates the session cookie
 * and attaches the authenticated user to the request.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = request.cookies[COOKIE_NAME];

  if (!token) {
    throw new UnauthorizedError('No session cookie');
  }

  const user = await validateSession(token);

  if (!user) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  request.user = user;
}

/**
 * Returns a Fastify preHandler hook that checks the user has
 * at least the required role level.
 * Must be used after requireAuth.
 */
export function requireRole(role: 'se' | 'se_manager' | 'admin') {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    const userLevel = ROLE_LEVELS[request.user.role] ?? 0;
    const requiredLevel = ROLE_LEVELS[role] ?? 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenError(`Requires ${role} role or higher`);
    }
  };
}
