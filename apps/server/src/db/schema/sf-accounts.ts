import { pgTable, uuid, varchar, numeric, integer, text, timestamp, index } from 'drizzle-orm/pg-core';

export const sfAccounts = pgTable('sf_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  sfId: varchar('sf_id', { length: 18 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  industry: varchar('industry', { length: 255 }),
  website: varchar('website', { length: 1024 }),
  annualRevenue: numeric('annual_revenue', { precision: 18, scale: 2 }),
  numberOfEmployees: integer('number_of_employees'),
  billingCity: varchar('billing_city', { length: 255 }),
  billingState: varchar('billing_state', { length: 255 }),
  billingCountry: varchar('billing_country', { length: 255 }),
  type: varchar('type', { length: 255 }),
  ownerId: varchar('owner_id', { length: 18 }),
  ownerName: varchar('owner_name', { length: 255 }),
  description: text('description'),
  lastActivityDate: timestamp('last_activity_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sf_accounts_sf_id_idx').on(table.sfId),
  index('sf_accounts_name_idx').on(table.name),
]);
