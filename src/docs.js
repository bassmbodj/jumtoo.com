// Public help centre content (French). Each article: id, section, title, summary, steps, optional note.
export const DOC_SECTIONS = [
  ['demarrer', 'Démarrer'],
  ['compte', 'Compte et connexion'],
  ['admin', 'Administration'],
  ['abonnement', 'Abonnement et facturation'],
  ['application', 'Utiliser l’application'],
  ['securite', 'Sécurité et données'],
];

export const DOCS = [
  { id: 'creer-entreprise', section: 'demarrer', title: 'Créer l’espace de votre entreprise', summary: 'Formule, adresse de l’espace, administrateur et code entreprise.', steps: [
    'Sur la page d’accueil, choisissez une formule (Essentiel, Pro ou Entreprise) et une facturation mensuelle ou annuelle.',
    'Saisissez le nom de l’entreprise. L’adresse de votre espace (par exemple /teranga-services) est proposée automatiquement ; vous pouvez la modifier avant de valider. Elle ne change plus ensuite.',
    'Renseignez le nom, l’e-mail et le mot de passe de l’administrateur : c’est vous.',
    'Payez par carte sur la page sécurisée de Stripe. Pendant l’essai gratuit, rien n’est prélevé.',
    'Notez le code entreprise affiché à la fin : il ne sera plus jamais affiché.'],
    note: 'Code perdu avant d’avoir pu le noter ? Connectez-vous à l’administration avec votre e-mail et votre mot de passe, puis générez un nouveau code.' },
  { id: 'premiers-pas', section: 'demarrer', title: 'Premiers pas dans l’application', summary: 'Ce qu’il faut régler le premier jour.', steps: [
    'Le pays choisi à l’inscription règle la devise, le plan comptable (SYSCOHADA ou PCG) et les taux de TVA.',
    'Créez vos produits et services avec leur prix HT et, si vous le connaissez, leur coût d’achat : la marge sera calculée automatiquement.',
    'Importez vos clients depuis Excel (Import / Export), ou créez-les un par un.',
    'Invitez vos collaborateurs depuis l’administration et transmettez-leur le code entreprise.',
    'Le bouton « ? » en bas de chaque écran ouvre le guide correspondant dans l’application.'] },
  { id: 'se-connecter', section: 'compte', title: 'Se connecter', summary: 'E-mail, mot de passe et code entreprise.', steps: [
    'Ouvrez l’adresse de votre entreprise, par exemple www.jumtoo.com/teranga-services.',
    'Nom d’utilisateur : votre adresse e-mail.',
    'Mot de passe : celui que vous avez choisi en activant votre compte.',
    'Code entreprise (cryptogramme) : le code à 8 caractères (XXXX-XXXX) communiqué par votre administrateur. Majuscules, minuscules et tiret sont acceptés indifféremment.',
    'Le message d’erreur ne précise pas quel élément est faux : c’est volontaire, pour ne pas aider un fraudeur. Vérifiez les trois.'] },
  { id: 'mot-de-passe-oublie', section: 'compte', title: 'Mot de passe oublié', summary: 'Recevoir un lien de réinitialisation.', steps: [
    'Sur la page de connexion de votre entreprise, cliquez sur « Mot de passe oublié ? ».',
    'Saisissez votre adresse e-mail : un lien valable 1 heure vous est envoyé.',
    'Choisissez un nouveau mot de passe (10 caractères minimum, avec des lettres et des chiffres).',
    'Vos sessions ouvertes sur d’autres appareils sont fermées par sécurité.'],
    note: 'Rien reçu ? Vérifiez les courriers indésirables, puis demandez à votre administrateur d’envoyer la réinitialisation depuis l’administration.' },
  { id: 'code-perdu', section: 'compte', title: 'Code entreprise perdu ou refusé', summary: 'Seul l’administrateur peut le remplacer.', steps: [
    'Le code est commun à toute l’entreprise : demandez-le à votre administrateur.',
    'L’administrateur ne peut pas le relire, mais il peut en générer un nouveau. L’ancien cesse alors de fonctionner pour tout le monde.',
    'Si le code vient de changer, utilisez le nouveau qu’on vous a communiqué.'],
    note: 'Pour des raisons de sécurité, le support Jumtoo ne communique jamais de code entreprise.' },
  { id: 'compte-bloque', section: 'compte', title: 'Compte bloqué après plusieurs essais', summary: 'Blocage automatique de 15 minutes.', steps: [
    'Après 5 tentatives incorrectes, le compte est bloqué 15 minutes, même si les informations saisies ensuite sont justes.',
    'Patientez 15 minutes, ou demandez à votre administrateur de réinitialiser votre mot de passe : le blocage est alors levé.',
    'Si vous n’êtes pas à l’origine de ces tentatives, prévenez votre administrateur : il peut générer un nouveau code entreprise.'] },
  { id: 'inviter', section: 'admin', title: 'Inviter et gérer les utilisateurs', summary: 'Invitation par e-mail, rôles, désactivation.', steps: [
    'Ouvrez l’administration (lien « Administration » en bas de la barre latérale).',
    'Dans « Inviter un utilisateur », saisissez le nom, l’e-mail et le rôle, puis envoyez l’invitation. Le lien reçu est valable 7 jours.',
    'Communiquez-lui le code entreprise par un autre moyen (de vive voix ou par téléphone) : il n’est jamais envoyé par e-mail.',
    'Rôles : Administrateur (utilisateurs, code, abonnement), Utilisateur (toute l’application), Lecture seule (consulter et exporter).',
    '« Désactiver » coupe immédiatement l’accès et ferme ses sessions ; le compte peut être réactivé plus tard.'],
    note: 'Le nombre d’utilisateurs dépend de la formule : 3 (Essentiel), 10 (Pro), 50 (Entreprise). Les comptes désactivés ne sont pas comptés.' },
  { id: 'nouveau-code', section: 'admin', title: 'Générer un nouveau code entreprise', summary: 'Quand le code est perdu ou qu’un collaborateur part.', steps: [
    'Dans l’administration, section « Code entreprise », cliquez sur « Générer un nouveau code ».',
    'Notez le code affiché : il n’apparaîtra plus.',
    'L’ancien code ne fonctionne plus : prévenez vos collaborateurs et donnez-leur le nouveau.',
    'Quand un collaborateur quitte l’entreprise, désactivez son compte puis changez le code.'] },
  { id: 'journal', section: 'admin', title: 'Suivre la sécurité de l’espace', summary: 'Journal des connexions et des actions sensibles.', steps: [
    'L’administration affiche les 25 derniers évènements : connexions, échecs de connexion, invitations, changements de rôle, nouveau code.',
    'Une série d’échecs de connexion sur un compte peut signaler une tentative d’intrusion : changez le code entreprise et le mot de passe concerné.',
    'Dans l’application, le tableau de bord montre en plus l’activité comptable récente.'] },
  { id: 'formules', section: 'abonnement', title: 'Formules et essai gratuit', summary: 'Essentiel, Pro, Entreprise.', steps: [
    'Essentiel : 3 utilisateurs, clients, factures, achats, stock et marges, comptabilité et TVA, import / export.',
    'Pro : 10 utilisateurs, tout Essentiel, plus les prévisions de trésorerie et le copilote IA.',
    'Entreprise : 50 utilisateurs et un accompagnement à la mise en route.',
    'L’essai gratuit dure 14 jours ; le premier prélèvement a lieu à la fin de l’essai, sauf résiliation avant.'] },
  { id: 'gerer-abonnement', section: 'abonnement', title: 'Changer de formule, de carte ou résilier', summary: 'Tout se fait depuis l’administration.', steps: [
    'Dans l’administration, section « Abonnement », cliquez sur « Gérer l’abonnement et les factures ».',
    'Vous arrivez sur la page sécurisée de Stripe : changez de formule, mettez à jour la carte, téléchargez vos factures ou résiliez.',
    'Un changement de formule est pris en compte en quelques secondes dans Jumtoo (nombre d’utilisateurs, fonctions).',
    'Jumtoo ne voit jamais votre numéro de carte : il est traité uniquement par Stripe.'] },
  { id: 'impaye', section: 'abonnement', title: 'Paiement refusé, lecture seule et résiliation', summary: 'Ce qui se passe pour vos données.', steps: [
    'Si un prélèvement échoue, un bandeau prévient tous les utilisateurs ; vous avez 7 jours pour mettre la carte à jour.',
    'Passé ce délai, l’espace passe en lecture seule : tout reste consultable et exportable, mais rien ne peut être modifié.',
    'Après une résiliation, l’espace reste aussi en lecture seule : exportez vos données (classeur Excel complet, PDF comptables) depuis Import / Export.',
    'Le paiement régularisé, l’espace redevient modifiable immédiatement.'] },
  { id: 'modules', section: 'application', title: 'Les modules de l’application', summary: 'Ce que fait chaque écran.', steps: [
    'Clients et Factures : devis-facture, TVA par taux, mobile money, relances.',
    'Produits, Stock et marges : coût moyen pondéré, réapprovisionnement, marge par produit et par client, seuil de rentabilité.',
    'Achats : factures fournisseurs, lecture automatique par l’agent IA (formules Pro et Entreprise).',
    'Comptabilité : journal, balance et TVA générés automatiquement ; Prévisions : objectifs et trésorerie sur 13 semaines.',
    'Import / Export : Excel, PDF et Word. Aide et support : guides détaillés de chaque écran, assistant IA et demandes de support.'] },
  { id: 'travail-equipe', section: 'application', title: 'Travailler à plusieurs', summary: 'Mises à jour automatiques et numéros de facture.', steps: [
    'Les modifications de vos collègues apparaissent automatiquement en moins d’une minute, ou dès que vous revenez sur l’onglet.',
    'Chaque facture et chaque écriture reçoivent un numéro unique, sans trou ni doublon.',
    'Si deux personnes émettent une facture exactement au même moment, la seconde n’est pas enregistrée et sa page se recharge : il suffit de recommencer.'] },
  { id: 'donnees', section: 'securite', title: 'Où sont vos données et qui les voit', summary: 'Isolation, chiffrement et sauvegardes.', steps: [
    'Chaque entreprise a son propre espace : aucun utilisateur d’une autre entreprise ne peut y accéder.',
    'Les échanges sont chiffrés (HTTPS). Les mots de passe et le code entreprise sont stockés sous forme irréversible.',
    'Les données sont sauvegardées chaque nuit.',
    'Vous pouvez exporter toutes vos données à tout moment, même en lecture seule.'] },
  { id: 'bonnes-pratiques', section: 'securite', title: 'Bonnes pratiques de sécurité', summary: 'Cinq réflexes simples.', steps: [
    'Un compte par personne : ne partagez jamais un mot de passe.',
    'Transmettez le code entreprise de vive voix ou par téléphone, jamais dans le même e-mail que l’adresse de connexion.',
    'Désactivez le compte d’un collaborateur qui part, puis changez le code entreprise.',
    'Utilisez un mot de passe différent de celui de votre messagerie.',
    'Déconnectez-vous sur un ordinateur partagé.'] },
];

export const DOC_FAQ = [
  ['Puis-je changer l’adresse de mon espace ?', 'Non, l’adresse choisie à l’inscription est définitive, car elle figure dans les liens envoyés à vos collaborateurs. Contactez le support en cas d’erreur de saisie lors de la création.'],
  ['Puis-je gérer plusieurs entreprises ?', 'Oui : créez un espace par entreprise, chacun avec son adresse, son code et son abonnement. Vous pouvez utiliser la même adresse e-mail dans plusieurs espaces.'],
  ['Le support peut-il me donner le code entreprise ?', 'Non. Seul l’administrateur de l’entreprise peut générer un nouveau code, depuis l’administration.'],
  ['Comment payer autrement que par carte ?', 'Le paiement de l’abonnement se fait par carte bancaire via Stripe. Pour un paiement annuel par virement, écrivez au support.'],
  ['Mes données sont-elles supprimées si je résilie ?', 'Non : l’espace passe en lecture seule et vos données restent exportables. Pour une suppression définitive, l’administrateur en fait la demande au support.'],
  ['L’application fonctionne-t-elle sur téléphone ?', 'Oui, dans le navigateur du téléphone. Elle suit le mode clair ou sombre de l’appareil.'],
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function searchDocs(q) {
  const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return { docs: [], faq: [] };
  const hit = (text) => words.every((w) => norm(text).includes(w));
  return {
    docs: DOCS.filter((d) => hit([d.title, d.summary, ...d.steps, d.note || ''].join(' '))),
    faq: DOC_FAQ.filter(([q2, a]) => hit(q2 + ' ' + a)),
  };
}
