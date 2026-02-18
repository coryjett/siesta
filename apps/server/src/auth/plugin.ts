import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { devBypassLogin } from './dev-bypass.js';
import { buildAuthUrl, handleCallback } from './google.js';
import { deleteSession } from './session.js';
import { requireAuth } from './guards.js';
import { BadRequestError } from '../utils/errors.js';

const COOKIE_NAME = 'siesta_session';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// In-memory store for PKCE verifiers keyed by state parameter.
// In production this should be stored in Redis or a similar store,
// but for now this works for single-instance deployments.
const pkceStore = new Map<string, { codeVerifier: string; createdAt: number }>();

// Clean up stale PKCE entries older than 10 minutes
function cleanPkceStore() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of pkceStore) {
    if (value.createdAt < tenMinutesAgo) {
      pkceStore.delete(key);
    }
  }
}

function buildCookieOptions() {
  return {
    path: '/' as const,
    httpOnly: true,
    secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export async function authPlugin(app: FastifyInstance) {
  /**
   * GET /auth/login
   * In Google mode: redirects to the Google OIDC authorization endpoint.
   * In dev-bypass mode: returns info about how to use dev login.
   */
  app.get('/auth/login', async (request, reply) => {
    if (env.AUTH_MODE === 'dev-bypass') {
      return reply.send({
        authMode: 'dev-bypass',
        message: 'POST to /auth/dev-login with { email, name, role }',
      });
    }

    // Google OIDC flow
    const { url, codeVerifier, state } = await buildAuthUrl();

    // Store PKCE verifier keyed by state
    cleanPkceStore();
    pkceStore.set(state, { codeVerifier, createdAt: Date.now() });

    return reply.redirect(url.toString());
  });

  /**
   * POST /auth/dev-login
   * Dev bypass login: accepts email, name, role in body.
   * Only works when AUTH_MODE=dev-bypass.
   */
  app.post('/auth/dev-login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'name', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['se', 'se_manager', 'admin'] },
        },
      },
    },
  }, async (request, reply) => {
    const { email, name, role } = request.body as { email: string; name: string; role: 'se' | 'se_manager' | 'admin' };

    const { token, user } = await devBypassLogin({ email, name, role });

    reply.setCookie(COOKIE_NAME, token, buildCookieOptions());

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  });

  /**
   * GET /auth/callback
   * OIDC callback endpoint. Exchanges the authorization code for tokens,
   * upserts the user, creates a session, and redirects to the app.
   */
  app.get('/auth/callback', async (request, reply) => {
    const query = request.query as { state?: string; code?: string; error?: string; error_description?: string };

    if (query.error) {
      request.log.error({ error: query.error, description: query.error_description }, 'OIDC callback error');
      return reply.redirect(`${env.APP_URL}/login?error=${encodeURIComponent(query.error_description || query.error)}`);
    }

    const { state } = query;

    if (!state) {
      throw new BadRequestError('Missing state parameter');
    }

    // Retrieve the PKCE verifier for this state
    const pkceEntry = pkceStore.get(state);
    if (!pkceEntry) {
      throw new BadRequestError('Invalid or expired state parameter');
    }
    pkceStore.delete(state);

    // Build the full callback URL from the request
    const callbackUrl = new URL(`${env.API_URL}${request.url}`);

    const { token, user } = await handleCallback(callbackUrl, pkceEntry.codeVerifier, state);

    reply.setCookie(COOKIE_NAME, token, buildCookieOptions());

    request.log.info({ userId: user.id, email: user.email }, 'User logged in via Google');

    return reply.redirect(env.APP_URL);
  });

  /**
   * GET /auth/me
   * Returns the currently authenticated user.
   */
  app.get('/auth/me', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const user = request.user;

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  });

  /**
   * POST /auth/logout
   * Destroys the session and clears the cookie.
   */
  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];

    if (token) {
      await deleteSession(token);
    }

    reply.clearCookie(COOKIE_NAME, { path: '/' });

    return reply.send({ success: true });
  });
}
