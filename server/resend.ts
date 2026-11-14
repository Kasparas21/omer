/* Resend domains + send when RESEND_API_KEY is set. */
import type { DnsRecord } from './ses';

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function resendConfigured() {
  return Boolean(env('RESEND_API_KEY'));
}

async function resendFetch(path: string, init?: RequestInit) {
  if (!resendConfigured()) throw new Error('Resend is not configured');
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = typeof body.message === 'string' ? body.message : text.slice(0, 300);
    throw new Error(`Resend ${res.status}: ${msg}`);
  }
  return body;
}

export type ResendDomainStatus = {
  domain: string;
  verified: boolean;
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[];
  providerRef: string;
};

function mapRecords(raw: unknown): DnsRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row && typeof row === 'object') ? row as Record<string, unknown> : {};
    return {
      host: String(r.name || r.host || ''),
      type: String(r.type || 'TXT').toUpperCase(),
      value: String(r.value || r.content || ''),
    };
  }).filter((r) => r.host && r.value);
}

function parseDomain(raw: Record<string, unknown>, fallbackDomain: string): ResendDomainStatus {
  const domain = String(raw.name || fallbackDomain).toLowerCase();
  const id = String(raw.id || domain);
  const statusRaw = String(raw.status || '').toLowerCase();
  const verified = statusRaw === 'verified' || Boolean(raw.verified);
  const failed = statusRaw === 'failed' || statusRaw === 'temporarily_failed';
  const records = mapRecords(raw.records || raw.dns || raw.dns_records);
  return {
    domain,
    verified,
    status: verified ? 'verified' : failed ? 'failed' : 'pending',
    dnsRecords: records,
    providerRef: id,
  };
}

export async function resendEnsureDomain(domain: string): Promise<ResendDomainStatus> {
  const clean = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) throw new Error('Invalid domain');
  try {
    const created = await resendFetch('/domains', {
      method: 'POST',
      body: JSON.stringify({ name: clean }),
    });
    return parseDomain(created, clean);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (!/already|exist|409|422/i.test(msg)) throw error;
  }
  const list = await resendFetch('/domains');
  const data = Array.isArray(list.data) ? list.data : Array.isArray(list) ? list : [];
  const hit = data.find((row) => {
    const r = row as Record<string, unknown>;
    return String(r.name || '').toLowerCase() === clean;
  }) as Record<string, unknown> | undefined;
  if (!hit) throw new Error('Resend domain not found after create');
  const id = String(hit.id || '');
  if (id) {
    const detailed = await resendFetch(`/domains/${encodeURIComponent(id)}`);
    return parseDomain(detailed, clean);
  }
  return parseDomain(hit, clean);
}

export async function resendGetDomain(providerRef: string, domain: string): Promise<ResendDomainStatus> {
  const detailed = await resendFetch(`/domains/${encodeURIComponent(providerRef)}`);
  return parseDomain(detailed, domain);
}

export async function resendSendEmail(input: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  listUnsubscribeUrl?: string;
}): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {};
  if (input.listUnsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${input.listUnsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const body = await resendFetch('/emails', {
    method: 'POST',
    body: JSON.stringify({
      from: `${input.fromName} <${input.fromEmail}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || undefined,
      headers: Object.keys(headers).length ? headers : undefined,
    }),
  });
  const messageId = String(body.id || '');
  if (!messageId) throw new Error('Resend send returned no id');
  return { messageId };
}
