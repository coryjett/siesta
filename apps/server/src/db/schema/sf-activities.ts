import { pgTable, uuid, varchar, text, boolean, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { sfAccounts } from './sf-accounts';
import { sfOpportunities } from './sf-opportunities';

export const activityTypeEnum = pgEnum('activity_type', ['task', 'event']);

export const sfActivities = pgTable('sf_activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  sfId: varchar('sf_id', { length: 18 }).notNull().unique(),
  accountSfId: varchar('account_sf_id', { length: 18 }),
  accountId: uuid('account_id').references(() => sfAccounts.id),
  opportunitySfId: varchar('opportunity_sf_id', { length: 18 }),
  opportunityId: uuid('opportunity_id').references(() => sfOpportunities.id),
  subject: varchar('subject', { length: 255 }),
  description: text('description'),
  activityType: activityTypeEnum('activity_type').notNull(),
  activityDate: timestamp('activity_date', { withTimezone: true }),
  status: varchar('status', { length: 255 }),
  priority: varchar('priority', { length: 255 }),
  isCompleted: boolean('is_completed').notNull().default(false),
  ownerId: varchar('owner_id', { length: 18 }),
  ownerName: varchar('owner_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sf_activities_account_id_idx').on(table.accountId),
  index('sf_activities_opportunity_id_idx').on(table.opportunityId),
  index('sf_activities_activity_date_idx').on(table.activityDate),
]);
