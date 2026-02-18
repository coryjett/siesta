import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { createSession } from './session.js';
import { env } from '../config/env.js';
import { ForbiddenError } from '../utils/errors.js';

type UserRole = 'se' | 'se_manager' | 'admin';

interface DevLoginParams {
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Dev bypass login: upserts a user by email and creates a session.
 * Only works when AUTH_MODE=dev-bypass.
 */
export async function devBypassLogin(params: DevLoginParams): Promise<{ token: string; user: typeof users.$inferSelect }> {
  if (env.AUTH_MODE !== 'dev-bypass') {
    throw new ForbiddenError('Dev bypass login is not enabled');
  }

  const { email, name, role } = params;

  // Check if user exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let user: typeof users.$inferSelect;

  if (existing.length > 0) {
    // Update name and role
    const updated = await db
      .update(users)
      .set({
        name,
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();
    user = updated[0];
  } else {
    // Create new user
    const created = await db
      .insert(users)
      .values({
        email,
        name,
        role,
      })
      .returning();
    user = created[0];
  }

  const token = await createSession(user.id);

  return { token, user };
}
