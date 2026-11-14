/* Runs stores' manual campaigns against real visitor data. Every few minutes, for each campaign that's on, it
   finds identified visitors (we know their email) who did the campaign's steps in order, recently, and puts
   their email in Opportunities for approval: the campaign's email with their details filled in. Sending stays
   with the existing approve-and-send path (SES).

   Data it reads: page visits (kept 7 days, so page steps look back at most that far), purchases, identities.
   Each person gets a campaign's email once; a campaign's "most per person" setting limits how many campaign
   emails one person can be queued across all campaigns. A match must be fresh (its moment in the last 3 days),
   so turning a campaign on doesn't sweep in everyone who ever qualified. */
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { loadBrand } from './brand-import';
import { identities, projectCampaigns, projectOpportunities, projects, purchases, visits } from './schema';
import { cleanTrigger, durationMs, fillFields, triggerLine, type CampaignTrigger, type Step } from './trigger-library';

type Visit = { at: number; path: string; referrer: string; cc: string | null; city: string | null; session: string; first: boolean; last: boolean };
type Purchase = { at: number; products: string[]; amountCents: number; currency: string };
type Hit = { at: number; path?: string; product?: string };
type Events = { visits: Visit[]; purchases: Purchase[] };

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

/** Candidate moments for a positive step after `after`, most recent first. */
function hits(step: Step, ev: Events, after: number, now: number): Hit[] {
  const recentFirst = <T extends { at: number }>(xs: T[]) => xs.filter((x) => x.at > after && x.at <= now).sort((a, b) => b.at - a.at);
  switch (step.kind) {
    case 'visited': {
      const list = recentFirst(ev.visits.filter((v) => pathMatches(step, v.path)));
      const times = step.times ?? 1;
      if (times <= 1) return list.map((v) => ({ at: v.at, path: v.path }));
      // The nth visit (oldest first) is the moment it counts; any later visit keeps counting.
      const asc = [...list].reverse();
      return asc.length >= times ? asc.slice(times - 1).reverse().map((v) => ({ at: v.at, path: v.path })) : [];
    }
    case 'landed': return recentFirst(ev.visits.filter((v) => v.first && pathMatches(step, v.path))).map((v) => ({ at: v.at, path: v.path }));
    case 'left': return recentFirst(ev.visits.filter((v) => v.last && v.at < now - SESSION_GAP_MS && pathMatches(step, v.path))).map((v) => ({ at: v.at, path: v.path }));
    case 'source': {
      const want = step.value.trim().toLowerCase();
      return recentFirst(ev.visits.filter((v) => (want ? host(v.referrer).includes(want) : Boolean(v.referrer)))).map((v) => ({ at: v.at, path: v.path }));
    }
    case 'country': {
      const want = step.value.trim().toUpperCase();
      return recentFirst(ev.visits.filter((v) => (want ? (v.cc ?? '').toUpperCase() === want : Boolean(v.cc)))).map((v) => ({ at: v.at }));
    }
    case 'bought': {
      const want = step.value.trim().toLowerCase();
      return recentFirst(ev.purchases.filter((p) => !want || p.products.some((n) => n.toLowerCase().includes(want))))
        .map((p) => ({ at: p.at, product: (want ? p.products.find((n) => n.toLowerCase().includes(want)) : p.products[0]) ?? undefined }));
    }
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

async function loadEvents(db: NodePgDatabase, projectId: string, visitorIds: string[]) {
  const out = new Map<string, Events>();
  if (!visitorIds.length) return out;
  for (const id of visitorIds) out.set(id, { visits: [], purchases: [] });
  const vrows = await db.select({ visitorId: visits.visitorId, at: visits.seenAt, path: visits.path, referrer: visits.referrer, cc: visits.cc, city: visits.city, session: visits.sessionId })
    .from(visits).where(and(eq(visits.projectId, projectId), inArray(visits.visitorId, visitorIds))).orderBy(visits.seenAt);
  for (const r of vrows) out.get(r.visitorId)!.visits.push({ at: r.at.getTime(), path: r.path, referrer: r.referrer, cc: r.cc, city: r.city, session: r.session ?? '', first: false, last: false });
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
  const isProduct = (p: string) => /\/products?\//i.test(p) || productNames.some((n) => prettyPage(p, productNames) === n);
  const product = [...matched, ...recent].find((p) => p && isProduct(p));
  if (product) return prettyPage(product, productNames);
  const page = matched.find((p) => p && p.split('?')[0] !== '/' && !UTILITY.test(p.split('?')[0]));
  return page ? prettyPage(page, productNames) : '';
}

type MailDoc = { subject?: string; preview?: string; headline?: string; body?: string[]; cta?: string; vars?: Record<string, string> } & Record<string, unknown>;
/** The campaign's email with this person's details in place of {{fields}}. */
export function personalize(doc: MailDoc, values: Record<string, string | null | undefined>): MailDoc {
  const fb = doc.vars ?? {};
  const f = (t?: string) => (typeof t === 'string' ? fillFields(t, values, fb) : t);
  return { ...doc, subject: f(doc.subject), preview: f(doc.preview), headline: f(doc.headline), cta: f(doc.cta), body: (doc.body ?? []).map((b) => f(b) ?? '') };
}

type StoredCampaign = { id: string; name?: string; on?: boolean; trigger?: unknown; published?: { doc?: MailDoc; page?: unknown } | null; settings?: { freq?: string } };
const PER_PERSON: Record<string, [number, number]> = { '1 email a week': [1, 7], '2 emails a week': [2, 7], '1 email a month': [1, 30] };

/** Queues new matches for every campaign that's on (or just one store's). Returns how many were queued. */
export async function runCampaigns(db: NodePgDatabase, onlyProject?: string) {
  const rows = await db.select({ projectId: projectCampaigns.projectId, data: projectCampaigns.data }).from(projectCampaigns)
    .where(and(sql`${projectCampaigns.data}->>'on' = 'true'`, onlyProject ? eq(projectCampaigns.projectId, onlyProject) : sql`true`));
  const byProject = new Map<string, StoredCampaign[]>();
  for (const r of rows) {
    const c = r.data as StoredCampaign;
    if (!c.published?.doc) continue;
    byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), c]);
  }
  let queued = 0;
  for (const [projectId, campaigns] of byProject) {
    try { queued += await runProject(db, projectId, campaigns); } catch (e) { console.error('campaign run failed', projectId, e instanceof Error ? e.message : e); }
  }
  return queued;
}

async function runProject(db: NodePgDatabase, projectId: string, campaigns: StoredCampaign[]) {
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return 0;
  const people = await db.select({ visitorId: identities.visitorId, email: identities.email, name: identities.name })
    .from(identities).where(eq(identities.projectId, projectId)).limit(5000);
  if (!people.length) return 0;
  const opps = await db.select({ visitorId: projectOpportunities.visitorId, campaignId: projectOpportunities.campaignId, suppressed: projectOpportunities.suppressed, createdAt: projectOpportunities.createdAt })
    .from(projectOpportunities).where(eq(projectOpportunities.projectId, projectId));
  const suppressed = new Set(opps.filter((o) => o.suppressed).map((o) => o.visitorId));
  const events = await loadEvents(db, projectId, people.map((p) => p.visitorId));
  const brand = await loadBrand(db, projectId);
  const productNames = brand.products.map((p) => p.name).filter(Boolean);
  const now = Date.now();
  let queued = 0;

  for (const c of campaigns) {
    const trigger = cleanTrigger(c.trigger);
    if (!trigger?.steps.length || !c.published?.doc) continue;
    const already = new Set(opps.filter((o) => o.campaignId === c.id).map((o) => o.visitorId));
    const [most, days] = PER_PERSON[c.settings?.freq ?? ''] ?? [1, 7];
    for (const person of people) {
      if (already.has(person.visitorId) || suppressed.has(person.visitorId)) continue;
      const recent = opps.filter((o) => o.visitorId === person.visitorId && o.campaignId && now - o.createdAt.getTime() < days * DAY).length;
      if (recent >= most) continue;
      const ev = events.get(person.visitorId)!;
      const match = matchTrigger(trigger, ev, now);
      if (!match) continue;
      const lastVisit = ev.visits[ev.visits.length - 1];
      const lastBuy = ev.purchases[ev.purchases.length - 1];
      const viewed = pageViewed([...match.found].reverse().map((h) => h.path ?? ''), [...ev.visits].reverse().map((v) => v.path), productNames);
      const values: Record<string, string> = {
        first_name: (person.name ?? '').trim().split(/\s+/)[0] ?? '',
        full_name: (person.name ?? '').trim(),
        email: person.email,
        city: lastVisit?.city ?? '',
        country: lastVisit?.cc ? (COUNTRY?.of(lastVisit.cc.toUpperCase()) ?? lastVisit.cc) : '',
        page_viewed: viewed,
        last_product: [...match.found].reverse().find((h) => h.product)?.product ?? lastBuy?.products[0] ?? '',
        last_order_total: lastBuy ? new Intl.NumberFormat('en-US', { style: 'currency', currency: lastBuy.currency.toUpperCase() || 'USD' }).format(lastBuy.amountCents / 100) : '',
        store_name: project.name,
      };
      const draft = personalize(c.published.doc, values);
      const at = new Date();
      const inserted = await db.insert(projectOpportunities).values({
        projectId, visitorId: person.visitorId, campaignId: c.id, status: 'review',
        reason: c.name ?? 'Campaign', hooksJson: [triggerLine(trigger)], insightSummary: null,
        email: person.email, name: person.name, draftJson: draft as Record<string, unknown>,
        pageJson: (c.published.page ?? null) as Record<string, unknown> | null, createdAt: at, updatedAt: at,
      }).onConflictDoNothing().returning({ id: projectOpportunities.id });
      if (inserted.length) { queued += 1; opps.push({ visitorId: person.visitorId, campaignId: c.id, suppressed: false, createdAt: at }); }
    }
  }
  return queued;
}

/** How many people did these steps lately, for the create flow: everyone we saw, and those we can email. */
export async function previewTrigger(db: NodePgDatabase, projectId: string, trigger: CampaignTrigger) {
  if (!trigger.steps.length) return { people: 0, withEmail: 0 };
  const seen = await db.selectDistinct({ visitorId: visits.visitorId }).from(visits).where(eq(visits.projectId, projectId)).limit(5000);
  const buyers = await db.selectDistinct({ visitorId: purchases.visitorId }).from(purchases)
    .where(and(eq(purchases.projectId, projectId), gte(purchases.seenAt, new Date(Date.now() - 365 * DAY)))).limit(5000);
  const ids = [...new Set([...seen, ...buyers].map((r) => r.visitorId))].slice(0, 5000);
  const known = new Set((await db.select({ visitorId: identities.visitorId }).from(identities)
    .where(and(eq(identities.projectId, projectId), isNotNull(identities.email)))).map((r) => r.visitorId));
  const events = await loadEvents(db, projectId, ids);
  // Ignore freshness and the send delay here: who did this at all, within the data we keep.
  let people = 0;
  let withEmail = 0;
  for (const [id, ev] of events) {
    if (walk(trigger.steps, ev, 0, -Infinity, Date.now(), [])) { people += 1; if (known.has(id)) withEmail += 1; }
  }
  return { people, withEmail };
}

/** Campaign queue counts per campaign, for the campaign page. */
export async function campaignQueueCounts(db: NodePgDatabase, projectId: string) {
  const rows = await db.select({ campaignId: projectOpportunities.campaignId, status: projectOpportunities.status, n: sql<number>`count(*)::int` })
    .from(projectOpportunities).where(and(eq(projectOpportunities.projectId, projectId), isNotNull(projectOpportunities.campaignId)))
    .groupBy(projectOpportunities.campaignId, projectOpportunities.status);
  const out: Record<string, { review: number; sent: number }> = {};
  for (const r of rows) {
    const k = r.campaignId!;
    out[k] ??= { review: 0, sent: 0 };
    if (r.status === 'sent') out[k].sent += r.n; else if (r.status !== 'dismissed') out[k].review += r.n;
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
  const brand = await loadBrand(db, projectId);
  for (const p of brand.products) if (p.name && !products.has(p.name)) products.set(p.name, 0);
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([value, count]) => ({ value, count }));
  const pages = (pageRows.rows as { path: string; n: number }[]).map((r) => ({ value: r.path, count: r.n }));
  return {
    pages, entry: list(entry), exit: list(exit), sources: list(sources),
    countries: list(countries).map((c) => ({ ...c, label: COUNTRY?.of(c.value) ?? c.value })),
    products: list(products),
  };
}
