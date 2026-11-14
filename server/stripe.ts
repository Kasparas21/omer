/* Stripe REST helpers for revenue integrations (no SDK). */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type StripePayment = {
  id: string;
  amountCents: number;
  currency: string;
  created: number;
  customerId: string | null;
  email: string | null;
  metadataVid: string | null;
  description: string | null;
  products: { name: string; price?: number; qty?: number }[] | null;
};

async function stripeFetch(path: string, apiKey: string, init?: RequestInit) {
  const key = apiKey.trim();
  if (!key) throw new Error('Stripe API key missing');
  const res = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = body.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : {};
    const msg = typeof err.message === 'string' ? err.message : text.slice(0, 300);
    throw new Error(`Stripe ${res.status}: ${msg}`);
  }
  return body;
}

export async function stripeValidateKey(apiKey: string): Promise<{ accountId: string }> {
  const account = await stripeFetch('/v1/account', apiKey);
  const id = String(account.id || '');
  if (!id) throw new Error('Stripe key did not return an account');
  return { accountId: id };
}

function metaVid(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  for (const key of ['omer_vid', 'unfairweekend_vid', 'vid']) {
    const v = m[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return null;
}

function asEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function chargeToPayment(row: Record<string, unknown>): StripePayment | null {
  const id = String(row.id || '');
  if (!id) return null;
  const status = String(row.status || '').toLowerCase();
  if (status && status !== 'succeeded') return null;
  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const billing = row.billing_details && typeof row.billing_details === 'object'
    ? row.billing_details as Record<string, unknown>
    : {};
  const customer = typeof row.customer === 'string' ? row.customer
    : row.customer && typeof row.customer === 'object'
      ? String((row.customer as Record<string, unknown>).id || '')
      : '';
  return {
    id,
    amountCents: Math.round(amount),
    currency: String(row.currency || 'usd').toLowerCase(),
    created: Number(row.created) || Math.floor(Date.now() / 1000),
    customerId: customer || null,
    email: asEmail(billing.email) || asEmail(row.receipt_email),
    metadataVid: metaVid(row.metadata),
    description: typeof row.description === 'string' ? row.description.slice(0, 120) : null,
    products: typeof row.description === 'string' && row.description.trim()
      ? [{ name: row.description.trim().slice(0, 120), price: amount / 100, qty: 1 }]
      : null,
  };
}

function intentToPayment(row: Record<string, unknown>): StripePayment | null {
  const id = String(row.id || '');
  if (!id) return null;
  if (String(row.status || '') !== 'succeeded') return null;
  const amount = Number(row.amount_received ?? row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const charges = row.charges && typeof row.charges === 'object'
    ? row.charges as Record<string, unknown>
    : {};
  const data = Array.isArray(charges.data) ? charges.data : [];
  const first = data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : null;
  const billing = first?.billing_details && typeof first.billing_details === 'object'
    ? first.billing_details as Record<string, unknown>
    : {};
  const customer = typeof row.customer === 'string' ? row.customer : '';
  return {
    id,
    amountCents: Math.round(amount),
    currency: String(row.currency || 'usd').toLowerCase(),
    created: Number(row.created) || Math.floor(Date.now() / 1000),
    customerId: customer || null,
    email: asEmail(row.receipt_email) || asEmail(billing.email),
    metadataVid: metaVid(row.metadata),
    description: typeof row.description === 'string' ? row.description.slice(0, 120) : null,
    products: typeof row.description === 'string' && row.description.trim()
      ? [{ name: row.description.trim().slice(0, 120), price: amount / 100, qty: 1 }]
      : null,
  };
}

export async function stripeListRecentPayments(apiKey: string, sinceUnix: number): Promise<StripePayment[]> {
  const params = new URLSearchParams({
    limit: '100',
    'created[gte]': String(Math.max(0, Math.floor(sinceUnix))),
  });
  const body = await stripeFetch(`/v1/payment_intents?${params}`, apiKey);
  const rows = Array.isArray(body.data) ? body.data : [];
  const out: StripePayment[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const payment = intentToPayment(row as Record<string, unknown>);
    if (payment) out.push(payment);
  }
  // Fallback / supplement with charges (covers some older flows).
  if (out.length < 5) {
    const charges = await stripeFetch(`/v1/charges?${params}`, apiKey);
    const chargeRows = Array.isArray(charges.data) ? charges.data : [];
    for (const row of chargeRows) {
      if (!row || typeof row !== 'object') continue;
      const payment = chargeToPayment(row as Record<string, unknown>);
      if (!payment) continue;
      if (out.some((p) => p.id === payment.id)) continue;
      // Prefer PI id when charge has payment_intent
      const pi = typeof (row as Record<string, unknown>).payment_intent === 'string'
        ? String((row as Record<string, unknown>).payment_intent)
        : '';
      if (pi && out.some((p) => p.id === pi)) continue;
      out.push(pi ? { ...payment, id: pi } : payment);
    }
  }
  return out;
}

export async function stripeGetCustomerEmail(apiKey: string, customerId: string): Promise<string | null> {
  if (!customerId) return null;
  try {
    const customer = await stripeFetch(`/v1/customers/${encodeURIComponent(customerId)}`, apiKey);
    return asEmail(customer.email);
  } catch {
    return null;
  }
}

export function paymentFromStripeEvent(event: Record<string, unknown>): StripePayment | null {
  const type = String(event.type || '');
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {};
  const obj = data.object && typeof data.object === 'object' ? data.object as Record<string, unknown> : null;
  if (!obj) return null;
  if (type === 'payment_intent.succeeded') return intentToPayment(obj);
  if (type === 'charge.succeeded') return chargeToPayment(obj);
  if (type === 'invoice.paid') {
    const id = String(obj.payment_intent || obj.id || '');
    const amount = Number(obj.amount_paid);
    if (!id || !Number.isFinite(amount) || amount <= 0) return null;
    const customer = typeof obj.customer === 'string' ? obj.customer : '';
    const customerEmail = obj.customer_email;
    return {
      id: typeof obj.payment_intent === 'string' ? String(obj.payment_intent) : `inv_${id}`,
      amountCents: Math.round(amount),
      currency: String(obj.currency || 'usd').toLowerCase(),
      created: Number(obj.created) || Math.floor(Date.now() / 1000),
      customerId: customer || null,
      email: asEmail(customerEmail),
      metadataVid: metaVid(obj.metadata),
      description: typeof obj.description === 'string' ? obj.description.slice(0, 120) : 'Subscription',
      products: [{ name: 'Subscription', price: amount / 100, qty: 1 }],
    };
  }
  return null;
}

/** Verify Stripe-Signature header (t=…,v1=…). */
export function stripeVerifyWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=').trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(Number(t)) || age > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
