// Configuration read from the environment (see .env.example). No secret has a default.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Optional .env file next to package.json (simple KEY=VALUE lines).
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d = '') => (process.env[k] ?? d).trim();
const isDev = env('JUMTOO_ENV', env('GOMBO_ENV', 'production')) !== 'production';

export const config = {
  root: ROOT,
  dev: isDev,
  port: Number(env('PORT', '3000')),
  baseUrl: env('BASE_URL', isDev ? 'http://localhost:3000' : 'https://www.jumtoo.com').replace(/\/$/, ''),
  dataDir: env('DATA_DIR', join(ROOT, 'data')),
  brand: env('BRAND_NAME', 'Jumtoo'),
  supportEmail: env('SUPPORT_EMAIL', 'support@jumtoo.com'),
  // Signs session ids and one-time links. Mandatory in production.
  secret: env('APP_SECRET', isDev ? 'dev-secret-change-me-dev-secret-change-me' : ''),
  trustProxy: env('TRUST_PROXY', '1') === '1',
  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    trialDays: Number(env('TRIAL_DAYS', '14')),
    prices: {
      essentiel: { month: env('STRIPE_PRICE_ESSENTIEL_MONTH'), year: env('STRIPE_PRICE_ESSENTIEL_YEAR') },
      pro: { month: env('STRIPE_PRICE_PRO_MONTH'), year: env('STRIPE_PRICE_PRO_YEAR') },
      entreprise: { month: env('STRIPE_PRICE_ENTREPRISE_MONTH'), year: env('STRIPE_PRICE_ENTREPRISE_YEAR') },
    },
  },
  mail: {
    provider: env('MAIL_PROVIDER', 'log'), // log | resend | brevo
    apiKey: env('MAIL_API_KEY'),
    from: env('MAIL_FROM', 'Jumtoo <no-reply@jumtoo.com>'),
  },
  ai: {
    anthropicKey: env('ANTHROPIC_API_KEY'),
    model: env('AI_MODEL', 'claude-sonnet-5-5'),
    quickModel: env('AI_QUICK_MODEL', 'claude-haiku-5-5'),
    dailyLimitPerTenant: Number(env('AI_DAILY_LIMIT', '200')),
  },
};

/** Plans shown on the pricing page. Amounts are display values: Stripe prices are the source of truth. */
export const PLANS = {
  essentiel: { name: 'Essentiel', seats: 3, month: 15000, year: 150000, currency: 'XOF',
    features: ['3 utilisateurs', 'Clients, factures, achats', 'Stock et marges', 'Comptabilité et TVA', 'Import / export Excel, PDF, Word'] },
  pro: { name: 'Pro', seats: 10, month: 35000, year: 350000, currency: 'XOF', highlight: true,
    features: ['10 utilisateurs', 'Tout Essentiel', 'Prévisions de trésorerie', 'Copilote et agents IA', 'Support prioritaire'] },
  entreprise: { name: 'Entreprise', seats: 50, month: 75000, year: 750000, currency: 'XOF',
    features: ['50 utilisateurs', 'Tout Pro', 'Plusieurs administrateurs', 'Accompagnement à la mise en route', 'Sauvegardes exportables'] },
};

export function assertProductionConfig() {
  if (config.dev) return;
  const missing = [];
  if (!config.secret || config.secret.length < 32) missing.push('APP_SECRET (32 caractères minimum)');
  if (!config.baseUrl.startsWith('https://')) missing.push('BASE_URL en https://');
  if (missing.length) {
    console.error('Configuration incomplète : ' + missing.join(', '));
    process.exit(1);
  }
  if (!config.stripe.secretKey) console.warn(process.env.ALLOW_FREE_SIGNUP === '1' ? '[jumtoo] STRIPE_SECRET_KEY absent et ALLOW_FREE_SIGNUP=1 : inscriptions SANS paiement.' : '[jumtoo] STRIPE_SECRET_KEY absent : les inscriptions sont fermées.');
  if (config.mail.provider === 'log') console.warn('[jumtoo] MAIL_PROVIDER=log : les e-mails sont seulement écrits dans les journaux.');
}
