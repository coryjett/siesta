import { pgTable, uuid, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['se', 'se_manager', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('se'),
  sfUserId: varchar('sf_user_id', { length: 18 }),
  avatarUrl: varchar('avatar_url', { length: 1024 }),
  googleSub: varchar('google_sub', { length: 255 }).unique(),
  keycloakSub: varchar('keycloak_sub', { length: 255 }).unique(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
