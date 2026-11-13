/* Bundle brand docs + approved facts + visitor insight for the future email drafter. */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { loadBrand } from './brand-import';
import { publicVisitorInsight } from './replay-insight';
import { identities, visitorInsights } from './schema';

export async function loadEmailContext(db: NodePgDatabase, projectId: string, visitorId: string) {
  const brand = await loadBrand(db, projectId);
  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
    .limit(1);
  const [insight] = await db.select().from(visitorInsights)
    .where(and(eq(visitorInsights.projectId, projectId), eq(visitorInsights.visitorId, visitorId)))
    .limit(1);

  const facts = (brand.facts || []).filter((f) => !f.review);
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
  };
}
