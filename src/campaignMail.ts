/* A store's own campaign email: where a new one starts (blank, in the store's colours and fonts, for you to
   write), the store as the email shows it (name, logo, who signs it), and getting an image to a lasting
   address so the email can show it in any inbox. */
import { FONTS, type MailBrand } from './Mail';
import { PAGE_STYLE, type MailDoc, type PageStyle } from './storeData';
import type { Brand, BrandFile } from './brandStore';

export function storeMailBrand(storeName: string, brand: Brand, sender?: string, host?: string): MailBrand {
  const logo = brand.logos.primary ?? brand.logos.mark;
  return { name: storeName, logo: logo?.src || undefined, sender: sender?.trim() || storeName, signoff: storeName, address: host ? `${storeName} · ${host}` : storeName };
}

const FONT_ALIASES: Record<string, (typeof FONTS)[number]> = {
  arial: 'Arial',
  helvetica: 'Helvetica',
  'helvetica neue': 'Helvetica',
  inter: 'Inter',
  roboto: 'Helvetica',
  'open sans': 'Helvetica',
  montserrat: 'Helvetica',
  poppins: 'Helvetica',
  lato: 'Helvetica',
  'system-ui': 'Helvetica',
  'sans-serif': 'Helvetica',
  georgia: 'Georgia',
  'times new roman': 'Times New Roman',
  times: 'Times New Roman',
  serif: 'Georgia',
  verdana: 'Verdana',
  tahoma: 'Tahoma',
  'trebuchet ms': 'Trebuchet MS',
};

function mapFont(family: string | undefined, fallback: (typeof FONTS)[number]): (typeof FONTS)[number] {
  if (!family?.trim()) return fallback;
  const raw = family.trim().replace(/['"]/g, '');
  if ((FONTS as readonly string[]).includes(raw)) return raw as (typeof FONTS)[number];
  const key = raw.split(',')[0].trim().toLowerCase();
  if (FONT_ALIASES[key]) return FONT_ALIASES[key];
  for (const [alias, mapped] of Object.entries(FONT_ALIASES)) {
    if (key.includes(alias)) return mapped;
  }
  return fallback;
}

function softWash(hex: string | undefined, fallback: string): string {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.35 || lum > 0.96) return fallback;
    return hex;
  }
  return fallback;
}

function skinFromClientBrand(brand: Brand): PageStyle['skin'] {
  const blob = `${brand.voice?.tone || ''} ${brand.voice?.tagline || ''} ${(brand.docs?.voice || '').slice(0, 800)}`.toLowerCase();
  if (/\b(playful|fun|witty|warm|friendly|casual|quirky|pet|kids?|beauty|lifestyle|shop|boutique)\b/.test(blob)) return 'playful';
  if (/\b(professional|corporate|enterprise|formal|premium|luxury|minimal|b2b)\b/.test(blob)) return 'professional';
  const catalog = (brand.products?.length || 0) + (brand.photos?.length || 0);
  if (catalog >= 3) return 'playful';
  return 'modern';
}

/** The store's look: its main colour for buttons, secondary for page wash, fonts where we have them. */
export function storePage(brand: Brand): PageStyle {
  const main = brand.colors.find((c) => c.role === 'main')?.hex || brand.colors[0]?.hex;
  const secondary = brand.colors.find((c) => c.role === 'secondary')?.hex;
  const accent = brand.colors.find((c) => c.role === 'accent')?.hex || main;
  const fontOf = (role: string, fallback: (typeof FONTS)[number]) =>
    mapFont(brand.fonts.find((f) => f.role === role)?.family, fallback);
  const skin = skinFromClientBrand(brand);
  const chrome = skin === 'professional'
    ? { corners: 8, ctaRadius: 8, size: 15, headSize: 30, wash: '#F3F4F6', head: 'Helvetica' as const }
    : skin === 'playful'
      ? { corners: 22, ctaRadius: 999, size: 16, headSize: 38, wash: '#F7F3EE', head: 'Georgia' as const }
      : { corners: 16, ctaRadius: 999, size: 16, headSize: 34, wash: '#F4F5F7', head: 'Georgia' as const };
  return {
    ...PAGE_STYLE,
    bg: softWash(secondary, chrome.wash),
    fill: '#FFFFFF',
    text: '#1A1A1A',
    accent: /^#[0-9a-f]{6}$/i.test(accent ?? '') ? accent! : '#1A1A1A',
    headFont: fontOf('Headings', chrome.head),
    bodyFont: fontOf('Body', 'Helvetica'),
    size: chrome.size,
    width: 600,
    corners: chrome.corners,
    ctaRadius: chrome.ctaRadius,
    headSize: chrome.headSize,
    skin,
  };
}

/** A blank email: you write the subject, headline and message; the button and sign-off are there to edit. */
export function starterMail(): MailDoc {
  return {
    kind: 'brand', subject: '', preview: '', headline: '', body: ['Hi {{first_name}},', ''], cta: 'Shop now', ctaUrl: '',
    order: ['hero', 'headline', 'body.0', 'body.1', 'cta', 'sig', 'footer'], blocks: {},
  };
}

const isProject = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const MAX_INLINE = 300 * 1024;

const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Couldn’t read that image'));
  r.readAsDataURL(blob);
});

/** Uploads an image for a store's email and returns its address. Without image storage on the server, small
    images are kept inside the email itself. The demo store keeps them for this visit only. */
export async function uploadImage(space: string, file: Blob): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('PNG, JPG, WebP or GIF only');
  if (file.size > 5 * 1024 * 1024) throw new Error('Up to 5 MB');
  if (!isProject(space)) return URL.createObjectURL(file);
  const res = await fetch(`/api/projects/${space}/assets`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  if (res.ok) return ((await res.json()) as { url: string }).url;
  if (res.status === 503 && file.size <= MAX_INLINE) return asDataUrl(file);
  const error = ((await res.json().catch(() => ({}))) as { error?: string }).error;
  throw new Error(res.status === 503 ? 'Image storage isn’t set up yet. Use an image under 300 KB.' : error || 'Upload failed');
}

/** A brand photo picked for an email: files only in this browser are uploaded so the email keeps them. */
export async function lastingSrc(space: string, f: BrandFile): Promise<string> {
  if (!f.src.startsWith('blob:')) return f.src;
  const blob: Blob = f.blob ?? await fetch(f.src).then((r) => r.blob());
  return uploadImage(space, blob);
}
