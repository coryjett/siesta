import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { NotFoundError } from '../utils/errors.js';

type UserRole = 'se' | 'se_manager' | 'admin';

/**
 * List all users ordered by name.
 */
export async function listUsers() {
  return db.select().from(users);
}

/**
 * Get a single user by ID. Throws NotFoundError if not found.
 */
export async function getUser(id: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('User', id);
  }

  return result[0];
}

/**
 * Get a single user by email. Returns null if not found.
 */
export async function getUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Update a user's role and optionally their SF User ID.
 */
export async function updateUserRole(
  userId: string,
  role: UserRole,
  sfUserId?: string | null,
): Promise<typeof users.$inferSelect> {
  const updateData: Record<string, unknown> = {
    role,
    updatedAt: new Date(),
  };

  if (sfUserId !== undefined) {
    updateData.sfUserId = sfUserId;
  }

  const result = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('User', userId);
  }

  return result[0];
}
