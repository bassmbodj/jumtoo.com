// Jumtoo HTTP server: public site, sign-up with Stripe, per-company spaces at /<slug>,
// login (e-mail + password + company code), company admin, platform console, JSON API for the app.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, PLANS, assertProductionConfig } from './config.js';
import { openDb, one, all, run, tx, nowIso, auditLog } from './db.js';
import * as sec from './security.js';
import * as stripe from './stripe.js';
import { sendMail } from './mail.js';
import * as P from './pages.js';
import { aiProxy } from './ai.js';
import { DOCS, searchDocs } from './docs.js';

// Countries the app has a chart of accounts and VAT rates for (see COUNTRIES in app/index.html).
const COUNTRIES = [['SN', 'Sénégal'], ['CI', 'Côte d’Ivoire'], ['CM', 'Cameroun'], ['FR', 'France']];
const COUNTRY_SET = new Set(COUNTRIES.map(([k]) => k));
const RECORD_TYPES = new Set(['customer', 'supplier', 'product', 'invoice', 'bill', 'entry']);
const NUMBERED = new Set(['invoice', 'bill', 'entry']);
const SESSION_IDLE_MS = 8 * 3600e3, SESSION_MAX_MS = 7 * 24 * 3600e3;
const LOCK_AFTER = 5, LOCK_MS = 15 * 60e3, GRACE_DAYS = 7;

/* ------------------------------------------------------------ helpers --- */
class HttpError extends Error { constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; } }

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function cookie(name, value, { path = '/', maxAge, httpOnly = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=Lax`;
  if (httpOnly) c += '; HttpOnly';
  if (!config.dev) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  return c;
}
async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Requête trop volumineuse.'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
function clientIp(req) {
  if (config.trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket.remoteAddress || '';
}
const addMs = (ms) => new Date(Date.now() + ms).toISOString();

function baseHeaders(res, kind = 'page', nonce = '') {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!config.dev) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  if (kind === 'page') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; base-uri 'none'");
  if (kind === 'app') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
function sendHtml(res, { status = 200, html }, extra = {}) {
  baseHeaders(res, extra.kind || 'page');
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(extra.headers || {}) });
  res.end(html);
}
function sendJson(res, status, data, headers = {}) {
  baseHeaders(res, 'api');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function redirect(res, location, headers = {}) { baseHeaders(res, 'api'); res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers }); res.end(); }

/** Pre-session token for unauthenticated forms (double-submit cookie). */
function preToken(req, res) {
  let t = req.cookies.gombo_pre;
  if (!t || t.length < 20) { t = sec.randomToken(18); res.setHeader('Set-Cookie', [...([].concat(res.getHeader('Set-Cookie') || [])), cookie('gombo_pre', t, { maxAge: 3600 * 6 })]); }
  return t;
}
function checkPre(req, form) {
  if (!req.cookies.gombo_pre || !form.pre || !sec.safeEqual(req.cookies.gombo_pre, form.pre)) throw new HttpError(403, 'Le formulaire a expiré. Rechargez la page et réessayez.');
}
function appendCookie(res, c) { res.setHeader('Set-Cookie', [...([].concat(res.getHeader('Set-Cookie') || [])), c]); }

/* ----------------------------------------------------- tenants & access --- */
const tenantBySlug = (slug) => one('SELECT * FROM tenants WHERE slug = ?', slug);
function access(t) {
  if (t.status === 'trialing' || t.status === 'active') return 'ok';
  if (t.status === 'past_due') {
    const since = t.past_due_since ? Date.parse(t.past_due_since) : Date.now();
    return Date.now() - since < GRACE_DAYS * 86400e3 ? 'grace' : 'readonly';
  }
  if (t.status === 'canceled') return 'readonly';
  return 'blocked'; // pending, suspended
}
const activeSeatCount = (tenantId) => one("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND status != 'disabled'", tenantId).n;

/* ------------------------------------------------------------ sessions --- */
function createSession(res, user, tenant, req) {
  const raw = sec.randomToken(32), csrf = sec.randomToken(18);
  run('INSERT INTO sessions (id_hash, user_id, tenant_id, csrf, created_at, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    sec.sha256(raw), user.id, tenant.id, csrf, nowIso(), addMs(SESSION_IDLE_MS), clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200));
  appendCookie(res, cookie('gombo_s', raw, { path: `/${tenant.slug}`, maxAge: SESSION_MAX_MS / 1000 }));
}
function loadSession(req, tenant) {
  const raw = req.cookies.gombo_s;
  if (!raw) return null;
  const s = one('SELECT * FROM sessions WHERE id_hash = ?', sec.sha256(raw));
  if (!s || s.tenant_id !== tenant.id) return null;
  if (s.expires_at < nowIso() || Date.now() - Date.parse(s.created_at) > SESSION_MAX_MS) { run('DELETE FROM sessions WHERE id_hash = ?', s.id_hash); return null; }
  const user = one('SELECT * FROM users WHERE id = ? AND tenant_id = ?', s.user_id, tenant.id);
  if (!user || user.status !== 'active') return null;
  if (Date.parse(s.expires_at) - Date.now() < SESSION_IDLE_MS - 10 * 60e3) run('UPDATE sessions SET expires_at = ? WHERE id_hash = ?', addMs(SESSION_IDLE_MS), s.id_hash);
  return { session: s, user };
}
function endSessions(userId) { run('DELETE FROM sessions WHERE user_id = ?', userId); }

/* --------------------------------------------------------------- tokens --- */
function issueToken(userId, purpose, ms) {
  const raw = sec.randomToken(32);
  run('INSERT INTO tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)', sec.sha256(raw), userId, purpose, addMs(ms));
  return raw;
}
function findToken(raw, purpose, tenantId) {
  if (!raw) return null;
  const t = one('SELECT * FROM tokens WHERE token_hash = ? AND purpose = ?', sec.sha256(raw), purpose);
  if (!t || t.used_at || t.expires_at < nowIso()) return null;
  const user = one('SELECT * FROM users WHERE id = ? AND tenant_id = ?', t.user_id, tenantId);
  return user ? { token: t, user } : null;
}

async function sendInvite(tenant, user, inviter) {
  const raw = issueToken(user.id, 'invite', 7 * 86400e3);
  return sendMail({ to: user.email, subject: `Invitation à rejoindre ${tenant.name} sur ${config.brand}`, text:
`Bonjour ${user.name},

${inviter} vous invite à rejoindre l’espace « ${tenant.name} » sur ${config.brand}.

Choisissez votre mot de passe avec ce lien (valable 7 jours) :
${config.baseUrl}/${tenant.slug}/invitation?token=${raw}

Pour vous connecter ensuite, il vous faudra :
- votre nom d’utilisateur : ${user.email}
- votre mot de passe
- le code entreprise, que ${inviter} vous communiquera séparément.

Adresse de l’espace : ${config.baseUrl}/${tenant.slug}` });
}
async function sendReset(tenant, user) {
  const raw = issueToken(user.id, 'reset', 3600e3);
  return sendMail({ to: user.email, subject: `Réinitialisation de votre mot de passe ${config.brand}`, text:
`Bonjour ${user.name},

Pour choisir un nouveau mot de passe pour l’espace « ${tenant.name} », ouvrez ce lien (valable 1 heure) :
${config.baseUrl}/${tenant.slug}/nouveau-mot-de-passe?token=${raw}

Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.` });
}

/* ---------------------------------------------------------- app (SPA) --- */
let APP_HTML = null;
function appHtml() {
  if (!APP_HTML || config.dev) APP_HTML = readFileSync(join(config.root, 'app', 'index.html'), 'utf8');
  return APP_HTML;
}
function renderApp(tenant, user, session) {
  const boot = { slug: tenant.slug, brand: config.brand, csrf: session.csrf, access: access(tenant), status: tenant.status, plan: tenant.plan,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    ai: Boolean(config.ai.anthropicKey) && tenant.plan !== 'essentiel' };
  const inject = `<script>window.GOMBO = ${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>`;
  return appHtml().replace('<head>', '<head>\n' + inject).replace(/<title>[^<]*<\/title>/, `<title>${P.esc(tenant.name)} · ${P.esc(config.brand)}</title>`);
}

/* ---------------------------------------------------------------- docs --- */
function mergeMeta(prev, next) {
  if (!prev) return next;
  const seq = { ...(prev.seq || {}) };
  for (const [k, v] of Object.entries(next.seq || {})) seq[k] = Math.max(Number(seq[k] || 0), Number(v || 0));
  const seen = new Set(); const auditList = [];
  for (const a of [...(next.audit || []), ...(prev.audit || [])]) { const k = a.at + '|' + a.action + '|' + (a.detail || ''); if (!seen.has(k)) { seen.add(k); auditList.push(a); } }
  auditList.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { ...prev, ...next, id: prev.id, seq, audit: auditList.slice(0, 200) };
}

/* ----------------------------------------------------------- handlers --- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/healthz$/, (req, res) => sendJson(res, 200, { ok: true }));
route('GET', /^\/$/, (req, res) => sendHtml(res, P.homePage({ interval: req.query.get('interval') })));
route('GET', /^\/robots\.txt$/, (req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('User-agent: *\nAllow: /$\nAllow: /aide\nDisallow: /\n'); });

/* sign-up */
route('GET', /^\/inscription$/, (req, res) => sendHtml(res, P.signupPage({ v: { plan: req.query.get('plan'), interval: req.query.get('interval') }, pre: preToken(req, res), countries: COUNTRIES })));
route('POST', /^\/inscription$/, async (req, res) => {
  const f = req.form;
  const again = (error) => sendHtml(res, { ...P.signupPage({ v: f, error, pre: preToken(req, res), countries: COUNTRIES }), status: 400 });
  checkPre(req, f);
  if (!sec.rateLimit('signup:' + clientIp(req), 10, 3600e3).ok) return again('Trop de tentatives depuis cette connexion. Réessayez dans une heure.');
  const plan = PLANS[f.plan] ? f.plan : null, interval = f.interval === 'year' ? 'year' : 'month';
  const company = String(f.company || '').trim(), slug = String(f.slug || '').trim().toLowerCase(), email = sec.normalizeEmail(f.email), name = String(f.name || '').trim();
  if (!plan) return again('Choisissez une formule.');
  if (company.length < 2 || company.length > 80) return again('Indiquez le nom de l’entreprise.');
  const sp = sec.slugProblem(slug); if (sp) return again(sp);
  if (!COUNTRY_SET.has(f.country)) return again('Choisissez un pays.');
  if (name.length < 2) return again('Indiquez votre nom.');
  if (!sec.validEmail(email)) return again('Adresse e-mail invalide.');
  const pp = sec.passwordProblem(f.password, email); if (pp) return again(pp);
  if (f.terms !== '1') return again('Vous devez accepter les conditions générales.');
  if (tenantBySlug(slug)) return again('Cette adresse est déjà prise : choisissez-en une autre.');
  const billing = stripe.stripeEnabled();
  // A paid service never opens free accounts by accident: without Stripe, production sign-ups need an explicit switch.
  if (!billing && !config.dev && process.env.ALLOW_FREE_SIGNUP !== '1') return again('Les inscriptions ouvriront bientôt. Écrivez-nous à ' + config.supportEmail + '.');
  const tenant = { id: sec.newId(), slug, name: company, country: f.country, plan, interval, status: billing ? 'pending' : 'trialing', seats: PLANS[plan].seats };
  const admin = { id: sec.newId(), email, name };
  try {
    tx(() => {
      run('INSERT INTO tenants (id, slug, name, country, plan, interval, status, seats, trial_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        tenant.id, slug, company, f.country, plan, interval, tenant.status, tenant.seats, billing ? null : addMs(config.stripe.trialDays * 86400e3), nowIso());
      run("INSERT INTO users (id, tenant_id, email, name, role, password_hash, status, created_at) VALUES (?, ?, ?, ?, 'admin', ?, 'active', ?)",
        admin.id, tenant.id, email, name, sec.hashSecret(f.password), nowIso());
    });
  } catch (e) { if (/UNIQUE/.test(e.message)) return again('Cette adresse est déjà prise : choisissez-en une autre.'); throw e; }
  auditLog({ tenantId: tenant.id, userId: admin.id, action: 'Entreprise créée', detail: `${company} (${plan}/${interval})`, ip: clientIp(req) });
  // Proves to /inscription/terminee that this browser created this company.
  appendCookie(res, cookie('gombo_signup', `${tenant.id}.${sec.hmac('signup:' + tenant.id)}`, { path: '/inscription', maxAge: 86400 }));
  if (billing) {
    const session = await stripe.createCheckout({ tenant, email, plan, interval });
    return redirect(res, session.url);
  }
  return redirect(res, `/inscription/terminee?t=${encodeURIComponent(tenant.id)}`);
});

function signupTenant(req) {
  const [id, sig] = String(req.cookies.gombo_signup || '').split('.');
  if (!id || !sig || !sec.safeEqual(sig, sec.hmac('signup:' + id))) return null;
  return one('SELECT * FROM tenants WHERE id = ?', id);
}
function syncFromSubscription(tenantId, sub) {
  const price = sub.items?.data?.[0]?.price?.id;
  const pi = price ? stripe.planFromPrice(price) : null;
  const status = stripe.mapStatus(sub.status);
  const cur = one('SELECT * FROM tenants WHERE id = ?', tenantId);
  if (!cur || cur.status === 'suspended') return;
  const pastDueSince = status === 'past_due' ? (cur.past_due_since || nowIso()) : null;
  run(`UPDATE tenants SET status = ?, stripe_subscription = ?, stripe_customer = COALESCE(?, stripe_customer), trial_end = ?, current_period_end = ?, past_due_since = ?,
       plan = COALESCE(?, plan), interval = COALESCE(?, interval), seats = COALESCE(?, seats) WHERE id = ?`,
    status, sub.id, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
    sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null, pastDueSince,
    pi?.plan || null, pi?.interval || null, pi ? PLANS[pi.plan].seats : null, tenantId);
  if (cur.status !== status) auditLog({ tenantId, actor: 'stripe', action: 'Abonnement', detail: `${cur.status} → ${status}` });
}
route('GET', /^\/inscription\/terminee$/, async (req, res) => {
  let tenant = signupTenant(req);
  if (!tenant) return sendHtml(res, P.messagePage('Lien expiré', 'Ouvrez l’adresse de votre espace pour vous connecter.', { href: '/', label: 'Accueil' }, 403));
  if (stripe.stripeEnabled()) {
    const sid = req.query.get('session_id');
    if (!sid) return sendHtml(res, P.messagePage('Paiement non confirmé', 'Aucune session de paiement.', { href: '/', label: 'Accueil' }, 400));
    const cs = await stripe.getCheckout(sid);
    if (cs.client_reference_id !== tenant.id) throw new HttpError(403, 'Cette session de paiement ne correspond pas à votre entreprise.');
    if (cs.status !== 'complete') return sendHtml(res, P.messagePage('Paiement non finalisé', 'Le paiement n’a pas abouti. Reprenez l’inscription depuis votre espace.', { href: `/${tenant.slug}/connexion`, label: 'Mon espace' }));
    run('UPDATE tenants SET stripe_customer = ? WHERE id = ?', cs.customer, tenant.id);
    if (cs.subscription) syncFromSubscription(tenant.id, typeof cs.subscription === 'string' ? await stripe.getSubscription(cs.subscription) : cs.subscription);
    tenant = one('SELECT * FROM tenants WHERE id = ?', tenant.id);
  }
  let code = '';
  if (!tenant.company_code_hash) {
    code = sec.newCompanyCode();
    run('UPDATE tenants SET company_code_hash = ? WHERE id = ? AND company_code_hash IS NULL', sec.hashSecret(sec.normalizeCode(code)), tenant.id);
    auditLog({ tenantId: tenant.id, action: 'Code entreprise créé', ip: clientIp(req) });
  }
  appendCookie(res, cookie('gombo_signup', '', { path: '/inscription', maxAge: 0 }));
  return sendHtml(res, P.signupDonePage({ tenant, code }));
});
route('GET', /^\/inscription\/annulee$/, (req, res) => sendHtml(res, P.messagePage('Paiement annulé', 'Votre espace est réservé mais pas encore actif. Connectez-vous en administrateur pour reprendre le paiement.', { href: `/${encodeURIComponent(req.query.get('t') || '')}/connexion`, label: 'Reprendre' })));

/* Stripe webhook (raw body, signature checked) */
route('POST', /^\/stripe\/webhook$/, async (req, res) => {
  let event;
  try { event = stripe.verifyWebhook(req.rawBody, req.headers['stripe-signature']); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }
  try { run('INSERT INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)', event.id, event.type, nowIso()); }
  catch { return sendJson(res, 200, { duplicate: true }); }
  const o = event.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    const t = o.client_reference_id && one('SELECT id FROM tenants WHERE id = ?', o.client_reference_id);
    if (t) {
      run('UPDATE tenants SET stripe_customer = ?, stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?', o.customer, o.subscription, t.id);
      if (o.subscription && stripe.stripeEnabled()) syncFromSubscription(t.id, await stripe.getSubscription(o.subscription));
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    const t = (o.metadata?.tenant_id && one('SELECT id FROM tenants WHERE id = ?', o.metadata.tenant_id)) || one('SELECT id FROM tenants WHERE stripe_subscription = ?', o.id);
    if (t) syncFromSubscription(t.id, event.type === 'customer.subscription.deleted' ? { ...o, status: 'canceled' } : o);
  }
  return sendJson(res, 200, { received: true });
});

/* platform console */
function platformSession(req) {
  const raw = req.cookies.gombo_p; if (!raw) return null;
  const s = one('SELECT * FROM platform_sessions WHERE id_hash = ?', sec.sha256(raw));
  if (!s || s.expires_at < nowIso()) return null;
  const admin = one('SELECT * FROM platform_admins WHERE id = ?', s.admin_id);
  return admin ? { s, admin } : null;
}
function platformTickets() {
  return all('SELECT s.*, t.name AS tenant, u.name AS user FROM support s JOIN tenants t ON t.id = s.tenant_id JOIN users u ON u.id = s.user_id').flatMap((row) => {
    const tickets = JSON.parse(row.tickets), replies = JSON.parse(row.replies);
    return tickets.map((tk) => {
      const rep = replies[tk.id] || {};
      const msgs = [...(tk.messages || []).map((m) => ({ ...m, from: 'user' })), ...(rep.messages || []).map((m) => ({ ...m, from: 'support' }))].sort((a, b) => a.at.localeCompare(b.at));
      let status = tk.status, at = tk.statusAt; if (rep.statusAt && rep.statusAt > at) status = rep.status;
      const last = msgs[msgs.length - 1];
      return { tenantId: row.tenant_id, userId: row.user_id, id: tk.id, tenant: row.tenant, user: row.user, subject: tk.subject, status, msgs, at: last?.at || tk.createdAt,
        open: last?.from === 'user' && ['open', 'in_progress'].includes(status) };
    });
  }).sort((a, b) => b.at.localeCompare(a.at));
}
route('GET', /^\/plateforme$/, (req, res) => {
  const p = platformSession(req);
  if (!p) return sendHtml(res, P.platformLoginPage({ pre: preToken(req, res) }));
  const tenants = all("SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.status != 'disabled') AS users FROM tenants t ORDER BY created_at DESC");
  const contacts = all('SELECT * FROM contact_requests ORDER BY status = \'open\' DESC, created_at DESC LIMIT 100');
  sendHtml(res, P.platformPage({ tenants, csrf: p.s.csrf, admin: p.admin, flash: req.query.get('ok') || '', tickets: platformTickets(), contacts }));
});
route('POST', /^\/plateforme\/connexion$/, (req, res) => {
  checkPre(req, req.form);
  const ip = clientIp(req);
  if (!sec.rateLimit('plogin:' + ip, 10, 15 * 60e3).ok) return sendHtml(res, { ...P.platformLoginPage({ pre: preToken(req, res), error: 'Trop de tentatives. Réessayez dans 15 minutes.' }), status: 429 });
  const a = one('SELECT * FROM platform_admins WHERE email = ?', sec.normalizeEmail(req.form.email));
  const locked = a && a.locked_until && a.locked_until > nowIso();
  const ok = sec.verifySecret(req.form.password || '', a?.password_hash) && a && !locked;
  if (!ok) {
    if (a && !locked) run('UPDATE platform_admins SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END WHERE id = ?', LOCK_AFTER, addMs(LOCK_MS), a.id);
    auditLog({ actor: 'platform', action: 'Échec de connexion plateforme', detail: sec.normalizeEmail(req.form.email), ip });
    return sendHtml(res, { ...P.platformLoginPage({ pre: preToken(req, res), error: 'Identifiants incorrects.' }), status: 401 });
  }
  run('UPDATE platform_admins SET failed_attempts = 0, locked_until = NULL WHERE id = ?', a.id);
  const raw = sec.randomToken(32);
  run('INSERT INTO platform_sessions (id_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)', sec.sha256(raw), a.id, sec.randomToken(18), addMs(4 * 3600e3));
  auditLog({ actor: 'platform', action: 'Connexion plateforme', detail: a.email, ip });
  redirect(res, '/plateforme', { 'Set-Cookie': cookie('gombo_p', raw, { path: '/plateforme', maxAge: 4 * 3600 }) });
});
function requirePlatform(req) {
  const p = platformSession(req);
  if (!p) throw new HttpError(401, 'Session plateforme expirée.');
  if (!req.form.csrf || !sec.safeEqual(req.form.csrf, p.s.csrf)) throw new HttpError(403, 'Jeton de sécurité invalide. Rechargez la page.');
  return p;
}
route('POST', /^\/plateforme\/deconnexion$/, (req, res) => {
  const p = requirePlatform(req); run('DELETE FROM platform_sessions WHERE id_hash = ?', p.s.id_hash);
  redirect(res, '/plateforme', { 'Set-Cookie': cookie('gombo_p', '', { path: '/plateforme', maxAge: 0 }) });
});
route('POST', /^\/plateforme\/(suspendre|reactiver)$/, (req, res, m) => {
  const p = requirePlatform(req);
  const t = one('SELECT * FROM tenants WHERE id = ?', req.form.tenant); if (!t) throw new HttpError(404, 'Entreprise inconnue.');
  if (m[1] === 'suspendre') { run("UPDATE tenants SET status = 'suspended' WHERE id = ?", t.id); run('DELETE FROM sessions WHERE tenant_id = ?', t.id); }
  else run("UPDATE tenants SET status = CASE WHEN stripe_subscription IS NULL AND ? = 1 THEN 'pending' ELSE 'active' END WHERE id = ?", stripe.stripeEnabled() ? 1 : 0, t.id);
  auditLog({ tenantId: t.id, actor: 'platform', action: m[1] === 'suspendre' ? 'Entreprise suspendue' : 'Entreprise réactivée', detail: p.admin.email, ip: clientIp(req) });
  redirect(res, '/plateforme?ok=' + encodeURIComponent(m[1] === 'suspendre' ? `${t.name} suspendue.` : `${t.name} réactivée.`));
});
route('GET', /^\/plateforme\/support\/([a-f0-9]+)\/([a-f0-9]+)\/([a-z0-9]+)$/, (req, res, m) => {
  const p = platformSession(req); if (!p) return redirect(res, '/plateforme');
  const tk = platformTickets().find((x) => x.tenantId === m[1] && x.userId === m[2] && x.id === m[3]);
  if (!tk) throw new HttpError(404, 'Demande introuvable.');
  sendHtml(res, P.layout({ title: tk.subject, nav: '<a href="/plateforme">Console</a>', body: `<div class="narrow" style="max-width:720px"><p><a href="/plateforme">← Console</a></p>
    <h1>${P.esc(tk.subject)}</h1><p class="muted">${P.esc(tk.tenant)} · ${P.esc(tk.user)}</p>
    ${tk.msgs.map((x) => `<div class="card" style="${x.from === 'support' ? 'margin-left:40px;background:var(--accent-soft)' : 'margin-right:40px'}"><div class="small muted">${x.from === 'support' ? 'Support' : P.esc(tk.user)} · ${new Date(x.at).toLocaleString('fr-FR')}</div><div style="white-space:pre-wrap">${P.esc(x.text)}</div></div>`).join('')}
    <form method="post" class="card"><input type="hidden" name="csrf" value="${P.esc(p.s.csrf)}"><label for="r">Réponse</label><textarea id="r" name="text" rows="5" style="width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit"></textarea>
      <label for="st">Statut</label><select id="st" name="status"><option value="in_progress">En cours</option><option value="resolved" selected>Résolue</option><option value="closed">Fermée</option></select>
      <button class="btn primary block">Envoyer</button></form></div>` }));
});
route('POST', /^\/plateforme\/support\/([a-f0-9]+)\/([a-f0-9]+)\/([a-z0-9]+)$/, async (req, res, m) => {
  const p = requirePlatform(req);
  const row = one('SELECT * FROM support WHERE tenant_id = ? AND user_id = ?', m[1], m[2]); if (!row) throw new HttpError(404, 'Demande introuvable.');
  const replies = JSON.parse(row.replies); const at = nowIso();
  const r = replies[m[3]] || { messages: [] };
  const text = String(req.form.text || '').trim().slice(0, 5000);
  if (text) r.messages = [...(r.messages || []), { at, text, by: p.admin.name }];
  if (['in_progress', 'resolved', 'closed'].includes(req.form.status)) { r.status = req.form.status; r.statusAt = at; }
  replies[m[3]] = r;
  run('UPDATE support SET replies = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?', JSON.stringify(replies), at, m[1], m[2]);
  const u = one('SELECT u.email, t.slug, t.name FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?', m[2]);
  if (u && text) await sendMail({ to: u.email, subject: `Réponse du support ${config.brand}`, text: `Le support a répondu à votre demande :\n\n${text}\n\nSuivez la conversation dans Aide et support : ${config.baseUrl}/${u.slug}#aide` });
  redirect(res, `/plateforme/support/${m[1]}/${m[2]}/${m[3]}`);
});

/* public help centre and contact form */
route('GET', /^\/aide$/, (req, res) => {
  const q = String(req.query.get('q') || '').trim().slice(0, 100);
  sendHtml(res, P.helpIndexPage({ q, results: q ? searchDocs(q) : null }));
});
route('GET', /^\/aide\/contact$/, (req, res) => sendHtml(res, P.contactPage({ v: { subject: String(req.query.get('sujet') || '').slice(0, 140) }, pre: preToken(req, res) })));
route('POST', /^\/aide\/contact$/, async (req, res) => {
  const f = req.form; checkPre(req, f);
  const again = (error, status = 400) => sendHtml(res, { ...P.contactPage({ v: f, error, pre: preToken(req, res) }), status });
  if (f.website) return sendHtml(res, P.contactPage({ sent: true })); // honeypot: robots get the same answer
  const ip = clientIp(req);
  if (!sec.rateLimit('contact:' + ip, 5, 3600e3).ok) return again('Trop de messages envoyés depuis cette connexion. Réessayez dans une heure.', 429);
  const name = String(f.name || '').trim(), email = sec.normalizeEmail(f.email), subject = String(f.subject || '').trim(), message = String(f.message || '').trim();
  const slug = String(f.slug || '').trim().toLowerCase().replace(/^.*\//, '');
  const category = P.CONTACT_CATEGORIES[f.category] ? f.category : 'autre';
  if (name.length < 2) return again('Indiquez votre nom.');
  if (!sec.validEmail(email)) return again('Adresse e-mail invalide.');
  if (subject.length < 3) return again('Indiquez l’objet de votre message.');
  if (message.length < 10) return again('Décrivez votre demande en quelques phrases.');
  if (message.length > 5000 || subject.length > 140 || name.length > 80) return again('Message trop long.');
  if (slug && !/^[a-z0-9-]{3,40}$/.test(slug)) return again('Adresse d’espace invalide : indiquez seulement la partie après le « / ».');
  const id = sec.newId();
  run('INSERT INTO contact_requests (id, name, email, slug, category, subject, message, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, name, email, slug || null, category, subject, message, ip, nowIso());
  const known = slug ? tenantBySlug(slug) : null;
  await sendMail({ to: config.supportEmail, subject: `[${config.brand} contact] ${subject}`, text:
    `${name} <${email}>\nSujet : ${P.CONTACT_CATEGORIES[category]}\nEspace : ${slug ? `/${slug}${known ? ` (${known.name}, ${known.status})` : ' (inconnu)'}` : '—'}\n\n${message}\n\nRépondre : ${config.baseUrl}/plateforme/contact/${id}` });
  await sendMail({ to: email, subject: `Nous avons bien reçu votre message — ${config.brand}`, text:
    `Bonjour ${name},\n\nNous avons bien reçu votre message « ${subject} ». Le support vous répond par e-mail, en général sous un jour ouvré.\n\nPour votre sécurité, ne communiquez jamais votre mot de passe ni votre code entreprise : nous ne vous les demanderons jamais.\n\nCentre d’aide : ${config.baseUrl}/aide` });
  sendHtml(res, P.contactPage({ sent: true }));
});
route('GET', /^\/aide\/([a-z0-9-]+)$/, (req, res, m) => {
  const doc = DOCS.find((d) => d.id === m[1]);
  if (!doc) throw new HttpError(404, 'Article introuvable.');
  sendHtml(res, P.helpArticlePage(doc));
});
route('GET', /^\/plateforme\/contact\/([a-f0-9]+)$/, (req, res, m) => {
  const p = platformSession(req); if (!p) return redirect(res, '/plateforme');
  const c = one('SELECT * FROM contact_requests WHERE id = ?', m[1]); if (!c) throw new HttpError(404, 'Message introuvable.');
  sendHtml(res, P.platformContactPage({ c, csrf: p.s.csrf }));
});
route('POST', /^\/plateforme\/contact\/([a-f0-9]+)$/, async (req, res, m) => {
  const p = requirePlatform(req);
  const c = one('SELECT * FROM contact_requests WHERE id = ?', m[1]); if (!c) throw new HttpError(404, 'Message introuvable.');
  const text = String(req.form.text || '').trim().slice(0, 5000);
  const replies = JSON.parse(c.replies || '[]');
  if (text) {
    replies.push({ at: nowIso(), by: p.admin.name, text });
    await sendMail({ to: c.email, subject: `Re: ${c.subject}`, text: `Bonjour ${c.name},\n\n${text}\n\n— ${p.admin.name}, support ${config.brand}\nCentre d’aide : ${config.baseUrl}/aide` });
  }
  run('UPDATE contact_requests SET replies = ?, status = ? WHERE id = ?', JSON.stringify(replies), req.form.close === '1' ? 'answered' : 'open', c.id);
  auditLog({ actor: 'platform', action: 'Réponse à un message de contact', detail: c.email, ip: clientIp(req) });
  redirect(res, '/plateforme/contact/' + c.id);
});

/* company space: login, password, invitations */
function tenantOr404(slug) {
  const t = tenantBySlug(slug);
  if (!t) throw new HttpError(404, 'Aucune entreprise à cette adresse.');
  return t;
}
route('GET', /^\/([a-z0-9-]{3,40})\/connexion$/, (req, res, m) => {
  const t = tenantOr404(m[1]);
  sendHtml(res, P.loginPage({ tenant: t, pre: preToken(req, res), info: req.query.get('info') === 'pw' ? 'Mot de passe enregistré : vous pouvez vous connecter.' : req.query.get('info') === 'out' ? 'Vous êtes déconnecté.' : '' }));
});
route('POST', /^\/([a-z0-9-]{3,40})\/connexion$/, (req, res, m) => {
  const t = tenantOr404(m[1]);
  const f = req.form; checkPre(req, f);
  const ip = clientIp(req), email = sec.normalizeEmail(f.email);
  const fail = (error, status = 401) => sendHtml(res, { ...P.loginPage({ tenant: t, pre: preToken(req, res), error, email }), status });
  if (!sec.rateLimit('login:' + ip, 20, 15 * 60e3).ok) return fail('Trop de tentatives depuis cette connexion. Réessayez dans 15 minutes.', 429);
  if (t.status === 'suspended') return fail('Cet espace est suspendu. Contactez ' + config.supportEmail + '.', 403);
  const u = one('SELECT * FROM users WHERE tenant_id = ? AND email = ?', t.id, email);
  if (u && u.locked_until && u.locked_until > nowIso()) {
    sec.dummyVerify();
    return fail('Trop d’essais incorrects : ce compte est bloqué 15 minutes. Votre administrateur peut aussi réinitialiser votre mot de passe.', 429);
  }
  // Always check all three, so the error does not reveal which one was wrong.
  const pwOk = sec.verifySecret(f.password || '', u?.password_hash);
  // Before the first code exists (payment not finished), only the administrator may enter, to finish the set-up.
  const codeOk = t.company_code_hash ? sec.verifySecret(sec.normalizeCode(f.code), t.company_code_hash) : (sec.dummyVerify(), u?.role === 'admin');
  if (!u || u.status !== 'active' || !pwOk || !codeOk) {
    if (u) run('UPDATE users SET failed_attempts = failed_attempts + 1, locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END WHERE id = ?', LOCK_AFTER, addMs(LOCK_MS), u.id);
    auditLog({ tenantId: t.id, userId: u?.id || null, action: 'Échec de connexion', detail: email, ip });
    return fail('E-mail, mot de passe ou code entreprise incorrect.');
  }
  if (t.status === 'pending' && u.role !== 'admin') return fail('L’abonnement de cet espace n’est pas encore activé. Contactez votre administrateur.', 403);
  run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?', nowIso(), u.id);
  createSession(res, u, t, req);
  auditLog({ tenantId: t.id, userId: u.id, action: 'Connexion', detail: email, ip });
  redirect(res, t.status === 'pending' || !t.company_code_hash ? `/${t.slug}/admin` : `/${t.slug}`);
});
route('POST', /^\/([a-z0-9-]{3,40})\/deconnexion$/, (req, res, m) => {
  const t = tenantOr404(m[1]); const s = loadSession(req, t);
  if (s) {
    if (!req.form.csrf || !sec.safeEqual(req.form.csrf, s.session.csrf)) throw new HttpError(403, 'Jeton de sécurité invalide.');
    run('DELETE FROM sessions WHERE id_hash = ?', s.session.id_hash);
    auditLog({ tenantId: t.id, userId: s.user.id, action: 'Déconnexion', ip: clientIp(req) });
  }
  redirect(res, `/${t.slug}/connexion?info=out`, { 'Set-Cookie': cookie('gombo_s', '', { path: `/${t.slug}`, maxAge: 0 }) });
});
route('GET', /^\/([a-z0-9-]{3,40})\/mot-de-passe-oublie$/, (req, res, m) => sendHtml(res, P.forgotPage({ tenant: tenantOr404(m[1]), pre: preToken(req, res) })));
route('POST', /^\/([a-z0-9-]{3,40})\/mot-de-passe-oublie$/, async (req, res, m) => {
  const t = tenantOr404(m[1]); checkPre(req, req.form);
  const email = sec.normalizeEmail(req.form.email);
  if (sec.rateLimit('forgot:' + clientIp(req), 5, 3600e3).ok && sec.rateLimit('forgot:' + t.id + email, 3, 3600e3).ok) {
    const u = one("SELECT * FROM users WHERE tenant_id = ? AND email = ? AND status = 'active'", t.id, email);
    if (u) { await sendReset(t, u); auditLog({ tenantId: t.id, userId: u.id, action: 'Demande de réinitialisation', ip: clientIp(req) }); }
  }
  sendHtml(res, P.forgotPage({ tenant: t, pre: preToken(req, res), sent: true }));
});
for (const [path, purpose] of [['nouveau-mot-de-passe', 'reset'], ['invitation', 'invite']]) {
  route('GET', new RegExp(`^\\/([a-z0-9-]{3,40})\\/${path}$`), (req, res, m) => {
    const t = tenantOr404(m[1]); const found = findToken(req.query.get('token'), purpose, t.id);
    if (!found) return sendHtml(res, P.messagePage('Lien invalide ou expiré', purpose === 'invite' ? 'Demandez à votre administrateur de renvoyer l’invitation.' : 'Refaites une demande de réinitialisation.', { href: `/${t.slug}/connexion`, label: 'Connexion' }, 400));
    sendHtml(res, P.setPasswordPage({ tenant: t, pre: preToken(req, res), token: req.query.get('token'), invite: purpose === 'invite', user: found.user }));
  });
  route('POST', new RegExp(`^\\/([a-z0-9-]{3,40})\\/${path}$`), (req, res, m) => {
    const t = tenantOr404(m[1]); checkPre(req, req.form);
    const found = findToken(req.form.token, purpose, t.id);
    if (!found) return sendHtml(res, P.messagePage('Lien invalide ou expiré', 'Refaites la demande.', { href: `/${t.slug}/connexion`, label: 'Connexion' }, 400));
    const again = (error) => sendHtml(res, { ...P.setPasswordPage({ tenant: t, pre: preToken(req, res), token: req.form.token, invite: purpose === 'invite', user: found.user, error }), status: 400 });
    if (req.form.password !== req.form.password2) return again('Les deux mots de passe ne sont pas identiques.');
    const pp = sec.passwordProblem(req.form.password, found.user.email); if (pp) return again(pp);
    tx(() => {
      run("UPDATE users SET password_hash = ?, status = CASE WHEN status = 'invited' THEN 'active' ELSE status END, failed_attempts = 0, locked_until = NULL WHERE id = ?", sec.hashSecret(req.form.password), found.user.id);
      run('UPDATE tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL', nowIso(), found.user.id, purpose);
      endSessions(found.user.id);
    });
    auditLog({ tenantId: t.id, userId: found.user.id, action: purpose === 'invite' ? 'Invitation acceptée' : 'Mot de passe réinitialisé', detail: found.user.email, ip: clientIp(req) });
    redirect(res, `/${t.slug}/connexion?info=pw`);
  });
}

/* company admin */
function requireUser(req, res, t, { admin = false, page = true } = {}) {
  const s = loadSession(req, t);
  if (!s) { if (page) { redirect(res, `/${t.slug}/connexion`); return null; } throw new HttpError(401, 'Session expirée : reconnectez-vous.', 'unauthenticated'); }
  if (admin && s.user.role !== 'admin') throw new HttpError(403, 'Réservé aux administrateurs.', 'forbidden');
  return s;
}
function requireCsrf(req, s) {
  const tok = req.form?.csrf || req.headers['x-csrf-token'];
  if (!tok || !sec.safeEqual(tok, s.session.csrf)) throw new HttpError(403, 'Jeton de sécurité invalide. Rechargez la page.', 'csrf');
}
function renderAdmin(res, t, s, extra = {}) {
  const users = all('SELECT * FROM users WHERE tenant_id = ? ORDER BY role, name', t.id).map((u) => ({ ...u, locked: u.locked_until && u.locked_until > nowIso() }));
  const audit = all('SELECT * FROM audit WHERE tenant_id = ? ORDER BY id DESC LIMIT 25', t.id);
  sendHtml(res, P.adminPage({ tenant: one('SELECT * FROM tenants WHERE id = ?', t.id), me: s.user, users, csrf: s.session.csrf, audit, billing: stripe.stripeEnabled(), ...extra }));
}
route('GET', /^\/([a-z0-9-]{3,40})\/admin$/, (req, res, m) => {
  const t = tenantOr404(m[1]); const s = requireUser(req, res, t, { admin: true }); if (!s) return;
  if (t.status === 'pending' && stripe.stripeEnabled()) {
    return sendHtml(res, P.layout({ title: 'Paiement à finaliser', body: `<div class="narrow card"><h1>Paiement à finaliser</h1><p>L’espace <strong>${P.esc(t.name)}</strong> est réservé. Finalisez l’abonnement pour l’activer.</p>
      <form method="post" action="/${P.esc(t.slug)}/admin/paiement"><input type="hidden" name="csrf" value="${P.esc(s.session.csrf)}"><button class="btn primary block">Payer et activer</button></form></div>` }));
  }
  renderAdmin(res, t, s, { flash: req.query.get('ok') || '' });
});
route('POST', /^\/([a-z0-9-]{3,40})\/admin\/([a-z]+)$/, async (req, res, m) => {
  const t = tenantOr404(m[1]); const s = requireUser(req, res, t, { admin: true }); if (!s) return;
  requireCsrf(req, s);
  const f = req.form, ip = clientIp(req), action = m[2];
  const target = f.user ? one('SELECT * FROM users WHERE id = ? AND tenant_id = ?', f.user, t.id) : null;
  if (f.user && !target) throw new HttpError(404, 'Utilisateur inconnu.');
  if (target && target.id === s.user.id && ['disable', 'role', 'reset'].includes(action)) throw new HttpError(400, 'Vous ne pouvez pas modifier votre propre compte ici.');
  const ok = (msg) => redirect(res, `/${t.slug}/admin?ok=${encodeURIComponent(msg)}`);
  const fail = (error) => renderAdmin(res, t, s, { error });
  const log = (a, d) => auditLog({ tenantId: t.id, userId: s.user.id, action: a, detail: d, ip });
  switch (action) {
    case 'invite': {
      const email = sec.normalizeEmail(f.email), name = String(f.name || '').trim(), role = ['admin', 'member', 'reader'].includes(f.role) ? f.role : 'member';
      if (!sec.validEmail(email)) return fail('Adresse e-mail invalide.');
      if (name.length < 2) return fail('Indiquez le nom de l’utilisateur.');
      if (activeSeatCount(t.id) >= t.seats) return fail(`Votre formule compte ${t.seats} utilisateurs.`);
      if (one('SELECT 1 FROM users WHERE tenant_id = ? AND email = ?', t.id, email)) return fail('Un compte existe déjà avec cette adresse.');
      const u = { id: sec.newId(), email, name };
      run("INSERT INTO users (id, tenant_id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'invited', ?)", u.id, t.id, email, name, role, nowIso());
      await sendInvite(t, u, s.user.name); log('Utilisateur invité', `${email} (${role})`);
      return ok(`Invitation envoyée à ${email}. Communiquez-lui le code entreprise.`);
    }
    case 'resend': {
      if (target.status !== 'invited') return fail('Ce compte est déjà activé.');
      run("UPDATE tokens SET used_at = ? WHERE user_id = ? AND purpose = 'invite' AND used_at IS NULL", nowIso(), target.id);
      await sendInvite(t, target, s.user.name); log('Invitation renvoyée', target.email); return ok(`Invitation renvoyée à ${target.email}.`);
    }
    case 'reset': {
      await sendReset(t, target); endSessions(target.id); log('Réinitialisation envoyée', target.email);
      return ok(`Lien de réinitialisation envoyé à ${target.email}. Ses sessions ont été fermées.`);
    }
    case 'disable': {
      run("UPDATE users SET status = 'disabled' WHERE id = ?", target.id); endSessions(target.id); log('Utilisateur désactivé', target.email);
      return ok(`${target.email} ne peut plus se connecter. Pensez à générer un nouveau code entreprise s’il quitte l’entreprise.`);
    }
    case 'enable': {
      if (activeSeatCount(t.id) >= t.seats) return fail(`Votre formule compte ${t.seats} utilisateurs.`);
      run("UPDATE users SET status = CASE WHEN password_hash IS NULL THEN 'invited' ELSE 'active' END, failed_attempts = 0, locked_until = NULL WHERE id = ?", target.id);
      log('Utilisateur réactivé', target.email); return ok(`${target.email} est réactivé.`);
    }
    case 'role': {
      const role = ['admin', 'member', 'reader'].includes(f.role) ? f.role : null; if (!role) return fail('Rôle inconnu.');
      run('UPDATE users SET role = ? WHERE id = ?', role, target.id); endSessions(target.id); log('Rôle modifié', `${target.email} → ${role}`);
      return ok(`Rôle de ${target.email} modifié.`);
    }
    case 'code': {
      const code = sec.newCompanyCode();
      run('UPDATE tenants SET company_code_hash = ? WHERE id = ?', sec.hashSecret(sec.normalizeCode(code)), t.id);
      log('Nouveau code entreprise généré', '');
      return renderAdmin(res, t, s, { newCode: code, flash: 'Nouveau code entreprise généré.' });
    }
    case 'abonnement': {
      if (!stripe.stripeEnabled() || !t.stripe_customer) return fail('Aucun abonnement en ligne pour cet espace.');
      const portal = await stripe.createPortal(t.stripe_customer, `${config.baseUrl}/${t.slug}/admin`);
      log('Ouverture du portail d’abonnement', ''); return redirect(res, portal.url);
    }
    case 'paiement': {
      if (!stripe.stripeEnabled() || t.status !== 'pending') return ok('Abonnement déjà actif.');
      appendCookie(res, cookie('gombo_signup', `${t.id}.${sec.hmac('signup:' + t.id)}`, { path: '/inscription', maxAge: 86400 }));
      const cs = await stripe.createCheckout({ tenant: t, email: s.user.email, plan: t.plan, interval: t.interval });
      return redirect(res, cs.url);
    }
    default: throw new HttpError(404, 'Action inconnue.');
  }
});

/* the application */
route('GET', /^\/([a-z0-9-]{3,40})\/?$/, (req, res, m) => {
  const t = tenantBySlug(m[1]);
  if (!t) throw new HttpError(404, 'Aucune entreprise à cette adresse.');
  const s = requireUser(req, res, t); if (!s) return;
  const a = access(t);
  if (a === 'blocked') return t.status === 'pending' && s.user.role === 'admin' ? redirect(res, `/${t.slug}/admin`)
    : sendHtml(res, P.messagePage('Espace indisponible', t.status === 'suspended' ? `Cet espace est suspendu. Contactez ${config.supportEmail}.` : 'L’abonnement de cet espace n’est pas encore actif.', null, 403));
  sendHtml(res, { html: renderApp(t, s.user, s.session) }, { kind: 'app' });
});

/* JSON API used by the app */
function apiContext(req, res, slug, { write = false } = {}) {
  const t = tenantBySlug(slug); if (!t) throw new HttpError(404, 'Espace inconnu.', 'not_found');
  const s = requireUser(req, res, t, { page: false });
  if (req.method !== 'GET') requireCsrf(req, s);
  const a = access(t);
  if (a === 'blocked') throw new HttpError(403, 'Espace indisponible.', 'blocked');
  if (write && a === 'readonly') throw new HttpError(402, 'Abonnement inactif : l’espace est en lecture seule.', 'read_only');
  if (write && s.user.role === 'reader') throw new HttpError(403, 'Votre compte est en lecture seule.', 'read_only');
  return { t, s, a };
}
const docRow = (r) => JSON.parse(r.body);
route('GET', /^\/([a-z0-9-]{3,40})\/api\/state$/, (req, res, m) => {
  const { t, s, a } = apiContext(req, res, m[1]);
  const meta = one("SELECT body FROM docs WHERE tenant_id = ? AND kind = 'meta' AND id = 'meta'", t.id);
  const records = all("SELECT body FROM docs WHERE tenant_id = ? AND kind = 'record'", t.id).map(docRow);
  sendJson(res, 200, { meta: meta ? docRow(meta) : null, records, serverTime: nowIso(), access: a, status: t.status, role: s.user.role,
    tenant: { name: t.name, country: t.country, slug: t.slug, createdAt: t.created_at } });
});
route('GET', /^\/([a-z0-9-]{3,40})\/api\/changes$/, (req, res, m) => {
  const { t, a } = apiContext(req, res, m[1]);
  const since = String(req.query.get('since') || '');
  const serverTime = nowIso();
  const rows = all('SELECT kind, body, updated_by FROM docs WHERE tenant_id = ? AND updated_at > ?', t.id, since);
  sendJson(res, 200, { meta: rows.filter((r) => r.kind === 'meta').map(docRow)[0] || null, records: rows.filter((r) => r.kind === 'record').map((r) => ({ ...docRow(r), _by: r.updated_by })), serverTime, access: a });
});
route('PUT', /^\/([a-z0-9-]{3,40})\/api\/meta$/, (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1], { write: true });
  const body = req.json; if (!body || typeof body !== 'object') throw new HttpError(400, 'Données invalides.');
  const merged = tx(() => {
    const prev = one("SELECT body FROM docs WHERE tenant_id = ? AND kind = 'meta' AND id = 'meta'", t.id);
    const next = mergeMeta(prev ? docRow(prev) : null, { ...body, name: t.name });
    run("INSERT INTO docs (tenant_id, kind, id, body, updated_at, updated_by) VALUES (?, 'meta', 'meta', ?, ?, ?) ON CONFLICT (tenant_id, kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      t.id, JSON.stringify(next), nowIso(), s.user.id);
    return next;
  });
  sendJson(res, 200, { ok: true, seq: merged.seq });
});
function saveRecords(t, userId, recs) {
  const at = nowIso();
  tx(() => {
    for (const rec of recs) {
      if (!rec || typeof rec.id !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(rec.id) || !RECORD_TYPES.has(rec.t)) throw new HttpError(400, 'Enregistrement invalide.');
      const body = JSON.stringify(rec); if (body.length > 400_000) throw new HttpError(413, 'Enregistrement trop volumineux.');
      const number = NUMBERED.has(rec.t) && rec.number ? String(rec.number) : null;
      const prev = one("SELECT type FROM docs WHERE tenant_id = ? AND kind = 'record' AND id = ?", t.id, rec.id);
      if (prev && prev.type !== rec.t) throw new HttpError(409, 'Type d’enregistrement modifié.', 'conflict');
      if (number && one("SELECT 1 FROM docs WHERE tenant_id = ? AND kind = 'record' AND type = ? AND number = ? AND id != ?", t.id, rec.t, number, rec.id)) {
        throw new HttpError(409, `Le numéro ${number} vient d’être attribué par un collègue : rien n’a été enregistré. La page va se recharger, recommencez ensuite.`, 'number_taken', { number });
      }
      run(`INSERT INTO docs (tenant_id, kind, id, type, number, body, updated_at, updated_by) VALUES (?, 'record', ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, kind, id) DO UPDATE SET type = excluded.type, number = excluded.number, body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        t.id, rec.id, rec.t, number, body, at, userId);
    }
  });
}
route('PUT', /^\/([a-z0-9-]{3,40})\/api\/records\/([A-Za-z0-9_-]{6,64})$/, (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1], { write: true });
  if (!req.json || req.json.id !== m[2]) throw new HttpError(400, 'Enregistrement invalide.');
  saveRecords(t, s.user.id, [req.json]);
  sendJson(res, 200, { ok: true });
});
/** All records of one business action (invoice + journal entry + stock), saved together or not at all. */
route('PUT', /^\/([a-z0-9-]{3,40})\/api\/batch$/, (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1], { write: true });
  const recs = req.json?.records;
  if (!Array.isArray(recs) || !recs.length || recs.length > 500) throw new HttpError(400, 'Lot invalide.');
  saveRecords(t, s.user.id, recs);
  sendJson(res, 200, { ok: true, saved: recs.length });
});
route('GET', /^\/([a-z0-9-]{3,40})\/api\/support$/, (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1]);
  const row = one('SELECT * FROM support WHERE tenant_id = ? AND user_id = ?', t.id, s.user.id);
  sendJson(res, 200, { tickets: row ? JSON.parse(row.tickets) : [], replies: row ? JSON.parse(row.replies) : {} });
});
route('PUT', /^\/([a-z0-9-]{3,40})\/api\/support$/, async (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1]); // readers may still ask for help
  const tickets = Array.isArray(req.json?.tickets) ? req.json.tickets.slice(0, 200) : null;
  if (!tickets) throw new HttpError(400, 'Données invalides.');
  const prev = one('SELECT tickets FROM support WHERE tenant_id = ? AND user_id = ?', t.id, s.user.id);
  run(`INSERT INTO support (tenant_id, user_id, tickets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (tenant_id, user_id) DO UPDATE SET tickets = excluded.tickets, updated_at = excluded.updated_at`,
    t.id, s.user.id, JSON.stringify(tickets), nowIso());
  const before = prev ? JSON.parse(prev.tickets).length : 0;
  if (tickets.length > before) {
    const tk = tickets[0];
    await sendMail({ to: config.supportEmail, subject: `[${config.brand}] ${t.name} — ${String(tk.subject || '').slice(0, 100)}`, text: `${s.user.name} <${s.user.email}> (${t.name}, /${t.slug})\n\n${tk.messages?.[0]?.text || ''}\n\nRépondre : ${config.baseUrl}/plateforme` });
  }
  sendJson(res, 200, { ok: true });
});
route('POST', /^\/([a-z0-9-]{3,40})\/api\/ai$/, async (req, res, m) => {
  const { t, s } = apiContext(req, res, m[1]);
  if (!config.ai.anthropicKey) throw new HttpError(404, 'Assistant IA non configuré.', 'not_granted');
  if (t.plan === 'essentiel') throw new HttpError(403, 'L’assistant IA est inclus dans les formules Pro et Entreprise.', 'not_granted');
  const day = nowIso().slice(0, 10);
  const used = one('SELECT calls FROM ai_usage WHERE tenant_id = ? AND day = ?', t.id, day)?.calls || 0;
  if (used >= config.ai.dailyLimitPerTenant || !sec.rateLimit('ai:' + s.user.id, 20, 60e3).ok) throw new HttpError(429, 'Trop de demandes pour le moment.', 'rate_limited');
  run('INSERT INTO ai_usage (tenant_id, day, calls) VALUES (?, ?, 1) ON CONFLICT (tenant_id, day) DO UPDATE SET calls = calls + 1', t.id, day);
  sendJson(res, 200, await aiProxy(req.json || {}));
});

/* ------------------------------------------------------------ dispatch --- */
export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    req.query = url.searchParams; req.cookies = parseCookies(req.headers.cookie);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') || '/' : '/';
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    try {
      const r = routes.find((x) => x.method === method && x.pattern.test(path));
      if (!r) {
        if (routes.some((x) => x.pattern.test(path))) throw new HttpError(405, 'Méthode non autorisée.');
        throw new HttpError(404, 'Page introuvable.');
      }
      if (method === 'POST' || method === 'PUT') {
        const isAi = /\/api\/ai$/.test(path);
        req.rawBody = await readBody(req, isAi ? 12e6 : path.startsWith('/stripe') ? 1e6 : 2e6);
        const ct = String(req.headers['content-type'] || '');
        if (ct.includes('application/json')) { try { req.json = JSON.parse(req.rawBody || 'null'); } catch { throw new HttpError(400, 'JSON invalide.'); } req.form = {}; }
        else req.form = Object.fromEntries(new URLSearchParams(req.rawBody));
        // Cross-site check for state-changing requests (in addition to tokens and SameSite cookies).
        const origin = req.headers.origin;
        if (origin && !path.startsWith('/stripe/') && origin !== config.baseUrl && !(config.dev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) throw new HttpError(403, 'Origine refusée.');
      }
      await r.handler(req, res, path.match(r.pattern));
    } catch (e) {
      const status = e instanceof HttpError || (Number.isInteger(e?.status) && e.status >= 400 && e.status < 600 && e.code) ? e.status : 500;
      if (status === 500) console.error('[jumtoo]', req.method, path, e);
      if (res.headersSent) return res.end();
      const msg = status === 500 ? 'Une erreur est survenue. Réessayez dans un instant.' : e.message;
      if (path.includes('/api/') || path.startsWith('/stripe/')) return sendJson(res, status, { error: msg, code: e.code || (status === 500 ? 'internal' : 'error'), ...(e.extra || {}) });
      return sendHtml(res, P.messagePage(status === 404 ? 'Page introuvable' : 'Erreur', msg, { href: '/', label: 'Accueil' }, status));
    }
  });
}

export function start() {
  assertProductionConfig();
  openDb();
  const server = createApp();
  server.listen(config.port, () => console.log(`[jumtoo] ${config.baseUrl} (port ${config.port}${config.dev ? ', développement' : ''})`));
  setInterval(() => { run('DELETE FROM sessions WHERE expires_at < ?', nowIso()); run('DELETE FROM platform_sessions WHERE expires_at < ?', nowIso()); run('DELETE FROM tokens WHERE expires_at < ?', addMs(-30 * 86400e3)); }, 3600e3).unref();
  return server;
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) start();
