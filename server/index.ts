import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { auth, googleAuthEnabled, pool } from './auth';
import { objectStoreConfigured } from './object-store';
import { openaiConfigured } from './replay-insight';
import projects from './projects';

// Single-server demo limits; bounded memory, no visitor IP persisted in project data.
function limiter(max: number) {
  const entries = new Map<string, { count: number; until: number }>();
  return { async limit({ key }: { key: string }) {
    const now = Date.now();
    for (const [ip, value] of entries) if (value.until <= now) entries.delete(ip);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= 10000) return { success: false };
      entry = { count: 0, until: now + 60000 }; entries.set(key, entry);
    }
    return { success: ++entry.count <= max };
  } };
}
const env = { ALLOW_LOCAL_SITES: process.env.ALLOW_LOCAL_SITES, CREATE_LIMIT: limiter(10), COLLECT_LIMIT: limiter(600) };
const app = new Hono();
app.use('/api/*', bodyLimit({ maxSize: 16384 }));
app.use('/v1/collect/replay-chunks', bodyLimit({ maxSize: 4_000_000 }));
app.use('/v1/collect/event', bodyLimit({ maxSize: 16384 }));
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
app.get('/api/config', (c) => c.json({
  googleAuth: googleAuthEnabled,
  replayStorage: objectStoreConfigured(),
  replayInsights: openaiConfigured(),
}));
app.all('/api/projects', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id', (c) => projects.fetch(c.req.raw, env));
app.get('/api/projects/:id/live/stream', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/live', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/visitors/:vid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid/summary', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid/chunks/:seq', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/install', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/event', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/config', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/replay-chunks', (c) => projects.fetch(c.req.raw, env));
app.get('/health', async (c) => { await pool.query('select 1'); return c.json({ status: 'ready' }); });
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
app.all('/v1/*', (c) => c.json({ error: 'Not found' }, 404));
app.get('/tracker.js', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Cloudflare-CDN-Cache-Control', 'no-store');
  await next();
});
// Built files carry a content hash in their name, so they never change: cache them for good. The page
// itself must always be re-checked, or a tab opened before a deploy keeps loading the old build.
app.get('/assets/*', async (c, next) => {
  await next();
  if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
});
app.get('*', async (c, next) => {
  await next();
  if ((c.res.headers.get('content-type') ?? '').includes('text/html')) {
    c.header('Cache-Control', 'no-cache');
    c.header('Cloudflare-CDN-Cache-Control', 'no-store');
  }
});
app.get('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
app.onError((_error, c) => c.json({ error: 'Service unavailable. Try again.' }, 503));
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
// Delete expired visit records in the background instead of on every page view.
const prune = () => void pool.query("delete from project_visits where seen_at < now() - interval '7 days'")
  .catch(() => console.error('Unable to prune expired visit records'));
const pruneReplays = () => void pool.query(`
  with expired as (
    select id from project_replay_sessions where expires_at < now() and status <> 'expired'
  ), marked as (
    update project_replay_sessions set status = 'expired' where id in (select id from expired) returning id
  )
  select count(*) from marked
`).catch(() => console.error('Unable to mark expired replays'));
const retentionTimer = setInterval(() => { prune(); pruneReplays(); }, 60 * 60 * 1000);
retentionTimer.unref();
prune();
pruneReplays();
process.on('SIGTERM', () => { server.close(async () => { await pool.end(); process.exit(0); }); });
