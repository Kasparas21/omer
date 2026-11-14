/* Enrich a visitor from their email via Firecrawl Alexandria (People Data Labs). */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alexandriaCall, firecrawlConfigured } from './firecrawl';
import { identities, visitorEnrichments } from './schema';

const STALE_MS = 30 * 86_400_000;
const inFlight = new Set<string>();
const projectBusy = new Set<string>();

export type EnrichSource = {
  kind: string;
  label: string;
  url: string | null;
  logo: string;
};

export type EnrichPerson = {
  name: string | null;
  title: string | null;
  employer: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  githubUrl: string | null;
  likelihood: number | null;
};

export type EnrichCompany = {
  name: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  linkedinUrl: string | null;
  website: string | null;
};

export type PublicEnrichment = {
  status: 'pending' | 'ready' | 'none' | 'failed';
  email: string | null;
  person: EnrichPerson | null;
  company: EnrichCompany | null;
  sources: EnrichSource[];
  provider: string | null;
  generatedAt: string | null;
  error: string | null;
  enrichEnabled: boolean;
};

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function unwrapPersonPayload(data: unknown): { record: Record<string, unknown> | null; likelihood: number | null; status: number | null } {
  const root = asRecord(data);
  if (!root) return { record: null, likelihood: null, status: null };
  // PDL: { status, likelihood, data: { ...person } } or person fields at top level
  const nested = asRecord(root.data);
  const record = nested && (str(nested.full_name) || str(nested.id) || str(nested.job_title))
    ? nested
    : (str(root.full_name) || str(root.id) || str(root.job_title) ? root : nested);
  return {
    record,
    likelihood: num(root.likelihood) ?? num(nested?.likelihood),
    status: num(root.status),
  };
}

function locationFrom(person: Record<string, unknown>): string | null {
  return str(person.location_name)
    || [str(person.location_locality), str(person.location_region), str(person.location_country)]
      .filter(Boolean).join(', ')
    || null;
}

function mapPerson(raw: Record<string, unknown>, likelihood: number | null): EnrichPerson {
  const experience = Array.isArray(raw.experience) ? raw.experience : [];
  const firstExp = asRecord(experience[0]);
  return {
    name: str(raw.full_name) || [str(raw.first_name), str(raw.last_name)].filter(Boolean).join(' ') || null,
    title: str(raw.job_title) || str(firstExp?.title) || null,
    employer: str(raw.job_company_name) || str(asRecord(firstExp?.company)?.name) || null,
    location: locationFrom(raw),
    headline: str(raw.job_title_role) || str(raw.job_onet_specific_occupation) || null,
    summary: str(raw.job_summary) || str(raw.summary) || null,
    linkedinUrl: str(raw.linkedin_url),
    twitterUrl: str(raw.twitter_url),
    facebookUrl: str(raw.facebook_url),
    githubUrl: str(raw.github_url),
    likelihood,
  };
}

function mapCompanyFromPerson(person: Record<string, unknown>): EnrichCompany | null {
  const name = str(person.job_company_name);
  const website = str(person.job_company_website);
  const domain = website
    ? website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || null
    : null;
  if (!name && !domain && !str(person.job_company_linkedin_url)) return null;
  return {
    name,
    domain,
    industry: str(person.job_company_industry),
    size: str(person.job_company_size) || (num(person.job_company_employee_count) != null
      ? String(person.job_company_employee_count)
      : null),
    description: null,
    linkedinUrl: str(person.job_company_linkedin_url),
    website: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
  };
}

function mapCompanyEnrich(data: unknown): EnrichCompany | null {
  const root = asRecord(data);
  if (!root) return null;
  // PDL company/enrich puts fields at top level beside status/likelihood
  const rec = asRecord(root.data) || root;
  const website = str(rec.website) || str(rec.company_website);
  const name = str(rec.name) || str(rec.display_name);
  if (!name && !website) return null;
  return {
    name,
    domain: website
      ? website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || null
      : str(rec.domain),
    industry: str(rec.industry) || (Array.isArray(rec.industry) ? str(rec.industry[0]) : null),
    size: str(rec.size) || str(rec.employee_count) || (num(rec.employee_count) != null ? String(rec.employee_count) : null),
    description: str(rec.summary) || str(rec.description),
    linkedinUrl: str(rec.linkedin_url) || str(rec.profile),
    website: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
  };
}

function buildSources(person: EnrichPerson | null, company: EnrichCompany | null): EnrichSource[] {
  const out: EnrichSource[] = [];
  const push = (kind: string, label: string, url: string | null, logo: string) => {
    if (!url) return;
    if (out.some((s) => s.url === url)) return;
    out.push({ kind, label, url, logo });
  };
  if (person) {
    push('linkedin', 'LinkedIn', person.linkedinUrl, 'linkedin');
    push('x', 'X', person.twitterUrl, 'x');
    push('facebook', 'Facebook', person.facebookUrl, 'meta');
    push('github', 'GitHub', person.githubUrl, 'github');
  }
  if (company) {
    push('company_linkedin', 'Company LinkedIn', company.linkedinUrl, 'linkedin');
    push('company', company.name || 'Company site', company.website, 'google');
  }
  out.push({ kind: 'provider', label: 'People Data Labs', url: null, logo: 'firecrawl' });
  return out;
}

export function publicEnrichment(
  row: typeof visitorEnrichments.$inferSelect | null | undefined,
  opts?: { enrichEnabled?: boolean },
): PublicEnrichment {
  const enrichEnabled = opts?.enrichEnabled ?? firecrawlConfigured();
  if (!row) {
    return {
      status: 'pending',
      email: null,
      person: null,
      company: null,
      sources: [],
      provider: null,
      generatedAt: null,
      error: null,
      enrichEnabled,
    };
  }
  const person = row.personJson && typeof row.personJson === 'object'
    ? row.personJson as unknown as EnrichPerson
    : null;
  const company = row.companyJson && typeof row.companyJson === 'object'
    ? row.companyJson as unknown as EnrichCompany
    : null;
  const sources = Array.isArray(row.sourcesJson)
    ? row.sourcesJson as unknown as EnrichSource[]
    : [];
  return {
    status: (row.status as PublicEnrichment['status']) || 'pending',
    email: row.email,
    person: row.status === 'ready' ? person : null,
    company: row.status === 'ready' ? company : null,
    sources: row.status === 'ready' ? sources : [],
    provider: row.provider,
    generatedAt: row.generatedAt ? String(row.generatedAt) : null,
    error: row.status === 'failed' ? (row.error || 'Enrichment failed') : null,
    enrichEnabled,
  };
}

function isFresh(row: typeof visitorEnrichments.$inferSelect, email: string) {
  if (row.email !== email) return false;
  if (row.status === 'pending') return true;
  if (!row.generatedAt) return false;
  return Date.now() - new Date(row.generatedAt).getTime() < STALE_MS;
}

async function upsertRow(
  db: NodePgDatabase,
  values: typeof visitorEnrichments.$inferInsert,
) {
  await db.insert(visitorEnrichments).values(values).onConflictDoUpdate({
    target: [visitorEnrichments.projectId, visitorEnrichments.visitorId],
    set: {
      email: values.email,
      status: values.status,
      personJson: values.personJson,
      companyJson: values.companyJson,
      sourcesJson: values.sourcesJson,
      provider: values.provider,
      creditsUsed: values.creditsUsed,
      error: values.error,
      generatedAt: values.generatedAt,
      updatedAt: new Date(),
    },
  });
}

async function runEnrich(db: NodePgDatabase, projectId: string, visitorId: string, email: string) {
  let credits = 0;
  try {
    const personRes = await alexandriaCall({
      provider: 'people-data-labs',
      capability: 'person/enrich',
      options: { email, min_likelihood: 2, titlecase: true },
    });
    credits += personRes.creditsCost;

    if (!personRes.success && personRes.error) {
      // Terms not accepted, rate limit, etc.
      const terms = /THIRD_PARTY_DATA_TERMS|terms/i.test(personRes.error || '');
      await upsertRow(db, {
        projectId,
        visitorId,
        email,
        status: 'failed',
        personJson: null,
        companyJson: null,
        sourcesJson: [],
        provider: 'people-data-labs',
        creditsUsed: credits,
        error: terms
          ? 'Accept Alexandria provider terms in the Firecrawl dashboard, then refresh.'
          : personRes.error.slice(0, 300),
        generatedAt: new Date(),
      });
      return;
    }

    const { record, likelihood, status } = unwrapPersonPayload(personRes.data);
    // PDL miss: status 404 / empty — free, cache as none
    if (!record || status === 404) {
      await upsertRow(db, {
        projectId,
        visitorId,
        email,
        status: 'none',
        personJson: null,
        companyJson: null,
        sourcesJson: [],
        provider: 'people-data-labs',
        creditsUsed: credits,
        error: null,
        generatedAt: new Date(),
      });
      return;
    }

    const person = mapPerson(record, likelihood);
    let company = mapCompanyFromPerson(record);

    const companyKey = company?.domain || company?.linkedinUrl || company?.website;
    if (companyKey) {
      try {
        const companyRes = await alexandriaCall({
          provider: 'people-data-labs',
          capability: 'company/enrich',
          options: company?.domain
            ? { website: company.domain }
            : company?.linkedinUrl
              ? { profile: company.linkedinUrl }
              : { website: company!.website },
        });
        credits += companyRes.creditsCost;
        if (companyRes.success) {
          const enriched = mapCompanyEnrich(companyRes.data);
          if (enriched) {
            company = {
              name: enriched.name || company?.name || null,
              domain: enriched.domain || company?.domain || null,
              industry: enriched.industry || company?.industry || null,
              size: enriched.size || company?.size || null,
              description: enriched.description || company?.description || null,
              linkedinUrl: enriched.linkedinUrl || company?.linkedinUrl || null,
              website: enriched.website || company?.website || null,
            };
          }
        }
      } catch {
        // Keep person-level company stub; company enrich is best-effort.
      }
    }

    const sources = buildSources(person, company);
    await upsertRow(db, {
      projectId,
      visitorId,
      email,
      status: 'ready',
      personJson: person as unknown as Record<string, unknown>,
      companyJson: company as unknown as Record<string, unknown> | undefined,
      sourcesJson: sources as unknown as Array<Record<string, unknown>>,
      provider: 'people-data-labs',
      creditsUsed: credits,
      error: null,
      generatedAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Enrichment failed';
    await upsertRow(db, {
      projectId,
      visitorId,
      email,
      status: 'failed',
      personJson: null,
      companyJson: null,
      sourcesJson: [],
      provider: 'people-data-labs',
      creditsUsed: credits,
      error: message,
      generatedAt: new Date(),
    });
  }
}

/**
 * Ensure enrichment for a visitor with an email. Returns current public card.
 * Kicks off async work when missing/stale (unless force).
 */
export async function ensureVisitorEnrichment(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  opts?: { force?: boolean; email?: string | null },
): Promise<PublicEnrichment> {
  const enrichEnabled = firecrawlConfigured();
  let email = opts?.email?.trim().toLowerCase() || null;
  if (!email) {
    const [identity] = await db.select({ email: identities.email })
      .from(identities)
      .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
      .limit(1);
    email = identity?.email?.trim().toLowerCase() || null;
  }

  const [existing] = await db.select().from(visitorEnrichments)
    .where(and(eq(visitorEnrichments.projectId, projectId), eq(visitorEnrichments.visitorId, visitorId)))
    .limit(1);

  if (!email) {
    return {
      status: 'none',
      email: null,
      person: null,
      company: null,
      sources: [],
      provider: null,
      generatedAt: existing?.generatedAt ? String(existing.generatedAt) : null,
      error: null,
      enrichEnabled,
    };
  }
  if (!enrichEnabled) {
    return publicEnrichment(existing ?? null, { enrichEnabled });
  }

  const force = Boolean(opts?.force);
  if (!force && existing && isFresh(existing, email) && existing.status !== 'pending') {
    return publicEnrichment(existing, { enrichEnabled });
  }

  const key = `${projectId}:${visitorId}`;
  if (inFlight.has(key) || projectBusy.has(projectId)) {
    return publicEnrichment(existing ?? {
      projectId,
      visitorId,
      email,
      status: 'pending',
      personJson: null,
      companyJson: null,
      sourcesJson: [],
      provider: null,
      creditsUsed: 0,
      error: null,
      generatedAt: null,
      updatedAt: new Date(),
    }, { enrichEnabled });
  }

  await upsertRow(db, {
    projectId,
    visitorId,
    email,
    status: 'pending',
    personJson: existing?.personJson ?? null,
    companyJson: existing?.companyJson ?? null,
    sourcesJson: existing?.sourcesJson ?? [],
    provider: existing?.provider ?? 'people-data-labs',
    creditsUsed: existing?.creditsUsed ?? 0,
    error: null,
    generatedAt: existing?.generatedAt ?? null,
  });

  inFlight.add(key);
  projectBusy.add(projectId);
  void (async () => {
    try {
      await runEnrich(db, projectId, visitorId, email!);
    } finally {
      inFlight.delete(key);
      projectBusy.delete(projectId);
    }
  })();

  return {
    status: 'pending',
    email,
    person: null,
    company: null,
    sources: [],
    provider: 'people-data-labs',
    generatedAt: existing?.generatedAt ? String(existing.generatedAt) : null,
    error: null,
    enrichEnabled,
  };
}

export async function loadVisitorEnrichment(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
): Promise<PublicEnrichment> {
  const [row] = await db.select().from(visitorEnrichments)
    .where(and(eq(visitorEnrichments.projectId, projectId), eq(visitorEnrichments.visitorId, visitorId)))
    .limit(1);
  return publicEnrichment(row ?? null);
}
