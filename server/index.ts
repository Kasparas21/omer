import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { auth, googleAuthEnabled, pool } from './auth';
import { objectStoreConfigured } from './object-store';
import { drizzle } from 'drizzle-orm/node-postgres';
import { brandImportReady } from './brand-import';
import { runBrandMonitoring } from './brand-monitor';
import { firecrawlConfigured } from './firecrawl';
import { openaiConfigured } from './replay-insight';
import projects from './projects';
import { loadImage } from './campaigns';
import { PIXEL_GIF, recordEmailEvent, suppressVisitor, verifyTrackingToken } from './email-tracking';
import { sesConfigured } from './ses';

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
// Email images upload on their own route with a bigger allowance; everything else under /api stays small.
const smallBodies = bodyLimit({ maxSize: 400_000 });
const imageBodies = bodyLimit({ maxSize: 5 * 1024 * 1024 + 1024 });
app.use('/api/*', (c, next) => (/^\/api\/projects\/[0-9a-f-]{36}\/assets$/i.test(c.req.path) ? imageBodies(c, next) : smallBodies(c, next)));
app.use('/v1/collect/replay-chunks', bodyLimit({ maxSize: 4_000_000 }));
app.use('/v1/collect/event', bodyLimit({ maxSize: 16384 }));
app.use('/v1/webhooks/*', bodyLimit({ maxSize: 512_000 }));
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
app.get('/api/config', (c) => c.json({
  googleAuth: googleAuthEnabled,
  replayStorage: objectStoreConfigured(),
  replayInsights: openaiConfigured(),
  firecrawl: firecrawlConfigured(),
  brandImport: brandImportReady(),
  ses: sesConfigured(),
  // BYO Resend / Postmark are always available in Settings (merchant pastes their key).
  resend: true,
  postmark: true,
}));
app.all('/api/projects', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id', (c) => projects.fetch(c.req.raw, env));
app.get('/api/projects/:id/live/stream', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/live', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/brand', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/brand/*', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/sending', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/sending/*', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/integrations', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/integrations/*', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/webhooks/stripe/:id', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/opportunities', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/opportunities/:oid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/opportunities/:oid/draft', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/opportunities/:oid/send', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/campaign-suggestions', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/campaign-suggestions/:sid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/campaigns', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/campaigns/*', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/assets', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/visitors/:vid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/visitors/:vid/insight', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/visitors/:vid/email-context', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid/summary', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/replays/:rid/chunks/:seq', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/install', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/event', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/config', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/replay-chunks', (c) => projects.fetch(c.req.raw, env));
// Email images: public (inboxes load them), named by random ids, and never change once stored.
app.get('/i/:project/:file', async (c) => {
  const image = await loadImage(`${c.req.param('project')}/${c.req.param('file')}`);
  if (!image) return c.text('Not found', 404);
  return c.body(new Uint8Array(image.body), 200, { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=31536000, immutable' });
});
// Email open pixel, click redirect, unsubscribe (signed tokens, no auth).
app.get('/t/o/:token', async (c) => {
  const raw = c.req.param('token');
  const parsed = verifyTrackingToken(raw);
  if (parsed?.purpose === 'open') {
    try {
      await recordEmailEvent(drizzle(pool), parsed.projectId, parsed.visitorId, 'email_open', parsed.messageId);
    } catch (error) {
      console.error('email open track failed', error);
    }
  }
  return c.body(new Uint8Array(PIXEL_GIF), 200, {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
});
app.get('/t/c/:token', async (c) => {
  const parsed = verifyTrackingToken(c.req.param('token'));
  const fallback = '/';
  if (parsed?.purpose === 'click') {
    try {
      await recordEmailEvent(drizzle(pool), parsed.projectId, parsed.visitorId, 'email_click', parsed.messageId);
    } catch (error) {
      console.error('email click track failed', error);
    }
    const dest = parsed.url && /^https?:\/\//i.test(parsed.url) ? parsed.url : fallback;
    return c.redirect(dest, 302);
  }
  return c.redirect(fallback, 302);
});
app.get('/t/u/:token', async (c) => {
  const parsed = verifyTrackingToken(c.req.param('token'));
  if (!parsed || parsed.purpose !== 'unsub') {
    return c.html('<!doctype html><title>Unsubscribe</title><p>This unsubscribe link is invalid or expired.</p>', 400);
  }
  const confirm = c.req.query('confirm');
  if (confirm === '1' || c.req.header('List-Unsubscribe') === 'One-Click' || c.req.method === 'POST') {
    try {
      await suppressVisitor(drizzle(pool), parsed.projectId, parsed.visitorId);
    } catch (error) {
      console.error('unsubscribe failed', error);
    }
    return c.html('<!doctype html><title>Unsubscribed</title><p style="font:16px system-ui;padding:40px">You’re unsubscribed. You won’t get another follow-up from this store via Omer.</p>');
  }
  const href = `?confirm=1`;
  return c.html(`<!doctype html><title>Unsubscribe</title><main style="font:16px system-ui;padding:40px;max-width:420px"><p>Stop follow-up emails from this store?</p><p><a href="${href}">Yes, unsubscribe</a></p></main>`);
});
app.post('/t/u/:token', async (c) => {
  const parsed = verifyTrackingToken(c.req.param('token'));
  if (!parsed || parsed.purpose !== 'unsub') return c.text('Invalid', 400);
  try {
    await suppressVisitor(drizzle(pool), parsed.projectId, parsed.visitorId);
  } catch (error) {
    console.error('unsubscribe post failed', error);
  }
  return c.text('OK');
});
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
const runMonitor = () => {
  if (!firecrawlConfigured()) return;
  void runBrandMonitoring(drizzle(pool))
    .catch((error) => console.error('brand monitoring failed', error));
};
const retentionTimer = setInterval(() => { prune(); pruneReplays(); runMonitor(); }, 60 * 60 * 1000);
retentionTimer.unref();
prune();
pruneReplays();
// First monitor pass a few minutes after boot so deploys are not blocked on Firecrawl.
setTimeout(runMonitor, 3 * 60 * 1000).unref();
process.on('SIGTERM', () => { server.close(async () => { await pool.end(); process.exit(0); }); });
