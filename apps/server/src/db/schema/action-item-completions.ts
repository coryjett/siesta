import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const actionItemCompletions = pgTable('action_item_completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemHash: varchar('item_hash', { length: 64 }).notNull(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('action_item_completions_hash_user_unique').on(table.itemHash, table.userId),
  index('action_item_completions_account_id_idx').on(table.accountId),
  index('action_item_completions_user_id_idx').on(table.userId),
]);
