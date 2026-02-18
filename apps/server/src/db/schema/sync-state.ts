import { pgTable, varchar, timestamp, integer, text, primaryKey } from 'drizzle-orm/pg-core';

export const syncState = pgTable('sync_state', {
  provider: varchar('provider', { length: 50 }).notNull(),
  entity: varchar('entity', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('idle'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  recordsProcessed: integer('records_processed'),
  cursor: text('cursor'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.provider, table.entity] }),
]);
