/* Table-based HTML + plain text for SES from MailDoc (inbox-safe). */
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
  hero?: { src?: string; img?: string; tag?: string };
  footer?: string;
  order: string[];
};

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
  Georgia: 'Georgia, Times, serif',
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
  const width = Math.min(640, Math.max(480, page.width || 520));
  const head = fontStack(page.headFont);
  const body = fontStack(page.bodyFont);
  const personal = doc.kind === 'personal';
  const ctaHref = tracking.wrapClick(doc.ctaUrl || '#');
  const name = tracking.name || null;

  const blocks: string[] = [];
  if (!personal) {
    blocks.push(brand.logo
      ? `<tr><td style="padding:24px 28px 8px;text-align:left"><img src="${esc(brand.logo)}" alt="${esc(brand.name)}" width="140" style="display:block;max-width:140px;height:auto;border:0" /></td></tr>`
      : `<tr><td style="padding:24px 28px 8px;font-family:${esc(head)};font-size:18px;font-weight:700;color:${esc(page.text)}">${esc(brand.name)}</td></tr>`);
  }

  for (const key of doc.order) {
    const [t, n] = key.split('.');
    if (t === 'headline' && doc.headline) {
      blocks.push(`<tr><td style="padding:12px 28px 4px;font-family:${esc(head)};font-size:26px;line-height:1.25;font-weight:700;color:${esc(page.text)}">${esc(fillName(doc.headline, name))}</td></tr>`);
    } else if (t === 'body') {
      const text = doc.body[Number(n)];
      if (text != null && text.trim()) {
        blocks.push(`<tr><td style="padding:6px 28px;font-family:${esc(body)};font-size:${page.size || 15}px;line-height:1.55;color:${esc(page.text)}">${esc(fillName(text, name))}</td></tr>`);
      }
    } else if (t === 'div') {
      blocks.push(`<tr><td style="padding:10px 28px"><hr style="border:0;border-top:1px solid #E5E7EB;margin:0" /></td></tr>`);
    } else if (t === 'hero' && (doc.hero?.src || doc.hero?.img)) {
      const src = doc.hero.src || doc.hero.img || '';
      blocks.push(`<tr><td style="padding:12px 28px"><img src="${esc(src)}" alt="" width="${width - 56}" style="display:block;width:100%;max-width:${width - 56}px;height:auto;border:0;border-radius:${page.corners || 12}px" />${doc.hero.tag ? `<div style="font-family:${esc(body)};font-size:12px;color:#6B7280;margin-top:6px">${esc(doc.hero.tag)}</div>` : ''}</td></tr>`);
    } else if (t === 'products' && doc.products?.length) {
      const cells = doc.products.map((p) => {
        const img = p.img ? `<img src="${esc(p.img)}" alt="" width="220" style="display:block;width:100%;max-width:220px;height:auto;border:0;border-radius:10px;margin-bottom:8px" />` : '';
        const linkOpen = p.url ? `<a href="${esc(tracking.wrapClick(p.url))}" style="color:inherit;text-decoration:none">` : '';
        const linkClose = p.url ? '</a>' : '';
        return `<td valign="top" style="padding:8px;width:50%">${linkOpen}${img}<div style="font-family:${esc(body)};font-size:14px;color:${esc(page.text)}"><b>${esc(p.name)}</b><br/>${p.was ? `<s style="color:#9CA3AF">${esc(p.was)}</s> ` : ''}${esc(p.now)}${p.note ? `<br/><span style="color:#6B7280;font-size:12px">${esc(p.note)}</span>` : ''}</div>${linkClose}</td>`;
      }).join('');
      blocks.push(`<tr><td style="padding:8px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`);
    } else if (t === 'code' && doc.code) {
      blocks.push(`<tr><td style="padding:12px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:12px"><tr><td style="padding:14px 16px;font-family:${esc(body)};font-size:13px;color:${esc(page.text)}"><b>Your code</b><br/><span style="color:#6B7280">${esc(doc.code.n)}</span></td><td align="right" style="padding:14px 16px;font-family:${esc(head)};font-size:18px;font-weight:700;letter-spacing:0.04em;color:${esc(page.text)}">${esc(doc.code.c)}</td></tr></table></td></tr>`);
    } else if (t === 'cta' && doc.cta) {
      if (personal) {
        blocks.push(`<tr><td style="padding:14px 28px;font-family:${esc(body)};font-size:15px"><a href="${esc(ctaHref)}" style="color:${esc(page.accent)};text-decoration:underline">${esc(fillName(doc.cta, name))} →</a></td></tr>`);
      } else {
        blocks.push(`<tr><td style="padding:16px 28px"><a href="${esc(ctaHref)}" style="display:inline-block;background:${esc(page.accent)};color:#ffffff;font-family:${esc(body)};font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(fillName(doc.cta, name))}</a></td></tr>`);
      }
    } else if (t === 'perks' && doc.perks?.length) {
      blocks.push(`<tr><td style="padding:4px 28px 12px;font-family:${esc(body)};font-size:12.5px;color:#6B7280">${esc(doc.perks.join(' · '))}</td></tr>`);
    } else if (t === 'sig') {
      blocks.push(`<tr><td style="padding:18px 28px 8px;font-family:${esc(body)};font-size:14px;color:${esc(page.text)}"><b>${esc(brand.sender)}</b><br/><span style="color:#6B7280">${esc(brand.signoff)}</span></td></tr>`);
    } else if (t === 'footer') {
      blocks.push(`<tr><td style="padding:8px 28px 24px;font-family:${esc(body)};font-size:12px;line-height:1.5;color:#9CA3AF">${esc(doc.footer || brand.address)}<br/><a href="${esc(tracking.unsubscribeUrl)}" style="color:#9CA3AF">Unsubscribe</a></td></tr>`);
    }
  }

  if (!doc.order.includes('footer')) {
    blocks.push(`<tr><td style="padding:8px 28px 24px;font-family:${esc(body)};font-size:12px;line-height:1.5;color:#9CA3AF">${esc(brand.address)}<br/><a href="${esc(tracking.unsubscribeUrl)}" style="color:#9CA3AF">Unsubscribe</a></td></tr>`);
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" />
${doc.preview ? `<meta name="description" content="${esc(doc.preview)}" />` : ''}
<title>${esc(doc.subject)}</title></head>
<body style="margin:0;padding:0;background:${esc(page.bg)};">
<img src="${esc(tracking.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${esc(page.bg)};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${width}px;background:${esc(page.fill)};border-radius:${page.corners || 12}px;overflow:hidden">
${blocks.join('\n')}
</table>
</td></tr></table>
</body></html>`;
}
