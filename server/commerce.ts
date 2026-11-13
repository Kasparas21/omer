const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase().slice(0, 254);
  return emailOk.test(email) ? email : null;
}

export function cleanName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, 80);
  return name || null;
}

export function cleanOrderId(value: unknown) {
  if (typeof value !== 'string') return null;
  const id = value.trim().slice(0, 120);
  return id || null;
}

export function cleanCampaign(value: unknown) {
  if (typeof value !== 'string') return null;
  const campaign = value.trim().slice(0, 120);
  return campaign || null;
}

export function cleanCurrency(value: unknown) {
  if (typeof value !== 'string') return 'usd';
  const currency = value.trim().toLowerCase().slice(0, 8);
  return /^[a-z]{3}$/.test(currency) ? currency : 'usd';
}

/** Accept dollars (number) and store as integer cents. */
export function amountCents(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100);
}

export function cleanProducts(value: unknown) {
  if (!Array.isArray(value)) return null;
  const products = value.slice(0, 20).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 120) : 'Product';
    const price = Number.isFinite(Number(row.price)) ? Number(row.price) : undefined;
    const qty = Number.isFinite(Number(row.qty)) ? Math.max(1, Math.round(Number(row.qty))) : 1;
    return { name, price, qty };
  });
  return products.length ? products : null;
}
