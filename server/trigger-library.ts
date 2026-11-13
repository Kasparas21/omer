/* What can start a campaign. Shared by the app (the picker, the campaign page) and the server (checking what
   a campaign stores, turning a typed description into a trigger). Plain data only: no Node or DOM imports.

   A library trigger reads as a sentence with values you can change in place ({key} picks from PARAMS).
   A custom trigger is built from parts: what they did, with what, what happened next. */

export type ParamKey = keyof typeof PARAMS;
export const PARAMS = {
  tries: { opts: ['once', 'twice', '3 times'], def: 'once' },
  times: { opts: ['2 times', '3 times', '5 times'], def: '3 times' },
  gap: { opts: ['$5', '$10', '$15', '$20'], def: '$10' },
  drop: { opts: ['5%', '10%', '20%'], def: '10%' },
  days: { opts: ['1 week', '2 weeks', '3 weeks', '4 weeks', '6 weeks'], def: '3 weeks' },
  after: { opts: ['3 days', '7 days', '14 days', '30 days'], def: '7 days' },
  idle: { opts: ['30 days', '60 days', '90 days', '6 months'], def: '60 days' },
  hold: { opts: ['7 days', '14 days', '30 days'], def: '30 days' },
  wait: { opts: ['right away', 'after 10 minutes', 'after 1 hour', 'after 4 hours', 'after 1 day', 'after 3 days'], def: 'after 1 hour' },
} as const satisfies Record<string, { opts: readonly string[]; def: string }>;

export type TriggerGroup = 'cart' | 'browse' | 'price' | 'after' | 'winback';
export const GROUPS: { id: TriggerGroup; name: string }[] = [
  { id: 'cart', name: 'Cart & checkout' },
  { id: 'browse', name: 'Browsing' },
  { id: 'price', name: 'Price & stock' },
  { id: 'after', name: 'After they buy' },
  { id: 'winback', name: 'Win back' },
];

export type TriggerIcon = 'cart' | 'tag' | 'truck' | 'exit' | 'eye' | 'rotate' | 'book' | 'search' | 'dollar' | 'bell' | 'alert'
  | 'check' | 'star' | 'calendar' | 'refund' | 'clock' | 'user' | 'megaphone';
export type LibraryTrigger = {
  id: string;
  name: string;
  group: TriggerGroup;
  icon: TriggerIcon;
  /** What they did, with {param} values: "Left a cart within {gap} of free shipping". */
  when: string;
  /** Extra words people might search for. */
  words: string;
};

export const LIBRARY: LibraryTrigger[] = [
  { id: 'cart', name: 'Abandoned cart', group: 'cart', icon: 'cart', when: 'Added something to their cart, then left', words: 'cart abandon leave left basket' },
  { id: 'checkout', name: 'Abandoned checkout', group: 'cart', icon: 'exit', when: 'Started checkout, then left', words: 'checkout payment abandon left' },
  { id: 'shipping', name: 'Close to free shipping', group: 'cart', icon: 'truck', when: 'Left a cart within {gap} of free shipping', words: 'free shipping delivery threshold' },
  { id: 'expired', name: 'Expired code', group: 'cart', icon: 'tag', when: 'Tried an expired code {tries}, then left', words: 'discount coupon promo code expired invalid' },
  { id: 'viewed', name: 'Viewed a product', group: 'browse', icon: 'eye', when: 'Looked at a product, then left without buying', words: 'browse view product page left' },
  { id: 'repeat', name: 'Keeps coming back', group: 'browse', icon: 'rotate', when: 'Looked at the same product {times}', words: 'return repeat again visits interest' },
  { id: 'compare', name: 'Comparing two products', group: 'browse', icon: 'rotate', when: 'Switched between 2 products {times}', words: 'compare choose decide two between' },
  { id: 'interest', name: 'Reading up on a topic', group: 'browse', icon: 'book', when: 'Read about the same topic {times}', words: 'blog article read topic research learn' },
  { id: 'search', name: 'Searched, found nothing', group: 'browse', icon: 'search', when: 'Searched your store and found nothing', words: 'search no results empty find' },
  { id: 'firstvisit', name: 'First visit', group: 'browse', icon: 'user', when: 'Visited for the first time and left without buying', words: 'new visitor first time ad' },
  { id: 'pricedrop', name: 'Price drop', group: 'price', icon: 'dollar', when: 'Looked at something that dropped {drop} or more', words: 'price drop cheaper sale discount lower' },
  { id: 'stock', name: 'Back in stock', group: 'price', icon: 'bell', when: 'Saw something out of stock', words: 'stock sold out available restock back' },
  { id: 'lowstock', name: 'Almost sold out', group: 'price', icon: 'alert', when: 'Looked at something that’s almost sold out', words: 'low stock scarcity few left' },
  { id: 'thanks', name: 'Thank you', group: 'after', icon: 'check', when: 'Placed their first order', words: 'thank you first order welcome new customer purchase bought' },
  { id: 'review', name: 'Ask for a review', group: 'after', icon: 'star', when: 'Bought something {after} ago', words: 'review feedback rating stars bought purchase' },
  { id: 'reorder', name: 'Time to reorder', group: 'after', icon: 'calendar', when: 'Bought something about {days} ago', words: 'reorder refill replenish run out again bought purchase food' },
  { id: 'crosssell', name: 'Goes well with', group: 'after', icon: 'cart', when: 'Bought something that goes with another product', words: 'cross sell upsell accessory add on bought purchase' },
  { id: 'lapsed', name: 'Bought once, never again', group: 'winback', icon: 'refund', when: 'Bought once and not again in {idle}', words: 'win back lapsed churn one time customer' },
  { id: 'gone', name: 'Hasn’t been back', group: 'winback', icon: 'clock', when: 'Hasn’t visited in {idle}', words: 'inactive dormant away miss you come back' },
];

/** Built from parts: "Bought “kibble”, then didn’t come back". */
export type CustomTrigger = { event: CustomEvent; match: string; then: CustomThen };
export type CustomEvent = 'viewed' | 'cart' | 'checkout' | 'bought' | 'searched' | 'page';
export type CustomThen = 'left' | 'none' | 'gone';
export const EVENTS: { id: CustomEvent; label: string }[] = [
  { id: 'viewed', label: 'Viewed' },
  { id: 'cart', label: 'Added to cart' },
  { id: 'checkout', label: 'Started checkout with' },
  { id: 'bought', label: 'Bought' },
  { id: 'searched', label: 'Searched for' },
  { id: 'page', label: 'Visited a page about' },
];
export const THENS: { id: CustomThen; label: string }[] = [
  { id: 'left', label: 'then left without buying' },
  { id: 'gone', label: 'then didn’t come back' },
  { id: 'none', label: 'that’s it' },
];

/** What a campaign stores: a library id with its values, or a custom trigger. "wait" is how long we wait. */
export type TriggerRef = { id: string; params: Record<string, string>; custom?: CustomTrigger };

export const libraryTrigger = (id: string) => LIBRARY.find((t) => t.id === id);
export const paramValue = (ref: TriggerRef, key: string) => ref.params[key] ?? (PARAMS as Record<string, { def: string }>)[key]?.def ?? '';
export const paramKeys = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** The trigger as one plain sentence (for cards, lists and the server). */
export function triggerSentence(ref: TriggerRef): string {
  if (ref.custom) {
    const ev = EVENTS.find((e) => e.id === ref.custom!.event)?.label ?? 'Viewed';
    const what = ref.custom.match.trim() ? `“${ref.custom.match.trim()}”` : 'anything';
    const then = ref.custom.then === 'none' ? '' : `, ${THENS.find((t) => t.id === ref.custom!.then)?.label}`;
    return `${ev} ${what}${then}`;
  }
  const lib = libraryTrigger(ref.id);
  if (!lib) return 'Pick what starts it';
  return lib.when.replace(/\{(\w+)\}/g, (_, k: string) => paramValue(ref, k));
}

export function triggerName(ref: TriggerRef): string {
  if (ref.custom) {
    const m = ref.custom.match.trim();
    const ev = EVENTS.find((e) => e.id === ref.custom!.event)?.label ?? 'Viewed';
    return m ? `${ev} ${m}`.replace(/^./, (c) => c.toUpperCase()) : `${ev} anything`;
  }
  return libraryTrigger(ref.id)?.name ?? 'New campaign';
}

/** Library triggers that match what someone typed, best first. */
export function searchTriggers(query: string): LibraryTrigger[] {
  const words = query.toLowerCase().split(/[^a-z0-9$%]+/).filter((w) => w.length > 1);
  if (!words.length) return LIBRARY;
  const score = (t: LibraryTrigger) => {
    // The values a trigger can take count too: "3 weeks ago" points at triggers measured in weeks.
    const opts = paramKeys(t.when).flatMap((k) => (PARAMS as Record<string, { opts: readonly string[] }>)[k]?.opts ?? []).join(' ');
    const hay = `${t.name} ${t.when} ${t.words} ${opts}`.toLowerCase();
    return words.reduce((n, w) => n + (hay.includes(w) ? (t.name.toLowerCase().includes(w) ? 2 : 1) : 0), 0);
  };
  return LIBRARY.map((t) => [t, score(t)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Keep only values the library knows, so a stored trigger is always one the app can show. */
export function cleanTrigger(input: unknown): TriggerRef | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { id?: unknown; params?: unknown; custom?: unknown };
  const params: Record<string, string> = {};
  if (raw.params && typeof raw.params === 'object') {
    for (const [k, v] of Object.entries(raw.params as Record<string, unknown>)) {
      const p = (PARAMS as Record<string, { opts: readonly string[] }>)[k];
      if (p && typeof v === 'string' && p.opts.includes(v)) params[k] = v;
    }
  }
  if (raw.id === 'custom' && raw.custom && typeof raw.custom === 'object') {
    const c = raw.custom as Record<string, unknown>;
    const event = EVENTS.some((e) => e.id === c.event) ? (c.event as CustomEvent) : 'viewed';
    const then = THENS.some((t) => t.id === c.then) ? (c.then as CustomThen) : 'left';
    const match = typeof c.match === 'string' ? c.match.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    return { id: 'custom', params, custom: { event, match, then } };
  }
  if (typeof raw.id === 'string' && libraryTrigger(raw.id)) return { id: raw.id, params };
  return null;
}
