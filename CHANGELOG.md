# Changelog

Format libre, en français, orienté "qu'est-ce qui a changé et pourquoi" plutôt
que liste de commits. Les entrées les plus récentes en haut.

## 2026-08-14 — L'app reflète enfin le vrai Sorare (divisions, amicaux, analyse in-season)

Demande : voir les joueurs alignés par GW et les confronter aux % de
titularisation, propager la prévisualisation joueur partout, et un vrai outil
pour décider sur quelle division in-season se lancer. Constat après une
première livraison jugée inutilisable : le problème n'était pas l'affichage.

### Trois requêtes GraphQL étaient mortes contre le schéma actuel

Le plus grave d'abord. Un script de validation poste maintenant chaque
document du repo à l'API : les 13 passent. Il a trouvé trois requêtes cassées,
toutes silencieuses en production :

- `MY_CARDS` demandait `position`, qui n'existe pas sur `AnyPlayerInterface`
  (c'est `anyPositions`) — **la synchro des cartes échouait entièrement**.
- `PLAYER_FORM` utilisait `football.player` et `allSo5Scores`, tous deux
  disparus du schéma — **la synchro de forme n'écrivait plus une seule
  `Appearance`**. Reconstruite sur `anyPlayer` + `allPlayerGameScores`, avec
  `first` et non `last` : la connexion est triée par date décroissante, donc
  `last` ramenait les matchs les *plus anciens* (des rencontres de 2018 pour
  modéliser la forme actuelle). Effet de bord bienvenu : `anyPlayer` est
  public, la forme ne nécessite plus de connexion.
- `so5` a été lu comme un champ de `FootballRoot` alors qu'il est à la
  **racine** de `Query` — `OPEN_FIXTURES` en souffrait déjà.

Même famille de bug que l'enrichissement du 12/08 : un champ pris sur une
interface au lieu du type concret. `nextClassicFixturePlayingStatusOdds` est
dans ce cas et passe désormais par un fragment `... on Player`.

### Mes divisions, telles que Sorare les découpe

`lib/services/rules.ts` décrivait quatre compétitions **écrites à la main**,
avec un commentaire admettant que c'étaient des approximations. Aucun lien
avec le compte réel : l'onglet Compo ne pouvait pas refléter le vrai Sorare.

Nouveau socle synchronisé depuis `so5Fixture.mySo5LeagueTracks` : les league
tracks accessibles, les manager teams avec leur division active, et pour
chaque division l'avis d'éligibilité de Sorare lui-même (`canCompose`) plus
le décompte de cartes par poste (`eligibleCardsCountByPosition`). Le
`DivisionBoard` montre, par division, soit les joueurs réellement alignés
avec notre probabilité face à celle de Sorare, soit ce qui manque exactement.

Sorare plafonne la **complexité** à 500 sans clé API (30000 avec). La requête
naturelle pèse 3905 : elle est découpée en quatre documents, chacun mesuré
sous le plafond, pour que la fonctionnalité marche sur un compte simplement
connecté. `rules.ts` continue de piloter les contraintes de l'optimiseur.

### Amicaux : un état vide qui dit enfin quelque chose

Le pipeline était complet et correct. La section était rendue sous
`friendlies.length > 0`, donc **absente sans rien dire** : une intégration non
configurée était indiscernable d'un joueur sans présaison. Elle s'affiche
maintenant toujours, avec la raison (clé `APIFOOTBALL_KEY` absente / jamais
synchronisé / aucun amical pour ce joueur).

### Où se lancer en in-season

Divisions classées par proximité de jouabilité × dotation, contre un budget.
L'éligibilité est un fait (verdict de Sorare) ; le coût est une **estimation**
— médiane des valorisations in-season de la galerie — et est libellé comme tel
partout, jamais comme un prix de marché. Les deux moitiés sont séparées à
dessein : un prix approximatif ne doit pas faire douter d'une éligibilité
exacte. Budget lu sur le solde Sorare (`availableBalances`, fiat + crypto),
surchargeable à la main.

### Prévisualisation joueur propagée

`PlayerBadges` (nouveau) factorise le bloc U23 / in-season / championnat
dupliqué entre `PlayerCard` et `Scouting`, et le pose sur les quatre écrans
qui ne l'avaient pas : fiche carte, popup joueur, insights, watchlist et
recherche marché.

## 2026-08-12 (après-midi) — Tri cohérent partout + refonte de l'onglet Historique

Demande : un tri U23 en plus, un sens croissant/décroissant partout, et un
"top UI/UX" sur les tris en général — puis, en cours de route, l'Historique
lui-même à muscler (lien carte, récap, cohérence des montants ETH).

### Un seul composant de tri pour tout le site

`SortControl` (nouveau) + `compareNullable`/`u23SortValue` (`lib/types.ts`)
remplacent les tris ad-hoc, non réversibles, qui existaient déjà. Chaque
liste garde son propre jeu de clés et sa propre direction par défaut (ex :
Galerie trie la Valeur en décroissant, Scouting trie le Prix en croissant —
acheter pas cher n'est pas le même réflexe que vendre cher), mais le bouton
↓/↑ et le `<select>` sont désormais identiques partout : Galerie, Scouting,
Marché → Recherche par nom, Marché → Watchlist, Historique.

U23 rejoint les clés de tri disponibles là où une date de naissance existe
(Galerie, Scouting, Recherche par nom) — alimenté par `birthDate: birthDay`
sur `players(slugs)`, `anyPlayer` et `searchPlayers.commonPlayerHits`, le
même alias qui avait déjà réglé le bug d'enrichissement du matin. Le badge
U23 (pastille + tooltip "éligible jusqu'au…") suit désormais le tri sur les
trois écrans, pas seulement la Galerie où il existait déjà.

La Watchlist n'a pas de date de naissance sans un appel réseau par joueur —
tri limité à Nom/Poste/Club/Prix (le prix vient du floor déjà chargé au clic
"Prix", nul tant qu'il n'a pas été consulté, envoyé en fin de liste).

### Historique : lien carte, récap, et montants ETH cohérents

- Chaque vente a désormais un lien direct `sorare.com/football/cards/{slug}`
  vers la carte, à côté du bouton qui ouvrait déjà la fiche joueur.
- Bloc récap en tête de liste : bons calls / mauvais calls (basé sur
  `changePct`), plus-value ou moins-value totale sur les ventes confirmées
  ayant un prix d'achat connu.
- **Bug de fond corrigé** : une vente conclue en ETH sans `eurCents` renvoyé
  par Sorare passait silencieusement à `null` — invisible dans le récap et
  dans le total, sans que rien ne le signale. `MonetaryAmount` expose aussi
  `wei` ; quand `eurCents` manque et qu'un montant en wei existe, le prix est
  maintenant reconstruit via le cours EUR/ETH **du jour de la vente** (pas
  du jour de la consultation — sinon une vieille vente comparerait un prix
  d'aujourd'hui à un floor d'aujourd'hui, une comparaison qui ne veut rien
  dire). Cours historique récupéré via l'API gratuite CoinGecko et mis en
  cache par jour (`EthRate`) — un jour passé ne change plus jamais de cours,
  inutile de le redemander à chaque ouverture de l'onglet. Ces montants
  reconstruits sont marqués `soldPriceApprox`/`boughtPriceApprox` et affichés
  avec un « ≈ » plutôt que présentés comme un chiffre confirmé au même titre
  qu'un `eurCents` direct de Sorare.

### Migration Prisma : un piège d'ordre de tri découvert avant qu'il touche la prod

`prisma migrate deploy` trie les dossiers de migration par ordre alphabétique
du nom de dossier, pas par numéro. Ce repo nomme ses migrations `0_init`,
`1_...`, … `9_backfill_badges` (pas le format horodaté par défaut de Prisma).
Un dossier `10_...` se serait retrouvé trié juste après `0_init` et avant
`1_gallery_enrichment` — testé en local sur un Postgres jetable, l'erreur est
tombée immédiatement (`relation "Sale" does not exist`, la table n'existant
qu'à partir de la migration 6). Renommer les migrations existantes n'est pas
une option : la table `_prisma_migrations` de la prod les connaît déjà sous
leur nom actuel. Nouvelle migration nommée `a_eth_rate_and_approx_flags` à la
place — toute lettre trie après n'importe quel chiffre, donc après toutes
les migrations `0`–`9` existantes ; prochaines migrations à nommer `b_`,
`c_`, etc. Réappliqué la chaîne complète (`0_init` → `a_...`) sur un Postgres
jetable pour confirmer l'ordre correct avant tout déploiement réel.

## 2026-08-12 (matin) — Enrichissement cassé depuis hier soir : U23/division invisibles

Signalé par l'utilisateur : pas de badge U23 ni de championnat sur les
briques de la Galerie. Cause réelle, plus grave que le symptôme rapporté.

### Le vrai bug : `birthDate` n'existe pas sur le type que Sorare renvoie ici

`players(slugs: $slugs)` renvoie `AnyPlayerInterface`, pas le type concret
`Player` — et `birthDate` n'existe que sur `Player`. Vérifié en direct contre
l'API : `Field 'birthDate' doesn't exist on type 'AnyPlayerInterface'`.
Cette requête alimente **tout** l'enrichissement (photos, blessures, scores
récents, projection Sorare), pas seulement le nouveau champ — donc depuis le
déploiement d'hier soir, **plus aucun joueur n'a été rafraîchi du tout**.

Corrigé avec l'alias `birthDate: birthDay`, qui existe bien sur l'interface
(vérifié en direct) — zéro changement de code en aval.

### Pourquoi c'est resté invisible : `enrichBatch` n'avait aucun `try/catch`

La boucle de lots appelait l'API sans se protéger : la première page en échec
faisait planter tout l'appel. Remonté jusqu'à la route, ça donnait une erreur
JSON — mais rien n'écrivait dans `SyncLog`, donc rien ne s'affichait dans le
Journal de l'onglet Données. Le cron quotidien échouait pareil, en silence.
Une requête cassée a donc pu bloquer tout l'enrichissement pendant des heures
sans qu'aucun signal ne soit visible nulle part dans l'app.

Corrigé : chaque page est maintenant protégée individuellement — une page en
échec n'empêche plus les autres d'avancer, et tout échec écrit une entrée
`SyncLog` de statut `error` (visible dans le Journal) au lieu de se taire.
Les trois endroits qui bouclent sur `/api/enrich` (import CSV, bouton
Compléter de l'analyse partielle, Rafraîchir de l'onglet Données) remontent
maintenant explicitement l'échec plutôt que de s'arrêter silencieusement en
ayant l'air d'avoir réussi.

### Rattrapage des joueurs déjà "frais"

La sélection des joueurs "à traiter" ne regarde que la fraîcheur
(`enrichedAt` de plus de 12h) — elle ne peut pas savoir qu'un nouveau champ a
été ajouté et jamais rempli pour des lignes déjà à jour. Migration qui remet
`enrichedAt` à `null` pour tout joueur sans `birthDate`, ce qui le repasse en
tête de file pour le prochain rafraîchissement (manuel ou cron).

4 tests d'intégration ajoutés qui reproduisent l'incident exact : une requête
qui échoue sur toutes les pages reste visible (compteur `failed`, entrée
`SyncLog` d'erreur), une page en échec n'empêche pas les autres de réussir,
et une exécution propre logge bien `ok`.

**Action recommandée** : cliquer sur « Rafraîchir photos et stats » dans
l'onglet Données pour déclencher le rattrapage immédiatement plutôt que
d'attendre le prochain cron.

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
