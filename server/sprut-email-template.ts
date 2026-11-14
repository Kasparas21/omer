/* Exact visual port of Spruit-Email-Demo.html for Sprüt demo follow-ups (email-safe tables). */
export type SprutEmailSlots = {
  subject: string;
  preview?: string;
  topbar?: string;
  headline: string;
  introBody?: string;
  cta: string;
  ctaUrl: string;
  midBody?: string;
  midCta?: string;
  closeHeadline?: string;
  closeFine?: string;
  finalCta?: string;
  firstName?: string | null;
};

export type SprutEmailAssets = {
  /** Green wordmark for light bands */
  logoGreen: string;
  /** White/yellow wordmark for green bands */
  logoOnGreen: string;
  /** Outdoor / lifestyle hero */
  hero: string;
  /** Packshot for benefits band */
  packshot: string;
  /** Garden / daisy lifestyle for offer band */
  garden: string;
};

const GREEN = '#005c36';
const YELLOW = '#ffcc32';
const CREAM = '#fffbed';
const INK = '#002f1d';
const PAGE_BG = '#f0f0ed';

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function btn(label: string, href: string, width = 516) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:29px auto 0">
  <tr>
    <td align="center" bgcolor="${YELLOW}" style="border:2px solid #062e1d;border-bottom-width:6px;border-radius:999px;background:${YELLOW}">
      <a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;line-height:1.1;color:#062e1d;text-decoration:none;min-width:${Math.min(width, 420)}px;text-align:center">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Catalog defaults when brand photos are thin. */
export const SPRUT_DEFAULT_ASSETS: SprutEmailAssets = {
  logoGreen: 'https://sprut-demo-store.vercel.app/assets/brand/logo.png',
  logoOnGreen: 'https://sprut-demo-store.vercel.app/assets/brand/logo-yellow.png',
  hero: 'https://sprut-demo-store.vercel.app/assets/photos/hero-crisp-apple.jpg',
  packshot: 'https://sprut-demo-store.vercel.app/assets/photos/packshot-crisp-apple.jpg',
  garden: 'https://sprut-demo-store.vercel.app/assets/photos/daisies-crisp-apple.jpg',
};

export function renderSprutFollowupHtml(
  slots: SprutEmailSlots,
  assets: SprutEmailAssets,
  opts?: { unsubscribeUrl?: string; openPixel?: string },
): string {
  const topbar = slots.topbar || 'YOUR BERRY BOG CAN SHIP FREE';
  const hi = slots.firstName ? `Hi ${slots.firstName},` : 'Hi there,';
  const intro = slots.introBody || slots.midBody || '';
  const mid = slots.midBody || intro;
  const midCta = slots.midCta || slots.cta;
  const closeH = slots.closeHeadline || 'Don’t miss your chance';
  const closeFine = slots.closeFine || 'COMPLETE YOUR ORDER TODAY';
  const finalCta = slots.finalCta || slots.cta;
  const unsub = opts?.unsubscribeUrl || '#unsubscribe';
  const preview = slots.preview || '';

  // Headline may contain intentional line breaks as " | "
  const headlineHtml = esc(slots.headline).replace(/\s*\|\s*/g, '<br>');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(slots.subject)}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};color:${GREEN}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preview)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};padding:0 0 36px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;margin:0 auto">

  <!-- Topbar (logo-safe green) -->
  <tr>
    <td align="center" bgcolor="${GREEN}" style="background:${GREEN};padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;letter-spacing:.2px;color:#ffdf65">
      ${esc(topbar).replace(/\b(FREE|SHIP|OFF|%\d*|\d+%)\b/gi, (m) => `<b style="color:${YELLOW};font-size:18px">${m}</b>`)}
    </td>
  </tr>

  <!-- Intro -->
  <tr>
    <td align="center" style="padding:28px 38px 8px;background:#ffffff">
      <img src="${esc(assets.logoGreen)}" width="184" alt="sprüt" style="display:block;margin:0 auto 28px;width:184px;max-width:70%;height:auto;border:0" />
      <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-1.4px;color:${GREEN}">${headlineHtml}</h1>
      ${btn(slots.cta, slots.ctaUrl)}
    </td>
  </tr>

  <!-- Hero lifestyle -->
  <tr>
    <td align="center" style="padding:28px 48px 36px;background:#ffffff">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:5px solid ${YELLOW}">
        <tr>
          <td align="center" style="background:#0a83d1">
            <img src="${esc(assets.hero)}" width="490" alt="" style="display:block;width:100%;max-width:490px;height:auto;border:0" />
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Copy + CTA -->
  <tr>
    <td align="center" style="padding:8px 48px 36px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.35;color:${GREEN};background:#ffffff">
      <p style="margin:0 0 8px;font-size:18px;font-weight:600">${esc(hi)}</p>
      <p style="margin:0">${esc(mid)}</p>
      ${btn(midCta, slots.ctaUrl)}
    </td>
  </tr>

  <!-- Benefits / packshot on cream -->
  <tr>
    <td align="center" bgcolor="${CREAM}" style="background:${CREAM};padding:36px 28px 28px">
      <h2 style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.05;font-weight:700;letter-spacing:-1.2px;color:${GREEN}">A smart gummy<br>that fills the gaps</h2>
      <img src="${esc(assets.packshot)}" width="280" alt="Sprüt pouch" style="display:block;margin:0 auto 22px;width:280px;max-width:80%;height:auto;border:0" />
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${GREEN};line-height:1.25">
        <tr>
          <td width="50%" valign="top" style="padding:10px 8px">18 vitamins<br>&amp; minerals</td>
          <td width="50%" valign="top" style="padding:10px 8px" align="right">5g of fiber</td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:10px 8px">Whole food<br>vegetables</td>
          <td width="50%" valign="top" style="padding:10px 8px" align="right">Whole food<br>fruits</td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:10px 8px">Super<br>mushrooms</td>
          <td width="50%" valign="top" style="padding:10px 8px" align="right">Antioxidants</td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:10px 8px">Adaptogens</td>
          <td width="50%" valign="top" style="padding:10px 8px" align="right">Gut health<br>prebiotics</td>
        </tr>
      </table>
      ${btn(slots.cta, slots.ctaUrl)}
    </td>
  </tr>

  <!-- Close -->
  <tr>
    <td align="center" style="padding:40px 28px 12px;background:#ffffff">
      <h2 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.05;font-weight:700;letter-spacing:-1.4px;color:${GREEN}">${esc(closeH).replace(/\s*\|\s*/g, '<br>')}</h2>
      <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:.06em;color:${GREEN}">${esc(closeFine)}</p>
    </td>
  </tr>

  <!-- Garden / offer photo -->
  <tr>
    <td align="center" style="padding:18px 0 0;background:#ffffff">
      <img src="${esc(assets.garden)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0" />
      <div style="padding:0 28px 28px;margin-top:-56px;position:relative">
        ${btn(finalCta, slots.ctaUrl)}
      </div>
    </td>
  </tr>

  <!-- Rating -->
  <tr>
    <td align="center" style="padding:8px 20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${GREEN};background:#ffffff">
      <span style="color:${YELLOW}">★★★★★</span>&nbsp; 4.8 STARS | LOVED BY MEMBERS
    </td>
  </tr>

  <!-- Trust -->
  <tr>
    <td bgcolor="${CREAM}" style="background:${CREAM};padding:28px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.35;color:${GREEN};font-weight:600">
        <tr>
          <td width="50%" valign="top" style="padding:10px">Lab-tested<br>for quality<br>and purity</td>
          <td width="50%" valign="top" style="padding:10px">Made in the US<br>in certified<br>facilities</td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:10px">50+ greens<br>in one tiny<br>daily pack</td>
          <td width="50%" valign="top" style="padding:10px">Always tested for<br>contaminants and<br>heavy metals</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer on green so white/yellow logo stays visible -->
  <tr>
    <td align="center" bgcolor="${GREEN}" style="background:${GREEN};padding:36px 28px 28px">
      <img src="${esc(assets.logoOnGreen)}" width="160" alt="sprüt" style="display:block;margin:0 auto 18px;width:160px;max-width:55%;height:auto;border:0" />
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#fff7df">
        Sprüt puts the “fun” in foundational nutrition!<br>
        Sprüt · sprut-demo-store.vercel.app<br>
        <a href="${esc(unsub)}" style="color:${YELLOW};text-decoration:underline">Unsubscribe</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
${opts?.openPixel ? `<img src="${esc(opts.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />` : ''}
</body>
</html>`;
}

export function renderSprutFollowupText(slots: SprutEmailSlots, opts?: { unsubscribeUrl?: string }) {
  const lines = [
    slots.subject,
    '',
    slots.headline.replace(/\s*\|\s*/g, ' '),
    '',
    slots.firstName ? `Hi ${slots.firstName},` : 'Hi there,',
    slots.introBody || slots.midBody || '',
    '',
    `${slots.cta}: ${slots.ctaUrl}`,
    '',
    slots.closeFine || '',
    opts?.unsubscribeUrl ? `Unsubscribe: ${opts.unsubscribeUrl}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function slotsFromMailDoc(doc: {
  subject?: string;
  preview?: string;
  headline?: string;
  body?: string[];
  cta?: string;
  ctaUrl?: string;
}, firstName?: string | null): SprutEmailSlots {
  const body = Array.isArray(doc.body) ? doc.body.filter((x) => typeof x === 'string') : [];
  const greeting = body.find((b) => /^hi\b/i.test(b.trim()));
  const paras = body.filter((b) => b !== greeting && !/^hi\b/i.test(b.trim()));
  const headline = (doc.headline || 'Your Berry Bog can ship free').replace(/\s+can ship free/i, ' | can ship free');
  return {
    subject: doc.subject || 'Your Berry Bog can ship free',
    preview: doc.preview,
    topbar: 'ADD A MINI · WHOLE ORDER SHIPS FREE',
    headline,
    introBody: paras[0] || '',
    midBody: paras.join(' ') || paras[0] || '',
    cta: doc.cta || 'Complete my order',
    ctaUrl: doc.ctaUrl || 'https://sprut-demo-store.vercel.app/#checkout',
    midCta: 'Try Sprüt today',
    closeHeadline: 'Don’t miss your | chance',
    closeFine: 'OFFER VALID ON YOUR ORDER TODAY',
    finalCta: doc.cta || 'Claim free shipping',
    firstName: firstName || null,
  };
}

/** Prefer Brand knowledge photos; always use catalog green/yellow logos so white wordmarks never sit on white. */
export function resolveSprutAssets(brand: {
  photos?: Array<{ src?: string | null } | null>;
  logos?: { primary?: { src?: string | null } | null; dark?: { src?: string | null } | null };
}): SprutEmailAssets {
  const photos = (brand.photos || []).map((p) => p?.src).filter((s): s is string => Boolean(s && /^https?:\/\//i.test(s)));
  // Photo order in his Brand knowledge: packshot, daisies, outdoor pour.
  const packshot = photos[0] || SPRUT_DEFAULT_ASSETS.packshot;
  const garden = photos[1] || SPRUT_DEFAULT_ASSETS.garden;
  const hero = photos[2] || photos[0] || SPRUT_DEFAULT_ASSETS.hero;
  return {
    logoGreen: SPRUT_DEFAULT_ASSETS.logoGreen,
    logoOnGreen: SPRUT_DEFAULT_ASSETS.logoOnGreen,
    hero,
    packshot,
    garden,
  };
}
