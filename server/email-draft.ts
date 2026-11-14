/* Luna drafts a personal MailDoc from brand context + visitor insight. */
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { loadBrand, type StoredBrand } from './brand-import';
import { loadEmailContext } from './email-context';
import type { MailDocLike, PageStyleLike } from './email-html';
import { brandFromStore, pageFromBrand, skinPromptCues } from './email-page';
import { LAYOUT_RECIPES, type LayoutRecipeId } from './email-sections';
import { openaiConfigured } from './replay-insight';
import { projectOpportunities, projects } from './schema';

const MODEL = 'gpt-6-luna';

function pickRecipe(hooks: string[], summary: string | null): LayoutRecipeId {
  const blob = `${hooks.join(' ')} ${summary || ''}`.toLowerCase();
  if (/cart|checkout|abandon|left checkout|code|coupon|discount/.test(blob)) return 'cart_rescue';
  if (/compar|vs\.|between|two |decide|side by side/.test(blob)) return 'compare';
  if (/restock|back in stock|sold out|returned|in stock again/.test(blob)) return 'restock';
  if (/digest|newsletter|round.?up|this week|recap/.test(blob)) return 'digest';
  if (/product|looked at|viewed|interested|price|launch|drop/.test(blob)) return 'launch';
  return 'editorial_note';
}

function openaiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function extractResponseText(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const record = body as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text.trim();
  const parts: string[] = [];
  for (const item of record.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const raw = fenced || text.trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(v: unknown, max = 500) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function asStringArray(v: unknown, maxItems = 6, maxLen = 400): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    .map((x) => x.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

function normalizeDoc(
  raw: Record<string, unknown>,
  recipe: LayoutRecipeId,
  origin: string,
  brand: StoredBrand,
  firstName: string | null,
): MailDocLike {
  const layout = LAYOUT_RECIPES[recipe];
  const order = [...layout.order];
  const body = asStringArray(raw.body, 6, 600);
  while (body.length < 2) body.push('');
  if (layout.kind === 'personal' && firstName && body[0] && !/hi |hello |hey /i.test(body[0])) {
    body[0] = `Hi ${firstName},`;
  }

  const products = Array.isArray(raw.products)
    ? raw.products.slice(0, 2).map((p) => {
      const row = (p && typeof p === 'object') ? p as Record<string, unknown> : {};
      const name = asString(row.name, 80);
      const match = brand.products.find((bp) => bp.name.toLowerCase() === name.toLowerCase())
        || brand.products.find((bp) => name && bp.name.toLowerCase().includes(name.toLowerCase()));
      return {
        name: name || match?.name || 'Product',
        now: asString(row.now, 40) || match?.price || '',
        was: asString(row.was, 40) || undefined,
        note: asString(row.note, 120) || undefined,
        img: match?.image?.src || undefined,
        url: origin,
      };
    }).filter((p) => p.name)
    : [];

  let ctaUrl = asString(raw.ctaUrl, 300);
  try {
    if (ctaUrl) {
      const u = new URL(ctaUrl, origin);
      if (u.origin !== new URL(origin).origin) ctaUrl = origin;
      else ctaUrl = u.toString();
    } else ctaUrl = origin;
  } catch {
    ctaUrl = origin;
  }

  const heroSrc = products[0]?.img || brand.photos[0]?.src || brand.products[0]?.image?.src;
  const code = raw.code && typeof raw.code === 'object'
    ? { c: asString((raw.code as { c?: unknown }).c, 40), n: asString((raw.code as { n?: unknown }).n, 120) }
    : undefined;

  const perks = asStringArray(raw.perks, 4, 80);
  const features = asStringArray(raw.features, 4, 80);
  const social = asStringArray(raw.social, 4, 40);
  const doc: MailDocLike & { blocks: Record<string, unknown> } = {
    kind: layout.kind,
    subject: asString(raw.subject, 120) || 'Following up',
    preview: asString(raw.preview, 160) || undefined,
    headline: asString(raw.headline, 120),
    body,
    products: products.length ? products : undefined,
    code: code?.c ? code : undefined,
    cta: asString(raw.cta, 60) || 'See it on the site',
    ctaUrl,
    perks: perks.length ? perks : undefined,
    features: features.length ? features : (recipe === 'restock' && perks.length ? perks : undefined),
    social: social.length ? social : undefined,
    hero: layout.kind !== 'personal' && heroSrc ? { src: heroSrc } : undefined,
    footer: undefined,
    order: order.includes('footer') ? order : [...order, 'footer'],
    blocks: {},
  };

  if (!doc.products?.length) {
    doc.order = doc.order.filter((k) => k !== 'products');
  }
  if (!doc.code) doc.order = doc.order.filter((k) => k !== 'code');
  if (!doc.perks?.length) doc.order = doc.order.filter((k) => k !== 'perks');
  if (!doc.features?.length) doc.order = doc.order.filter((k) => k !== 'features');
  if (!doc.social?.length) doc.order = doc.order.filter((k) => k !== 'social');
  if (!doc.hero) doc.order = doc.order.filter((k) => k !== 'hero');
  if (!doc.headline) doc.order = doc.order.filter((k) => k !== 'headline');

  return doc;
}

async function lunaDraftJson(system: string, user: string): Promise<Record<string, unknown>> {
  if (!openaiConfigured()) throw new Error('OPENAI_API_KEY is not configured');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: system,
      input: user,
      max_output_tokens: 1600,
      reasoning: { effort: 'low' },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Luna draft ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const text = extractResponseText(body);
  const parsed = extractJson(text);
  if (!parsed) throw new Error('Luna returned no draft JSON');
  return parsed;
}

export async function draftOpportunityEmail(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
) {
  const [opp] = await db.select().from(projectOpportunities)
    .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
    .limit(1);
  if (!opp) throw new Error('Opportunity not found');
  if (opp.suppressed) throw new Error('This person unsubscribed');
  if (!opp.email) throw new Error('No email on this opportunity');

  const [project] = await db.select({
    id: projects.id,
    name: projects.name,
    origin: projects.origin,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error('Project not found');

  const brand = await loadBrand(db, projectId);
  const ctx = await loadEmailContext(db, projectId, opp.visitorId);
  const hooks = Array.isArray(opp.hooksJson) ? opp.hooksJson : [];
  const recipe = pickRecipe(hooks, opp.insightSummary);
  const page = pageFromBrand(brand);
  let host = '';
  try { host = new URL(project.origin).host; } catch { host = project.origin; }

  const facts = (ctx.brand.facts || []).slice(0, 20).map((f) => `- [${f.group}] ${f.name}: ${f.value}`).join('\n');
  const products = brand.products.slice(0, 8).map((p) => `- ${p.name}${p.price ? ` (${p.price})` : ''}`).join('\n');
  const paths = (brand.monitor || []).slice(0, 8).map((m) => m.path).join(', ') || '/';

  const layout = LAYOUT_RECIPES[recipe];
  const skin = page.skin || 'modern';
  const system = `You write ONE personalized marketing follow-up email for a store visitor.
This is not a newsletter blast and not a support ticket. One visitor, one clear reason, one CTA.

OUTPUT
- Return ONLY a single JSON object. No markdown fences, no commentary.
- Keys (omit unused optionals):
  subject (string, ≤80 chars)
  preview (string, ≤120 chars — inbox snippet after the subject)
  headline (string, ≤70 chars; empty string allowed for personal/letter recipes)
  body (string[], 2–5 short lines/paragraphs; each ≤220 chars)
  cta (string, ≤40 chars)
  ctaUrl (string — must stay on store origin)
  products (optional [{name, now, was?, note?}], max 2; names/prices only from Products on file)
  code (optional {c, n} — ONLY if that exact code exists in Approved facts)
  perks (optional string[], max 4 short trust lines)
  features (optional string[], max 4 — prefer for restock)
  social (optional short labels, max 4)

DESIGN BRIEF
- ${skinPromptCues(skin)}
- Layout recipe: "${recipe}" — ${layout.blurb}
- Section slots (fill copy that fits; leave unused optionals out): ${layout.order.join(' → ')}
- One hero idea. Short headline. Scannable body. Single CTA.
- Personal notes (editorial_note): lead with a greeting line; prefer text-link CTA energy in cta copy.

HARD RULES
- Match the language of Brand Voice / Product Information (same language as the site).
- Sound like this brand. Short, concrete. No invented prices, discounts, shipping, stock, or codes.
- Only use Approved facts + Products on file. If a code/discount is not listed, omit "code".
- ctaUrl must be on ${project.origin} — prefer a monitored path when relevant.
- Use {{first_name}} at most once across the whole email (usually body[0]).
- Never use em dashes. No AI filler ("I hope this finds you well", "unlock", "synergy", "game-changer", "delve").
- Do not repeat the product name in every paragraph. Do not stack multiple CTAs in body text.
- No fake urgency ("last chance!!!") unless a real deadline is in Approved facts.

ANTI-PATTERNS
- Walls of text; more than one primary ask; inventing a second product; pasting the hero product description twice.`;

  const user = [
    `Store: ${project.name} (${project.origin})`,
    `Recipient: ${opp.name || 'unknown'} <${opp.email}>`,
    `Reason: ${opp.reason || ''}`,
    `Hooks: ${hooks.join(' | ') || 'none'}`,
    `Insight: ${opp.insightSummary || ctx.insight?.summary || ''}`,
    `Interests: ${(ctx.insight?.interests || []).join(', ') || 'n/a'}`,
    `Visual skin: ${skin}`,
    `Recipe: ${recipe}`,
    `Section order: ${layout.order.join(' → ')}`,
    `Monitored paths: ${paths}`,
    '',
    '## Brand voice (excerpt)',
    (brand.docs?.voice || brand.voice.tone || '').slice(0, 2500),
    '',
    '## Product information (excerpt)',
    (brand.docs?.product || '').slice(0, 2500),
    '',
    '## Approved facts',
    facts || '(none)',
    '',
    '## Products on file',
    products || '(none — do not invent product cards)',
  ].join('\n');

  const raw = await lunaDraftJson(system, user);
  const first = (opp.name || '').trim().split(/\s+/)[0] || null;
  const doc = normalizeDoc(raw, recipe, project.origin, brand, first);
  doc.kind = layout.kind;

  const now = new Date();
  const [row] = await db.update(projectOpportunities).set({
    draftJson: doc as unknown as Record<string, unknown>,
    pageJson: page as unknown as Record<string, unknown>,
    status: 'drafted',
    updatedAt: now,
  }).where(eq(projectOpportunities.id, opportunityId)).returning();

  return {
    opportunity: row,
    draft: doc,
    page,
    brand: brandFromStore(project.name, brand, host),
  };
}

export async function saveOpportunityDraft(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
  draft: MailDocLike,
  page: PageStyleLike,
) {
  const [row] = await db.update(projectOpportunities).set({
    draftJson: draft as unknown as Record<string, unknown>,
    pageJson: page as unknown as Record<string, unknown>,
    // Editing an email a campaign will send by itself keeps it queued to send.
    status: sql`case when ${projectOpportunities.status} = 'scheduled' then 'scheduled' else 'drafted' end`,
    updatedAt: new Date(),
  }).where(and(
    eq(projectOpportunities.id, opportunityId),
    eq(projectOpportunities.projectId, projectId),
  )).returning();
  return row;
}
