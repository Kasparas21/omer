/* Runs stores' campaigns against real visitor data. Every 10 minutes, for each campaign that's on, it finds
   identified visitors (we know their email) who did the campaign's steps in order, recently, and makes their
   email: the campaign's email with their details filled in.

   - "You approve each one": it waits in Opportunities (status review) until someone sends it.
   - "Sends by itself": it's queued (status scheduled) and sent here, outside the person's quiet hours (in
     their own time zone) and within the campaign's daily limit.
   Either way it's dropped if they buy first (status converted), or if it hasn't gone out within the
   campaign's "drop it after" time (status expired).

   Data it reads: page visits (kept 7 days), purchases, identities, carts and discount codes (from the
   store's cart), products viewed with their price and stock, and analysed session replays. Each person gets a
   campaign's email once; "most per person" limits campaign emails per person across all campaigns. A match
   must be fresh (its moment in the last 3 days), so turning a campaign on doesn't sweep in everyone who ever
   qualified. */
import { and, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { loadBrand } from './brand-import';
import { sendOpportunityEmail } from './email-send';
import { loadSending, resolveFrom } from './mail-transport';
import { identities, projectCampaigns, projectEmailMessages, projectOpportunities, projectProducts, projectSignals, projects, purchases, replayInsights, replaySessions, visits } from './schema';
import type { CartSignal, CodeSignal, ProductSignal } from './signals';
import { cleanTrigger, durationMs, personalize, triggerLine, type CampaignTrigger, type MailDocFields, type Step } from './trigger-library';

type Visit = { at: number; path: string; referrer: string; cc: string | null; city: string | null; tz: string | null; session: string; first: boolean; last: boolean };
type Purchase = { at: number; products: string[]; amountCents: number; currency: string };
type Cart = CartSignal & { at: number };
type Code = CodeSignal & { at: number };
type View = ProductSignal & { at: number; path: string };
type Product = { name: string; priceCents: number | null; prevPriceCents: number | null; currency: string | null; available: boolean | null; priceChangedAt: number | null; restockedAt: number | null };
type Hit = { at: number; path?: string; product?: string; cart?: Cart; code?: string; oldCents?: number; newCents?: number; currency?: string };
type Events = { visits: Visit[]; purchases: Purchase[]; carts: Cart[]; codes: Code[]; views: View[]; struggles: number[]; products: Map<string, Product> };

const FRESH_MS = 3 * 24 * 3_600_000;
const SESSION_GAP_MS = 30 * 60_000;
const DAY = 24 * 3_600_000;

const host = (ref: string) => { try { return new URL(ref).host.toLowerCase(); } catch { return ref.toLowerCase(); } };
function pathMatches(step: Step, path: string) {
  const v = step.value.trim();
  if (!v) return true;
  if (step.match === 'starts') return v === '/' ? true : path === v.replace(/\/$/, '') || path.startsWith(v.endsWith('/') ? v : `${v}/`) || path.startsWith(v);
  return path.replace(/\/$/, '') === v.replace(/\/$/, '') || (v === '/' && path === '/');
}
const isProductPath = (p: string) => /\/products?\/[^/]+/i.test(p);
const nameHas = (name: string | undefined, want: string) => !want || (name ?? '').toLowerCase().includes(want);
/** From the nth (oldest first) on, each later one keeps counting; returned most recent first. */
const nth = <T,>(ascending: T[], n: number) => (ascending.length >= n ? ascending.slice(Math.max(0, n - 1)).reverse() : []);

/** Moments someone went back to a product they'd already looked at in the same visit (comparing). */
function compareMoments(vs: Visit[]): Hit[] {
  const out: Hit[] = [];
  let seen: string[] = [];
  let prev = '';
  let session = '';
  let lastAt = 0;
  for (const v of vs) {
    const key = v.session || '';
    if (key !== session || v.at - lastAt > SESSION_GAP_MS) { seen = []; prev = ''; session = key; }
    lastAt = v.at;
    if (!isProductPath(v.path)) continue;
    const p = v.path.replace(/\/$/, '');
    if (p !== prev && seen.includes(p) && seen.length >= 2) out.push({ at: v.at, path: p, product: seen.find((x) => x !== p) });
    if (!seen.includes(p)) seen.push(p);
    prev = p;
  }
  return out;
}

/** Candidate moments for a positive step after `after`, most recent first. */
function hits(step: Step, ev: Events, after: number, now: number): Hit[] {
  const inRange = <T extends { at: number }>(xs: T[]) => xs.filter((x) => x.at > after && x.at <= now);
  const recentFirst = <T extends { at: number }>(xs: T[]) => inRange(xs).sort((a, b) => b.at - a.at);
  const want = step.value.trim().toLowerCase();
  const amount = Number(step.value) || 0;
  switch (step.kind) {
    case 'visited': {
      const asc = inRange(ev.visits.filter((v) => pathMatches(step, v.path)));
      return nth(asc, step.times ?? 1).map((v) => ({ at: v.at, path: v.path }));
    }
    case 'landed': return recentFirst(ev.visits.filter((v) => v.first && pathMatches(step, v.path))).map((v) => ({ at: v.at, path: v.path }));
    case 'left': return recentFirst(ev.visits.filter((v) => v.last && v.at < now - SESSION_GAP_MS && pathMatches(step, v.path))).map((v) => ({ at: v.at, path: v.path }));
    case 'source': return recentFirst(ev.visits.filter((v) => (want ? host(v.referrer).includes(want) : Boolean(v.referrer)))).map((v) => ({ at: v.at, path: v.path }));
    case 'country': {
      const cc = step.value.trim().toUpperCase();
      return recentFirst(ev.visits.filter((v) => (cc ? (v.cc ?? '').toUpperCase() === cc : Boolean(v.cc)))).map((v) => ({ at: v.at }));
    }
    case 'bought':
      return recentFirst(ev.purchases.filter((p) => !want || p.products.some((n) => nameHas(n, want))))
        .map((p) => ({ at: p.at, product: (want ? p.products.find((n) => nameHas(n, want)) : p.products[0]) ?? undefined }));
    case 'added_cart': {
      // A cart that grew (or a first cart with something in it) is an add.
      const adds: Hit[] = [];
      let count = 0;
      for (const c of ev.carts) {
        if (c.count > count) {
          const item = c.items.find((i) => nameHas(i.name, want));
          if (item) adds.push({ at: c.at, cart: c, product: item.name, path: item.path ?? undefined });
        }
        count = c.count;
      }
      return recentFirst(adds);
    }
    case 'cart_value': return recentFirst(ev.carts.filter((c) => c.total >= (amount || 50) * 100)).map((c) => ({ at: c.at, cart: c, product: c.items[0]?.name }));
    case 'near_free_ship': {
      const top = (amount || 50) * 100;
      const low = top - (step.gap ?? 15) * 100;
      return recentFirst(ev.carts.filter((c) => c.count > 0 && c.total < top && c.total >= low)).map((c) => ({ at: c.at, cart: c, product: c.items[0]?.name }));
    }
    case 'code_failed': {
      const asc = inRange(ev.codes.filter((c) => !c.ok));
      return nth(asc, step.times ?? 1).map((c) => ({ at: c.at, code: c.code }));
    }
    case 'compared': {
      const asc = inRange(compareMoments(ev.visits));
      return nth(asc, Math.max(1, (step.times ?? 2) - 1)).map((h) => ({ ...h, product: ev.products.get(h.path ?? '')?.name ?? h.product }));
    }
    case 'sold_out': return recentFirst(ev.views.filter((v) => v.available === false && nameHas(v.name, want))).map((v) => ({ at: v.at, path: v.path, product: v.name }));
    case 'back_in_stock': {
      // Something they saw sold out (any time) is available again: the moment it came back.
      const out: Hit[] = [];
      for (const v of ev.views.filter((x) => x.available === false && x.at <= now)) {
        const p = ev.products.get(v.path);
        if (p?.available && p.restockedAt && p.restockedAt > v.at) out.push({ at: p.restockedAt, path: v.path, product: p.name, newCents: p.priceCents ?? undefined, currency: p.currency ?? undefined });
      }
      return recentFirst(out);
    }
    case 'price_drop': {
      // A product they viewed is now cheaper than when they saw it, by at least the step's percent.
      const pct = (amount || 10) / 100;
      const out: Hit[] = [];
      const viewed = new Map<string, { at: number; cents: number | null }>();
      for (const v of ev.views) viewed.set(v.path, { at: v.at, cents: v.cents });
      for (const v of ev.visits) if (isProductPath(v.path) && !viewed.has(v.path.replace(/\/$/, ''))) viewed.set(v.path.replace(/\/$/, ''), { at: v.at, cents: null });
      for (const [path, seen] of viewed) {
        const p = ev.products.get(path);
        if (!p?.priceChangedAt || p.priceCents == null || p.priceChangedAt <= seen.at) continue;
        const before = seen.cents ?? p.prevPriceCents;
        if (!before || p.priceCents > before * (1 - pct)) continue;
        out.push({ at: p.priceChangedAt, path, product: p.name, oldCents: before, newCents: p.priceCents, currency: p.currency ?? undefined });
      }
      return recentFirst(out);
    }
    case 'struggled': return recentFirst(ev.struggles.map((at) => ({ at })));
    default: return [];
  }
}

/** Tries the steps in order. Returns the moment the last step was met and what was matched, or null. */
function walk(steps: Step[], ev: Events, i: number, after: number, now: number, found: Hit[]): { at: number; found: Hit[] } | null {
  if (i === steps.length) return { at: after, found };
  const step = steps[i];
  if (step.kind === 'no_buy' || step.kind === 'no_return') {
    const until = after + durationMs(step.within ?? '1 day');
    if (until > now) return null;
    const happened = step.kind === 'no_buy'
      ? ev.purchases.some((p) => p.at > after && p.at <= until)
      : ev.visits.some((v) => v.at > after && v.at <= until);
    return happened ? null : walk(steps, ev, i + 1, until, now, found);
  }
  for (const hit of hits(step, ev, after, now)) {
    const rest = walk(steps, ev, i + 1, hit.at, now, [...found, hit]);
    if (rest) return rest;
  }
  return null;
}

/** When this person met the trigger (the moment its email may be made), or null. */
export function matchTrigger(trigger: CampaignTrigger, ev: Events, now = Date.now()) {
  if (!trigger.steps.length) return null;
  const r = walk(trigger.steps, ev, 0, -Infinity, now, []);
  if (!r) return null;
  const due = r.at + durationMs(trigger.wait);
  if (due > now || now - due > FRESH_MS) return null;
  return r;
}

const usesKind = (t: CampaignTrigger | null, kinds: Step['kind'][]) => Boolean(t?.steps.some((s) => kinds.includes(s.kind)));

async function loadEvents(db: NodePgDatabase, projectId: string, visitorIds: string[], need: { signals: boolean; replays: boolean }) {
  const out = new Map<string, Events>();
  if (!visitorIds.length) return out;
  const products = new Map<string, Product>();
  for (const id of visitorIds) out.set(id, { visits: [], purchases: [], carts: [], codes: [], views: [], struggles: [], products });
  const vrows = await db.select({ visitorId: visits.visitorId, at: visits.seenAt, path: visits.path, referrer: visits.referrer, cc: visits.cc, city: visits.city, tz: visits.tz, session: visits.sessionId })
    .from(visits).where(and(eq(visits.projectId, projectId), inArray(visits.visitorId, visitorIds))).orderBy(visits.seenAt);
  for (const r of vrows) out.get(r.visitorId)!.visits.push({ at: r.at.getTime(), path: r.path, referrer: r.referrer, cc: r.cc, city: r.city, tz: r.tz, session: r.session ?? '', first: false, last: false });
  // Mark where each visit (session) started and ended; without a session id, a 30-minute gap starts a new one.
  for (const ev of out.values()) {
    ev.visits.forEach((v, i) => {
      const prev = ev.visits[i - 1];
      const next = ev.visits[i + 1];
      const same = (a?: Visit, b?: Visit) => Boolean(a && b && (a.session && b.session ? a.session === b.session : Math.abs(a.at - b.at) < SESSION_GAP_MS));
      v.first = !same(prev, v);
      v.last = !same(v, next);
    });
  }
  const prows = await db.select({ visitorId: purchases.visitorId, at: purchases.seenAt, products: purchases.products, amountCents: purchases.amountCents, currency: purchases.currency })
    .from(purchases).where(and(eq(purchases.projectId, projectId), inArray(purchases.visitorId, visitorIds), gte(purchases.seenAt, new Date(Date.now() - 365 * DAY))))
    .orderBy(purchases.seenAt);
  for (const r of prows) out.get(r.visitorId)!.purchases.push({ at: r.at.getTime(), products: (r.products ?? []).map((p) => p.name).filter(Boolean), amountCents: r.amountCents, currency: r.currency });

  if (need.signals) {
    const srows = await db.select({ visitorId: projectSignals.visitorId, kind: projectSignals.kind, path: projectSignals.path, data: projectSignals.data, at: projectSignals.seenAt })
      .from(projectSignals).where(and(eq(projectSignals.projectId, projectId), inArray(projectSignals.visitorId, visitorIds), gte(projectSignals.seenAt, new Date(Date.now() - 90 * DAY))))
      .orderBy(projectSignals.seenAt);
    for (const r of srows) {
      const ev = out.get(r.visitorId)!;
      const at = r.at.getTime();
      if (r.kind === 'cart') ev.carts.push({ ...(r.data as CartSignal), at });
      else if (r.kind === 'code') ev.codes.push({ ...(r.data as CodeSignal), at });
      else if (r.kind === 'product') ev.views.push({ ...(r.data as ProductSignal), at, path: r.path ?? '' });
    }
    const rows = await db.select().from(projectProducts).where(eq(projectProducts.projectId, projectId)).limit(5000);
    for (const p of rows) {
      products.set(p.path, {
        name: p.name, priceCents: p.priceCents, prevPriceCents: p.prevPriceCents, currency: p.currency, available: p.available,
        priceChangedAt: p.priceChangedAt?.getTime() ?? null, restockedAt: p.restockedAt?.getTime() ?? null,
      });
    }
  }
  if (need.replays) {
    const rrows = await db.select({ visitorId: replaySessions.visitorId, at: replaySessions.startedAt })
      .from(replaySessions).innerJoin(replayInsights, eq(replayInsights.sessionPk, replaySessions.id))
      .where(and(
        eq(replaySessions.projectId, projectId), inArray(replaySessions.visitorId, visitorIds),
        or(eq(replayInsights.outcome, 'frustrated'), gte(replayInsights.friction, 0.66)),
      ));
    for (const r of rrows) out.get(r.visitorId)!.struggles.push(r.at.getTime());
  }
  return out;
}

const COUNTRY = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
function prettyPage(path: string, productNames: string[]) {
  const slug = path.split('?')[0].replace(/\/$/, '').split('/').pop() ?? '';
  if (!slug) return '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const product = productNames.find((n) => norm(n) === norm(slug));
  return product ?? slug.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const UTILITY = /^\/?(cart|checkout|checkouts|account|login|search|orders?|thank-you|thanks|pages\/contact|contact|policies)(\/|$)/i;
/** The page worth naming in an email: a product they looked at, else any real page from this trigger. */
function pageViewed(matched: string[], recent: string[], productNames: string[]) {
  const isProduct = (p: string) => isProductPath(p) || productNames.some((n) => prettyPage(p, productNames) === n);
  const product = [...matched, ...recent].find((p) => p && isProduct(p));
  if (product) return prettyPage(product, productNames);
  const page = matched.find((p) => p && p.split('?')[0] !== '/' && !UTILITY.test(p.split('?')[0]));
  return page ? prettyPage(page, productNames) : '';
}

export { personalize } from './trigger-library';

export type CampaignSettingsLike = { limit?: string; who?: string; freq?: string; quiet?: string; expires?: string; from?: string };
export type StoredCampaign = { id: string; name?: string; on?: boolean; mode?: 'auto' | 'review'; trigger?: unknown; published?: { doc?: MailDocFields; page?: unknown } | null; settings?: CampaignSettingsLike };
export const PER_PERSON: Record<string, [number, number]> = { '1 email a week': [1, 7], '2 emails a week': [2, 7], '1 email a month': [1, 30] };
export const DAILY: Record<string, number> = { '50 a day': 50, '100 a day': 100, '200 a day': 200, '500 a day': 500, '1,000 a day': 1000 };
export const EXPIRES: Record<string, number> = { '24 hours': DAY, '48 hours': 2 * DAY, '7 days': 7 * DAY };
/** Quiet hours as [start hour, end hour] in the person's own time zone, or null for none. */
export const QUIET: Record<string, [number, number] | null> = { 'No quiet hours': null, '9 PM to 8 AM': [21, 8], '10 PM to 7 AM': [22, 7], 'Same as Settings: 9 PM to 8 AM': [21, 8] };

/** True while it's night for them (their own time zone; no zone known means it's fine to send). */
export function inQuietHours(quiet: string | undefined, tz: string | null | undefined, now = new Date()) {
  const q = quiet && quiet in QUIET ? QUIET[quiet] : QUIET['9 PM to 8 AM'];
  if (!q || !tz) return false;
  let hour: number;
  try { hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now)); } catch { return false; }
  const [start, end] = q;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

const fmt = (cents: number | undefined | null, currency?: string | null) => {
  if (cents == null) return '';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100); } catch { return `$${(cents / 100).toFixed(2)}`; }
};

/** Queues new matches for every campaign that's on (or just one store's), sends what's due. Returns how many were queued. */
export async function runCampaigns(db: NodePgDatabase, onlyProject?: string) {
  const rows = await db.select({ projectId: projectCampaigns.projectId, data: projectCampaigns.data }).from(projectCampaigns)
    .where(onlyProject ? eq(projectCampaigns.projectId, onlyProject) : sql`true`);
  const byProject = new Map<string, StoredCampaign[]>();
  for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r.data as StoredCampaign]);
  let queued = 0;
  for (const [projectId, campaigns] of byProject) {
    try {
      await tidyQueue(db, projectId, campaigns);
      queued += await runProject(db, projectId, campaigns.filter((c) => c.on && c.published?.doc));
      await sendDue(db, projectId, campaigns);
    } catch (e) { console.error('campaign run failed', projectId, e instanceof Error ? e.message : e); }
  }
  return queued;
}

/** Drop queued emails that are too old, whose person already bought, or whose campaign is gone or off (auto only). */
async function tidyQueue(db: NodePgDatabase, projectId: string, campaigns: StoredCampaign[]) {
  const waiting = await db.select({ id: projectOpportunities.id, campaignId: projectOpportunities.campaignId, visitorId: projectOpportunities.visitorId, email: projectOpportunities.email, status: projectOpportunities.status, createdAt: projectOpportunities.createdAt })
    .from(projectOpportunities).where(and(eq(projectOpportunities.projectId, projectId), isNotNull(projectOpportunities.campaignId), inArray(projectOpportunities.status, ['review', 'drafted', 'scheduled'])));
  if (!waiting.length) return;
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const now = Date.now();
  const expired: string[] = [];
  const converted: string[] = [];
  const buys = await db.select({ visitorId: purchases.visitorId, email: purchases.customerEmail, at: purchases.seenAt }).from(purchases)
    .where(and(eq(purchases.projectId, projectId), gte(purchases.seenAt, new Date(now - 30 * DAY))));
  for (const o of waiting) {
    const c = byId.get(o.campaignId!);
    const made = o.createdAt.getTime();
    if (buys.some((b) => b.at.getTime() > made && (b.visitorId === o.visitorId || (o.email && b.email && b.email.toLowerCase() === o.email.toLowerCase())))) { converted.push(o.id); continue; }
    const life = EXPIRES[c?.settings?.expires ?? '48 hours'] ?? 2 * DAY;
    if (!c || now - made > life) expired.push(o.id);
  }
  const at = new Date();
  if (expired.length) await db.update(projectOpportunities).set({ status: 'expired', updatedAt: at }).where(inArray(projectOpportunities.id, expired));
  if (converted.length) await db.update(projectOpportunities).set({ status: 'converted', updatedAt: at }).where(inArray(projectOpportunities.id, converted));
}

async function runProject(db: NodePgDatabase, projectId: string, campaigns: StoredCampaign[]) {
  if (!campaigns.length) return 0;
  const [project] = await db.select({ name: projects.name, currency: projects.displayCurrency }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return 0;
  const people = await db.select({ visitorId: identities.visitorId, email: identities.email, name: identities.name })
    .from(identities).where(eq(identities.projectId, projectId)).limit(5000);
  if (!people.length) return 0;
  const opps = await db.select({ visitorId: projectOpportunities.visitorId, campaignId: projectOpportunities.campaignId, suppressed: projectOpportunities.suppressed, status: projectOpportunities.status, createdAt: projectOpportunities.createdAt })
    .from(projectOpportunities).where(eq(projectOpportunities.projectId, projectId));
  const suppressed = new Set(opps.filter((o) => o.suppressed).map((o) => o.visitorId));
  const triggers = campaigns.map((c) => cleanTrigger(c.trigger));
  const need = {
    signals: triggers.some((t) => usesKind(t, ['added_cart', 'cart_value', 'near_free_ship', 'code_failed', 'compared', 'sold_out', 'back_in_stock', 'price_drop'])),
    replays: triggers.some((t) => usesKind(t, ['struggled'])),
  };
  const events = await loadEvents(db, projectId, people.map((p) => p.visitorId), need);
  const brand = await loadBrand(db, projectId);
  const productNames = brand.products.map((p) => p.name).filter(Boolean);
  const now = Date.now();
  let queued = 0;

  for (const [ci, c] of campaigns.entries()) {
    const trigger = triggers[ci];
    if (!trigger?.steps.length || !c.published?.doc) continue;
    const already = new Set(opps.filter((o) => o.campaignId === c.id).map((o) => o.visitorId));
    const [most, days] = PER_PERSON[c.settings?.freq ?? ''] ?? [1, 7];
    const who = c.settings?.who ?? 'Everyone with an email';
    for (const person of people) {
      if (already.has(person.visitorId) || suppressed.has(person.visitorId)) continue;
      // Most per person counts every campaign email made for them lately (not ones dropped before sending).
      const recent = opps.filter((o) => o.visitorId === person.visitorId && o.campaignId && o.status !== 'expired' && o.status !== 'converted' && now - o.createdAt.getTime() < days * DAY).length;
      if (recent >= most) continue;
      const ev = events.get(person.visitorId)!;
      if (who === 'Never bought before' && ev.purchases.length) continue;
      if (who === 'Bought before' && !ev.purchases.length) continue;
      const match = matchTrigger(trigger, ev, now);
      if (!match) continue;
      const lastVisit = ev.visits[ev.visits.length - 1];
      const lastBuy = ev.purchases[ev.purchases.length - 1];
      const found = [...match.found].reverse();
      const cart = found.find((h) => h.cart)?.cart ?? ev.carts[ev.carts.length - 1];
      const priced = found.find((h) => h.oldCents != null || h.newCents != null);
      const shipStep = trigger.steps.find((s) => s.kind === 'near_free_ship');
      const viewed = pageViewed(found.map((h) => h.path ?? ''), [...ev.visits].reverse().map((v) => v.path), productNames);
      const values: Record<string, string> = {
        first_name: (person.name ?? '').trim().split(/\s+/)[0] ?? '',
        full_name: (person.name ?? '').trim(),
        email: person.email,
        city: lastVisit?.city ?? '',
        country: lastVisit?.cc ? (COUNTRY?.of(lastVisit.cc.toUpperCase()) ?? lastVisit.cc) : '',
        page_viewed: viewed,
        last_product: found.find((h) => h.product && !h.cart)?.product ?? lastBuy?.products[0] ?? '',
        last_order_total: lastBuy ? fmt(lastBuy.amountCents, lastBuy.currency) : '',
        store_name: project.name,
        product_name: found.find((h) => h.product)?.product ?? viewed,
        old_price: priced?.oldCents != null ? fmt(priced.oldCents, priced.currency ?? project.currency) : '',
        new_price: priced?.newCents != null ? fmt(priced.newCents, priced.currency ?? project.currency) : '',
        cart_total: cart ? fmt(cart.total, cart.currency) : '',
        cart_item: cart?.items[0]?.name ?? '',
        free_ship_gap: cart && shipStep ? fmt(Math.max(0, (Number(shipStep.value) || 50) * 100 - cart.total), cart.currency) : '',
        failed_code: found.find((h) => h.code)?.code ?? ev.codes.filter((x) => !x.ok).pop()?.code ?? '',
      };
      const draft = personalize(c.published.doc, values);
      const at = new Date();
      const inserted = await db.insert(projectOpportunities).values({
        projectId, visitorId: person.visitorId, campaignId: c.id, status: c.mode === 'auto' ? 'scheduled' : 'review',
        reason: c.name ?? 'Campaign', hooksJson: [triggerLine(trigger)], insightSummary: null,
        email: person.email, name: person.name, draftJson: draft as Record<string, unknown>,
        pageJson: (c.published.page ?? null) as Record<string, unknown> | null, createdAt: at, updatedAt: at,
      }).onConflictDoNothing().returning({ id: projectOpportunities.id });
      if (inserted.length) { queued += 1; opps.push({ visitorId: person.visitorId, campaignId: c.id, suppressed: false, status: 'review', createdAt: at }); }
    }
  }
  return queued;
}

/** Sends "sends by itself" campaigns' queued emails: not at night for them, not past the daily limit. */
async function sendDue(db: NodePgDatabase, projectId: string, campaigns: StoredCampaign[]) {
  const auto = campaigns.filter((c) => c.on && c.mode === 'auto');
  if (!auto.length) return 0;
  // No way to send yet (no sender set up): leave them queued until there is, without logging failures.
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !resolveFrom(project.name, await loadSending(db, projectId)).fromEmail) return 0;
  const due = await db.select({ id: projectOpportunities.id, campaignId: projectOpportunities.campaignId, visitorId: projectOpportunities.visitorId })
    .from(projectOpportunities).where(and(eq(projectOpportunities.projectId, projectId), eq(projectOpportunities.status, 'scheduled'), inArray(projectOpportunities.campaignId, auto.map((c) => c.id))))
    .orderBy(projectOpportunities.createdAt).limit(500);
  if (!due.length) return 0;
  const since = new Date(Date.now() - DAY);
  const sentToday = await db.select({ campaignId: projectOpportunities.campaignId, n: sql<number>`count(*)::int` })
    .from(projectEmailMessages).innerJoin(projectOpportunities, eq(projectOpportunities.id, projectEmailMessages.opportunityId))
    .where(and(eq(projectEmailMessages.projectId, projectId), eq(projectEmailMessages.status, 'sent'), gte(projectEmailMessages.sentAt, since), isNotNull(projectOpportunities.campaignId)))
    .groupBy(projectOpportunities.campaignId);
  const count = new Map(sentToday.map((r) => [r.campaignId!, r.n]));
  const tzRows = await db.execute(sql`select distinct on (visitor_id) visitor_id, tz from project_visits
    where project_id = ${projectId} and tz is not null and visitor_id in (${sql.join(due.map((d) => sql`${d.visitorId}`), sql`, `)})
    order by visitor_id, seen_at desc`);
  const tz = new Map((tzRows.rows as { visitor_id: string; tz: string }[]).map((r) => [r.visitor_id, r.tz]));
  let sent = 0;
  for (const o of due) {
    const c = auto.find((x) => x.id === o.campaignId)!;
    const limit = DAILY[c.settings?.limit ?? '200 a day'] ?? 200;
    if ((count.get(c.id) ?? 0) >= limit) continue;
    if (inQuietHours(c.settings?.quiet, tz.get(o.visitorId))) continue;
    try {
      await sendOpportunityEmail(db, projectId, o.id);
      count.set(c.id, (count.get(c.id) ?? 0) + 1);
      sent += 1;
    } catch (e) {
      // Not sent (no sending set up, bought already, unsubscribed…): leave it for next time or the tidy-up.
      console.error('campaign send failed', projectId, o.id, e instanceof Error ? e.message : e);
      if (e instanceof Error && /bought|unsubscribed|No email/i.test(e.message)) {
        await db.update(projectOpportunities).set({ status: /bought/i.test(e.message) ? 'converted' : 'dismissed', updatedAt: new Date() }).where(eq(projectOpportunities.id, o.id));
      }
    }
  }
  return sent;
}

/** How many people did these steps lately, for the create flow: everyone we saw, and those we can email. */
export async function previewTrigger(db: NodePgDatabase, projectId: string, trigger: CampaignTrigger) {
  if (!trigger.steps.length) return { people: 0, withEmail: 0 };
  const seen = await db.selectDistinct({ visitorId: visits.visitorId }).from(visits).where(eq(visits.projectId, projectId)).limit(5000);
  const buyers = await db.selectDistinct({ visitorId: purchases.visitorId }).from(purchases)
    .where(and(eq(purchases.projectId, projectId), gte(purchases.seenAt, new Date(Date.now() - 365 * DAY)))).limit(5000);
  const signalers = await db.selectDistinct({ visitorId: projectSignals.visitorId }).from(projectSignals)
    .where(and(eq(projectSignals.projectId, projectId), gte(projectSignals.seenAt, new Date(Date.now() - 90 * DAY)))).limit(5000);
  const ids = [...new Set([...seen, ...buyers, ...signalers].map((r) => r.visitorId))].slice(0, 5000);
  const known = new Set((await db.select({ visitorId: identities.visitorId }).from(identities)
    .where(and(eq(identities.projectId, projectId), isNotNull(identities.email)))).map((r) => r.visitorId));
  const events = await loadEvents(db, projectId, ids, { signals: true, replays: usesKind(trigger, ['struggled']) });
  // Ignore freshness and the send delay here: who did this at all, within the data we keep.
  let people = 0;
  let withEmail = 0;
  for (const [id, ev] of events) {
    if (walk(trigger.steps, ev, 0, -Infinity, Date.now(), [])) { people += 1; if (known.has(id)) withEmail += 1; }
  }
  return { people, withEmail };
}

/** Per campaign: emails waiting, sent, and what they led to (last 14 days): orders and sales within 7 days of an email. */
export async function campaignQueueCounts(db: NodePgDatabase, projectId: string) {
  const rows = await db.select({ campaignId: projectOpportunities.campaignId, status: projectOpportunities.status, n: sql<number>`count(*)::int` })
    .from(projectOpportunities).where(and(eq(projectOpportunities.projectId, projectId), isNotNull(projectOpportunities.campaignId)))
    .groupBy(projectOpportunities.campaignId, projectOpportunities.status);
  const out: Record<string, { review: number; scheduled: number; sent: number; sent14: number; bought: number; salesCents: number; currency: string | null }> = {};
  const row = (k: string) => (out[k] ??= { review: 0, scheduled: 0, sent: 0, sent14: 0, bought: 0, salesCents: 0, currency: null });
  for (const r of rows) {
    const k = row(r.campaignId!);
    if (r.status === 'sent') k.sent += r.n;
    else if (r.status === 'scheduled') k.scheduled += r.n;
    else if (r.status === 'review' || r.status === 'drafted') k.review += r.n;
  }
  const since = new Date(Date.now() - 14 * DAY);
  const sentRows = await db.select({ campaignId: projectOpportunities.campaignId, visitorId: projectEmailMessages.visitorId, email: projectEmailMessages.toEmail, at: projectEmailMessages.sentAt })
    .from(projectEmailMessages).innerJoin(projectOpportunities, eq(projectOpportunities.id, projectEmailMessages.opportunityId))
    .where(and(eq(projectEmailMessages.projectId, projectId), eq(projectEmailMessages.status, 'sent'), gte(projectEmailMessages.sentAt, since), isNotNull(projectOpportunities.campaignId)));
  if (!sentRows.length) return out;
  const buys = await db.select({ visitorId: purchases.visitorId, email: purchases.customerEmail, at: purchases.seenAt, cents: purchases.amountCents, currency: purchases.currency, id: purchases.id })
    .from(purchases).where(and(eq(purchases.projectId, projectId), gte(purchases.seenAt, since)));
  const counted = new Set<string>();
  for (const s of sentRows) {
    const k = row(s.campaignId!);
    k.sent14 += 1;
    const t = s.at?.getTime() ?? 0;
    const order = buys.find((b) => !counted.has(b.id) && b.at.getTime() > t && b.at.getTime() - t < 7 * DAY
      && (b.visitorId === s.visitorId || (b.email && b.email.toLowerCase() === s.email.toLowerCase())));
    if (!order) continue;
    counted.add(order.id);
    k.bought += 1;
    k.salesCents += order.cents;
    k.currency ??= order.currency;
  }
  return out;
}

/** What the create flow can offer for each step, from the store's own data. */
export async function triggerOptions(db: NodePgDatabase, projectId: string) {
  const since = new Date(Date.now() - 7 * DAY);
  const pageRows = await db.execute(sql`select path, count(*)::int as n from project_visits where project_id = ${projectId} group by path order by n desc limit 300`);
  const vrows = await db.select({ visitorId: visits.visitorId, at: visits.seenAt, path: visits.path, referrer: visits.referrer, cc: visits.cc, session: visits.sessionId })
    .from(visits).where(and(eq(visits.projectId, projectId), gte(visits.seenAt, since))).orderBy(visits.visitorId, visits.seenAt).limit(20000);
  const entry = new Map<string, number>();
  const exit = new Map<string, number>();
  const sources = new Map<string, number>();
  const countries = new Map<string, number>();
  vrows.forEach((v, i) => {
    const prev = vrows[i - 1];
    const next = vrows[i + 1];
    const same = (a?: typeof v, b?: typeof v) => Boolean(a && b && a.visitorId === b.visitorId && (a.session && b.session ? a.session === b.session : Math.abs(a.at.getTime() - b.at.getTime()) < SESSION_GAP_MS));
    if (!same(prev, v)) entry.set(v.path, (entry.get(v.path) ?? 0) + 1);
    if (!same(v, next)) exit.set(v.path, (exit.get(v.path) ?? 0) + 1);
    if (v.referrer) { const h = host(v.referrer).replace(/^www\./, ''); if (h) sources.set(h, (sources.get(h) ?? 0) + 1); }
    if (v.cc) countries.set(v.cc.toUpperCase(), (countries.get(v.cc.toUpperCase()) ?? 0) + 1);
  });
  const prows = await db.select({ products: purchases.products }).from(purchases).where(eq(purchases.projectId, projectId)).limit(5000);
  const products = new Map<string, number>();
  for (const r of prows) for (const p of r.products ?? []) if (p.name) products.set(p.name, (products.get(p.name) ?? 0) + 1);
  const seenProducts = await db.select({ name: projectProducts.name }).from(projectProducts).where(eq(projectProducts.projectId, projectId)).limit(2000);
  for (const p of seenProducts) if (p.name && !products.has(p.name)) products.set(p.name, 0);
  const brand = await loadBrand(db, projectId);
  for (const p of brand.products) if (p.name && !products.has(p.name)) products.set(p.name, 0);
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([value, count]) => ({ value, count }));
  const pages = (pageRows.rows as { path: string; n: number }[]).map((r) => ({ value: r.path, count: r.n }));
  const [cartRow] = await db.select({ n: sql<number>`count(*)::int` }).from(projectSignals)
    .where(and(eq(projectSignals.projectId, projectId), eq(projectSignals.kind, 'cart'), gte(projectSignals.seenAt, new Date(Date.now() - 30 * DAY))));
  return {
    pages, entry: list(entry), exit: list(exit), sources: list(sources),
    countries: list(countries).map((c) => ({ ...c, label: COUNTRY?.of(c.value) ?? c.value })),
    products: list(products),
    /** Whether we've seen carts lately (Shopify, or the store calls cart()); cart steps need it. */
    carts: (cartRow?.n ?? 0) > 0,
  };
}
