import { pgTable, uuid, varchar, text, timestamp, integer, customType } from 'drizzle-orm/pg-core';
import { users } from './users';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const teamResources = pgTable('team_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 10 }).notNull().default('link'),
  url: text('url'),
  description: text('description'),
  content: text('content'),
  fileData: bytea('file_data'),
  fileName: varchar('file_name', { length: 255 }),
  fileMimeType: varchar('file_mime_type', { length: 255 }),
  fileSize: integer('file_size'),
  tags: text('tags').array().default([]),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
