# Changelog

Format libre, en français, orienté "qu'est-ce qui a changé et pourquoi" plutôt
que liste de commits. Les entrées les plus récentes en haut.

## 2026-08-12 — Nuit d'audit

### Service worker : la PWA installée cassait à chaque déploiement

Le plus gros bug trouvé jusqu'ici, et il était en production.

`public/sw.js` servait **tout** en cache-first sauf `/api/`, et mettait `/`
(le document HTML) en cache dès l'installation. Or le HTML fige les URLs des
chunks JS du build. Donc, après chaque déploiement :

1. la PWA installée continuait de servir l'ancien HTML depuis le cache ;
2. cet HTML demandait des chunks du build précédent, supprimés depuis → 404 ;
3. React ne pouvait plus hydrater → app cassée.

Pire : `SHELL_CACHE` était une constante figée (`"cockpit-shell-v1"`), et le
handler `activate` ne supprime que les caches dont le nom **diffère** du nom
courant. Comme il ne changeait jamais, rien n'était jamais purgé : l'app
restait cassée jusqu'à effacement manuel des données du site.

Réécrit avec la seule règle qui évite cette classe de bug — **ne jamais
servir un document HTML périmé**, puisque c'est lui qui épingle la version de
tout le reste :

- navigations (HTML) → réseau d'abord, cache seulement en secours hors-ligne ;
- `/_next/static/*` et `/icons/*` → cache d'abord, sans risque car ces URLs
  sont hashées par contenu (nouveau build = nouvelle URL) ;
- `/api/*` et tout ce qui n'est pas GET → jamais interceptés ;
- reste → réseau d'abord avec repli sur le cache.

Le nom de cache est désormais versionné (`cockpit-shell-v2`), ce qui fait que
les installations déjà cassées **se réparent toutes seules** dès qu'elles
récupèrent ce fichier.

Vérifié en conditions réelles : avec le cache contenant volontairement un
build périmé et le serveur en servant un plus récent, la page reçoit bien le
HTML frais, le cache se réaligne derrière, et l'ancien cache `v1` est purgé
automatiquement. 8 tests de non-régression ajoutés (`public/sw.test.ts`) qui
épinglent précisément les deux propriétés dont la violation avait causé la
panne.

### Erreur d'hydratation React — toujours ouverte, mais mieux cernée

L'avertissement d'hydratation en mode développement **n'est pas** causé par le
service worker, contrairement à ce que l'entrée précédente laissait supposer :
il persiste service worker désinstallé et caches vidés. Éliminés au passage :

- l'ordre des balises du `<head>` (identique octet pour octet entre le HTML
  serveur et le DOM client) ;
- la structure du `<body>` (`<div class="min-h-screen">` en premier des deux
  côtés) ;
- le service worker (reproduit sans lui).

Non identifié à ce stade. Les erreurs sont levées comme exceptions non
catchées interceptées par l'overlay de développement Next, ce qui les rend
difficiles à capturer : ni un hook `console.error` ni un écouteur
`window.addEventListener('error')` injectés avant l'hydratation ne les voient
passer. Impact réel constaté : nul à l'usage (tous les écrans s'affichent et
fonctionnent), coût théorique en production = un rendu client de la partie
concernée au lieu d'une hydratation. À reprendre avec l'overlay de dev ouvert
manuellement, qui affiche le diff exact.

## 2026-08-11 — Backlog fiches joueurs/marché + audit UI/UX + 2 bugs de rendu

Grosse session en trois temps : (1) tout le backlog demandé sur les fiches
joueurs, le marché et l'historique, (2) un audit UI/UX complet du produit
existant, (3) la correction de tous les points de l'audit — dont deux bugs
de rendu plus profonds que prévu, découverts en vérifiant les couleurs avec
de vraies valeurs calculées plutôt qu'à l'œil.

### Nouvelles fonctionnalités

- **Courbe de forme fiable** : elle s'appuie maintenant sur la dernière
  apparition réelle (`Appearance`, table qui a des dates) plutôt que sur la
  simple liste des derniers scores joués (`Player.recentScores`, sans date).
  Un joueur qui a joué deux fois il y a 3 mois affiche « inactif depuis Xj »
  au lieu d'une fausse courbe de forme récente. Voir `lib/sparkline.ts`.
- **Tri par % de titularisation** dans la Galerie.
- **Couleurs de score alignées sur l'échelle So5 réelle** (`lib/types.ts`,
  `scoreColor()`) : <40 rouge, 40-59 neutre, 60+ vert — appliqué à la
  Galerie, la fiche joueur, l'historique de matchs et le Scouting.
- **Badge U23** avec tooltip indiquant la date de validité (approximation :
  23ᵉ anniversaire — Sorare n'expose pas sa règle de coupure de saison
  exacte via l'API publique).
- **Badge division/championnat** sur chaque carte, avec indication si le
  championnat est couvert par le Scouting marché ou non.
- **Badge in-season / classic** (IS / CL) plus visible.
- **Matchs amicaux enrichis** : minutes jouées, buts, passes décisives, et
  un score "AA" — en réalité `allAroundScore`, le champ le plus proche
  disponible côté Sorare ; le vrai score AA (Average Alignment) n'existe pas
  dans l'API publique.
- **Alertes prix et rumeurs de transfert** (icônes 📉📈📰) sur les cartes
  suivies et possédées, calculées une fois par jour par un cron dédié
  (`/api/cron/alerts`), jamais en direct — voir `lib/services/alerts.ts`.
- **Historique des ventes** (nouvel onglet) : les cartes qui disparaissent
  d'un import CSV sont désormais capturées dans une table `Sale` avant
  suppression, avec comparaison au floor price actuel du joueur pour juger
  après coup si la vente était une bonne idée. Le prix de vente n'étant pas
  exposé par SorareScore, c'est explicitement affiché comme une estimation.
- **Watchlist multiple** : on peut créer plusieurs listes de suivi
  nommées (`WatchlistGroup`) au lieu d'une seule liste plate.
- **Marché** : recherche et watchlist rendues cliquables vers la fiche
  joueur complète (elles l'étaient déjà en partie ; vérifié et confirmé
  fonctionnel de bout en bout, y compris le bouton « Prix »).

### Audit UI/UX et corrections

Repris intégralement — voir le rapport publié en artefact pendant la
session pour le détail constat par constat. En résumé :

- Rare et Super Rare recolorées en turquoise/magenta (proches des vraies
  teintes Sorare) au lieu de rouge/bleu — Rare partageait auparavant le même
  hexadécimal que la couleur d'alerte (`warn`).
- Sélecteur de compétition en Compo : affiche des noms lisibles (« Champion
  Rare ») au lieu des clés internes (`champion-rare`).
- Sélecteur de championnat en Marché : regroupé par catégorie (Épinglés /
  Domestiques / Internationales) au lieu d'une liste plate de 60+ entrées.
- Badges de la brique joueur réorganisés : seuls le nom, l'alerte et
  l'indisponibilité restent sur la ligne principale ; U23, IS/CL et la
  division passent en second niveau, pour que le nom ne soit plus tronqué
  par l'empilement des badges.
- Navigation basse : icônes ajoutées, hauteur tactile remontée à 48px.
- Confirmation ajoutée avant suppression d'une liste de suivi.
- Message d'erreur générique dans la fiche joueur au lieu de l'erreur
  GraphQL brute quand un joueur n'est pas trouvé côté Sorare.
- Traitement visuel dédié (liseré dégradé or/magenta/turquoise) pour la
  rareté Unique, au lieu d'un simple liseré blanc.
- Couleur de la tendance de prix en Scouting clarifiée par un tooltip
  explicite (le sens rouge/vert y est inversé par rapport aux alertes de
  possession — logique acheteur vs logique propriétaire — c'était
  volontaire mais pas assez explicite).

### Deux bugs de rendu trouvés en vérifiant les corrections ci-dessus

Pas dans l'audit initial — trouvés en comparant les couleurs *calculées*
par le navigateur (`getComputedStyle`) aux valeurs attendues, plutôt qu'en
se fiant à une capture d'écran.

1. **`tailwind.config.ts` ne scannait que `app/**`, jamais `lib/**`.**
   `RARITY_CLASS` (dans `lib/types.ts`) définit des noms de classes comme
   `"border-rare"` comme simples valeurs de chaîne — Tailwind ne génère une
   classe que s'il trouve cette chaîne littéralement dans un fichier scanné.
   Résultat : les couleurs Common, Rare et Super Rare n'ont **jamais été
   générées**, quelle que soit leur valeur hexadécimale — elles retombaient
   silencieusement sur `border-line` (gris neutre). Limited fonctionnait par
   accident, parce que la chaîne `"text-limited"` apparaît aussi, telle
   quelle, dans `Scouting.tsx`. Correctif : le glob `content` de
   `tailwind.config.ts` couvre maintenant aussi `./lib/**/*.{ts,tsx}`.
2. **Une fois générées, ces classes coloraient les 4 côtés de la carte**,
   pas seulement le liseré gauche de 3px voulu — `border-{couleur}` est un
   raccourci Tailwind pour `border-color`, qui touche les quatre côtés.
   Combiné à une classe `border-line` posée en base sur le même élément,
   le résultat dépendait de l'ordre alphabétique interne de génération de
   Tailwind (pur hasard, pas une garantie). Correctif : les couleurs de
   rareté utilisent maintenant `border-l-{couleur}` (ne touche que
   `border-left-color`), et les trois autres côtés sont posés séparément
   (`border-t-line border-r-line border-b-line`) — plus aucun chevauchement
   de propriété CSS entre les deux, donc plus rien qui dépende de l'ordre
   de génération.

### Tests

Le projet n'avait aucun test automatisé avant cette session. Ajout de
**vitest** avec deux suites séparées :

- `npm test` — 72 tests unitaires, aucune dépendance externe (logique pure :
  couleurs de score, éligibilité U23, détection de staleness de la courbe
  de forme, parsing CSV, classification des alertes, calcul de
  plus/moins-value).
- `npm run test:integration` — 22 tests contre une vraie base Postgres
  (capture des ventes à l'import CSV, calcul de `lastPlayedAt`, watchlist
  multi-listes, cycle complet des alertes). Nécessite `DATABASE_URL` sur
  une base jetable, voir `vitest.integration.setup.ts` pour le message
  d'aide si elle manque.

### Notes pour la suite

- Une erreur d'hydratation React apparaît en mode développement sur la page
  principale (`app/page.tsx`). Confirmée présente sur le code d'avant cette
  session (testée via `git stash`), donc sans lien avec ces changements.
  N'affecte pas le rendu visible (le contenu s'affiche correctement malgré
  l'avertissement) et n'a pas pu être reproduite de façon concluante contre
  un build de production dans l'environnement de test de cette session.
  À investiguer séparément si elle gêne réellement.
- La vue « terrain » pour l'onglet Compo (proposée dans l'audit comme
  constat M-3) n'a volontairement pas été construite : c'est un choix de
  direction produit, pas une correction, et l'app reste un outil de conseil
  plutôt qu'un compositeur de ligne Sorare à proprement parler.
