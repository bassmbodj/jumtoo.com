// Server-rendered pages (French). Same palette as the app: blue and white, dark when the device is dark.
import { config, PLANS } from './config.js';
import { DOCS, DOC_SECTIONS, DOC_FAQ } from './docs.js';


export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Jumtoo logo (proposition A), white lettering for the dark header.
export const LOGO = `<svg viewBox="-12 -4 418 148" role="img" aria-label="Jumtoo"><title>Jumtoo</title><g fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M20 40 V114 Q20 132 2 132"/><path d="M44 40 V76 A24 24 0 0 0 92 76 V40 M92 76 V100"/><path d="M116 100 V40 M116 62 A22 22 0 0 1 160 62 V100 M160 62 A22 22 0 0 1 204 62 V100"/><path d="M240 18 V84 A16 16 0 0 0 256 100 H262 M226 44 H260"/></g><circle cx="20" cy="16" r="9" fill="#fff"/><g fill="none" stroke-width="14" stroke-linecap="round"><circle cx="308" cy="70" r="30" stroke="#5b9bff"/><circle cx="364" cy="70" r="30" stroke="#f28c28"/></g></svg>`;
export const FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgMTYwIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9Ikp1bXRvbyI+PHJlY3Qgd2lkdGg9IjE2MCIgaGVpZ2h0PSIxNjAiIHJ4PSIzOCIgZmlsbD0iIzBGMUIyRCIvPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjU2IDEwKSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj4KPGNpcmNsZSBjeD0iMzA4IiBjeT0iNzAiIHI9IjMwIiBzdHJva2U9IiM1QjlCRkYiLz48Y2lyY2xlIGN4PSIzNjQiIGN5PSI3MCIgcj0iMzAiIHN0cm9rZT0iI0YyOEMyOCIvPjwvZz48L2c+PC9zdmc+';
const brandMark = () => (config.brand === 'Jumtoo' ? LOGO : `<i>${esc(config.brand.slice(0, 1))}</i>${esc(config.brand)}`);
const money = (v, cur) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);

const CSS = `
:root{--bg:#f3f6fb;--surface:#fff;--ink:#0f1b2d;--muted:#56657c;--line:#d9e1ec;--accent:#1a56c9;--accent-soft:#e5eefc;--accent-ink:#fff;--side:#0b2a5e;--side-ink:#e3ecfb;--good:#1d7a3d;--good-soft:#e3f3e7;--warn:#9a5a00;--warn-soft:#fbefd9;--crit:#b42318;--crit-soft:#fbe5e2;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b1220;--surface:#121b2c;--ink:#e4ebf6;--muted:#93a3bc;--line:#24314a;--accent:#5b9bff;--accent-soft:#15284d;--accent-ink:#061024;--side:#08101e;--side-ink:#dbe6fa;--good:#5cc581;--good-soft:#15291c;--warn:#e4a94a;--warn-soft:#2d2213;--crit:#f0786c;--crit-soft:#331816;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0b1220;--surface:#121b2c;--ink:#e4ebf6;--muted:#93a3bc;--line:#24314a;--accent:#5b9bff;--accent-soft:#15284d;--accent-ink:#061024;--side:#08101e;--side-ink:#dbe6fa;--good:#5cc581;--good-soft:#15291c;--warn:#e4a94a;--warn-soft:#2d2213;--crit:#f0786c;--crit-soft:#331816;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "IBM Plex Sans","Segoe UI",system-ui,sans-serif}
h1,h2,h3{font-family:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;margin:0 0 .4em;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:clamp(26px,4vw,40px)}h2{font-size:20px}a{color:var(--accent)}
header.top{background:var(--side);color:var(--side-ink)}header.top .in{max-width:1080px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;color:var(--side-ink);text-decoration:none;font-family:"Bricolage Grotesque",system-ui;font-weight:700;font-size:20px}
.brand svg{display:block;height:30px;width:auto}
.brand i{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px;background:#1a56c9;color:#fff;font-style:normal;font-size:15px}
header.top nav{display:flex;gap:14px;align-items:center;flex-wrap:wrap}header.top nav a{color:var(--side-ink);text-decoration:none;font-size:14px}
main{max-width:1080px;margin:0 auto;padding:28px 20px 60px}.narrow{max-width:460px;margin:0 auto}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:22px;margin-bottom:16px}
.muted{color:var(--muted)}.small{font-size:13px}
label{display:block;font-weight:500;font-size:14px;margin:12px 0 4px}
input,select{width:100%;font:inherit;color:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
input:focus,select:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:500;padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.danger{color:var(--crit)}.btn.sm{padding:5px 10px;font-size:13px}.btn.block{width:100%;margin-top:16px}
.banner{padding:12px 14px;border-radius:8px;margin:0 0 16px;background:var(--accent-soft)}.banner.err{background:var(--crit-soft);color:var(--crit)}.banner.ok{background:var(--good-soft);color:var(--good)}.banner.warn{background:var(--warn-soft);color:var(--warn)}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px;margin:20px 0}
.plan{display:flex;flex-direction:column}.plan.hl{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.price{font:600 30px/1.1 "IBM Plex Mono",ui-monospace,monospace;margin:8px 0}.price small{font-size:13px;color:var(--muted);font-family:inherit}
.plan ul{padding-left:18px;margin:10px 0 18px;flex:1}.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-weight:600}
.toggle{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--surface)}.toggle a{padding:6px 14px;text-decoration:none;color:var(--ink);font-size:14px}.toggle a[aria-current]{background:var(--accent);color:var(--accent-ink)}
.code{font:600 28px/1.2 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;background:var(--accent-soft);color:var(--accent);padding:14px 18px;border-radius:10px;text-align:center;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:500}
.tw{overflow-x:auto}.pill{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--bg);color:var(--muted)}.pill.ok{background:var(--good-soft);color:var(--good)}.pill.warn{background:var(--warn-soft);color:var(--warn)}.pill.err{background:var(--crit-soft);color:var(--crit)}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:0 14px}.inline{display:inline}
.prefix{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--surface);overflow:hidden}.prefix span{padding:10px 0 10px 12px;color:var(--muted);white-space:nowrap}.prefix input{border:0;padding-left:2px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px;margin-bottom:16px}.kpi .v{font:600 22px "IBM Plex Mono",monospace}
footer{text-align:center;color:var(--muted);font-size:13px;padding:30px 20px}`;

export function layout({ title, body, nav = '', status = 200, head = '' }) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#0b2a5e" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#08101e" media="(prefers-color-scheme: dark)">
<title>${esc(title)} · ${esc(config.brand)}</title><link rel="icon" type="image/svg+xml" href="${FAVICON}">
<script>try{var t=localStorage.getItem('pme-suite.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${CSS}</style>${head}</head><body>
<header class="top"><div class="in"><a class="brand" href="/" aria-label="${esc(config.brand)}, accueil">${brandMark()}</a><nav>${nav}</nav></div></header>
<main>${body}</main>
<footer>${esc(config.brand)} · CRM, facturation, stock et comptabilité pour les entreprises · <a href="/aide">Centre d’aide</a> · <a href="/aide/contact">Contact</a></footer>
</body></html>`;
  return { status, html };
}

const field = (name, label, attrs = '', value = '') => `<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value)}" ${attrs}>`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${esc(value)}">`;
const alert = (msg, kind = 'err') => (msg ? `<div class="banner ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(msg)}</div>` : '');

export function homePage({ interval = 'month' }) {
  const iv = interval === 'year' ? 'year' : 'month';
  const plans = Object.entries(PLANS).map(([k, p]) => `<section class="card plan ${p.highlight ? 'hl' : ''}">
      ${p.highlight ? '<span class="tag">Le plus choisi</span>' : ''}<h2>${esc(p.name)}</h2>
      <div class="price">${money(iv === 'year' ? p.year : p.month, p.currency)} <small>HT / ${iv === 'year' ? 'an' : 'mois'}</small></div>
      <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <a class="btn ${p.highlight ? 'primary' : ''}" href="/inscription?plan=${k}&amp;interval=${iv}">Essayer ${config.stripe.trialDays || 0} jours</a></section>`).join('');
  return layout({ title: 'Gestion d’entreprise en ligne', nav: '<a href="#tarifs">Tarifs</a><a href="/aide">Aide</a><a href="/inscription">Créer mon entreprise</a>',
    body: `<section style="padding:20px 0 10px"><h1>Clients, factures, stock et comptabilité.<br>Une adresse pour votre entreprise.</h1>
      <p class="muted" style="max-width:640px">Chaque entreprise a son espace privé sur <strong>${esc(new URL(config.baseUrl).host)}/nom-entreprise</strong>, son administrateur et ses utilisateurs. Facturation conforme, TVA, mobile money, plan SYSCOHADA ou PCG, en 5 langues.</p>
      <p><a class="btn primary" href="/inscription?plan=pro&amp;interval=${iv}">Créer mon entreprise</a> <span class="muted small">Déjà client ? Ouvrez l’adresse de votre entreprise.</span></p></section>
      <h2 id="tarifs" style="margin-top:30px">Tarifs</h2>
      <div class="toggle" role="group" aria-label="Période"><a href="/?interval=month#tarifs" ${iv === 'month' ? 'aria-current="true"' : ''}>Mensuel</a><a href="/?interval=year#tarifs" ${iv === 'year' ? 'aria-current="true"' : ''}>Annuel · 2 mois offerts</a></div>
      <div class="plans">${plans}</div>
      <p class="muted small">Paiement par carte bancaire via Stripe. Sans engagement : résiliez quand vous voulez depuis votre espace administrateur.</p>` });
}

export function signupPage({ v = {}, error = '', pre, countries }) {
  const plan = PLANS[v.plan] ? v.plan : 'pro';
  const iv = v.interval === 'year' ? 'year' : 'month';
  return layout({ title: 'Créer mon entreprise', nav: '<a href="/#tarifs">Tarifs</a>', body: `<div class="narrow">
    <h1>Créer mon entreprise</h1><p class="muted">Vous serez l’administrateur de l’espace. Paiement à l’étape suivante${config.stripe.trialDays ? ` : ${config.stripe.trialDays} jours d’essai, rien n’est prélevé avant la fin` : ''}.</p>
    ${alert(error)}
    <form method="post" action="/inscription" class="card" novalidate>
      ${hidden('pre', pre)}
      <div class="row"><div><label for="f-plan">Formule</label><select id="f-plan" name="plan">${Object.entries(PLANS).map(([k, p]) => `<option value="${k}" ${k === plan ? 'selected' : ''}>${esc(p.name)} — ${p.seats} utilisateurs</option>`).join('')}</select></div>
        <div><label for="f-interval">Facturation</label><select id="f-interval" name="interval"><option value="month" ${iv === 'month' ? 'selected' : ''}>Mensuelle</option><option value="year" ${iv === 'year' ? 'selected' : ''}>Annuelle</option></select></div></div>
      ${field('company', 'Nom de l’entreprise', 'required maxlength="80" autocomplete="organization"', v.company)}
      <label for="f-slug">Adresse de votre espace</label>
      <div class="prefix"><span>${esc(new URL(config.baseUrl).host)}/</span><input id="f-slug" name="slug" required maxlength="40" pattern="[a-z0-9-]{3,40}" value="${esc(v.slug)}" autocapitalize="off" spellcheck="false" aria-describedby="slug-help"></div>
      <div id="slug-help" class="small muted">Lettres minuscules, chiffres et tirets. Exemple : teranga-services</div>
      <label for="f-country">Pays</label><select id="f-country" name="country">${countries.map(([k, n]) => `<option value="${k}" ${k === (v.country || 'SN') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <h2 style="margin-top:22px">Administrateur</h2>
      ${field('name', 'Nom et prénom', 'required maxlength="80" autocomplete="name"', v.name)}
      ${field('email', 'Adresse e-mail (votre nom d’utilisateur)', 'type="email" required maxlength="254" autocomplete="email"', v.email)}
      ${field('password', 'Mot de passe', 'type="password" required minlength="10" autocomplete="new-password" aria-describedby="pw-help"')}
      <div id="pw-help" class="small muted">10 caractères minimum, avec des lettres et des chiffres.</div>
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="checkbox" name="terms" value="1" style="width:auto;margin-top:4px" required> J’accepte les conditions générales et la politique de confidentialité.</label>
      <button class="btn primary block">Continuer vers le paiement</button>
    </form></div>
    <script>(function(){var c=document.getElementById('f-company'),s=document.getElementById('f-slug'),touched=!!s.value;s.addEventListener('input',function(){touched=true});
    c.addEventListener('input',function(){if(touched)return;s.value=c.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/&/g,'-et-').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)})})()</script>` });
}

export function signupDonePage({ tenant, code, emailSent, error }) {
  const url = `${config.baseUrl}/${tenant.slug}`;
  return layout({ title: 'Entreprise créée', body: `<div class="narrow">${alert(error)}
    <div class="card"><h1>${esc(tenant.name)} est prête</h1>
    <p>Adresse de votre espace : <a href="/${esc(tenant.slug)}"><strong>${esc(url)}</strong></a></p>
    ${code ? `<p>Code entreprise (cryptogramme) à saisir à chaque connexion, avec l’e-mail et le mot de passe :</p><div class="code" aria-label="Code entreprise">${esc(code)}</div>
    <div class="banner warn">Notez ce code maintenant : il ne sera plus affiché. Vous pourrez en générer un nouveau depuis l’administration.</div>
    <p class="small muted">Communiquez-le à vos collaborateurs avec l’adresse de l’espace. Chacun se connecte avec son propre e-mail et son mot de passe.</p>` : ''}
    <a class="btn primary block" href="/${esc(tenant.slug)}">Ouvrir mon espace</a></div></div>` });
}

export function messagePage(title, msg, link = null, status = 200) {
  return layout({ title, status, body: `<div class="narrow card"><h1>${esc(title)}</h1><p>${esc(msg)}</p>${link ? `<a class="btn primary" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</div>` });
}

export function loginPage({ tenant, pre, error = '', info = '', email = '' }) {
  return layout({ title: `Connexion — ${tenant.name}`, body: `<div class="narrow">
    <h1>${esc(tenant.name)}</h1><p class="muted">Connexion à l’espace de l’entreprise</p>
    ${alert(error)}${alert(info, 'ok')}
    <form method="post" action="/${esc(tenant.slug)}/connexion" class="card">
      ${hidden('pre', pre)}
      ${field('email', 'Nom d’utilisateur (adresse e-mail)', 'type="email" required autocomplete="username" autofocus', email)}
      ${field('password', 'Mot de passe', 'type="password" required autocomplete="current-password"')}
      ${field('code', 'Code entreprise (cryptogramme)', 'required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" maxlength="12" inputmode="text"')}
      <button class="btn primary block">Se connecter</button>
      <p class="small" style="margin:14px 0 0"><a href="/${esc(tenant.slug)}/mot-de-passe-oublie">Mot de passe oublié ?</a> · <span class="muted">Code entreprise perdu : demandez-le à votre administrateur.</span> · <a href="/aide">Aide</a></p>
    </form></div>` });
}

export function forgotPage({ tenant, pre, sent = false }) {
  return layout({ title: 'Mot de passe oublié', body: `<div class="narrow"><h1>Mot de passe oublié</h1>
    ${sent ? alert('Si cette adresse correspond à un compte de l’entreprise, un lien de réinitialisation vient d’être envoyé. Il est valable 1 heure.', 'ok') : ''}
    <form method="post" action="/${esc(tenant.slug)}/mot-de-passe-oublie" class="card">${hidden('pre', pre)}
      ${field('email', 'Adresse e-mail', 'type="email" required autocomplete="email"')}
      <button class="btn primary block">Recevoir un lien</button>
      <p class="small"><a href="/${esc(tenant.slug)}/connexion">Retour à la connexion</a></p></form></div>` });
}

export function setPasswordPage({ tenant, pre, token, error = '', invite = false, user }) {
  return layout({ title: invite ? 'Activer mon compte' : 'Nouveau mot de passe', body: `<div class="narrow">
    <h1>${invite ? 'Bienvenue chez ' + esc(tenant.name) : 'Nouveau mot de passe'}</h1>
    ${user ? `<p class="muted">Compte : ${esc(user.email)}</p>` : ''}${alert(error)}
    <form method="post" action="/${esc(tenant.slug)}/${invite ? 'invitation' : 'nouveau-mot-de-passe'}" class="card">${hidden('pre', pre)}${hidden('token', token)}
      ${field('password', 'Mot de passe', 'type="password" required minlength="10" autocomplete="new-password"')}
      ${field('password2', 'Confirmer le mot de passe', 'type="password" required minlength="10" autocomplete="new-password"')}
      <p class="small muted">10 caractères minimum, avec des lettres et des chiffres.${invite ? ' Pour vous connecter, il vous faudra aussi le code entreprise que votre administrateur vous a communiqué.' : ''}</p>
      <button class="btn primary block">${invite ? 'Activer mon compte' : 'Enregistrer'}</button></form></div>` });
}

const ROLE_LABEL = { admin: 'Administrateur', member: 'Utilisateur', reader: 'Lecture seule' };
const STATUS_LABEL = { pending: ['Paiement en attente', 'warn'], trialing: ['Essai gratuit', 'ok'], active: ['Actif', 'ok'], past_due: ['Paiement en retard', 'warn'], canceled: ['Résilié', 'err'], suspended: ['Suspendu', 'err'] };
export const statusPill = (s) => `<span class="pill ${STATUS_LABEL[s]?.[1] || ''}">${esc(STATUS_LABEL[s]?.[0] || s)}</span>`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function adminPage({ tenant, me, users, csrf, flash = '', error = '', newCode = '', audit = [], billing }) {
  const plan = PLANS[tenant.plan];
  const active = users.filter((u) => u.status !== 'disabled').length;
  const S = tenant.slug;
  const form = (action, inner, cls = 'inline') => `<form method="post" action="/${esc(S)}/admin/${action}" class="${cls}">${hidden('csrf', csrf)}${inner}</form>`;
  return layout({ title: `Administration — ${tenant.name}`, nav: `<a href="/${esc(S)}">Ouvrir l’application</a><a href="/aide#admin">Aide administrateur</a><span class="small">${esc(me.email)}</span>${form('../deconnexion', '<button class="btn sm">Se déconnecter</button>')}`,
    body: `<h1>Administration</h1><p class="muted">${esc(tenant.name)} · ${esc(config.baseUrl.replace(/^https?:\/\//, ''))}/${esc(S)}</p>
    ${alert(flash, 'ok')}${alert(error)}
    ${newCode ? `<div class="card"><h2>Nouveau code entreprise</h2><div class="code">${esc(newCode)}</div><div class="banner warn">L’ancien code ne fonctionne plus. Notez celui-ci et communiquez-le à vos collaborateurs : il ne sera plus affiché.</div></div>` : ''}
    <div class="kpis">
      <div class="card kpi"><div class="muted small">Formule</div><div class="v">${esc(plan?.name || tenant.plan)}</div><div class="small">${statusPill(tenant.status)}</div></div>
      <div class="card kpi"><div class="muted small">Utilisateurs</div><div class="v">${active} / ${tenant.seats}</div><div class="small muted">comptes actifs ou invités</div></div>
      <div class="card kpi"><div class="muted small">${tenant.status === 'trialing' ? 'Fin de l’essai' : 'Prochaine échéance'}</div><div class="v" style="font-size:18px">${fmtDate(tenant.status === 'trialing' ? tenant.trial_end : tenant.current_period_end)}</div></div>
    </div>
    <section class="card"><h2>Utilisateurs</h2><div class="tw"><table><thead><tr><th>Nom</th><th>E-mail (identifiant)</th><th>Rôle</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
        <td>${u.id === me.id ? esc(ROLE_LABEL[u.role]) : form('role', `${hidden('user', u.id)}<select name="role" aria-label="Rôle de ${esc(u.name)}" onchange="this.form.submit()">${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select><noscript><button class="btn sm">OK</button></noscript>`)}</td>
        <td>${u.status === 'active' ? '<span class="pill ok">Actif</span>' : u.status === 'invited' ? '<span class="pill warn">Invitation envoyée</span>' : '<span class="pill err">Désactivé</span>'}${u.locked ? ' <span class="pill err">Bloqué 15 min</span>' : ''}</td>
        <td class="small muted">${fmtDate(u.last_login)}</td>
        <td style="white-space:nowrap">${u.id === me.id ? '<span class="small muted">Vous</span>' : `
          ${u.status === 'invited' ? form('resend', `${hidden('user', u.id)}<button class="btn sm">Renvoyer l’invitation</button>`) : ''}
          ${u.status === 'active' ? form('reset', `${hidden('user', u.id)}<button class="btn sm">Réinitialiser le mot de passe</button>`) : ''}
          ${u.status === 'disabled' ? form('enable', `${hidden('user', u.id)}<button class="btn sm">Réactiver</button>`) : form('disable', `${hidden('user', u.id)}<button class="btn sm danger">Désactiver</button>`)}`}</td></tr>`).join('')}
    </tbody></table></div>
    <h3 style="margin-top:20px">Inviter un utilisateur</h3>
    ${active >= tenant.seats ? `<div class="banner warn">Votre formule compte ${tenant.seats} utilisateurs : désactivez un compte ou passez à la formule supérieure.</div>` : form('invite', `<div class="row">
      <div><label for="i-name">Nom</label><input id="i-name" name="name" required maxlength="80"></div>
      <div><label for="i-email">E-mail</label><input id="i-email" name="email" type="email" required maxlength="254"></div>
      <div><label for="i-role">Rôle</label><select id="i-role" name="role">${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${k === 'member' ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <button class="btn primary" style="margin-top:12px">Envoyer l’invitation</button>`, '')}
    <p class="small muted">L’invité reçoit un lien valable 7 jours pour choisir son mot de passe. Communiquez-lui aussi le code entreprise.</p></section>
    <section class="card"><h2>Code entreprise (cryptogramme)</h2>
      <p>Il est demandé à chaque connexion, en plus de l’e-mail et du mot de passe. Il n’est jamais affiché après sa création : générez-en un nouveau s’il est perdu ou si un collaborateur quitte l’entreprise.</p>
      ${form('code', '<button class="btn" onclick="return confirm(\'Générer un nouveau code ? L’ancien cessera immédiatement de fonctionner.\')">Générer un nouveau code</button>')}</section>
    <section class="card"><h2>Abonnement</h2>
      <p>Formule <strong>${esc(plan?.name || tenant.plan)}</strong> (${tenant.interval === 'year' ? 'annuelle' : 'mensuelle'}) · ${statusPill(tenant.status)}</p>
      ${billing ? form('abonnement', '<button class="btn primary">Gérer l’abonnement et les factures</button>') + '<p class="small muted">Changer de formule, mettre à jour la carte, télécharger les factures ou résilier, sur la page sécurisée de Stripe.</p>' : '<p class="small muted">Paiement en ligne non configuré sur ce serveur.</p>'}</section>
    <section class="card"><h2>Journal de sécurité</h2><div class="tw"><table><tbody>${audit.map((a) => `<tr><td class="small muted" style="white-space:nowrap">${new Date(a.at).toLocaleString('fr-FR')}</td><td>${esc(a.action)}</td><td class="small muted">${esc(a.detail)}</td></tr>`).join('') || '<tr><td class="muted">Aucun évènement.</td></tr>'}</tbody></table></div></section>` });
}

export function platformLoginPage({ pre, error = '' }) {
  return layout({ title: 'Plateforme', body: `<div class="narrow"><h1>Console plateforme</h1>${alert(error)}
    <form method="post" action="/plateforme/connexion" class="card">${hidden('pre', pre)}
      ${field('email', 'E-mail', 'type="email" required autocomplete="username"')}${field('password', 'Mot de passe', 'type="password" required autocomplete="current-password"')}
      <button class="btn primary block">Se connecter</button></form></div>` });
}

export function platformPage({ tenants, csrf, admin, flash = '', tickets = [], contacts = [] }) {
  const mrr = tenants.filter((t) => ['active', 'trialing', 'past_due'].includes(t.status)).reduce((s, t) => s + (t.interval === 'year' ? (PLANS[t.plan]?.year || 0) / 12 : PLANS[t.plan]?.month || 0), 0);
  const form = (action, inner) => `<form method="post" action="/plateforme/${action}" class="inline">${hidden('csrf', csrf)}${inner}</form>`;
  return layout({ title: 'Plateforme', nav: `<span class="small">${esc(admin.email)}</span>${form('deconnexion', '<button class="btn sm">Se déconnecter</button>')}`,
    body: `<h1>Console plateforme</h1>${alert(flash, 'ok')}
    <div class="kpis"><div class="card kpi"><div class="muted small">Entreprises</div><div class="v">${tenants.length}</div></div>
      <div class="card kpi"><div class="muted small">Payantes ou en essai</div><div class="v">${tenants.filter((t) => ['active', 'trialing'].includes(t.status)).length}</div></div>
      <div class="card kpi"><div class="muted small">Revenu mensuel estimé</div><div class="v">${money(Math.round(mrr), 'XOF')}</div></div>
      <div class="card kpi"><div class="muted small">Demandes à traiter</div><div class="v">${tickets.filter((t) => t.open).length + contacts.filter((c) => c.status === 'open').length}</div></div></div>
    <section class="card"><h2>Entreprises</h2><div class="tw"><table><thead><tr><th>Entreprise</th><th>Adresse</th><th>Formule</th><th>État</th><th>Utilisateurs</th><th>Créée le</th><th></th></tr></thead><tbody>
    ${tenants.map((t) => `<tr><td>${esc(t.name)}</td><td><a href="/${esc(t.slug)}/connexion">/${esc(t.slug)}</a></td><td>${esc(PLANS[t.plan]?.name || t.plan)} · ${t.interval === 'year' ? 'an' : 'mois'}</td><td>${statusPill(t.status)}</td><td>${t.users} / ${t.seats}</td><td class="small muted">${fmtDate(t.created_at)}</td>
      <td>${t.status === 'suspended' ? form('reactiver', `${hidden('tenant', t.id)}<button class="btn sm">Réactiver</button>`) : form('suspendre', `${hidden('tenant', t.id)}<button class="btn sm danger" onclick="return confirm('Suspendre ${esc(t.name)} ? Ses utilisateurs ne pourront plus se connecter.')">Suspendre</button>`)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune entreprise.</td></tr>'}
    </tbody></table></div></section>
    <section class="card"><h2>Messages du formulaire de contact</h2><div class="tw"><table><thead><tr><th>De</th><th>Espace</th><th>Objet</th><th>État</th><th>Reçu le</th></tr></thead><tbody>
    ${contacts.map((c) => `<tr><td>${esc(c.name)}<div class="small muted">${esc(c.email)}</div></td><td>${c.slug ? '/' + esc(c.slug) : '—'}</td><td><a href="/plateforme/contact/${esc(c.id)}">${esc(c.subject)}</a></td><td>${c.status === 'open' ? '<span class="pill warn">À traiter</span>' : '<span class="pill">Traité</span>'}</td><td class="small muted">${fmtDate(c.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun message.</td></tr>'}
    </tbody></table></div></section>
    <section class="card"><h2>Demandes de support</h2><div class="tw"><table><thead><tr><th>Entreprise</th><th>Utilisateur</th><th>Objet</th><th>État</th><th>Dernier message</th></tr></thead><tbody>
    ${tickets.map((t) => `<tr><td>${esc(t.tenant)}</td><td>${esc(t.user)}</td><td><a href="/plateforme/support/${esc(t.tenantId)}/${esc(t.userId)}/${esc(t.id)}">${esc(t.subject)}</a></td><td>${t.open ? '<span class="pill warn">À traiter</span>' : '<span class="pill">Traitée</span>'}</td><td class="small muted">${fmtDate(t.at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucune demande.</td></tr>'}
    </tbody></table></div><p class="small muted">Ouvrez une demande pour lire l’échange et répondre : l’utilisateur voit la réponse dans Aide et support et la reçoit par e-mail.</p></section>` });
}

/* ------------------------------------------------------- help centre --- */
const HELP_NAV = '<a href="/aide">Aide</a><a href="/aide/contact">Contact</a><a href="/#tarifs">Tarifs</a>';
const helpSearch = (q = '') => `<form method="get" action="/aide" role="search" class="help-search"><label for="hq" class="sr">Rechercher dans l’aide</label>
  <input id="hq" name="q" type="search" value="${esc(q)}" placeholder="Rechercher : code entreprise, mot de passe, facture…" maxlength="100"><button class="btn primary">Rechercher</button></form>`;
const HELP_CSS = `<style>.help-search{display:flex;gap:8px;margin:14px 0 22px}.help-search input{flex:1}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:16px}.sections ul{list-style:none;padding:0;margin:8px 0 0}.sections li{padding:7px 0;border-top:1px solid var(--line)}
.sections li a{text-decoration:none;font-weight:500}.sections li span{display:block;font-size:13px;color:var(--muted)}
ol.steps{padding-left:22px;line-height:1.65}ol.steps li{margin-bottom:8px}details.faq{border-top:1px solid var(--line);padding:10px 0}details.faq summary{cursor:pointer;font-weight:500}
details.faq p{margin:8px 0 0}.crumb{font-size:14px;margin-bottom:10px}textarea{width:100%;font:inherit;color:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.hp{position:absolute;left:-9999px}</style>`;

export function helpIndexPage({ q = '', results = null }) {
  const body = results
    ? `<h1>Résultats pour « ${esc(q)} »</h1>${helpSearch(q)}
      ${results.docs.length || results.faq.length ? '' : `<div class="card"><p>Aucun article ne correspond. Essayez un autre mot, ou <a href="/aide/contact">écrivez au support</a>.</p></div>`}
      ${results.docs.length ? `<div class="card"><ul style="list-style:none;padding:0;margin:0">${results.docs.map((d) => `<li style="padding:8px 0;border-bottom:1px solid var(--line)"><a href="/aide/${d.id}"><strong>${esc(d.title)}</strong></a><div class="small muted">${esc(d.summary)}</div></li>`).join('')}</ul></div>` : ''}
      ${results.faq.length ? `<div class="card"><h2>Questions fréquentes</h2>${results.faq.map(([qq, a]) => `<details class="faq" open><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join('')}</div>` : ''}
      <p><a href="/aide">← Tout le centre d’aide</a></p>`
    : `<h1>Centre d’aide</h1><p class="muted">Guides pour démarrer, se connecter, administrer l’espace et gérer l’abonnement. Les guides détaillés de chaque écran sont aussi dans l’application, onglet « Aide et support ».</p>
      ${helpSearch()}
      <div class="sections">${DOC_SECTIONS.map(([k, label]) => `<section class="card"><h2>${esc(label)}</h2><ul>${DOCS.filter((d) => d.section === k).map((d) => `<li><a href="/aide/${d.id}">${esc(d.title)}</a><span>${esc(d.summary)}</span></li>`).join('')}</ul></section>`).join('')}</div>
      <section class="card"><h2>Questions fréquentes</h2>${DOC_FAQ.map(([qq, a]) => `<details class="faq"><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
      <section class="card"><h2>Vous ne trouvez pas la réponse ?</h2><p>Déjà connecté ? Ouvrez « Aide et support » dans l’application : l’assistant répond tout de suite et vous suivez vos demandes. Sinon, écrivez-nous.</p><a class="btn primary" href="/aide/contact">Contacter le support</a></section>`;
  return layout({ title: 'Centre d’aide', nav: HELP_NAV, head: HELP_CSS, body });
}

export function helpArticlePage(doc) {
  const sectionLabel = DOC_SECTIONS.find(([k]) => k === doc.section)?.[1] || '';
  const related = DOCS.filter((d) => d.section === doc.section && d.id !== doc.id);
  return layout({ title: doc.title, nav: HELP_NAV, head: HELP_CSS, body: `<div class="narrow" style="max-width:760px">
    <div class="crumb"><a href="/aide">Centre d’aide</a> › ${esc(sectionLabel)}</div>
    <article class="card"><h1 style="font-size:28px">${esc(doc.title)}</h1><p class="muted">${esc(doc.summary)}</p>
      <ol class="steps">${doc.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${doc.note ? `<div class="banner">${esc(doc.note)}</div>` : ''}</article>
    ${related.length ? `<section class="card"><h2>Dans la même rubrique</h2><ul style="padding-left:18px;margin:0">${related.map((d) => `<li><a href="/aide/${d.id}">${esc(d.title)}</a></li>`).join('')}</ul></section>` : ''}
    <p class="small muted">Cet article ne répond pas à votre question ? <a href="/aide/contact?sujet=${encodeURIComponent(doc.title)}">Contactez le support</a>.</p></div>` });
}

export const CONTACT_CATEGORIES = { connexion: 'Je n’arrive pas à me connecter', abonnement: 'Abonnement et facturation', commercial: 'Question avant de m’inscrire', technique: 'Problème technique', donnees: 'Données personnelles et suppression', autre: 'Autre' };
export function contactPage({ v = {}, error = '', sent = false, pre }) {
  if (sent) return layout({ title: 'Message envoyé', nav: HELP_NAV, head: HELP_CSS, body: `<div class="narrow card"><h1>Message envoyé</h1><p>Merci. Le support vous répond par e-mail, en général sous un jour ouvré. Vous avez aussi reçu une copie de votre message.</p><a class="btn" href="/aide">Retour au centre d’aide</a></div>` });
  return layout({ title: 'Contacter le support', nav: HELP_NAV, head: HELP_CSS, body: `<div class="narrow" style="max-width:560px">
    <h1>Contacter le support</h1>
    <p class="muted">Déjà connecté à votre espace ? Utilisez plutôt « Aide et support » dans l’application : votre demande y est suivie avec les informations techniques utiles.</p>
    <div class="banner warn">Ne communiquez jamais votre mot de passe ni votre code entreprise : le support ne vous les demandera jamais.</div>
    ${alert(error)}
    <form method="post" action="/aide/contact" class="card" novalidate>${hidden('pre', pre)}
      <div class="hp" aria-hidden="true"><label for="f-website">Ne pas remplir</label><input id="f-website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="row"><div>${field('name', 'Nom', 'required maxlength="80" autocomplete="name"', v.name)}</div><div>${field('email', 'Adresse e-mail', 'type="email" required maxlength="254" autocomplete="email"', v.email)}</div></div>
      <label for="f-slug">Adresse de votre espace (facultatif)</label>
      <div class="prefix"><span>${esc(new URL(config.baseUrl).host)}/</span><input id="f-slug" name="slug" maxlength="40" value="${esc(v.slug)}" autocapitalize="off" spellcheck="false"></div>
      <label for="f-category">Sujet</label><select id="f-category" name="category">${Object.entries(CONTACT_CATEGORIES).map(([k, l]) => `<option value="${k}" ${k === v.category ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${field('subject', 'Objet', 'required maxlength="140"', v.subject)}
      <label for="f-message">Message</label><textarea id="f-message" name="message" rows="7" required maxlength="5000">${esc(v.message)}</textarea>
      <button class="btn primary block">Envoyer</button></form></div>` });
}

export function platformContactPage({ c, csrf }) {
  const replies = JSON.parse(c.replies || '[]');
  return layout({ title: c.subject, nav: '<a href="/plateforme">Console</a>', head: HELP_CSS, body: `<div class="narrow" style="max-width:720px"><p><a href="/plateforme">← Console</a></p>
    <h1>${esc(c.subject)}</h1><p class="muted">${esc(c.name)} · ${esc(c.email)}${c.slug ? ` · /${esc(c.slug)}` : ''} · ${esc(CONTACT_CATEGORIES[c.category] || c.category)} · ${new Date(c.created_at).toLocaleString('fr-FR')}</p>
    <div class="card" style="white-space:pre-wrap">${esc(c.message)}</div>
    ${replies.map((r) => `<div class="card" style="margin-left:40px;background:var(--accent-soft)"><div class="small muted">Réponse de ${esc(r.by)} · ${new Date(r.at).toLocaleString('fr-FR')}</div><div style="white-space:pre-wrap">${esc(r.text)}</div></div>`).join('')}
    <form method="post" class="card">${hidden('csrf', csrf)}<label for="r">Répondre par e-mail à ${esc(c.email)}</label><textarea id="r" name="text" rows="6"></textarea>
      <label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" name="close" value="1" checked style="width:auto"> Marquer comme traité</label>
      <button class="btn primary block">Envoyer la réponse</button></form></div>` });
}
