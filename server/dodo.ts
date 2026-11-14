/* Dodo Payments — BYO API key validate + recent payments. */
export type DodoPayment = {
  id: string;
  amountCents: number;
  currency: string;
  created: number;
  email: string | null;
  customerId: string | null;
  description: string | null;
};

async function dodoFetch(path: string, apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error('Dodo API key missing');
  const res = await fetch(`https://live.dodopayments.com${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    // Retry against test host if live rejects auth (common for test keys).
    if (res.status === 401 || res.status === 403) {
      const test = await fetch(`https://test.dodopayments.com${path}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      const testText = await test.text();
      let testBody: Record<string, unknown> = {};
      try { testBody = testText ? JSON.parse(testText) as Record<string, unknown> : {}; } catch { testBody = { raw: testText }; }
      if (!test.ok) {
        const msg = typeof testBody.message === 'string' ? testBody.message : testText.slice(0, 200);
        throw new Error(`Dodo ${test.status}: ${msg}`);
      }
      return { body: testBody, host: 'test' as const };
    }
    const msg = typeof body.message === 'string' ? body.message : text.slice(0, 200);
    throw new Error(`Dodo ${res.status}: ${msg}`);
  }
  return { body, host: 'live' as const };
}

export async function dodoValidateKey(apiKey: string): Promise<{ accountId: string }> {
  const { body, host } = await dodoFetch('/payments?page_size=1', apiKey);
  // A successful list proves the key; use host as account tag.
  void body;
  return { accountId: `dodo:${host}` };
}

function asEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function dodoListRecentPayments(apiKey: string, sinceUnix: number): Promise<DodoPayment[]> {
  const { body } = await dodoFetch('/payments?page_size=100', apiKey);
  const items = Array.isArray(body.items) ? body.items
    : Array.isArray(body.data) ? body.data
      : Array.isArray(body) ? body : [];
  const out: DodoPayment[] = [];
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.payment_id || r.id || '');
    if (!id) continue;
    const status = String(r.status || '').toLowerCase();
    if (status && !['succeeded', 'paid', 'completed', 'success'].includes(status)) continue;
    const amount = Number(r.total_amount ?? r.amount ?? r.settlement_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const createdRaw = r.created_at || r.createdAt || r.created;
    const created = typeof createdRaw === 'string'
      ? Math.floor(new Date(createdRaw).getTime() / 1000)
      : Number(createdRaw) || Math.floor(Date.now() / 1000);
    if (created < sinceUnix) continue;
    const customer = r.customer && typeof r.customer === 'object' ? r.customer as Record<string, unknown> : {};
    out.push({
      id,
      // Dodo amounts are already in the smallest currency unit.
      amountCents: Math.round(amount),
      currency: String(r.currency || 'usd').toLowerCase(),
      created,
      email: asEmail(customer.email) || asEmail(r.email) || asEmail(r.customer_email),
      customerId: typeof customer.customer_id === 'string' ? customer.customer_id
        : typeof r.customer_id === 'string' ? r.customer_id : null,
      description: typeof r.product_cart === 'object' ? 'Dodo payment' : (typeof r.description === 'string' ? r.description.slice(0, 120) : 'Dodo payment'),
    });
  }
  return out;
}
