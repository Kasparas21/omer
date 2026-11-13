/* Page style + mail brand from stored brand (server twin of campaignMail helpers). */
import type { StoredBrand } from './brand-import';
import type { MailBrandLike, PageStyleLike } from './email-html';

const SAFE_FONTS = new Set(['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS']);

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
  return {
    bg: secondary && /^#[0-9a-f]{6}$/i.test(secondary) ? secondary : '#F5F5F7',
    fill: '#FFFFFF',
    text: '#2B2D33',
    accent: /^#[0-9a-f]{6}$/i.test(main) ? main : '#2B2D33',
    headFont: fontOf('Headings', 'Inter'),
    bodyFont: fontOf('Body', 'Inter'),
    size: 15,
    width: 520,
    corners: 12,
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
