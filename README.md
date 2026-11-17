# Jumtoo en SaaS

CRM, facturation, achats, stock et marges, comptabilité (SYSCOHADA / PCG), prévisions, support, en 5 langues.
Chaque entreprise a son espace sur `www.jumtoo.com/<entreprise>`, son administrateur, ses utilisateurs et son abonnement Stripe.

- **Aucune dépendance npm** : Node.js 22.13+ (base SQLite intégrée `node:sqlite`, `node:crypto`, `node:http`).
- `src/server.js` : site public, inscription + Stripe Checkout, connexion (e-mail + mot de passe + code entreprise), administration, console plateforme, API.
- `app/index.html` : l'application Jumtoo (servie après connexion ; mode « serveur » activé automatiquement).
- `brand/` : le logo Jumtoo en SVG (fond clair, fond foncé, blanc, une couleur, icône).
- `test/server.test.js` : tests de bout en bout (isolation, sécurité, Stripe simulé, IA simulée).

```bash
npm run dev          # http://localhost:3000 (paiement désactivé, e-mails dans data/outbox.log)
npm test             # 16 tests
npm run admin:create # compte de la console plateforme (/plateforme)
```

Mise en ligne : voir **DEPLOY.md**.
