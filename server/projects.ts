import { and, desc, eq, isNull } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { projects } from './schema';
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
  const records = await withDatabase(env, (db) => db.select(projectFields)
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

async function receiveFirstEvent(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return new Response(null, { status: 403 });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.COLLECT_LIMIT.limit({ key: ip })).success) return new Response(null, { status: 429 });
  const writeKey = await readText(request, 36);
  if (!writeKey || !uuid.test(writeKey)) return new Response(null, { status: 400 });

  const accepted = await withDatabase(env, async (db) => {
    const match = and(eq(projects.writeKey, writeKey), eq(projects.origin, origin));
    const updated = await db.update(projects).set({ firstEventAt: new Date() })
      .where(and(match, isNull(projects.firstEventAt))).returning({ id: projects.id });
    if (updated.length) return true;
    const [existing] = await db.select({ id: projects.id }).from(projects).where(match).limit(1);
    return Boolean(existing);
  });

  return accepted
    ? new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store' } })
    : new Response(null, { status: 403 });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/projects') {
        if (request.method === 'GET') return await listProjects(request, env);
        if (request.method === 'POST') return await createProject(request, env, url);
        return json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/v1/collect/install') {
        if (request.method === 'POST') return await receiveFirstEvent(request, env);
        return new Response(null, { status: 405 });
      }
      return json({ error: 'Page not found.' }, 404);
    } catch {
      return json({ error: 'Unable to reach the database. Try again in a moment.' }, 503);
    }
  },
};
