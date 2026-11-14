/* Hourly Firecrawl re-scrape of brand.monitor paths → hashes, changes, fact review, optional doc refresh. */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  BRAND_VOICE_SYSTEM, PRODUCT_INFORMATION_SYSTEM, lunaMarkdown, voiceFieldsFromGuide, wrapScrapedContent,
} from './brand-docs';
import { contentHash, factsFromProductDoc, pathWantsProductRefresh, pathWantsVoiceRefresh, summarizeChange } from './brand-facts';
import { loadBrand, saveBrand, type StoredBrand, type StoredMonitor } from './brand-import';
import { firecrawlConfigured, scrapeMonitorPath } from './firecrawl';
import { openaiConfigured } from './replay-insight';
import { projectBrand, projects } from './schema';

const MAX_PAGES_PER_RUN = 8;
const MAX_PROJECTS_PER_RUN = 12;
const STALE_MS = 55 * 60 * 1000;

const nid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function due(page: StoredMonitor, now: number) {
  if (!page.checkedAt) return true;
  const t = Date.parse(page.checkedAt);
  return !Number.isFinite(t) || now - t >= STALE_MS;
}

async function checkProject(db: NodePgDatabase, projectId: string, origin: string, name: string) {
  if (!firecrawlConfigured()) return;
  const brand = await loadBrand(db, projectId);
  const pages = brand.monitor || [];
  if (!pages.length) return;

  const now = Date.now();
  const duePages = pages.filter((p) => due(p, now)).slice(0, MAX_PAGES_PER_RUN);
  if (!duePages.length) return;

  let next: StoredBrand = { ...brand, monitor: [...pages], changes: [...(brand.changes || [])], facts: [...(brand.facts || [])] };
  let wantProduct = false;
  let wantVoice = false;
  const refreshChunks: string[] = [];

  for (const page of duePages) {
    const url = new URL(page.path || '/', origin).toString();
    try {
      const scraped = await scrapeMonitorPath(url);
      const hash = contentHash(scraped.markdown || '');
      const checkedAt = new Date().toISOString();
      const idx = next.monitor.findIndex((m) => m.id === page.id);
      if (idx < 0) continue;
      const prev = next.monitor[idx];
      const changed = Boolean(prev.hash && hash && prev.hash !== hash);
      const change = changed
        ? summarizeChange(prev.lastMarkdown || '', scraped.markdown || '')
        : null;
      next.monitor[idx] = {
        ...prev,
        checkedAt,
        hash,
        lastMarkdown: (scraped.markdown || '').slice(0, 4_000),
        change: changed ? change : null,
      };
      if (changed && change) {
        next.changes = [
          { id: nid(), path: page.path, summary: change, at: checkedAt, seen: false },
          ...(next.changes || []),
        ].slice(0, 40);
        next.facts = (next.facts || []).map((f) => (
          /price|ship|stock|offer|policy|return/i.test(`${f.group} ${f.name} ${f.value}`)
            ? { ...f, review: true }
            : f
        ));
        if (pathWantsProductRefresh(page.path)) wantProduct = true;
        if (pathWantsVoiceRefresh(page.path)) wantVoice = true;
        if (scraped.markdown.trim()) {
          refreshChunks.push(`# Source: ${url}\n\n${scraped.markdown.slice(0, 12_000)}`);
        }
      }
    } catch (error) {
      console.error(`brand-monitor ${projectId} ${page.path}`, error);
      const idx = next.monitor.findIndex((m) => m.id === page.id);
      if (idx >= 0) {
        next.monitor[idx] = { ...next.monitor[idx], checkedAt: new Date().toISOString() };
      }
    }
  }

  if ((wantProduct || wantVoice) && openaiConfigured() && refreshChunks.length) {
    const fetchedAt = new Date().toISOString();
    const wrapped = wrapScrapedContent(origin, fetchedAt, refreshChunks.join('\n\n---\n\n'));
    const userBase = `${wrapped}\n\nLanguage hint: Infer from scrape.\nGenerated on: ${fetchedAt}`;
    try {
      if (wantProduct) {
        const productDoc = await lunaMarkdown(PRODUCT_INFORMATION_SYSTEM, `${userBase}\n\nWrite the Product Information document.`);
        next.docs = { ...next.docs, product: productDoc };
        const parsed = factsFromProductDoc(productDoc);
        const keep = (next.facts || []).filter((f) => f.review !== true || !parsed.some((p) => p.name === f.name));
        next.facts = [...parsed, ...keep].slice(0, 40);
      }
      if (wantVoice) {
        const voiceDoc = await lunaMarkdown(BRAND_VOICE_SYSTEM, `${userBase}\n\nWrite the Brand Voice Guide for follow-up emails.`);
        next.docs = { ...next.docs, voice: voiceDoc };
        const fields = voiceFieldsFromGuide(voiceDoc, name);
        next.voice = {
          tagline: fields.tagline || next.voice.tagline,
          tone: fields.tone || next.voice.tone,
          about: next.voice.about || fields.about,
        };
      }
    } catch (error) {
      console.error(`brand-monitor doc refresh ${projectId}`, error);
    }
  }

  await saveBrand(db, projectId, next);
}

/** Run one monitoring pass across projects that have monitored paths. */
export async function runBrandMonitoring(db: NodePgDatabase) {
  if (!firecrawlConfigured()) return { checked: 0 };
  const rows = await db.select({
    projectId: projectBrand.projectId,
    origin: projects.origin,
    name: projects.name,
  }).from(projectBrand).innerJoin(projects, eq(projects.id, projectBrand.projectId)).limit(MAX_PROJECTS_PER_RUN);

  let checked = 0;
  for (const row of rows) {
    try {
      await checkProject(db, row.projectId, row.origin, row.name);
      checked += 1;
    } catch (error) {
      console.error(`brand-monitor project ${row.projectId}`, error);
    }
  }
  return { checked };
}
