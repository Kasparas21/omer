/* Example content for the demo store (Pawsome): the people behind Opportunities, the campaigns and the emails
   they send. Mirrors the product's example app. Real projects never read this; they show empty states until
   email drafting ships. */
import type { CampaignTrigger } from '../server/trigger-library';

export const photo = (id: string, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
export const PHOTOS = {
  starter: 'photo-1683871287549-852bcc3878b2',
  pate: 'photo-1596854331442-3cf47265cefb',
  kibble: 'photo-1764249453874-46864677b10e',
  tower: 'photo-1603118034132-a21911e496bb',
  nook: 'photo-1760475288242-27173bf5c48a',
  post: 'photo-1636543459630-8975a3548121',
} as const;
export type PhotoKey = keyof typeof PHOTOS;

export const STORE = { name: 'Pawsome', from: 'hello@pawsome.shop', address: 'Pawsome · 12 Harbor St, Portland, OR', color: '#C8471F' };

// ---------------- Emails ----------------
export type Product = { photo?: PhotoKey; img?: string; url?: string; name: string; now: string; was?: string; note?: string; specs?: [string, string][]; flat?: boolean };
export type BlockStyle = { align?: 'left' | 'center'; size?: 's' | 'm' | 'l'; width?: 'full' | 'fit'; layout?: 'side' | 'list' };
export type MailDoc = {
  kind: 'brand' | 'personal';
  subject: string;
  preview?: string;
  to?: string;
  headline: string;
  body: string[];
  products?: Product[];
  code?: { c: string; n: string };
  cta: string;
  /** Where the button goes. Empty means the store's home page. */
  ctaUrl?: string;
  perks?: string[];
  features?: string[];
  social?: string[];
  hero?: { photo?: PhotoKey; src?: string; tag?: string };
  cart?: { photo: PhotoKey; item: string; price: string; lines: [string, string][]; total: string };
  footer?: string;
  /** What a personal field says when we don't know it for someone, e.g. { first_name: 'there' }. */
  vars?: Record<string, string>;
  /** Block keys in order: headline, body.N, products, code, cta, perks, features, social, hero, cart, sig, div.N, footer. */
  order: string[];
  blocks: Record<string, BlockStyle>;
};
export type MailSkin = 'professional' | 'modern' | 'playful';
export type PageStyle = {
  bg: string; fill: string; text: string; accent: string;
  headFont: string; bodyFont: string; size: number; width: number; corners: number;
  ctaRadius?: number; headSize?: number; skin?: MailSkin;
};
export const PAGE_STYLE: PageStyle = {
  bg: '#F6F6F6', fill: '#FAFAFA', text: '#1A1A1A', accent: STORE.color,
  headFont: 'Georgia', bodyFont: 'Helvetica', size: 16, width: 600, corners: 16,
  ctaRadius: 999, headSize: 34, skin: 'playful',
};

type Draft = Omit<MailDoc, 'order' | 'blocks' | 'kind'> & { kind?: MailDoc['kind']; order?: string[] };
function mail(d: Draft): MailDoc {
  const order = d.order ?? ['headline', ...d.body.map((_, i) => `body.${i}`), ...(d.products?.length ? ['products'] : []), ...(d.code ? ['code'] : []), 'cta', ...(d.perks ? ['perks'] : []), 'sig'];
  return { kind: 'brand', ...d, order: order.includes('footer') ? order : [...order, 'footer'], blocks: {} };
}

// ---------------- People with a reason to hear from you ----------------
export type Status = 'review' | 'hold' | 'sent' | 'scheduled';
export type JourneyDay = { d: string; rows: { t: string; s?: string; ok?: boolean }[] };
export type Person = {
  id: string; name: string | null; email: string | null; cc: string; status: Status; time: string; sendAt: string;
  offer: string; title: string; why: string; note: string; warn?: boolean; evidenceGone?: boolean;
  source: { src: string; kind: string; camp?: string };
  journey: JourneyDay[]; after?: { t: string; s?: string; ok?: boolean }[];
  rec?: 'support' | 'wait'; recTitle?: string; recWhy?: string; recNote?: string;
  changed?: { t: string; d: string };
  bought?: string; sentAgo?: string; live?: boolean; campaign?: string;
  mail: MailDoc;
};

export const PEOPLE: Person[] = [
  {
    id: 'alex', name: 'Alex Morgan', email: 'alex@example.com', cc: 'us', status: 'review', time: '12m', sendAt: 'today 6:30 PM', campaign: 'expired',
    offer: 'Sending a working 10% code', title: 'Tried 2 expired codes, left checkout',
    why: 'Alex wanted a discount, so we’re sending a working 10% code.', note: 'KITTEN10, checked 2m ago',
    source: { src: 'Google', kind: 'Paid ad', camp: 'Kitten food' },
    journey: [{ d: 'Today', rows: [{ t: 'Added Kitten Starter Pack', s: '$49' }, { t: 'Tried WELCOME10 and SPRING15', s: 'Both expired' }, { t: 'Left checkout', s: '12m ago' }] }],
    mail: mail({
      subject: '10% off that kitten food 🐾', preview: 'A code that actually works.', to: 'alex@example.com', headline: 'Your 10% is here',
      body: ['Hi Alex,', 'Sorry about those old codes, they’ve expired. This one works, and your cart is saved, so it’s one click.'],
      products: [{ photo: 'starter', name: 'Kitten Starter Pack', was: '$49.00', now: '$44.10', note: 'Food, bowl and a feeding guide' }],
      code: { c: 'KITTEN10', n: '10% off · good for 48 hours' }, cta: 'Finish my order', perks: ['Free shipping over $35', '30-day returns'],
    }),
  },
  {
    id: 'jamie', name: null, email: 'j.chen92@gmail.com', cc: 'de', status: 'review', time: '28m', sendAt: 'tomorrow 8:00 AM', campaign: 'interest',
    offer: 'Sending a personal note, 10% off', title: 'Read only about kitten food',
    why: 'They seem to have a new kitten, so we’re sending a short note from Marc with the food most new owners pick.', note: 'HELLOKITTEN, checked 8m ago',
    source: { src: 'Instagram', kind: 'Post' },
    journey: [
      { d: 'Monday', rows: [{ t: 'Read “How much should a kitten eat?”' }, { t: 'Looked at Kitten Starter Pack', s: '$49' }] },
      { d: 'Today', rows: [{ t: 'Looked at Grain-free Kitten Pâté', s: '$24' }, { t: 'Left without buying', s: '28m ago' }] },
    ],
    mail: mail({
      kind: 'personal', subject: 'Feeding a new kitten', preview: 'What I tell every first-time owner.', to: 'j.chen92@gmail.com', headline: '',
      body: ['Hi there,', 'Marc here, I run Pawsome. If you’ve just brought a kitten home, here’s what I tell every first-time owner:', 'Small meals, three or four times a day. Their stomachs are tiny, so a big bowl mostly goes to waste.', 'Most people start with our Grain-free Kitten Pâté. The cans are small, so you’re not stuck with a huge bag if they turn out to be picky.', 'If you want to try it, HELLOKITTEN takes 10% off your first order.', 'Any questions, just hit reply. I read every one.'],
      order: ['body.0', 'body.1', 'body.2', 'body.3', 'cta', 'body.4', 'body.5', 'sig'],
      products: [{ photo: 'pate', name: 'Grain-free Kitten Pâté', was: '$24.00', now: '$21.60', note: '12 cans' }], code: { c: 'HELLOKITTEN', n: '10% off your first order' }, cta: 'See the Kitten Pâté',
    }),
  },
  {
    id: 'priya', name: 'Priya Nair', email: 'priya@example.com', cc: 'in', status: 'review', time: '1h', sendAt: 'today 7:15 PM', campaign: 'compare',
    offer: 'Sending both trees side by side', title: 'Couldn’t pick between 2 cat trees',
    why: 'Priya couldn’t decide, so we’re sending both trees side by side.', note: 'Sizes checked 1h ago',
    source: { src: 'Pinterest', kind: 'Pin' },
    journey: [{ d: 'Today', rows: [{ t: 'Looked at Tall Tower', s: '$129' }, { t: 'Looked at Cozy Nook', s: '$89' }, { t: 'Switched between them', s: '5 times' }, { t: 'Left without buying', s: '1h ago' }] }],
    changed: { t: 'Price changed, so this came back for review', d: 'Tall Tower dropped from $129 to $119 ten minutes ago. The email now shows the new price.' },
    mail: mail({
      subject: 'Tall Tower or Cozy Nook? Here’s the difference', preview: 'It mostly comes down to ceiling height.', to: 'priya@example.com', headline: 'Climber or hider?',
      body: ['Hi Priya,', 'Both have the same sisal posts and the same 5-year guarantee. The real difference is your room and your cat.', 'Still not sure? Reply with a photo of the corner and we’ll tell you which one fits.'],
      order: ['headline', 'body.0', 'body.1', 'products', 'cta', 'sig'],
      products: [
        { photo: 'tower', name: 'Tall Tower', was: '$129.00', now: '$119.00', specs: [['Height', '160 cm'], ['Fits', 'A high ceiling'], ['Best for', 'Climbers']] },
        { photo: 'nook', name: 'Cozy Nook', now: '$89.00', specs: [['Height', '95 cm'], ['Fits', 'By a window'], ['Best for', 'Hiders']] },
      ],
      cta: 'See both on the site',
    }),
  },
  {
    id: 'taylor', name: null, email: 'tbrooks@outlook.com', cc: 'gb', status: 'hold', time: '43m', sendAt: 'once stock is confirmed', campaign: 'stock',
    offer: 'Will send: it’s back in stock', title: 'Saw it out of stock, then left',
    why: 'They still want it, so we’ll send this once it’s back in stock.', note: 'Stock info is 26 hours old · replay expired', warn: true, evidenceGone: true,
    source: { src: 'Google', kind: 'Search' },
    journey: [{ d: 'Monday', rows: [{ t: 'Wanted Salmon Kibble 4 kg', s: 'Out of stock' }] }, { d: 'Today', rows: [{ t: 'Came back for it', s: 'Still out of stock' }, { t: 'Left the site', s: '43m ago' }] }],
    mail: mail({
      subject: 'It’s back: Salmon Kibble 4 kg', preview: 'Your size is in stock again.', to: 'tbrooks@outlook.com', headline: 'It’s back',
      body: ['Hi there,', 'Salmon Kibble 4 kg is on the shelf again. It sold out in two days last time, so we wanted you to hear first.'],
      hero: { photo: 'kibble', tag: 'Back in stock' }, perks: ['Free shipping over $35', 'Ships tomorrow'],
      order: ['hero', 'headline', 'body.0', 'body.1', 'products', 'cta', 'perks', 'sig'],
      products: [{ photo: 'kibble', name: 'Salmon Kibble 4 kg', now: '$42.00', note: 'About 8 weeks for one cat', flat: true }], cta: 'Get it before it’s gone',
    }),
  },
  {
    id: 'lukas', name: 'Lukas Petraitis', email: 'lukas@example.com', cc: 'lt', status: 'sent', time: '34m', sendAt: '', bought: '$34.00', sentAgo: '49m ago', campaign: 'shipping',
    offer: 'Sent free shipping', title: '$1 short of free shipping',
    why: 'Lukas was $1 short, so we sent free shipping.', note: 'Sent at 11:06 AM',
    source: { src: 'Meta ads', kind: 'Paid ad', camp: 'Cat furniture' },
    journey: [{ d: 'Today', rows: [{ t: 'Added Sisal Scratching Post', s: '$34' }, { t: 'Saw $5.95 shipping', s: 'Free from $35' }, { t: 'Left checkout' }] }],
    after: [{ t: 'Opened the email' }, { t: 'Bought the post', s: '$34.00', ok: true }],
    mail: mail({
      subject: 'Your scratching post is still waiting', preview: 'Free shipping is on us.', to: 'lukas@example.com', headline: 'Shipping’s on us',
      body: ['Hi Lukas,', 'Your scratching post is still in your cart.', 'You were $1 away from free shipping, so we’ve covered it.'],
      cart: { photo: 'post', item: 'Sisal Scratching Post', price: '$34.00', lines: [['Shipping', '<s>$5.95</s> Free']], total: '$34.00' },
      order: ['headline', 'body.0', 'body.1', 'cart', 'cta', 'sig'],
      products: [{ photo: 'post', name: 'Sisal Scratching Post', now: '$34.00', note: 'Free shipping applied' }], cta: 'Finish my order',
    }),
  },
  {
    id: 'nadia', name: 'Nadia Rossi', email: 'nadia@example.com', cc: 'fr', status: 'review', time: '35m', sendAt: 'tomorrow 9:00 AM',
    rec: 'support', offer: 'Passing to support', title: 'Card failed 3 times at checkout',
    why: 'A discount won’t fix a failed card, so this goes to support instead of an email.', note: 'Stripe says: card declined',
    recTitle: 'No email for this one', recWhy: 'Their card was declined 3 times on a $129 order. A person can sort this out faster than an email can.',
    recNote: 'Nadia Rossi tried to buy a Tall Tower ($129). Their card was declined 3 times around 11:20 AM. Worth offering another way to pay.',
    source: { src: 'Instagram', kind: 'Post' },
    journey: [{ d: 'Today', rows: [{ t: 'Added Tall Tower', s: '$129' }, { t: 'Card declined', s: '3 times' }, { t: 'Left checkout', s: '35m ago' }] }],
    mail: mail({
      kind: 'personal', subject: 'Trouble paying?', preview: 'Your cart is saved.', to: 'nadia@example.com', headline: '',
      body: ['Hi Nadia,', 'Marc here. It looks like your card didn’t go through when you tried to buy the Tall Tower.', 'It happens. Your cart is saved, and you can pay another way here:', 'Or just reply and we’ll sort it out together.'],
      order: ['body.0', 'body.1', 'body.2', 'cta', 'body.3', 'sig'], products: [{ photo: 'tower', name: 'Tall Tower', now: '$129.00' }], cta: 'Finish my order',
    }),
  },
  {
    id: 'ben', name: 'Ben Walker', email: 'ben@example.com', cc: 'gb', status: 'hold', time: 'Now', sendAt: 'once they leave', live: true,
    rec: 'wait', offer: 'Waiting until they leave', title: 'On your site now, comparing cat food',
    why: 'They’re still browsing, so an email now would only interrupt them.', note: 'Checked again when they leave',
    recTitle: 'Waiting, no email yet', recWhy: 'They’re on your site right now. If they leave without buying, an email is written for you to approve.',
    source: { src: 'Google', kind: 'Search' },
    journey: [{ d: 'Today', rows: [{ t: 'Looked at Salmon Kibble 4 kg', s: '$42' }, { t: 'Looked at Grain-free Kitten Pâté', s: '$24' }, { t: 'Still on your site', s: 'Now' }] }],
    mail: mail({
      subject: 'Kibble or pâté?', preview: 'What most people pick.', to: 'ben@example.com', headline: 'Kibble or pâté?',
      body: ['Hi Ben,', 'Kibble is easy and lasts for weeks. Pâté is softer and better for picky eaters. Most people keep a bit of both.'],
      products: [{ photo: 'kibble', name: 'Salmon Kibble 4 kg', now: '$42.00' }, { photo: 'pate', name: 'Grain-free Kitten Pâté', now: '$24.00' }], cta: 'See both',
    }),
  },
  {
    id: 'river', name: 'River Fox', email: null, cc: 'ng', status: 'review', time: '8m', sendAt: 'today 5:00 PM', campaign: 'stock',
    offer: 'Would remind about the cart', title: 'Left checkout with Salmon Kibble',
    why: 'They abandoned checkout, but we don’t have an email address yet — so nothing can be sent.', note: 'No recipient identity',
    source: { src: 'TikTok', kind: 'Paid ad', camp: 'Cat toys' },
    journey: [{ d: 'Today', rows: [{ t: 'Added Salmon Kibble 4 kg', s: '$42' }, { t: 'Opened checkout' }, { t: 'Left without an email', s: '8m ago' }] }],
    mail: mail({
      subject: 'Your Salmon Kibble is still in the cart', preview: 'Still saved for you.', headline: 'Still in your cart',
      body: ['Hi there,', 'You left Salmon Kibble 4 kg in checkout. It’s still saved if you want to finish.'],
      products: [{ photo: 'kibble', name: 'Salmon Kibble 4 kg', now: '$42.00', note: 'About 8 weeks for one cat', flat: true }], cta: 'Finish my order',
    }),
  },
];

/** Replies to emails already sent: the Replies tab on Opportunities. `sample` is whose email they answered. */
export type ReplyState = 'open' | 'fyi' | 'answered' | 'done' | 'resumed' | 'ooo' | 'optout';
export type Reply = {
  id: string; name: string | null; email: string; cc: string; source: Person['source']; state: ReplyState; time: string;
  sample: string; hi: string; sentAt: string; at: string; text: string[]; why: string; note: string; journey: JourneyDay[]; sent?: string[];
};
export const REPLIES: Reply[] = [
  { id: 'r-dana', name: 'Dana Okafor', email: 'dana@example.com', cc: 'au', source: { src: 'Pinterest', kind: 'Pin' }, state: 'open', time: '20m', sample: 'priya', hi: 'Hi Dana,', sentAt: 'Today 8:10 AM', at: 'Today 11:34 AM',
    text: ['Hi! Does the Tall Tower ship to Australia? And would I pay duty on top of the price?', 'If it’s a lot I might go with the Cozy Nook instead.'],
    why: 'Dana is close to buying and has a question, so follow-ups are stopped until you answer.', note: 'Shipping policy last checked 1h ago',
    journey: [{ d: 'Today', rows: [{ t: 'Looked at Tall Tower', s: '$129' }, { t: 'Looked at Cozy Nook', s: '$89' }, { t: 'Replied to your email', s: '20m ago' }] }] },
  { id: 'r-lukas', name: 'Lukas Petraitis', email: 'lukas@example.com', cc: 'lt', source: { src: 'Meta ads', kind: 'Paid ad', camp: 'Cat furniture' }, state: 'fyi', time: '29m', sample: 'lukas', hi: 'Hi Lukas,', sentAt: 'Today 9:05 AM', at: 'Today 11:26 AM',
    text: ['Thanks, the free shipping did it. Just ordered!'],
    why: 'Lukas already bought, so nothing else will go out.', note: 'Bought $34.00 at 11:21 AM',
    journey: [{ d: 'Today', rows: [{ t: 'Added Sisal Scratching Post', s: '$34' }, { t: 'Left checkout' }, { t: 'Bought it from your email', s: '$34.00', ok: true }, { t: 'Replied to your email' }] }] },
  { id: 'r-santos', name: null, email: 'r.santos@gmail.com', cc: 'br', source: { src: 'Google', kind: 'Search' }, state: 'open', time: '1h', sample: 'taylor', hi: 'Hi there,', sentAt: 'Today 9:02 AM', at: 'Today 10:48 AM',
    text: ['Is the salmon kibble ok for a 4 month old kitten, or is it only for adult cats?'],
    why: 'They’re asking if it’s right for their kitten, so follow-ups are stopped until you answer.', note: 'Product page last checked 3h ago',
    journey: [{ d: 'Today', rows: [{ t: 'Looked at Salmon Kibble 4 kg', s: '$42' }, { t: 'Replied to your email', s: '1h ago' }] }] },
  { id: 'r-sam', name: 'Sam Reyes', email: 'sam@example.com', cc: 'fr', source: { src: 'Google', kind: 'Paid ad', camp: 'Kitten food' }, state: 'ooo', time: '3h', sample: 'alex', hi: 'Hi Sam,', sentAt: 'Today 8:30 AM', at: 'Today 8:30 AM',
    text: ['I’m out of the office until November 10 with limited access to email.'],
    why: 'This was an automatic reply, so follow-ups wait until they’re back.', note: 'Back November 10',
    journey: [{ d: 'Today', rows: [{ t: 'Added Kitten Starter Pack', s: '$49' }, { t: 'Left checkout' }, { t: 'Automatic out-of-office reply' }] }] },
  { id: 'r-mia', name: null, email: 'mia.r@gmail.com', cc: 'br', source: { src: 'Instagram', kind: 'Paid ad', camp: 'Salmon kibble' }, state: 'optout', time: '1d', sample: 'taylor', hi: 'Hi there,', sentAt: 'Yesterday 7:20 PM', at: 'Yesterday 9:05 PM',
    text: ['Please take me off your list, thanks.'],
    why: 'They asked to stop, so they’re unsubscribed and won’t get another email.', note: 'Unsubscribed automatically',
    journey: [{ d: 'Yesterday', rows: [{ t: 'Bought Salmon Kibble 4 kg', s: '$42', ok: true }, { t: 'Asked to stop getting emails' }] }] },
];

// ---------------- Campaigns ----------------
export type CampaignIcon = 'tag' | 'book' | 'rotate' | 'bell' | 'truck' | 'calendar' | 'dollar' | 'megaphone';
export type Campaign = {
  id: string; name: string; icon: CampaignIcon; mode: 'auto' | 'review'; on: boolean;
  /** Who gets it: the same steps every store's campaigns use. */
  trigger?: CampaignTrigger | null;
  draft?: boolean; suggested?: boolean; share?: number; facts?: [string, string][];
  /** The email it sends: a sample person's, or an example. */
  mail: MailDoc | null;
};
const personMail = (id: string) => PEOPLE.find((p) => p.id === id)!.mail;
/** A campaign's email is for everyone in it, so the sample person's name becomes {{first_name}}. */
export function tokenize(doc: MailDoc): MailDoc {
  const d: MailDoc = JSON.parse(JSON.stringify(doc));
  const name = d.body[0]?.match(/^(?:Hi|Hey|Hello)\s+([^,]+),/)?.[1];
  d.body = d.body.map((line, i) => (i === 0 && name ? line.replace(name, '{{first_name}}') : line));
  d.to = 'each customer';
  return d;
}
export const CAMPAIGNS: Campaign[] = [
  { id: 'pricedrop', name: 'Price drop', trigger: { steps: [{ kind: 'price_drop', value: '5' }], wait: 'right away', template: 'price-drop' }, icon: 'dollar', mode: 'review', on: false, draft: true, suggested: true,
    facts: [['Looked at it this week', '12 people'], ['Tall Tower now', '$119 <s>$129</s>']],
    mail: tokenize(mail({
      subject: 'The Tall Tower just got cheaper', preview: 'Now $119, down from $129.', headline: 'It’s $10 less now',
      body: ['Hi Sam,', 'You looked at the Tall Tower last week. It just dropped from $129 to $119, so if it’s still on your mind, now’s a good time.'],
      products: [{ photo: 'tower', name: 'Tall Tower', was: '$129.00', now: '$119.00', note: '160 cm, for climbers' }], cta: 'See the Tall Tower', perks: ['Free shipping over $35', '30-day returns'],
    })) },
  { id: 'expired', name: 'Expired code rescue', trigger: { steps: [{ kind: 'code_failed', value: '' }, { kind: 'no_buy', value: '', within: '1 hour' }], wait: 'right away', template: 'code' }, icon: 'tag', mode: 'auto', on: true, share: 0.27, mail: tokenize(personMail('alex')) },
  { id: 'interest', name: 'Interest match', trigger: { steps: [{ kind: 'visited', value: '/blogs/', match: 'starts', times: 3 }, { kind: 'no_buy', value: '', within: '1 day' }], wait: 'right away', template: 'reader' }, icon: 'book', mode: 'review', on: true, share: 0.3, mail: tokenize(personMail('jamie')) },
  { id: 'compare', name: 'Help them choose', trigger: { steps: [{ kind: 'compared', value: '', times: 3 }, { kind: 'no_buy', value: '', within: '1 day' }], wait: 'right away', template: 'compare' }, icon: 'rotate', mode: 'review', on: true, share: 0.08, mail: tokenize(personMail('priya')) },
  { id: 'stock', name: 'Back in stock', trigger: { steps: [{ kind: 'sold_out', value: '' }, { kind: 'back_in_stock', value: '' }], wait: 'right away', template: 'back-in-stock' }, icon: 'bell', mode: 'auto', on: true, share: 0.14, mail: tokenize(personMail('taylor')) },
  { id: 'shipping', name: 'Free shipping nudge', trigger: { steps: [{ kind: 'near_free_ship', value: '35', gap: 5 }, { kind: 'no_buy', value: '', within: '1 hour' }], wait: 'right away', template: 'free-ship' }, icon: 'truck', mode: 'review', on: true, share: 0.21, mail: tokenize(personMail('lukas')) },
  { id: 'reorder', name: 'Running low', trigger: { steps: [{ kind: 'bought', value: 'Salmon Kibble' }, { kind: 'no_buy', value: '', within: '3 weeks' }], wait: 'right away', template: 'reorder' }, icon: 'calendar', mode: 'review', on: false, draft: true,
    mail: tokenize(mail({
      subject: 'Running low on Salmon Kibble?', preview: 'One click and it’s on its way.', headline: 'Time for a refill?',
      body: ['Hi Sam,', 'It’s been about three weeks since your Salmon Kibble 4 kg arrived, so the bag is probably getting light. Here it is again, ready to go.'],
      products: [{ photo: 'kibble', name: 'Salmon Kibble 4 kg', now: '$42.00', note: 'About 8 weeks for one cat' }], cta: 'Reorder in one click', perks: ['Free shipping over $35', 'Ships tomorrow'],
    })) },
];
/** Personal follow-ups: three emails it wrote for three different moments. */
export const PERSONAL_MAILS: MailDoc[] = [
  personMail('ben'),
  mail({
    subject: 'Which size fits?', preview: 'Both sizes, side by side.', headline: 'Which size fits?',
    body: ['Hi Dana,', 'You asked twice if the Cozy Nook fits a big cat. It does, up to 9 kg, and the Tall Tower fits up to 12 kg.'],
    products: [{ photo: 'nook', name: 'Cozy Nook', now: '$89.00' }, { photo: 'tower', name: 'Tall Tower', now: '$119.00' }], cta: 'Compare the sizes',
  }),
  personMail('nadia'),
];

// ---------------- Results ----------------
const noise = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
/** 60 days of demo sends, clicks, orders and sales, shaped like the product UI (weekday rhythm plus a mid-period lift). */
export const DEMO_DAYS = (() => {
  const n = 60;
  const sent = Array.from({ length: n }, (_, i) => Math.round(760 + 260 * Math.sin(i * 0.9) + 220 * noise(i, 3) + (i > 40 ? 120 : 0)));
  const clicked = sent.map((s, i) => Math.round(s * (0.42 + 0.08 * noise(i, 4))));
  const orders = clicked.map((c, i) => Math.round(c * (0.42 + 0.2 * noise(i, 5))));
  const sales = orders.map((o, i) => Math.round(o * (38 + 8 * noise(i, 6))));
  const written = sent.map((s, i) => Math.round(s * (1.08 + 0.04 * noise(i, 7))));
  return { sent, clicked, orders, sales, written };
})();
const sumLast = (xs: number[], n: number) => xs.slice(-n).reduce((a, b) => a + b, 0);
/** A campaign's share of the last N days: sent, bought, sales. Matches the Results table. */
export function campaignStats(c: Campaign, days = 14): [number, number, number] {
  if (!c.share) return [0, 0, 0];
  const sent = Math.round(sumLast(DEMO_DAYS.sent, days) * c.share);
  return [sent, Math.round(sent * 0.239), Math.round(sumLast(DEMO_DAYS.sales, days) * c.share)];
}
export const RESULT_CAMPAIGNS = [
  { id: 'interest', why: 'Read one category 3 or more times' },
  { id: 'expired', why: 'Tried an expired code, then left' },
  { id: 'shipping', why: 'Left a cart close to free shipping' },
  { id: 'stock', why: 'Saw something out of stock' },
  { id: 'compare', why: 'Switched between 2 products 3 or more times' },
];
export const NOT_SENT = [['A price or stock changed', 0.041], ['You rejected them', 0.023], ['Not approved in time', 0.018], ['Quiet hours', 0.009]] as const;
export const SAID_NO = [['Unsubscribed', 0.006], ['Marked as spam', 0.0004], ['Bounced', 0.004]] as const;
