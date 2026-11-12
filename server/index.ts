import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { auth, googleAuthEnabled, pool } from './auth';
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
const env = { ALLOW_LOCAL_SITES: process.env.ALLOW_LOCAL_SITES, CREATE_LIMIT: limiter(10), COLLECT_LIMIT: limiter(120) };
const app = new Hono();
app.use('/api/*', bodyLimit({ maxSize: 16384 }));
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
app.get('/api/config', (c) => c.json({ googleAuth: googleAuthEnabled }));
app.all('/api/projects', (c) => projects.fetch(c.req.raw, env));
app.all('/api/projects/:id/live', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/install', (c) => projects.fetch(c.req.raw, env));
app.all('/v1/collect/event', (c) => projects.fetch(c.req.raw, env));
app.get('/health', async (c) => { await pool.query('select 1'); return c.json({ status: 'ready' }); });
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
app.all('/v1/*', (c) => c.json({ error: 'Not found' }, 404));
app.get('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
app.onError((_error, c) => c.json({ error: 'Service unavailable. Try again.' }, 503));
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
process.on('SIGTERM', () => { server.close(async () => { await pool.end(); process.exit(0); }); });
