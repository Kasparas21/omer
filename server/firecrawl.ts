/* Firecrawl client: brand scrapes + Alexandria structured providers (people/company). */
import { randomUUID } from 'node:crypto';

const API = 'https://api.firecrawl.dev/v2';
const MAX_FOLLOW = 3;
const MAX_MD_PAGE = 24_000;
const MAX_MD_TOTAL = 100_000;

export function firecrawlConfigured() {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

function key() {
  const value = process.env.FIRECRAWL_API_KEY?.trim();
  if (!value) throw new Error('FIRECRAWL_API_KEY is not configured');
  return value;
}

export type BrandScrapePage = {
  url: string;
  markdown: string;
  title: string | null;
  description: string | null;
  branding: Record<string, unknown> | null;
  links: string[];
  imageUrls: string[];
  logoUrl: string | null;
};

export type BrandScrapeResult = {
  origin: string;
  pages: BrandScrapePage[];
  combinedMarkdown: string;
  colors: { hex: string; role?: 'main' | 'secondary' | 'accent'; name: string }[];
  fonts: { role: string; family: string }[];
  logoUrl: string | null;
  imageUrls: string[];
  title: string | null;
  description: string | null;
};

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const m = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function luminance(hex: string) {
  const n = hex.slice(1);
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNeutral(hex: string) {
  const lum = luminance(hex);
  return lum > 0.92 || lum < 0.08;
}

function familyFromStack(stack: unknown): string | null {
  if (!Array.isArray(stack) || !stack.length) return null;
  const first = String(stack[0] || '').replace(/["']/g, '').trim();
  if (!first || /^(serif|sans-serif|monospace|system-ui|inherit)$/i.test(first)) return null;
  return first;
}

function brandingColors(branding: Record<string, unknown> | null) {
  const colors = (branding?.colors ?? {}) as Record<string, string | undefined>;
  const components = (branding?.components ?? {}) as {
    buttonPrimary?: { background?: string };
    buttonSecondary?: { background?: string };
  };
  const candidates = [colors.primary, colors.accent, colors.link, components.buttonPrimary?.background, colors.secondary]
    .map(normalizeHex)
    .filter((v): v is string => Boolean(v));
  const vivid = candidates.filter((h) => !isNeutral(h));
  const main = vivid[0] || candidates[0];
  const secondary = normalizeHex(colors.secondary) && !isNeutral(normalizeHex(colors.secondary)!)
    ? normalizeHex(colors.secondary)!
    : vivid.find((h) => h !== main) || normalizeHex(components.buttonSecondary?.background);
  const accent = vivid.find((h) => h !== main && h !== secondary) || normalizeHex(colors.accent) || normalizeHex(colors.link);
  const out: BrandScrapeResult['colors'] = [];
  if (main) out.push({ hex: main, role: 'main', name: 'Main color' });
  if (secondary) out.push({ hex: secondary, role: 'secondary', name: 'Secondary color' });
  if (accent) out.push({ hex: accent, role: 'accent', name: 'Accent color' });
  return out;
}

function brandingFonts(branding: Record<string, unknown> | null) {
  const typography = (branding?.typography ?? {}) as {
    fontFamilies?: { primary?: string[]; heading?: string[]; body?: string[] };
  };
  const families = typography.fontFamilies || {};
  const heading = familyFromStack(families.heading) || familyFromStack(families.primary);
  const body = familyFromStack(families.body) || familyFromStack(families.primary);
  const fonts: BrandScrapeResult['fonts'] = [
    { role: 'Headings', family: heading || '' },
    { role: 'Body', family: body || heading || '' },
  ];
  return fonts;
}

async function fc<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Firecrawl ${path} ${res.status}: ${JSON.stringify(json).slice(0, 280)}`);
  }
  return json as T;
}

type ScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    branding?: Record<string, unknown>;
    links?: string[];
    images?: Array<string | { url?: string }>;
    metadata?: Record<string, unknown>;
  };
};

function pickImages(data: ScrapeResponse['data']): string[] {
  const raw = data?.images || [];
  const urls: string[] = [];
  for (const item of raw) {
    const url = typeof item === 'string' ? item : item?.url;
    if (url && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= 12) break;
  }
  return urls;
}

function pickLogo(branding: Record<string, unknown> | null, images: string[]): string | null {
  const logo = branding?.logo;
  if (typeof logo === 'string' && /^https?:\/\//i.test(logo)) return logo;
  if (logo && typeof logo === 'object' && typeof (logo as { url?: string }).url === 'string') {
    const url = (logo as { url: string }).url;
    if (/^https?:\/\//i.test(url)) return url;
  }
  return images.find((u) => /logo/i.test(u)) || null;
}

async function scrapeOne(url: string, formats: string[]): Promise<BrandScrapePage> {
  const res = await fc<ScrapeResponse>('/scrape', {
    url,
    formats,
    onlyMainContent: true,
    proxy: 'auto',
    blockAds: true,
    maxAge: 86_400_000,
  });
  const data = res.data || {};
  const branding = (data.branding as Record<string, unknown>) || null;
  const imageUrls = pickImages(data);
  const meta = (data.metadata || {}) as Record<string, unknown>;
  return {
    url,
    markdown: String(data.markdown || '').slice(0, MAX_MD_PAGE),
    title: typeof meta.title === 'string' ? meta.title : null,
    description: typeof meta.description === 'string' ? meta.description : null,
    branding,
    links: Array.isArray(data.links) ? data.links.filter((l): l is string => typeof l === 'string') : [],
    imageUrls,
    logoUrl: pickLogo(branding, imageUrls),
  };
}

function scorePath(pathname: string) {
  const p = pathname.toLowerCase();
  if (/\/(cart|login|account|checkout|wp-admin|privacy|terms|cookie)/.test(p)) return 0;
  if (/\/(pricing|price|plans)/.test(p)) return 100;
  if (/\/(about|story|our-story)/.test(p)) return 90;
  if (/\/(product|products|shop|collections|features)/.test(p)) return 85;
  if (/\/(faq|shipping|returns|guarantee)/.test(p)) return 70;
  if (/\/(customers|press|reviews)/.test(p)) return 65;
  if (/\/(blog|news)/.test(p)) return 10;
  return 20;
}

async function discoverFollowUps(origin: string, homeLinks: string[]): Promise<string[]> {
  const base = new URL(origin);
  const candidates = new Map<string, number>();
  const consider = (href: string) => {
    try {
      const url = new URL(href, origin);
      if (url.origin !== base.origin) return;
      const path = url.pathname || '/';
      if (path === '/' || path === '') return;
      const score = scorePath(path);
      if (score <= 0) return;
      const clean = `${url.origin}${path}`;
      candidates.set(clean, Math.max(candidates.get(clean) || 0, score));
    } catch { /* ignore */ }
  };
  for (const link of homeLinks) consider(link);

  try {
    const mapped = await fc<{ success?: boolean; links?: Array<string | { url?: string }> }>('/map', {
      url: origin,
      limit: 25,
      sitemap: 'include',
      ignoreQueryParameters: true,
      search: 'about pricing product features shipping',
    });
    for (const item of mapped.links || []) {
      const href = typeof item === 'string' ? item : item?.url;
      if (href) consider(href);
    }
  } catch {
    // Map is best-effort — homepage links are enough.
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FOLLOW)
    .map(([url]) => url);
}

function combineMarkdown(pages: BrandScrapePage[]) {
  let total = 0;
  const chunks: string[] = [];
  for (const page of pages) {
    if (!page.markdown.trim()) continue;
    const block = `# Source: ${page.url}\n\n${page.markdown}`.slice(0, MAX_MD_PAGE);
    if (total + block.length > MAX_MD_TOTAL) break;
    chunks.push(block);
    total += block.length;
  }
  return chunks.join('\n\n---\n\n');
}

/** Cheap markdown-only scrape for a monitored path. */
export async function scrapeMonitorPath(url: string): Promise<{ url: string; markdown: string }> {
  const page = await scrapeOne(url, ['markdown']);
  return { url: page.url, markdown: page.markdown };
}

/** Scrape the store origin for brand assets + grounded markdown. */
export type AlexandriaCall = {
  provider: string;
  capability: string;
  options: Record<string, unknown>;
};

export type AlexandriaResult = {
  success: boolean;
  provider: string;
  capability: string;
  creditsCost: number;
  data: unknown;
  error: string | null;
};

type AlexandriaScrapeResponse = {
  success?: boolean;
  data?: {
    alexandria?: Array<{
      success?: boolean;
      provider?: string;
      capability?: string;
      creditsCost?: number;
      data?: unknown;
      error?: string | { message?: string };
    }>;
  };
  alexandria?: Array<{
    success?: boolean;
    provider?: string;
    capability?: string;
    creditsCost?: number;
    data?: unknown;
    error?: string | { message?: string };
  }>;
  error?: string;
};

/** Run one Alexandria provider capability via Firecrawl scrape (no URL required). */
export async function alexandriaCall(input: AlexandriaCall): Promise<AlexandriaResult> {
  const requestId = randomUUID();
  const res = await fetch(`${API}/scrape`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ alexandria: input }),
  });
  const json = await res.json().catch(() => ({})) as AlexandriaScrapeResponse;
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : JSON.stringify(json).slice(0, 280);
    throw new Error(`Alexandria ${input.provider}/${input.capability} ${res.status}: ${msg}`);
  }
  const rows = json.data?.alexandria ?? json.alexandria ?? [];
  const row = rows[0];
  if (!row) {
    return {
      success: false,
      provider: input.provider,
      capability: input.capability,
      creditsCost: 0,
      data: null,
      error: 'Empty Alexandria response.',
    };
  }
  const err = row.error;
  const errText = typeof err === 'string' ? err : err?.message || null;
  return {
    success: row.success !== false && !errText,
    provider: row.provider || input.provider,
    capability: row.capability || input.capability,
    creditsCost: Number(row.creditsCost) || 0,
    data: row.data ?? null,
    error: errText,
  };
}

export async function scrapeBrandSite(origin: string): Promise<BrandScrapeResult> {
  const home = await scrapeOne(origin, ['markdown', 'branding', 'links', 'images']);
  const follow = await discoverFollowUps(origin, home.links);
  const extras: BrandScrapePage[] = [];
  for (const url of follow) {
    try {
      extras.push(await scrapeOne(url, ['markdown', 'images']));
    } catch {
      // Skip a failed subpage; keep going.
    }
  }
  const pages = [home, ...extras];
  const branding = home.branding;
  const imageUrls = [...new Set(pages.flatMap((p) => p.imageUrls))].slice(0, 16);
  return {
    origin,
    pages,
    combinedMarkdown: combineMarkdown(pages),
    colors: brandingColors(branding),
    fonts: brandingFonts(branding),
    logoUrl: home.logoUrl || pickLogo(branding, imageUrls),
    imageUrls,
    title: home.title,
    description: home.description,
  };
}
