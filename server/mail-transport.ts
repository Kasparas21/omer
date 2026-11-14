/* Pick Omer SES / BYO Resend / BYO Postmark / platform From. */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { postmarkSendEmail } from './postmark';
import { resendConfigured, resendSendEmail } from './resend';
import { loadSendingSecrets } from './sending';
import { sesConfigured, sesFromEmail, sesSendEmail } from './ses';

export type SendingRow = {
  fromName: string | null;
  fromEmail: string | null;
  domain: string | null;
  provider: string;
  status: string;
  providerApiKey?: string | null;
};

export type ResolvedFrom = {
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  provider: 'ses' | 'resend' | 'postmark' | 'platform';
  merchantVerified: boolean;
};

export async function loadSending(db: NodePgDatabase, projectId: string): Promise<SendingRow | null> {
  return loadSendingSecrets(db, projectId);
}

export function resolveFrom(projectName: string, sending: SendingRow | null): ResolvedFrom {
  const fromName = (sending?.fromName || projectName || 'Omer').trim() || 'Omer';
  const merchantEmail = sending?.fromEmail?.trim() || null;
  const verified = sending?.status === 'verified' && Boolean(merchantEmail);
  const provider = sending?.provider === 'resend'
    ? 'resend'
    : sending?.provider === 'postmark'
      ? 'postmark'
      : 'ses';

  if (verified && provider === 'resend' && (sending?.providerApiKey || resendConfigured())) {
    return { fromName, fromEmail: merchantEmail!, replyTo: merchantEmail, provider: 'resend', merchantVerified: true };
  }
  if (verified && provider === 'postmark' && sending?.providerApiKey) {
    return { fromName, fromEmail: merchantEmail!, replyTo: merchantEmail, provider: 'postmark', merchantVerified: true };
  }
  if (verified && provider === 'ses' && (sesConfigured() || merchantEmail)) {
    return { fromName, fromEmail: merchantEmail!, replyTo: merchantEmail, provider: 'ses', merchantVerified: true };
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
    const { messageId } = await resendSendEmail({
      to: input.to,
      fromName: from.fromName,
      fromEmail: from.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: from.replyTo,
      listUnsubscribeUrl: input.listUnsubscribeUrl,
      apiKey: input.sending?.providerApiKey,
    });
    return { messageId, from };
  }

  if (from.provider === 'postmark') {
    const key = input.sending?.providerApiKey;
    if (!key) throw new Error('Postmark API token missing');
    const { messageId } = await postmarkSendEmail({
      to: input.to,
      fromName: from.fromName,
      fromEmail: from.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: from.replyTo,
      listUnsubscribeUrl: input.listUnsubscribeUrl,
      apiKey: key,
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
  // SES = Omer-hosted path when platform SES is configured.
  // Resend/Postmark = always offered as BYO (merchant pastes their key).
  return { ses: sesConfigured(), resend: true, postmark: true };
}
