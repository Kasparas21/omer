/* Import Brand knowledge from the store's website (Firecrawl + Luna). */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BRAND_VOICE_SYSTEM, PRODUCT_INFORMATION_SYSTEM, lunaMarkdown, voiceFieldsFromGuide, wrapScrapedContent } from './brand-docs';
import { firecrawlConfigured, scrapeBrandSite } from './firecrawl';
import { openaiConfigured } from './replay-insight';
import { projectBrand, projects } from './schema';

export type StoredBrandFile = { id: string; name: string; src: string; type?: string };
export type StoredBrand = {
  logos: { primary: StoredBrandFile | null; mark: StoredBrandFile | null; dark: StoredBrandFile | null };
  colors: { id: string; name: string; hex: string; role?: 'main' | 'secondary' | 'accent' }[];
  fonts: { id: string; role: string; family: string; file?: StoredBrandFile | null }[];
  products: { id: string; name: string; price: string; image: StoredBrandFile | null; image2?: StoredBrandFile | null }[];
  photos: StoredBrandFile[];
  voice: { tagline: string; tone: string; about: string };
  docs: { product: string; voice: string };
  monitor: { id: string; path: string; addedAt: string; checkedAt?: string | null; change?: string | null }[];
  importedAt?: string | null;
};

const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function emptyStoredBrand(): StoredBrand {
  return {
    logos: { primary: null, mark: null, dark: null },
    colors: [],
    fonts: [
      { id: 'f1', role: 'Headings', family: '' },
      { id: 'f2', role: 'Body', family: '' },
    ],
    products: [],
    photos: [],
    voice: { tagline: '', tone: '', about: '' },
    docs: { product: '', voice: '' },
    monitor: [],
    importedAt: null,
  };
}

function fileFromUrl(url: string, name: string): StoredBrandFile {
  return { id: id(), name, src: url };
}

export function brandImportReady() {
  return firecrawlConfigured() && openaiConfigured();
}

export async function loadBrand(db: NodePgDatabase, projectId: string): Promise<StoredBrand> {
  const [row] = await db.select().from(projectBrand).where(eq(projectBrand.projectId, projectId)).limit(1);
  if (!row?.data) return emptyStoredBrand();
  return { ...emptyStoredBrand(), ...(row.data as StoredBrand) };
}

export async function saveBrand(db: NodePgDatabase, projectId: string, data: StoredBrand) {
  const now = new Date();
  await db.insert(projectBrand).values({
    projectId,
    data,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: projectBrand.projectId,
    set: { data, updatedAt: now },
  });
}

export async function importBrandFromSite(db: NodePgDatabase, projectId: string, owner: string) {
  if (!brandImportReady()) {
    throw new Error('Brand import needs FIRECRAWL_API_KEY and OPENAI_API_KEY');
  }
  const [project] = await db.select({
    id: projects.id,
    origin: projects.origin,
    name: projects.name,
  }).from(projects).where(and(eq(projects.id, projectId), eq(projects.owner, owner))).limit(1);
  if (!project) throw new Error('Project not found');

  const scrape = await scrapeBrandSite(project.origin);
  if (!scrape.combinedMarkdown.trim()) {
    throw new Error('Could not read enough content from the website');
  }

  const fetchedAt = new Date().toISOString();
  const wrapped = wrapScrapedContent(project.origin, fetchedAt, scrape.combinedMarkdown);
  const languageHint = 'Infer the primary content language from the scrape.';
  const userBase = `${wrapped}\n\nLanguage hint: ${languageHint}\nGenerated on: ${fetchedAt}`;

  const [productDoc, voiceDoc] = await Promise.all([
    lunaMarkdown(PRODUCT_INFORMATION_SYSTEM, `${userBase}\n\nWrite the Product Information document.`),
    lunaMarkdown(BRAND_VOICE_SYSTEM, `${userBase}\n\nWrite the Brand Voice Guide for follow-up emails.`),
  ]);

  const existing = await loadBrand(db, projectId);
  const voice = voiceFieldsFromGuide(voiceDoc, scrape.description || scrape.title || project.name);
  // Prefer site about from product overview if Luna left about empty.
  const aboutMatch = productDoc.match(/## What It Is\s*\n+([\s\S]*?)(?=\n## |\n*$)/i)?.[1]?.trim();
  if (!voice.about && aboutMatch) voice.about = aboutMatch.slice(0, 500);

  const brand: StoredBrand = {
    ...existing,
    logos: {
      primary: scrape.logoUrl ? fileFromUrl(scrape.logoUrl, 'logo') : existing.logos.primary,
      mark: existing.logos.mark,
      dark: existing.logos.dark,
    },
    colors: scrape.colors.length
      ? scrape.colors.map((c) => ({ id: id(), name: c.name, hex: c.hex, role: c.role }))
      : existing.colors,
    fonts: scrape.fonts.some((f) => f.family)
      ? scrape.fonts.map((f, i) => ({ id: `f${i + 1}`, role: f.role, family: f.family }))
      : existing.fonts,
    products: existing.products,
    photos: scrape.imageUrls.slice(0, 8).map((url, i) => fileFromUrl(url, `photo-${i + 1}`)),
    voice: {
      tagline: voice.tagline || existing.voice.tagline,
      tone: voice.tone || existing.voice.tone,
      about: voice.about || existing.voice.about,
    },
    docs: { product: productDoc, voice: voiceDoc },
    monitor: existing.monitor.length ? existing.monitor : [
      { id: id(), path: '/', addedAt: fetchedAt, checkedAt: null, change: null },
    ],
    importedAt: fetchedAt,
  };

  await saveBrand(db, projectId, brand);
  return brand;
}
