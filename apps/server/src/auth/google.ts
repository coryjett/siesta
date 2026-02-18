import crypto from 'node:crypto';
import * as client from 'openid-client';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, userGoogleTokens } from '../db/schema/index.js';
import { createSession } from './session.js';
import { env } from '../config/env.js';
import { encrypt } from '../services/encryption.service.js';
import { BadRequestError } from '../utils/errors.js';

let oidcConfig: client.Configuration | null = null;

/**
 * Get the OIDC configuration via discovery from Google.
 * Caches the config after the first call.
 */
async function getOIDCConfig(): Promise<client.Configuration> {
  if (oidcConfig) {
    return oidcConfig;
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OIDC environment variables are not configured');
  }

  oidcConfig = await client.discovery(
    new URL('https://accounts.google.com'),
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  );

  return oidcConfig;
}

/**
 * Build the authorization URL for Google OIDC login.
 * Returns the URL and the PKCE code verifier (to be stored in session/state).
 */
export async function buildAuthUrl(): Promise<{ url: URL; codeVerifier: string; state: string }> {
  const config = await getOIDCConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error('GOOGLE_REDIRECT_URI is not configured');
  }

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return { url, codeVerifier, state };
}

/**
 * Handle the OIDC callback: exchange code for tokens, get userinfo,
 * upsert the user, store Google tokens, and create a session.
 */
export async function handleCallback(
  callbackUrl: URL,
  codeVerifier: string,
  expectedState: string,
): Promise<{ token: string; user: typeof users.$inferSelect }> {
  const config = await getOIDCConfig();

  // Exchange authorization code for tokens
  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: expectedState,
  });

  // Extract claims from the ID token
  const claims = tokens.claims();
  if (!claims) {
    throw new BadRequestError('No claims in ID token');
  }

  const sub = claims.sub;
  const email = claims.email as string | undefined;
  const name = claims.name as string | undefined;
  const picture = claims.picture as string | undefined;

  if (!sub || !email) {
    throw new BadRequestError('Missing sub or email in ID token claims');
  }

  // Upsert user by googleSub
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, sub))
    .limit(1);

  let user: typeof users.$inferSelect;

  if (existing.length > 0) {
    // Update existing user
    const updated = await db
      .update(users)
      .set({
        email,
        name: name ?? existing[0].name,
        avatarUrl: picture ?? existing[0].avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.googleSub, sub))
      .returning();
    user = updated[0];
  } else {
    // Create new user
    const created = await db
      .insert(users)
      .values({
        email,
        name: name ?? email,
        googleSub: sub,
        avatarUrl: picture,
        role: 'se', // default role for new Google users
      })
      .returning();
    user = created[0];
  }

  // Store Google OAuth tokens for Calendar API access
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn = tokens.expires_in;

  if (accessToken) {
    const accessTokenEncrypted = encrypt(accessToken);
    const refreshTokenEncrypted = refreshToken ? encrypt(refreshToken) : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await db
      .insert(userGoogleTokens)
      .values({
        userId: user.id,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userGoogleTokens.userId,
        set: {
          accessTokenEncrypted,
          refreshTokenEncrypted,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  }

  const sessionToken = await createSession(user.id);

  return { token: sessionToken, user };
}
