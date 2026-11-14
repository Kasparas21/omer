/* Short dashboard “Brand read” from Brand knowledge (cached on brand JSON). */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { lunaMarkdown } from './brand-docs';
import { loadBrand, saveBrand, type StoredBrand } from './brand-import';
import { openaiConfigured } from './replay-insight';

const FRESH_MS = 7 * 86_400_000;

export type BrandRead = {
  word: string;
  summary: string;
  detail: string;
  generatedAt: string;
  importedAt: string | null;
};

function hasBrandContent(brand: StoredBrand) {
  const voice = (brand.docs?.voice || brand.voice?.tone || '').trim();
  const product = (brand.docs?.product || '').trim();
  return Boolean(brand.importedAt) || voice.length > 40 || product.length > 40;
}

function heuristicRead(brand: StoredBrand): BrandRead {
  const voiceDoc = (brand.docs?.voice || '').trim();
  const productDoc = (brand.docs?.product || '').trim();
  const facts = (brand.facts || []).filter((f) => !f.review);
  const pendingFacts = (brand.facts || []).filter((f) => f.review).length;
  const voiceReady = voiceDoc.length > 80 || (brand.voice.tone || '').trim().length > 20;
  const productReady = productDoc.length > 80;
  let word = 'Thin';
  if (voiceReady && productReady && facts.length >= 3) word = 'Solid';
  else if (voiceReady && productReady) word = 'Ready';
  else if (voiceReady || productReady) word = 'Partial';
  const bits: string[] = [];
  if (brand.voice.tagline) bits.push(brand.voice.tagline);
  else if (voiceReady) bits.push('Voice guide is in place for follow-ups.');
  if (productReady) bits.push('Product information is loaded.');
  if (!bits.length) bits.push('Brand knowledge is started but still light.');
  const detailParts = [
    facts.length ? `${facts.length} approved fact${facts.length === 1 ? '' : 's'}` : null,
    pendingFacts ? `${pendingFacts} awaiting review` : null,
    voiceReady ? 'voice guide ready' : 'voice guide thin',
  ].filter(Boolean);
  return {
    word,
    summary: bits.slice(0, 2).join(' '),
    detail: detailParts.join(' · ') || 'Import more from the website to deepen this read.',
    generatedAt: new Date().toISOString(),
    importedAt: brand.importedAt ?? null,
  };
}

function parseLunaRead(text: string): { word: string; summary: string } | null {
  try {
    const raw = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const obj = JSON.parse(raw) as { word?: unknown; summary?: unknown };
    const word = typeof obj.word === 'string' ? obj.word.trim().slice(0, 24) : '';
    const summary = typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 220) : '';
    if (!word || !summary) return null;
    return { word, summary };
  } catch {
    return null;
  }
}

function cacheFresh(brand: StoredBrand, read: BrandRead | undefined) {
  if (!read?.generatedAt || !read.word || !read.summary) return false;
  if (Date.now() - Date.parse(read.generatedAt) > FRESH_MS) return false;
  const imported = brand.importedAt || null;
  if ((read.importedAt || null) !== imported) return false;
  return true;
}

export async function ensureBrandRead(
  db: NodePgDatabase,
  projectId: string,
  opts?: { force?: boolean },
): Promise<{ read: BrandRead | null; status: 'none' | 'ready' | 'pending' }> {
  const brand = await loadBrand(db, projectId);
  if (!hasBrandContent(brand)) {
    return { read: null, status: 'none' };
  }

  const existing = (brand as StoredBrand & { read?: BrandRead }).read;
  if (!opts?.force && cacheFresh(brand, existing)) {
    return { read: existing!, status: 'ready' };
  }

  const base = heuristicRead(brand);
  let read = base;

  if (openaiConfigured()) {
    try {
      const system = `You write a tiny brand-read for a store dashboard card.
Return ONLY JSON: {"word":"…","summary":"…"}.
- word: one short adjective (Ready, Clear, Warm, Solid, Thin, Partial) matching how complete and usable the brand docs feel for writing follow-up emails.
- summary: one or two short sentences grounded ONLY in the provided voice/product text. No invented offers, prices, or benchmarks. No em dashes.`;
      const user = [
        `Store brand knowledge:`,
        `Tagline: ${brand.voice.tagline || '(none)'}`,
        `Tone: ${(brand.voice.tone || '').slice(0, 400)}`,
        '',
        '## Voice guide (excerpt)',
        (brand.docs?.voice || '').slice(0, 2500) || '(empty)',
        '',
        '## Product information (excerpt)',
        (brand.docs?.product || '').slice(0, 2500) || '(empty)',
        '',
        `Approved facts: ${(brand.facts || []).filter((f) => !f.review).length}`,
        `Facts awaiting review: ${(brand.facts || []).filter((f) => f.review).length}`,
      ].join('\n');
      const text = await lunaMarkdown(system, user);
      const parsed = parseLunaRead(text);
      if (parsed) {
        read = {
          word: parsed.word,
          summary: parsed.summary,
          detail: base.detail,
          generatedAt: new Date().toISOString(),
          importedAt: brand.importedAt ?? null,
        };
      }
    } catch {
      // Keep heuristic read.
    }
  }

  const next: StoredBrand & { read: BrandRead } = { ...brand, read };
  await saveBrand(db, projectId, next);
  return { read, status: 'ready' };
}
