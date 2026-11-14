#!/usr/bin/env node
/* Render recipe × skin MailDoc fixtures to tmp/email-fixtures/ for visual QA.
   Run: npm run email:fixtures  (or: node --import tsx scripts/email-fixtures.mjs) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mailDocToHtml } from '../server/email-html.ts';
import { LAYOUT_RECIPES } from '../server/email-sections.ts';
import { skinChrome } from '../server/email-page.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp/email-fixtures');
mkdirSync(outDir, { recursive: true });

const brand = {
  name: 'Fixture Co',
  logo: undefined,
  sender: 'Alex',
  signoff: 'Fixture Co',
  address: 'Fixture Co · fixture.example',
};

const tracking = {
  openPixel: 'https://example.com/o.gif',
  unsubscribeUrl: 'https://example.com/unsub',
  wrapClick: (url) => url,
  name: 'Sam',
};

const docs = {
  launch: {
    kind: 'brand',
    subject: 'The Tall Tower is back in your size',
    preview: 'Still thinking about it?',
    headline: 'Still thinking about the Tall Tower?',
    body: ['Hi {{first_name}},', 'You looked at the Tall Tower twice this week. It’s ready when you are.'],
    products: [{ name: 'Tall Tower', now: '$129', was: '$149', note: 'Free shipping over $100' }],
    cta: 'See the Tall Tower',
    ctaUrl: 'https://fixture.example/tall-tower',
    perks: ['Free shipping over $100', '30-day returns'],
    hero: { src: 'https://placehold.co/600x360/png?text=Hero' },
    order: [...LAYOUT_RECIPES.launch.order],
  },
  cart_rescue: {
    kind: 'brand',
    subject: 'Your cart is still saved',
    preview: 'We kept it for you.',
    headline: 'Your cart is waiting',
    body: ['You left the Kitten Starter Pack in your cart.'],
    products: [{ name: 'Kitten Starter Pack', now: '$48' }],
    code: { c: 'WELCOME10', n: '10% off your first order' },
    cta: 'Complete checkout',
    ctaUrl: 'https://fixture.example/cart',
    perks: ['Secure checkout'],
    hero: { src: 'https://placehold.co/600x360/png?text=Cart' },
    order: [...LAYOUT_RECIPES.cart_rescue.order],
  },
  compare: {
    kind: 'brand',
    subject: 'Tall Tower or Cozy Nook?',
    preview: 'Side by side.',
    headline: 'Which fits your space?',
    body: ['Two solid picks — mostly a ceiling-height question.', 'Both ship free this week.'],
    products: [
      { name: 'Tall Tower', now: '$129', note: '8 ft rooms' },
      { name: 'Cozy Nook', now: '$89', note: 'Apartments' },
    ],
    cta: 'Compare both',
    ctaUrl: 'https://fixture.example/compare',
    perks: ['Free returns'],
    order: [...LAYOUT_RECIPES.compare.order],
  },
  editorial_note: {
    kind: 'personal',
    subject: 'Feeding a new kitten',
    preview: 'What I tell first-time owners.',
    headline: '',
    body: [
      'Hi {{first_name}},',
      'Most new owners overthink the first month. Keep meals small and consistent.',
      'If you want one reliable bag, this is the size I’d start with.',
      'Happy to answer anything — just reply.',
    ],
    products: [{ name: 'Salmon Kibble 2 kg', now: '$32' }],
    cta: 'See Salmon Kibble',
    ctaUrl: 'https://fixture.example/kibble',
    order: [...LAYOUT_RECIPES.editorial_note.order],
  },
  restock: {
    kind: 'brand',
    subject: 'It’s back: Salmon Kibble 4 kg',
    preview: 'Your size is in stock again.',
    headline: 'It’s back',
    body: ['The 4 kg bag is in stock again.'],
    products: [{ name: 'Salmon Kibble 4 kg', now: '$54' }],
    cta: 'Grab the 4 kg',
    ctaUrl: 'https://fixture.example/kibble-4kg',
    features: ['Grain-free option', 'Ships in 1–2 days', 'Subscribe & save'],
    hero: { src: 'https://placehold.co/600x360/png?text=Restock' },
    order: [...LAYOUT_RECIPES.restock.order],
  },
  digest: {
    kind: 'brand',
    subject: 'This week at Fixture Co',
    preview: 'Three short notes.',
    headline: 'A quiet week of good gear',
    body: [
      'New climbing posts landed Monday.',
      'The starter pack is back under $50.',
      'We restocked the 4 kg kibble — it goes fast.',
    ],
    cta: 'Browse the shop',
    ctaUrl: 'https://fixture.example/',
    order: [...LAYOUT_RECIPES.digest.order],
  },
};

const skins = {
  professional: { bg: '#F3F4F6', fill: '#FAFAFA', text: '#1A1A1A', accent: '#1F3A5F', headFont: 'Helvetica', bodyFont: 'Helvetica' },
  modern: { bg: '#F6F6F6', fill: '#FAFAFA', text: '#1A1A1A', accent: '#2F5FD0', headFont: 'Georgia', bodyFont: 'Helvetica' },
  playful: { bg: '#F7F3EE', fill: '#FAFAFA', text: '#1A1A1A', accent: '#C45C26', headFont: 'Georgia', bodyFont: 'Helvetica' },
};

const index = [];
for (const [recipe, doc] of Object.entries(docs)) {
  for (const [skin, base] of Object.entries(skins)) {
    const chrome = skinChrome(skin);
    const page = {
      ...base,
      width: 600,
      size: chrome.size,
      corners: chrome.corners,
      ctaRadius: chrome.ctaRadius,
      headSize: chrome.headSize,
      skin,
    };
    const html = mailDocToHtml(doc, page, brand, tracking);
    const name = `${recipe}__${skin}.html`;
    writeFileSync(join(outDir, name), html);
    index.push(`<li><a href="./${name}">${recipe} · ${skin}</a></li>`);
  }
}

writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Email fixtures</title>
<style>body{font:15px/1.5 system-ui;padding:32px;max-width:640px} a{color:#2F5FD0}</style>
</head><body>
<h1>Email fixtures</h1>
<p>Recipe × skin renders from <code>mailDocToHtml</code>. Open each file, or paste into Litmus.</p>
<ul>${index.join('\n')}</ul>
</body></html>`);

console.log(`Wrote ${index.length} fixtures → ${outDir}`);
console.log(`Open ${join(outDir, 'index.html')}`);
