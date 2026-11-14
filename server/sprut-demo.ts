/* Sprüt demo-store filming path: leave-reason rules, catalog offer, fast draft + durable auto-send. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
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
/** Shipping → leave window for the free-ship story. */
const EXIT_WINDOW_MS = 3 * 60_000;
/** After leave: short beat so he can pan Live, then Gmail. */
export const AUTO_SEND_MS = 10_000;
const POLL_MS = 4_000;
const inFlight = new Set<string>();
const autoSendTimers = new Map<string, ReturnType<typeof setTimeout>>();
const sendingNow = new Set<string>();
let pollerStarted = false;

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
  shippingLabel: string;
  shippingPrice: number;
  flavor: string;
  sugar: 'sugarfree' | 'low';
  sourceHook: string | null;
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

async function latestReferrer(db: NodePgDatabase, projectId: string, visitorId: string): Promise<string | null> {
  const [row] = await db.select({ referrer: visits.referrer })
    .from(visits)
    .where(and(eq(visits.projectId, projectId), eq(visits.visitorId, visitorId)))
    .orderBy(desc(visits.seenAt))
    .limit(1);
  return row?.referrer || null;
}

function numProp(data: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function shippingSubtotal(shippingShown: TrackRow): number {
  const subtotal = numProp(shippingShown.data, [
    'subtotal', 'subTotal', 'merchandise_subtotal', 'merchandiseSubtotal', 'cart_subtotal', 'cartSubtotal',
  ]);
  return subtotal != null ? subtotal : 64.99;
}

/** Standard shipping price/label from the store event when present. */
export function shippingFromTrack(shippingShown: TrackRow): { label: string; price: number } {
  const data = shippingShown.data;
  const props = (data.props && typeof data.props === 'object') ? data.props as Record<string, unknown> : data;
  const direct = numProp(props, [
    'standard_price', 'standardPrice', 'shipping_price', 'shippingPrice', 'price', 'amount',
  ]);
  if (direct != null) {
    const label = typeof props.standard_label === 'string' ? props.standard_label
      : (typeof props.label === 'string' ? props.label : 'Standard');
    return { label, price: direct };
  }
  const options = props.options ?? props.shipping_options ?? props.shippingOptions;
  if (Array.isArray(options)) {
    for (const raw of options) {
      if (!raw || typeof raw !== 'object') continue;
      const opt = raw as Record<string, unknown>;
      const name = String(opt.name || opt.label || opt.id || '');
      if (!/standard|economy|ground/i.test(name) && options.length > 1) continue;
      const price = numProp(opt, ['price', 'amount', 'cost', 'rate']);
      if (price != null) return { label: name || 'Standard', price };
    }
    for (const raw of options) {
      if (!raw || typeof raw !== 'object') continue;
      const opt = raw as Record<string, unknown>;
      const price = numProp(opt, ['price', 'amount', 'cost', 'rate']);
      if (price != null) {
        return { label: String(opt.name || opt.label || 'Standard'), price };
      }
    }
  }
  return { label: 'Standard', price: 5.99 };
}

function flavorHint(tracks: TrackRow[]) {
  const blob = tracks.map((t) => JSON.stringify(t.data)).join(' ').toLowerCase();
  if (/original|apple/.test(blob) && !/berry|bog/.test(blob)) return 'Original';
  if (/berry|bog/.test(blob)) return 'Berry Bog';
  if (/original|apple/.test(blob)) return 'Original';
  return 'Berry Bog';
}

function sugarHint(tracks: TrackRow[]): 'sugarfree' | 'low' {
  const blob = tracks.map((t) => JSON.stringify(t.data)).join(' ').toLowerCase();
  if (/sugar[-_ ]?free|sugarfree|0\s*g/.test(blob)) return 'sugarfree';
  if (/low[-_ ]?sugar|\blow\b/.test(blob) && !/sugar[-_ ]?free|sugarfree/.test(blob)) return 'low';
  // Default to sugar-free only when the session never mentioned sugar level.
  return 'sugarfree';
}

function sourceHookFrom(referrer: string | null, tracks: TrackRow[]): string | null {
  const blob = [referrer || '', ...tracks.map((t) => JSON.stringify(t.data))].join(' ').toLowerCase();
  if (/instagram|ig\.|utm_source=ig|utm_source=instagram/.test(blob)) {
    return 'Came from the Berry Bog Instagram ad';
  }
  if (/facebook|fb\.|meta/.test(blob)) return 'Came from a Facebook / Meta ad';
  if (/tiktok/.test(blob)) return 'Came from TikTok';
  if (/google|gclid/.test(blob)) return 'Came from Google';
  if (referrer && !/sprut-demo-store\.vercel\.app/i.test(referrer)) {
    try {
      const host = new URL(referrer).host.replace(/^www\./, '');
      if (host) return `Came from ${host}`;
    } catch { /* ignore */ }
  }
  return null;
}

function buildLeaveFromShipping(
  shippingShown: TrackRow,
  tracks: TrackRow[],
  exitAt: number,
  referrer: string | null,
): SprutLeave {
  const ship = shippingFromTrack(shippingShown);
  const flavor = flavorHint(tracks);
  const sugar = sugarHint(tracks);
  const sugarLabel = sugar === 'sugarfree' ? 'Sugar-Free' : 'Low Sugar';
  const sourceHook = sourceHookFrom(referrer, tracks);
  const priceLabel = `$${ship.price.toFixed(2)}`;
  const hooks = [
    sourceHook,
    `Wants ${flavor}, ${sugarLabel}, one bag`,
    'Checked nutrition and lab testing',
    'Switched to one-time purchase',
    `Saw ${ship.label} shipping at ${priceLabel} and left`,
  ].filter((h): h is string => Boolean(h));
  return {
    reasonCode: 'shipping_cost',
    reason: `Left at shipping after seeing ${ship.label} ${priceLabel} — shipping cost`,
    hooks,
    summary: `Came for ${flavor} ${sugarLabel} one-time; saw ${ship.label} shipping (${priceLabel}) and left before choosing a method.`,
    subtotal: shippingSubtotal(shippingShown),
    exitAt,
    shippingLabel: ship.label,
    shippingPrice: ship.price,
    flavor,
    sugar,
    sourceHook,
  };
}

/** At checkout shipping, before leave — draft can be pre-staged. */
export function evaluateShippingStaging(
  tracks: TrackRow[],
  referrer: string | null = null,
): SprutLeave | null {
  const shippingShown = tracks.find((t) => t.name === 'shipping_options_shown');
  const methodSelected = tracks.find((t) => t.name === 'shipping_method_selected');
  if (!shippingShown) return null;
  if (methodSelected && methodSelected.at >= shippingShown.at) return null;
  return buildLeaveFromShipping(shippingShown, tracks, shippingShown.at, referrer);
}

/**
 * Shipping-cost leave. `exitAt` overrides page_exit (dwell / tab-close passes Date.now()).
 */
export function evaluateShippingCostLeave(
  tracks: TrackRow[],
  now = Date.now(),
  opts?: { exitAt?: number; referrer?: string | null },
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
  return buildLeaveFromShipping(shippingShown, tracks, exitAt, opts?.referrer ?? null);
}

/** Good filming draft — skip LLM rewrite on auto-send. */
export function isSprutLeaveDraft(draft: unknown, reason?: string | null) {
  if (reason && /shipping cost/i.test(reason)) return true;
  if (!draft || typeof draft !== 'object') return false;
  const d = draft as { subject?: string; headline?: string };
  return /ship free/i.test(d.subject || '') || /ship free/i.test(d.headline || '');
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
  leave: SprutLeave;
}): MailDocLike {
  const sugar = opts.leave.sugar;
  const flavor = opts.leave.flavor;
  const sugarFacts = opts.catalog.facts?.by_sugar_level?.[sugar === 'sugarfree' ? 'sugarfree' : 'low'];
  const lab = sugarFacts?.lab_test || opts.catalog.facts?.lab_test;
  const sugarG = sugarFacts?.sugar_g_per_pack ?? (sugar === 'sugarfree' ? 0 : 2);
  const ingredients = opts.catalog.facts?.common?.ingredients || '50+';
  const labName = lab?.lab || 'Pinebrook Labs';
  const substances = lab?.substances_tested ?? 90;
  const sugarLabel = sugar === 'sugarfree' ? 'Sugar-Free' : 'Low Sugar';
  const hi = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,';
  const productIdHint = flavor.toLowerCase().includes('berry') ? 'berry' : 'original';
  const pouch = opts.catalog.brand?.images?.pouch
    || opts.catalog.products?.find((p) => p.id.includes(productIdHint))?.image
    || opts.offer.addOn.image;
  const shipPrice = `$${opts.leave.shippingPrice.toFixed(2)}`;

  return {
    kind: 'personal',
    subject: `Your ${flavor} can ship free`,
    preview: `Add a Mini and the whole order ships free.`,
    headline: `Your ${flavor} | can ship free`,
    body: [
      hi,
      `${flavor} ${sugarLabel} has ${sugarG} g of sugar and all ${ingredients} greens, and every batch is lab-tested by ${labName} for ${substances} substances. No subscription needed: one bag, delivered once. You left when ${opts.leave.shippingLabel} shipping showed ${shipPrice} — add a ${opts.offer.addOn.name} (${opts.offer.packs} packs, $${opts.offer.price.toFixed(2)}) and your whole order ships free.`,
    ],
    products: [{
      name: opts.offer.addOn.name,
      now: `$${opts.offer.price.toFixed(2)}`,
      note: `${opts.offer.packs} packs · unlocks free ${opts.leave.shippingLabel} shipping`,
      img: pouch,
      url: opts.offer.cartUrl,
    }],
    cta: 'Complete my order',
    ctaUrl: opts.offer.cartUrl,
    perks: [
      `Free ${opts.leave.shippingLabel} shipping over $${opts.offer.threshold}`,
      `${labName} batch tested`,
      'One-time purchase — no subscription',
    ],
    order: ['hero', 'headline', 'body', 'products', 'cta', 'perks'],
    hero: pouch ? { src: pouch, tag: flavor } : undefined,
    footer: 'Sprüt · Superfood greens in one tiny pack.',
  };
}

/** Cancel pending auto-sends for other visitors sharing this email (retake hygiene). */
async function supersedeOtherDraftsForEmail(
  db: NodePgDatabase,
  projectId: string,
  email: string,
  keepVisitorId: string,
) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const others = await db.select({ id: projectOpportunities.id })
    .from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.projectId, projectId),
      sql`lower(${projectOpportunities.email}) = ${normalized}`,
      isNull(projectOpportunities.campaignId),
      ne(projectOpportunities.visitorId, keepVisitorId),
      inArray(projectOpportunities.status, ['drafted', 'ready_for_draft', 'review']),
    ));
  for (const row of others) {
    const key = `${projectId}:${row.id}`;
    const t = autoSendTimers.get(key);
    if (t) {
      clearTimeout(t);
      autoSendTimers.delete(key);
    }
    await db.update(projectOpportunities).set({
      status: 'dismissed',
      autoSendAt: null,
      sendError: null,
      updatedAt: new Date(),
    }).where(eq(projectOpportunities.id, row.id));
  }
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
  const email = identity.email.trim().toLowerCase();
  await supersedeOtherDraftsForEmail(db, projectId, email, visitorId);

  const [existing] = await db.select().from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.projectId, projectId),
      eq(projectOpportunities.visitorId, visitorId),
      isNull(projectOpportunities.campaignId),
    ))
    .limit(1);

  if (existing) {
    // Retake on same visitor: reuse row even if previously sent/converted (unique index).
    const [row] = await db.update(projectOpportunities).set({
      status: 'drafted',
      reason: leave.reason,
      hooksJson: leave.hooks,
      insightSummary: leave.summary,
      email,
      name: identity.name,
      draftJson: draft as unknown as Record<string, unknown>,
      pageJson: page as unknown as Record<string, unknown>,
      suppressed: false,
      sendError: null,
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
    email,
    name: identity.name,
    draftJson: draft as unknown as Record<string, unknown>,
    pageJson: page as unknown as Record<string, unknown>,
    sendError: null,
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
  const interests = [leave.flavor, leave.sugar === 'sugarfree' ? 'Sugar-Free' : 'Low Sugar', 'One-time purchase'];
  await db.insert(visitorInsights).values({
    projectId,
    visitorId,
    status: 'ready',
    summaryText: leave.summary,
    interestsJson: interests,
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
      interestsJson: interests,
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
) {
  const catalog = await loadSprutCatalog();
  const offer = pickFreeShipAddOn(catalog, {
    flavor: leave.flavor,
    sugar: leave.sugar,
    subtotal: leave.subtotal,
    omerId: visitorId,
  });
  if (!offer) return null;

  const first = (identity.name || '').trim().split(/\s+/)[0] || null;
  const draft = buildSprutDraft({ firstName: first, catalog, offer, leave });
  const page = sprutPageStyle(catalog);
  draft.footer = `${catalog.brand?.name || 'Sprüt'} · Superfood greens in one tiny pack.`;

  await upsertSprutInsight(db, projectId, visitorId, leave);
  return upsertSprutOpportunity(db, projectId, visitorId, identity, leave, draft, page);
}

async function runSprutSend(db: NodePgDatabase, projectId: string, opportunityId: string) {
  const key = `${projectId}:${opportunityId}`;
  if (sendingNow.has(key)) return;
  sendingNow.add(key);
  try {
    const [opp] = await db.select().from(projectOpportunities)
      .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
      .limit(1);
    if (!opp || opp.status === 'sent' || opp.status === 'converted' || opp.status === 'dismissed') {
      await db.update(projectOpportunities).set({ autoSendAt: null }).where(eq(projectOpportunities.id, opportunityId));
      return;
    }
    if (!isSprutLeaveDraft(opp.draftJson, opp.reason)) {
      const { draftOpportunityEmail } = await import('./email-draft');
      await draftOpportunityEmail(db, projectId, opportunityId);
    }
    const { sendOpportunityEmail } = await import('./email-send');
    await sendOpportunityEmail(db, projectId, opportunityId);
    await db.update(projectOpportunities).set({
      autoSendAt: null,
      sendError: null,
      updatedAt: new Date(),
    }).where(eq(projectOpportunities.id, opportunityId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Send failed';
    console.error('sprut auto-send', message);
    await db.update(projectOpportunities).set({
      autoSendAt: null,
      sendError: message,
      updatedAt: new Date(),
    }).where(eq(projectOpportunities.id, opportunityId)).catch(() => undefined);
  } finally {
    sendingNow.delete(key);
  }
}

/** Schedule Approve-less send: persist auto_send_at + in-process fast path. */
export async function scheduleSprutAutoSend(db: NodePgDatabase, projectId: string, opportunityId: string, delayMs = AUTO_SEND_MS) {
  const when = new Date(Date.now() + delayMs);
  try {
    await db.update(projectOpportunities).set({
      autoSendAt: when,
      sendError: null,
      status: 'drafted',
      updatedAt: new Date(),
    }).where(and(
      eq(projectOpportunities.id, opportunityId),
      eq(projectOpportunities.projectId, projectId),
    ));
  } catch (error) {
    console.error('sprut schedule persist', error);
  }

  const key = `${projectId}:${opportunityId}`;
  const prev = autoSendTimers.get(key);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    autoSendTimers.delete(key);
    void runSprutSend(db, projectId, opportunityId);
  }, delayMs);
  autoSendTimers.set(key, timer);
}

/** Drain due Sprüt auto-sends (survives deploys). */
export async function processSprutAutoSends(db: NodePgDatabase) {
  const due = await db.select({
    id: projectOpportunities.id,
    projectId: projectOpportunities.projectId,
    origin: projects.origin,
  })
    .from(projectOpportunities)
    .innerJoin(projects, eq(projects.id, projectOpportunities.projectId))
    .where(and(
      eq(projectOpportunities.status, 'drafted'),
      isNotNull(projectOpportunities.autoSendAt),
      lte(projectOpportunities.autoSendAt, new Date()),
      isNull(projectOpportunities.campaignId),
    ))
    .limit(20);

  for (const row of due) {
    if (!isSprutDemoOrigin(row.origin)) continue;
    await runSprutSend(db, row.projectId, row.id);
  }
}

export function startSprutAutoSendPoller(getDb: () => NodePgDatabase) {
  if (pollerStarted) return;
  pollerStarted = true;
  const tick = () => {
    void processSprutAutoSends(getDb()).catch((error) => {
      console.error('sprut auto-send poller', error instanceof Error ? error.message : error);
    });
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  timer.unref();
}

/**
 * While still on checkout: stage Sprüt draft so leave only has to schedule send.
 */
export async function kickSprutPrestage(db: NodePgDatabase, projectId: string, visitorId: string) {
  const key = `pre:${projectId}:${visitorId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project || !isSprutDemoOrigin(project.origin)) return;

    const tracks = await recentTracks(db, projectId, visitorId);
    const referrer = await latestReferrer(db, projectId, visitorId);
    const leave = evaluateShippingStaging(tracks, referrer);
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
    if (existing?.status === 'sent' || existing?.status === 'converted') return;
    if (existing && isSprutLeaveDraft(existing.draftJson, existing.reason) && !existing.sendError) return;

    await buildAndUpsertSprutDraft(db, projectId, visitorId, leave, identity);
  } finally {
    inFlight.delete(key);
  }
}

/** After page_exit / dwell: draft (if needed) + queue durable auto-send. */
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
    const referrer = await latestReferrer(db, projectId, visitorId);
    const leave = evaluateShippingCostLeave(
      tracks,
      Date.now(),
      { exitAt: opts?.fromDwell ? Date.now() : undefined, referrer },
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

    // Always rebuild session-grounded draft on leave (including retakes after sent).
    const drafted = await buildAndUpsertSprutDraft(db, projectId, visitorId, leave, identity);
    if (drafted?.id) await scheduleSprutAutoSend(db, projectId, drafted.id, AUTO_SEND_MS);
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
  if (!opp || opp.status === 'dismissed') return opp ?? null;
  if (opp.status === 'sent' || opp.status === 'converted') return opp;

  if (isSprutLeaveDraft(opp.draftJson, opp.reason) && !opp.sendError) {
    await scheduleSprutAutoSend(db, projectId, opportunityId, delayMs);
    return opp;
  }

  const tracks = await recentTracks(db, projectId, opp.visitorId);
  const referrer = await latestReferrer(db, projectId, opp.visitorId);
  const leave = evaluateShippingStaging(tracks, referrer)
    || evaluateShippingCostLeave(tracks, Date.now(), { exitAt: Date.now(), referrer })
    || buildLeaveFromShipping(
      {
        name: 'shipping_options_shown',
        at: Date.now(),
        data: { subtotal: 64.99, standard_price: 5.99 },
      },
      tracks,
      Date.now(),
      referrer,
    );

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

  const drafted = await buildAndUpsertSprutDraft(db, projectId, opp.visitorId, leave, identity);
  if (drafted?.id) await scheduleSprutAutoSend(db, projectId, drafted.id, delayMs);
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
    autoSendAt: null,
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
    // Also catch opps that still have the email after identity wipe on a prior partial reset.
    const byEmail = await db.select({ visitorId: projectOpportunities.visitorId })
      .from(projectOpportunities)
      .where(and(eq(projectOpportunities.projectId, projectId), eq(projectOpportunities.email, email)));
    visitorIds = [...new Set([...visitorIds, ...byEmail.map((r) => r.visitorId)])];
  }
  if (!visitorIds.length) throw new Error('Provide email or visitorId to reset');

  for (const visitorId of visitorIds) {
    for (const [k, t] of autoSendTimers) {
      if (k.startsWith(`${projectId}:`)) {
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
    await db.update(visits).set({ activeAt: null }).where(and(
      eq(visits.projectId, projectId),
      eq(visits.visitorId, visitorId),
    ));
  }

  return { reset: visitorIds.length, visitorIds };
}
