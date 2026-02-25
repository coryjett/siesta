import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { eq, or } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { createSession, deleteSession } from './session.js';
import { requireAuth } from './guards.js';
import { BadRequestError } from '../utils/errors.js';

const COOKIE_NAME = 'siesta_session';
const PKCE_COOKIE_NAME = 'siesta_pkce';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Sign a value with HMAC-SHA256 using SESSION_SECRET so it can't be tampered with.
 */
function signValue(value: string): string {
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
  return `${value}.${sig}`;
}

/**
 * Verify and extract a signed value. Returns null if invalid.
 */
function verifySignedValue(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.substring(0, lastDot);
  const sig = signed.substring(lastDot + 1);
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return value;
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

/**
 * Decode a JWT payload without verification (the token was just received from the IdP).
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload);
}

export async function authPlugin(app: FastifyInstance) {
  /**
   * GET /auth/login
   * Redirects to Keycloak authorization endpoint with PKCE.
   */
  app.get('/auth/login', async (_request, reply) => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    // Store state + codeVerifier in a signed cookie (stateless across replicas)
    const pkceCookieValue = signValue(`${state}:${codeVerifier}`);
    reply.setCookie(PKCE_COOKIE_NAME, pkceCookieValue, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    const redirectUri = `${env.API_URL}/auth/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.MCP_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${env.MCP_AUTH_URL}?${params.toString()}`;
    return reply.redirect(url);
  });

  /**
   * GET /auth/callback
   * Keycloak OIDC callback. Exchanges authorization code for tokens,
   * decodes the ID token to get user info, upserts user, creates session.
   */
  app.get('/auth/callback', async (request, reply) => {
    const query = request.query as { state?: string; code?: string; error?: string; error_description?: string };

    if (query.error) {
      request.log.error({ error: query.error, description: query.error_description }, 'Keycloak callback error');
      return reply.redirect(`${env.APP_URL}/login?error=${encodeURIComponent(query.error_description || query.error)}`);
    }

    const { state, code } = query;

    if (!state || !code) {
      throw new BadRequestError('Missing state or code parameter');
    }

    // Read PKCE verifier from signed cookie (stateless across replicas)
    const pkceCookie = request.cookies[PKCE_COOKIE_NAME];
    if (!pkceCookie) {
      throw new BadRequestError('Missing PKCE cookie — please try logging in again');
    }

    const verified = verifySignedValue(pkceCookie);
    if (!verified) {
      throw new BadRequestError('Invalid PKCE cookie signature');
    }

    const colonIdx = verified.indexOf(':');
    const cookieState = verified.substring(0, colonIdx);
    const codeVerifier = verified.substring(colonIdx + 1);

    if (cookieState !== state) {
      throw new BadRequestError('State mismatch — please try logging in again');
    }

    // Clear the PKCE cookie
    reply.clearCookie(PKCE_COOKIE_NAME, { path: '/' });

    const redirectUri = `${env.API_URL}/auth/callback`;

    // Exchange code for tokens
    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('client_id', env.MCP_CLIENT_ID);
    tokenParams.set('client_secret', env.MCP_CLIENT_SECRET);
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('code_verifier', codeVerifier);

    const tokenResponse = await fetch(env.MCP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      request.log.error({ status: tokenResponse.status, body: text }, 'Keycloak token exchange failed');
      return reply.redirect(`${env.APP_URL}/login?error=${encodeURIComponent('Authentication failed')}`);
    }

    const tokenData = await tokenResponse.json();
    const idToken = tokenData.id_token;

    if (!idToken) {
      return reply.redirect(`${env.APP_URL}/login?error=${encodeURIComponent('No ID token received')}`);
    }

    // Decode ID token to extract user claims
    const claims = decodeJwtPayload(idToken);
    const sub = claims.sub as string | undefined;
    const email = (claims.email as string | undefined) ?? (claims.preferred_username as string | undefined);
    const name = (claims.name as string | undefined) ?? (claims.preferred_username as string | undefined);

    if (!sub || !email) {
      return reply.redirect(`${env.APP_URL}/login?error=${encodeURIComponent('Missing user info in token')}`);
    }

    // Upsert user by keycloakSub, fall back to email match for first migration
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.keycloakSub, sub), eq(users.email, email)))
      .limit(1);

    let user: typeof users.$inferSelect;

    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          keycloakSub: sub,
          email,
          name: name ?? existing[0].name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      user = updated[0];
    } else {
      const created = await db
        .insert(users)
        .values({
          email,
          name: name ?? email,
          keycloakSub: sub,
          role: 'se',
        })
        .returning();
      user = created[0];
    }

    const sessionToken = await createSession(user.id);
    reply.setCookie(COOKIE_NAME, sessionToken, buildCookieOptions());

    request.log.info({ userId: user.id, email: user.email }, 'User logged in via Keycloak');

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
   * Destroys the session, clears the cookie, and returns the Keycloak logout URL
   * so the frontend can end the IdP session too.
   */
  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];

    if (token) {
      await deleteSession(token);
    }

    reply.clearCookie(COOKIE_NAME, { path: '/' });

    // Build Keycloak end-session URL from the auth URL
    const keycloakLogoutUrl = env.MCP_AUTH_URL.replace(/\/auth$/, '/logout');
    const params = new URLSearchParams({
      client_id: env.MCP_CLIENT_ID,
      post_logout_redirect_uri: `${env.APP_URL}/login?logout`,
    });

    return reply.send({
      success: true,
      logoutUrl: `${keycloakLogoutUrl}?${params.toString()}`,
    });
  });
}
