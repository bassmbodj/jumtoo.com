// End-to-end tests of the HTTP server: sign-up, login with company code, admin, isolation, Stripe, AI proxy.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'jumtoo-test-'));
process.env.DATA_DIR = dir; process.env.JUMTOO_ENV = 'development'; process.env.TRIAL_DAYS = '14';
const { config } = await import('../src/config.js');
const { openDb, run, one } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { outbox } = await import('../src/mail.js');
const stripe = await import('../src/stripe.js');
const { setAiFetch } = await import('../src/ai.js');
const sec = await import('../src/security.js');

let server, base;
before(async () => { openDb(join(dir, 'test.sqlite')); server = createApp(); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; config.baseUrl = base; });
beforeEach(() => sec.resetRateLimits());
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

/** Tiny browser: cookie jar (respecting Path), no automatic redirects. */
class Browser {
  constructor() { this.jar = []; }
  cookieFor(path) { return this.jar.filter((c) => path === c.path || path.startsWith(c.path.endsWith('/') ? c.path : c.path + '/') || c.path === '/').map((c) => `${c.name}=${c.value}`).join('; '); }
  async req(method, path, { form, json, headers = {} } = {}) {
    const h = { ...headers, cookie: this.cookieFor(path.split('?')[0]) };
    let body;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    const r = await fetch(base + path, { method, headers: h, body, redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) {
      const [nv, ...attrs] = sc.split(';'); const i = nv.indexOf('=');
      const name = nv.slice(0, i).trim(), value = decodeURIComponent(nv.slice(i + 1).trim());
      const p = (attrs.find((a) => a.trim().toLowerCase().startsWith('path=')) || 'path=/').split('=')[1].trim();
      const maxAge = attrs.find((a) => a.trim().toLowerCase().startsWith('max-age='));
      this.jar = this.jar.filter((c) => !(c.name === name && c.path === p));
      if (!(maxAge && Number(maxAge.split('=')[1]) <= 0)) this.jar.push({ name, value, path: p });
    }
    const text = await r.text();
    return { status: r.status, text, location: r.headers.get('location'), headers: r.headers, json: () => JSON.parse(text) };
  }
  get(p, o) { return this.req('GET', p, o); }
  post(p, form, o = {}) { return this.req('POST', p, { ...o, form }); }
  pre() { return this.jar.find((c) => c.name === 'gombo_pre')?.value; }
}
const csrfOf = (html) => /"csrf":"([^"]+)"/.exec(html)?.[1] || /name="csrf" value="([^"]+)"/.exec(html)?.[1];
const codeOf = (html) => /class="code"[^>]*>([A-Z0-9]{4}-[A-Z0-9]{4})</.exec(html)?.[1];

async function signup(b, over = {}) {
  await b.get('/inscription');
  const form = { pre: b.pre(), plan: 'pro', interval: 'month', company: 'Teranga Services', slug: 'teranga', country: 'SN', name: 'Awa Diop', email: 'awa@teranga.sn', password: 'Dakar2026secure', terms: '1', ...over };
  return b.post('/inscription', form);
}
async function login(b, slug, email, password, code) {
  await b.get(`/${slug}/connexion`);
  return b.post(`/${slug}/connexion`, { pre: b.pre(), email, password, code });
}

let codeA = '';
test('public pages and security headers', async () => {
  const b = new Browser();
  const r = await b.get('/');
  assert.equal(r.status, 200); assert.match(r.text, /Tarifs/); assert.match(r.text, /Essentiel/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await b.get('/nexiste-pas')).status, 404);
  assert.equal((await b.get('/../etc/passwd')).status, 404);
});

test('sign-up validation', async () => {
  const b = new Browser();
  await b.get('/inscription');
  assert.equal((await b.post('/inscription', { plan: 'pro' })).status, 403, 'missing pre token');
  assert.equal((await signup(b, { slug: 'admin' })).status, 400, 'reserved slug');
  assert.equal((await signup(b, { slug: 'A B' })).status, 400, 'bad slug');
  assert.match((await signup(b, { password: 'court1' })).text, /10 caractères/);
  assert.match((await signup(b, { password: 'abcdefghijk' })).text, /lettres et des chiffres/);
  assert.equal((await signup(b, { terms: '' })).status, 400);
  assert.equal((await signup(b, { email: 'pas-un-email' })).status, 400);
});

test('sign-up without Stripe gives a trial and a one-time company code', async () => {
  const b = new Browser();
  const r = await signup(b);
  assert.equal(r.status, 303); assert.match(r.location, /^\/inscription\/terminee/);
  const done = await b.get(r.location);
  assert.equal(done.status, 200);
  codeA = codeOf(done.text); assert.ok(codeA, 'code displayed');
  const t = one("SELECT * FROM tenants WHERE slug = 'teranga'");
  assert.equal(t.status, 'trialing'); assert.equal(t.seats, 10);
  assert.notEqual(t.company_code_hash, codeA); assert.match(t.company_code_hash, /^scrypt\$/);
  assert.equal(codeOf((await b.get(r.location)).text), undefined, 'not shown twice');
  assert.equal((await signup(new Browser())).status, 400, 'slug taken');
});

let A; // admin browser of tenant A
test('login needs e-mail, password AND company code', async () => {
  const b = new Browser();
  for (const [pw, code] of [['Dakar2026secure', 'AAAA-BBBB'], ['mauvais-mot2passe', codeA]]) {
    const r = await login(b, 'teranga', 'awa@teranga.sn', pw, code);
    assert.equal(r.status, 401); assert.match(r.text, /E-mail, mot de passe ou code entreprise incorrect/);
  }
  assert.equal((await login(b, 'teranga', 'inconnu@teranga.sn', 'Dakar2026secure', codeA)).status, 401);
  const ok = await login(b, 'teranga', 'AWA@teranga.sn', 'Dakar2026secure', codeA.toLowerCase().replace('-', ' '));
  assert.equal(ok.status, 303); assert.equal(ok.location, '/teranga');
  const sc = b.jar.find((c) => c.name === 'gombo_s'); assert.equal(sc.path, '/teranga');
  const app = await b.get('/teranga');
  assert.equal(app.status, 200); assert.match(app.text, /window\.GOMBO = /); assert.match(app.text, /"role":"admin"/);
  assert.match(app.headers.get('content-security-policy'), /connect-src 'self'/);
  A = b;
  assert.equal((await new Browser().get('/teranga')).location, '/teranga/connexion', 'anonymous redirected');
});

test('API: state, csrf, records, meta merge, numbers', async () => {
  const csrf = csrfOf((await A.get('/teranga')).text);
  const st = (await A.get('/teranga/api/state')).json();
  assert.equal(st.meta, null); assert.equal(st.tenant.country, 'SN');
  assert.equal((await A.req('PUT', '/teranga/api/meta', { json: { seq: {} } })).status, 403, 'csrf required');
  const H = { 'x-csrf-token': csrf };
  assert.equal((await A.req('PUT', '/teranga/api/meta', { json: { name: 'x', country: 'SN', seq: { invoice: 3 }, audit: [{ at: '2026-01-01', action: 'a' }] }, headers: H })).status, 200);
  const m2 = (await A.req('PUT', '/teranga/api/meta', { json: { country: 'SN', seq: { invoice: 1, bill: 2 }, audit: [{ at: '2026-01-02', action: 'b' }] }, headers: H })).json();
  assert.deepEqual(m2.seq, { invoice: 3, bill: 2 }, 'sequences never go back');
  const meta = (await A.get('/teranga/api/state')).json().meta;
  assert.equal(meta.audit.length, 2); assert.equal(meta.name, 'Teranga Services', 'name comes from the server');
  const since = new Date(Date.now() - 1000).toISOString();
  assert.equal((await A.req('PUT', '/teranga/api/records/inv000001', { json: { t: 'invoice', id: 'inv000001', number: 'F-000001' }, headers: H })).status, 200);
  const dup = await A.req('PUT', '/teranga/api/records/inv000002', { json: { t: 'invoice', id: 'inv000002', number: 'F-000001' }, headers: H });
  assert.equal(dup.status, 409); assert.equal(dup.json().code, 'number_taken');
  assert.equal((await A.req('PUT', '/teranga/api/records/inv000002', { json: { t: 'virus', id: 'inv000002' }, headers: H })).status, 400);
  assert.equal((await A.req('PUT', '/teranga/api/records/inv000003', { json: { t: 'invoice', id: 'other' }, headers: H })).status, 400, 'id must match');
  const batch = await A.req('PUT', '/teranga/api/batch', { json: { records: [{ t: 'entry', id: 'ent000099', number: 'VT-1' }, { t: 'invoice', id: 'inv000099', number: 'F-000001' }] }, headers: H });
  assert.equal(batch.status, 409); assert.equal(batch.json().number, 'F-000001');
  assert.equal(one("SELECT COUNT(*) n FROM docs WHERE id IN ('ent000099', 'inv000099')").n, 0, 'whole batch rolled back');
  assert.equal((await A.req('PUT', '/teranga/api/batch', { json: { records: [{ t: 'customer', id: 'cus000001' }, { t: 'product', id: 'pro000001' }] }, headers: H })).json().saved, 2);
  const ch = (await A.get('/teranga/api/changes?since=' + encodeURIComponent(since))).json();
  assert.equal(ch.records.length, 3); assert.ok(ch.meta);
  assert.equal((await A.req('PUT', '/teranga/api/meta', { json: {}, headers: { ...H, origin: 'https://evil.example' } })).status, 403, 'foreign origin refused');
});

let B, codeB;
test('tenants are isolated', async () => {
  B = new Browser();
  const r = await signup(B, { company: 'Boutique Ndar', slug: 'boutique-ndar', email: 'moussa@ndar.sn', name: 'Moussa Fall', plan: 'essentiel' });
  codeB = codeOf((await B.get(r.location)).text);
  assert.equal((await login(B, 'boutique-ndar', 'moussa@ndar.sn', 'Dakar2026secure', codeB)).status, 303);
  // A's credentials and code do not open B, nor B's code A.
  assert.equal((await login(new Browser(), 'boutique-ndar', 'awa@teranga.sn', 'Dakar2026secure', codeA)).status, 401);
  assert.equal((await login(new Browser(), 'teranga', 'awa@teranga.sn', 'Dakar2026secure', codeB)).status, 401);
  // B's session cookie sent to A's API is refused.
  const sid = B.jar.find((c) => c.name === 'gombo_s').value;
  const r2 = await fetch(`${base}/teranga/api/state`, { headers: { cookie: `gombo_s=${sid}` } });
  assert.equal(r2.status, 401);
  const st = (await B.get('/boutique-ndar/api/state')).json();
  assert.equal(st.records.length, 0, 'B sees none of A’s records');
});

let memberCookie;
test('admin invites, member activates and logs in; roles enforced', async () => {
  const page = await A.get('/teranga/admin'); assert.equal(page.status, 200);
  const csrf = csrfOf(page.text);
  assert.equal((await A.post('/teranga/admin/invite', { name: 'Ibrahima', email: 'ibou@teranga.sn', role: 'member' })).status, 403, 'csrf');
  assert.equal((await A.post('/teranga/admin/invite', { csrf, name: 'Ibrahima', email: 'ibou@teranga.sn', role: 'member' })).status, 303);
  const mail = outbox.findLast((m) => m.to === 'ibou@teranga.sn'); assert.ok(mail);
  assert.ok(!mail.text.includes(codeA), 'the company code is never e-mailed');
  const link = /\/teranga\/invitation\?token=[\w-]+/.exec(mail.text)[0];
  const m = new Browser();
  assert.equal((await m.get(link)).status, 200);
  const token = new URL(base + link).searchParams.get('token');
  assert.equal((await m.post('/teranga/invitation', { pre: m.pre(), token, password: 'Thies2026secure', password2: 'autre' })).status, 400);
  assert.equal((await m.post('/teranga/invitation', { pre: m.pre(), token, password: 'Thies2026secure', password2: 'Thies2026secure' })).status, 303);
  assert.equal((await m.get(link)).status, 400, 'token single use');
  assert.equal((await login(m, 'teranga', 'ibou@teranga.sn', 'Thies2026secure', codeA)).status, 303);
  assert.equal((await m.get('/teranga/admin')).status, 403, 'members cannot administer');
  memberCookie = m;
  // switch him to read only: writes refused, reads allowed
  const uid = one("SELECT id FROM users WHERE email = 'ibou@teranga.sn'").id;
  assert.equal((await A.post('/teranga/admin/role', { csrf, user: uid, role: 'reader' })).status, 303);
  assert.equal((await m.get('/teranga/api/state')).status, 401, 'role change closes sessions');
  await login(m, 'teranga', 'ibou@teranga.sn', 'Thies2026secure', codeA);
  const mcsrf = csrfOf((await m.get('/teranga')).text);
  const w = await m.req('PUT', '/teranga/api/records/cust000001', { json: { t: 'customer', id: 'cust000001' }, headers: { 'x-csrf-token': mcsrf } });
  assert.equal(w.status, 403); assert.equal(w.json().code, 'read_only');
  assert.equal((await m.get('/teranga/api/state')).status, 200);
  // disable: sessions closed
  assert.equal((await A.post('/teranga/admin/disable', { csrf, user: uid })).status, 303);
  assert.equal((await m.get('/teranga/api/state')).status, 401);
  assert.equal((await login(new Browser(), 'teranga', 'ibou@teranga.sn', 'Thies2026secure', codeA)).status, 401);
  // admin cannot demote or disable himself
  const me = one("SELECT id FROM users WHERE email = 'awa@teranga.sn'").id;
  assert.equal((await A.post('/teranga/admin/disable', { csrf, user: me })).status, 400);
});

test('seat limit of the plan', async () => {
  const page = await B.get('/boutique-ndar/admin'); const csrf = csrfOf(page.text);
  for (const n of [1, 2]) assert.equal((await B.post('/boutique-ndar/admin/invite', { csrf, name: 'U' + n, email: `u${n}@ndar.sn`, role: 'member' })).status, 303);
  const r = await B.post('/boutique-ndar/admin/invite', { csrf, name: 'U3', email: 'u3@ndar.sn', role: 'member' });
  assert.match(r.text, /Votre formule compte 3 utilisateurs/);
  assert.equal(one("SELECT COUNT(*) n FROM users WHERE tenant_id = (SELECT id FROM tenants WHERE slug='boutique-ndar')").n, 3);
});

test('lockout after 5 wrong attempts, even with the right password afterwards', async () => {
  const b = new Browser();
  for (let i = 0; i < 5; i++) await login(b, 'boutique-ndar', 'moussa@ndar.sn', 'faux-mot-de-passe-1', codeB);
  const r = await login(b, 'boutique-ndar', 'moussa@ndar.sn', 'Dakar2026secure', codeB);
  assert.equal(r.status, 429); assert.match(r.text, /bloqué 15 minutes/);
  run("UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE email = 'moussa@ndar.sn'");
});

test('new company code invalidates the old one', async () => {
  const csrf = csrfOf((await A.get('/teranga/admin')).text);
  const r = await A.post('/teranga/admin/code', { csrf });
  const fresh = codeOf(r.text); assert.ok(fresh); assert.notEqual(fresh, codeA);
  assert.equal((await login(new Browser(), 'teranga', 'awa@teranga.sn', 'Dakar2026secure', codeA)).status, 401);
  assert.equal((await login(new Browser(), 'teranga', 'awa@teranga.sn', 'Dakar2026secure', fresh)).status, 303);
  codeA = fresh;
});

test('password reset by e-mail', async () => {
  const b = new Browser();
  await b.get('/teranga/mot-de-passe-oublie');
  const r = await b.post('/teranga/mot-de-passe-oublie', { pre: b.pre(), email: 'awa@teranga.sn' });
  assert.match(r.text, /Si cette adresse correspond/);
  const unknown = await b.post('/teranga/mot-de-passe-oublie', { pre: b.pre(), email: 'personne@teranga.sn' });
  assert.match(unknown.text, /Si cette adresse correspond/, 'same answer for unknown addresses');
  const link = /\/teranga\/nouveau-mot-de-passe\?token=[\w-]+/.exec(outbox.findLast((m) => m.to === 'awa@teranga.sn').text)[0];
  const token = new URL(base + link).searchParams.get('token');
  await b.get(link);
  assert.equal((await b.post('/teranga/nouveau-mot-de-passe', { pre: b.pre(), token, password: 'Nouveau2026pass', password2: 'Nouveau2026pass' })).status, 303);
  assert.equal((await A.get('/teranga/api/state')).status, 401, 'reset closes existing sessions');
  assert.equal((await login(new Browser(), 'teranga', 'awa@teranga.sn', 'Dakar2026secure', codeA)).status, 401);
  A = new Browser();
  assert.equal((await login(A, 'teranga', 'awa@teranga.sn', 'Nouveau2026pass', codeA)).status, 303);
});

function signed(event, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(event);
  return { payload, header: `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}` };
}
async function webhook(event, secret) {
  const { payload, header } = signed(event, secret);
  return fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
}

test('Stripe webhooks: signature, idempotency, past due grace, cancellation = read only', async () => {
  config.stripe.webhookSecret = 'whsec_test';
  const tid = one("SELECT id FROM tenants WHERE slug = 'teranga'").id;
  run("UPDATE tenants SET stripe_subscription = 'sub_A' WHERE id = ?", tid);
  assert.equal((await webhook({ id: 'evt_bad', type: 'x', data: { object: {} } }, 'whsec_wrong')).status, 400);
  const old = signed({ id: 'evt_old', type: 'x', data: {} }, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': old.header }, body: old.payload })).status, 400, 'replay window');
  const sub = (status, id) => ({ id, type: 'customer.subscription.updated', data: { object: { id: 'sub_A', status, customer: 'cus_A', metadata: { tenant_id: tid }, current_period_end: 1893456000, items: { data: [] } } } });
  assert.equal((await webhook(sub('past_due', 'evt_1'))).status, 200);
  assert.equal(one('SELECT status FROM tenants WHERE id = ?', tid).status, 'past_due');
  assert.equal((await A.get('/teranga/api/state')).json().access, 'grace');
  assert.deepEqual(await (await webhook(sub('past_due', 'evt_1'))).json(), { duplicate: true });
  run("UPDATE tenants SET past_due_since = '2020-01-01T00:00:00.000Z' WHERE id = ?", tid);
  assert.equal((await A.get('/teranga/api/state')).json().access, 'readonly', 'after 7 days of grace');
  await webhook({ ...sub('canceled', 'evt_2'), type: 'customer.subscription.deleted' });
  assert.equal(one('SELECT status FROM tenants WHERE id = ?', tid).status, 'canceled');
  const csrf = csrfOf((await A.get('/teranga')).text);
  const w = await A.req('PUT', '/teranga/api/records/cust000009', { json: { t: 'customer', id: 'cust000009' }, headers: { 'x-csrf-token': csrf } });
  assert.equal(w.status, 402); assert.equal(w.json().code, 'read_only');
  await webhook(sub('active', 'evt_3'));
  assert.equal((await A.get('/teranga/api/state')).json().access, 'ok');
});

test('sign-up with Stripe Checkout (mocked Stripe API)', async () => {
  config.stripe.secretKey = 'sk_test_x';
  config.stripe.prices.pro.month = 'price_pro_m';
  config.stripe.prices.entreprise.month = 'price_ent_m';
  const calls = [];
  stripe.setStripeFetch(async (url, init) => {
    calls.push({ url, body: init.body });
    const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith('/checkout/sessions')) return ok({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const tid = one("SELECT id FROM tenants WHERE slug = 'keur-gui'")?.id;
    if (url.includes('/checkout/sessions/cs_1')) return ok({ id: 'cs_1', status: 'complete', client_reference_id: tid, customer: 'cus_K',
      subscription: { id: 'sub_K', status: 'trialing', customer: 'cus_K', trial_end: 1893456000, current_period_end: 1893456000, items: { data: [{ price: { id: 'price_ent_m' } }] } } });
    if (url.includes('/billing_portal/sessions')) return ok({ url: 'https://billing.stripe.com/p/session/x' });
    return new Response('{"error":{"message":"inconnu"}}', { status: 404 });
  });
  const b = new Browser();
  const r = await signup(b, { company: 'Keur Gui', slug: 'keur-gui', email: 'fatou@keurgui.sn', name: 'Fatou' });
  assert.equal(r.status, 303); assert.equal(r.location, 'https://checkout.stripe.com/c/pay/cs_1');
  const sent = new URLSearchParams(calls[0].body);
  assert.equal(sent.get('mode'), 'subscription'); assert.equal(sent.get('line_items[0][price]'), 'price_pro_m'); assert.equal(sent.get('subscription_data[trial_period_days]'), '14');
  assert.equal(one("SELECT status FROM tenants WHERE slug = 'keur-gui'").status, 'pending');
  // before payment: the admin may log in (no code yet) and only to finish paying; the app is closed
  const pre = new Browser();
  assert.equal((await login(pre, 'keur-gui', 'fatou@keurgui.sn', 'Dakar2026secure', '')).location, '/keur-gui/admin');
  assert.match((await pre.get('/keur-gui/admin')).text, /Paiement à finaliser/);
  assert.equal((await pre.get('/keur-gui')).location, '/keur-gui/admin');
  // forged success page from another browser: refused
  assert.equal((await new Browser().get('/inscription/terminee?session_id=cs_1')).status, 403);
  const done = await b.get('/inscription/terminee?session_id=cs_1');
  assert.equal(done.status, 200);
  const code = codeOf(done.text); assert.ok(code);
  const t = one("SELECT * FROM tenants WHERE slug = 'keur-gui'");
  assert.equal(t.status, 'trialing'); assert.equal(t.plan, 'entreprise', 'plan follows the Stripe price'); assert.equal(t.seats, 50); assert.equal(t.stripe_customer, 'cus_K');
  const a = new Browser();
  assert.equal((await login(a, 'keur-gui', 'fatou@keurgui.sn', 'Dakar2026secure', '')).status, 401, 'code now required');
  assert.equal((await login(a, 'keur-gui', 'fatou@keurgui.sn', 'Dakar2026secure', code)).location, '/keur-gui');
  const csrf = csrfOf((await a.get('/keur-gui/admin')).text);
  assert.equal((await a.post('/keur-gui/admin/abonnement', { csrf })).location, 'https://billing.stripe.com/p/session/x');
  config.stripe.secretKey = '';
});

test('AI proxy: plan gating, key never exposed, tool round trip', async () => {
  config.ai.anthropicKey = 'sk-ant-test';
  let seen;
  setAiFetch(async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Bonjour' }], stop_reason: 'end_turn' }), { status: 200 }); });
  const csrfB = csrfOf((await B.get('/boutique-ndar')).text);
  const rb = await B.req('POST', '/boutique-ndar/api/ai', { json: { messages: [{ role: 'user', content: 'x' }] }, headers: { 'x-csrf-token': csrfB } });
  assert.equal(rb.status, 403, 'Essentiel has no AI');
  const app = await A.get('/teranga'); const csrf = csrfOf(app.text);
  assert.ok(!app.text.includes('sk-ant-test'));
  const r = await A.req('POST', '/teranga/api/ai', { json: { tier: 'quick', messages: [{ role: 'user', content: 'Bonjour ?' }], tools: [{ name: 'liste', description: 'd', input_schema: { type: 'object', properties: {} } }] }, headers: { 'x-csrf-token': csrf } });
  assert.equal(r.status, 200); assert.equal(r.json().content[0].text, 'Bonjour');
  const sent = JSON.parse(seen.init.body);
  assert.equal(sent.model, config.ai.quickModel); assert.equal(seen.init.headers['x-api-key'], 'sk-ant-test'); assert.equal(sent.tools[0].name, 'liste');
  assert.equal((await A.req('POST', '/teranga/api/ai', { json: { messages: [{ role: 'system', content: 'x' }] }, headers: { 'x-csrf-token': csrf } })).status, 400);
  config.ai.anthropicKey = '';
});

test('support requests reach the platform console; platform can suspend', async () => {
  const csrf = csrfOf((await A.get('/teranga')).text);
  const tk = { id: 'abc123def456', subject: 'Question TVA', category: 'question', status: 'open', createdAt: new Date().toISOString(), statusAt: new Date().toISOString(), messages: [{ at: new Date().toISOString(), text: 'Bonjour' }] };
  assert.equal((await A.req('PUT', '/teranga/api/support', { json: { tickets: [tk] }, headers: { 'x-csrf-token': csrf } })).status, 200);
  assert.ok(outbox.findLast((m) => m.to === config.supportEmail && /Question TVA/.test(m.subject)));
  run('INSERT INTO platform_admins (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', sec.newId(), 'ops@jumtoo.com', 'Ops', sec.hashSecret('Plateforme2026!'), new Date().toISOString());
  const p = new Browser();
  await p.get('/plateforme');
  assert.equal((await p.post('/plateforme/connexion', { pre: p.pre(), email: 'ops@jumtoo.com', password: 'faux' })).status, 401);
  assert.equal((await p.post('/plateforme/connexion', { pre: p.pre(), email: 'ops@jumtoo.com', password: 'Plateforme2026!' })).status, 303);
  const home = await p.get('/plateforme');
  assert.match(home.text, /Teranga Services/); assert.match(home.text, /Question TVA/);
  const pcsrf = csrfOf(home.text);
  const tid = one("SELECT id FROM tenants WHERE slug = 'teranga'").id; const uid = one("SELECT id FROM users WHERE email = 'awa@teranga.sn'").id;
  assert.equal((await p.post(`/plateforme/support/${tid}/${uid}/abc123def456`, { csrf: pcsrf, text: 'Voici la réponse', status: 'resolved' })).status, 303);
  const mine = (await A.get('/teranga/api/support')).json();
  assert.equal(mine.replies.abc123def456.messages[0].text, 'Voici la réponse');
  assert.equal((await p.post('/plateforme/suspendre', { csrf: pcsrf, tenant: tid })).status, 303);
  assert.equal((await A.get('/teranga/api/state')).status, 401, 'sessions closed');
  const r = await login(new Browser(), 'teranga', 'awa@teranga.sn', 'Nouveau2026pass', codeA);
  assert.equal(r.status, 403); assert.match(r.text, /suspendu/);
  await p.post('/plateforme/reactiver', { csrf: pcsrf, tenant: tid });
  assert.equal(one('SELECT status FROM tenants WHERE id = ?', tid).status, 'active');
  assert.equal((await new Browser().post('/plateforme/suspendre', { tenant: tid })).status, 401, 'platform actions need a session');
});

test('public help centre: index, search, articles, contact form, platform reply', async () => {
  const b = new Browser();
  const idx = await b.get('/aide');
  assert.equal(idx.status, 200); assert.match(idx.text, /Centre d’aide/); assert.match(idx.text, /Code entreprise perdu/);
  const s1 = await b.get('/aide?q=code+entreprise');
  assert.match(s1.text, /Générer un nouveau code entreprise/); assert.match(s1.text, /Le support peut-il me donner le code/);
  assert.match((await b.get('/aide?q=zzzxq')).text, /Aucun article ne correspond/);
  assert.match((await b.get('/aide?q=%3Cscript%3E')).text, /« &lt;script&gt; »/, 'query escaped');
  const art = await b.get('/aide/se-connecter');
  assert.equal(art.status, 200); assert.match(art.text, /Code entreprise \(cryptogramme\)/);
  assert.equal((await b.get('/aide/inconnu')).status, 404);
  assert.match((await b.get('/')).text, /href="\/aide"/);
  assert.match((await b.get('/teranga/connexion')).text, /href="\/aide"/);
  // contact form
  const form = await b.get('/aide/contact?sujet=Se%20connecter');
  assert.match(form.text, /value="Se connecter"/);
  const base = { pre: b.pre(), name: 'Mariama Sow', email: 'mariama@exemple.sn', slug: 'teranga', category: 'connexion', subject: 'Accès bloqué', message: 'Je n’arrive plus à me connecter depuis ce matin.' };
  assert.equal((await b.post('/aide/contact', { ...base, pre: '' })).status, 403);
  assert.equal((await b.post('/aide/contact', { ...base, email: 'x' })).status, 400);
  assert.equal((await b.post('/aide/contact', { ...base, message: 'court' })).status, 400);
  const before = one('SELECT COUNT(*) n FROM contact_requests').n;
  const bot = await b.post('/aide/contact', { ...base, website: 'http://spam' });
  assert.match(bot.text, /Message envoyé/); assert.equal(one('SELECT COUNT(*) n FROM contact_requests').n, before, 'honeypot not stored');
  const ok = await b.post('/aide/contact', { ...base, slug: 'www.jumtoo.com/teranga' });
  assert.equal(ok.status, 200); assert.match(ok.text, /Message envoyé/);
  const c = one('SELECT * FROM contact_requests ORDER BY created_at DESC LIMIT 1');
  assert.equal(c.slug, 'teranga'); assert.equal(c.status, 'open');
  assert.ok(outbox.findLast((m) => m.to === config.supportEmail && /Accès bloqué/.test(m.subject) && /Teranga Services/.test(m.text)));
  assert.ok(outbox.findLast((m) => m.to === 'mariama@exemple.sn' && /bien reçu/.test(m.subject)));
  for (let i = 0; i < 4; i++) await b.post('/aide/contact', base);
  assert.equal((await b.post('/aide/contact', base)).status, 429, 'rate limited');
  // platform reply
  const p = new Browser(); await p.get('/plateforme');
  await p.post('/plateforme/connexion', { pre: p.pre(), email: 'ops@jumtoo.com', password: 'Plateforme2026!' });
  const home = await p.get('/plateforme'); assert.match(home.text, /Accès bloqué/);
  assert.equal((await new Browser().get('/plateforme/contact/' + c.id)).location, '/plateforme');
  const page = await p.get('/plateforme/contact/' + c.id); assert.match(page.text, /mariama@exemple\.sn/);
  assert.equal((await p.post('/plateforme/contact/' + c.id, { csrf: csrfOf(home.text), text: 'Votre compte est débloqué.', close: '1' })).status, 303);
  assert.equal(one('SELECT status FROM contact_requests WHERE id = ?', c.id).status, 'answered');
  assert.ok(outbox.findLast((m) => m.to === 'mariama@exemple.sn' && /Re: Accès bloqué/.test(m.subject) && /débloqué/.test(m.text)));
});
