// Passwords, company codes, tokens, rate limits. node:crypto only.
import { scryptSync, randomBytes, timingSafeEqual, createHash, createHmac, randomInt } from 'node:crypto';
import { config } from './config.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashSecret(secret) {
  const salt = randomBytes(16);
  const key = scryptSync(String(secret).normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifySecret(secret, stored) {
  if (!stored || typeof stored !== 'string') { dummyVerify(); return false; }
  const [alg, N, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = scryptSync(String(secret).normalize('NFKC'), Buffer.from(saltB64, 'base64'), key.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(key, test);
}
const DUMMY = hashSecret('dummy-password-for-timing');
/** Spends the same time as a real check, so unknown e-mails are not detectable by timing. */
export function dummyVerify() { verifySecret('x', DUMMY); }

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const hmac = (s) => createHmac('sha256', config.secret).update(String(s)).digest('hex');
export const newId = () => randomBytes(12).toString('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Company code ("cryptogramme"): 8 characters from an unambiguous alphabet, shown as XXXX-XXXX. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCompanyCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function passwordProblem(pw, email = '') {
  const s = String(pw || '');
  if (s.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (s.length > 200) return 'Le mot de passe est trop long.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Le mot de passe doit contenir des lettres et des chiffres.';
  if (email && s.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) return 'Le mot de passe ne doit pas contenir votre adresse e-mail.';
  if (/^(.)\1+$/.test(s) || /^(0123456789|1234567890|azertyuiop|qwertyuiop|motdepasse|password)/i.test(s)) return 'Ce mot de passe est trop facile à deviner.';
  return null;
}

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(String(e || '')) && String(e).length <= 254;

const RESERVED = new Set(['www', 'api', 'app', 'admin', 'platform', 'plateforme', 'login', 'logout', 'signup', 'inscription', 'tarifs', 'pricing',
  'static', 'assets', 'public', 'stripe', 'webhook', 'webhooks', 'support', 'aide', 'help', 'docs', 'blog', 'legal', 'cgu', 'cgv',
  'confidentialite', 'privacy', 'mentions-legales', 'contact', 'status', 'health', 'favicon.ico', 'robots.txt', 'gombo', 'jumtoo', 'mail', 'account', 'compte']);
export function slugify(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, '-et-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}
export function slugProblem(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return 'L’adresse doit faire 3 à 40 caractères : lettres minuscules, chiffres et tirets.';
  if (slug.includes('--')) return 'L’adresse ne peut pas contenir deux tirets de suite.';
  if (RESERVED.has(slug)) return 'Cette adresse est réservée.';
  return null;
}

/** Fixed-window limiter kept in memory (one process). */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n += 1;
  if (buckets.size > 50000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  return { ok: b.n <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
export function resetRateLimits() { buckets.clear(); }
