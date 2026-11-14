/* Who is calling the MCP server: personal API keys ("omk_…", pasted into Cursor / Claude Code) and OAuth
   tokens (what Claude and ChatGPT connectors get after the owner approves them). Only SHA-256 hashes are
   stored, so a database leak never hands out working keys. */
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from './auth';
import { mcpOauthClients, mcpOauthCodes, mcpTokens } from './schema';

const db = () => drizzle(pool);
export const ACCESS_TTL_MS = 8 * 3_600_000;
export const REFRESH_TTL_MS = 90 * 86_400_000;
const MAX_API_KEYS = 20;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

/** The token in an `Authorization: Bearer …` header, if any. */
export function bearerFrom(request: Request) {
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,300})$/i.exec(request.headers.get('authorization') ?? '');
  return match ? match[1] : null;
}

/** The user a bearer token belongs to, or null (unknown, expired, or a refresh token). */
export async function userFromToken(token: string): Promise<string | null> {
  if (!/^(omk|omo)_/.test(token)) return null;
  const [row] = await db().select({ id: mcpTokens.id, userId: mcpTokens.userId, expiresAt: mcpTokens.expiresAt, lastUsedAt: mcpTokens.lastUsedAt })
    .from(mcpTokens).where(and(eq(mcpTokens.tokenHash, sha256(token)), inArray(mcpTokens.kind, ['api', 'oauth']))).limit(1);
  if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return null;
  // Touch at most once a minute: tokens are used on every tool call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    void db().update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, row.id)).catch(() => undefined);
  }
  return row.userId;
}

export async function userFromRequest(request: Request) {
  const token = bearerFrom(request);
  return token ? userFromToken(token) : null;
}

// ---------- Personal API keys (Settings → Integrations)
export async function createApiKey(userId: string, name: string) {
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), eq(mcpTokens.kind, 'api')));
  if (count >= MAX_API_KEYS) throw new Error(`Up to ${MAX_API_KEYS} API keys. Delete one you no longer use.`);
  const token = secret('omk');
  const [row] = await db().insert(mcpTokens).values({
    userId, kind: 'api', name: name.trim().slice(0, 60) || 'API key', prefix: token.slice(0, 10), tokenHash: sha256(token),
  }).returning({ id: mcpTokens.id, name: mcpTokens.name, prefix: mcpTokens.prefix, createdAt: mcpTokens.createdAt });
  return { token, ...row };
}

/** API keys plus connected apps (one row per approved client), newest first. Never returns secrets. */
export async function listAccess(userId: string) {
  const rows = await db().select({
    id: mcpTokens.id, kind: mcpTokens.kind, name: mcpTokens.name, prefix: mcpTokens.prefix, clientId: mcpTokens.clientId,
    lastUsedAt: mcpTokens.lastUsedAt, createdAt: mcpTokens.createdAt,
  }).from(mcpTokens).where(and(eq(mcpTokens.userId, userId), inArray(mcpTokens.kind, ['api', 'refresh']))).orderBy(desc(mcpTokens.createdAt));
  return rows.map((r) => ({ ...r, type: r.kind === 'api' ? 'key' as const : 'app' as const }));
}

/** Revokes an API key, or a connected app (its refresh token and every access token it holds). */
export async function revokeAccess(userId: string, id: string) {
  const [row] = await db().select({ kind: mcpTokens.kind, clientId: mcpTokens.clientId }).from(mcpTokens)
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId))).limit(1);
  if (!row) return false;
  if (row.kind === 'refresh' && row.clientId) {
    await db().delete(mcpTokens).where(and(eq(mcpTokens.userId, userId), eq(mcpTokens.clientId, row.clientId)));
  } else {
    await db().delete(mcpTokens).where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)));
  }
  return true;
}

// ---------- OAuth 2.1 (authorization code + PKCE, dynamic client registration)
export async function registerClient(input: { name: string; redirectUris: string[] }) {
  const clientId = `omc_${randomBytes(16).toString('base64url')}`;
  await db().insert(mcpOauthClients).values({ clientId, name: input.name.slice(0, 80), redirectUris: input.redirectUris });
  // Old unused registrations (clients register on every connect attempt) are not worth keeping.
  void db().execute(sql`delete from mcp_oauth_clients c where c.created_at < now() - interval '30 days'
    and not exists (select 1 from mcp_tokens t where t.client_id = c.client_id)`).catch(() => undefined);
  return clientId;
}

export async function getClient(clientId: string) {
  if (!/^omc_[A-Za-z0-9_-]{10,40}$/.test(clientId)) return null;
  const [row] = await db().select().from(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId)).limit(1);
  return row ?? null;
}

export async function issueCode(input: { userId: string; clientId: string; redirectUri: string; codeChallenge: string }) {
  const code = randomBytes(32).toString('base64url');
  await db().delete(mcpOauthCodes).where(lt(mcpOauthCodes.expiresAt, new Date()));
  await db().insert(mcpOauthCodes).values({ codeHash: sha256(code), ...input, expiresAt: new Date(Date.now() + 5 * 60_000) });
  return code;
}

/** Codes work once: the row is deleted as it is read. */
async function takeCode(code: string) {
  const [row] = await db().delete(mcpOauthCodes).where(eq(mcpOauthCodes.codeHash, sha256(code))).returning();
  return row && row.expiresAt.getTime() > Date.now() ? row : null;
}

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

async function issueTokens(userId: string, clientId: string, clientName: string) {
  const access = secret('omo');
  const refresh = secret('omr');
  await db().insert(mcpTokens).values({
    userId, kind: 'oauth', name: clientName, prefix: access.slice(0, 10), tokenHash: sha256(access), clientId, expiresAt: new Date(Date.now() + ACCESS_TTL_MS),
  });
  await db().insert(mcpTokens).values({
    userId, kind: 'refresh', name: clientName, prefix: refresh.slice(0, 10), tokenHash: sha256(refresh), clientId, expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  // Keep only the freshest few access tokens per app so reconnecting never piles up rows.
  await db().execute(sql`delete from mcp_tokens where user_id = ${userId} and client_id = ${clientId} and kind = 'oauth'
    and id not in (select id from mcp_tokens where user_id = ${userId} and client_id = ${clientId} and kind = 'oauth' order by created_at desc limit 5)`);
  await db().execute(sql`delete from mcp_tokens where user_id = ${userId} and client_id = ${clientId} and kind = 'refresh'
    and id not in (select id from mcp_tokens where user_id = ${userId} and client_id = ${clientId} and kind = 'refresh' order by created_at desc limit 3)`);
  return { access_token: access, token_type: 'Bearer' as const, expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh };
}

type TokenResult = { ok: true; body: Awaited<ReturnType<typeof issueTokens>> } | { ok: false; error: string };

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<TokenResult> {
  const row = await takeCode(input.code);
  const client = await getClient(input.clientId);
  if (!row || !client || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) return { ok: false, error: 'invalid_grant' };
  if (challengeOf(input.verifier) !== row.codeChallenge) return { ok: false, error: 'invalid_grant' };
  return { ok: true, body: await issueTokens(row.userId, client.clientId, client.name) };
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  const [row] = await db().delete(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, sha256(input.refreshToken)), eq(mcpTokens.kind, 'refresh'), eq(mcpTokens.clientId, input.clientId), or(sql`${mcpTokens.expiresAt} is null`, sql`${mcpTokens.expiresAt} > now()`)))
    .returning();
  const client = await getClient(input.clientId);
  if (!row || !client) return { ok: false, error: 'invalid_grant' };
  return { ok: true, body: await issueTokens(row.userId, client.clientId, client.name) };
}
