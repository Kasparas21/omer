/* Example content for the demo store (Pawsome) on Opportunities, Campaigns and Results, mirroring the
   UI kit's example app. Real projects never read this; they show empty states until email drafting ships. */

export const photo = (id: string, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
export const PHOTOS = {
  starter: 'photo-1683871287549-852bcc3878b2',
  pate: 'photo-1596854331442-3cf47265cefb',
  kibble: 'photo-1764249453874-46864677b10e',
  tower: 'photo-1603118034132-a21911e496bb',
  nook: 'photo-1760475288242-27173bf5c48a',
  post: 'photo-1636543459630-8975a3548121',
} as const;

export type Strength = 'Fair' | 'Strong';
export type Opportunity = {
  id: string; name: string; email: string; cc: string; status: 'review' | 'hold' | 'approved' | 'replies';
  time: string; sendAt: string; offer: string; title: string; strength: Strength; flags?: string[];
  why: string; note: string; campaign: string;
  journey: { t: string; s: string }[];
  draft: { subject: string; headline: string; body: string[]; product?: { name: string; detail: string; was: string; now: string; photo: keyof typeof PHOTOS }; code?: { code: string; note: string }; cta: string };
};

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'alex', name: 'Alex Morgan', email: 'alex@example.com', cc: 'us', status: 'review', time: '12m', sendAt: 'today 6:30 PM',
    offer: 'Sending a working 10% code', title: 'Tried 2 expired codes, left checkout', strength: 'Fair', campaign: 'Expired code rescue',
    why: 'Alex wanted a discount, so we’re sending a working 10% code.', note: 'KITTEN10, checked 2m ago',
    journey: [{ t: 'Came from Google', s: 'Paid ad · Kitten food' }, { t: 'Added Kitten Starter Pack', s: '$49' }, { t: 'Tried WELCOME10 and SPRING15', s: 'Both expired' }, { t: 'Left checkout', s: '12m ago' }],
    draft: {
      subject: '10% off that kitten food 🐾', headline: 'Your 10% is here',
      body: ['Hi Alex,', 'Sorry about those old codes, they’ve expired. This one works, and your cart is saved, so it’s one click.'],
      product: { name: 'Kitten Starter Pack', detail: 'Food, bowl and a feeding guide', was: '$49.00', now: '$44.10', photo: 'starter' },
      code: { code: 'KITTEN10', note: '10% off · good for 48 hours' }, cta: 'Finish my order',
    },
  },
  {
    id: 'jchen', name: 'j.chen92@gmail.com', email: 'j.chen92@gmail.com', cc: 'ca', status: 'review', time: '28m', sendAt: 'today 7:00 PM',
    offer: 'Sending a personal note, 10% off', title: 'Came back 3 times for the same tower', strength: 'Strong', campaign: 'Interest match',
    why: 'They keep coming back to the Tall Tower, so a short note from Marc with 10% off.', note: 'Visited 3 times this week',
    journey: [{ t: 'Came back from Instagram', s: 'Third visit this week' }, { t: 'Looked at Tall Tower', s: '4m on the page' }, { t: 'Checked shipping times', s: 'Left after 2m' }],
    draft: {
      subject: 'A little nudge on the Tall Tower', headline: 'Still thinking it over?',
      body: ['Hi there,', 'Marc here. I noticed you’ve been looking at the Tall Tower. It’s our sturdiest climber, and here’s 10% off if it helps you decide.'],
      product: { name: 'Tall Tower', detail: 'Sisal posts, three levels', was: '$129.00', now: '$116.10', photo: 'tower' },
      code: { code: 'TOWER10', note: '10% off · good for 72 hours' }, cta: 'See the Tall Tower',
    },
  },
  {
    id: 'priya', name: 'Priya Nair', email: 'priya@example.com', cc: 'in', status: 'review', time: '1h', sendAt: 'today 7:15 PM',
    offer: 'Sending both trees side by side', title: 'Switched between 2 cat trees 4 times', strength: 'Strong', flags: ['Price changed'], campaign: 'Help them choose',
    why: 'Priya can’t pick between two trees, so we’re showing both side by side.', note: 'Tall Tower dropped to $119 today',
    journey: [{ t: 'Came from Pinterest', s: 'Cat tree ideas' }, { t: 'Compared Tall Tower and Cozy Nook', s: '4 switches' }, { t: 'Left from the size guide', s: '1h ago' }],
    draft: {
      subject: 'Climber or hider?', headline: 'Climber or hider?',
      body: ['Hi Priya,', 'Both have the same sisal posts and the same 5-year guarantee. The real difference is your room and your cat.'],
      product: { name: 'Cozy Nook', detail: 'For cats who like to hide', was: '$89.00', now: '$89.00', photo: 'nook' }, cta: 'Compare them',
    },
  },
  {
    id: 'nadia', name: 'Nadia Rossi', email: 'nadia@example.com', cc: 'it', status: 'review', time: '35m', sendAt: 'with support',
    offer: 'Passing to support', title: 'Card declined twice on the Tall Tower', strength: 'Fair', campaign: 'Personal follow-ups',
    why: 'Nadia’s card didn’t go through, so support should help instead of a sales email.', note: 'Two declined payments',
    journey: [{ t: 'Added Tall Tower', s: '$129' }, { t: 'Card declined', s: 'Twice' }, { t: 'Left checkout', s: '35m ago' }],
    draft: {
      subject: 'About your order', headline: 'Let’s sort it out',
      body: ['Hi Nadia,', 'Marc here. It looks like your card didn’t go through when you tried to buy the Tall Tower. Your cart is saved, and you can pay another way.'],
      cta: 'Finish my order',
    },
  },
  {
    id: 'dana', name: 'Dana Okafor', email: 'dana@example.com', cc: 'ng', status: 'review', time: '2h', sendAt: 'tomorrow 9:00 AM',
    offer: 'Answering a shipping question', title: 'Asked if the Cozy Nook fits a big cat', strength: 'Fair', campaign: 'Personal follow-ups',
    why: 'Dana asked about sizes twice, so we answer with the real dimensions.', note: 'Asked in chat, 2h ago',
    journey: [{ t: 'Opened chat', s: 'Asked about size' }, { t: 'Looked at Cozy Nook', s: '2 visits' }],
    draft: {
      subject: 'Which size fits?', headline: 'Which size fits?',
      body: ['Hi Dana,', 'You asked twice if the Cozy Nook fits a big cat. It does, up to 9 kg, and the Tall Tower fits up to 12 kg.'],
      product: { name: 'Cozy Nook', detail: 'Fits cats up to 9 kg', was: '$89.00', now: '$89.00', photo: 'nook' }, cta: 'See sizes',
    },
  },
  {
    id: 'river', name: 'River Fox', email: 'river@example.com', cc: 'gb', status: 'hold', time: '8m', sendAt: 'after the session',
    offer: 'Waiting for the session to end', title: 'Still browsing the salmon kibble', strength: 'Fair', campaign: 'Interest match',
    why: 'River is still on the site, so we wait until they leave.', note: 'Active now',
    journey: [{ t: 'Looking at Salmon Kibble 4 kg', s: 'Now' }],
    draft: { subject: 'The kibble you were looking at', headline: 'Back in stock', body: ['Hi River,', 'Salmon Kibble 4 kg is on the shelf again.'], product: { name: 'Salmon Kibble 4 kg', detail: 'About 8 weeks for one cat', was: '$42.00', now: '$42.00', photo: 'kibble' }, cta: 'Get it before it’s gone' },
  },
  {
    id: 'ben', name: 'Ben Walker', email: 'ben@example.com', cc: 'gb', status: 'hold', time: 'now', sendAt: 'after the session',
    offer: 'Comparing cat food', title: 'On the site now, comparing cat food', strength: 'Fair', campaign: 'Interest match',
    why: 'Ben is still deciding, so we hold the email.', note: 'Active now',
    journey: [{ t: 'Comparing kibble and pâté', s: 'Now' }],
    draft: { subject: 'Kibble or pâté?', headline: 'Kibble or pâté?', body: ['Hi Ben,', 'Kibble is easy and lasts for weeks. Pâté is softer and better for picky eaters.'], cta: 'See both' },
  },
  {
    id: 'mia', name: 'Mia Torres', email: 'mia@example.com', cc: 'es', status: 'approved', time: '3h', sendAt: 'today 5:00 PM',
    offer: 'Free shipping nudge', title: 'Left a cart $4 short of free shipping', strength: 'Strong', campaign: 'Free shipping nudge',
    why: 'Mia was $4 away from free shipping.', note: 'Approved by you',
    journey: [{ t: 'Added Sisal Scratching Post', s: '$34' }, { t: 'Left at shipping', s: '3h ago' }],
    draft: { subject: 'Shipping’s on us', headline: 'Shipping’s on us', body: ['Hi Mia,', 'Your scratching post is still in your cart, and shipping is free today.'], product: { name: 'Sisal Scratching Post', detail: 'Tall and steady', was: '$34.00', now: '$34.00', photo: 'post' }, cta: 'Finish my order' },
  },
];

export type Campaign = {
  id: string; name: string; icon: 'dollar' | 'tag' | 'book' | 'rotate' | 'bell' | 'truck' | 'calendar';
  state: 'on' | 'suggested' | 'draft'; headline: string; body: string; photos?: (keyof typeof PHOTOS)[];
  product?: { name: string; detail: string; price: string; cta: string };
  cart?: { name: string; price: string; shipping: string };
};

export const CAMPAIGNS: Campaign[] = [
  { id: 'price', name: 'Price drop', icon: 'dollar', state: 'suggested', headline: 'It’s $10 less now', body: 'You looked at the Tall Tower last week. It just dropped from $129 to $119, so if it’s still on your mind, now’s a good time.', photos: ['tower'] },
  { id: 'code', name: 'Expired code rescue', icon: 'tag', state: 'on', headline: 'Your 10% is here', body: 'Sorry about those old codes, they’ve expired. This one works, and your cart is saved, so it’s one click.', photos: ['starter'] },
  { id: 'interest', name: 'Interest match', icon: 'book', state: 'on', headline: '', body: 'Marc here, I run Pawsome. If you’ve just brought a kitten home, here’s what I tell every first-time owner:\n\nSmall meals, three or four times a day. Their stomachs are tiny, so a big bowl mostly goes to waste.\n\nMost people start with our Grain-free Kitten Pâté. The cans are small, so you’re not stuck with a huge bag if they turn out to be picky.' },
  { id: 'choose', name: 'Help them choose', icon: 'rotate', state: 'on', headline: 'Climber or hider?', body: 'Both have the same sisal posts and the same 5-year guarantee. The real difference is your room and your cat.', photos: ['tower', 'nook'] },
  { id: 'stock', name: 'Back in stock', icon: 'bell', state: 'on', headline: 'It’s back', body: 'Salmon Kibble 4 kg is on the shelf again. It sold out in two days last time, so we wanted you to hear first.', product: { name: 'Salmon Kibble 4 kg', detail: 'About 8 weeks for one cat', price: '$42.00', cta: 'Get it before it’s gone' } },
  { id: 'shipping', name: 'Free shipping nudge', icon: 'truck', state: 'on', headline: 'Shipping’s on us', body: 'Your scratching post is still in your cart.', cart: { name: 'Sisal Scratching Post', price: '$34.00', shipping: '$5.95' } },
  { id: 'refill', name: 'Running low', icon: 'calendar', state: 'draft', headline: 'Time for a refill?', body: 'It’s been about three weeks since your Salmon Kibble 4 kg arrived, so the bag is probably getting light. Here it is again, ready to go.', photos: ['kibble'] },
];

/** Results breakdown by campaign (share of sends, bought rate) for the demo store. */
export const RESULT_CAMPAIGNS = [
  { name: 'Interest match', why: 'Read one category 3 or more times', sent: 0.3, bought: 0.239 },
  { name: 'Expired code rescue', why: 'Tried an expired code, then left', sent: 0.27, bought: 0.239 },
  { name: 'Free shipping nudge', why: 'Left a cart close to free shipping', sent: 0.21, bought: 0.238 },
  { name: 'Back in stock', why: 'Saw something out of stock', sent: 0.14, bought: 0.238 },
  { name: 'Help them choose', why: 'Switched between 2 products 3 or more times', sent: 0.08, bought: 0.238 },
];
export const NOT_SENT = [['A price or stock changed', 0.041], ['You rejected them', 0.023], ['Not approved in time', 0.018], ['Quiet hours', 0.009]] as const;
export const SAID_NO = [['Unsubscribed', 0.006], ['Marked as spam', 0.0004], ['Bounced', 0.004]] as const;
