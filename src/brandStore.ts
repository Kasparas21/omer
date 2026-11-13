/* Brand knowledge: the logo, colours, fonts, products, photos and voice Ghost writes emails with.
   Each store has its own set. The demo store starts with Pawsome's brand; a real store starts empty until
   website import ships. Until then, what you add is kept in this browser (IndexedDB, files included). */
import { useEffect, useSyncExternalStore } from 'react';
import { PHOTOS, STORE, photo } from './storeData';

export type BrandFile = { id: string; name: string; src: string; blob?: Blob; type?: string };
export type BrandColor = { id: string; name: string; hex: string };
export type BrandFont = { id: string; role: string; family: string; file?: BrandFile | null };
export type BrandProduct = { id: string; name: string; price: string; image: BrandFile | null };
export type LogoSlot = 'primary' | 'mark' | 'dark';
export type Brand = {
  logos: Record<LogoSlot, BrandFile | null>;
  colors: BrandColor[];
  fonts: BrandFont[];
  products: BrandProduct[];
  photos: BrandFile[];
  voice: { tagline: string; tone: string; about: string };
};
export type FolderId = 'logo' | 'colors' | 'fonts' | 'products' | 'brand';

export const DEMO_BRAND_SPACE = 'demo';
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const pawSvg = (fill: string, bg?: string) => {
  const paw = `<g fill="${fill}"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="5.6" cy="10" r="2.1"/><circle cx="9.5" cy="6.6" r="2.1"/><circle cx="14.5" cy="6.6" r="2.1"/><circle cx="18.4" cy="10" r="2.1"/></g>`;
  const svg = bg
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${bg}"/><g transform="translate(4.2 4) scale(.65)">${paw}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><g transform="translate(0 4) scale(1)">${paw}</g><text x="28" y="22" font-family="Georgia, serif" font-size="19" font-weight="700" fill="${fill}">Pawsome</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
const pic = (key: keyof typeof PHOTOS, name: string): BrandFile => ({ id: key, name, src: photo(PHOTOS[key], 480) });

const DEMO: Brand = {
  logos: {
    primary: { id: 'logo', name: 'pawsome-logo.svg', src: pawSvg(STORE.color) },
    mark: { id: 'mark', name: 'pawsome-mark.svg', src: pawSvg('#fff', STORE.color) },
    dark: { id: 'dark', name: 'pawsome-logo-white.svg', src: pawSvg('#fff') },
  },
  colors: [
    { id: 'c1', name: 'Terracotta', hex: STORE.color },
    { id: 'c2', name: 'Oat', hex: '#F4D7BF' },
    { id: 'c3', name: 'Cocoa', hex: '#2B1B13' },
    { id: 'c4', name: 'Sand', hex: '#8C7A68' },
    { id: 'c5', name: 'Cream', hex: '#FFF8F1' },
  ],
  fonts: [
    { id: 'f1', role: 'Headings', family: 'Georgia' },
    { id: 'f2', role: 'Body', family: 'Inter' },
  ],
  products: [
    { id: 'p1', name: 'Kitten Starter Pack', price: '$49.00', image: pic('starter', 'kitten-starter-pack.jpg') },
    { id: 'p2', name: 'Grain-free Kitten Pâté', price: '$24.00', image: pic('pate', 'kitten-pate.jpg') },
    { id: 'p3', name: 'Salmon Kibble 4 kg', price: '$42.00', image: pic('kibble', 'salmon-kibble.jpg') },
    { id: 'p4', name: 'Tall Tower', price: '$129.00', image: pic('tower', 'tall-tower.jpg') },
    { id: 'p5', name: 'Cozy Nook', price: '$89.00', image: pic('nook', 'cozy-nook.jpg') },
    { id: 'p6', name: 'Sisal Scratching Post', price: '$34.00', image: pic('post', 'scratching-post.jpg') },
  ],
  photos: [pic('tower', 'hero-climbing.jpg'), pic('nook', 'window-nap.jpg'), pic('pate', 'dinner-time.jpg'), pic('post', 'scratch-time.jpg')],
  voice: {
    tagline: 'Good food and trees for curious cats',
    tone: 'Warm and a little playful. Short sentences. Never pushy.',
    about: 'Pawsome is a small Portland shop run by Marc and two very opinionated cats. We sell the food and furniture we trust at home.',
  },
};

export const emptyBrand = (): Brand => ({
  logos: { primary: null, mark: null, dark: null },
  colors: [],
  fonts: [{ id: 'f1', role: 'Headings', family: '' }, { id: 'f2', role: 'Body', family: '' }],
  products: [],
  photos: [],
  voice: { tagline: '', tone: '', about: '' },
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
    products: brand.products.map((p) => ({ ...p, image: url(p.image) })),
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
    logos: { primary: strip(brand.logos.primary), mark: strip(brand.logos.mark), dark: strip(brand.logos.dark) },
    fonts: brand.fonts.map((f) => ({ ...f, file: strip(f.file) })),
    products: brand.products.map((p) => ({ ...p, image: strip(p.image) })),
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

function ensure(id: string) {
  if (spaces.has(id) || loading.has(id)) return;
  loading.add(id);
  spaces.set(id, emptyBrand());
  void readSpace(id).catch(() => null).then((saved) => {
    loading.delete(id);
    if (saved) { spaces.set(id, withUrls({ ...emptyBrand(), ...saved })); emit(); }
  });
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
  if (id !== DEMO_BRAND_SPACE) void writeSpace(id, updated).catch(() => undefined);
}

export function fileFrom(file: File): BrandFile {
  return { id: newId(), name: file.name, src: URL.createObjectURL(file), blob: file, type: file.type };
}

/** How many things are in each folder, for its label. */
export function folderCount(b: Brand, folder: FolderId) {
  if (folder === 'logo') return Object.values(b.logos).filter(Boolean).length;
  if (folder === 'colors') return b.colors.length;
  if (folder === 'fonts') return b.fonts.filter((f) => f.family || f.file).length;
  if (folder === 'products') return b.products.length;
  return b.photos.length + (b.voice.tagline || b.voice.tone || b.voice.about ? 1 : 0);
}
