import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const oauthTokens = pgTable('oauth_tokens', {
  provider: varchar('provider', { length: 50 }).primaryKey(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenType: varchar('token_type', { length: 50 }),
  instanceUrl: varchar('instance_url', { length: 1024 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
