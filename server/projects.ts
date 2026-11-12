import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { localDemoPlace, placeFromRequest } from './geo';
import { dailyVisitors, dwell, pageViews, pathViews, projects, referrerViews, visits } from './schema';
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
const visitorId = /^[A-Za-z0-9_-]{8,80}$/;
const projectFields = {
  id: projects.id,
  name: projects.name,
  origin: projects.origin,
  writeKey: projects.writeKey,
  firstEventAt: projects.firstEventAt,
};

function json(data: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

function cors(origin: string) {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
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
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 300) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function cleanReferrer(value: unknown) {
  if (typeof value !== 'string' || value.length > 120) return '(direct)';
  const trimmed = value.trim().toLowerCase() || '(direct)';
  if (trimmed === '(direct)') return trimmed;
  if (!/^[a-z0-9.-]+$/.test(trimmed)) return '(direct)';
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
    pages: sql<{ path: string; count: number }[]>`coalesce((
      select json_agg(json_build_object('path', path, 'count', count) order by count desc)
      from (
        select ${pathViews.path} as path, sum(${pathViews.count})::float8 as count
        from ${pathViews}
        where ${pathViews.projectId} = ${projects.id}
          and ${pathViews.day} >= (now() at time zone 'UTC')::date - 29
        group by ${pathViews.path}
        order by count desc
        limit 8
      ) q
    ), '[]'::json)`,
  })
    .from(projects).where(eq(projects.owner, owner)).orderBy(desc(projects.createdAt)));
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

  const accepted = await withDatabase(env, (db) => db.update(projects)
    .set({ firstEventAt: sql`coalesce(${projects.firstEventAt}, now())` })
    .where(and(eq(projects.writeKey, writeKey), eq(projects.origin, origin)))
    .returning({ id: projects.id }));

  return accepted[0]
    ? new Response(null, { status: 204, headers: cors(origin) })
    : new Response(null, { status: 403 });
}

async function receiveEvent(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return new Response(null, { status: 403 });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.COLLECT_LIMIT.limit({ key: `${ip}:event` })).success) return new Response(null, { status: 429 });

  const raw = await readText(request, 1024);
  let body: { key?: unknown; type?: unknown; vid?: unknown; path?: unknown; ref?: unknown; ms?: unknown } | null;
  try { body = raw === null ? null : JSON.parse(raw); } catch { body = null; }
  const writeKey = typeof body?.key === 'string' ? body.key : '';
  const type = body?.type === 'pageview' || body?.type === 'dwell' ? body.type : null;
  const vid = typeof body?.vid === 'string' && visitorId.test(body.vid) ? body.vid : null;
  const path = cleanPath(body?.path);
  if (!uuid.test(writeKey) || !type || !vid || !path) return new Response(null, { status: 400 });

  const accepted = await withDatabase(env, (db) => db.transaction(async (tx) => {
    const [project] = await tx.update(projects)
      .set({ firstEventAt: sql`coalesce(${projects.firstEventAt}, now())` })
      .where(and(eq(projects.writeKey, writeKey), eq(projects.origin, origin)))
      .returning({ id: projects.id });
    if (!project) return false;
    const day = sql`(now() at time zone 'UTC')::date`;

    if (type === 'dwell') {
      const ms = typeof body?.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : 0;
      if (ms < 1000 || ms > 1_800_000) return true;
      await tx.insert(dwell)
        .values({ projectId: project.id, day, totalMs: ms, samples: 1 })
        .onConflictDoUpdate({
          target: [dwell.projectId, dwell.day],
          set: {
            totalMs: sql`${dwell.totalMs} + ${ms}`,
            samples: sql`${dwell.samples} + 1`,
          },
        });
      return true;
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
      path,
      referrer,
      cc: geo?.cc ?? null,
      city: geo?.city ?? null,
      place: geo?.place ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    });
    await tx.delete(visits).where(and(
      eq(visits.projectId, project.id),
      sql`${visits.seenAt} < now() - interval '7 days'`,
    ));
    return true;
  }));

  return accepted
    ? new Response(null, { status: 204, headers: cors(origin) })
    : new Response(null, { status: 403 });
}

async function liveFeed(request: Request, env: Env, projectId: string) {
  if (!uuid.test(projectId)) return json({ error: 'Project not found.' }, 404);
  const owner = await ownerID(request);
  if (!owner) return json({ error: 'Sign in to view live visitors.' }, 401);

  return withDatabase(env, async (db) => {
    const [project] = await db.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.owner, owner)))
      .limit(1);
    if (!project) return json({ error: 'Project not found.' }, 404);

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
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), gt(visits.seenAt, sql`now() - interval '24 hours'`)))
      .orderBy(desc(visits.seenAt))
      .limit(48);

    const [{ online }] = await db.select({
      online: sql<number>`count(distinct ${visits.visitorId})::int`,
    })
      .from(visits)
      .where(and(eq(visits.projectId, projectId), gt(visits.seenAt, sql`now() - interval '5 minutes'`)));

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

    return json({
      online: Number(online ?? 0),
      minutes,
      sources: sourceRows.map((row) => ({ name: row.name, count: Number(row.count) })),
      visits: recent.map((row) => ({
        id: row.id,
        seed: row.visitorId,
        path: row.path,
        referrer: row.referrer,
        cc: row.cc,
        city: row.city,
        place: row.place,
        lat: row.lat,
        lng: row.lng,
        seenAt: row.seenAt,
      })),
    });
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    try {
      const liveMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/live$/i);
      if (liveMatch) {
        if (request.method === 'GET') return await liveFeed(request, env, liveMatch[1]);
        return json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/api/projects') {
        if (request.method === 'GET') return await listProjects(request, env);
        if (request.method === 'POST') return await createProject(request, env, url);
        return json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/v1/collect/install') {
        if (request.method === 'POST') return await receiveInstall(request, env);
        return new Response(null, { status: 405 });
      }
      if (url.pathname === '/v1/collect/event') {
        if (request.method === 'OPTIONS') {
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
        }
        if (request.method === 'POST') return await receiveEvent(request, env);
        return new Response(null, { status: 405 });
      }
      return json({ error: 'Page not found.' }, 404);
    } catch {
      return json({ error: 'Unable to reach the database. Try again in a moment.' }, 503);
    }
  },
};
