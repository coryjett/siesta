import { pgTable, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const sfOpportunityStages = pgTable('sf_opportunity_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  stageName: varchar('stage_name', { length: 255 }).notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  isClosed: boolean('is_closed').notNull().default(false),
  isWon: boolean('is_won').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
