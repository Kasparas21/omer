import { bigint, boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projects = pgTable('onboarding_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  origin: text('origin').notNull(),
  writeKey: uuid('write_key').defaultRandom().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  firstEventAt: timestamp('first_event_at', { withTimezone: true }),
  replayEnabled: boolean('replay_enabled').default(true).notNull(),
  /** null = auto from recent purchases */
  displayCurrency: text('display_currency'),
  /** Omer's own personal follow-ups (not campaigns) on or off. */
  personalFollowups: boolean('personal_followups').default(true).notNull(),
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
  /** The visitor's own time zone (IANA), for quiet hours. */
  tz: text('tz'),
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
  /** tracker | stripe | … — null = legacy tracker rows */
  provider: text('provider'),
  providerPaymentId: text('provider_payment_id'),
  customerEmail: text('customer_email'),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_purchases_project_seen_idx').on(table.projectId, table.seenAt),
  index('project_purchases_visitor_idx').on(table.projectId, table.visitorId),
  uniqueIndex('project_purchases_order_uidx').on(table.projectId, table.orderId).where(sql`${table.orderId} is not null`),
  uniqueIndex('project_purchases_provider_payment_uidx').on(table.projectId, table.provider, table.providerPaymentId)
    .where(sql`${table.providerPaymentId} is not null`),
]);

/** Payment / revenue provider connections (Stripe first; others soon). */
export const projectIntegrations = pgTable('project_integrations', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('none'),
  apiKeySealed: text('api_key_sealed'),
  stripeAccountId: text('stripe_account_id'),
  webhookSecretSealed: text('webhook_secret_sealed'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'project_integrations_pk', columns: [table.projectId, table.provider] }),
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

export const replayInsights = pgTable('project_replay_insights', {
  sessionPk: uuid('session_pk').primaryKey().references(() => replaySessions.id, { onDelete: 'cascade' }),
  status: text('status').default('pending').notNull(),
  insightVersion: integer('insight_version').default(1).notNull(),
  summaryText: text('summary_text'),
  outcome: text('outcome'),
  friction: doublePrecision('friction'),
  worthWatching: boolean('worth_watching'),
  primaryInterest: text('primary_interest'),
  emailReady: boolean('email_ready'),
  emailReadyConfidence: doublePrecision('email_ready_confidence'),
  stage: text('stage'),
  intent: doublePrecision('intent'),
  highlightsJson: jsonb('highlights_json'),
  emailHooksJson: jsonb('email_hooks_json'),
  decisionsJson: jsonb('decisions_json'),
  model: text('model'),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  error: text('error'),
});

export const visitorInsights = pgTable('project_visitor_insights', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  status: text('status').default('pending').notNull(),
  insightVersion: integer('insight_version').default(1).notNull(),
  summaryText: text('summary_text'),
  emailReady: boolean('email_ready'),
  emailReadyConfidence: doublePrecision('email_ready_confidence'),
  interestsJson: jsonb('interests_json'),
  emailHooksJson: jsonb('email_hooks_json'),
  gapsJson: jsonb('gaps_json'),
  decisionsJson: jsonb('decisions_json'),
  model: text('model'),
  sourceSessionCount: integer('source_session_count').default(0).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  error: text('error'),
}, (table) => [
  primaryKey({ name: 'project_visitor_insights_pk', columns: [table.projectId, table.visitorId] }),
  index('project_visitor_insights_project_idx').on(table.projectId),
]);

/** Brand knowledge (logo, colors, fonts, products, photos, voice, docs) per project. */
export const projectBrand = pgTable('project_brand', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Personal follow-up queue for real stores. */
export const projectOpportunities = pgTable('project_opportunities', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  status: text('status').notNull().default('review'),
  reason: text('reason'),
  hooksJson: jsonb('hooks_json').$type<string[]>().default([]).notNull(),
  insightSummary: text('insight_summary'),
  email: text('email'),
  name: text('name'),
  draftJson: jsonb('draft_json').$type<Record<string, unknown>>(),
  pageJson: jsonb('page_json').$type<Record<string, unknown>>(),
  suppressed: boolean('suppressed').default(false).notNull(),
  /** Set when a manual campaign queued this email; null for personal follow-ups. */
  campaignId: text('campaign_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One personal follow-up per person, and one per person per campaign (migration 0014 makes these partial).
  uniqueIndex('project_opportunities_project_visitor_idx').on(table.projectId, table.visitorId).where(sql`${table.campaignId} is null`),
  uniqueIndex('project_opportunities_campaign_visitor_idx').on(table.projectId, table.campaignId, table.visitorId).where(sql`${table.campaignId} is not null`),
  index('project_opportunities_project_status_idx').on(table.projectId, table.status),
]);

/** Per-store From / domain verification (Omer SES, or BYO Resend/Postmark). */
export const projectSending = pgTable('project_sending', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  fromName: text('from_name'),
  fromEmail: text('from_email'),
  domain: text('domain'),
  provider: text('provider').notNull().default('ses'),
  status: text('status').notNull().default('none'),
  dnsRecords: jsonb('dns_records').$type<Array<{ host: string; type: string; value: string }>>(),
  providerRef: text('provider_ref'),
  /** AES-GCM sealed BYO API key (Resend / Postmark). Never returned to the client. */
  providerApiKeySealed: text('provider_api_key_sealed'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Sent personal / campaign emails (SES or Resend). */
export const projectEmailMessages = pgTable('project_email_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => projectOpportunities.id, { onDelete: 'set null' }),
  visitorId: text('visitor_id').notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  sesMessageId: text('ses_message_id'),
  provider: text('provider'),
  fromEmail: text('from_email'),
  status: text('status').notNull().default('queued'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_email_messages_project_idx').on(table.projectId, table.createdAt),
  index('project_email_messages_opportunity_idx').on(table.opportunityId),
]);

/** Suggested campaign groups from shared hooks (no send yet). */
export const projectCampaignSuggestions = pgTable('project_campaign_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  patternKey: text('pattern_key').notNull(),
  title: text('title').notNull(),
  audienceSummary: text('audience_summary').notNull(),
  evidenceCount: integer('evidence_count').default(0).notNull(),
  status: text('status').notNull().default('suggested'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_campaign_suggestions_project_pattern_idx').on(table.projectId, table.patternKey),
  index('project_campaign_suggestions_project_status_idx').on(table.projectId, table.status),
]);

/** A store's own campaigns: what starts each one and the email it sends, as the app edits them. */
export const projectCampaigns = pgTable('project_campaigns', {
  id: text('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_campaigns_project_idx').on(table.projectId),
]);

/** What the tracker saw beyond page views: carts, discount codes tried, products viewed (price, stock). */
export const projectSignals = pgTable('project_signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  /** cart | code | product */
  kind: text('kind').notNull(),
  path: text('path'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('project_signals_visitor_idx').on(table.projectId, table.visitorId, table.seenAt),
  index('project_signals_kind_idx').on(table.projectId, table.kind, table.seenAt),
]);

/** Each product page we know: its price and stock now, and when they last changed. */
export const projectProducts = pgTable('project_products', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  name: text('name').notNull(),
  priceCents: bigint('price_cents', { mode: 'number' }),
  currency: text('currency'),
  available: boolean('available'),
  image: text('image'),
  prevPriceCents: bigint('prev_price_cents', { mode: 'number' }),
  priceChangedAt: timestamp('price_changed_at', { withTimezone: true }),
  restockedAt: timestamp('restocked_at', { withTimezone: true }),
  soldOutAt: timestamp('sold_out_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'project_products_pk', columns: [table.projectId, table.path] }),
  index('project_products_checked_idx').on(table.checkedAt),
]);

/** Personal API keys ("bhv_…") and OAuth access tokens for the MCP server. Only a SHA-256 hash is stored. */
export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').$type<'api' | 'oauth' | 'refresh'>().notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  clientId: text('client_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('mcp_tokens_hash_idx').on(table.tokenHash), index('mcp_tokens_user_idx').on(table.userId)]);

/** Clients that registered themselves (Claude, ChatGPT, …) through OAuth dynamic client registration. */
export const mcpOauthClients = pgTable('mcp_oauth_clients', {
  clientId: text('client_id').primaryKey(),
  name: text('name').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Short-lived, single-use authorization codes (PKCE). */
export const mcpOauthCodes = pgTable('mcp_oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: text('user_id').notNull(),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
