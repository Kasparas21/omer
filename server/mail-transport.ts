/* Pick platform / SES merchant / Resend From for a project. */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { resendConfigured, resendSendEmail } from './resend';
import { projectSending } from './schema';
import { sesConfigured, sesFromEmail, sesSendEmail } from './ses';

export type SendingRow = {
  fromName: string | null;
  fromEmail: string | null;
  domain: string | null;
  provider: string;
  status: string;
};

export type ResolvedFrom = {
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  provider: 'ses' | 'resend' | 'platform';
  merchantVerified: boolean;
};

export async function loadSending(db: NodePgDatabase, projectId: string): Promise<SendingRow | null> {
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row) return null;
  return {
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    domain: row.domain,
    provider: row.provider || 'ses',
    status: row.status || 'none',
  };
}

export function resolveFrom(projectName: string, sending: SendingRow | null): ResolvedFrom {
  const fromName = (sending?.fromName || projectName || 'Omer').trim() || 'Omer';
  const merchantEmail = sending?.fromEmail?.trim() || null;
  const verified = sending?.status === 'verified' && Boolean(merchantEmail);
  const provider = sending?.provider === 'resend' ? 'resend' : 'ses';

  if (verified && provider === 'resend' && resendConfigured()) {
    return {
      fromName,
      fromEmail: merchantEmail!,
      replyTo: merchantEmail,
      provider: 'resend',
      merchantVerified: true,
    };
  }
  if (verified && provider === 'ses' && (sesConfigured() || merchantEmail)) {
    return {
      fromName,
      fromEmail: merchantEmail!,
      replyTo: merchantEmail,
      provider: 'ses',
      merchantVerified: true,
    };
  }

  const platform = sesFromEmail();
  return {
    fromName,
    fromEmail: platform,
    replyTo: merchantEmail,
    provider: 'platform',
    merchantVerified: false,
  };
}

export async function sendViaTransport(input: {
  projectName: string;
  sending: SendingRow | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  listUnsubscribeUrl?: string;
}): Promise<{ messageId: string; from: ResolvedFrom }> {
  const from = resolveFrom(input.projectName, input.sending);
  if (!from.fromEmail) throw new Error('No From address configured');

  if (from.provider === 'resend') {
    if (!resendConfigured()) throw new Error('Resend is not configured');
    const { messageId } = await resendSendEmail({
      to: input.to,
      fromName: from.fromName,
      fromEmail: from.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: from.replyTo,
      listUnsubscribeUrl: input.listUnsubscribeUrl,
    });
    return { messageId, from };
  }

  if (!sesConfigured() && from.provider === 'platform') throw new Error('SES is not configured');
  const { messageId } = await sesSendEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    fromName: from.fromName,
    fromEmail: from.provider === 'ses' ? from.fromEmail : undefined,
    replyTo: from.replyTo,
    listUnsubscribeUrl: input.listUnsubscribeUrl,
    listUnsubscribePost: true,
  });
  return { messageId, from };
}

export function mailProvidersAvailable() {
  return { ses: sesConfigured(), resend: resendConfigured() };
}
