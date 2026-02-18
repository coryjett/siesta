import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sfAccounts } from './sf-accounts';
import { sfOpportunities } from './sf-opportunities';

export const gongCalls = pgTable('gong_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  gongId: varchar('gong_id', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 1024 }),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
  started: timestamp('started', { withTimezone: true }),
  duration: integer('duration'),
  direction: varchar('direction', { length: 50 }),
  scope: varchar('scope', { length: 255 }),
  media: varchar('media', { length: 50 }),
  language: varchar('language', { length: 10 }),
  url: varchar('url', { length: 2048 }),
  accountSfId: varchar('account_sf_id', { length: 18 }),
  accountId: uuid('account_id').references(() => sfAccounts.id),
  opportunitySfId: varchar('opportunity_sf_id', { length: 18 }),
  opportunityId: uuid('opportunity_id').references(() => sfOpportunities.id),
  participants: jsonb('participants').$type<Array<{ name: string; email: string | null; role: 'internal' | 'external' }>>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gong_calls_gong_id_idx').on(table.gongId),
  index('gong_calls_account_id_idx').on(table.accountId),
  index('gong_calls_opportunity_id_idx').on(table.opportunityId),
  index('gong_calls_started_idx').on(table.started),
]);
