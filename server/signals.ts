/* What the tracker sees beyond page views, cleaned and stored for campaign steps:
   - cart: what's in their cart (total, items, discount codes and whether each one worked)
   - code: a discount code they typed and whether the store took it
   - product: a product page they viewed, with its price and whether it was in stock
   A product view also updates that product's current price and stock, noting when the price
   dropped or it came back, so "price dropped" and "back in stock" steps can fire. */
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { projectProducts, projectSignals, projects } from './schema';

type Tx = Pick<NodePgDatabase, 'insert' | 'select' | 'update'>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cents = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n) : null;
};
const cleanCode = (v: unknown) => str(v, 40).toUpperCase().replace(/[^A-Z0-9_\-%.]/g, '');
const cleanCurrency = (v: unknown) => (/^[a-z]{3}$/i.test(str(v, 3)) ? str(v, 3).toLowerCase() : 'usd');
const cleanUrlPath = (v: unknown) => {
  const s = str(v, 300);
  if (!s) return null;
  try { return new URL(s, 'https://x.invalid').pathname.slice(0, 300); } catch { return null; }
};

export type CartItem = { name: string; cents: number | null; qty: number; path: string | null };
export type CartSignal = { total: number; currency: string; count: number; items: CartItem[]; codes: { code: string; ok: boolean }[] };
export type CodeSignal = { code: string; ok: boolean; reason?: string };
export type ProductSignal = { name: string; cents: number | null; currency: string; available: boolean | null; image?: string };

function cleanCart(body: Record<string, unknown>): CartSignal | null {
  const total = cents(body.total);
  if (total == null) return null;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10).map((raw) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { name: str(it.name, 80) || 'Product', cents: cents(it.cents), qty: Math.max(1, Math.min(999, Math.round(Number(it.qty) || 1))), path: cleanUrlPath(it.path) };
  });
  const codes = (Array.isArray(body.codes) ? body.codes : []).slice(0, 5).map((raw) => {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { code: cleanCode(c.code), ok: c.ok === true };
  }).filter((c) => c.code);
  const count = Math.max(0, Math.min(9999, Math.round(Number(body.count) || items.reduce((n, i) => n + i.qty, 0))));
  return { total, currency: cleanCurrency(body.currency), count, items, codes };
}

function cleanProduct(body: Record<string, unknown>): ProductSignal | null {
  const name = str(body.name, 120);
  if (!name) return null;
  const image = str(body.image, 400);
  return {
    name,
    cents: cents(body.cents),
    currency: cleanCurrency(body.currency),
    available: typeof body.available === 'boolean' ? body.available : null,
    ...(image && /^https?:\/\//.test(image) ? { image } : {}),
  };
}

/** Keep a product's price and stock current; note the moment it drops in price, sells out or comes back. */
export async function noteProduct(tx: Tx, projectId: string, path: string, p: ProductSignal) {
  const [prev] = await tx.select().from(projectProducts)
    .where(and(eq(projectProducts.projectId, projectId), eq(projectProducts.path, path))).limit(1);
  const now = new Date();
  if (!prev) {
    await tx.insert(projectProducts).values({
      projectId, path, name: p.name, priceCents: p.cents, currency: p.currency, available: p.available, image: p.image ?? null,
      soldOutAt: p.available === false ? now : null, checkedAt: now, seenAt: now,
    }).onConflictDoNothing();
    return;
  }
  const patch: Partial<typeof projectProducts.$inferInsert> = { name: p.name, checkedAt: now, seenAt: now };
  if (p.image) patch.image = p.image;
  if (p.cents != null && prev.priceCents != null && p.cents !== prev.priceCents) {
    patch.prevPriceCents = prev.priceCents;
    patch.priceChangedAt = now;
  }
  if (p.cents != null) { patch.priceCents = p.cents; if (p.currency) patch.currency = p.currency; }
  if (p.available != null && p.available !== prev.available) {
    if (p.available && prev.available === false) patch.restockedAt = now;
    if (!p.available) patch.soldOutAt = now;
    patch.available = p.available;
  }
  await tx.update(projectProducts).set(patch)
    .where(and(eq(projectProducts.projectId, projectId), eq(projectProducts.path, path)));
}

/** Store one tracker signal. Returns false when it doesn't hold anything usable. */
export async function recordSignal(tx: Tx, projectId: string, visitorId: string, kind: 'cart' | 'code' | 'product', body: Record<string, unknown>, path: string) {
  if (kind === 'cart') {
    const cart = cleanCart(body);
    if (!cart) return false;
    await tx.insert(projectSignals).values({ projectId, visitorId, kind, path, data: cart });
    return true;
  }
  if (kind === 'code') {
    const code = cleanCode(body.code);
    if (!code) return false;
    const reason = str(body.reason, 120);
    const data: CodeSignal = { code, ok: body.ok === true, ...(reason ? { reason } : {}) };
    // The same code with the same result in the last 10 minutes is one try, not several.
    const [dupe] = await tx.select({ id: projectSignals.id }).from(projectSignals).where(and(
      eq(projectSignals.projectId, projectId), eq(projectSignals.visitorId, visitorId), eq(projectSignals.kind, 'code'),
      sql`${projectSignals.data}->>'code' = ${code}`, sql`(${projectSignals.data}->>'ok')::boolean = ${data.ok}`,
      sql`${projectSignals.seenAt} > now() - interval '10 minutes'`,
    )).limit(1);
    if (dupe) return true;
    await tx.insert(projectSignals).values({ projectId, visitorId, kind, path, data });
    return true;
  }
  const product = cleanProduct(body);
  if (!product) return false;
  const productPath = cleanUrlPath(body.url) ?? path;
  await tx.insert(projectSignals).values({ projectId, visitorId, kind, path: productPath, data: product });
  await noteProduct(tx, projectId, productPath, product);
  return true;
}

const PRODUCT_CHECK_MS = 30 * 60 * 1000;
/** Shopify stores: re-read products people viewed lately (price, stock) so drops and restocks show up
   even when nobody visits the page. Other stores update from visitors' own page views. */
export async function checkProducts(db: NodePgDatabase) {
  const due = await db.select({ projectId: projectProducts.projectId, path: projectProducts.path, origin: projects.origin })
    .from(projectProducts).innerJoin(projects, eq(projects.id, projectProducts.projectId))
    .where(and(
      sql`${projectProducts.checkedAt} < now() - interval '30 minutes'`,
      sql`${projectProducts.seenAt} > now() - interval '30 days'`,
      sql`${projectProducts.path} like '%/products/%'`,
    ))
    .orderBy(projectProducts.checkedAt).limit(60);
  let checked = 0;
  for (const row of due) {
    const url = new URL(`${row.path.replace(/\/$/, '')}.js`, row.origin).toString();
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      const p = await res.json() as { title?: string; price?: number; available?: boolean; featured_image?: string };
      if (!p.title) throw new Error('not a product');
      await noteProduct(db, row.projectId, row.path, {
        name: str(p.title, 120), cents: cents(p.price), currency: '', available: typeof p.available === 'boolean' ? p.available : null,
        ...(p.featured_image ? { image: p.featured_image.startsWith('//') ? `https:${p.featured_image}` : p.featured_image } : {}),
      });
      checked += 1;
    } catch {
      // Not a Shopify product URL (or the store is down): check again later, don't hammer it.
      await db.update(projectProducts).set({ checkedAt: new Date(Date.now() + PRODUCT_CHECK_MS * 4) })
        .where(and(eq(projectProducts.projectId, row.projectId), eq(projectProducts.path, row.path)));
    }
  }
  return { checked };
}
