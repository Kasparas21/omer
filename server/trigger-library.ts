/* Who gets a campaign: people who do these steps, in order. Shared by the app (the create flow, the campaign
   page) and the server (checking what a campaign stores, matching real visitors). Plain data only: no Node or
   DOM imports.

   Every step reads real data the tracker collects: pages visited (kept 7 days), the page a visit started or
   ended on, where they came from, the country, and purchases (kept for good). A "didn't" step waits that long
   and passes only if it didn't happen. Templates are ready-made step chains. */

export type StepKind = 'visited' | 'landed' | 'left' | 'source' | 'country' | 'bought' | 'no_buy' | 'no_return';
export type Step = {
  kind: StepKind;
  /** Page path, source, country code or product name. Empty means any. */
  value: string;
  /** Pages: the exact page, or every page that starts with it (like /products/). */
  match?: 'is' | 'starts';
  /** Visited: how many times at least. */
  times?: number;
  /** "Didn't" steps: how long it must not happen. */
  within?: string;
};
export type CampaignTrigger = { steps: Step[]; wait: string; template?: string };

export const DURATIONS = ['1 hour', '4 hours', '1 day', '3 days', '1 week', '2 weeks', '3 weeks', '30 days', '60 days', '90 days'] as const;
export const WAITS = ['right away', 'after 10 minutes', 'after 1 hour', 'after 4 hours', 'after 1 day', 'after 3 days'] as const;
const HOURS: Record<string, number> = {
  '10 minutes': 1 / 6, '1 hour': 1, '4 hours': 4, '1 day': 24, '3 days': 72, '1 week': 168, '2 weeks': 336, '3 weeks': 504,
  '30 days': 720, '60 days': 1440, '90 days': 2160,
};
/** "3 days" or "after 3 days" in milliseconds; "right away" is 0. */
export const durationMs = (text: string) => (HOURS[text.replace(/^after\s+/, '')] ?? 0) * 3_600_000;

export type StepIcon = 'eye' | 'arrowRight' | 'exit' | 'link' | 'globe' | 'cart' | 'x' | 'clock';
export const STEP_TYPES: { kind: StepKind; name: string; icon: StepIcon; pick: string; note: string; negative?: boolean }[] = [
  { kind: 'visited', name: 'Visited a page', icon: 'eye', pick: 'Page visited', note: 'Select a page from your analytics.' },
  { kind: 'landed', name: 'Landed on a page', icon: 'arrowRight', pick: 'Landed on', note: 'Select the page their visit started on.' },
  { kind: 'left', name: 'Left from a page', icon: 'exit', pick: 'Left from', note: 'Select the last page of their visit.' },
  { kind: 'source', name: 'Came from', icon: 'link', pick: 'Came from', note: 'Select where the visit came from.' },
  { kind: 'country', name: 'From a country', icon: 'globe', pick: 'From a country', note: 'Select a country from your visitors.' },
  { kind: 'bought', name: 'Bought', icon: 'cart', pick: 'Bought', note: 'Select a product from your orders or Brand knowledge.' },
  { kind: 'no_buy', name: 'Didn’t buy', icon: 'x', pick: 'Didn’t buy within', note: 'How long without an order.', negative: true },
  { kind: 'no_return', name: 'Didn’t come back', icon: 'clock', pick: 'Didn’t come back within', note: 'How long without a visit.', negative: true },
];
export const stepType = (kind: StepKind) => STEP_TYPES.find((t) => t.kind === kind)!;

/** One step as a short line: "Visited /products/*", "Didn't buy within 1 day". */
const SOURCE_NAMES: Record<string, string> = { instagram: 'Instagram', google: 'Google', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', pinterest: 'Pinterest', bing: 'Bing', reddit: 'Reddit', twitter: 'X', chatgpt: 'ChatGPT', email: 'Email' };
/** "instagram" → "Instagram"; hosts like shop.example.com stay as typed. */
export function sourceName(v: string) {
  const k = v.trim().toLowerCase();
  return SOURCE_NAMES[k] ?? (k.includes('.') ? v.trim() : v.trim().replace(/^\w/, (c) => c.toUpperCase()));
}

export function stepLabel(s: Step): string {
  const any: Record<string, string> = { visited: 'any page', landed: 'any page', left: 'any page', source: 'anywhere', country: 'any country', bought: 'anything' };
  const v = s.value.trim();
  const page = v ? (s.match === 'starts' && v !== '/' ? `${v.replace(/\/?$/, '/')}*` : v) : any[s.kind];
  switch (s.kind) {
    case 'visited': return `Visited ${page}${s.times && s.times > 1 ? ` ${s.times} times` : ''}`;
    case 'landed': return `Landed on ${page}`;
    case 'left': return `Left from ${page}`;
    case 'source': return `Came from ${v ? sourceName(v) : any.source}`;
    case 'country': return `From ${v || any.country}`;
    case 'bought': return `Bought ${v || any.bought}`;
    case 'no_buy': return `Didn’t buy within ${s.within ?? '1 day'}`;
    case 'no_return': return `Didn’t come back within ${s.within ?? '30 days'}`;
  }
}

// ---------- templates: the library you start from
export type TemplateGroup = 'cart' | 'browse' | 'source' | 'after' | 'winback';
export const GROUPS: { id: TemplateGroup; name: string }[] = [
  { id: 'cart', name: 'Cart & checkout' },
  { id: 'browse', name: 'Browsing' },
  { id: 'source', name: 'Where they came from' },
  { id: 'after', name: 'After they buy' },
  { id: 'winback', name: 'Win back' },
];
export type TemplateIcon = 'cart' | 'exit' | 'eye' | 'rotate' | 'book' | 'search' | 'user' | 'link' | 'instagram' | 'check' | 'star' | 'calendar' | 'refund' | 'clock' | 'tag' | 'truck';
export type Template = { id: string; name: string; group: TemplateGroup; icon: TemplateIcon; words: string; steps: Step[]; wait: string };

const page = (value: string, extra: Partial<Step> = {}): Step => ({ kind: 'visited', value, match: 'starts', ...extra });
const noBuy = (within: string): Step => ({ kind: 'no_buy', value: '', within });
export const TEMPLATES: Template[] = [
  { id: 'cart', name: 'Abandoned cart', group: 'cart', icon: 'cart', words: 'cart basket abandon left', steps: [page('/cart'), noBuy('1 hour')], wait: 'right away' },
  { id: 'checkout', name: 'Abandoned checkout', group: 'cart', icon: 'exit', words: 'checkout payment abandon left', steps: [page('/checkout'), noBuy('1 hour')], wait: 'right away' },
  { id: 'cart-day', name: 'Cart, a day later', group: 'cart', icon: 'clock', words: 'cart reminder second day', steps: [page('/cart'), noBuy('1 day')], wait: 'right away' },
  { id: 'shipping-page', name: 'Checked shipping, then left', group: 'cart', icon: 'truck', words: 'shipping delivery cost policy', steps: [page('/pages/shipping'), noBuy('1 day')], wait: 'right away' },
  { id: 'viewed', name: 'Viewed a product', group: 'browse', icon: 'eye', words: 'browse view product left', steps: [page('/products/'), noBuy('1 day')], wait: 'right away' },
  { id: 'repeat', name: 'Keeps coming back', group: 'browse', icon: 'rotate', words: 'return repeat again visits interest', steps: [page('/products/', { times: 3 }), noBuy('1 day')], wait: 'right away' },
  { id: 'collection', name: 'Browsed a collection', group: 'browse', icon: 'tag', words: 'collection category browse', steps: [page('/collections/'), noBuy('1 day')], wait: 'right away' },
  { id: 'reader', name: 'Reading up on a topic', group: 'browse', icon: 'book', words: 'blog article read topic research learn', steps: [page('/blogs/', { times: 2 }), noBuy('3 days')], wait: 'right away' },
  { id: 'search', name: 'Searched your store', group: 'browse', icon: 'search', words: 'search find query', steps: [page('/search'), noBuy('1 day')], wait: 'right away' },
  { id: 'exit-product', name: 'Left from a product page', group: 'browse', icon: 'exit', words: 'exit leave product page', steps: [{ kind: 'left', value: '/products/', match: 'starts' }, noBuy('1 day')], wait: 'right away' },
  { id: 'first-visit', name: 'First visit, no order', group: 'browse', icon: 'user', words: 'new visitor first time', steps: [{ kind: 'landed', value: '', match: 'is' }, noBuy('3 days')], wait: 'right away' },
  { id: 'instagram', name: 'Came from Instagram', group: 'source', icon: 'instagram', words: 'instagram social ad', steps: [{ kind: 'source', value: 'instagram' }, noBuy('1 day')], wait: 'right away' },
  { id: 'google', name: 'Came from Google', group: 'source', icon: 'search', words: 'google search ad seo', steps: [{ kind: 'source', value: 'google' }, noBuy('1 day')], wait: 'right away' },
  { id: 'tiktok', name: 'Came from TikTok', group: 'source', icon: 'link', words: 'tiktok social ad video', steps: [{ kind: 'source', value: 'tiktok' }, noBuy('1 day')], wait: 'right away' },
  { id: 'thanks', name: 'Thank you', group: 'after', icon: 'check', words: 'thank you order welcome new customer purchase bought', steps: [{ kind: 'bought', value: '' }], wait: 'after 1 hour' },
  { id: 'review', name: 'Ask for a review', group: 'after', icon: 'star', words: 'review feedback rating stars bought purchase', steps: [{ kind: 'bought', value: '' }, noBuy('1 week')], wait: 'right away' },
  { id: 'reorder', name: 'Time to reorder', group: 'after', icon: 'calendar', words: 'reorder refill replenish run out again bought food', steps: [{ kind: 'bought', value: '' }, noBuy('3 weeks')], wait: 'right away' },
  { id: 'crosssell', name: 'Goes well with', group: 'after', icon: 'cart', words: 'cross sell upsell accessory add on bought', steps: [{ kind: 'bought', value: '' }, noBuy('3 days')], wait: 'right away' },
  { id: 'lapsed', name: 'Bought once, not again', group: 'winback', icon: 'refund', words: 'win back lapsed churn one time customer', steps: [{ kind: 'bought', value: '' }, noBuy('60 days')], wait: 'right away' },
  { id: 'gone', name: 'Hasn’t been back', group: 'winback', icon: 'clock', words: 'inactive dormant away miss you come back', steps: [page('/'), { kind: 'no_return', value: '', within: '30 days' }], wait: 'right away' },
];

/** Templates that match what someone typed, best first. */
export function searchTemplates(query: string): Template[] {
  const words = query.toLowerCase().split(/[^a-z0-9/]+/).filter((w) => w.length > 1);
  if (!words.length) return TEMPLATES;
  const score = (t: Template) => {
    const hay = `${t.name} ${t.words} ${t.steps.map(stepLabel).join(' ')}`.toLowerCase();
    return words.reduce((n, w) => n + (hay.includes(w) ? (t.name.toLowerCase().includes(w) ? 2 : 1) : 0), 0);
  };
  return TEMPLATES.map((t) => [t, score(t)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// ---------- checking what's stored
const KINDS = new Set<StepKind>(STEP_TYPES.map((t) => t.kind));
/** Campaigns made with the first library stored { id, params }: they become that template's steps. */
const OLD_TO_TEMPLATE: Record<string, string> = {
  cart: 'cart', checkout: 'checkout', viewed: 'viewed', repeat: 'repeat', interest: 'reader', search: 'search', firstvisit: 'first-visit',
  thanks: 'thanks', review: 'review', reorder: 'reorder', crosssell: 'crosssell', lapsed: 'lapsed', gone: 'gone',
};

export function cleanTrigger(input: unknown): CampaignTrigger | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { steps?: unknown; wait?: unknown; template?: unknown; id?: unknown };
  if (!Array.isArray(raw.steps)) {
    const t = typeof raw.id === 'string' ? TEMPLATES.find((x) => x.id === OLD_TO_TEMPLATE[raw.id as string]) : undefined;
    return t ? { steps: t.steps.map((s) => ({ ...s })), wait: t.wait, template: t.id } : { steps: [], wait: 'right away' };
  }
  const steps: Step[] = [];
  for (const s of raw.steps.slice(0, 8) as Record<string, unknown>[]) {
    if (!s || typeof s !== 'object' || !KINDS.has(s.kind as StepKind)) continue;
    const step: Step = { kind: s.kind as StepKind, value: typeof s.value === 'string' ? s.value.trim().slice(0, 200) : '' };
    if (s.match === 'starts' || s.match === 'is') step.match = s.match;
    if (typeof s.times === 'number' && s.times > 1) step.times = Math.min(10, Math.round(s.times));
    if (typeof s.within === 'string' && (DURATIONS as readonly string[]).includes(s.within)) step.within = s.within;
    if ((step.kind === 'no_buy' || step.kind === 'no_return') && !step.within) step.within = step.kind === 'no_buy' ? '1 day' : '30 days';
    steps.push(step);
  }
  const wait = typeof raw.wait === 'string' && (WAITS as readonly string[]).includes(raw.wait) ? raw.wait : 'right away';
  const template = typeof raw.template === 'string' && TEMPLATES.some((t) => t.id === raw.template) ? raw.template : undefined;
  return { steps, wait, ...(template ? { template } : {}) };
}

/** A whole trigger as one line, for the campaign page and the queue. */
export const triggerLine = (t: CampaignTrigger) => (t.steps.length ? t.steps.map(stepLabel).join(' → ') : 'No steps yet');

// ---------- personal fields: filled in for each person when their email is made
export const FIELDS: { key: string; name: string; fallback: string; example: string }[] = [
  { key: 'first_name', name: 'First name', fallback: 'there', example: 'Alex' },
  { key: 'full_name', name: 'Full name', fallback: 'there', example: 'Alex Morgan' },
  { key: 'email', name: 'Email', fallback: '', example: 'alex@example.com' },
  { key: 'city', name: 'City', fallback: 'your area', example: 'Portland' },
  { key: 'country', name: 'Country', fallback: 'your country', example: 'United States' },
  { key: 'page_viewed', name: 'Page they viewed', fallback: 'our store', example: 'Salmon Kibble 4 kg' },
  { key: 'last_product', name: 'Last product they bought', fallback: 'your last order', example: 'Kitten Starter Pack' },
  { key: 'last_order_total', name: 'Last order total', fallback: 'your last order', example: '$49.00' },
  { key: 'store_name', name: 'Store name', fallback: '', example: 'Pawsome' },
];
export const FIELD_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
/** Fills {{fields}} with a person's values, or the email's fallback (or the field's default) when unknown. */
export function fillFields(text: string, values: Record<string, string | null | undefined>, fallbacks: Record<string, string> = {}) {
  return text.replace(FIELD_RE, (whole, key: string) => {
    const field = FIELDS.find((f) => f.key === key);
    if (!field) return whole;
    const v = values[key]?.trim();
    return v || (fallbacks[key] ?? field.fallback);
  });
}
