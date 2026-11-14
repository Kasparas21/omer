/* Page style + mail brand from stored brand (server twin of campaignMail helpers). */
import type { StoredBrand } from './brand-import';
import type { MailBrandLike, MailSkin, PageStyleLike } from './email-html';

const SAFE_FONTS = new Set(['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS']);

const SKIN_HINTS: Record<MailSkin, RegExp> = {
  professional: /\b(professional|corporate|enterprise|formal|premium|luxury|minimal|refined|serious|b2b|consult|legal|financ|clinic|medical|trust)\b/i,
  playful: /\b(playful|fun|witty|warm|friendly|casual|bold|colorful|colourful|quirky|cheerful|energetic|gen-?z|youth|pet|kids?|toy|beauty|lifestyle)\b/i,
  modern: /\b(modern|clean|simple|direct|product|saas|tech|startup|digital)\b/i,
};

/** Infer visual skin from brand voice / product docs. Recipe picks structure; skin picks chrome. */
export function skinFromBrand(brand: StoredBrand): MailSkin {
  const blob = [
    brand.voice?.tone || '',
    brand.voice?.tagline || '',
    brand.voice?.about || '',
    (brand.docs?.voice || '').slice(0, 1200),
    (brand.docs?.product || '').slice(0, 600),
  ].join('\n');
  const scores: Record<MailSkin, number> = { professional: 0, modern: 0, playful: 0 };
  for (const skin of Object.keys(SKIN_HINTS) as MailSkin[]) {
    const hits = blob.match(new RegExp(SKIN_HINTS[skin].source, 'gi'));
    scores[skin] = hits?.length || 0;
  }
  // Strong playful/professional beats default modern.
  if (scores.playful >= 2 && scores.playful >= scores.professional) return 'playful';
  if (scores.professional >= 2 && scores.professional > scores.playful) return 'professional';
  if (scores.playful === 1 && scores.professional === 0) return 'playful';
  if (scores.professional === 1 && scores.playful === 0) return 'professional';
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
    // Lighten very dark secondary washes so the email card still pops.
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.35) return fallback;
    return hex;
  }
  return fallback;
}

export function pageFromBrand(brand: StoredBrand): PageStyleLike {
  const main = brand.colors.find((c) => c.role === 'main')?.hex
    || brand.colors[0]?.hex
    || '#2B2D33';
  const secondary = brand.colors.find((c) => c.role === 'secondary')?.hex;
  const fontOf = (role: string, fallback: string) => {
    const family = brand.fonts.find((f) => f.role === role)?.family?.trim();
    if (family && SAFE_FONTS.has(family)) return family;
    if (family) return 'Helvetica';
    return fallback;
  };
  const skin = skinFromBrand(brand);
  const chrome = skinChrome(skin);
  const washFallback = skin === 'playful' ? '#F7F3EE' : skin === 'professional' ? '#F3F4F6' : '#F6F6F6';
  return {
    bg: softWash(secondary, washFallback),
    fill: '#FAFAFA',
    text: '#1A1A1A',
    accent: /^#[0-9a-f]{6}$/i.test(main) ? main : '#1A1A1A',
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
    return 'Skin: professional — restrained headline, letter-like clarity, no slang, one precise CTA.';
  }
  if (skin === 'playful') {
    return 'Skin: playful — warmer voice, short punchy headline, still concrete (no jokes that invent claims).';
  }
  return 'Skin: modern — short punchy headline, clean product focus, one clear CTA.';
}
