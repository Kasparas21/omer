/* Sprüt demo-store filming path: leave-reason rules, catalog offer, fast draft + allowlisted send. */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { MailDocLike, PageStyleLike } from './email-html';
import {
  identities,
  projectEmailMessages,
  projectOpportunities,
  projectSignals,
  projects,
  visitorEnrichments,
  visitorInsights,
  visits,
} from './schema';

export const SPRUT_DEMO_HOST = 'sprut-demo-store.vercel.app';
export const SPRUT_CATALOG_URL = `https://${SPRUT_DEMO_HOST}/omer-catalog.json`;
/** Known filming inboxes; DEMO_EMAIL_ALLOWLIST adds more. Sprüt demo store allows any recipient unless DEMO_EMAIL_ALLOWLIST_STRICT=1. */
const DEFAULT_ALLOWLIST = ['joris263@gmail.com', 'freecardsbf2@gmail.com'];
/** Shipping → leave window for the free-ship story (was 20s; too tight for Live pan). */
const EXIT_WINDOW_MS = 3 * 60_000;
/** After leave: short beat so he can pan Live, then Gmail. */
export const AUTO_SEND_MS = 10_000;
const inFlight = new Set<string>();
const autoSendTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isSprutDemoOrigin(origin: string | null | undefined) {
  if (!origin) return false;
  try {
    return new URL(origin).host.replace(/^www\./, '') === SPRUT_DEMO_HOST;
  } catch {
    return /sprut-demo-store\.vercel\.app/i.test(origin);
  }
}

export function demoEmailAllowlist(): Set<string> {
  const extra = (process.env.DEMO_EMAIL_ALLOWLIST || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWLIST, ...extra]);
}

export function isDemoSendAllowed(origin: string, email: string) {
  if (!isSprutDemoOrigin(origin)) return true;
  if (!email.trim()) return false;
  // Filming store is fictional — allow any inbox unless explicitly locked down.
  if (process.env.DEMO_EMAIL_ALLOWLIST_STRICT === '1') {
    return demoEmailAllowlist().has(email.trim().toLowerCase());
  }
  return true;
}

type Catalog = {
  brand?: {
    name?: string;
    logo?: { png?: string; yellow_png?: string };
    images?: { pouch?: string };
    colors?: Array<{ name?: string; hex?: string }>;
  };
  facts?: {
    common?: { ingredients?: string };
    by_sugar_level?: Record<string, {
      sugar_g_per_pack?: number;
      lab_test?: { lab?: string; substances_tested?: number };
    }>;
    lab_test?: { lab?: string; substances_tested?: number };
  };
  products?: Array<{ id: string; name: string; flavor?: string; one_time_price?: number; image?: string }>;
  add_ons?: Array<{
    id: string;
    name: string;
    flavor?: string;
    packs?: number;
    one_time_price?: number;
    image?: string;
    variants?: Array<{ cart_token?: string; sugar_level?: string; price?: number }>;
  }>;
  shipping?: { free_standard_one_time_over?: number };
  cart_link?: { format?: string; example?: string };
};

let catalogCache: { at: number; data: Catalog } | null = null;

export async function loadSprutCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.data;
  const res = await fetch(SPRUT_CATALOG_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sprüt catalog ${res.status}`);
  const data = await res.json() as Catalog;
  catalogCache = { at: Date.now(), data };
  return data;
}

type TrackRow = { name: string; at: number; data: Record<string, unknown> };

export type SprutLeave = {
  reasonCode: 'shipping_cost';
  reason: string;
  hooks: string[];
  summary: string;
  subtotal: number;
  exitAt: number;
};

async function recentTracks(db: NodePgDatabase, projectId: string, visitorId: string): Promise<TrackRow[]> {
  const rows = await db.select({
    data: projectSignals.data,
    seenAt: projectSignals.seenAt,
  }).from(projectSignals)
    .where(and(
      eq(projectSignals.projectId, projectId),
      eq(projectSignals.visitorId, visitorId),
      eq(projectSignals.kind, 'track'),
      gte(projectSignals.seenAt, sql`now() - interval '2 hours'`),
    ))
    .orderBy(desc(projectSignals.seenAt))
    .limit(80);
  return rows.map((row) => {
    const data = (row.data && typeof row.data === 'object') ? row.data as Record<string, unknown> : {};
    const name = typeof data.name === 'string' ? data.name : '';
    return { name, at: new Date(row.seenAt).getTime(), data };
  }).filter((r) => r.name);
}

function shippingSubtotal(shippingShown: TrackRow) {
  const subtotal = Number(
    shippingShown.data.subtotal
    ?? shippingShown.data.subTotal
    ?? shippingShown.data.merchandise_subtotal
    ?? 64.99,
  );
  return Number.isFinite(subtotal) ? subtotal : 64.99;
}

const LEAVE_HOOKS = [
  'Came from the Berry Bog Instagram ad',
  'Wants Berry Bog, Sugar-Free, one bag',
  'Checked the nutrition label and the lab test',
  'Switched to one-time purchase',
  'Saw shipping at checkout and left',
];

/** At checkout shipping, before leave — draft can be pre-staged. */
export function evaluateShippingStaging(tracks: TrackRow[]): SprutLeave | null {
  const shippingShown = tracks.find((t) => t.name === 'shipping_options_shown');
  const methodSelected = tracks.find((t) => t.name === 'shipping_method_selected');
  if (!shippingShown) return null;
  if (methodSelected && methodSelected.at >= shippingShown.at) return null;
  return {
    reasonCode: 'shipping_cost',
    reason: 'Left at shipping after seeing Standard $5.99 — shipping cost',
    hooks: LEAVE_HOOKS,
    summary: 'Came for Berry Bog Sugar-Free one-time; saw Standard shipping and left before choosing a method.',
    subtotal: shippingSubtotal(shippingShown),
    exitAt: shippingShown.at,
  };
}

/**
 * Shipping-cost leave. `exitAt` overrides page_exit (dwell / tab-close passes Date.now()).
 */
export function evaluateShippingCostLeave(
  tracks: TrackRow[],
  now = Date.now(),
  opts?: { exitAt?: number },
): SprutLeave | null {
  const exitTrack = tracks.find((t) => t.name === 'page_exit');
  const exitAt = opts?.exitAt ?? exitTrack?.at;
  const shippingShown = tracks.find((t) => t.name === 'shipping_options_shown');
  const methodSelected = tracks.find((t) => t.name === 'shipping_method_selected');
  if (exitAt == null || !shippingShown) return null;
  if (methodSelected && methodSelected.at >= shippingShown.at) return null;
  if (exitAt < shippingShown.at) return null;
  if (exitAt - shippingShown.at > EXIT_WINDOW_MS) return null;
  if (now - exitAt > 5 * 60_000) return null;

  return {
    reasonCode: 'shipping_cost',
    reason: 'Left at shipping after seeing Standard $5.99 — shipping cost',
    hooks: LEAVE_HOOKS,
    summary: 'Came for Berry Bog Sugar-Free one-time; saw Standard shipping and left before choosing a method.',
    subtotal: shippingSubtotal(shippingShown),
    exitAt,
  };
}

/** Good filming draft — skip LLM rewrite on auto-send. */
export function isSprutLeaveDraft(draft: unknown, reason?: string | null) {
  if (reason && /shipping cost/i.test(reason)) return true;
  if (!draft || typeof draft !== 'object') return false;
  const d = draft as { subject?: string; headline?: string };
  return /ship free/i.test(d.subject || '') || /ship free/i.test(d.headline || '');
}

function flavorHint(tracks: TrackRow[]) {
  const blob = tracks.map((t) => JSON.stringify(t.data)).join(' ').toLowerCase();
  if (/berry|bog/.test(blob)) return 'Berry Bog';
  if (/original|apple/.test(blob)) return 'Original';
  return 'Berry Bog';
}

function sugarHint(tracks: TrackRow[]) {
  const blob = tracks.map((t) => JSON.stringify(t.data)).join(' ').toLowerCase();
  if (/sugar[-_ ]?free|sugarfree/.test(blob)) return 'sugarfree';
  return 'sugarfree';
}

export function pickFreeShipAddOn(catalog: Catalog, opts: { flavor: string; sugar: string; subtotal: number; omerId: string }) {
  const threshold = Number(catalog.shipping?.free_standard_one_time_over ?? 70);
  if (opts.subtotal >= threshold) return null;
  const need = threshold - opts.subtotal;
  const addOns = [...(catalog.add_ons || [])]
    .filter((a) => typeof a.one_time_price === 'number' && a.one_time_price >= need - 0.01)
    .sort((a, b) => (a.one_time_price || 0) - (b.one_time_price || 0));
  const sameFlavor = addOns.find((a) => (a.flavor || '').toLowerCase() === opts.flavor.toLowerCase()) || addOns[0];
  if (!sameFlavor) return null;
  const sugarToken = opts.sugar === 'sugarfree' ? 'sugarfree' : 'low';
  const variant = (sameFlavor.variants || []).find((v) => (v.sugar_level || '').toLowerCase().includes(opts.sugar === 'sugarfree' ? 'sugar-free' : 'low'))
    || (sameFlavor.variants || [])[0];
  const cartToken = variant?.cart_token || `${sameFlavor.id}.${sugarToken}`;
  // Pair with the main Berry Bog one-time pouch so the link rebuilds the abandoned cart + mini.
  const mainToken = opts.flavor.toLowerCase().includes('berry')
    ? `berry-adults.${sugarToken}.once.1`
    : `original-adults.${sugarToken}.once.1`;
  const cart = `${mainToken},${cartToken}`;
  const url = `https://${SPRUT_DEMO_HOST}/?cart=${encodeURIComponent(cart).replace(/%2C/g, ',')}&omer_id=${encodeURIComponent(opts.omerId)}&utm_source=omer#checkout`;
  return {
    addOn: sameFlavor,
    price: sameFlavor.one_time_price || 12.99,
    packs: sameFlavor.packs || 7,
    threshold,
    newTotal: Math.round((opts.subtotal + (sameFlavor.one_time_price || 12.99)) * 100) / 100,
    cartUrl: url,
  };
}

function sprutPageStyle(catalog: Catalog): PageStyleLike {
  const colors = catalog.brand?.colors || [];
  const hex = (name: string, fallback: string) => colors.find((c) => (c.name || '').toLowerCase().includes(name))?.hex || fallback;
  return {
    bg: hex('cream', '#fff7df'),
    fill: '#ffffff',
    text: hex('ink', '#001f10'),
    accent: hex('yellow', '#ffcc2f'),
    headFont: 'Bowlby One, Arial Black, Arial, sans-serif',
    bodyFont: 'Work Sans, Arial, Helvetica, sans-serif',
    size: 16,
    width: 600,
    corners: 0,
    ctaRadius: 999,
    headSize: 42,
    skin: 'playful',
  };
}

function buildSprutDraft(opts: {
  firstName: string | null;
  catalog: Catalog;
  offer: NonNullable<ReturnType<typeof pickFreeShipAddOn>>;
  sugar: string;
}): MailDocLike {
  const sugarFacts = opts.catalog.facts?.by_sugar_level?.[opts.sugar === 'sugarfree' ? 'sugarfree' : 'low'];
  const lab = sugarFacts?.lab_test || opts.catalog.facts?.lab_test;
  const sugarG = sugarFacts?.sugar_g_per_pack ?? 0;
  const ingredients = opts.catalog.facts?.common?.ingredients || '50+';
  const labName = lab?.lab || 'Pinebrook Labs';
  const substances = lab?.substances_tested ?? 90;
  const hi = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,';
  const pouch = opts.catalog.brand?.images?.pouch
    || opts.catalog.products?.find((p) => p.id.includes('berry'))?.image
    || opts.offer.addOn.image;

  return {
    kind: 'personal',
    subject: 'Your Berry Bog can ship free',
    preview: `Add a Mini and the whole order ships free.`,
    headline: 'Your Berry Bog | can ship free',
    body: [
      hi,
      `Berry Bog Sugar-Free has ${sugarG} g of sugar and all ${ingredients} greens, and every batch is lab-tested by ${labName} for ${substances} substances. No subscription needed: one bag, delivered once. Add a ${opts.offer.addOn.name} (${opts.offer.packs} packs, $${opts.offer.price.toFixed(2)}) and your whole order ships free.`,
    ],
    products: [{
      name: opts.offer.addOn.name,
      now: `$${opts.offer.price.toFixed(2)}`,
      note: `${opts.offer.packs} packs · unlocks free Standard shipping`,
      img: pouch,
      url: opts.offer.cartUrl,
    }],
    cta: 'Complete my order',
    ctaUrl: opts.offer.cartUrl,
    perks: [
      `Free Standard shipping over $${opts.offer.threshold}`,
      `${labName} batch tested`,
      'One-time purchase — no subscription',
    ],
    order: ['hero', 'headline', 'body', 'products', 'cta', 'perks'],
    hero: pouch ? { src: pouch, tag: 'Berry Bog' } : undefined,
    footer: 'Sprüt · Superfood greens in one tiny pack.',
  };
}

async function upsertSprutOpportunity(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  identity: { email: string; name: string | null },
  leave: SprutLeave,
  draft: MailDocLike,
  page: PageStyleLike,
) {
  const now = new Date();
  const [existing] = await db.select().from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.projectId, projectId),
      eq(projectOpportunities.visitorId, visitorId),
      isNull(projectOpportunities.campaignId),
    ))
    .limit(1);

  if (existing) {
    if (existing.status === 'sent' || existing.status === 'converted') return existing;
    const [row] = await db.update(projectOpportunities).set({
      status: 'drafted',
      reason: leave.reason,
      hooksJson: leave.hooks,
      insightSummary: leave.summary,
      email: identity.email,
      name: identity.name,
      draftJson: draft as unknown as Record<string, unknown>,
      pageJson: page as unknown as Record<string, unknown>,
      suppressed: false,
      updatedAt: now,
    }).where(eq(projectOpportunities.id, existing.id)).returning();
    return row;
  }

  const [row] = await db.insert(projectOpportunities).values({
    projectId,
    visitorId,
    status: 'drafted',
    reason: leave.reason,
    hooksJson: leave.hooks,
    insightSummary: leave.summary,
    email: identity.email,
    name: identity.name,
    draftJson: draft as unknown as Record<string, unknown>,
    pageJson: page as unknown as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return row;
}

async function upsertSprutInsight(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  leave: SprutLeave,
) {
  await db.insert(visitorInsights).values({
    projectId,
    visitorId,
    status: 'ready',
    summaryText: leave.summary,
    interestsJson: ['Berry Bog', 'Sugar-Free', 'One-time purchase'],
    emailHooksJson: leave.hooks,
    emailReady: true,
    emailReadyConfidence: 0.95,
    sourceSessionCount: 1,
    model: 'rules',
    generatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [visitorInsights.projectId, visitorInsights.visitorId],
    set: {
      status: 'ready',
      summaryText: leave.summary,
      interestsJson: ['Berry Bog', 'Sugar-Free', 'One-time purchase'],
      emailHooksJson: leave.hooks,
      emailReady: true,
      emailReadyConfidence: 0.95,
      model: 'rules',
      generatedAt: new Date(),
    },
  });
}

async function buildAndUpsertSprutDraft(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  leave: SprutLeave,
  identity: { email: string; name: string | null },
  tracks: TrackRow[],
) {
  const catalog = await loadSprutCatalog();
  const flavor = flavorHint(tracks);
  const sugar = sugarHint(tracks);
  const offer = pickFreeShipAddOn(catalog, {
    flavor,
    sugar,
    subtotal: leave.subtotal,
    omerId: visitorId,
  });
  if (!offer) return null;

  const first = (identity.name || '').trim().split(/\s+/)[0] || null;
  const draft = buildSprutDraft({ firstName: first, catalog, offer, sugar });
  const page = sprutPageStyle(catalog);
  draft.footer = `${catalog.brand?.name || 'Sprüt'} · Superfood greens in one tiny pack.`;

  await upsertSprutInsight(db, projectId, visitorId, leave);
  return upsertSprutOpportunity(db, projectId, visitorId, identity, leave, draft, page);
}

/** Schedule Approve-less send for Sprüt demo. Skips LLM when leave draft is already good. */
export function scheduleSprutAutoSend(db: NodePgDatabase, projectId: string, opportunityId: string, delayMs = AUTO_SEND_MS) {
  const key = `${projectId}:${opportunityId}`;
  const prev = autoSendTimers.get(key);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    autoSendTimers.delete(key);
    void (async () => {
      try {
        const [opp] = await db.select().from(projectOpportunities)
          .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
          .limit(1);
        if (!opp || opp.status === 'sent' || opp.status === 'converted' || opp.status === 'dismissed') return;
        if (!isSprutLeaveDraft(opp.draftJson, opp.reason)) {
          // Surveillance-style insight drafts → rewrite; good leave drafts send as-is.
          const { draftOpportunityEmail } = await import('./email-draft');
          await draftOpportunityEmail(db, projectId, opportunityId);
        }
        const { sendOpportunityEmail } = await import('./email-send');
        await sendOpportunityEmail(db, projectId, opportunityId);
      } catch (error) {
        console.error('sprut auto-send', error instanceof Error ? error.message : error);
      }
    })();
  }, delayMs);
  autoSendTimers.set(key, timer);
}

/**
 * While still on checkout: stage Sprüt draft so leave only has to schedule send.
 * Does not auto-send yet.
 */
export async function kickSprutPrestage(db: NodePgDatabase, projectId: string, visitorId: string) {
  const key = `pre:${projectId}:${visitorId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project || !isSprutDemoOrigin(project.origin)) return;

    const tracks = await recentTracks(db, projectId, visitorId);
    const leave = evaluateShippingStaging(tracks);
    if (!leave) return;

    const [identityRow] = await db.select().from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
      .limit(1);
    if (!identityRow?.email) return;
    const identity = { email: identityRow.email, name: identityRow.name };
    if (!isDemoSendAllowed(project.origin, identity.email)) return;

    const [existing] = await db.select().from(projectOpportunities)
      .where(and(
        eq(projectOpportunities.projectId, projectId),
        eq(projectOpportunities.visitorId, visitorId),
        isNull(projectOpportunities.campaignId),
      ))
      .limit(1);
    if (existing && (existing.status === 'sent' || existing.status === 'converted')) return;
    if (existing && isSprutLeaveDraft(existing.draftJson, existing.reason)) return;

    await buildAndUpsertSprutDraft(db, projectId, visitorId, leave, identity, tracks);
  } finally {
    inFlight.delete(key);
  }
}

/** After page_exit / dwell: if shipping-cost rule hits, draft (if needed) + queue auto-send. */
export async function kickSprutLeaveFollowup(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  opts?: { fromDwell?: boolean },
) {
  const key = `${projectId}:${visitorId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project || !isSprutDemoOrigin(project.origin)) return;

    const tracks = await recentTracks(db, projectId, visitorId);
    const leave = evaluateShippingCostLeave(
      tracks,
      Date.now(),
      opts?.fromDwell ? { exitAt: Date.now() } : undefined,
    );
    if (!leave) return;

    const [identityRow] = await db.select().from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
      .limit(1);
    if (!identityRow?.email) return;
    const identity = { email: identityRow.email, name: identityRow.name };
    if (!isDemoSendAllowed(project.origin, identity.email)) {
      console.warn('sprut demo: send blocked for', identity.email);
      return;
    }

    const [existing] = await db.select().from(projectOpportunities)
      .where(and(
        eq(projectOpportunities.projectId, projectId),
        eq(projectOpportunities.visitorId, visitorId),
        isNull(projectOpportunities.campaignId),
      ))
      .limit(1);

    if (existing?.status === 'sent' || existing?.status === 'converted') return;

    let oppId: string | null = existing?.id ?? null;
    if (!existing || !isSprutLeaveDraft(existing.draftJson, existing.reason)) {
      const drafted = await buildAndUpsertSprutDraft(db, projectId, visitorId, leave, identity, tracks);
      oppId = drafted?.id ?? null;
    } else {
      // Refresh reason/hooks in case insight overwrote them; keep draft.
      await db.update(projectOpportunities).set({
        status: 'drafted',
        reason: leave.reason,
        hooksJson: leave.hooks,
        insightSummary: leave.summary,
        updatedAt: new Date(),
      }).where(eq(projectOpportunities.id, existing.id));
      oppId = existing.id;
    }
    if (oppId) scheduleSprutAutoSend(db, projectId, oppId, AUTO_SEND_MS);
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Insight / manual draft landed on Sprüt without the leave template — rewrite to Sprüt draft + schedule.
 */
export async function ensureSprutDraftAndSchedule(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
  delayMs = AUTO_SEND_MS,
) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !isSprutDemoOrigin(project.origin)) return null;

  const [opp] = await db.select().from(projectOpportunities)
    .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
    .limit(1);
  if (!opp || opp.status === 'sent' || opp.status === 'converted' || opp.status === 'dismissed') return opp ?? null;

  if (isSprutLeaveDraft(opp.draftJson, opp.reason)) {
    scheduleSprutAutoSend(db, projectId, opportunityId, delayMs);
    return opp;
  }

  const tracks = await recentTracks(db, projectId, opp.visitorId);
  const leave = evaluateShippingStaging(tracks)
    || evaluateShippingCostLeave(tracks, Date.now(), { exitAt: Date.now() })
    || {
      reasonCode: 'shipping_cost' as const,
      reason: 'Left at shipping after seeing Standard $5.99 — shipping cost',
      hooks: LEAVE_HOOKS,
      summary: 'Came for Berry Bog Sugar-Free one-time; saw Standard shipping and left before choosing a method.',
      subtotal: 64.99,
      exitAt: Date.now(),
    };

  const identity = {
    email: opp.email || '',
    name: opp.name,
  };
  if (!identity.email) {
    const [row] = await db.select().from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, opp.visitorId)))
      .limit(1);
    if (!row?.email) return opp;
    identity.email = row.email;
    identity.name = row.name;
  }
  if (!isDemoSendAllowed(project.origin, identity.email)) return opp;

  const drafted = await buildAndUpsertSprutDraft(db, projectId, opp.visitorId, leave, identity, tracks);
  if (drafted?.id) scheduleSprutAutoSend(db, projectId, drafted.id, delayMs);
  return drafted;
}

export async function markSprutWonBack(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  opts: { omerId: string | null; amount: number | null; orderId: string | null },
) {
  const [project] = await db.select({ origin: projects.origin }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !isSprutDemoOrigin(project.origin)) return null;

  const matchVisitor = opts.omerId && opts.omerId === visitorId ? visitorId : visitorId;
  const [opp] = await db.select().from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.projectId, projectId),
      eq(projectOpportunities.visitorId, matchVisitor),
      isNull(projectOpportunities.campaignId),
      inArray(projectOpportunities.status, ['sent', 'drafted', 'review', 'ready_for_draft']),
    ))
    .orderBy(desc(projectOpportunities.updatedAt))
    .limit(1);
  if (!opp) return null;

  const amountLabel = opts.amount != null && Number.isFinite(opts.amount)
    ? `Won back $${Number(opts.amount).toFixed(2)}`
    : 'Won back';
  const [row] = await db.update(projectOpportunities).set({
    status: 'converted',
    insightSummary: [opp.insightSummary, amountLabel].filter(Boolean).join(' · '),
    reason: amountLabel,
    updatedAt: new Date(),
  }).where(eq(projectOpportunities.id, opp.id)).returning();
  return row;
}

/** Wipe identity-linked demo state so the next take starts clean. */
export async function resetSprutDemoVisitor(
  db: NodePgDatabase,
  projectId: string,
  opts: { email?: string | null; visitorId?: string | null },
) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !isSprutDemoOrigin(project.origin)) {
    throw new Error('Demo reset is only available for the Sprüt demo store project');
  }

  let visitorIds: string[] = [];
  if (opts.visitorId) visitorIds = [opts.visitorId];
  if (opts.email) {
    const email = opts.email.trim().toLowerCase();
    const rows = await db.select({ visitorId: identities.visitorId }).from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.email, email)));
    visitorIds = [...new Set([...visitorIds, ...rows.map((r) => r.visitorId)])];
  }
  if (!visitorIds.length) throw new Error('Provide email or visitorId to reset');

  for (const visitorId of visitorIds) {
    const keyPrefix = `${projectId}:`;
    for (const [k, t] of autoSendTimers) {
      if (k.startsWith(keyPrefix)) {
        clearTimeout(t);
        autoSendTimers.delete(k);
      }
    }
    await db.delete(projectEmailMessages).where(and(
      eq(projectEmailMessages.projectId, projectId),
      eq(projectEmailMessages.visitorId, visitorId),
    ));
    await db.delete(projectOpportunities).where(and(
      eq(projectOpportunities.projectId, projectId),
      eq(projectOpportunities.visitorId, visitorId),
    ));
    await db.delete(visitorInsights).where(and(
      eq(visitorInsights.projectId, projectId),
      eq(visitorInsights.visitorId, visitorId),
    ));
    await db.delete(visitorEnrichments).where(and(
      eq(visitorEnrichments.projectId, projectId),
      eq(visitorEnrichments.visitorId, visitorId),
    ));
    await db.delete(projectSignals).where(and(
      eq(projectSignals.projectId, projectId),
      eq(projectSignals.visitorId, visitorId),
    ));
    await db.delete(identities).where(and(
      eq(identities.projectId, projectId),
      eq(identities.visitorId, visitorId),
    ));
    // Keep visits/pageviews for analytics history, but clear presence.
    await db.update(visits).set({ activeAt: null }).where(and(
      eq(visits.projectId, projectId),
      eq(visits.visitorId, visitorId),
    ));
  }

  return { reset: visitorIds.length, visitorIds };
}
