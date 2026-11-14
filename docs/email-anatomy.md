# Email anatomy (distilled from Emailify study)

**Study source:** [Emailify Components](https://emailify.hypermatic.com) by Hypermatic (538 components, 123 brands). Private corpus lives in `local/emailify-corpus/` (gitignored). This document is original Omer guidance — we do **not** ship Emailify assets or their HTML.

## Corpus coverage (index)

| Dimension | Measured |
|-----------|----------|
| Components | 538 |
| Layouts | single-column 345, footer 69, two-column 37, header 33, grid 20, banner 10, hero 4, … |
| Tags | Muted 251, Light 202, CTA 76, Dark 48, Social 23, Video 23, Colorful 19 |
| Includes | hasCTA 346, hasImage 297 |
| Categories (tags) | Product-heavy library; Newsletter 103, Promotion 74, Pricing 47, Feature List 18 |

## Recurring sections (what “nice” emails are made of)

1. **Logo / header** — Centered wordmark or small logo (A24, Sonos) or left logo + right text nav (Altitude). Rarely more than one row.
2. **Hero image** — Full-bleed lifestyle or product shot (Sonos Move 2, Etsy tabletop) or inset product on muted wash (A24 Blu-ray). Images carry the brand; copy stays short.
3. **Headline + body** — Large title (serif or bold sans), 1–3 short paragraphs, generous vertical rhythm (~12–28px gaps). Centered for brand/launch; left for letter-like notes.
4. **Product block** — Single feature (name + price under hero) or 2-up grid for compare/collections.
5. **CTA** — High frequency (346/538). Pill button on accent (Sonos/Etsy) or full-width solid bar (A24). Personal notes use underlined text links instead.
6. **Perks / feature list** — Short trust lines under the CTA (“free shipping · returns”).
7. **Promo code** — Soft gray strip when a real code exists.
8. **Signature** — Sender name + store (personal notes).
9. **Footer** — Address + Unsubscribe (+ optional View in browser / social glyphs). Adidas-style: social row, hairline rule, muted legal type.

## Image rules

- Prefer **one strong hero** over many small thumbs for launch/cart.
- Full-bleed for lifestyle; **rounded inset** (~16px) for letter/product cards.
- Do not duplicate the hero image again in the product card — show price/name only.
- Aspect: ~4:5 to 16:10; never stretch; `width=100%` in tables.

## Spacing / chrome tokens (Omer defaults)

Derived from the dominant single-column + light/muted set, plus Colorlib MJML production chrome:

- Content width **600px**, soft page wash (not pure white/black), card fill `#FAFAFA`, corners from **skin**
- Side pad **40px** (brand) / **36px** (personal)
- Body **15–16px / 1.55**, headline from skin (**30 / 34 / 38**), letter-spacing tight on heads
- Fonts: brand kit first; fallback **Georgia** heads + **Helvetica** body (professional prefers Helvetica heads)
- CTA: **bulletproof table button**; radius **8** (professional) or **999** (modern/playful)
- Shell: preheader, `color-scheme`, Apple reformatting meta, MSO width table

## Visual skins (brand voice → chrome)

Recipe picks **structure**; skin picks **look** (`server/email-page.ts`):

| Skin | Corners | CTA | Head | When |
|------|---------|-----|------|------|
| `professional` | 8 | 8 | 30 / Helvetica | Formal, B2B, luxury, clinic |
| `modern` | 16 | pill | 34 / Georgia | Default clean product email |
| `playful` | 22 | pill | 38 / Georgia | Warm, witty, pet, lifestyle |

## High-frequency compositions → Omer recipes

| Recipe | Typical order | Colorlib cousin | When |
|--------|---------------|-----------------|------|
| `launch` | logo → hero → headline → body → products → cta → perks → footer | Loop (25) | Product interest / drop |
| `cart_rescue` | logo → hero → headline → products → code? → cta → perks → footer | Shop (12) / Verge (27) | Cart / checkout / winback |
| `compare` | logo → headline → body → product_grid → cta → footer | — | Two options |
| `editorial_note` | body… → inset product → cta_text → sig → footer | Brief (24) | Personal advice |
| `restock` | logo → hero → headline → products → cta → features → footer | — | Back in stock |
| `digest` | logo → headline → body beats + dividers → soft cta → footer | Brief (24) | Soft newsletter |

## How to test generated emails

1. **Demo store** → Opportunities → open a person → Generate / Edit draft. Use Desktop / iPhone in MailEditor. Preview never sends.
2. **Real project** (Brand knowledge filled, `OPENAI_API_KEY` set) → Opportunities → **Draft email** → inspect in MailEditor → **View HTML** to copy for Litmus / Email on Acid → **Send** to yourself (Settings → Sending connected).
3. **Fixtures**: `npm run email:fixtures` writes recipe × skin HTML under `tmp/email-fixtures/` for a quick browser pass.
4. Reference gallery (design inspiration only): [`/email-examples.html`](../public/email-examples.html).

## Implementation map

- Tokens + section ids: [`server/email-sections.ts`](../server/email-sections.ts)
- Skins + page: [`server/email-page.ts`](../server/email-page.ts)
- SES HTML: [`server/email-html.ts`](../server/email-html.ts)
- Luna recipes: [`server/email-draft.ts`](../server/email-draft.ts)
- In-app mirror: [`src/Mail.tsx`](../src/Mail.tsx), [`src/ui/mail.css`](../src/ui/mail.css)
- Fixtures: [`scripts/email-fixtures.mjs`](../scripts/email-fixtures.mjs)
