import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { userMcpTokens } from '../db/schema/index.js';
import { appSettings } from '../db/schema/index.js';
import { requireAuth } from '../auth/guards.js';
import { encrypt, decrypt } from '../services/encryption.service.js';
import { listSupportTools, resetSupportSession } from '../integrations/mcp/support-client.js';
import { logger } from '../utils/logger.js';

const SERVER_KEY = 'support-agent-tools';
const AUTH_SERVER_URL = 'https://auth-mcp.is.solo.io';
const SUPPORT_MCP_URL = 'https://support-agent-tools.is.solo.io/mcp';
const PKCE_COOKIE = 'siesta_support_mcp_pkce';

/**
 * Get or create a dynamic OAuth client for the support MCP server.
 * Client ID is stored in app_settings.
 */
async function getOrRegisterClient(): Promise<string> {
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'support_mcp_client_id'))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].value;
  }

  const redirectUri = `${env.API_URL}/auth/support-mcp/callback`;

  const response = await fetch(`${AUTH_SERVER_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'siesta',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'read:all',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dynamic client registration failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const clientId = data.client_id as string;

  // Persist client ID
  await db.insert(appSettings).values({
    key: 'support_mcp_client_id',
    value: clientId,
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: clientId, updatedAt: new Date() },
  });

  logger.info({ clientId }, 'Registered dynamic OAuth client for support MCP');
  return clientId;
}

/**
 * Sign a value with HMAC-SHA256 using SESSION_SECRET.
 */
function signValue(value: string): string {
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
  return `${value}.${sig}`;
}

function verifySignedValue(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.substring(0, lastDot);
  const sig = signed.substring(lastDot + 1);
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return value;
}

export async function supportMcpAuthRoutes(app: FastifyInstance) {
  /**
   * GET /auth/support-mcp/connect
   * Redirects the user to the support MCP OAuth authorization server.
   */
  app.get('/auth/support-mcp/connect', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const clientId = await getOrRegisterClient();

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    // Store state + codeVerifier in signed cookie
    const pkceCookieValue = signValue(`${state}:${codeVerifier}`);
    reply.setCookie(PKCE_COOKIE, pkceCookieValue, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
    });

    const redirectUri = `${env.API_URL}/auth/support-mcp/callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:all',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      resource: SUPPORT_MCP_URL,
    });

    return reply.redirect(`${AUTH_SERVER_URL}/authorize?${params.toString()}`);
  });

  /**
   * GET /auth/support-mcp/callback
   * OAuth callback — exchanges code for tokens.
   */
  app.get('/auth/support-mcp/callback', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const query = request.query as { state?: string; code?: string; error?: string; error_description?: string };

    if (query.error) {
      logger.error({ error: query.error, description: query.error_description }, 'Support MCP OAuth error');
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=${encodeURIComponent(query.error_description || query.error)}`);
    }

    const { state, code } = query;
    if (!state || !code) {
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=Missing+state+or+code`);
    }

    // Verify PKCE cookie
    const pkceCookie = request.cookies[PKCE_COOKIE];
    if (!pkceCookie) {
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=Missing+PKCE+cookie`);
    }

    const verified = verifySignedValue(pkceCookie);
    if (!verified) {
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=Invalid+PKCE+cookie`);
    }

    const colonIdx = verified.indexOf(':');
    const cookieState = verified.substring(0, colonIdx);
    const codeVerifier = verified.substring(colonIdx + 1);

    if (cookieState !== state) {
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=State+mismatch`);
    }

    reply.clearCookie(PKCE_COOKIE, { path: '/' });

    // Exchange code for tokens
    const clientId = await getOrRegisterClient();
    const redirectUri = `${env.API_URL}/auth/support-mcp/callback`;

    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('client_id', clientId);
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('code_verifier', codeVerifier);

    const tokenResponse = await fetch(`${AUTH_SERVER_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      logger.error({ status: tokenResponse.status, body: text }, 'Support MCP token exchange failed');
      return reply.redirect(`${env.APP_URL}/settings?support-mcp=error&message=Token+exchange+failed`);
    }

    const tokenData = await tokenResponse.json();
    const userId = request.user.id;

    // Store tokens encrypted
    const accessTokenEnc = encrypt(tokenData.access_token);
    const refreshTokenEnc = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Upsert tokens
    const existing = await db
      .select()
      .from(userMcpTokens)
      .where(and(eq(userMcpTokens.userId, userId), eq(userMcpTokens.serverKey, SERVER_KEY)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userMcpTokens)
        .set({
          accessTokenEncrypted: accessTokenEnc,
          refreshTokenEncrypted: refreshTokenEnc,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(userMcpTokens.id, existing[0].id));
    } else {
      await db.insert(userMcpTokens).values({
        userId,
        serverKey: SERVER_KEY,
        accessTokenEncrypted: accessTokenEnc,
        refreshTokenEncrypted: refreshTokenEnc,
        expiresAt,
      });
    }

    logger.info({ userId }, 'User connected to support MCP server');
    return reply.redirect(`${env.APP_URL}/settings?support-mcp=connected`);
  });

  /**
   * POST /api/settings/support-mcp-disconnect
   * Removes stored tokens for the support MCP server.
   */
  app.post('/api/settings/support-mcp-disconnect', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user.id;

    await db
      .delete(userMcpTokens)
      .where(and(eq(userMcpTokens.userId, userId), eq(userMcpTokens.serverKey, SERVER_KEY)));

    resetSupportSession(userId);
    return reply.send({ success: true });
  });

  /**
   * GET /api/settings/support-mcp-status
   * Returns connection status for the support MCP server.
   */
  app.get('/api/settings/support-mcp-status', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user.id;

    const tokens = await db
      .select()
      .from(userMcpTokens)
      .where(and(eq(userMcpTokens.userId, userId), eq(userMcpTokens.serverKey, SERVER_KEY)))
      .limit(1);

    if (tokens.length === 0) {
      return reply.send({ connected: false });
    }

    const isExpired = tokens[0].expiresAt && tokens[0].expiresAt < new Date();

    return reply.send({
      connected: !isExpired,
      connectedAt: tokens[0].createdAt,
    });
  });

  /**
   * GET /api/settings/support-mcp-tools
   * Lists available tools from the support MCP server.
   */
  app.get('/api/settings/support-mcp-tools', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user.id;

    const tokens = await db
      .select()
      .from(userMcpTokens)
      .where(and(eq(userMcpTokens.userId, userId), eq(userMcpTokens.serverKey, SERVER_KEY)))
      .limit(1);

    if (tokens.length === 0) {
      return reply.status(401).send({ error: 'Not connected to support MCP server' });
    }

    const accessToken = decrypt(tokens[0].accessTokenEncrypted);

    try {
      const tools = await listSupportTools(userId, accessToken);
      return reply.send({ tools });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list support MCP tools');
      return reply.status(502).send({ error: 'Failed to list tools from support MCP server' });
    }
  });
}
