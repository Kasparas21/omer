/* Bundle brand docs + approved facts + visitor insight + Alexandria enrichment for the email drafter. */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { loadBrand } from './brand-import';
import { publicVisitorInsight } from './replay-insight';
import { identities, visitorInsights } from './schema';
import { loadVisitorEnrichment } from './visitor-enrich';

export async function loadEmailContext(db: NodePgDatabase, projectId: string, visitorId: string) {
  const brand = await loadBrand(db, projectId);
  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
    .limit(1);
  const [insight] = await db.select().from(visitorInsights)
    .where(and(eq(visitorInsights.projectId, projectId), eq(visitorInsights.visitorId, visitorId)))
    .limit(1);
  const enrichment = await loadVisitorEnrichment(db, projectId, visitorId);

  const facts = (brand.facts || []).filter((f) => !f.review);
  const person = enrichment.status === 'ready' ? enrichment.person : null;
  const company = enrichment.status === 'ready' ? enrichment.company : null;
  return {
    brand: {
      docs: brand.docs,
      voice: brand.voice,
      facts,
      colors: brand.colors,
      fonts: brand.fonts,
    },
    identity: identity
      ? { email: identity.email, name: identity.name }
      : { email: null, name: null },
    insight: insight?.status === 'ready' ? publicVisitorInsight(insight) : null,
    enrichment: enrichment.status === 'ready' ? {
      name: person?.name || null,
      title: person?.title || null,
      employer: person?.employer || null,
      location: person?.location || null,
      headline: person?.headline || null,
      summary: person?.summary || company?.description || null,
      linkedinUrl: person?.linkedinUrl || null,
      company: company ? {
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        size: company.size,
        website: company.website,
      } : null,
      sources: enrichment.sources.filter((s) => s.kind !== 'provider').map((s) => ({
        label: s.label,
        url: s.url,
      })),
    } : null,
  };
}
