import { bigint, date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const projects = pgTable('onboarding_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  origin: text('origin').notNull(),
  writeKey: uuid('write_key').defaultRandom().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  firstEventAt: timestamp('first_event_at', { withTimezone: true }),
}, (table) => [index('onboarding_projects_owner_idx').on(table.owner)]);

export const pageViews = pgTable('project_page_views', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  count: bigint('count', { mode: 'number' }).notNull(),
}, (table) => [primaryKey({ columns: [table.projectId, table.day] })]);

export const dailyVisitors = pgTable('project_daily_visitors', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  visitorId: text('visitor_id').notNull(),
}, (table) => [primaryKey({ name: 'project_daily_visitors_pk', columns: [table.projectId, table.day, table.visitorId] })]);

export const pathViews = pgTable('project_path_views', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  path: text('path').notNull(),
  count: bigint('count', { mode: 'number' }).notNull(),
}, (table) => [primaryKey({ name: 'project_path_views_pk', columns: [table.projectId, table.day, table.path] })]);

export const referrerViews = pgTable('project_referrer_views', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  referrer: text('referrer').notNull(),
  count: bigint('count', { mode: 'number' }).notNull(),
}, (table) => [primaryKey({ name: 'project_referrer_views_pk', columns: [table.projectId, table.day, table.referrer] })]);

export const dwell = pgTable('project_dwell', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  totalMs: bigint('total_ms', { mode: 'number' }).notNull(),
  samples: bigint('samples', { mode: 'number' }).notNull(),
}, (table) => [primaryKey({ name: 'project_dwell_pk', columns: [table.projectId, table.day] })]);
