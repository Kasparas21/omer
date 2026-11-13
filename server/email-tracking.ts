/* Signed open / click / unsubscribe tokens for SES mail. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appURL } from './auth';
import { emailEvents, projectOpportunities } from './schema';

type Purpose = 'open' | 'click' | 'unsub';

function secret() {
  return (process.env.EMAIL_TRACKING_SECRET || process.env.BETTER_AUTH_SECRET || '').trim();
}

function b64url(buf: Buffer | string) {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function trackingToken(parts: {
  purpose: Purpose;
  projectId: string;
  messageId: string;
  visitorId: string;
  url?: string;
}) {
  const body = {
    p: parts.purpose,
    pr: parts.projectId,
    m: parts.messageId,
    v: parts.visitorId,
    u: parts.url || undefined,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 90,
  };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

export function verifyTrackingToken(token: string): {
  purpose: Purpose;
  projectId: string;
  messageId: string;
  visitorId: string;
  url?: string;
} | null {
  if (!secret()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      p?: string; pr?: string; m?: string; v?: string; u?: string; exp?: number;
    };
    if (!raw.p || !raw.pr || !raw.m || !raw.v) return null;
    if (typeof raw.exp === 'number' && raw.exp < Date.now()) return null;
    if (!['open', 'click', 'unsub'].includes(raw.p)) return null;
    return {
      purpose: raw.p as Purpose,
      projectId: raw.pr,
      messageId: raw.m,
      visitorId: raw.v,
      url: raw.u,
    };
  } catch {
    return null;
  }
}

export function trackingUrls(projectId: string, messageId: string, visitorId: string, appOrigin = appURL) {
  const base = appOrigin.replace(/\/$/, '');
  const open = trackingToken({ purpose: 'open', projectId, messageId, visitorId });
  const unsub = trackingToken({ purpose: 'unsub', projectId, messageId, visitorId });
  return {
    openPixel: `${base}/t/o/${open}`,
    unsubscribe: `${base}/t/u/${unsub}`,
    click: (url: string) => {
      const tok = trackingToken({ purpose: 'click', projectId, messageId, visitorId, url });
      return `${base}/t/c/${tok}`;
    },
  };
}

export async function recordEmailEvent(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  type: 'email_open' | 'email_click',
  messageId: string,
) {
  await db.insert(emailEvents).values({
    projectId,
    visitorId,
    type,
    campaign: `msg:${messageId}`,
    messageId,
    seenAt: new Date(),
  });
}

export async function suppressVisitor(db: NodePgDatabase, projectId: string, visitorId: string) {
  await db.update(projectOpportunities).set({
    suppressed: true,
    status: 'dismissed',
    updatedAt: new Date(),
  }).where(and(
    eq(projectOpportunities.projectId, projectId),
    eq(projectOpportunities.visitorId, visitorId),
  ));
}

export const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
