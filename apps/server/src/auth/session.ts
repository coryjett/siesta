import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema/index.js';
import { users } from '../db/schema/index.js';

const SESSION_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session for a user.
 * Generates a random token, stores its SHA-256 hash in the database,
 * and returns the raw token to be sent to the client.
 */
export async function createSession(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

/**
 * Validate a session token.
 * Hashes the token, looks up the session, checks expiry,
 * and returns the associated user if valid.
 * Returns null if the session is invalid or expired.
 */
export async function validateSession(token: string) {
  const tokenHash = hashToken(token);

  const result = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { session, user } = result[0];

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return user;
}

/**
 * Delete a session by its raw token.
 */
export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
