import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Stores per-user OAuth tokens for external MCP servers.
 * Each row is keyed by (userId, serverKey) so a user can connect to multiple MCP servers.
 */
export const userMcpTokens = pgTable('user_mcp_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  serverKey: varchar('server_key', { length: 100 }).notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  userEmail: varchar('user_email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
