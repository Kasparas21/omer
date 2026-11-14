/* Page style + mail brand from stored brand (server twin of campaignMail helpers). */
import type { StoredBrand } from './brand-import';
import type { MailBrandLike, MailSkin, PageStyleLike } from './email-html';

const SAFE_FONTS = new Set(['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS']);

/** Map common scraped / web font names onto inbox-safe stacks. */
const FONT_ALIASES: Record<string, string> = {
  arial: 'Arial',
  helvetica: 'Helvetica',
  'helvetica neue': 'Helvetica',
  inter: 'Inter',
  roboto: 'Helvetica',
  'open sans': 'Helvetica',
  'source sans': 'Helvetica',
  montserrat: 'Helvetica',
  poppins: 'Helvetica',
  lato: 'Helvetica',
  nunito: 'Helvetica',
  'sf pro': 'Helvetica',
  'sf pro text': 'Helvetica',
  'sf pro display': 'Helvetica',
  'system-ui': 'Helvetica',
  'sans-serif': 'Helvetica',
  'ui-sans-serif': 'Helvetica',
  georgia: 'Georgia',
  'times new roman': 'Times New Roman',
  times: 'Times New Roman',
  serif: 'Georgia',
  verdana: 'Verdana',
  tahoma: 'Tahoma',
  'trebuchet ms': 'Trebuchet MS',
  trebuchet: 'Trebuchet MS',
};

const SKIN_HINTS: Record<MailSkin, RegExp> = {
  professional: /\b(professional|corporate|enterprise|formal|premium|luxury|minimal|refined|serious|b2b|consult|legal|financ|clinic|medical|trust)\b/i,
  playful: /\b(playful|fun|witty|warm|friendly|casual|bold|colorful|colourful|quirky|cheerful|energetic|gen-?z|youth|pet|kids?|toy|beauty|lifestyle|shop|store|boutique)\b/i,
  modern: /\b(modern|clean|simple|direct|product|saas|tech|startup|digital|e-?comm|commerce)\b/i,
};

function mapFontFamily(family: string | undefined, fallback: string): string {
  if (!family?.trim()) return fallback;
  const raw = family.trim().replace(/['"]/g, '');
  if (SAFE_FONTS.has(raw)) return raw;
  const key = raw.split(',')[0].trim().toLowerCase();
  if (FONT_ALIASES[key]) return FONT_ALIASES[key];
  for (const [alias, mapped] of Object.entries(FONT_ALIASES)) {
    if (key.includes(alias)) return mapped;
  }
  return fallback;
}

function voiceBlob(brand: StoredBrand) {
  return [
    brand.voice?.tone || '',
    brand.voice?.tagline || '',
    brand.voice?.about || '',
    (brand.docs?.voice || '').slice(0, 1200),
    (brand.docs?.product || '').slice(0, 600),
  ].join('\n');
}

/** Infer visual skin from brand voice / product docs. Recipe picks structure; skin picks chrome. */
export function skinFromBrand(brand: StoredBrand): MailSkin {
  const blob = voiceBlob(brand);
  const scores: Record<MailSkin, number> = { professional: 0, modern: 0, playful: 0 };
  for (const skin of Object.keys(SKIN_HINTS) as MailSkin[]) {
    const hits = blob.match(new RegExp(SKIN_HINTS[skin].source, 'gi'));
    scores[skin] = hits?.length || 0;
  }
  if (scores.playful >= 2 && scores.playful >= scores.professional) return 'playful';
  if (scores.professional >= 2 && scores.professional > scores.playful) return 'professional';
  if (scores.playful === 1 && scores.professional === 0) return 'playful';
  if (scores.professional === 1 && scores.playful === 0) return 'professional';
  if (scores.modern >= 1) return 'modern';

  // Shallow scrape (common for small sites): lean modern/playful from catalog signal, not grey corporate.
  const catalogSignal = (brand.products?.length || 0) + (brand.photos?.length || 0);
  if (catalogSignal >= 3) return 'playful';
  if (catalogSignal >= 1) return 'modern';
  return 'modern';
}

export function skinChrome(skin: MailSkin): Pick<PageStyleLike, 'corners' | 'ctaRadius' | 'size' | 'headSize'> {
  if (skin === 'professional') {
    return { corners: 8, ctaRadius: 8, size: 15, headSize: 30 };
  }
  if (skin === 'playful') {
    return { corners: 22, ctaRadius: 999, size: 16, headSize: 38 };
  }
  return { corners: 16, ctaRadius: 999, size: 16, headSize: 34 };
}

/** Soft page wash for dark-mode resilience (avoid pure #fff / #000). */
function softWash(hex: string | undefined, fallback: string): string {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.35) return fallback;
    if (lum > 0.96) return fallback;
    return hex;
  }
  return fallback;
}

function hexOr(hex: string | undefined, fallback: string) {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
}

export function pageFromBrand(brand: StoredBrand): PageStyleLike {
  const main = brand.colors.find((c) => c.role === 'main')?.hex
    || brand.colors[0]?.hex;
  const secondary = brand.colors.find((c) => c.role === 'secondary')?.hex;
  const accentColor = brand.colors.find((c) => c.role === 'accent')?.hex
    || main;
  const fontOf = (role: string, fallback: string) => {
    const family = brand.fonts.find((f) => f.role === role)?.family?.trim();
    return mapFontFamily(family, fallback);
  };
  const skin = skinFromBrand(brand);
  const chrome = skinChrome(skin);
  const washFallback = skin === 'playful' ? '#F7F3EE' : skin === 'professional' ? '#F3F4F6' : '#F4F5F7';
  return {
    bg: softWash(secondary, washFallback),
    fill: '#FFFFFF',
    text: '#1A1A1A',
    accent: hexOr(accentColor, '#1A1A1A'),
    headFont: fontOf('Headings', skin === 'professional' ? 'Helvetica' : 'Georgia'),
    bodyFont: fontOf('Body', 'Helvetica'),
    size: chrome.size,
    width: 600,
    corners: chrome.corners,
    ctaRadius: chrome.ctaRadius,
    headSize: chrome.headSize,
    skin,
  };
}

export function brandFromStore(storeName: string, brand: StoredBrand, host?: string): MailBrandLike {
  const logo = brand.logos.primary ?? brand.logos.mark;
  return {
    name: storeName,
    logo: logo?.src || undefined,
    sender: storeName,
    signoff: storeName,
    address: host ? `${storeName} · ${host}` : storeName,
  };
}

/** Short cues injected into the Luna draft prompt. */
export function skinPromptCues(skin: MailSkin): string {
  if (skin === 'professional') {
    return 'Skin: professional — restrained headline, letter-like clarity, no slang, one precise CTA. Keep copy short; the email chrome carries the brand.';
  }
  if (skin === 'playful') {
    return 'Skin: playful — warmer voice, short punchy headline, still concrete (no jokes that invent claims). Leave room for logo/product imagery; do not narrate layout.';
  }
  return 'Skin: modern — short punchy headline, clean product focus, one clear CTA. Copy stays tight; brand colors and product image carry polish.';
}
