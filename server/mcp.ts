/* Omer's MCP server, so Claude, ChatGPT and Cursor can work with a store the way its owner does.

   POST /mcp                         MCP over Streamable HTTP (JSON-RPC 2.0), stateless
   /.well-known/oauth-*              discovery for connectors
   POST /oauth/register              dynamic client registration (Claude, ChatGPT register themselves)
   GET|POST /oauth/authorize         the owner signs in and approves the app
   POST /oauth/token                 authorization code + PKCE, and refresh
   GET|POST|DELETE /api/mcp/*        Settings: create and revoke API keys, list connected apps

   Two ways in: OAuth for Claude.ai and ChatGPT connectors, and personal API keys ("omk_…") for Cursor,
   Claude Code and anything that takes a header. Both resolve to the same owner, and every tool runs as
   that owner. */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { auth, appURL } from './auth';
import {
  bearerFrom, createApiKey, exchangeCode, getClient, issueCode, listAccess, refreshTokens, registerClient, revokeAccess, userFromToken,
} from './mcp-auth';
import { ArgError, INSTRUCTIONS, TOOLS, TOOLS_BY_NAME, type Caller } from './mcp-tools';
import { API_MARKDOWN, OPENAPI } from './openapi';

type Fetcher = (request: Request) => Promise<Response>;
type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

const SERVER = { name: 'omer', title: 'Omer', version: '1.0.0' };
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_RESULT_CHARS = 120_000;
export const MCP_URL = `${appURL.replace(/\/$/, '')}/mcp`;
const ISSUER = appURL.replace(/\/$/, '');
const METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource`;

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------- JSON-RPC
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });

function shorten(data: unknown) {
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
  return body.length > MAX_RESULT_CHARS ? `${body.slice(0, MAX_RESULT_CHARS)}\n…[truncated: ${body.length - MAX_RESULT_CHARS} more characters. Ask for something narrower.]` : body;
}

async function handleRpc(message: Rpc, call: Caller) {
  const { id, method, params } = message;
  if (message.jsonrpc !== '2.0' || typeof method !== 'string') return rpcError(id, -32600, 'Invalid request.');
  if (id === undefined) return null; // a notification (initialized, cancelled …): nothing to answer
  switch (method) {
    case 'initialize': {
      const wanted = typeof params?.protocolVersion === 'string' ? params.protocolVersion : '';
      return rpcResult(id, {
        protocolVersion: PROTOCOLS.includes(wanted) ? wanted : PROTOCOLS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
    case 'resources/list': return rpcResult(id, { resources: [] });
    case 'resources/templates/list': return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list': return rpcResult(id, { prompts: [] });
    case 'tools/call': {
      const tool = typeof params?.name === 'string' ? TOOLS_BY_NAME.get(params.name) : undefined;
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params?.name)}`);
      const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
      try {
        const { status, data } = await tool.run(args, call);
        const failed = status >= 400;
        const text = failed
          ? `Error ${status}: ${typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : shorten(data)}`
          : shorten(data);
        return rpcResult(id, { content: [{ type: 'text', text }], isError: failed });
      } catch (error) {
        const text = error instanceof ArgError ? error.message : 'The tool failed. Try again.';
        if (!(error instanceof ArgError)) console.error('mcp tool failed', tool.name, error instanceof Error ? error.message : error);
        return rpcResult(id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------- OAuth helpers
const CORS_OPEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

function redirectUriOk(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Desktop apps (Cursor, Claude, VS Code …) come back through their own scheme.
    return /^[a-z][a-z0-9+.-]{2,30}:$/.test(url.protocol) && !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:'].includes(url.protocol);
  } catch {
    return false;
  }
}

type AuthorizeParams = { clientId: string; redirectUri: string; state: string; challenge: string };

async function readAuthorizeParams(source: (key: string) => string | undefined) {
  const clientId = source('client_id') ?? '';
  const redirectUri = source('redirect_uri') ?? '';
  const challenge = source('code_challenge') ?? '';
  const client = await getClient(clientId);
  if (!client) return { error: 'This app is not registered with Omer. Remove and add the connection again.' } as const;
  if (!client.redirectUris.includes(redirectUri)) return { error: 'The app asked to return to an address it did not register.' } as const;
  if ((source('response_type') ?? 'code') !== 'code') return { error: 'Unsupported response type.' } as const;
  if (source('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return { error: 'The app did not send a valid PKCE challenge.' } as const;
  const state = (source('state') ?? '').slice(0, 500);
  return { client, params: { clientId, redirectUri, state, challenge } satisfies AuthorizeParams } as const;
}

function backTo(redirectUri: string, values: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(values)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

const PAGE_STYLE = `
:root{color-scheme:light dark;--bg:#f6f6f4;--card:#fff;--text:#16181d;--muted:#5b6472;--line:#e6e7ea;--accent:#2f6df6}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--text:#f2f3f5;--muted:#98a0ad;--line:#272b33;--accent:#6c9bff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px}
h1{font-size:22px;line-height:1.25;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}ul{margin:0 0 20px;padding-left:20px;color:var(--muted)}li{margin:4px 0}
.row{display:flex;gap:10px}.btn{flex:1;font:inherit;font-weight:600;padding:12px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);cursor:pointer;text-align:center;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.who{font-size:14px;color:var(--muted);margin-top:16px}b{color:var(--text)}`;

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`;
const pageHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };

export function createMcpApp(projectsFetch: Fetcher, limiter: Limiter) {
  const app = new Hono();
  const sessionUser = async (c: Context) => (await auth.api.getSession({ headers: c.req.raw.headers }))?.user ?? null;
  const ip = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local';

  // ---------- Discovery
  const resourceMeta = (c: Context) => c.json({
    resource: MCP_URL, authorization_servers: [ISSUER], bearer_methods_supported: ['header'], scopes_supported: ['omer'], resource_name: 'Omer',
  }, 200, CORS_OPEN);
  app.get('/.well-known/oauth-protected-resource', resourceMeta);
  app.get('/.well-known/oauth-protected-resource/*', resourceMeta);
  const serverMeta = (c: Context) => c.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['omer'],
  }, 200, CORS_OPEN);
  app.get('/.well-known/oauth-authorization-server', serverMeta);
  app.get('/.well-known/oauth-authorization-server/*', serverMeta);
  app.get('/.well-known/openid-configuration', serverMeta);
  app.options('/.well-known/*', (c) => c.body(null, 204, CORS_OPEN));

  // ---------- Dynamic client registration
  app.options('/oauth/register', (c) => c.body(null, 204, CORS_OPEN));
  app.post('/oauth/register', bodyLimit({ maxSize: 8_000 }), async (c) => {
    if (!(await limiter.limit({ key: `reg:${ip(c)}` })).success) return c.json({ error: 'temporarily_unavailable' }, 429, CORS_OPEN);
    const body = await c.req.json().catch(() => null) as { client_name?: unknown; redirect_uris?: unknown } | null;
    const uris = Array.isArray(body?.redirect_uris) ? body!.redirect_uris : [];
    if (!uris.length || uris.length > 10 || !uris.every(redirectUriOk)) {
      return c.json({ error: 'invalid_redirect_uri', error_description: 'Provide up to 10 https, localhost or app-scheme redirect URIs.' }, 400, CORS_OPEN);
    }
    const name = typeof body?.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : 'AI assistant';
    const clientId = await registerClient({ name, redirectUris: uris as string[] });
    return c.json({
      client_id: clientId, client_name: name.slice(0, 80), redirect_uris: uris, token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000),
    }, 201, CORS_OPEN);
  });

  // ---------- Authorize: the owner approves the app
  app.get('/oauth/authorize', async (c) => {
    const read = await readAuthorizeParams((k) => c.req.query(k));
    if ('error' in read) return c.html(page('Cannot connect', `<h1>Can’t connect this app</h1><p>${esc(String(read.error))}</p>`), 400, pageHeaders);
    const user = await sessionUser(c);
    if (!user) {
      return c.html(page('Sign in to Omer', `<h1>Sign in to continue</h1><p><b>${esc(read.client.name)}</b> wants to connect to your Omer account. Sign in to Omer first, then come back to this page.</p>
        <div class="row"><a class="btn primary" href="${esc(ISSUER)}/" target="_blank" rel="noopener">Sign in to Omer</a><a class="btn" href="">I’m signed in</a></div>`), 200, pageHeaders);
    }
    const p = read.params;
    return c.html(page('Connect to Omer', `<h1>Connect ${esc(read.client.name)} to Omer?</h1>
      <p>This lets <b>${esc(read.client.name)}</b> use your Omer account on your behalf. It will be able to:</p>
      <ul><li>Read your stores’ analytics, visitors, session replays and brand knowledge</li><li>Draft and edit emails and campaigns</li><li>Send emails to your customers and change sending and integration settings</li></ul>
      <form method="post" action="${esc(ISSUER)}/oauth/authorize">
        <input type="hidden" name="client_id" value="${esc(p.clientId)}"><input type="hidden" name="redirect_uri" value="${esc(p.redirectUri)}">
        <input type="hidden" name="state" value="${esc(p.state)}"><input type="hidden" name="code_challenge" value="${esc(p.challenge)}">
        <input type="hidden" name="code_challenge_method" value="S256">
        <div class="row"><button class="btn" name="decision" value="deny" type="submit">Cancel</button><button class="btn primary" name="decision" value="allow" type="submit">Allow</button></div>
      </form>
      <p class="who">Signed in as ${esc(user.email)}. You can disconnect it any time in Settings.</p>`), 200, pageHeaders);
  });

  app.post('/oauth/authorize', bodyLimit({ maxSize: 8_000 }), async (c) => {
    // Browser form post from our own page, with the owner's session cookie: refuse anything cross-site.
    if (c.req.header('origin') !== ISSUER) return c.html(page('Cannot connect', '<h1>Request blocked</h1><p>Start the connection again from your AI app.</p>'), 403, pageHeaders);
    const form = await c.req.parseBody();
    const read = await readAuthorizeParams((k) => (typeof form[k] === 'string' ? form[k] as string : undefined));
    if ('error' in read) return c.html(page('Cannot connect', `<h1>Can’t connect this app</h1><p>${esc(String(read.error))}</p>`), 400, pageHeaders);
    const user = await sessionUser(c);
    if (!user) return c.html(page('Sign in to Omer', '<h1>You’re signed out</h1><p>Sign in to Omer and start the connection again.</p>'), 401, pageHeaders);
    const p = read.params;
    if (form.decision !== 'allow') return c.redirect(backTo(p.redirectUri, { error: 'access_denied', state: p.state }), 302);
    const code = await issueCode({ userId: user.id, clientId: p.clientId, redirectUri: p.redirectUri, codeChallenge: p.challenge });
    return c.redirect(backTo(p.redirectUri, { code, state: p.state }), 302);
  });

  // ---------- Token
  app.options('/oauth/token', (c) => c.body(null, 204, CORS_OPEN));
  app.post('/oauth/token', bodyLimit({ maxSize: 8_000 }), async (c) => {
    if (!(await limiter.limit({ key: `tok:${ip(c)}` })).success) return c.json({ error: 'temporarily_unavailable' }, 429, CORS_OPEN);
    const noStore = { ...CORS_OPEN, 'Cache-Control': 'no-store', Pragma: 'no-cache' };
    const type = c.req.header('content-type') ?? '';
    const raw = type.includes('json') ? await c.req.json().catch(() => ({})) : await c.req.parseBody().catch(() => ({}));
    const field = (key: string) => (typeof (raw as Record<string, unknown>)[key] === 'string' ? (raw as Record<string, string>)[key] : '');
    const clientId = field('client_id');
    const result = field('grant_type') === 'authorization_code'
      ? await exchangeCode({ code: field('code'), clientId, redirectUri: field('redirect_uri'), verifier: field('code_verifier') })
      : field('grant_type') === 'refresh_token'
        ? await refreshTokens({ refreshToken: field('refresh_token'), clientId })
        : { ok: false as const, error: 'unsupported_grant_type' };
    return result.ok ? c.json(result.body, 200, noStore) : c.json({ error: result.error }, 400, noStore);
  });

  // ---------- The MCP endpoint
  app.options('/mcp', (c) => c.body(null, 204, CORS_OPEN));
  // No server-initiated stream: clients that probe with GET get a clean "use POST".
  app.get('/mcp', (c) => c.json({ error: 'Use POST for MCP requests.' }, 405, { ...CORS_OPEN, Allow: 'POST' }));
  app.delete('/mcp', (c) => c.body(null, 405, { ...CORS_OPEN, Allow: 'POST' }));
  app.post('/mcp', bodyLimit({ maxSize: 500_000 }), async (c) => {
    const token = bearerFrom(c.req.raw);
    const user = token ? await userFromToken(token) : null;
    if (!token || !user) {
      return c.json({ error: 'Authentication required.' }, 401, { ...CORS_OPEN, 'WWW-Authenticate': `Bearer realm="omer", resource_metadata="${METADATA_URL}"` });
    }
    if (!(await limiter.limit({ key: `mcp:${user}` })).success) return c.json(rpcError(null, -32000, 'Too many requests. Slow down.'), 429, CORS_OPEN);
    const call: Caller = async (method, path, body) => {
      const response = await projectsFetch(new Request(`${ISSUER}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, origin: ISSUER, 'content-type': 'application/json', 'cf-connecting-ip': ip(c) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }));
      const text = await response.text();
      let data: unknown = text;
      try { data = text ? JSON.parse(text) : null; } catch { /* plain text answer */ }
      return { status: response.status, data };
    };
    const payload = await c.req.json().catch(() => undefined) as Rpc | Rpc[] | undefined;
    if (payload === undefined) return c.json(rpcError(null, -32700, 'Parse error.'), 400, CORS_OPEN);
    if (Array.isArray(payload)) {
      if (!payload.length || payload.length > 20) return c.json(rpcError(null, -32600, 'Invalid batch.'), 400, CORS_OPEN);
      const out = (await Promise.all(payload.map((m) => handleRpc(m, call)))).filter((r) => r !== null);
      return out.length ? c.json(out, 200, CORS_OPEN) : c.body(null, 202, CORS_OPEN);
    }
    const reply = await handleRpc(payload, call);
    return reply ? c.json(reply, 200, CORS_OPEN) : c.body(null, 202, CORS_OPEN);
  });

  // ---------- Public API docs (no auth)
  app.get('/openapi.json', (c) => c.json(OPENAPI, 200, {
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  }));
  app.get('/docs/api.md', (c) => c.text(API_MARKDOWN, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  }));

  // ---------- Settings: keys and connected apps (signed-in session only; a token can never mint tokens)
  app.get('/api/mcp/access', async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: 'Sign in first.' }, 401);
    return c.json({
      endpoint: MCP_URL,
      apiBase: ISSUER,
      openapi: `${ISSUER}/openapi.json`,
      docs: `${ISSUER}/docs/api.md`,
      access: await listAccess(user.id),
    });
  });
  app.post('/api/mcp/keys', async (c) => {
    if (c.req.header('origin') !== ISSUER) return c.json({ error: 'Open the dashboard and try again.' }, 403);
    const user = await sessionUser(c);
    if (!user) return c.json({ error: 'Sign in first.' }, 401);
    const body = await c.req.json().catch(() => ({})) as { name?: unknown };
    try {
      return c.json(await createApiKey(user.id, typeof body.name === 'string' ? body.name : ''), 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Unable to create a key.' }, 400);
    }
  });
  app.delete('/api/mcp/access/:id', async (c) => {
    if (c.req.header('origin') !== ISSUER) return c.json({ error: 'Open the dashboard and try again.' }, 403);
    const user = await sessionUser(c);
    if (!user) return c.json({ error: 'Sign in first.' }, 401);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !(await revokeAccess(user.id, id))) return c.json({ error: 'Not found.' }, 404);
    return c.json({ ok: true });
  });

  return app;
}
