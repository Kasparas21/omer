/* Premium, inbox-safe HTML from MailDoc — Colorlib/MJML chrome distilled into tables (docs/email-anatomy.md). */
import { EMAIL_CHROME } from './email-sections';

type Product = { name: string; now: string; was?: string; note?: string; img?: string; url?: string; specs?: [string, string][] };
export type MailDocLike = {
  kind?: 'brand' | 'personal';
  subject: string;
  preview?: string;
  headline: string;
  body: string[];
  products?: Product[];
  code?: { c: string; n: string };
  cta: string;
  ctaUrl?: string;
  perks?: string[];
  /** Feature-list rows (Feature List pattern); falls back to perks when absent. */
  features?: string[];
  /** Optional social / utility labels shown above the footer. */
  social?: string[];
  hero?: { src?: string; img?: string; tag?: string };
  footer?: string;
  order: string[];
  /** Per-block look set in the editor (align, headline size, button width). */
  blocks?: Record<string, { align?: 'left' | 'center'; size?: 's' | 'm' | 'l'; width?: 'fit' | 'full' }>;
};

export type MailSkin = 'professional' | 'modern' | 'playful';

export type PageStyleLike = {
  bg: string;
  fill: string;
  text: string;
  accent: string;
  headFont: string;
  bodyFont: string;
  size: number;
  width: number;
  corners: number;
  /** Button corner radius — 8 professional, 999 modern/playful pill. */
  ctaRadius?: number;
  /** Brand-layout headline size override from skin. */
  headSize?: number;
  skin?: MailSkin;
};

export type MailBrandLike = {
  name: string;
  logo?: string;
  sender: string;
  signoff: string;
  address: string;
};

const STACK: Record<string, string> = {
  Inter: 'Inter, Helvetica, Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Helvetica: 'Helvetica, Arial, sans-serif',
  Georgia: 'Georgia, "Times New Roman", Times, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
  Verdana: 'Verdana, Geneva, sans-serif',
  Tahoma: 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': '"Trebuchet MS", Helvetica, sans-serif',
};

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fillName(text: string, name: string | null) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return text.replace(/\{\{\s*first_name\s*\}\}/gi, first);
}

function fontStack(family: string) {
  return STACK[family] || `${family}, Helvetica, Arial, sans-serif`;
}

/** Pick readable button label color on the brand accent. */
function onAccent(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FAFAFA';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? '#1A1A1A' : '#FAFAFA';
}

export function mailDocToText(
  doc: MailDocLike,
  brand: MailBrandLike,
  opts: { name?: string | null; unsubscribeUrl: string },
) {
  const lines: string[] = [];
  if (doc.headline) lines.push(fillName(doc.headline, opts.name || null));
  for (const p of doc.body || []) if (p.trim()) lines.push(fillName(p, opts.name || null));
  if (doc.products?.length) {
    for (const p of doc.products) lines.push(`${p.name} — ${p.now}${p.note ? ` (${p.note})` : ''}`);
  }
  if (doc.code) lines.push(`Code: ${doc.code.c} — ${doc.code.n}`);
  if (doc.cta) lines.push(`${doc.cta}: ${doc.ctaUrl || ''}`.trim());
  if (doc.perks?.length) lines.push(doc.perks.join(' · '));
  lines.push('');
  lines.push(`${brand.sender} · ${brand.signoff}`);
  lines.push(doc.footer || brand.address);
  lines.push(`Unsubscribe: ${opts.unsubscribeUrl}`);
  return lines.join('\n');
}

function logoRow(brand: MailBrandLike, head: string, text: string, pad = '28px 40px 20px') {
  if (brand.logo) {
    return `<tr><td align="center" style="padding:${pad}"><img src="${esc(brand.logo)}" alt="${esc(brand.name)}" width="120" style="display:block;margin:0 auto;max-width:120px;height:auto;border:0" /></td></tr>`;
  }
  return `<tr><td align="center" style="padding:${pad};font-family:${esc(head)};font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${esc(text)}">${esc(brand.name)}</td></tr>`;
}

function productCard(
  p: Product,
  opts: {
    head: string;
    body: string;
    text: string;
    wrapClick: (u: string) => string;
    /** full = bleed hero-style; inset = padded rounded; grid = half-width column. */
    layout: 'full' | 'inset' | 'grid' | 'price';
    width: number;
    imageRadius: number;
  },
) {
  const imgW = opts.layout === 'full'
    ? opts.width
    : opts.layout === 'inset'
      ? Math.min(opts.width, 520)
      : Math.floor((opts.width - 80) / 2);
  const radius = opts.layout === 'full' ? 0 : opts.imageRadius;
  const img = p.img
    ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" width="${imgW}" style="display:block;width:100%;max-width:${imgW}px;height:auto;border:0;border-radius:${radius}px" />`
    : '';
  const linkOpen = p.url ? `<a href="${esc(opts.wrapClick(p.url))}" style="color:inherit;text-decoration:none">` : '';
  const linkClose = p.url ? '</a>' : '';
  const copyPad = opts.layout === 'price' ? '12px 40px 4px' : opts.layout === 'full' ? '20px 40px 8px' : opts.layout === 'inset' ? '12px 0 0' : '14px 4px 0';
  const align = opts.layout === 'price' ? 'center' : 'left';
  const titleSize = opts.layout === 'full' || opts.layout === 'price' || opts.layout === 'inset' ? 17 : 15;
  return `${linkOpen}${img}<div style="padding:${copyPad};font-family:${esc(opts.body)};color:${esc(opts.text)};text-align:${align}">
    <div style="font-family:${esc(opts.head)};font-size:${titleSize}px;font-weight:600;letter-spacing:-0.02em;line-height:1.3">${esc(p.name)}</div>
    <div style="margin-top:6px;font-size:15px;font-variant-numeric:tabular-nums">${p.was ? `<span style="color:#9CA3AF;text-decoration:line-through;margin-right:8px">${esc(p.was)}</span>` : ''}<span style="font-weight:600">${esc(p.now)}</span></div>
    ${p.note ? `<div style="margin-top:4px;font-size:13px;color:#6B7280;line-height:1.4">${esc(p.note)}</div>` : ''}
  </div>${linkClose}`;
}

/** Outlook-safe table button (Colorlib / MJML pattern). */
function bulletproofCta(opts: {
  href: string;
  label: string;
  accent: string;
  ink: string;
  body: string;
  radius: number;
  full: boolean;
  padX: string;
}) {
  const inner = `<a href="${esc(opts.href)}" style="display:inline-block;background:${esc(opts.accent)};color:${esc(opts.ink)};font-family:${esc(opts.body)};font-size:15px;font-weight:600;letter-spacing:0.01em;text-decoration:none;padding:14px 28px;border-radius:${opts.radius}px;border:1px solid ${esc(opts.accent)};mso-padding-alt:0;text-align:center">${esc(opts.label)}</a>`;
  if (opts.full) {
    return `<tr><td align="center" style="padding:22px ${opts.padX} 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${esc(opts.accent)}" style="background:${esc(opts.accent)};border-radius:${opts.radius}px">
          <a href="${esc(opts.href)}" style="display:block;background:${esc(opts.accent)};color:${esc(opts.ink)};font-family:${esc(opts.body)};font-size:15px;font-weight:600;letter-spacing:0.01em;text-decoration:none;padding:14px 28px;border-radius:${opts.radius}px;border:1px solid ${esc(opts.accent)};text-align:center">${esc(opts.label)}</a>
        </td>
      </tr></table>
    </td></tr>`;
  }
  return `<tr><td align="center" style="padding:22px ${opts.padX} 8px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
      <td align="center" bgcolor="${esc(opts.accent)}" style="background:${esc(opts.accent)};border-radius:${opts.radius}px">
        ${inner}
      </td>
    </tr></table>
  </td></tr>`;
}

export function mailDocToHtml(
  doc: MailDocLike,
  page: PageStyleLike,
  brand: MailBrandLike,
  tracking: {
    openPixel: string;
    unsubscribeUrl: string;
    wrapClick: (url: string) => string;
    name?: string | null;
  },
) {
  const width = Math.min(640, Math.max(560, page.width || EMAIL_CHROME.width));
  const head = fontStack(page.headFont);
  const body = fontStack(page.bodyFont);
  const personal = doc.kind === 'personal';
  const ctaHref = tracking.wrapClick(doc.ctaUrl || '#');
  const name = tracking.name || null;
  const accent = page.accent || EMAIL_CHROME.text;
  const btnInk = onAccent(accent);
  const align = personal ? 'left' : 'center';
  const padX = personal ? `${EMAIL_CHROME.padXPersonal}px` : `${EMAIL_CHROME.padXBrand}px`;
  const textColor = page.text || EMAIL_CHROME.text;
  const muted = '#5B6472';
  const featureRows = (doc.features?.length ? doc.features : doc.perks) || [];
  const ctaRadius = page.ctaRadius ?? EMAIL_CHROME.ctaRadius;
  const imageRadius = Math.min(page.corners ?? EMAIL_CHROME.imageRadius, 20);
  const cardRadius = Math.min(page.corners || 16, 24);
  const fill = page.fill || EMAIL_CHROME.fill;
  const bg = page.bg || EMAIL_CHROME.bg;
  const preheader = (doc.preview || doc.subject || '').slice(0, 140);

  // Only brand layouts get an implied hero from a single product image.
  const heroSrc = doc.hero?.src || doc.hero?.img
    || (!personal && doc.products?.length === 1 ? doc.products[0].img : undefined);
  const order = [...doc.order];
  // Prefer hero before copy when we have imagery (premium launch layout).
  if (!personal && heroSrc && !order.includes('hero')) {
    const insertAt = order.findIndex((k) => k === 'headline' || k.startsWith('body'));
    order.splice(insertAt < 0 ? 0 : insertAt, 0, 'hero');
  }

  const blocks: string[] = [];
  let showedLogo = false;
  const ensureLogo = (tight = false) => {
    if (showedLogo || personal) return;
    showedLogo = true;
    blocks.push(logoRow(brand, head, textColor, tight ? '22px 40px 12px' : '32px 40px 8px'));
  };

  const look = (k: string) => doc.blocks?.[k] ?? {};
  const alignOf = (k: string) => look(k).align ?? align;
  const defaultHead = page.headSize || (personal ? EMAIL_CHROME.headSizePersonal : EMAIL_CHROME.headSizeBrand);

  for (const key of order) {
    const [t, n] = key.split('.');
    if (t === 'hero') {
      const src = doc.hero?.src || doc.hero?.img || heroSrc;
      if (!src) continue;
      ensureLogo(true);
      const alt = doc.headline || brand.name;
      blocks.push(`<tr><td style="padding:0;font-size:0;line-height:0">
        <img src="${esc(src)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0" />
        ${doc.hero?.tag ? `<div style="padding:10px ${padX} 0;font-family:${esc(body)};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${esc(muted)};text-align:${align}">${esc(doc.hero.tag)}</div>` : ''}
      </td></tr>`);
      continue;
    }

    if (t === 'headline' && doc.headline) {
      ensureLogo();
      const hSize = { s: Math.round(defaultHead * 0.76), m: defaultHead, l: Math.round(defaultHead * 1.18) }[look(key).size ?? 'm'];
      blocks.push(`<tr><td align="${alignOf(key)}" style="padding:${personal ? '8px' : '28px'} ${padX} 10px;font-family:${esc(head)};font-size:${hSize}px;text-align:${alignOf(key)};line-height:1.15;font-weight:700;letter-spacing:-0.03em;color:${esc(textColor)}">${esc(fillName(doc.headline, name))}</td></tr>`);
      continue;
    }

    if (t === 'body') {
      const text = doc.body[Number(n)];
      if (text == null || !text.trim()) continue;
      ensureLogo();
      const isLead = Number(n) === 0 && !personal;
      blocks.push(`<tr><td align="${alignOf(key)}" style="padding:${isLead ? '4px' : '0'} ${padX} 12px;text-align:${alignOf(key)};font-family:${esc(body)};font-size:${page.size || 16}px;line-height:1.55;color:${esc(personal ? textColor : muted)}">${esc(fillName(text, name))}</td></tr>`);
      continue;
    }

    if (t === 'div') {
      blocks.push(`<tr><td style="padding:8px ${padX}"><hr style="border:0;border-top:1px solid #E5E7EB;margin:0" /></td></tr>`);
      continue;
    }

    if (t === 'products' && doc.products?.length) {
      ensureLogo();
      const single = doc.products.length === 1;
      if (single) {
        const p = doc.products[0];
        const heroShown = !personal && Boolean(heroSrc) && (order.includes('hero') || Boolean(doc.hero?.src || doc.hero?.img));
        const skipImg = Boolean(heroShown && p.img && (p.img === heroSrc || p.img === doc.hero?.src || p.img === doc.hero?.img));
        const layout = skipImg ? 'price' as const : personal || !heroShown ? 'inset' as const : 'full' as const;
        blocks.push(`<tr><td style="padding:${layout === 'price' ? '8px 0 0' : layout === 'inset' ? `16px ${padX} 0` : '20px 0 0'}">${productCard(
          skipImg ? { ...p, img: undefined } : p,
          { head, body, text: textColor, wrapClick: tracking.wrapClick, layout, width, imageRadius },
        )}</td></tr>`);
      } else {
        const cells = doc.products.slice(0, 2).map((p) =>
          `<td valign="top" width="50%" style="padding:8px">${productCard(p, { head, body, text: textColor, wrapClick: tracking.wrapClick, layout: 'grid', width, imageRadius })}</td>`).join('');
        blocks.push(`<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`);
      }
      continue;
    }

    if (t === 'code' && doc.code) {
      blocks.push(`<tr><td style="padding:16px ${padX}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F1F3;border-radius:${Math.min(imageRadius, 16)}px"><tr>
        <td style="padding:18px 20px;font-family:${esc(body)};font-size:13px;color:${esc(textColor)}"><b style="display:block;font-size:14px;margin-bottom:2px">Your code</b><span style="color:${esc(muted)}">${esc(doc.code.n)}</span></td>
        <td align="right" style="padding:18px 20px;font-family:${esc(head)};font-size:20px;font-weight:700;letter-spacing:0.06em;color:${esc(accent)}">${esc(doc.code.c)}</td>
      </tr></table></td></tr>`);
      continue;
    }

    if (t === 'cta' && doc.cta) {
      if (personal) {
        blocks.push(`<tr><td align="left" style="padding:18px ${padX} 8px;font-family:${esc(body)};font-size:16px"><a href="${esc(ctaHref)}" style="color:${esc(accent)};font-weight:600;text-decoration:underline;text-underline-offset:3px">${esc(fillName(doc.cta, name))} →</a></td></tr>`);
      } else {
        blocks.push(bulletproofCta({
          href: ctaHref,
          label: fillName(doc.cta, name),
          accent,
          ink: btnInk,
          body,
          radius: ctaRadius,
          full: look(key).width === 'full',
          padX,
        }));
      }
      continue;
    }

    if ((t === 'perks' || t === 'features') && featureRows.length) {
      if (t === 'features') {
        const rows = featureRows.slice(0, 4).map((f) =>
          `<tr><td style="padding:6px 0;font-family:${esc(body)};font-size:14px;line-height:1.45;color:${esc(muted)};text-align:${align}">
            <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${esc(accent)};margin-right:10px;vertical-align:middle"></span>${esc(f)}
          </td></tr>`).join('');
        blocks.push(`<tr><td style="padding:12px ${padX} 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`);
      } else {
        blocks.push(`<tr><td align="center" style="padding:14px ${padX} 6px;font-family:${esc(body)};font-size:12.5px;line-height:1.5;color:${esc(muted)}">${esc(featureRows.join(' · '))}</td></tr>`);
      }
      continue;
    }

    if (t === 'social' && doc.social?.length) {
      blocks.push(`<tr><td align="center" style="padding:18px ${padX} 0;font-family:${esc(body)};font-size:12px;letter-spacing:0.04em;color:${esc(muted)}">${esc(doc.social.join('  ·  '))}</td></tr>`);
      continue;
    }

    if (t === 'sig') {
      blocks.push(`<tr><td align="${align}" style="padding:28px ${padX} 8px;font-family:${esc(body)};font-size:14px;line-height:1.45;color:${esc(textColor)}"><b style="font-weight:600">${esc(brand.sender)}</b><br/><span style="color:${esc(muted)}">${esc(brand.signoff)}</span></td></tr>`);
      continue;
    }

    if (t === 'footer') {
      blocks.push(`<tr><td align="center" style="padding:20px ${padX} 36px;font-family:${esc(body)};font-size:11.5px;line-height:1.6;color:#8B919A;border-top:1px solid ${EMAIL_CHROME.rule}">
        ${esc(doc.footer || brand.address)}<br/>
        <a href="${esc(tracking.unsubscribeUrl)}" style="color:#8B919A;text-decoration:underline">Unsubscribe</a>
      </td></tr>`);
    }
  }

  if (!order.includes('footer')) {
    blocks.push(`<tr><td align="center" style="padding:20px ${padX} 36px;font-family:${esc(body)};font-size:11.5px;line-height:1.6;color:#8B919A;border-top:1px solid ${EMAIL_CHROME.rule}">
      ${esc(brand.address)}<br/><a href="${esc(tracking.unsubscribeUrl)}" style="color:#8B919A;text-decoration:underline">Unsubscribe</a>
    </td></tr>`);
  }

  if (!showedLogo && !personal) {
    blocks.unshift(logoRow(brand, head, textColor));
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
${doc.preview ? `<meta name="description" content="${esc(doc.preview)}" />` : ''}
<title>${esc(doc.subject)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>table,td{font-family:Helvetica,Arial,sans-serif !important}</style>
<![endif]-->
<style type="text/css">
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
a{text-decoration:none}
@media (prefers-color-scheme: dark) {
  .ml-shell { background-color: #1C1C1E !important; }
  .ml-card { background-color: #2C2C2E !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${esc(bg)};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(preheader)}${'&nbsp;&zwnj;'.repeat(30)}</div>
<img src="${esc(tracking.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;overflow:hidden" />
<table role="presentation" class="ml-shell" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${esc(bg)};padding:32px 12px">
<tr><td align="center">
<!--[if mso]>
<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td>
<![endif]-->
<table role="presentation" class="ml-card" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;background:${esc(fill)};border-radius:${cardRadius}px;overflow:hidden">
${blocks.join('\n')}
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</td></tr></table>
</body>
</html>`;
}
