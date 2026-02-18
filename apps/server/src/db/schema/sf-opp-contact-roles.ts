import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { sfOpportunities } from './sf-opportunities';
import { sfContacts } from './sf-contacts';

export const sfOppContactRoles = pgTable('sf_opp_contact_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  sfId: varchar('sf_id', { length: 18 }).notNull().unique(),
  opportunitySfId: varchar('opportunity_sf_id', { length: 18 }).notNull(),
  opportunityId: uuid('opportunity_id').references(() => sfOpportunities.id),
  contactSfId: varchar('contact_sf_id', { length: 18 }).notNull(),
  contactId: uuid('contact_id').references(() => sfContacts.id),
  role: varchar('role', { length: 255 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sf_opp_contact_roles_opp_id_idx').on(table.opportunityId),
  index('sf_opp_contact_roles_contact_id_idx').on(table.contactId),
]);
