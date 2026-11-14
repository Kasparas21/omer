/* Who gets a campaign: people who do these steps, in order. Shared by the app (the create flow, the campaign
   page) and the server (checking what a campaign stores, matching real visitors). Plain data only: no Node or
   DOM imports.

   Every step reads real data the tracker collects: pages visited (kept 7 days), the page a visit started or
   ended on, where they came from, the country, purchases (kept for good), the cart and discount codes tried
   (from the store's own cart), products viewed with their price and stock (re-checked every 30 minutes), and
   session replays Omer has analysed. A "didn't" step waits that long and passes only if it didn't happen.
   Templates are ready-made step chains. */

export type StepKind = 'visited' | 'landed' | 'left' | 'source' | 'country' | 'bought' | 'no_buy' | 'no_return'
  | 'added_cart' | 'cart_value' | 'near_free_ship' | 'code_failed' | 'compared' | 'sold_out' | 'back_in_stock' | 'price_drop' | 'struggled';
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
  /** Close to free shipping: how far under the free-shipping amount (value) the cart may be. */
  gap?: number;
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

export type StepIcon = 'eye' | 'arrowRight' | 'exit' | 'link' | 'globe' | 'cart' | 'x' | 'clock' | 'dollar' | 'truck' | 'tag' | 'rotate' | 'alert' | 'bell' | 'zap';
export type StepGroup = 'site' | 'cart' | 'products' | 'orders' | 'not';
export const STEP_GROUPS: { id: StepGroup; name: string }[] = [
  { id: 'site', name: 'On your site' },
  { id: 'cart', name: 'Cart & codes' },
  { id: 'products', name: 'Products' },
  { id: 'orders', name: 'Orders' },
  { id: 'not', name: 'Didn’t' },
];
/** pick: the details screen's title. instant: no details to choose, added straight away. */
export const STEP_TYPES: { kind: StepKind; name: string; icon: StepIcon; group: StepGroup; pick: string; note: string; negative?: boolean; instant?: boolean }[] = [
  { kind: 'visited', name: 'Visited a page', icon: 'eye', group: 'site', pick: 'Page visited', note: 'Select a page from your analytics.' },
  { kind: 'landed', name: 'Landed on a page', icon: 'arrowRight', group: 'site', pick: 'Landed on', note: 'Select the page their visit started on.' },
  { kind: 'left', name: 'Left from a page', icon: 'exit', group: 'site', pick: 'Left from', note: 'Select the last page of their visit.' },
  { kind: 'source', name: 'Came from', icon: 'link', group: 'site', pick: 'Came from', note: 'Select where the visit came from.' },
  { kind: 'country', name: 'From a country', icon: 'globe', group: 'site', pick: 'From a country', note: 'Select a country from your visitors.' },
  { kind: 'struggled', name: 'Got stuck on your site', icon: 'alert', group: 'site', pick: 'Got stuck', note: 'From session replays Omer analysed.', instant: true },
  { kind: 'added_cart', name: 'Added to cart', icon: 'cart', group: 'cart', pick: 'Added to cart', note: 'Any product, or one you pick.' },
  { kind: 'cart_value', name: 'Cart worth at least', icon: 'dollar', group: 'cart', pick: 'Cart worth at least', note: 'The cart’s total.' },
  { kind: 'near_free_ship', name: 'Close to free shipping', icon: 'truck', group: 'cart', pick: 'Free shipping from', note: 'Your free-shipping amount.' },
  { kind: 'code_failed', name: 'Tried a code that didn’t work', icon: 'tag', group: 'cart', pick: 'Code didn’t work', note: 'Expired or invalid discount codes.' },
  { kind: 'compared', name: 'Compared products', icon: 'rotate', group: 'products', pick: 'Compared products', note: 'Went back and forth between products.' },
  { kind: 'sold_out', name: 'Saw something sold out', icon: 'bell', group: 'products', pick: 'Saw sold out', note: 'Any product, or one you pick.' },
  { kind: 'back_in_stock', name: 'It came back in stock', icon: 'zap', group: 'products', pick: 'Back in stock', note: 'Something they saw sold out is back.', instant: true },
  { kind: 'price_drop', name: 'Price dropped', icon: 'tag', group: 'products', pick: 'Price dropped by', note: 'On a product they viewed.' },
  { kind: 'bought', name: 'Bought', icon: 'cart', group: 'orders', pick: 'Bought', note: 'Select a product from your orders or Brand knowledge.' },
  { kind: 'no_buy', name: 'Didn’t buy', icon: 'x', group: 'not', pick: 'Didn’t buy within', note: 'How long without an order.', negative: true },
  { kind: 'no_return', name: 'Didn’t come back', icon: 'clock', group: 'not', pick: 'Didn’t come back within', note: 'How long without a visit.', negative: true },
];
export const stepType = (kind: StepKind) => STEP_TYPES.find((t) => t.kind === kind)!;

/** One step as a short line: "Visited /products/*", "Didn't buy within 1 day". */
const SOURCE_NAMES: Record<string, string> = { instagram: 'Instagram', google: 'Google', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', pinterest: 'Pinterest', bing: 'Bing', reddit: 'Reddit', twitter: 'X', chatgpt: 'ChatGPT', email: 'Email' };
/** "instagram" → "Instagram"; hosts like shop.example.com stay as typed. */
export function sourceName(v: string) {
  const k = v.trim().toLowerCase();
  return SOURCE_NAMES[k] ?? (k.includes('.') ? v.trim() : v.trim().replace(/^\w/, (c) => c.toUpperCase()));
}

export function stepLabel(s: Step, money: (n: number) => string = (n) => `$${n}`): string {
  const any: Record<string, string> = { visited: 'any page', landed: 'any page', left: 'any page', source: 'anywhere', country: 'any country', bought: 'anything' };
  const v = s.value.trim();
  const page = v ? (s.match === 'starts' && v !== '/' ? `${v.replace(/\/?$/, '/')}*` : v) : any[s.kind];
  const n = Number(v) || 0;
  const times = (t = 1) => (t >= 3 ? '3+ times' : t === 2 ? 'twice' : 'once');
  switch (s.kind) {
    case 'visited': return `Visited ${page}${s.times && s.times > 1 ? ` ${s.times} times` : ''}`;
    case 'landed': return `Landed on ${page}`;
    case 'left': return `Left from ${page}`;
    case 'source': return `Came from ${v ? sourceName(v) : any.source}`;
    case 'country': return `From ${v || any.country}`;
    case 'bought': return `Bought ${v || any.bought}`;
    case 'no_buy': return `Didn’t buy within ${s.within ?? '1 day'}`;
    case 'no_return': return `Didn’t come back within ${s.within ?? '30 days'}`;
    case 'added_cart': return v ? `Added ${v} to cart` : 'Added to cart';
    case 'cart_value': return `Cart worth ${money(n || 50)} or more`;
    case 'near_free_ship': return `Cart within ${money(s.gap ?? 15)} of free shipping (${money(n || 50)})`;
    case 'code_failed': return `Tried a code that didn’t work${(s.times ?? 1) > 1 ? ` ${times(s.times)}` : ''}`;
    case 'compared': return `Went back and forth between products${(s.times ?? 2) > 2 ? ` ${s.times} times` : ''}`;
    case 'sold_out': return v ? `Saw ${v} sold out` : 'Saw something sold out';
    case 'back_in_stock': return 'It came back in stock';
    case 'price_drop': return `Price dropped ${n || 10}% or more`;
    case 'struggled': return 'Got stuck on your site';
  }
}

// ---------- templates: the library you start from
export type TemplateGroup = 'cart' | 'products' | 'browse' | 'source' | 'after' | 'winback';
export const GROUPS: { id: TemplateGroup; name: string }[] = [
  { id: 'cart', name: 'Cart & checkout' },
  { id: 'products', name: 'Products' },
  { id: 'browse', name: 'Browsing' },
  { id: 'source', name: 'Where they came from' },
  { id: 'after', name: 'After they buy' },
  { id: 'winback', name: 'Win back' },
];
export type TemplateIcon = 'cart' | 'exit' | 'eye' | 'rotate' | 'book' | 'search' | 'user' | 'link' | 'instagram' | 'check' | 'star' | 'calendar' | 'refund' | 'clock' | 'tag' | 'truck' | 'bell';
export type Template = { id: string; name: string; group: TemplateGroup; icon: TemplateIcon; words: string; steps: Step[]; wait: string };

const page = (value: string, extra: Partial<Step> = {}): Step => ({ kind: 'visited', value, match: 'starts', ...extra });
const noBuy = (within: string): Step => ({ kind: 'no_buy', value: '', within });
export const TEMPLATES: Template[] = [
  { id: 'cart', name: 'Abandoned cart', group: 'cart', icon: 'cart', words: 'cart basket abandon left added', steps: [{ kind: 'added_cart', value: '' }, noBuy('1 hour')], wait: 'right away' },
  { id: 'cart-day', name: 'Cart, a day later', group: 'cart', icon: 'clock', words: 'cart reminder second day added', steps: [{ kind: 'added_cart', value: '' }, noBuy('1 day')], wait: 'right away' },
  { id: 'code', name: 'Code didn’t work', group: 'cart', icon: 'tag', words: 'discount code coupon promo expired invalid', steps: [{ kind: 'code_failed', value: '' }, noBuy('1 hour')], wait: 'right away' },
  { id: 'free-ship', name: 'Close to free shipping', group: 'cart', icon: 'truck', words: 'free shipping threshold delivery cost', steps: [{ kind: 'near_free_ship', value: '50', gap: 15 }, noBuy('1 hour')], wait: 'right away' },
  { id: 'big-cart', name: 'Big cart left behind', group: 'cart', icon: 'cart', words: 'big cart high value expensive basket', steps: [{ kind: 'cart_value', value: '150' }, noBuy('1 hour')], wait: 'right away' },
  { id: 'checkout', name: 'Abandoned checkout', group: 'cart', icon: 'exit', words: 'checkout payment abandon left', steps: [page('/checkout'), noBuy('1 hour')], wait: 'right away' },
  { id: 'cart-page', name: 'Visited the cart page', group: 'cart', icon: 'cart', words: 'cart page visit any store', steps: [page('/cart'), noBuy('1 hour')], wait: 'right away' },
  { id: 'shipping-page', name: 'Checked shipping, then left', group: 'cart', icon: 'truck', words: 'shipping delivery cost policy', steps: [page('/pages/shipping'), noBuy('1 day')], wait: 'right away' },
  { id: 'back-in-stock', name: 'Back in stock', group: 'products', icon: 'bell', words: 'stock sold out restock available again', steps: [{ kind: 'sold_out', value: '' }, { kind: 'back_in_stock', value: '' }], wait: 'right away' },
  { id: 'price-drop', name: 'Price drop', group: 'products', icon: 'tag', words: 'price drop cheaper sale discount', steps: [{ kind: 'price_drop', value: '10' }], wait: 'right away' },
  { id: 'compare', name: 'Can’t decide', group: 'products', icon: 'rotate', words: 'compare choose decide two products switch', steps: [{ kind: 'compared', value: '', times: 2 }, noBuy('1 day')], wait: 'right away' },
  { id: 'viewed', name: 'Viewed a product', group: 'browse', icon: 'eye', words: 'browse view product left', steps: [page('/products/'), noBuy('1 day')], wait: 'right away' },
  { id: 'repeat', name: 'Keeps coming back', group: 'browse', icon: 'rotate', words: 'return repeat again visits interest', steps: [page('/products/', { times: 3 }), noBuy('1 day')], wait: 'right away' },
  { id: 'collection', name: 'Browsed a collection', group: 'browse', icon: 'tag', words: 'collection category browse', steps: [page('/collections/'), noBuy('1 day')], wait: 'right away' },
  { id: 'reader', name: 'Reading up on a topic', group: 'browse', icon: 'book', words: 'blog article read topic research learn', steps: [page('/blogs/', { times: 2 }), noBuy('3 days')], wait: 'right away' },
  { id: 'search', name: 'Searched your store', group: 'browse', icon: 'search', words: 'search find query', steps: [page('/search'), noBuy('1 day')], wait: 'right away' },
  { id: 'stuck', name: 'Got stuck', group: 'browse', icon: 'user', words: 'stuck frustrated struggle confused help replay', steps: [{ kind: 'struggled', value: '' }, noBuy('1 day')], wait: 'right away' },
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
    const hay = `${t.name} ${t.words} ${t.steps.map((x) => stepLabel(x)).join(' ')}`.toLowerCase();
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
    if (typeof s.gap === 'number' && s.gap > 0) step.gap = Math.min(10000, Math.round(s.gap));
    if (step.kind === 'near_free_ship' && !step.gap) step.gap = 15;
    if ((step.kind === 'no_buy' || step.kind === 'no_return') && !step.within) step.within = step.kind === 'no_buy' ? '1 day' : '30 days';
    steps.push(step);
  }
  const wait = typeof raw.wait === 'string' && (WAITS as readonly string[]).includes(raw.wait) ? raw.wait : 'right away';
  const template = typeof raw.template === 'string' && TEMPLATES.some((t) => t.id === raw.template) ? raw.template : undefined;
  return { steps, wait, ...(template ? { template } : {}) };
}

/** A whole trigger as one line, for the campaign page and the queue. */
export const triggerLine = (t: CampaignTrigger, money?: (n: number) => string) => (t.steps.length ? t.steps.map((s) => stepLabel(s, money)).join(' → ') : 'No steps yet');

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
  { key: 'product_name', name: 'Product from the steps', fallback: 'it', example: 'Cozy Nook Cat Bed' },
  { key: 'old_price', name: 'Old price', fallback: '', example: '$59.00' },
  { key: 'new_price', name: 'New price', fallback: '', example: '$45.00' },
  { key: 'cart_total', name: 'Cart total', fallback: 'your cart', example: '$42.00' },
  { key: 'cart_item', name: 'First item in cart', fallback: 'your cart', example: 'Salmon Kibble 4 kg' },
  { key: 'free_ship_gap', name: 'Left until free shipping', fallback: 'a little', example: '$8.00' },
  { key: 'failed_code', name: 'Code they tried', fallback: 'your code', example: 'SPRING15' },
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

export type MailDocFields = { subject?: string; preview?: string; headline?: string; body?: string[]; cta?: string; vars?: Record<string, string> } & Record<string, unknown>;
/** An email with this person's details in place of {{fields}} (fallbacks from the email, then the field). */
export function personalize<T extends MailDocFields>(doc: T, values: Record<string, string | null | undefined>): T {
  const fb = doc.vars ?? {};
  const f = (t?: string) => (typeof t === 'string' ? fillFields(t, values, fb) : t);
  return { ...doc, subject: f(doc.subject), preview: f(doc.preview), headline: f(doc.headline), cta: f(doc.cta), body: (doc.body ?? []).map((b) => f(b) ?? '') };
}
