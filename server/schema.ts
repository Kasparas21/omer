import { bigint, boolean, date, doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projects = pgTable('onboarding_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  origin: text('origin').notNull(),
  writeKey: uuid('write_key').defaultRandom().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  firstEventAt: timestamp('first_event_at', { withTimezone: true }),
  replayEnabled: boolean('replay_enabled').default(false).notNull(),
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

export const visits = pgTable('project_visits', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  sessionId: text('session_id'),
  device: text('device'),
  dwellMs: bigint('dwell_ms', { mode: 'number' }).default(0).notNull(),
  path: text('path').notNull(),
  referrer: text('referrer').notNull(),
  cc: text('cc'),
  city: text('city'),
  place: text('place'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  activeAt: timestamp('active_at', { withTimezone: true }),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_visits_project_seen_idx').on(table.projectId, table.seenAt),
  index('project_visits_browser_seen_idx').on(table.projectId, table.visitorId, table.seenAt),
  index('project_visits_session_idx').on(table.projectId, table.visitorId, table.sessionId, table.seenAt),
]);

export const purchases = pgTable('project_purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  orderId: text('order_id'),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currency: text('currency').default('usd').notNull(),
  path: text('path'),
  referrer: text('referrer'),
  products: jsonb('products').$type<{ name: string; price?: number; qty?: number }[] | null>(),
  campaign: text('campaign'),
  isReturning: boolean('is_returning').default(false).notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_purchases_project_seen_idx').on(table.projectId, table.seenAt),
  index('project_purchases_visitor_idx').on(table.projectId, table.visitorId),
  uniqueIndex('project_purchases_order_uidx').on(table.projectId, table.orderId).where(sql`${table.orderId} is not null`),
]);

export const identities = pgTable('project_identities', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'project_identities_pk', columns: [table.projectId, table.visitorId] }),
  index('project_identities_email_idx').on(table.projectId, table.email),
]);

export const emailEvents = pgTable('project_email_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  type: text('type').notNull(),
  campaign: text('campaign'),
  messageId: text('message_id'),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('project_email_events_project_seen_idx').on(table.projectId, table.seenAt)]);

export const replaySessions = pgTable('project_replay_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  sessionId: text('session_id').notNull(),
  tabId: text('tab_id').default('main').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  status: text('status').default('recording').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).default(0).notNull(),
  hasFullSnapshot: boolean('has_full_snapshot').default(false).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('project_replay_sessions_visitor_idx').on(table.projectId, table.visitorId, table.startedAt),
  uniqueIndex('project_replay_sessions_sid_uidx').on(table.projectId, table.sessionId, table.tabId),
]);

export const replayChunks = pgTable('project_replay_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionPk: uuid('session_pk').notNull().references(() => replaySessions.id, { onDelete: 'cascade' }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  clientBatchId: text('client_batch_id').notNull(),
  checksum: text('checksum').notNull(),
  objectKey: text('object_key').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  hasFullSnapshot: boolean('has_full_snapshot').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_replay_chunks_session_idx').on(table.sessionPk, table.seq),
  uniqueIndex('project_replay_chunks_batch_uidx').on(table.sessionPk, table.clientBatchId),
]);
