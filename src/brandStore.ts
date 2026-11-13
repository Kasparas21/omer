/* Brand knowledge: the logo, colours, fonts, products, photos, voice and docs Ghost writes emails with.
   Each store has its own set. The demo store starts with Pawsome's brand; a real store loads from the
   server (and keeps local file uploads in IndexedDB). */
import { useEffect, useSyncExternalStore } from 'react';
import { PHOTOS, STORE, photo } from './storeData';

export type BrandFile = { id: string; name: string; src: string; blob?: Blob; type?: string };
export type ColorRole = 'main' | 'secondary' | 'accent';
export type BrandColor = { id: string; name: string; hex: string; role?: ColorRole };
export type BrandFont = { id: string; role: string; family: string; file?: BrandFile | null };
export type BrandProduct = { id: string; name: string; price: string; image: BrandFile | null; image2?: BrandFile | null };
/** A page on the store we keep an eye on, so emails never quote a stale price, stock level or code. */
export type MonitoredPage = { id: string; path: string; addedAt: string; checkedAt?: string | null; change?: string | null };
export const MONITOR_LIMIT = 10;
/** Something emails are allowed to say about the store: a price, an offer, a policy, an answer. */
export type StoreFact = { id: string; group: string; name: string; value: string; review?: boolean };
export type LogoSlot = 'primary' | 'mark' | 'dark';
export type BrandDocs = { product: string; voice: string };
export type Brand = {
  logos: Record<LogoSlot, BrandFile | null>;
  colors: BrandColor[];
  fonts: BrandFont[];
  products: BrandProduct[];
  photos: BrandFile[];
  voice: { tagline: string; tone: string; about: string };
  docs: BrandDocs;
  monitor: MonitoredPage[];
  facts: StoreFact[];
  importedAt?: string | null;
};
export type FolderId = 'identity' | 'products' | 'brand' | 'facts';

export const DEMO_BRAND_SPACE = 'demo';
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const pawSvg = (fill: string, bg?: string) => {
  const paw = `<g fill="${fill}"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="5.6" cy="10" r="2.1"/><circle cx="9.5" cy="6.6" r="2.1"/><circle cx="14.5" cy="6.6" r="2.1"/><circle cx="18.4" cy="10" r="2.1"/></g>`;
  const svg = bg
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${bg}"/><g transform="translate(4.2 4) scale(.65)">${paw}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><g transform="translate(0 4) scale(1)">${paw}</g><text x="28" y="22" font-family="Georgia, serif" font-size="19" font-weight="700" fill="${fill}">Pawsome</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const pic = (key: keyof typeof PHOTOS, name: string): BrandFile => ({ id: key, name, src: photo(PHOTOS[key], 480) });

const DEMO: Brand = {
  logos: {
    primary: { id: 'logo', name: 'pawsome-logo.svg', src: pawSvg(STORE.color) },
    mark: { id: 'mark', name: 'pawsome-mark.svg', src: pawSvg('#fff', STORE.color) },
    dark: { id: 'dark', name: 'pawsome-logo-white.svg', src: pawSvg('#fff') },
  },
  colors: [
    { id: 'c1', name: 'Terracotta', hex: STORE.color, role: 'main' },
    { id: 'c2', name: 'Oat', hex: '#F4D7BF', role: 'secondary' },
    { id: 'c3', name: 'Cocoa', hex: '#2B1B13', role: 'accent' },
    { id: 'c4', name: 'Sand', hex: '#8C7A68' },
    { id: 'c5', name: 'Cream', hex: '#FFF8F1' },
  ],
  fonts: [
    { id: 'f1', role: 'Headings', family: 'Georgia' },
    { id: 'f2', role: 'Body', family: 'Inter' },
  ],
  products: [
    { id: 'p1', name: 'Kitten Starter Pack', price: '$49.00', image: pic('starter', 'kitten-starter-pack.jpg'), image2: pic('pate', 'kitten-starter-pack-food.jpg') },
    { id: 'p2', name: 'Grain-free Kitten Pâté', price: '$24.00', image: pic('pate', 'kitten-pate.jpg') },
    { id: 'p3', name: 'Salmon Kibble 4 kg', price: '$42.00', image: pic('kibble', 'salmon-kibble.jpg') },
    { id: 'p4', name: 'Tall Tower', price: '$129.00', image: pic('tower', 'tall-tower.jpg'), image2: pic('nook', 'tall-tower-room.jpg') },
    { id: 'p5', name: 'Cozy Nook', price: '$89.00', image: pic('nook', 'cozy-nook.jpg') },
    { id: 'p6', name: 'Sisal Scratching Post', price: '$34.00', image: pic('post', 'scratching-post.jpg') },
  ],
  photos: [pic('tower', 'hero-climbing.jpg'), pic('nook', 'window-nap.jpg'), pic('pate', 'dinner-time.jpg'), pic('post', 'scratch-time.jpg')],
  voice: {
    tagline: 'Good food and trees for curious cats',
    tone: 'Warm and a little playful. Short sentences. Never pushy.',
    about: 'Pawsome is a small Portland shop run by Marc and two very opinionated cats. We sell the food and furniture we trust at home.',
  },
  docs: {
    product: `## Overview\n- Product / store name: Pawsome\n- Website: pawsome.demo\n- One-liner: Good food and trees for curious cats\n- Language: English\n\n## What It Is\nA small Portland cat shop for food and furniture Marc trusts at home.\n\n## Who It's For\nCat people who want better food and climbing trees without the big-box noise.\n\n## What Emails Can Promise\n- Grain-free kitten pâté and salmon kibble in stock\n- Furniture built for real apartment living\n- Friendly help from a two-person shop\n\n## Proof Points\nnone found, emails should avoid unverifiable claims\n\n## Price & Offers\nStarter pack from $49; tall tower $129\n\n## Shipping, Returns & Guarantees\nnot found, confirm with merchant\n\n## Generated on\ndemo`,
    voice: `## Voice in three words\nWarm, playful, plain\n\n## Email register\nShort sentences. A little wit. Never pushy. (Good food and trees for curious cats.)\n\n## Subject line style\nSoft reminder / benefit-led\n- Still thinking about the Tall Tower?\n- Your cart kept the Kitten Starter Pack\n\n## What this brand would never say\n- "Unlock premium feline wellness synergies"\n- "Limited-time mega deal — act now!!!"\n- "As a leading disruptor in pet tech…"\n\n## One real rewrite\nOriginal: "Good food and trees for curious cats"\nEmail-length: "Good food and a better tree for your cat"\n\n## Tagline (from the site)\nGood food and trees for curious cats`,
  },
  monitor: [
    { id: 'm1', path: '/', addedAt: '2026-11-01', checkedAt: ago(18), change: null },
    { id: 'm2', path: '/products/tall-tower', addedAt: '2026-11-01', checkedAt: ago(120), change: 'Price changed: $139 → $129' },
    { id: 'm3', path: '/products/salmon-kibble-4kg', addedAt: '2026-11-02', checkedAt: ago(26), change: 'Back in stock' },
    { id: 'm4', path: '/pages/shipping', addedAt: '2026-11-04', checkedAt: ago(41), change: null },
  ],
  facts: [], // the demo store's facts live with its demo settings (they drive "needs review" counts)
};

export const emptyBrand = (): Brand => ({
  logos: { primary: null, mark: null, dark: null },
  colors: [],
  fonts: [{ id: 'f1', role: 'Headings', family: '' }, { id: 'f2', role: 'Body', family: '' }],
  products: [],
  photos: [],
  voice: { tagline: '', tone: '', about: '' },
  docs: { product: '', voice: '' },
  monitor: [],
  facts: [],
  importedAt: null,
});

// ---- the store
const spaces = new Map<string, Brand>([[DEMO_BRAND_SPACE, DEMO]]);
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Files come back from storage as Blobs; give each a URL the page can show. */
function withUrls(brand: Brand): Brand {
  const url = (f: BrandFile | null | undefined) => (f?.blob ? { ...f, src: URL.createObjectURL(f.blob) } : f ?? null);
  return {
    ...brand,
    logos: { primary: url(brand.logos.primary), mark: url(brand.logos.mark), dark: url(brand.logos.dark) },
    fonts: brand.fonts.map((f) => ({ ...f, file: url(f.file) })),
    products: brand.products.map((p) => ({ ...p, image: url(p.image), image2: url(p.image2) })),
    photos: brand.photos.map((p) => url(p) as BrandFile),
  };
}

// ---- IndexedDB, one record per store
const DB = 'omer-brand';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('spaces');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function readSpace(id: string): Promise<Brand | null> {
  const d = await db();
  return new Promise((resolve) => {
    const req = d.transaction('spaces').objectStore('spaces').get(id);
    req.onsuccess = () => resolve((req.result as Brand) ?? null);
    req.onerror = () => resolve(null);
  });
}
async function writeSpace(id: string, brand: Brand) {
  // Object URLs are per page load; keep only the Blob and rebuild the URL on the next load.
  const strip = (f: BrandFile | null | undefined) => (f ? (f.blob ? { ...f, src: '' } : f) : null);
  const record: Brand = {
    ...brand,
    docs: brand.docs || { product: '', voice: '' },
    logos: { primary: strip(brand.logos.primary), mark: strip(brand.logos.mark), dark: strip(brand.logos.dark) },
    fonts: brand.fonts.map((f) => ({ ...f, file: strip(f.file) })),
    products: brand.products.map((p) => ({ ...p, image: strip(p.image), image2: strip(p.image2) })),
    photos: brand.photos.map((p) => strip(p) as BrandFile),
  };
  const d = await db();
  await new Promise<void>((resolve) => {
    const tx = d.transaction('spaces', 'readwrite');
    tx.objectStore('spaces').put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function serializable(brand: Brand): Brand {
  const dropBlob = (f: BrandFile | null | undefined) => (f ? { id: f.id, name: f.name, src: f.src, type: f.type } : null);
  return {
    ...brand,
    logos: { primary: dropBlob(brand.logos.primary), mark: dropBlob(brand.logos.mark), dark: dropBlob(brand.logos.dark) },
    fonts: brand.fonts.map((f) => ({ ...f, file: dropBlob(f.file) })),
    products: brand.products.map((p) => ({ ...p, image: dropBlob(p.image), image2: dropBlob(p.image2) })),
    photos: brand.photos.map((p) => dropBlob(p) as BrandFile),
  };
}

async function pullServer(id: string) {
  if (id === DEMO_BRAND_SPACE || !uuidLike(id)) return null;
  try {
    const res = await fetch(`/api/projects/${id}/brand`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { brand?: Brand };
    return data.brand ? { ...emptyBrand(), ...data.brand } : null;
  } catch {
    return null;
  }
}

function uuidLike(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

let saveTimer = 0;
function pushServer(id: string, brand: Brand) {
  if (id === DEMO_BRAND_SPACE || !uuidLike(id)) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void fetch(`/api/projects/${id}/brand`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: serializable(brand) }),
    }).catch(() => undefined);
  }, 600);
}

function ensure(id: string) {
  if (spaces.has(id) || loading.has(id)) return;
  loading.add(id);
  spaces.set(id, emptyBrand());
  void (async () => {
    const remote = await pullServer(id);
    const local = await readSpace(id).catch(() => null);
    loading.delete(id);
    const base = remote || local;
    if (base) {
      spaces.set(id, withUrls({ ...emptyBrand(), ...base, docs: base.docs || { product: '', voice: '' } }));
      emit();
    }
  })();
}

const EMPTY = emptyBrand();
export function useBrand(id: string) {
  useEffect(() => { ensure(id); }, [id]);
  return useSyncExternalStore(subscribe, () => spaces.get(id) ?? EMPTY);
}

export function updateBrand(id: string, next: (b: Brand) => Brand) {
  const updated = next(spaces.get(id) ?? emptyBrand());
  spaces.set(id, updated);
  emit();
  if (id !== DEMO_BRAND_SPACE) {
    void writeSpace(id, updated).catch(() => undefined);
    pushServer(id, updated);
  }
}

/** Replace the whole brand (after a website import). */
export function replaceBrand(id: string, brand: Brand) {
  const next = withUrls({ ...emptyBrand(), ...brand, docs: brand.docs || { product: '', voice: '' } });
  spaces.set(id, next);
  emit();
  if (id !== DEMO_BRAND_SPACE) {
    void writeSpace(id, next).catch(() => undefined);
    pushServer(id, next);
  }
}

export async function importBrandFromSite(id: string) {
  if (!uuidLike(id)) throw new Error('Import is only for a connected store');
  const res = await fetch(`/api/projects/${id}/brand/import`, { method: 'POST' });
  const data = await res.json().catch(() => ({})) as { brand?: Brand; error?: string };
  if (!res.ok || !data.brand) throw new Error(data.error || 'Brand import failed');
  replaceBrand(id, data.brand);
  return data.brand;
}

export function fileFrom(file: File): BrandFile {
  return { id: newId(), name: file.name, src: URL.createObjectURL(file), blob: file, type: file.type };
}

/** How many things are in each folder, for its label. */
export function folderCount(b: Brand, folder: FolderId) {
  if (folder === 'identity') {
    return Object.values(b.logos).filter(Boolean).length
      + b.colors.length
      + b.fonts.filter((f) => f.family || f.file).length;
  }
  if (folder === 'products') return b.products.length;
  const docs = b.docs || { product: '', voice: '' };
  // Product Information sits with the store facts; the Brand Voice Guide with photos & voice.
  if (folder === 'facts') return (b.facts?.length ?? 0) + (docs.product.trim() ? 1 : 0);
  return b.photos.length + (b.voice.tagline || b.voice.tone || b.voice.about ? 1 : 0) + (docs.voice.trim() ? 1 : 0);
}

/** Closed-folder caption for Identity: “3 logos · 5 colors · 2 fonts”, or empty hint. */
export function identityCountLabel(b: Brand, empty: string) {
  const logos = Object.values(b.logos).filter(Boolean).length;
  const colors = b.colors.length;
  const fonts = b.fonts.filter((f) => f.family || f.file).length;
  if (!logos && !colors && !fonts) return empty;
  const parts: string[] = [];
  if (logos) parts.push(`${logos} ${logos === 1 ? 'logo' : 'logos'}`);
  if (colors) parts.push(`${colors} ${colors === 1 ? 'color' : 'colors'}`);
  if (fonts) parts.push(`${fonts} ${fonts === 1 ? 'font' : 'fonts'}`);
  return parts.join(' · ');
}
