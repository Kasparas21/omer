/* Project sending: Omer SES (our keys + their domain) or BYO Resend / Postmark. */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { postmarkCheckFrom } from './postmark';
import { resendConfigured, resendEnsureDomain, resendGetDomain } from './resend';
import { projectSending } from './schema';
import { openSecret, sealSecret } from './secret-box';
import { sesConfigured, sesEnsureDomainIdentity, sesGetDomainIdentity, sesIdentityConfigured } from './ses';

function mailProvidersAvailable() {
  return { ses: sesConfigured(), resend: true, postmark: true };
}

export type SendingProvider = 'ses' | 'resend' | 'postmark';

export type PublicSending = {
  fromName: string;
  fromEmail: string;
  domain: string;
  provider: SendingProvider;
  status: 'none' | 'pending' | 'verified' | 'failed';
  dnsRecords: Array<{ host: string; type: string; value: string }>;
  verifiedAt: string | null;
  platformFrom: string;
  hasProviderKey: boolean;
  providers: { ses: boolean; resend: boolean; postmark: boolean };
  hint: string;
};

function emptyPublic(): PublicSending {
  const providers = mailProvidersAvailable();
  return {
    fromName: '',
    fromEmail: '',
    domain: '',
    provider: 'ses',
    status: 'none',
    dnsRecords: [],
    verifiedAt: null,
    platformFrom: process.env.SES_FROM_EMAIL?.trim()
      || (process.env.SES_FROM_DOMAIN ? `noreply@${process.env.SES_FROM_DOMAIN.trim()}` : ''),
    hasProviderKey: false,
    providers: { ...providers, postmark: true },
    hint: '',
  };
}

function emailDomain(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

function domainOwnsEmail(domain: string, email: string) {
  const host = emailDomain(email);
  const d = domain.trim().toLowerCase().replace(/\.$/, '');
  return host === d || host.endsWith(`.${d}`);
}

function normalizeDomain(raw: string) {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function asProvider(v: string | null | undefined): SendingProvider {
  if (v === 'resend' || v === 'postmark') return v;
  return 'ses';
}

export async function getProjectSending(db: NodePgDatabase, projectId: string): Promise<PublicSending> {
  const base = emptyPublic();
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row) return base;
  const provider = asProvider(row.provider);
  const hint = provider === 'ses'
    ? 'Omer sends for you. Add DNS to use your domain.'
    : provider === 'resend'
      ? 'Your Resend account. Paste an API key, then add DNS.'
      : 'Your Postmark account. Paste a server token, then confirm the sender.';
  return {
    ...base,
    fromName: row.fromName || '',
    fromEmail: row.fromEmail || '',
    domain: row.domain || '',
    provider,
    status: (['none', 'pending', 'verified', 'failed'].includes(row.status) ? row.status : 'none') as PublicSending['status'],
    dnsRecords: Array.isArray(row.dnsRecords) ? row.dnsRecords : [],
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    hasProviderKey: Boolean(row.providerApiKeySealed),
    hint,
  };
}

function readSealedKey(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try { return openSecret(sealed); } catch { return null; }
}

export async function upsertProjectSending(
  db: NodePgDatabase,
  projectId: string,
  input: {
    fromName?: string;
    fromEmail?: string;
    domain?: string;
    provider?: SendingProvider;
    providerApiKey?: string;
    clearProviderKey?: boolean;
    startVerify?: boolean;
  },
): Promise<PublicSending> {
  const current = await getProjectSending(db, projectId);
  const [existing] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);

  const fromName = input.fromName !== undefined ? input.fromName.trim().slice(0, 80) : current.fromName;
  const fromEmail = input.fromEmail !== undefined ? input.fromEmail.trim().toLowerCase().slice(0, 160) : current.fromEmail;
  let domain = input.domain !== undefined ? normalizeDomain(input.domain) : current.domain;
  const provider = input.provider || current.provider;

  if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new Error('Invalid from email');
  if (fromEmail && !domain) domain = emailDomain(fromEmail);
  if (domain && fromEmail && !domainOwnsEmail(domain, fromEmail)) {
    throw new Error('From email must be on the sending domain');
  }

  let sealed = existing?.providerApiKeySealed || null;
  if (input.clearProviderKey) sealed = null;
  if (input.providerApiKey !== undefined) {
    const raw = input.providerApiKey.trim();
    if (raw) sealed = sealSecret(raw);
  }
  if (input.startVerify) {
    if (provider === 'postmark' && !sealed) throw new Error('Paste your Postmark Server API token');
    if (provider === 'resend' && !sealed && !resendConfigured()) throw new Error('Paste your Resend API key');
  }

  let status = current.status;
  let dnsRecords = current.dnsRecords;
  let providerRef: string | null = existing?.providerRef || null;
  let verifiedAt: Date | null = current.verifiedAt ? new Date(current.verifiedAt) : null;

  const domainChanged = domain && domain !== current.domain;
  const providerChanged = provider !== current.provider;
  const shouldVerify = Boolean(input.startVerify || domainChanged || (providerChanged && domain));
  const byoKey = readSealedKey(sealed);

  if (shouldVerify && domain) {
    if (provider === 'resend') {
      const key = byoKey || process.env.RESEND_API_KEY?.trim() || '';
      if (!key) throw new Error('Paste your Resend API key');
      const id = await resendEnsureDomain(domain, key);
      status = id.status;
      dnsRecords = id.dnsRecords;
      providerRef = id.providerRef;
      verifiedAt = id.verified ? new Date() : null;
    } else if (provider === 'postmark') {
      if (!byoKey) throw new Error('Paste your Postmark Server API token');
      if (!fromEmail) throw new Error('From email required for Postmark');
      const id = await postmarkCheckFrom(domain, fromEmail, byoKey);
      status = id.status;
      dnsRecords = id.dnsRecords;
      providerRef = id.providerRef;
      verifiedAt = id.verified ? new Date() : null;
      if (!id.verified) {
        // Allow mark-pending with clear next step; merchant verifies in Postmark then Check DNS.
        status = 'pending';
      }
    } else {
      if (!sesIdentityConfigured()) throw new Error('SES is not configured');
      try {
        const id = await sesEnsureDomainIdentity(domain);
        status = id.status;
        dnsRecords = id.dnsRecords;
        providerRef = id.providerRef;
        verifiedAt = id.verified ? new Date() : null;
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (/not authorized|AccessDenied|GetEmailIdentity|CreateEmailIdentity/i.test(msg)) {
          throw new Error('Omer domain verify isn’t available yet. Use Custom with Resend or Postmark for now.');
        }
        throw error;
      }
    }
  } else if (!domain) {
    status = 'none';
    dnsRecords = [];
    providerRef = null;
    verifiedAt = null;
  }

  const now = new Date();
  await db.insert(projectSending).values({
    projectId,
    fromName: fromName || null,
    fromEmail: fromEmail || null,
    domain: domain || null,
    provider,
    status,
    dnsRecords,
    providerRef,
    providerApiKeySealed: sealed,
    verifiedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: projectSending.projectId,
    set: {
      fromName: fromName || null,
      fromEmail: fromEmail || null,
      domain: domain || null,
      provider,
      status,
      dnsRecords,
      providerRef,
      providerApiKeySealed: sealed,
      verifiedAt,
      updatedAt: now,
    },
  });

  return getProjectSending(db, projectId);
}

export async function checkProjectSending(db: NodePgDatabase, projectId: string): Promise<PublicSending> {
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row?.domain) return getProjectSending(db, projectId);

  const provider = asProvider(row.provider);
  const byoKey = readSealedKey(row.providerApiKeySealed);
  let status = row.status;
  let dnsRecords = Array.isArray(row.dnsRecords) ? row.dnsRecords : [];
  let verifiedAt = row.verifiedAt;
  let providerRef = row.providerRef;

  if (provider === 'resend') {
    const key = byoKey || process.env.RESEND_API_KEY?.trim() || '';
    if (!key) throw new Error('Paste your Resend API key');
    const ref = providerRef || row.domain;
    const id = await resendGetDomain(ref, row.domain, key);
    status = id.status;
    dnsRecords = id.dnsRecords.length ? id.dnsRecords : dnsRecords;
    providerRef = id.providerRef;
    verifiedAt = id.verified ? new Date() : null;
  } else if (provider === 'postmark') {
    if (!byoKey) throw new Error('Paste your Postmark Server API token');
    if (!row.fromEmail) throw new Error('From email required');
    const id = await postmarkCheckFrom(row.domain, row.fromEmail, byoKey);
    status = id.status;
    providerRef = id.providerRef;
    verifiedAt = id.verified ? new Date() : null;
  } else {
    if (!sesIdentityConfigured()) throw new Error('SES is not configured');
    try {
      const id = await sesGetDomainIdentity(row.domain);
      status = id.status;
      dnsRecords = id.dnsRecords.length ? id.dnsRecords : dnsRecords;
      providerRef = id.providerRef;
      verifiedAt = id.verified ? new Date() : null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (/not authorized|AccessDenied|GetEmailIdentity/i.test(msg)) {
        throw new Error('Omer domain check isn’t available yet. Use Custom with Resend or Postmark for now.');
      }
      throw error;
    }
  }

  await db.update(projectSending).set({
    status,
    dnsRecords,
    providerRef,
    verifiedAt,
    updatedAt: new Date(),
  }).where(eq(projectSending.projectId, projectId));

  return getProjectSending(db, projectId);
}

/** Internal: sealed key for transports. */
export async function loadSendingSecrets(db: NodePgDatabase, projectId: string) {
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row) return null;
  return {
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    domain: row.domain,
    provider: asProvider(row.provider),
    status: row.status || 'none',
    providerApiKey: readSealedKey(row.providerApiKeySealed),
  };
}
