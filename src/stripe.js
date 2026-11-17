// Minimal Stripe client over fetch (no SDK): Checkout, Billing Portal, subscriptions, webhook signatures.
import { createHmac } from 'node:crypto';
import { config } from './config.js';
import { safeEqual } from './security.js';

export const stripeEnabled = () => Boolean(config.stripe.secretKey);

/** Flattens nested objects/arrays into Stripe's form encoding: a[b][0][c]=v */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

let fetchImpl = (...a) => fetch(...a);
export function setStripeFetch(fn) { fetchImpl = fn; } // tests

async function call(method, path, params) {
  const url = 'https://api.stripe.com/v1' + path + (method === 'GET' && params ? '?' + formEncode(params) : '');
  const r = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: method === 'GET' ? undefined : formEncode(params || {}).toString(),
  });
  const data = await r.json();
  if (!r.ok) { const e = new Error(data?.error?.message || `Stripe ${r.status}`); e.status = r.status; throw e; }
  return data;
}

export function priceFor(plan, interval) {
  const id = config.stripe.prices[plan]?.[interval];
  if (!id) throw new Error(`Prix Stripe manquant pour ${plan}/${interval} (variable STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}).`);
  return id;
}

export function createCheckout({ tenant, email, plan, interval }) {
  return call('POST', '/checkout/sessions', {
    mode: 'subscription',
    customer_email: email,
    client_reference_id: tenant.id,
    line_items: [{ price: priceFor(plan, interval), quantity: 1 }],
    subscription_data: { trial_period_days: config.stripe.trialDays || undefined, metadata: { tenant_id: tenant.id, plan } },
    metadata: { tenant_id: tenant.id, plan, interval },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    locale: 'fr',
    success_url: `${config.baseUrl}/inscription/terminee?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/inscription/annulee?t=${encodeURIComponent(tenant.slug)}`,
  });
}
export const getCheckout = (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`, { 'expand[]': 'subscription' });
export const getSubscription = (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}`);
export const createPortal = (customer, returnUrl) => call('POST', '/billing_portal/sessions', { customer, return_url: returnUrl, locale: 'fr' });

/** Verifies the Stripe-Signature header (v1 scheme, 5-minute tolerance). Returns the parsed event or throws. */
export function verifyWebhook(rawBody, header, secret = config.stripe.webhookSecret, now = Date.now()) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET absent');
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || '').split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new Error('Signature absente');
  if (Math.abs(now / 1000 - t) > 300) throw new Error('Signature expirée');
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  if (!sigs.some((s) => safeEqual(s, expected))) throw new Error('Signature invalide');
  return JSON.parse(rawBody);
}

/** Maps a Stripe subscription status to ours. */
export function mapStatus(s) {
  return { trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled',
    incomplete: 'pending', incomplete_expired: 'canceled', paused: 'canceled' }[s] || 'pending';
}
export function planFromPrice(priceId) {
  for (const [plan, p] of Object.entries(config.stripe.prices)) for (const [interval, id] of Object.entries(p)) if (id && id === priceId) return { plan, interval };
  return null;
}
