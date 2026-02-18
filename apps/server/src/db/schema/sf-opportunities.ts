import { pgTable, uuid, varchar, numeric, timestamp, boolean, text, index } from 'drizzle-orm/pg-core';
import { sfAccounts } from './sf-accounts';
import { users } from './users';

export const sfOpportunities = pgTable('sf_opportunities', {
  id: uuid('id').defaultRandom().primaryKey(),
  sfId: varchar('sf_id', { length: 18 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  accountSfId: varchar('account_sf_id', { length: 18 }),
  accountId: uuid('account_id').references(() => sfAccounts.id),
  stageName: varchar('stage_name', { length: 255 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }),
  closeDate: timestamp('close_date', { withTimezone: true }).notNull(),
  probability: numeric('probability', { precision: 5, scale: 2 }),
  type: varchar('type', { length: 255 }),
  leadSource: varchar('lead_source', { length: 255 }),
  nextStep: text('next_step'),
  description: text('description'),
  isClosed: boolean('is_closed').notNull().default(false),
  isWon: boolean('is_won').notNull().default(false),
  ownerId: varchar('owner_id', { length: 18 }),
  ownerName: varchar('owner_name', { length: 255 }),
  assignedSeSfId: varchar('assigned_se_sf_id', { length: 18 }),
  assignedSeUserId: uuid('assigned_se_user_id').references(() => users.id),
  lastActivityDate: timestamp('last_activity_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sf_opportunities_sf_id_idx').on(table.sfId),
  index('sf_opportunities_account_id_idx').on(table.accountId),
  index('sf_opportunities_stage_name_idx').on(table.stageName),
  index('sf_opportunities_assigned_se_idx').on(table.assignedSeUserId),
  index('sf_opportunities_close_date_idx').on(table.closeDate),
]);
