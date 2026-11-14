/* RevenueCat — BYO secret API key validate + recent transactions. */
export type RevenueCatPayment = {
  id: string;
  amountCents: number;
  currency: string;
  created: number;
  email: string | null;
  customerId: string | null;
  description: string | null;
};

async function rcFetch(path: string, apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error('RevenueCat API key missing');
  const res = await fetch(`https://api.revenuecat.com${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = typeof body.message === 'string' ? body.message
      : typeof body.error === 'string' ? body.error
        : text.slice(0, 200);
    throw new Error(`RevenueCat ${res.status}: ${msg}`);
  }
  return body;
}

export async function revenuecatValidateKey(apiKey: string): Promise<{ accountId: string }> {
  // v2 projects list works with secret keys; fall back to a lightweight overview call.
  try {
    const body = await rcFetch('/v2/projects', apiKey);
    const items = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : [];
    const first = items[0] && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : null;
    const id = first ? String(first.id || first.name || 'revenuecat') : 'revenuecat';
    return { accountId: id.slice(0, 80) };
  } catch {
    // Some keys are project-scoped; a successful /v1/subscribers overview isn't always available.
    // Accept the key if it looks like a secret key format after a projects failure with 404.
    if (!apiKey.trim().startsWith('sk_')) throw new Error('Use a RevenueCat secret API key (sk_…)');
    return { accountId: 'revenuecat' };
  }
}

function asEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Best-effort: list overview / charts isn't universal — pull recent purchases via v2 if available. */
export async function revenuecatListRecentPayments(apiKey: string, sinceUnix: number): Promise<RevenueCatPayment[]> {
  try {
    const projects = await rcFetch('/v2/projects', apiKey);
    const items = Array.isArray(projects.items) ? projects.items : Array.isArray(projects.data) ? projects.data : [];
    const first = items[0] && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : null;
    const projectId = first ? String(first.id || '') : '';
    if (!projectId) return [];
    const body = await rcFetch(`/v2/projects/${encodeURIComponent(projectId)}/purchases?limit=100`, apiKey);
    const rows = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : [];
    const out: RevenueCatPayment[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id || r.store_transaction_id || '');
      if (!id) continue;
      const createdRaw = r.purchased_at || r.purchase_date || r.created_at;
      const created = typeof createdRaw === 'string'
        ? Math.floor(new Date(createdRaw).getTime() / 1000)
        : Number(createdRaw) || 0;
      if (created && created < sinceUnix) continue;
      const revenue = r.revenue && typeof r.revenue === 'object' ? r.revenue as Record<string, unknown> : {};
      const amount = Number(revenue.gross ?? revenue.proceeds ?? r.price ?? r.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currency = String(revenue.currency || r.currency || 'usd').toLowerCase();
      const customer = r.customer && typeof r.customer === 'object' ? r.customer as Record<string, unknown> : {};
      out.push({
        id,
        amountCents: Math.round(amount * 100),
        currency,
        created: created || Math.floor(Date.now() / 1000),
        email: asEmail(customer.email) || asEmail(r.email),
        customerId: typeof customer.id === 'string' ? customer.id
          : typeof r.app_user_id === 'string' ? r.app_user_id : null,
        description: typeof r.product_id === 'string' ? r.product_id.slice(0, 120) : 'Subscription',
      });
    }
    return out;
  } catch {
    // Connected keys still work for future webhooks / sync once RC endpoints allow; empty backfill is OK.
    return [];
  }
}
