# Mettre Jumtoo en ligne sur www.jumtoo.com

> **Jumtoo — votre business, en un seul outil.**
> *Your business, one tool.*

Jumtoo (anciennement « Gombo ») : POS, ERP et CRM en SaaS pour les entreprises et les équipes de vente. Le nom vient du wolof *jumtu* (« être utile ») et *jumtukaay* (« outil »).

Comptez une demi-journée la première fois. Il y a six étapes, dans cet ordre : nom et marque, domaine, serveur, Stripe, e-mails, lancement.

## 0. Protéger le nom (à faire avant toute annonce publique)

1. Une recherche web du 16/11/2026 ne trouve aucune société ni aucun produit appelé « Jumtoo ». Deux noms proches existent : **Jumoo** (développeur web au Royaume-Uni, autre secteur) et **JUMO** (fintech connue en Afrique). Gardez le double « o » et un logo bien distinct de JUMO.
2. Déposez la marque **Jumtoo** auprès de l'**OAPI**, qui couvre 17 pays d'Afrique en un seul dépôt. Ajoutez l'EUIPO ou l'INPI si vous visez l'Europe.
3. Réservez **@jumtoo** sur LinkedIn, Facebook, Instagram, X et TikTok.

## 1. Le nom de domaine

1. Vérifiez la disponibilité de **jumtoo.com** chez un registraire : OVHcloud, Gandi, Namecheap ou Cloudflare Registrar. Prenez aussi, si possible, `jumtoo.sn` (via un registraire agréé par le NIC Sénégal) et `jumtoo.africa`, pour éviter qu'un tiers les prenne.
   Si `jumtoo.com` est déjà pris : `getjumtoo.com`, `jumtoo.app` ou `jumtoo.africa`.
2. Achetez le domaine pour 1 an minimum et activez le renouvellement automatique.
3. Si vous prenez un autre domaine que `jumtoo.com`, remplacez-le dans `deploy/Caddyfile` et dans `BASE_URL` (fichier `.env`).

### Passer le code de « Gombo » à « Jumtoo »

Fait le 17/11/2026 dans le code (paquet `jumtoo.zip`) :

- [x] `deploy/Caddyfile` : `jumtoo.com` et `www.jumtoo.com`
- [x] `.env.example` : `BASE_URL`, `BRAND_NAME=Jumtoo`, `MAIL_FROM`, `SUPPORT_EMAIL` (variable d'environnement `JUMTOO_ENV`, l'ancienne `GOMBO_ENV` reste acceptée)
- [x] `docker-compose.yml` : service `jumtoo`, volume `jumtoo-data`, dossier `/opt/jumtoo`
- [x] Interface : nom et logo Jumtoo (proposition A, les deux « o » liés) dans l'application, la démo, le site public, la console et le centre d'aide `/aide` ; titres de pages, favicon, e-mails et PDF
- [x] Logo en SVG dans le dossier `brand/` du projet (fond clair, fond foncé, blanc, une couleur, icône)
- [ ] CGU et politique de confidentialité (à rédiger, voir l'étape 5)
- [ ] Stripe : nom de l'entreprise, nom des produits, libellé sur les relevés bancaires

## 2. Le serveur

Pour démarrer, un petit serveur virtuel suffit (2 vCPU, 2 à 4 Go de RAM, Ubuntu 24.04). Exemples : Hetzner, OVHcloud, DigitalOcean, Scaleway. Comptez environ 5 à 15 € par mois.

1. Chez le registraire, créez deux enregistrements DNS **A** vers l'adresse IP du serveur : `jumtoo.com` et `www.jumtoo.com`.
2. Sur le serveur :
   ```bash
   # Docker
   curl -fsSL https://get.docker.com | sh
   # Code (copiez le dossier du projet, par exemple avec scp ou git)
   sudo mkdir -p /opt/jumtoo && cd /opt/jumtoo
   cp .env.example .env && nano .env      # remplissez les valeurs (voir plus bas)
   openssl rand -base64 48                # à coller dans APP_SECRET
   docker compose up -d --build
   ```
3. Caddy obtient tout seul le certificat HTTPS dès que le DNS pointe vers le serveur. Vérifiez ensuite que `https://www.jumtoo.com/healthz` répond `{"ok":true}`.
4. Créez votre compte de **console plateforme**, qui vous sert à voir toutes les entreprises, à les suspendre et à répondre au support :
   ```bash
   docker compose exec jumtoo node --no-warnings=ExperimentalWarning src/cli.js create-platform-admin vous@jumtoo.com "Votre nom"
   ```
   Puis ouvrez `https://www.jumtoo.com/plateforme`.
5. Programmez les sauvegardes quotidiennes : `crontab -e`, puis ajoutez `0 2 * * * /opt/jumtoo/deploy/backup.sh`. Copiez aussi régulièrement le dossier de sauvegardes **hors du serveur**.
6. Ouvrez uniquement les ports 22, 80 et 443 (pare-feu `ufw`).

## 3. Stripe (paiement par carte)

> Stripe n'ouvre pas de compte marchand directement au Sénégal. Il faut une société dans un pays pris en charge (par exemple la France, ou les États-Unis via Stripe Atlas), avec un compte bancaire dans ce pays. Vérifiez la liste à jour sur stripe.com/global avant de commencer.

1. Créez le compte Stripe et restez en **mode test** jusqu'au lancement.
2. **Produits** : créez 3 produits (Jumtoo Essentiel, Jumtoo Pro, Jumtoo Entreprise). Pour chacun, créez 2 prix récurrents en XOF : mensuel et annuel (15 000 / 150 000, 35 000 / 350 000, 75 000 / 750 000 F CFA, ou vos propres montants). Copiez les 6 identifiants `price_...` dans `.env`.
   Si vous changez les montants, mettez aussi à jour l'affichage dans `src/config.js` (objet `PLANS`).
3. **Webhook** : Développeurs > Webhooks > Ajouter un point de terminaison `https://www.jumtoo.com/stripe/webhook`, avec les évènements :
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` et `customer.subscription.deleted`.
   Copiez le secret de signature `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.
4. **Portail client** : Paramètres > Billing > Portail client. Autorisez la mise à jour du moyen de paiement, la résiliation, et le changement de formule entre vos 3 produits.
5. Mettez la clé secrète `sk_test_...` dans `STRIPE_SECRET_KEY`, redémarrez (`docker compose up -d`), puis faites une inscription complète avec la carte de test `4242 4242 4242 4242`.
6. Au lancement, remplacez les clés et les prix de test par ceux du mode réel, puis recréez le webhook en mode réel.

## 4. E-mails (invitations, mots de passe oubliés, support)

1. Créez un compte chez **Brevo** ou **Resend** et validez le domaine `jumtoo.com` : ajoutez chez le registraire les enregistrements SPF et DKIM qu'ils indiquent.
2. Dans `.env`, renseignez `MAIL_PROVIDER=brevo` (ou `resend`), `MAIL_API_KEY` et `MAIL_FROM` (par exemple `Jumtoo <bonjour@jumtoo.com>`).
3. Créez la boîte `support@jumtoo.com` (ou une redirection) : elle reçoit une copie de chaque nouvelle demande de support.

## 5. Avant d'ouvrir au public

- [ ] Marque Jumtoo déposée (ou dépôt en cours) auprès de l'OAPI.
- [ ] Rédigez vos **conditions générales** et votre **politique de confidentialité**, avec un juriste. Au Sénégal, la loi 2008-12 sur les données personnelles s'applique, avec une déclaration auprès de la CDP. Le formulaire d'inscription demande de les accepter.
- [ ] Faites valider les plans comptables et les taux de TVA par un expert-comptable.
- [ ] Faites une inscription test complète en mode réel, avec une vraie carte, puis remboursez-la depuis Stripe.
- [ ] Vérifiez que la sauvegarde nocturne fonctionne, puis restaurez-en une sur une machine de test.
- [ ] Facultatif : renseignez `ANTHROPIC_API_KEY` pour activer le copilote IA des formules Pro et Entreprise. Fixez aussi la limite d'appels par jour (`AI_DAILY_LIMIT`).

## Fonctionnement, pour mémoire

| Élément | Règle |
| --- | --- |
| Adresse d'une entreprise | `https://www.jumtoo.com/<adresse>`, choisie à l'inscription (3 à 40 caractères : minuscules, chiffres, tirets) |
| Connexion | Adresse e-mail (nom d'utilisateur) + mot de passe + **code entreprise** (cryptogramme `XXXX-XXXX`, commun à l'entreprise) |
| Code entreprise | Affiché une seule fois, puis stocké sous forme chiffrée irréversible. L'administrateur en génère un nouveau quand il veut : l'ancien est alors invalidé. Il n'est jamais envoyé par e-mail. |
| Rôles | Administrateur (utilisateurs, code, abonnement) · Utilisateur · Lecture seule |
| Sécurité | Mots de passe scrypt, blocage 15 min après 5 échecs, limite de tentatives par adresse IP, sessions httpOnly limitées à l'adresse de l'entreprise, jeton CSRF, en-têtes de sécurité, HTTPS obligatoire |
| Abonnement | Essai de 14 jours, puis prélèvement Stripe. En cas d'impayé : 7 jours de grâce, puis lecture seule. Après résiliation : lecture seule (les données restent exportables). |
| Aide et support | Centre d'aide public sur `/aide` (16 guides, recherche, FAQ) et formulaire `/aide/contact` pour les personnes qui ne peuvent pas se connecter. Les messages arrivent dans la console plateforme et dans `SUPPORT_EMAIL` ; vous répondez par e-mail depuis la console. Dans l'application, l'onglet « Aide et support » propose guides, assistant IA et demandes suivies. |
| Isolation | Chaque requête est filtrée sur l'entreprise de la session. Les tests vérifient qu'un compte, un code ou une session d'une entreprise n'ouvre jamais une autre. |

## Plus tard, quand l'activité grandit

- **Volume** : SQLite tient sans difficulté plusieurs centaines d'entreprises sur un seul serveur. Au-delà, ou pour faire tourner plusieurs serveurs, passez sur PostgreSQL. Le projet `pme-suite` contient déjà le schéma avec isolation par entreprise (RLS).
- **Mobile money** : vous pourrez ajouter Wave et Orange Money via PayDunya, CinetPay ou Paytech, à côté de Stripe.
- **Double authentification** : un code à 6 chiffres par application (TOTP) peut s'ajouter au code entreprise.
