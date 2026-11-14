/* Project sending settings: From + domain verify (SES / Resend). */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { mailProvidersAvailable } from './mail-transport';
import { resendConfigured, resendEnsureDomain, resendGetDomain } from './resend';
import { projectSending } from './schema';
import { sesEnsureDomainIdentity, sesGetDomainIdentity, sesIdentityConfigured } from './ses';

export type PublicSending = {
  fromName: string;
  fromEmail: string;
  domain: string;
  provider: 'ses' | 'resend';
  status: 'none' | 'pending' | 'verified' | 'failed';
  dnsRecords: Array<{ host: string; type: string; value: string }>;
  verifiedAt: string | null;
  platformFrom: string;
  providers: { ses: boolean; resend: boolean };
};

function emptyPublic(): PublicSending {
  const providers = mailProvidersAvailable();
  return {
    fromName: '',
    fromEmail: '',
    domain: '',
    provider: providers.ses ? 'ses' : providers.resend ? 'resend' : 'ses',
    status: 'none',
    dnsRecords: [],
    verifiedAt: null,
    platformFrom: process.env.SES_FROM_EMAIL?.trim() || (process.env.SES_FROM_DOMAIN ? `noreply@${process.env.SES_FROM_DOMAIN.trim()}` : ''),
    providers,
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

export async function getProjectSending(db: NodePgDatabase, projectId: string): Promise<PublicSending> {
  const base = emptyPublic();
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row) return base;
  return {
    ...base,
    fromName: row.fromName || '',
    fromEmail: row.fromEmail || '',
    domain: row.domain || '',
    provider: row.provider === 'resend' ? 'resend' : 'ses',
    status: (['none', 'pending', 'verified', 'failed'].includes(row.status) ? row.status : 'none') as PublicSending['status'],
    dnsRecords: Array.isArray(row.dnsRecords) ? row.dnsRecords : [],
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
  };
}

export async function upsertProjectSending(
  db: NodePgDatabase,
  projectId: string,
  input: {
    fromName?: string;
    fromEmail?: string;
    domain?: string;
    provider?: 'ses' | 'resend';
    startVerify?: boolean;
  },
): Promise<PublicSending> {
  const current = await getProjectSending(db, projectId);
  const fromName = input.fromName !== undefined ? input.fromName.trim().slice(0, 80) : current.fromName;
  const fromEmail = input.fromEmail !== undefined ? input.fromEmail.trim().toLowerCase().slice(0, 160) : current.fromEmail;
  let domain = input.domain !== undefined ? normalizeDomain(input.domain) : current.domain;
  const providers = mailProvidersAvailable();
  let provider: 'ses' | 'resend' = input.provider || current.provider;
  if (provider === 'resend' && !providers.resend) provider = 'ses';
  if (provider === 'ses' && !providers.ses && providers.resend) provider = 'resend';

  if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new Error('Invalid from email');
  if (fromEmail && !domain) domain = emailDomain(fromEmail);
  if (domain && fromEmail && !domainOwnsEmail(domain, fromEmail)) {
    throw new Error('From email must be on the sending domain');
  }

  let status = current.status;
  let dnsRecords = current.dnsRecords;
  let providerRef: string | null = null;
  let verifiedAt: Date | null = current.verifiedAt ? new Date(current.verifiedAt) : null;

  const [existing] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  providerRef = existing?.providerRef || null;

  const domainChanged = domain && domain !== current.domain;
  const providerChanged = provider !== current.provider;
  const shouldVerify = Boolean(input.startVerify || domainChanged || (providerChanged && domain));

  if (shouldVerify && domain) {
    if (provider === 'resend') {
      if (!resendConfigured()) throw new Error('Resend is not configured');
      const id = await resendEnsureDomain(domain);
      status = id.status;
      dnsRecords = id.dnsRecords;
      providerRef = id.providerRef;
      verifiedAt = id.verified ? new Date() : null;
    } else {
      if (!sesIdentityConfigured()) throw new Error('SES is not configured');
      const id = await sesEnsureDomainIdentity(domain);
      status = id.status;
      dnsRecords = id.dnsRecords;
      providerRef = id.providerRef;
      verifiedAt = id.verified ? new Date() : null;
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
      verifiedAt,
      updatedAt: now,
    },
  });

  return getProjectSending(db, projectId);
}

export async function checkProjectSending(db: NodePgDatabase, projectId: string): Promise<PublicSending> {
  const [row] = await db.select().from(projectSending).where(eq(projectSending.projectId, projectId)).limit(1);
  if (!row?.domain) return getProjectSending(db, projectId);

  const provider = row.provider === 'resend' ? 'resend' : 'ses';
  let status = row.status;
  let dnsRecords = Array.isArray(row.dnsRecords) ? row.dnsRecords : [];
  let verifiedAt = row.verifiedAt;
  let providerRef = row.providerRef;

  if (provider === 'resend') {
    if (!resendConfigured()) throw new Error('Resend is not configured');
    const ref = providerRef || row.domain;
    const id = await resendGetDomain(ref, row.domain);
    status = id.status;
    dnsRecords = id.dnsRecords.length ? id.dnsRecords : dnsRecords;
    providerRef = id.providerRef;
    verifiedAt = id.verified ? new Date() : null;
  } else {
    if (!sesIdentityConfigured()) throw new Error('SES is not configured');
    const id = await sesGetDomainIdentity(row.domain);
    status = id.status;
    dnsRecords = id.dnsRecords.length ? id.dnsRecords : dnsRecords;
    providerRef = id.providerRef;
    verifiedAt = id.verified ? new Date() : null;
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
