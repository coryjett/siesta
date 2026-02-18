import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { sfAccounts } from './sf-accounts';

export const sfContacts = pgTable('sf_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  sfId: varchar('sf_id', { length: 18 }).notNull().unique(),
  accountSfId: varchar('account_sf_id', { length: 18 }),
  accountId: uuid('account_id').references(() => sfAccounts.id),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  title: varchar('title', { length: 255 }),
  department: varchar('department', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sf_contacts_sf_id_idx').on(table.sfId),
  index('sf_contacts_account_id_idx').on(table.accountId),
]);
