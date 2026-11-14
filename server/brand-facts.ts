/* Parse Product Information markdown into structured store facts + seed monitor paths. */
import { createHash } from 'node:crypto';

export type ParsedFact = { id: string; group: string; name: string; value: string; review?: boolean };

const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function section(markdown: string, heading: string): string {
  const re = new RegExp(`## ${heading}\\s*\\n+([\\s\\S]*?)(?=\\n## |\\n*$)`, 'i');
  return markdown.match(re)?.[1]?.trim() || '';
}

function thin(text: string) {
  return !text || /^(none found|not found)/i.test(text.trim());
}

function bullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s+/, '').trim())
    .filter((line) => line && !thin(line));
}

/** Turn Luna Product Information into facts emails can approve. */
export function factsFromProductDoc(productDoc: string): ParsedFact[] {
  const out: ParsedFact[] = [];
  const push = (group: string, name: string, value: string, review = false) => {
    const v = value.trim();
    if (!v) return;
    out.push({ id: id(), group, name, value: v.slice(0, 400), review: review || thin(v) });
  };

  const promise = section(productDoc, 'What Emails Can Promise');
  for (const line of bullets(promise).slice(0, 6)) {
    push('Offers', line.slice(0, 80), line, false);
  }

  const price = section(productDoc, 'Price & Offers');
  if (price) push('Offers', 'Price & offers', price.replace(/\n+/g, ' ').slice(0, 280), thin(price));

  const shipping = section(productDoc, 'Shipping, Returns & Guarantees');
  if (shipping) push('Policies', 'Shipping, returns & guarantees', shipping.replace(/\n+/g, ' ').slice(0, 280), thin(shipping));

  const who = section(productDoc, "Who It's For");
  if (who && !thin(who)) push('Products', 'Who it’s for', who.replace(/\n+/g, ' ').slice(0, 280), false);

  const what = section(productDoc, 'What It Is');
  if (what && !thin(what)) push('Products', 'What it is', what.replace(/\n+/g, ' ').slice(0, 280), false);

  return out;
}

/** Prefer high-signal paths discovered during import for monitoring. */
export function seedMonitorPaths(origin: string, pageUrls: string[]): { id: string; path: string; addedAt: string; checkedAt: null; change: null }[] {
  const base = new URL(origin);
  const at = new Date().toISOString();
  const paths = new Set<string>(['/']);
  for (const href of pageUrls) {
    try {
      const url = new URL(href, origin);
      if (url.origin !== base.origin) continue;
      const path = url.pathname || '/';
      if (/\/(pricing|price|plans|shipping|returns|about|product|products|shop)/i.test(path)) paths.add(path.replace(/\/+$/, '') || '/');
    } catch { /* ignore */ }
    if (paths.size >= 6) break;
  }
  return [...paths].slice(0, 6).map((path) => ({
    id: id(),
    path,
    addedAt: at,
    checkedAt: null,
    change: null,
  }));
}

export function contentHash(markdown: string) {
  return createHash('sha256').update(markdown.trim()).digest('hex').slice(0, 24);
}

export function summarizeChange(prev: string, next: string): string {
  const a = prev.toLowerCase();
  const b = next.toLowerCase();
  if (/\$\s?\d/.test(a) || /\$\s?\d/.test(b)) {
    const pricesA = a.match(/\$\s?\d[\d,.]*/g) || [];
    const pricesB = b.match(/\$\s?\d[\d,.]*/g) || [];
    if (pricesA[0] && pricesB[0] && pricesA[0] !== pricesB[0]) {
      return `Price changed: ${pricesA[0]} → ${pricesB[0]}`;
    }
  }
  if (/out of stock/i.test(a) && /in stock|available/i.test(b)) return 'Back in stock';
  if (/in stock|available/i.test(a) && /out of stock/i.test(b)) return 'Went out of stock';
  if (/ship/i.test(a) || /ship/i.test(b)) return 'Shipping or policy text changed';
  return 'Page content changed';
}

export function pathWantsProductRefresh(path: string) {
  return /\/(pricing|price|plans|shipping|returns|product|products|shop|collections)/i.test(path) || path === '/';
}

export function pathWantsVoiceRefresh(path: string) {
  return path === '/' || /\/(about|story|our-story)/i.test(path);
}
