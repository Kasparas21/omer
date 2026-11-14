/* Project revenue integrations: Stripe connect + sync into project_purchases. */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { cleanCurrency, cleanEmail } from './commerce';
import { identities, projectIntegrations, purchases, visits } from './schema';
import { openSecret, sealSecret } from './secret-box';
import {
  paymentFromStripeEvent,
  stripeGetCustomerEmail,
  stripeListRecentPayments,
  stripeValidateKey,
  stripeVerifyWebhook,
  type StripePayment,
} from './stripe';

export type IntegrationProvider = 'stripe' | 'dodo' | 'revenuecat';

export type PublicIntegration = {
  provider: IntegrationProvider;
  status: 'none' | 'connected' | 'invalid' | 'error' | 'soon';
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  available: boolean;
};

const CATALOG: IntegrationProvider[] = ['stripe', 'dodo', 'revenuecat'];

function emptyPublic(provider: IntegrationProvider): PublicIntegration {
  const soon = provider !== 'stripe';
  return {
    provider,
    status: soon ? 'soon' : 'none',
    hasApiKey: false,
    hasWebhookSecret: false,
    accountId: null,
    lastSyncAt: null,
    lastError: null,
    available: provider === 'stripe',
  };
}

export async function listProjectIntegrations(db: NodePgDatabase, projectId: string): Promise<PublicIntegration[]> {
  const rows = await db.select().from(projectIntegrations).where(eq(projectIntegrations.projectId, projectId));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return CATALOG.map((provider) => {
    const base = emptyPublic(provider);
    const row = byProvider.get(provider);
    if (!row || provider !== 'stripe') return base;
    const status = (['none', 'connected', 'invalid', 'error'].includes(row.status) ? row.status : 'none') as PublicIntegration['status'];
    return {
      ...base,
      status,
      hasApiKey: Boolean(row.apiKeySealed),
      hasWebhookSecret: Boolean(row.webhookSecretSealed),
      accountId: row.stripeAccountId || null,
      lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
      lastError: row.lastError || null,
    };
  });
}

async function readStripeKey(db: NodePgDatabase, projectId: string): Promise<{ key: string; webhookSecret: string | null; row: typeof projectIntegrations.$inferSelect } | null> {
  const [row] = await db.select().from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')))
    .limit(1);
  if (!row?.apiKeySealed) return null;
  try {
    const key = openSecret(row.apiKeySealed);
    const webhookSecret = row.webhookSecretSealed ? openSecret(row.webhookSecretSealed) : null;
    return { key, webhookSecret, row };
  } catch {
    return null;
  }
}

async function resolveVisitorId(
  db: NodePgDatabase,
  projectId: string,
  payment: StripePayment,
): Promise<{ visitorId: string; email: string | null }> {
  const email = payment.email ? cleanEmail(payment.email) : null;
  if (payment.metadataVid) {
    return { visitorId: payment.metadataVid, email };
  }
  if (email) {
    const [hit] = await db.select({ visitorId: identities.visitorId }).from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.email, email)))
      .orderBy(desc(identities.updatedAt))
      .limit(1);
    if (hit?.visitorId) return { visitorId: hit.visitorId, email };
  }
  if (payment.customerId) return { visitorId: `stripe:${payment.customerId}`, email };
  return { visitorId: `unmatched:stripe:${payment.id}`, email };
}

async function attributionForVisitor(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  seenAt: Date,
): Promise<{ path: string | null; referrer: string | null }> {
  if (visitorId.startsWith('stripe:') || visitorId.startsWith('unmatched:')) {
    return { path: null, referrer: null };
  }
  const [visit] = await db.select({ path: visits.path, referrer: visits.referrer }).from(visits)
    .where(and(
      eq(visits.projectId, projectId),
      eq(visits.visitorId, visitorId),
      sql`${visits.seenAt} <= ${seenAt}`,
    ))
    .orderBy(desc(visits.seenAt))
    .limit(1);
  return { path: visit?.path ?? null, referrer: visit?.referrer ?? null };
}

export async function ingestStripePayment(
  db: NodePgDatabase,
  projectId: string,
  payment: StripePayment,
  apiKey?: string,
): Promise<'inserted' | 'exists'> {
  let email = payment.email;
  if (!email && payment.customerId && apiKey) {
    email = await stripeGetCustomerEmail(apiKey, payment.customerId);
  }
  const enriched = { ...payment, email: email || payment.email };
  const { visitorId, email: matchedEmail } = await resolveVisitorId(db, projectId, enriched);
  const seenAt = new Date(enriched.created * 1000);
  const attr = await attributionForVisitor(db, projectId, visitorId, seenAt);

  const [prior] = await db.select({ id: purchases.id }).from(purchases)
    .where(and(eq(purchases.projectId, projectId), eq(purchases.visitorId, visitorId)))
    .limit(1);

  try {
    await db.insert(purchases).values({
      projectId,
      visitorId,
      orderId: enriched.id,
      amountCents: enriched.amountCents,
      currency: cleanCurrency(enriched.currency),
      path: attr.path || '/',
      referrer: attr.referrer,
      products: enriched.products,
      campaign: null,
      isReturning: Boolean(prior),
      provider: 'stripe',
      providerPaymentId: enriched.id,
      customerEmail: matchedEmail,
      seenAt,
    });
    return 'inserted';
  } catch {
    return 'exists';
  }
}

/** When a visitor identifies with email, attach prior unmatched Stripe purchases. */
export async function reattachStripePurchasesByEmail(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  emailRaw: string,
) {
  const email = cleanEmail(emailRaw);
  if (!email || !visitorId) return;
  await db.update(purchases).set({ visitorId }).where(and(
    eq(purchases.projectId, projectId),
    eq(purchases.provider, 'stripe'),
    eq(purchases.customerEmail, email),
    sql`(${purchases.visitorId} like 'stripe:%' or ${purchases.visitorId} like 'unmatched:%')`,
  ));
}

export async function connectStripe(
  db: NodePgDatabase,
  projectId: string,
  input: { apiKey: string; webhookSecret?: string },
): Promise<{ integrations: PublicIntegration[]; synced: number }> {
  const apiKey = input.apiKey.trim();
  if (!apiKey.startsWith('sk_') && !apiKey.startsWith('rk_')) {
    throw new Error('Use a Stripe secret or restricted key (sk_… or rk_…)');
  }
  let accountId = '';
  try {
    const account = await stripeValidateKey(apiKey);
    accountId = account.accountId;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Invalid Stripe key';
    await db.insert(projectIntegrations).values({
      projectId,
      provider: 'stripe',
      status: 'invalid',
      apiKeySealed: null,
      stripeAccountId: null,
      webhookSecretSealed: null,
      lastError: msg.slice(0, 240),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [projectIntegrations.projectId, projectIntegrations.provider],
      set: {
        status: 'invalid',
        lastError: msg.slice(0, 240),
        updatedAt: new Date(),
      },
    });
    throw new Error(msg.includes('Stripe') ? msg : `Invalid Stripe key: ${msg}`);
  }

  const sealed = sealSecret(apiKey);
  const webhookSealed = input.webhookSecret?.trim() ? sealSecret(input.webhookSecret.trim()) : null;
  const [existing] = await db.select().from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')))
    .limit(1);

  await db.insert(projectIntegrations).values({
    projectId,
    provider: 'stripe',
    status: 'connected',
    apiKeySealed: sealed,
    stripeAccountId: accountId,
    webhookSecretSealed: webhookSealed ?? existing?.webhookSecretSealed ?? null,
    lastError: null,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [projectIntegrations.projectId, projectIntegrations.provider],
    set: {
      status: 'connected',
      apiKeySealed: sealed,
      stripeAccountId: accountId,
      webhookSecretSealed: webhookSealed ?? existing?.webhookSecretSealed ?? null,
      lastError: null,
      updatedAt: new Date(),
    },
  });

  const synced = await syncProjectStripe(db, projectId);
  return { integrations: await listProjectIntegrations(db, projectId), synced };
}

export async function disconnectStripe(db: NodePgDatabase, projectId: string) {
  await db.update(projectIntegrations).set({
    status: 'none',
    apiKeySealed: null,
    stripeAccountId: null,
    webhookSecretSealed: null,
    lastError: null,
    updatedAt: new Date(),
  }).where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')));
  return listProjectIntegrations(db, projectId);
}

export async function saveStripeWebhookSecret(db: NodePgDatabase, projectId: string, secret: string) {
  const sealed = secret.trim() ? sealSecret(secret.trim()) : null;
  const [row] = await db.select().from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')))
    .limit(1);
  if (!row?.apiKeySealed) throw new Error('Connect Stripe first');
  await db.update(projectIntegrations).set({
    webhookSecretSealed: sealed,
    updatedAt: new Date(),
  }).where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')));
  return listProjectIntegrations(db, projectId);
}

export async function syncProjectStripe(db: NodePgDatabase, projectId: string): Promise<number> {
  const creds = await readStripeKey(db, projectId);
  if (!creds) throw new Error('Stripe is not connected');
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  let inserted = 0;
  try {
    const payments = await stripeListRecentPayments(creds.key, since);
    for (const payment of payments) {
      const result = await ingestStripePayment(db, projectId, payment, creds.key);
      if (result === 'inserted') inserted += 1;
    }
    await db.update(projectIntegrations).set({
      status: 'connected',
      lastSyncAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')));
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 240) : 'Sync failed';
    await db.update(projectIntegrations).set({
      status: 'error',
      lastError: msg,
      updatedAt: new Date(),
    }).where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')));
    throw error;
  }
  return inserted;
}

export async function handleStripeWebhook(
  db: NodePgDatabase,
  projectId: string,
  rawBody: string,
  signature: string | null,
): Promise<{ ok: boolean; inserted?: boolean }> {
  const creds = await readStripeKey(db, projectId);
  if (!creds?.webhookSecret) return { ok: false };
  if (!stripeVerifyWebhook(rawBody, signature, creds.webhookSecret)) return { ok: false };
  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; } catch { return { ok: false }; }
  const payment = paymentFromStripeEvent(event);
  if (!payment) return { ok: true };
  const result = await ingestStripePayment(db, projectId, payment, creds.key);
  await db.update(projectIntegrations).set({
    lastSyncAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.provider, 'stripe')));
  return { ok: true, inserted: result === 'inserted' };
}
