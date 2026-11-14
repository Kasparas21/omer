import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'node:crypto';
import { amountCents, cleanCampaign, cleanCurrency, cleanEmail, cleanName, cleanOrderId, cleanProducts } from './commerce';
import { localDemoPlace, placeFromRequest } from './geo';
import { deleteObject, getObject, objectKeyFor, objectStoreConfigured, putObject } from './object-store';
import {
  extractReplayEvidence,
  generateReplayInsight,
  generateVisitorInsight,
  INSIGHT_VERSION,
  openaiConfigured,
  publicInsight,
  publicVisitorInsight,
} from './replay-insight';
import { brandImportReady, emptyStoredBrand, importBrandFromSite, loadBrand, saveBrand, type StoredBrand } from './brand-import';
import { firecrawlConfigured } from './firecrawl';
import {
  listCampaignSuggestions,
  listOpportunities,
  patchCampaignSuggestion,
  patchOpportunity,
  refreshCampaignSuggestions,
  upsertOpportunityFromInsight,
} from './opportunities';
import { draftOpportunityEmail, saveOpportunityDraft } from './email-draft';
import { sendOpportunityEmail } from './email-send';
import { loadEmailContext } from './email-context';
import { mailProvidersAvailable } from './mail-transport';
import { checkProjectSending, getProjectSending, upsertProjectSending } from './sending';
import { CAMPAIGN_ID, MAX_IMAGE_BYTES, deleteCampaign, describeTrigger, imageStorageReady, listCampaigns, saveCampaign, storeImage } from './campaigns';
import { dailyVisitors, dwell, emailEvents, identities, pageViews, pathViews, projects, purchases, referrerViews, replayChunks, replayInsights, replaySessions, visitorInsights, visits } from './schema';
import { auth, pool, appURL } from './auth';

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  ALLOW_LOCAL_SITES?: string;
  CREATE_LIMIT: RateLimit;
  COLLECT_LIMIT: RateLimit;
};

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const liveListeners = new Map<string, Set<() => void>>();

const visitorId = /^[A-Za-z0-9_-]{8,80}$/;
const sessionIdRe = /^[A-Za-z0-9_-]{8,80}$/;
const SESSION_GAP_MS = 30 * 60_000;
const projectFields = {
  id: projects.id,
  name: projects.name,
  origin: projects.origin,
  writeKey: projects.writeKey,
  firstEventAt: projects.firstEventAt,
  replayEnabled: projects.replayEnabled,
};

function cleanSessionId(value: unknown) {
  return typeof value === 'string' && sessionIdRe.test(value) ? value : null;
}

function cleanDevice(value: unknown, request?: Request) {
  if (value === 'phone' || value === 'monitor') return value;
  const ua = request?.headers.get('user-agent') || '';
  return /Mobi|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ? 'phone' : 'monitor';
}

function json(data: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

function cors(origin: string) {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
}

/** Prefer Origin; fall back to Referer for sendBeacon leave uploads (some mobile browsers omit Origin). */
function requestOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null') return origin;
  const referer = request.headers.get('Referer') || request.headers.get('Referrer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/** Collect endpoints must always include CORS, including errors — otherwise browsers report Failed to fetch. */
function collectReply(origin: string, status: number) {
  return new Response(null, { status, headers: cors(origin) });
}

async function readText(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let result = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return result + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        return null;
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function siteOrigin(value: unknown, allowLocal: boolean) {
  if (typeof value !== 'string' || value.length > 500) return null;
  const input = value.trim();
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (url.username || url.password) return null;
    if (allowLocal && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
    }
    const dnsName = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i;
    if (url.protocol !== 'https:' || url.port || !dnsName.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function cleanPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const path = value.split(/[?#]/, 1)[0];
  if (/[\u0000-\u001f]/.test(path)) return null;
  return path.slice(0, 300);
}

function cleanReferrer(value: unknown) {
  if (typeof value !== 'string' || value.length > 120) return '(direct)';
  // Accept hostnames and short UTM slugs (linkedin, reddit, google, …).
  const trimmed = value.trim().toLowerCase().replace(/^www\./, '') || '(direct)';
  if (trimmed === '(direct)' || trimmed === 'direct') return '(direct)';
  if (!/^[a-z0-9][a-z0-9.-]{0,118}$/.test(trimmed)) return '(direct)';
  return trimmed;
}

async function withDatabase<T>(_env: Env, action: (db: NodePgDatabase) => Promise<T>) {
  return action(drizzle(pool));
}

async function ownerID(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id;
}

async function listProjects(request: Request, env: Env) {
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view projects.' }, 401);
  const url = new URL(request.url);
  const summary = url.searchParams.get('view') === 'summary';
  const selected = url.searchParams.get('project');
  if (selected && !uuid.test(selected)) return json({ error: 'Project not found.' }, 404);
  if (summary) {
    const records = await withDatabase(env, (db) => db.select(projectFields)
      .from(projects).where(eq(projects.owner, owner)).orderBy(desc(projects.createdAt)));
    return json({ projects: records });
  }
  const records = await withDatabase(env, (db) => db.select({
    ...projectFields,
    pageViews: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select ${pageViews.day} as day, ${pageViews.count}::float8 as count
        from ${pageViews}
        where ${pageViews.projectId} = ${projects.id}
          and ${pageViews.day} >= (now() at time zone 'UTC')::date - 59
      ) q
    ), '[]'::json)`,
    visitors: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select ${dailyVisitors.day} as day, count(*)::float8 as count
        from ${dailyVisitors}
        where ${dailyVisitors.projectId} = ${projects.id}
          and ${dailyVisitors.day} >= (now() at time zone 'UTC')::date - 59
        group by ${dailyVisitors.day}
      ) q
    ), '[]'::json)`,
    dwell: sql<{ day: string; avgMs: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'avgMs', "avgMs") order by day)
      from (
        select ${dwell.day} as day,
          case when ${dwell.samples} > 0 then (${dwell.totalMs}::float8 / ${dwell.samples}::float8) else 0 end as "avgMs"
        from ${dwell}
        where ${dwell.projectId} = ${projects.id}
          and ${dwell.day} >= (now() at time zone 'UTC')::date - 59
      ) q
    ), '[]'::json)`,
    sources: sql<{ name: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('name', name, 'count', count) order by count desc)
      from (
        select ${referrerViews.referrer} as name, sum(${referrerViews.count})::float8 as count
        from ${referrerViews}
        where ${referrerViews.projectId} = ${projects.id}
          and ${referrerViews.day} >= (now() at time zone 'UTC')::date - 29
        group by ${referrerViews.referrer}
        order by count desc
        limit 8
      ) q
    ), '[]'::json)`,
    // Hourly pageviews and people for yesterday and today (UTC), so Today draws a real curve.
    hours: sql<{ hour: string; views: number; people: number }[]>`coalesce((
      select json_agg(json_build_object('hour', hour, 'views', views, 'people', people) order by hour)
      from (
        select to_char(date_trunc('hour', ${visits.seenAt} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24') as hour,
          count(*)::float8 as views,
          count(distinct ${visits.visitorId})::float8 as people
        from ${visits}
        -- project_visits has its own "id", so name the outer project's id explicitly.
        where ${visits.projectId} = "onboarding_projects"."id"
          and ${visits.seenAt} >= (date_trunc('day', now() at time zone 'UTC') - interval '1 day') at time zone 'UTC'
        group by 1
      ) q
    ), '[]'::json)`,
    pages: sql<{ path: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('path', path, 'count', count) order by count desc)
      from (
        select split_part(split_part(${pathViews.path}, '?', 1), '#', 1) as path, sum(${pathViews.count})::float8 as count
        from ${pathViews}
        where ${pathViews.projectId} = ${projects.id}
          and ${pathViews.day} >= (now() at time zone 'UTC')::date - 29
        group by 1
        order by count desc
        limit 8
      ) q
    ), '[]'::json)`,
    sales: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select (${purchases.seenAt} at time zone 'UTC')::date::text as day,
          (sum(${purchases.amountCents})::float8 / 100) as count
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 59
        group by 1
      ) q
    ), '[]'::json)`,
    orders: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select (${purchases.seenAt} at time zone 'UTC')::date::text as day,
          count(*)::float8 as count
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 59
        group by 1
      ) q
    ), '[]'::json)`,
    returningSales: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select (${purchases.seenAt} at time zone 'UTC')::date::text as day,
          (sum(${purchases.amountCents})::float8 / 100) as count
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.isReturning} = true
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 59
        group by 1
      ) q
    ), '[]'::json)`,
    clicked: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select (${emailEvents.seenAt} at time zone 'UTC')::date::text as day,
          count(*)::float8 as count
        from ${emailEvents}
        where ${emailEvents.projectId} = ${projects.id}
          and ${emailEvents.type} = 'email_click'
          and ${emailEvents.seenAt} >= (now() at time zone 'UTC')::date - 59
        group by 1
      ) q
    ), '[]'::json)`,
    emailOpens: sql<{ day: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('day', day, 'count', count) order by day)
      from (
        select (${emailEvents.seenAt} at time zone 'UTC')::date::text as day,
          count(*)::float8 as count
        from ${emailEvents}
        where ${emailEvents.projectId} = ${projects.id}
          and ${emailEvents.type} = 'email_open'
          and ${emailEvents.seenAt} >= (now() at time zone 'UTC')::date - 59
        group by 1
      ) q
    ), '[]'::json)`,
    products: sql<{ name: string; count: number; revenue: number }[]>`coalesce((
      select json_agg(json_build_object('name', name, 'count', count, 'revenue', revenue) order by revenue desc)
      from (
        select coalesce(item->>'name', 'Product') as name,
          sum(coalesce((item->>'qty')::float8, 1))::float8 as count,
          sum(coalesce((item->>'price')::float8, 0) * coalesce((item->>'qty')::float8, 1))::float8 as revenue
        from ${purchases},
          lateral jsonb_array_elements(coalesce(${purchases.products}, '[]'::jsonb)) as item
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 29
        group by 1
        order by revenue desc
        limit 8
      ) q
    ), '[]'::json)`,
    campaigns: sql<{ name: string; revenue: number; count: number }[]>`coalesce((
      select json_agg(json_build_object('name', name, 'revenue', revenue, 'count', count) order by revenue desc)
      from (
        select coalesce(nullif(${purchases.campaign}, ''), 'Unattributed') as name,
          (sum(${purchases.amountCents})::float8 / 100) as revenue,
          count(*)::float8 as count
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 29
        group by 1
        order by revenue desc
        limit 6
      ) q
    ), '[]'::json)`,
    sourceRevenue: sql<{ name: string; revenue: number }[]>`coalesce((
      select json_agg(json_build_object('name', name, 'revenue', revenue) order by revenue desc)
      from (
        select coalesce(nullif(${purchases.referrer}, ''), '(direct)') as name,
          (sum(${purchases.amountCents})::float8 / 100) as revenue
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 29
        group by 1
      ) q
    ), '[]'::json)`,
    pageRevenue: sql<{ path: string; revenue: number }[]>`coalesce((
      select json_agg(json_build_object('path', path, 'revenue', revenue) order by revenue desc)
      from (
        select coalesce(nullif(split_part(split_part(${purchases.path}, '?', 1), '#', 1), ''), '/') as path,
          (sum(${purchases.amountCents})::float8 / 100) as revenue
        from ${purchases}
        where ${purchases.projectId} = ${projects.id}
          and ${purchases.seenAt} >= (now() at time zone 'UTC')::date - 29
        group by 1
      ) q
    ), '[]'::json)`,
  })
    .from(projects).where(and(eq(projects.owner, owner), selected ? eq(projects.id, selected) : undefined)).orderBy(desc(projects.createdAt)));
  return json({ projects: records });
}

async function createProject(request: Request, env: Env, url: URL) {
  if (request.headers.get('Origin') !== appURL) return json({ error: 'Open the dashboard and try again.' }, 403);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.CREATE_LIMIT.limit({ key: ip })).success) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
  }

  const raw = await readText(request, 2048);
  let body: { name?: unknown; website?: unknown } | null;
  try { body = raw === null ? null : JSON.parse(raw); } catch { body = null; }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const origin = siteOrigin(body?.website, env.ALLOW_LOCAL_SITES === 'true');
  if (!name || name.length > 80) return json({ field: 'name', error: 'Enter a project name up to 80 characters.' }, 400);
  if (!origin) return json({ field: 'website', error: 'Enter a website address like https://example.com.' }, 400);

  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to create a project.' }, 401);
  const [project] = await withDatabase(env, (db) => db.insert(projects).values({ owner, name, origin }).returning(projectFields));
  return json({ project }, 201);
}

async function receiveInstall(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return new Response(null, { status: 403 });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.COLLECT_LIMIT.limit({ key: ip })).success) return new Response(null, { status: 429 });
  const writeKey = await readText(request, 36);
  if (!writeKey || !uuid.test(writeKey)) return new Response(null, { status: 400 });

  const accepted = await withDatabase(env, async (db) => {
    const match = and(eq(projects.writeKey, writeKey), eq(projects.origin, origin));
    const [project] = await db.select({ id: projects.id, firstEventAt: projects.firstEventAt }).from(projects).where(match).limit(1);
    if (!project) return false;
    if (!project.firstEventAt) await db.update(projects).set({ firstEventAt: sql`now()` })
      .where(and(eq(projects.id, project.id), isNull(projects.firstEventAt)));
    return true;
  });

  return accepted
    ? new Response(null, { status: 204, headers: cors(origin) })
    : new Response(null, { status: 403 });
}

async function receiveEvent(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return new Response(null, { status: 403 });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.COLLECT_LIMIT.limit({ key: `${ip}:event` })).success) return collectReply(origin, 429);

  const raw = await readText(request, 4096);
  let body: Record<string, unknown> | null;
  try { body = raw === null ? null : JSON.parse(raw); } catch { body = null; }
  const writeKey = typeof body?.key === 'string' ? body.key : '';
  const type = body?.type === 'pageview' || body?.type === 'dwell' || body?.type === 'presence'
    || body?.type === 'purchase' || body?.type === 'identify'
    || body?.type === 'email_open' || body?.type === 'email_click' ? body.type : null;
  const vid = typeof body?.vid === 'string' && visitorId.test(body.vid) ? body.vid : null;
  const path = cleanPath(body?.path) ?? '/';
  if (!uuid.test(writeKey) || !type || !vid) return collectReply(origin, 400);

  const accepted = await withDatabase(env, (db) => db.transaction(async (tx) => {
    const [project] = await tx.select({ id: projects.id, firstEventAt: projects.firstEventAt }).from(projects)
      .where(and(eq(projects.writeKey, writeKey), eq(projects.origin, origin))).limit(1);
    if (!project) return null;
    if (!project.firstEventAt && (type === 'pageview' || type === 'purchase')) {
      await tx.update(projects).set({ firstEventAt: sql`now()` })
        .where(and(eq(projects.id, project.id), isNull(projects.firstEventAt)));
    }
    const day = sql`(now() at time zone 'UTC')::date`;

    if (type === 'presence') {
      await tx.update(visits).set({ activeAt: sql`now()` }).where(eq(visits.id, sql`(
        select id from project_visits where project_id = ${project.id} and visitor_id = ${vid}
          and seen_at > now() - interval '24 hours' order by seen_at desc limit 1
      )`));
      return project.id;
    }

    if (type === 'dwell') {
      const ms = typeof body?.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : 0;
      const visitKey = typeof body?.visitId === 'string' && uuid.test(body.visitId) ? body.visitId : null;
      // Clear presence on every recent visit for this person so no stale row keeps them "Online".
      await tx.update(visits).set({ activeAt: null }).where(and(
        eq(visits.projectId, project.id),
        eq(visits.visitorId, vid),
        sql`${visits.seenAt} > now() - interval '24 hours'`,
      ));
      if (ms >= 1000 && ms <= 1_800_000) {
        if (visitKey) {
          await tx.update(visits).set({ dwellMs: sql`${visits.dwellMs} + ${ms}` }).where(and(
            eq(visits.id, visitKey),
            eq(visits.projectId, project.id),
            eq(visits.visitorId, vid),
          ));
        } else {
          await tx.update(visits).set({ dwellMs: sql`${visits.dwellMs} + ${ms}` }).where(eq(visits.id, sql`(
            select id from project_visits where project_id = ${project.id} and visitor_id = ${vid}
              and seen_at > now() - interval '24 hours' order by seen_at desc limit 1
          )`));
        }
        await tx.insert(dwell)
          .values({ projectId: project.id, day, totalMs: ms, samples: 1 })
          .onConflictDoUpdate({
            target: [dwell.projectId, dwell.day],
            set: {
              totalMs: sql`${dwell.totalMs} + ${ms}`,
              samples: sql`${dwell.samples} + 1`,
            },
          });
      }
      return project.id;
    }

    if (type === 'identify') {
      const email = cleanEmail(body?.email);
      if (!email) return null;
      await tx.insert(identities)
        .values({ projectId: project.id, visitorId: vid, email, name: cleanName(body?.name) })
        .onConflictDoUpdate({
          target: [identities.projectId, identities.visitorId],
          set: { email, name: cleanName(body?.name), updatedAt: sql`now()` },
        });
      return project.id;
    }

    if (type === 'email_open' || type === 'email_click') {
      await tx.insert(emailEvents).values({
        projectId: project.id,
        visitorId: vid,
        type,
        campaign: cleanCampaign(body?.campaign),
        messageId: cleanOrderId(body?.messageId),
      });
      return project.id;
    }

    if (type === 'purchase') {
      const cents = amountCents(body?.amount);
      if (cents == null) return null;
      const orderId = cleanOrderId(body?.orderId);
      const [prior] = await tx.select({ id: purchases.id }).from(purchases)
        .where(and(eq(purchases.projectId, project.id), eq(purchases.visitorId, vid))).limit(1);
      let lastVisit: { path: string; referrer: string } | undefined;
      const [visit] = await tx.select({ path: visits.path, referrer: visits.referrer }).from(visits)
        .where(and(eq(visits.projectId, project.id), eq(visits.visitorId, vid)))
        .orderBy(desc(visits.seenAt)).limit(1);
      lastVisit = visit;
      try {
        await tx.insert(purchases).values({
          projectId: project.id,
          visitorId: vid,
          orderId,
          amountCents: cents,
          currency: cleanCurrency(body?.currency),
          path: cleanPath(body?.path) ?? lastVisit?.path ?? '/',
          referrer: cleanReferrer(body?.ref ?? lastVisit?.referrer),
          products: cleanProducts(body?.products),
          campaign: cleanCampaign(body?.campaign),
          isReturning: Boolean(prior),
        });
      } catch {
        // Duplicate order_id for this project — treat as idempotent success.
        if (orderId) return project.id;
        throw new Error('purchase_insert_failed');
      }
      return project.id;
    }

    const referrer = cleanReferrer(body?.ref);
    await tx.insert(pageViews)
      .values({ projectId: project.id, day, count: 1 })
      .onConflictDoUpdate({
        target: [pageViews.projectId, pageViews.day],
        set: { count: sql`${pageViews.count} + 1` },
      });
    await tx.insert(dailyVisitors)
      .values({ projectId: project.id, day, visitorId: vid })
      .onConflictDoNothing();
    await tx.insert(pathViews)
      .values({ projectId: project.id, day, path, count: 1 })
      .onConflictDoUpdate({
        target: [pathViews.projectId, pathViews.day, pathViews.path],
        set: { count: sql`${pathViews.count} + 1` },
      });
    await tx.insert(referrerViews)
      .values({ projectId: project.id, day, referrer, count: 1 })
      .onConflictDoUpdate({
        target: [referrerViews.projectId, referrerViews.day, referrerViews.referrer],
        set: { count: sql`${referrerViews.count} + 1` },
      });
    const geo = placeFromRequest(request) ?? (env.ALLOW_LOCAL_SITES === 'true' ? localDemoPlace(vid) : null);
    await tx.insert(visits).values({
      projectId: project.id,
      visitorId: vid,
      sessionId: cleanSessionId(body?.sid),
      device: cleanDevice(body?.device, request),
      path,
      referrer,
      cc: geo?.cc ?? null,
      city: geo?.city ?? null,
      place: geo?.place ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      activeAt: sql`now()`,
    });
    return project.id;
  }));

  // Notify Live on leave (dwell) too so Online drops without waiting for the next poll.
  if (accepted) for (const notify of liveListeners.get(accepted) ?? []) notify();
  return accepted
    ? new Response(null, { status: 204, headers: cors(origin) })
    : new Response(null, { status: 403 });
}

async function liveFeed(request: Request, env: Env, projectId: string, stream: boolean) {
  if (!uuid.test(projectId)) return json({ error: 'Project not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view live visitors.' }, 401);

  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.owner, owner)))
      .limit(1);
    if (!project) return json({ error: 'Project not found.' }, 404);
    if (stream) return openLiveStream(projectId);

    const recent = await db.select({
      id: visits.id,
      visitorId: visits.visitorId,
      path: visits.path,
      referrer: visits.referrer,
      cc: visits.cc,
      city: visits.city,
      place: visits.place,
      lat: visits.lat,
      lng: visits.lng,
      seenAt: visits.seenAt,
      activeAt: visits.activeAt,
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), gt(visits.seenAt, sql`now() - interval '24 hours'`)))
      .orderBy(desc(visits.seenAt))
      .limit(48);

    const [{ online }] = await db.select({
      online: sql<number>`count(distinct ${visits.visitorId})::int`,
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), gt(visits.seenAt, sql`now() - interval '24 hours'`),
        sql`${visits.activeAt} is not null and ${visits.activeAt} > now() - interval '45 seconds'`));

    const hourVisits = await db.select({ seenAt: visits.seenAt })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), gt(visits.seenAt, sql`now() - interval '60 minutes'`)));

    const minutes = Array.from({ length: 60 }, () => 0);
    const now = Date.now();
    for (const row of hourVisits) {
      const ageMin = Math.min(59, Math.max(0, Math.floor((now - new Date(row.seenAt).getTime()) / 60_000)));
      minutes[59 - ageMin] += 1;
    }

    const sourceRows = await db.select({
      name: referrerViews.referrer,
      count: sql<number>`sum(${referrerViews.count})::float8`,
    })
      .from(referrerViews)
      .where(and(
        eq(referrerViews.projectId, projectId),
        sql`${referrerViews.day} >= (now() at time zone 'UTC')::date - 6`,
      ))
      .groupBy(referrerViews.referrer)
      .orderBy(desc(sql`sum(${referrerViews.count})`))
      .limit(6);

    const orderBySource = await db.select({
      name: sql<string>`coalesce(nullif(${purchases.referrer}, ''), '(direct)')`,
      orders: sql<number>`count(*)::int`,
    })
      .from(purchases)
      .where(and(eq(purchases.projectId, projectId), gt(purchases.seenAt, sql`now() - interval '7 days'`)))
      .groupBy(sql`coalesce(nullif(${purchases.referrer}, ''), '(direct)')`);
    const ordersMap = new Map(orderBySource.map((row) => [row.name, Number(row.orders)]));

    const visitorIds = [...new Set(recent.map((row) => row.visitorId))];
    const identityRows = visitorIds.length
      ? await db.select({ visitorId: identities.visitorId, email: identities.email, name: identities.name })
        .from(identities)
        .where(and(eq(identities.projectId, projectId), inArray(identities.visitorId, visitorIds)))
      : [];
    const revenueRows = visitorIds.length
      ? await db.select({
        visitorId: purchases.visitorId,
        revenue: sql<number>`(sum(${purchases.amountCents})::float8 / 100)`,
      })
        .from(purchases)
        .where(and(eq(purchases.projectId, projectId), inArray(purchases.visitorId, visitorIds)))
        .groupBy(purchases.visitorId)
      : [];
    const identityMap = new Map(identityRows.map((row) => [row.visitorId, row]));
    const revenueMap = new Map(revenueRows.map((row) => [row.visitorId, Number(row.revenue)]));

    return json({
      online: Number(online ?? 0),
      minutes,
      sources: sourceRows.map((row) => ({
        name: row.name,
        count: Number(row.count),
        orders: ordersMap.get(row.name) ?? 0,
      })),
      visits: recent.map((row) => ({
        id: row.id,
        seed: row.visitorId,
        path: cleanPath(row.path) ?? '/',
        referrer: row.referrer,
        cc: row.cc,
        city: row.city,
        place: row.place,
        lat: row.lat,
        lng: row.lng,
        seenAt: row.seenAt,
        activeAt: row.activeAt,
        email: identityMap.get(row.visitorId)?.email ?? null,
        name: identityMap.get(row.visitorId)?.name ?? null,
        revenue: revenueMap.get(row.visitorId) ?? 0,
      })),
    });
  });
}

function groupSessions<T extends {
  id: string; sessionId: string | null; device: string | null; dwellMs: number;
  path: string; referrer: string; seenAt: string | Date; activeAt: string | Date | null;
}>(rows: T[]) {
  const chronological = [...rows].sort((a, b) => Date.parse(String(a.seenAt)) - Date.parse(String(b.seenAt)));
  const sessions: {
    sessionId: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    device: string;
    referrer: string;
    live: boolean;
    events: { id: string; path: string; seenAt: string; durationMs: number }[];
  }[] = [];
  const dwellOf: number[][] = [];
  let current: typeof sessions[number] | null = null;
  let lastAt = 0;
  for (const row of chronological) {
    const at = Date.parse(String(row.seenAt));
    const sid: string = row.sessionId
      || (current && at - lastAt <= SESSION_GAP_MS ? current.sessionId : `gap_${row.id}`);
    if (!current || current.sessionId !== sid) {
      current = {
        sessionId: sid,
        startedAt: new Date(at).toISOString(),
        endedAt: new Date(at).toISOString(),
        durationMs: 0,
        device: row.device === 'phone' ? 'phone' : 'monitor',
        referrer: row.referrer || '(direct)',
        live: false,
        events: [],
      };
      sessions.push(current);
      dwellOf.push([]);
    }
    current.endedAt = new Date(at).toISOString();
    if (row.device === 'phone') current.device = 'phone';
    current.events.push({ id: row.id, path: cleanPath(row.path) ?? '/', seenAt: new Date(at).toISOString(), durationMs: 0 });
    dwellOf[dwellOf.length - 1].push(Number(row.dwellMs) || 0);
    // Only real presence counts — never fall back to seenAt or leave looks "still online".
    if (row.activeAt) {
      const active = Date.parse(String(row.activeAt));
      if (Number.isFinite(active) && Date.now() - active < 45_000) current.live = true;
    }
    lastAt = at;
  }
  // Time per page: the reported dwell when the tracker sent one, otherwise the gap to the next page
  // (or, for a page someone is still on, the time since it opened). A last page with neither stays 0.
  sessions.forEach((session, s) => {
    session.events.forEach((event, i) => {
      const reported = dwellOf[s][i];
      const next = session.events[i + 1];
      const start = Date.parse(event.seenAt);
      const gap = next ? Date.parse(next.seenAt) - start : session.live ? Date.now() - start : 0;
      event.durationMs = reported > 0 ? reported : Math.max(0, Math.min(gap, SESSION_GAP_MS));
    });
    session.durationMs = session.events.reduce((sum, event) => sum + event.durationMs, 0);
  });
  return sessions.reverse();
}

async function visitorProfile(request: Request, env: Env, projectId: string, visitorKey: string) {
  if (!uuid.test(projectId) || !visitorId.test(visitorKey)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view profiles.' }, 401);

  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id, replayEnabled: projects.replayEnabled })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.owner, owner)))
      .limit(1);
    if (!project) return json({ error: 'Project not found.' }, 404);

    const rows = await db.select({
      id: visits.id,
      sessionId: visits.sessionId,
      device: visits.device,
      dwellMs: visits.dwellMs,
      path: visits.path,
      referrer: visits.referrer,
      cc: visits.cc,
      city: visits.city,
      place: visits.place,
      lat: visits.lat,
      lng: visits.lng,
      seenAt: visits.seenAt,
      activeAt: visits.activeAt,
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), eq(visits.visitorId, visitorKey)))
      .orderBy(desc(visits.seenAt))
      .limit(200);

    const [identity] = await db.select({
      email: identities.email,
      name: identities.name,
      updatedAt: identities.updatedAt,
    })
      .from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorKey)))
      .limit(1);

    const orderRows = await db.select({
      id: purchases.id,
      amountCents: purchases.amountCents,
      currency: purchases.currency,
      path: purchases.path,
      referrer: purchases.referrer,
      products: purchases.products,
      campaign: purchases.campaign,
      isReturning: purchases.isReturning,
      seenAt: purchases.seenAt,
      orderId: purchases.orderId,
    })
      .from(purchases)
      .where(and(eq(purchases.projectId, projectId), eq(purchases.visitorId, visitorKey)))
      .orderBy(desc(purchases.seenAt))
      .limit(40);

    const mail = await db.select({
      id: emailEvents.id,
      type: emailEvents.type,
      campaign: emailEvents.campaign,
      seenAt: emailEvents.seenAt,
    })
      .from(emailEvents)
      .where(and(eq(emailEvents.projectId, projectId), eq(emailEvents.visitorId, visitorKey)))
      .orderBy(desc(emailEvents.seenAt))
      .limit(40);

    const replayRows = await db.select({
      id: replaySessions.id,
      sessionId: replaySessions.sessionId,
      status: replaySessions.status,
      hasFullSnapshot: replaySessions.hasFullSnapshot,
      bytes: replaySessions.bytes,
      startedAt: replaySessions.startedAt,
      expiresAt: replaySessions.expiresAt,
    })
      .from(replaySessions)
      .where(and(eq(replaySessions.projectId, projectId), eq(replaySessions.visitorId, visitorKey)))
      .orderBy(desc(replaySessions.startedAt))
      .limit(40);

    const insightRows = replayRows.length
      ? await db.select({
        sessionPk: replayInsights.sessionPk,
        status: replayInsights.status,
        summaryText: replayInsights.summaryText,
        outcome: replayInsights.outcome,
        friction: replayInsights.friction,
        worthWatching: replayInsights.worthWatching,
        primaryInterest: replayInsights.primaryInterest,
        emailReady: replayInsights.emailReady,
        emailReadyConfidence: replayInsights.emailReadyConfidence,
        stage: replayInsights.stage,
        intent: replayInsights.intent,
        highlightsJson: replayInsights.highlightsJson,
        emailHooksJson: replayInsights.emailHooksJson,
        insightVersion: replayInsights.insightVersion,
        generatedAt: replayInsights.generatedAt,
        error: replayInsights.error,
      })
        .from(replayInsights)
        .where(inArray(replayInsights.sessionPk, replayRows.map((row) => row.id)))
      : [];
    const insightByReplay = new Map(insightRows.map((row) => [row.sessionPk, publicInsight(row)]));

    const [visitorInsightRow] = await db.select().from(visitorInsights)
      .where(and(eq(visitorInsights.projectId, projectId), eq(visitorInsights.visitorId, visitorKey)))
      .limit(1);

    const revenue = orderRows.reduce((sum, row) => sum + row.amountCents, 0) / 100;
    const opens = mail.filter((row) => row.type === 'email_open').length;
    const clicks = mail.filter((row) => row.type === 'email_click').length;
    const sessions = groupSessions(rows);
    const firstSeen = rows.length
      ? new Date(Math.min(...rows.map((r) => Date.parse(String(r.seenAt))))).toISOString()
      : null;
    const dwellMs = sessions.reduce((sum, session) => sum + session.durationMs, 0);
    const pageviews = rows.length;
    const firstGeo = [...rows].reverse().find((r) => r.cc || r.lat != null) ?? rows[rows.length - 1];
    const firstReferrer = sessions[sessions.length - 1]?.referrer ?? rows[rows.length - 1]?.referrer ?? '(direct)';
    const firstPath = sessions[sessions.length - 1]?.events[0]?.path ?? rows[rows.length - 1]?.path ?? '/';
    const lastOpen = mail.find((row) => row.type === 'email_open');
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const activity: Record<string, number> = {};
    for (const row of rows) {
      const day = new Date(String(row.seenAt));
      day.setHours(0, 0, 0, 0);
      const ago = Math.round((end.getTime() - day.getTime()) / 86_400_000);
      if (ago >= 0 && ago < 22 * 7) activity[String(ago)] = (activity[String(ago)] ?? 0) + 1;
    }
    const replayBySession = new Map(replayRows.map((row) => {
      const playable = Boolean(row.hasFullSnapshot) && Number(row.bytes) >= 1_000;
      return [row.sessionId, {
        id: row.id,
        status: row.expiresAt && Date.parse(String(row.expiresAt)) < Date.now()
          ? 'expired'
          : playable ? row.status : 'incomplete',
        hasFullSnapshot: playable,
        startedAt: row.startedAt,
        insight: insightByReplay.get(row.id) ?? null,
      }];
    }));
    const journey = sessions.map((session) => ({
      ...session,
      purchases: orderRows
        .filter((p) => {
          const t = Date.parse(String(p.seenAt));
          return t >= Date.parse(session.startedAt) - 60_000 && t <= Date.parse(session.endedAt) + SESSION_GAP_MS;
        })
        .map((row) => ({
          id: row.id,
          amount: row.amountCents / 100,
          currency: row.currency,
          path: row.path,
          products: row.products,
          campaign: row.campaign,
          isReturning: row.isReturning,
          seenAt: row.seenAt,
        })),
      replay: replayBySession.get(session.sessionId) ?? null,
    }));

    return json({
      seed: visitorKey,
      identity: identity ?? null,
      visitorInsight: visitorInsightRow ? publicVisitorInsight(visitorInsightRow) : null,
      insightsEnabled: openaiConfigured(),
      place: firstGeo ? {
        cc: firstGeo.cc, city: firstGeo.city, place: firstGeo.place, lat: firstGeo.lat, lng: firstGeo.lng,
      } : null,
      firstReferrer,
      firstPath,
      live: sessions.some((s) => s.live),
      lastSeenAt: rows[0] ? String(rows[0].activeAt ?? rows[0].seenAt) : null,
      device: sessions[0]?.device ?? 'monitor',
      stats: {
        firstSeen,
        sessions: sessions.length,
        pageviews,
        dwellMs,
        revenue,
        orders: orderRows.length,
        sent: 0,
        opens,
        clicks,
        attributed: orderRows.filter((row) => row.campaign).length,
      },
      mail: {
        sent: 0,
        opened: opens,
        clicked: clicks,
        lastOpenedAt: lastOpen ? String(lastOpen.seenAt) : null,
        attributed: orderRows.filter((row) => row.campaign).length,
      },
      activity,
      journey,
      purchases: orderRows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        amount: row.amountCents / 100,
        currency: row.currency,
        path: row.path,
        referrer: row.referrer,
        products: row.products,
        campaign: row.campaign,
        isReturning: row.isReturning,
        seenAt: row.seenAt,
      })),
      emailEvents: mail,
      replayEnabled: project.replayEnabled && objectStoreConfigured(),
      replayInsights: openaiConfigured(),
    });
  });
}

async function collectConfig(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return new Response(null, { status: 403 });
  const writeKey = new URL(request.url).searchParams.get('key') || '';
  if (!uuid.test(writeKey)) return json({ replay: false }, 200, cors(origin));
  const [project] = await withDatabase(env, (db) => db.select({
    replayEnabled: projects.replayEnabled,
  }).from(projects).where(and(eq(projects.writeKey, writeKey), eq(projects.origin, origin))).limit(1));
  return json({ replay: Boolean(project?.replayEnabled && objectStoreConfigured()) }, 200, cors(origin));
}

async function receiveReplayChunk(request: Request, env: Env) {
  const origin = requestOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  if (!objectStoreConfigured()) return collectReply(origin, 503);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.COLLECT_LIMIT.limit({ key: `${ip}:replay` })).success) return collectReply(origin, 429);

  const raw = await readText(request, 4_000_000);
  if (raw == null) return collectReply(origin, 413);
  let body: Record<string, unknown> | null;
  try { body = JSON.parse(raw); } catch { return collectReply(origin, 400); }
  const writeKey = typeof body?.key === 'string' ? body.key : '';
  const vid = typeof body?.vid === 'string' && visitorId.test(body.vid) ? body.vid : null;
  const sid = cleanSessionId(body?.sid);
  const tabId = typeof body?.tabId === 'string' && sessionIdRe.test(body.tabId) ? body.tabId : 'main';
  const clientBatchId = typeof body?.clientBatchId === 'string' ? body.clientBatchId.slice(0, 80) : '';
  const seq = typeof body?.seq === 'number' && Number.isFinite(body.seq) ? Math.max(0, Math.round(body.seq)) : -1;
  const events = Array.isArray(body?.events) ? body.events : null;
  if (!uuid.test(writeKey) || !vid || !sid || !clientBatchId || seq < 0 || !events || !events.length || events.length > 2_000) {
    return collectReply(origin, 400);
  }

  const [project] = await withDatabase(env, (db) => db.select({
    id: projects.id, replayEnabled: projects.replayEnabled,
  }).from(projects).where(and(eq(projects.writeKey, writeKey), eq(projects.origin, origin))).limit(1));
  if (!project?.replayEnabled) return collectReply(origin, 403);

  const payload = Buffer.from(JSON.stringify(events));
  if (payload.length > 3_500_000) return collectReply(origin, 413);
  const checksum = createHash('sha256').update(payload).digest('hex');
  const hasFull = Boolean(body?.hasFullSnapshot) || events.some((e) => (e as { type?: number })?.type === 2);

  await withDatabase(env, async (db) => {
    const existing = await db.select({ id: replayChunks.id }).from(replayChunks)
      .innerJoin(replaySessions, eq(replayChunks.sessionPk, replaySessions.id))
      .where(and(
        eq(replaySessions.projectId, project.id),
        eq(replaySessions.sessionId, sid),
        eq(replaySessions.tabId, tabId),
        eq(replayChunks.clientBatchId, clientBatchId),
      )).limit(1);
    if (existing[0]) return;

    let [session] = await db.select().from(replaySessions)
      .where(and(eq(replaySessions.projectId, project.id), eq(replaySessions.sessionId, sid), eq(replaySessions.tabId, tabId)))
      .limit(1);
    if (!session) {
      const expires = new Date(Date.now() + 7 * 86_400_000);
      [session] = await db.insert(replaySessions).values({
        projectId: project.id,
        visitorId: vid,
        sessionId: sid,
        tabId,
        status: hasFull ? 'ready' : 'incomplete',
        hasFullSnapshot: hasFull,
        bytes: 0,
        expiresAt: expires,
      }).returning();
    }

    const objectKey = objectKeyFor(project.id, session.id, clientBatchId);
    await putObject(objectKey, payload);
    try {
      await db.insert(replayChunks).values({
        sessionPk: session.id,
        seq,
        clientBatchId,
        checksum,
        objectKey,
        byteSize: payload.length,
        hasFullSnapshot: hasFull,
      });
      await db.update(replaySessions).set({
        bytes: sql`${replaySessions.bytes} + ${payload.length}`,
        hasFullSnapshot: sql`${replaySessions.hasFullSnapshot} or ${hasFull}`,
        status: hasFull || session.hasFullSnapshot ? 'ready' : 'incomplete',
        endedAt: sql`now()`,
      }).where(eq(replaySessions.id, session.id));
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  });

  return new Response(null, { status: 204, headers: cors(origin) });
}

async function getReplay(request: Request, env: Env, projectId: string, replayId: string) {
  if (!uuid.test(projectId) || !uuid.test(replayId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view replays.' }, 401);
  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.owner, owner))).limit(1);
    if (!project) return json({ error: 'Not found.' }, 404);
    const [session] = await db.select().from(replaySessions)
      .where(and(eq(replaySessions.id, replayId), eq(replaySessions.projectId, projectId))).limit(1);
    if (!session) return json({ error: 'Not found.' }, 404);
    const expired = Date.parse(String(session.expiresAt)) < Date.now();
    if (expired) {
      await db.update(replaySessions).set({ status: 'expired' }).where(eq(replaySessions.id, session.id));
      return json({ id: session.id, status: 'expired', chunks: [], gaps: true });
    }
    const chunks = await db.select().from(replayChunks)
      .where(eq(replayChunks.sessionPk, session.id)).orderBy(asc(replayChunks.seq));
    // Same-origin proxy URLs — browsers cannot fetch R2 signed URLs without bucket CORS.
    const urls = chunks
      .filter((chunk) => Number(chunk.byteSize) >= 8)
      .map((chunk) => ({
        seq: chunk.seq,
        url: `/api/projects/${projectId}/replays/${replayId}/chunks/${chunk.seq}`,
        hasFullSnapshot: chunk.hasFullSnapshot,
      }));
    const seqs = urls.map((c) => c.seq);
    const playable = Boolean(session.hasFullSnapshot) && Number(session.bytes) >= 1_000 && urls.length > 0;
    const gaps = seqs.length > 0 && (Math.max(...seqs) - Math.min(...seqs) + 1 !== seqs.length || !playable);
    const [insight] = await db.select().from(replayInsights)
      .where(eq(replayInsights.sessionPk, session.id)).limit(1);
    return json({
      id: session.id,
      status: playable ? 'ready' : 'incomplete',
      hasFullSnapshot: playable,
      chunks: urls,
      gaps,
      insight: insight ? publicInsight(insight) : null,
      insightsEnabled: openaiConfigured(),
    });
  });
}

async function summarizeReplay(request: Request, env: Env, projectId: string, replayId: string) {
  if (!uuid.test(projectId) || !uuid.test(replayId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to summarize replays.' }, 401);
  if (!openaiConfigured()) return json({ error: 'OpenAI is not configured.' }, 503);

  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.owner, owner))).limit(1);
    if (!project) return json({ error: 'Not found.' }, 404);
    const [session] = await db.select().from(replaySessions)
      .where(and(eq(replaySessions.id, replayId), eq(replaySessions.projectId, projectId))).limit(1);
    if (!session) return json({ error: 'Not found.' }, 404);
    if (Date.parse(String(session.expiresAt)) < Date.now()) return json({ error: 'Replay expired.' }, 410);

    const [existing] = await db.select().from(replayInsights)
      .where(eq(replayInsights.sessionPk, session.id)).limit(1);
    if (
      existing?.status === 'ready'
      && existing.summaryText
      && Number(existing.insightVersion) >= INSIGHT_VERSION
    ) {
      return json({ insight: publicInsight(existing) });
    }

    const chunks = await db.select({
      seq: replayChunks.seq,
      objectKey: replayChunks.objectKey,
      byteSize: replayChunks.byteSize,
    })
      .from(replayChunks)
      .where(eq(replayChunks.sessionPk, session.id))
      .orderBy(asc(replayChunks.seq));
    const usable = chunks.filter((chunk) => Number(chunk.byteSize) >= 8);
    if (!usable.length || !session.hasFullSnapshot || Number(session.bytes) < 1_000) {
      return json({ error: 'Replay is not ready to summarize.' }, 409);
    }

    const visitRows = await db.select({
      path: visits.path,
      referrer: visits.referrer,
      device: visits.device,
      dwellMs: visits.dwellMs,
      seenAt: visits.seenAt,
    })
      .from(visits)
      .where(and(
        eq(visits.projectId, projectId),
        eq(visits.visitorId, session.visitorId),
        eq(visits.sessionId, session.sessionId),
      ))
      .orderBy(asc(visits.seenAt))
      .limit(50);

    const [identity] = await db.select({
      email: identities.email,
      name: identities.name,
    })
      .from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, session.visitorId)))
      .limit(1);

    await db.insert(replayInsights).values({
      sessionPk: session.id,
      status: 'pending',
      insightVersion: INSIGHT_VERSION,
      error: null,
    }).onConflictDoUpdate({
      target: replayInsights.sessionPk,
      set: { status: 'pending', insightVersion: INSIGHT_VERSION, error: null },
    });

    try {
      const pages = visitRows.length
        ? visitRows.map((row) => ({ path: row.path || '/', dwellMs: Number(row.dwellMs) || 0 }))
        : [{ path: '/', dwellMs: 0 }];
      const evidence = await extractReplayEvidence({
        objectKeys: usable.map((chunk) => chunk.objectKey),
        device: visitRows.find((row) => row.device === 'phone')?.device
          || visitRows.find((row) => row.device === 'monitor')?.device
          || 'monitor',
        referrer: visitRows[0]?.referrer || '(direct)',
        pages,
        hasEmail: Boolean(identity?.email),
        hasName: Boolean(identity?.name),
      });

      const generated = await generateReplayInsight(evidence);
      const [saved] = await db.insert(replayInsights).values({
        sessionPk: session.id,
        status: 'ready',
        insightVersion: generated.insightVersion,
        summaryText: generated.summaryText,
        outcome: generated.outcome,
        friction: generated.friction,
        worthWatching: generated.worthWatching,
        primaryInterest: generated.primaryInterest,
        emailReady: generated.emailReady,
        emailReadyConfidence: generated.emailReadyConfidence,
        stage: generated.stage,
        intent: generated.intent,
        highlightsJson: generated.highlights,
        emailHooksJson: generated.emailHooks,
        decisionsJson: generated.decisionsJson,
        model: generated.model,
        generatedAt: new Date(),
        error: null,
      }).onConflictDoUpdate({
        target: replayInsights.sessionPk,
        set: {
          status: 'ready',
          insightVersion: generated.insightVersion,
          summaryText: generated.summaryText,
          outcome: generated.outcome,
          friction: generated.friction,
          worthWatching: generated.worthWatching,
          primaryInterest: generated.primaryInterest,
          emailReady: generated.emailReady,
          emailReadyConfidence: generated.emailReadyConfidence,
          stage: generated.stage,
          intent: generated.intent,
          highlightsJson: generated.highlights,
          emailHooksJson: generated.emailHooks,
          decisionsJson: generated.decisionsJson,
          model: generated.model,
          generatedAt: new Date(),
          error: null,
        },
      }).returning();
      return json({ insight: publicInsight(saved) });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'Unable to generate summary';
      console.error('replay summarize failed', error);
      await db.insert(replayInsights).values({
        sessionPk: session.id,
        status: 'failed',
        insightVersion: INSIGHT_VERSION,
        error: message,
      }).onConflictDoUpdate({
        target: replayInsights.sessionPk,
        set: { status: 'failed', insightVersion: INSIGHT_VERSION, error: message },
      });
      return json({ error: message, insight: publicInsight({
        status: 'failed',
        summaryText: null,
        outcome: null,
        friction: null,
        worthWatching: null,
        primaryInterest: null,
        error: message,
      }) }, 502);
    }
  });
}

async function summarizeVisitor(request: Request, env: Env, projectId: string, visitorKey: string) {
  if (!uuid.test(projectId) || !visitorId.test(visitorKey)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to summarize visitors.' }, 401);
  if (!openaiConfigured()) return json({ error: 'OpenAI is not configured.' }, 503);

  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.owner, owner))).limit(1);
    if (!project) return json({ error: 'Not found.' }, 404);

    const [identity] = await db.select({
      email: identities.email,
      name: identities.name,
    })
      .from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorKey)))
      .limit(1);

    const visitRows = await db.select({
      dwellMs: visits.dwellMs,
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), eq(visits.visitorId, visitorKey)))
      .limit(200);

    const orderRows = await db.select({
      amountCents: purchases.amountCents,
    })
      .from(purchases)
      .where(and(eq(purchases.projectId, projectId), eq(purchases.visitorId, visitorKey)))
      .limit(40);

    const replayRows = await db.select({
      id: replaySessions.id,
      startedAt: replaySessions.startedAt,
      endedAt: replaySessions.endedAt,
    })
      .from(replaySessions)
      .where(and(eq(replaySessions.projectId, projectId), eq(replaySessions.visitorId, visitorKey)))
      .orderBy(desc(replaySessions.startedAt))
      .limit(40);

    const insightRows = replayRows.length
      ? await db.select().from(replayInsights)
        .where(inArray(replayInsights.sessionPk, replayRows.map((row) => row.id)))
      : [];
    const ready = insightRows.filter((row) => row.status === 'ready' && row.summaryText);
    if (!ready.length) {
      return json({ error: 'Analyze at least one session replay first.' }, 409);
    }

    const [existing] = await db.select().from(visitorInsights)
      .where(and(eq(visitorInsights.projectId, projectId), eq(visitorInsights.visitorId, visitorKey)))
      .limit(1);
    if (
      existing?.status === 'ready'
      && existing.summaryText
      && Number(existing.insightVersion) >= INSIGHT_VERSION
      && Number(existing.sourceSessionCount) >= ready.length
    ) {
      return json({ insight: publicVisitorInsight(existing) });
    }

    await db.insert(visitorInsights).values({
      projectId,
      visitorId: visitorKey,
      status: 'pending',
      insightVersion: INSIGHT_VERSION,
      error: null,
    }).onConflictDoUpdate({
      target: [visitorInsights.projectId, visitorInsights.visitorId],
      set: { status: 'pending', insightVersion: INSIGHT_VERSION, error: null },
    });

    try {
      const replayById = new Map(replayRows.map((row) => [row.id, row]));
      const generated = await generateVisitorInsight({
        hasEmail: Boolean(identity?.email),
        hasName: Boolean(identity?.name),
        totalDwellMs: visitRows.reduce((sum, row) => sum + (Number(row.dwellMs) || 0), 0),
        pageviews: visitRows.length,
        orders: orderRows.length,
        revenue: orderRows.reduce((sum, row) => sum + row.amountCents, 0) / 100,
        sessions: ready.map((row) => {
          const replay = replayById.get(row.sessionPk);
          const start = replay?.startedAt ? Date.parse(String(replay.startedAt)) : NaN;
          const end = replay?.endedAt ? Date.parse(String(replay.endedAt)) : NaN;
          const durationMs = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
          const published = publicInsight(row);
          return {
            outcome: published.outcome,
            primaryInterest: published.primaryInterest,
            summary: published.summary,
            emailReady: published.emailReady,
            emailReadyConfidence: published.emailReadyConfidence,
            stage: published.stage,
            intent: published.intent,
            highlights: published.highlights,
            emailHooks: published.emailHooks,
            durationMs,
          };
        }),
      });

      const [saved] = await db.insert(visitorInsights).values({
        projectId,
        visitorId: visitorKey,
        status: 'ready',
        insightVersion: generated.insightVersion,
        summaryText: generated.summaryText,
        emailReady: generated.emailReady,
        emailReadyConfidence: generated.emailReadyConfidence,
        interestsJson: generated.interests,
        emailHooksJson: generated.emailHooks,
        gapsJson: generated.gaps,
        decisionsJson: generated.decisionsJson,
        model: generated.model,
        sourceSessionCount: generated.sourceSessionCount,
        generatedAt: new Date(),
        error: null,
      }).onConflictDoUpdate({
        target: [visitorInsights.projectId, visitorInsights.visitorId],
        set: {
          status: 'ready',
          insightVersion: generated.insightVersion,
          summaryText: generated.summaryText,
          emailReady: generated.emailReady,
          emailReadyConfidence: generated.emailReadyConfidence,
          interestsJson: generated.interests,
          emailHooksJson: generated.emailHooks,
          gapsJson: generated.gaps,
          decisionsJson: generated.decisionsJson,
          model: generated.model,
          sourceSessionCount: generated.sourceSessionCount,
          generatedAt: new Date(),
          error: null,
        },
      }).returning();
      try {
        const hooks = Array.isArray(saved.emailHooksJson)
          ? saved.emailHooksJson.filter((item): item is string => typeof item === 'string')
          : [];
        await upsertOpportunityFromInsight(db, projectId, visitorKey, {
          emailReady: Boolean(saved.emailReady),
          summaryText: saved.summaryText,
          emailHooks: hooks,
        });
        await refreshCampaignSuggestions(db, projectId);
      } catch (hookError) {
        console.error('opportunity upsert failed', hookError);
      }
      return json({ insight: publicVisitorInsight(saved) });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'Unable to generate visitor insight';
      console.error('visitor summarize failed', error);
      await db.insert(visitorInsights).values({
        projectId,
        visitorId: visitorKey,
        status: 'failed',
        insightVersion: INSIGHT_VERSION,
        error: message,
      }).onConflictDoUpdate({
        target: [visitorInsights.projectId, visitorInsights.visitorId],
        set: { status: 'failed', insightVersion: INSIGHT_VERSION, error: message },
      });
      return json({ error: message, insight: publicVisitorInsight({
        status: 'failed',
        summaryText: null,
        emailReady: null,
        emailReadyConfidence: null,
        error: message,
      }) }, 502);
    }
  });
}

async function getReplayChunk(request: Request, env: Env, projectId: string, replayId: string, seqRaw: string) {
  if (!uuid.test(projectId) || !uuid.test(replayId)) return json({ error: 'Not found.' }, 404);
  const seq = Number(seqRaw);
  if (!Number.isInteger(seq) || seq < 0) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view replays.' }, 401);
  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects).where(and(eq(projects.id, projectId), eq(projects.owner, owner))).limit(1);
    if (!project) return json({ error: 'Not found.' }, 404);
    const [session] = await db.select().from(replaySessions)
      .where(and(eq(replaySessions.id, replayId), eq(replaySessions.projectId, projectId))).limit(1);
    if (!session) return json({ error: 'Not found.' }, 404);
    if (Date.parse(String(session.expiresAt)) < Date.now()) return json({ error: 'Replay expired.' }, 410);
    const [chunk] = await db.select().from(replayChunks)
      .where(and(eq(replayChunks.sessionPk, session.id), eq(replayChunks.seq, seq))).limit(1);
    if (!chunk) return json({ error: 'Not found.' }, 404);
    try {
      const body = await getObject(chunk.objectKey);
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error) {
      console.error('replay chunk read failed', error);
      return json({ error: 'Chunk unavailable.' }, 502);
    }
  });
}

async function patchProject(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to update settings.' }, 401);
  const raw = await readText(request, 2048);
  let body: { replayEnabled?: unknown } | null;
  try { body = raw === null ? null : JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (typeof body?.replayEnabled !== 'boolean') return json({ error: 'replayEnabled required.' }, 400);
  if (body.replayEnabled && !objectStoreConfigured()) {
    return json({ error: 'Replay storage is not configured on this server.' }, 400);
  }
  return withDatabase(env, async (db) => {
    const [project] = await db.update(projects)
      .set({ replayEnabled: body!.replayEnabled as boolean })
      .where(and(eq(projects.id, projectId), eq(projects.owner, owner)))
      .returning(projectFields);
    if (!project) return json({ error: 'Not found.' }, 404);
    return json({ project, storageReady: objectStoreConfigured() });
  });
}

async function ownedProject(db: NodePgDatabase, projectId: string, owner: string) {
  const [project] = await db.select({ id: projects.id, origin: projects.origin })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.owner, owner)))
    .limit(1);
  return project || null;
}

async function getBrand(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view brand knowledge.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const brand = await loadBrand(db, projectId);
    return json({ brand, importReady: brandImportReady() });
  });
}

async function putBrand(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to update brand knowledge.' }, 401);
  const raw = await readText(request, 400_000);
  if (raw === null) return json({ error: 'Brand payload too large.' }, 413);
  let body: { brand?: StoredBrand } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body?.brand || typeof body.brand !== 'object') return json({ error: 'brand required.' }, 400);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const next = { ...emptyStoredBrand(), ...body!.brand };
    await saveBrand(db, projectId, next);
    return json({ brand: next });
  });
}

async function postBrandImport(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to import brand knowledge.' }, 401);
  if (!brandImportReady()) {
    return json({
      error: !firecrawlConfigured()
        ? 'Firecrawl is not configured on this server.'
        : 'OpenAI is not configured on this server.',
    }, 400);
  }
  try {
    const brand = await withDatabase(env, (db) => importBrandFromSite(db, projectId, owner));
    return json({ brand });
  } catch (error) {
    console.error('brand import failed', error);
    const message = error instanceof Error ? error.message : 'Brand import failed.';
    return json({ error: message.slice(0, 240) }, 502);
  }
}

async function getOpportunities(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view opportunities.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const opportunities = await listOpportunities(db, projectId);
    return json({ opportunities });
  });
}

async function patchOpportunityRoute(request: Request, env: Env, projectId: string, opportunityId: string) {
  if (!uuid.test(projectId) || !uuid.test(opportunityId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to update opportunities.' }, 401);
  const raw = await readText(request, 4_000);
  if (raw === null) return json({ error: 'Payload too large.' }, 413);
  let body: { status?: string } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body?.status) return json({ error: 'status required.' }, 400);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const row = await patchOpportunity(db, projectId, opportunityId, body!.status!);
      if (!row) return json({ error: 'Not found.' }, 404);
      return json({ opportunity: row });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid status' }, 400);
    }
  });
}

async function draftOpportunityRoute(request: Request, env: Env, projectId: string, opportunityId: string) {
  if (!uuid.test(projectId) || !uuid.test(opportunityId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to draft.' }, 401);
  if (!openaiConfigured()) return json({ error: 'OpenAI is not configured.' }, 503);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const result = await draftOpportunityEmail(db, projectId, opportunityId);
      return json({
        draft: result.draft,
        page: result.page,
        opportunity: {
          id: result.opportunity?.id,
          status: result.opportunity?.status,
          email: result.opportunity?.email,
          name: result.opportunity?.name,
          visitorId: result.opportunity?.visitorId,
        },
      });
    } catch (error) {
      console.error('opportunity draft failed', error);
      return json({ error: error instanceof Error ? error.message.slice(0, 240) : 'Draft failed' }, 502);
    }
  });
}

async function saveOpportunityDraftRoute(request: Request, env: Env, projectId: string, opportunityId: string) {
  if (!uuid.test(projectId) || !uuid.test(opportunityId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to save drafts.' }, 401);
  const raw = await readText(request, 200_000);
  if (raw === null) return json({ error: 'Payload too large.' }, 413);
  let body: { draft?: Record<string, unknown>; page?: Record<string, unknown> } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body?.draft || !body?.page) return json({ error: 'draft and page required.' }, 400);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const row = await saveOpportunityDraft(db, projectId, opportunityId, body!.draft as never, body!.page as never);
    if (!row) return json({ error: 'Not found.' }, 404);
    return json({ ok: true, status: row.status });
  });
}

async function sendOpportunityRoute(request: Request, env: Env, projectId: string, opportunityId: string) {
  if (!uuid.test(projectId) || !uuid.test(opportunityId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to send.' }, 401);
  const providers = mailProvidersAvailable();
  if (!providers.ses && !providers.resend) return json({ error: 'Email sending is not configured yet.' }, 503);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const result = await sendOpportunityEmail(db, projectId, opportunityId);
      return json({ message: result.message, tracking: result.tracking, from: result.from });
    } catch (error) {
      console.error('opportunity send failed', error);
      return json({ error: error instanceof Error ? error.message.slice(0, 240) : 'Send failed' }, 502);
    }
  });
}

async function getSendingRoute(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view sending.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const sending = await getProjectSending(db, projectId);
    return json({ sending });
  });
}

async function putSendingRoute(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to update sending.' }, 401);
  const raw = await readText(request, 8_000);
  if (raw === null) return json({ error: 'Payload too large.' }, 413);
  let body: {
    fromName?: string;
    fromEmail?: string;
    domain?: string;
    provider?: 'ses' | 'resend';
    startVerify?: boolean;
  } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const sending = await upsertProjectSending(db, projectId, body || {});
      return json({ sending });
    } catch (error) {
      console.error('sending update failed', error);
      return json({ error: error instanceof Error ? error.message.slice(0, 240) : 'Update failed' }, 400);
    }
  });
}

async function checkSendingRoute(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to check DNS.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const sending = await checkProjectSending(db, projectId);
      return json({ sending });
    } catch (error) {
      console.error('sending check failed', error);
      return json({ error: error instanceof Error ? error.message.slice(0, 240) : 'Check failed' }, 502);
    }
  });
}

async function getCampaignSuggestions(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view suggestions.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    await refreshCampaignSuggestions(db, projectId);
    const suggestions = await listCampaignSuggestions(db, projectId);
    return json({ suggestions });
  });
}

async function patchCampaignSuggestionRoute(request: Request, env: Env, projectId: string, suggestionId: string) {
  if (!uuid.test(projectId) || !uuid.test(suggestionId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to update suggestions.' }, 401);
  const raw = await readText(request, 4_000);
  if (raw === null) return json({ error: 'Payload too large.' }, 413);
  let body: { status?: string } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body?.status) return json({ error: 'status required.' }, 400);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    try {
      const row = await patchCampaignSuggestion(db, projectId, suggestionId, body!.status!);
      if (!row) return json({ error: 'Not found.' }, 404);
      return json({ suggestion: row });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid status' }, 400);
    }
  });
}

async function getEmailContextRoute(request: Request, env: Env, projectId: string, visitorKey: string) {
  if (!uuid.test(projectId) || !visitorId.test(visitorKey)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const context = await loadEmailContext(db, projectId, visitorKey);
    return json({ context });
  });
}

async function getCampaigns(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view campaigns.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    return json({ campaigns: await listCampaigns(db, projectId), imageStorage: imageStorageReady() });
  });
}

async function putCampaign(request: Request, env: Env, projectId: string, campaignId: string) {
  if (!uuid.test(projectId) || !CAMPAIGN_ID.test(campaignId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to save campaigns.' }, 401);
  const raw = await readText(request, 380_000);
  if (raw === null) return json({ error: 'This email is too big to save. Use fewer or smaller images.' }, 413);
  let body: { campaign?: unknown } | null;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    const error = await saveCampaign(db, projectId, campaignId, body?.campaign);
    return error ? json({ error }, error === 'Not found.' ? 404 : 400) : json({ ok: true });
  });
}

async function removeCampaign(request: Request, env: Env, projectId: string, campaignId: string) {
  if (!uuid.test(projectId) || !CAMPAIGN_ID.test(campaignId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to delete campaigns.' }, 401);
  return withDatabase(env, async (db) => {
    if (!(await ownedProject(db, projectId, owner))) return json({ error: 'Not found.' }, 404);
    await deleteCampaign(db, projectId, campaignId);
    return json({ ok: true });
  });
}

async function postDescribe(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in first.' }, 401);
  const raw = await readText(request, 2000);
  let text = '';
  try { text = String((JSON.parse(raw ?? '{}') as { text?: unknown }).text ?? ''); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const owned = await withDatabase(env, (db) => ownedProject(db, projectId, owner));
  if (!owned) return json({ error: 'Not found.' }, 404);
  return json(await describeTrigger(text));
}

async function postAsset(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to upload images.' }, 401);
  if (!imageStorageReady()) return json({ error: 'Image storage isn’t set up on this server.' }, 503);
  const owned = await withDatabase(env, (db) => ownedProject(db, projectId, owner));
  if (!owned) return json({ error: 'Not found.' }, 404);
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return json({ error: 'Up to 5 MB.' }, 413);
  try {
    return json({ url: await storeImage(projectId, request.headers.get('content-type') ?? '', bytes) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload failed.' }, 400);
  }
}

// One app process serves the VPS. Signals only invalidate; the authenticated
// snapshot remains the source of truth on reconnect or across app restarts.
function openLiveStream(projectId: string) {
  const listeners = liveListeners.get(projectId) ?? new Set<() => void>();
  if (listeners.size >= 20 || (!liveListeners.has(projectId) && liveListeners.size >= 200)) {
    return json({ error: 'Live stream busy.' }, 503);
  }
  liveListeners.set(projectId, listeners);
  let cleanup = () => {};
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      function write(value: string) {
        if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(value));
      }
      const notify = () => write('event: activity\ndata: 1\n\n');
      const keepalive = setInterval(() => write(': keepalive\n\n'), 12000);
      // Reauthorize periodically, and let rolling restarts drain open connections.
      const expire = setTimeout(() => { cleanup(); controller.close(); }, 55000);
      cleanup = () => {
        clearInterval(keepalive);
        clearTimeout(expire);
        listeners.delete(notify);
        if (!listeners.size) liveListeners.delete(projectId);
      };
      listeners.add(notify);
      write('retry: 1500\nevent: ready\ndata: 1\n\n');
    },
    cancel() { cleanup(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform' } });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    try {
      const replayChunkMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/replays\/([0-9a-f-]{36})\/chunks\/(\d+)$/i);
      if (replayChunkMatch) {
        if (request.method === 'GET') {
          return await getReplayChunk(request, env, replayChunkMatch[1], replayChunkMatch[2], replayChunkMatch[3]);
        }
        return json({ error: 'Method not allowed.' }, 405);
      }
      const replaySummaryMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/replays\/([0-9a-f-]{36})\/summary$/i);
      if (replaySummaryMatch) {
        if (request.method === 'POST') {
          return await summarizeReplay(request, env, replaySummaryMatch[1], replaySummaryMatch[2]);
        }
        return json({ error: 'Method not allowed.' }, 405);
      }
      const replayMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/replays\/([0-9a-f-]{36})$/i);
      if (replayMatch) {
        if (request.method === 'GET') return await getReplay(request, env, replayMatch[1], replayMatch[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const visitorInsightMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/visitors\/([A-Za-z0-9_-]{8,80})\/insight$/i);
      if (visitorInsightMatch) {
        if (request.method === 'POST') {
          return await summarizeVisitor(request, env, visitorInsightMatch[1], visitorInsightMatch[2]);
        }
        return json({ error: 'Method not allowed.' }, 405);
      }
      const profileMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/visitors\/([A-Za-z0-9_-]{8,80})$/i);
      if (profileMatch) {
        if (request.method === 'GET') return await visitorProfile(request, env, profileMatch[1], profileMatch[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const brandImportMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/brand\/import$/i);
      if (brandImportMatch) {
        if (request.method === 'POST') return await postBrandImport(request, env, brandImportMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const describeMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/campaigns\/describe$/i);
      if (describeMatch) {
        if (request.method === 'POST') return await postDescribe(request, env, describeMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const campaignMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/campaigns(?:\/([a-z0-9-]+))?$/i);
      if (campaignMatch) {
        if (!campaignMatch[2] && request.method === 'GET') return await getCampaigns(request, env, campaignMatch[1]);
        if (campaignMatch[2] && request.method === 'PUT') return await putCampaign(request, env, campaignMatch[1], campaignMatch[2]);
        if (campaignMatch[2] && request.method === 'DELETE') return await removeCampaign(request, env, campaignMatch[1], campaignMatch[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const assetMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/assets$/i);
      if (assetMatch) {
        if (request.method === 'POST') return await postAsset(request, env, assetMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const brandMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/brand$/i);
      if (brandMatch) {
        if (request.method === 'GET') return await getBrand(request, env, brandMatch[1]);
        if (request.method === 'PUT') return await putBrand(request, env, brandMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const opportunityDraft = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/opportunities\/([0-9a-f-]{36})\/draft$/i);
      if (opportunityDraft) {
        if (request.method === 'POST') return await draftOpportunityRoute(request, env, opportunityDraft[1], opportunityDraft[2]);
        if (request.method === 'PUT') return await saveOpportunityDraftRoute(request, env, opportunityDraft[1], opportunityDraft[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const opportunitySend = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/opportunities\/([0-9a-f-]{36})\/send$/i);
      if (opportunitySend) {
        if (request.method === 'POST') return await sendOpportunityRoute(request, env, opportunitySend[1], opportunitySend[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const sendingCheck = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/sending\/check$/i);
      if (sendingCheck) {
        if (request.method === 'POST') return await checkSendingRoute(request, env, sendingCheck[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const sendingMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/sending$/i);
      if (sendingMatch) {
        if (request.method === 'GET') return await getSendingRoute(request, env, sendingMatch[1]);
        if (request.method === 'PUT') return await putSendingRoute(request, env, sendingMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const opportunityOne = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/opportunities\/([0-9a-f-]{36})$/i);
      if (opportunityOne) {
        if (request.method === 'PATCH') return await patchOpportunityRoute(request, env, opportunityOne[1], opportunityOne[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const opportunitiesMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/opportunities$/i);
      if (opportunitiesMatch) {
        if (request.method === 'GET') return await getOpportunities(request, env, opportunitiesMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const suggestionOne = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/campaign-suggestions\/([0-9a-f-]{36})$/i);
      if (suggestionOne) {
        if (request.method === 'PATCH') return await patchCampaignSuggestionRoute(request, env, suggestionOne[1], suggestionOne[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const suggestionsMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/campaign-suggestions$/i);
      if (suggestionsMatch) {
        if (request.method === 'GET') return await getCampaignSuggestions(request, env, suggestionsMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const emailContextMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/visitors\/([A-Za-z0-9_-]{8,80})\/email-context$/i);
      if (emailContextMatch) {
        if (request.method === 'GET') return await getEmailContextRoute(request, env, emailContextMatch[1], emailContextMatch[2]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const projectMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/i);
      if (projectMatch) {
        if (request.method === 'PATCH') return await patchProject(request, env, projectMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      const liveMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/live(\/stream)?$/i);
      if (liveMatch) {
        if (request.method === 'GET') return await liveFeed(request, env, liveMatch[1], Boolean(liveMatch[2]));
        return json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/api/projects') {
        if (request.method === 'GET') return await listProjects(request, env);
        if (request.method === 'POST') return await createProject(request, env, url);
        return json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/v1/collect/config') {
        if (request.method === 'GET') return await collectConfig(request, env);
        return new Response(null, { status: 405 });
      }
      if (url.pathname === '/v1/collect/install') {
        if (request.method === 'POST') return await receiveInstall(request, env);
        return new Response(null, { status: 405 });
      }
      const collectCors = () => {
        const origin = request.headers.get('Origin');
        if (!origin || origin === 'null') return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            ...cors(origin),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Max-Age': '86400',
          },
        });
      };
      if (url.pathname === '/v1/collect/event') {
        if (request.method === 'OPTIONS') {
          const origin = request.headers.get('Origin');
          if (!origin || origin === 'null') return new Response(null, { status: 403 });
          return new Response(null, {
            status: 204,
            headers: {
              ...cors(origin),
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              // text/plain covers sendBeacon leave pings; application/json covers fetch.
              'Access-Control-Allow-Headers': 'content-type',
              'Access-Control-Max-Age': '86400',
            },
          });
        }
        if (request.method === 'POST') return await receiveEvent(request, env);
        return new Response(null, { status: 405 });
      }
      if (url.pathname === '/v1/collect/replay-chunks') {
        if (request.method === 'OPTIONS') return collectCors();
        if (request.method === 'POST') return await receiveReplayChunk(request, env);
        return new Response(null, { status: 405 });
      }
      return json({ error: 'Page not found.' }, 404);
    } catch {
      return json({ error: 'Unable to reach the database. Try again in a moment.' }, 503);
    }
  },
};
