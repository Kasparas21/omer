/* Example data for the demo project only (the "Pawsome" store at pawsome.shop).
   Email and store data aren't connected yet, so this fills those cards the way the product UI shows them.
   Values are derived from the demo project's own traffic, so they move with its visitor curve.
   Real projects never use any of this. */

export const DEMO_ORIGIN = 'https://pawsome.shop';
export const isDemo = (project?: { origin: string }) => project?.origin === DEMO_ORIGIN;

// Stable 0..1 noise per index, so numbers don't jump between renders.
const noise = (i: number, salt = 1) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const RETURNING = (i: number) => 0.34 + 0.07 * Math.sin(i * 1.3 + 0.6); // share of sales from repeat buyers
const AVG_ORDER = 62;

/** Email sends, clicks, orders and revenue for each point of a visitor series. */
export function demoSeries(people: number[], salt = 1) {
  const sent = people.map((p, i) => Math.round(p * (0.5 + 0.12 * noise(i, salt))));
  const clicked = sent.map((s, i) => Math.round(s * (0.42 + 0.08 * noise(i, salt + 1))));
  const orders = clicked.map((c, i) => Math.round(c * (0.16 + 0.05 * noise(i, salt + 2))));
  const sales = orders.map((o, i) => Math.round(o * AVG_ORDER * (0.85 + 0.3 * noise(i, salt + 3))));
  return { sent, clicked, orders, sales };
}

export const CAMPAIGN_COLORS = ['#6360F0', '#f59e0b', '#4F4BE0', '#d0d0db'];
export const DEMO_CAMPAIGNS = [
  { name: 'Interest match', share: 0.3 },
  { name: 'Expired code rescue', share: 0.27 },
  { name: 'Free shipping nudge', share: 0.21 },
  { name: '2 more campaigns', share: 0.22 },
];

export const DEMO_PRODUCTS = [
  { name: 'Kitten Starter Pack', share: 0.29, price: 49, tint: '#f6d6c4' },
  { name: 'Tall Tower', share: 0.23, price: 129, tint: '#e2dcf7' },
  { name: 'Cozy Nook', share: 0.16, price: 89, tint: '#d7ecf2' },
  { name: 'Salmon Kibble 4 kg', share: 0.12, price: 42, tint: '#fbe3cf' },
  { name: 'Sisal Scratching Post', share: 0.08, price: 34, tint: '#e9e3d6' },
];

export const DEMO_SCHEDULE = [
  { seed: 'alex', name: 'Alex Morgan', when: 'today 6:30 PM' },
  { seed: 'priya', name: 'Priya Nair', when: 'today 7:15 PM' },
  { seed: 'river', name: 'River Fox', when: 'today 5:00 PM' },
];

export type NeedRow = { who: string; what: string; when?: string; seed?: string; icon?: 'ghost' | 'edit' | 'reply' | 'alert' };
export const DEMO_NEEDS: { id: string; label: string; go: string; rows: NeedRow[] }[] = [
  { id: 'review', label: 'To approve', go: 'Opportunities', rows: [
    { seed: 'alex', who: 'Alex Morgan', what: 'Sending a working 10% code', when: '12m' },
    { seed: 'jchen', who: 'j.chen92@gmail.com', what: 'Sending a personal note, 10% off', when: '28m' },
    { seed: 'priya', who: 'Priya Nair', what: 'Sending both trees side by side', when: '1h' },
    { seed: 'nadia', who: 'Nadia Rossi', what: 'Passing to support', when: '35m' },
    { seed: 'dana', who: 'Dana Okafor', what: 'Answering a shipping question', when: '2h' },
  ] },
  { id: 'hold', label: 'On hold', go: 'Opportunities', rows: [
    { seed: 'river', who: 'River Fox', what: 'Waiting for the session to end', when: '8m' },
    { seed: 'ben', who: 'Ben Walker', what: 'Still on the site, comparing cat food', when: 'now' },
  ] },
  { id: 'replies', label: 'Replies', go: 'Opportunities', rows: [
    { seed: 'quiet', who: 'Sam Lee', what: '“Does the tower come in grey?”', when: '20m', icon: 'reply' },
    { seed: 'otter', who: 'Mia Torres', what: '“Thanks, ordered!”', when: '1h', icon: 'reply' },
  ] },
  { id: 'facts', label: 'Facts to check', go: 'Settings', rows: [
    { who: 'Two answers for free shipping', what: 'Your shipping page says over $35. Your FAQ says over $50.', icon: 'alert' },
    { who: 'Do you ship to Australia?', what: 'Dana Okafor asked and your site doesn’t say.', icon: 'alert' },
  ] },
  { id: 'changes', label: 'Site changes', go: 'Settings', rows: [
    { who: 'Tall Tower price', what: 'Was $139, now $129', when: '3h', icon: 'edit' },
    { who: 'Kitten Starter Pack', what: 'Was in stock, now low stock', when: '5h', icon: 'edit' },
    { who: 'WELCOME10 code', what: 'Was active, now expired', when: '1d', icon: 'edit' },
  ] },
];

/** For People: about a quarter of demo visitors are known customers with an email and some revenue. */
export function demoCustomer(seed: string, handle: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const known = h % 4 === 0;
  if (!known) return { email: null as string | null, revenue: 0 };
  return { email: `${handle.toLowerCase().replace(/\s+/g, '.')}@example.com`, revenue: 40 + (h % 9) * 23 };
}
