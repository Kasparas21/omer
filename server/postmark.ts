/* Postmark BYO: Server API token for send; domain DNS via Domains API when Account token is used.
   Merchants paste their Server Token; they verify the sender/domain in Postmark (or we list domain DNS if the token allows). */
import type { DnsRecord } from './ses';

async function postmarkFetch(path: string, token: string, init?: RequestInit) {
  const key = token.trim();
  if (!key) throw new Error('Postmark API token missing');
  const res = await fetch(`https://api.postmarkapp.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': key,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = typeof body.Message === 'string' ? body.Message : text.slice(0, 300);
    throw new Error(`Postmark ${res.status}: ${msg}`);
  }
  return body;
}

export type PostmarkDomainStatus = {
  domain: string;
  verified: boolean;
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[];
  providerRef: string;
};

/** Server tokens cannot always manage domains; we treat a successful sender lookup / DKIM-ready From as verified when possible. */
export async function postmarkCheckFrom(domain: string, fromEmail: string, apiKey: string): Promise<PostmarkDomainStatus> {
  const clean = domain.trim().toLowerCase().replace(/\.$/, '');
  // Hitting /server confirms the token works.
  await postmarkFetch('/server', apiKey);
  // List sender signatures if available on this token.
  let verified = false;
  const dnsRecords: DnsRecord[] = [];
  try {
    const senders = await postmarkFetch('/senders?count=100&offset=0', apiKey);
    const list = Array.isArray(senders.SenderSignatures) ? senders.SenderSignatures : [];
    for (const row of list) {
      const r = row as Record<string, unknown>;
      const email = String(r.EmailAddress || '').toLowerCase();
      const conf = Boolean(r.Confirmed);
      if (email === fromEmail.toLowerCase() && conf) verified = true;
      const host = email.includes('@') ? email.split('@')[1] : '';
      if (host === clean && conf) verified = true;
    }
  } catch {
    // Some server tokens cannot list senders — merchant verifies in Postmark UI.
  }
  return {
    domain: clean,
    verified,
    status: verified ? 'verified' : 'pending',
    dnsRecords,
    providerRef: clean,
  };
}

export async function postmarkSendEmail(input: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  listUnsubscribeUrl?: string;
  apiKey: string;
}): Promise<{ messageId: string }> {
  const headers: Array<{ Name: string; Value: string }> = [];
  if (input.listUnsubscribeUrl) {
    headers.push({ Name: 'List-Unsubscribe', Value: `<${input.listUnsubscribeUrl}>` });
    headers.push({ Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' });
  }
  const body = await postmarkFetch('/email', input.apiKey, {
    method: 'POST',
    body: JSON.stringify({
      From: `${input.fromName} <${input.fromEmail}>`,
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      ReplyTo: input.replyTo || undefined,
      Headers: headers.length ? headers : undefined,
      TrackOpens: false,
    }),
  });
  const messageId = String(body.MessageID || body.MessageId || '');
  if (!messageId) throw new Error('Postmark send returned no MessageID');
  return { messageId };
}
