import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { oauthTokens } from '../db/schema/index.js';
import { encrypt, decrypt } from './encryption.service.js';
import { NotFoundError } from '../utils/errors.js';

interface TokenData {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  instanceUrl?: string | null;
  expiresAt?: Date | null;
}

interface DecryptedTokenData {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  instanceUrl: string | null;
  expiresAt: Date | null;
}

/**
 * Save (upsert) OAuth tokens for a provider. Tokens are encrypted before storage.
 */
export async function saveTokens(provider: string, data: TokenData): Promise<void> {
  const accessTokenEncrypted = encrypt(data.accessToken);
  const refreshTokenEncrypted = data.refreshToken ? encrypt(data.refreshToken) : null;

  await db
    .insert(oauthTokens)
    .values({
      provider,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenType: data.tokenType ?? null,
      instanceUrl: data.instanceUrl ?? null,
      expiresAt: data.expiresAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenType: data.tokenType ?? null,
        instanceUrl: data.instanceUrl ?? null,
        expiresAt: data.expiresAt ?? null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Get and decrypt OAuth tokens for a provider.
 * Returns null if no tokens exist for the provider.
 */
export async function getTokens(provider: string): Promise<DecryptedTokenData | null> {
  const result = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const row = result[0];

  return {
    accessToken: decrypt(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decrypt(row.refreshTokenEncrypted) : null,
    tokenType: row.tokenType,
    instanceUrl: row.instanceUrl,
    expiresAt: row.expiresAt,
  };
}

/**
 * Delete OAuth tokens for a provider.
 */
export async function deleteTokens(provider: string): Promise<void> {
  const result = await db
    .delete(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('OAuth tokens', provider);
  }
}

/**
 * Check whether tokens exist for a provider (without decrypting).
 */
export async function hasTokens(provider: string): Promise<boolean> {
  const result = await db
    .select({ provider: oauthTokens.provider })
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, provider))
    .limit(1);

  return result.length > 0;
}
