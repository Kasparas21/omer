/* Omer email section catalog — distilled from Emailify study corpus (see docs/email-anatomy.md).
   Original tokens for our MailDoc / SES HTML. Not a redistribution of Emailify components. */

export const EMAIL_CHROME = {
  width: 600,
  bg: '#F6F6F6',
  fill: '#FAFAFA',
  text: '#1A1A1A',
  muted: '#5B6472',
  faint: '#8B919A',
  rule: '#F0F1F3',
  corners: 16,
  padXBrand: 40,
  padXPersonal: 36,
  bodySize: 16,
  bodyLine: 1.55,
  headSizeBrand: 34,
  headSizePersonal: 26,
  ctaRadius: 999,
  imageRadius: 16,
} as const;

/** Section ids used in MailDoc.order — map to renderers in email-html / Mail.tsx. */
export const EMAIL_SECTIONS = {
  logo: { family: 'header', note: 'Centered wordmark or logo image' },
  hero: { family: 'hero', note: 'Full-bleed lifestyle or product hero' },
  headline: { family: 'single', note: 'Large title under hero or at top' },
  body: { family: 'single', note: 'Short paragraphs; centered brand / left personal' },
  products: { family: 'product', note: '1-up feature or 2-up grid' },
  features: { family: 'feature', note: '2–4 short perk rows (alias of perks list)' },
  perks: { family: 'feature', note: 'Inline trust line under CTA' },
  code: { family: 'promo', note: 'Offer code strip when fact-backed' },
  cta: { family: 'cta', note: 'Pill/table button (brand) or text link (personal)' },
  sig: { family: 'sig', note: 'Sender + signoff' },
  social: { family: 'footer', note: 'Optional social / utility links' },
  footer: { family: 'footer', note: 'Address + unsubscribe' },
  div: { family: 'single', note: 'Hairline divider between digest beats' },
} as const;

export type EmailSectionId = keyof typeof EMAIL_SECTIONS;

/** High-frequency compositions (Colorlib Loop/Shop/Brief/Verge mapped onto our slots). */
export const LAYOUT_RECIPES: Record<string, { order: string[]; kind: 'brand' | 'personal'; blurb: string }> = {
  launch: {
    kind: 'brand',
    blurb: 'Product drop / interest — hero-led single column (Colorlib Loop / Sonos pattern)',
    order: ['hero', 'headline', 'body.0', 'body.1', 'products', 'cta', 'perks', 'sig', 'footer'],
  },
  cart_rescue: {
    kind: 'brand',
    blurb: 'Abandoned cart / winback — hero + product + optional code + CTA (Colorlib Shop / Verge)',
    order: ['hero', 'headline', 'body.0', 'products', 'code', 'cta', 'perks', 'sig', 'footer'],
  },
  compare: {
    kind: 'brand',
    blurb: 'Two options side by side — headline then 2-up product grid',
    order: ['headline', 'body.0', 'body.1', 'products', 'cta', 'perks', 'sig', 'footer'],
  },
  editorial_note: {
    kind: 'personal',
    blurb: 'Letter-like advice — left stack, inset product, text CTA (Colorlib Brief energy)',
    order: ['body.0', 'body.1', 'body.2', 'products', 'cta', 'body.3', 'sig', 'footer'],
  },
  restock: {
    kind: 'brand',
    blurb: 'Back in stock — product feature + CTA + feature list',
    order: ['hero', 'headline', 'body.0', 'products', 'cta', 'features', 'sig', 'footer'],
  },
  digest: {
    kind: 'brand',
    blurb: 'Soft newsletter — headline, beats with dividers, soft CTA (Colorlib Brief)',
    order: ['headline', 'body.0', 'div.0', 'body.1', 'div.1', 'body.2', 'cta', 'sig', 'footer'],
  },
};

export type LayoutRecipeId = keyof typeof LAYOUT_RECIPES;
