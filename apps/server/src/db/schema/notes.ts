import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: varchar('account_id', { length: 255 }),
  opportunityId: varchar('opportunity_id', { length: 255 }),
  contentJson: jsonb('content_json').notNull().default({}),
  contentHtml: text('content_html').notNull(),
  contentPlainText: text('content_plain_text').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notes_author_id_idx').on(table.authorId),
  index('notes_account_id_idx').on(table.accountId),
  index('notes_opportunity_id_idx').on(table.opportunityId),
  index('notes_created_at_idx').on(table.createdAt),
]);
