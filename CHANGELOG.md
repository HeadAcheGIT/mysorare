# Changelog

Format libre, en français, orienté "qu'est-ce qui a changé et pourquoi" plutôt
que liste de commits. Les entrées les plus récentes en haut.

## 2026-08-17 (soir) — Une annonce n'est pas une transaction

Correction remontée sur le marché in-season réel de Maxime Lopez : le chiffre
publié hier (14,90 €) était lui-même issu d'une mauvaise méthode.

### Ce qui n'allait pas

La valeur venait de `lowestPriceAnyCard(...).liveSingleSaleOffer` — le **prix
demandé** le plus bas. C'est l'espoir d'un vendeur, pas une preuve de valeur.

Confronté aux ventes réellement conclues (API Sorare, 15 dernières in-season
limited) :

| Source | Valeur |
|---|---|
| Annonce la moins chère | 14,90 € |
| Ventes conclues | médiane **10,81 €**, de 6,38 € à 30,15 € |

L'annonce était **38 % au-dessus** du marché. Et surtout la tendance était
invisible : 30,15 € le 10 août, 11–19 € le 11, 6,38–10,81 € le 12. Un marché
en chute de 35 % que l'app présentait comme un prix stable.

### La nouvelle méthode

`lib/valuation.ts` valorise à partir des **transactions**, pas des annonces :

- **médiane pondérée par la récence** (demi-vie 5 jours) — une vente d'il y a
  une semaine pèse moitié moins qu'une d'aujourd'hui ;
- **médiane et non moyenne** — la vente isolée à 30,15 € ne tire plus le
  résultat vers le haut ;
- **fourchette, taille d'échantillon et ancienneté publiées** — un chiffre
  bâti sur deux ventes doit se voir comme tel ;
- **`thin`** quand l'échantillon est trop maigre ou le marché trop ancien ;
- **`listingPremiumPct`** mesure l'écart entre le prix demandé et le marché —
  c'est exactement le garde-fou qui aurait attrapé l'erreur d'origine.

Les tests sont écrits sur les vraies données Lopez, pas sur des valeurs
inventées, et vérifient notamment que la valorisation reste sous les 14,90 €
de l'annonce.

## 2026-08-17 — Le floor affiché n'était pas celui de la carte

Remonté depuis la prod sur Maxime Lopez. Deux problèmes distincts, les deux
confirmés sur données réelles.

### Un facteur 45 sur la valeur d'une carte

`getPlayerMarket` interrogeait `lowestPriceAnyCard(rarity:)` **sans**
`inSeason: true` : il renvoyait donc la carte la moins chère toutes saisons
confondues. Mesuré sur Maxime Lopez limited :

| Floor | Carte | Prix |
|---|---|---|
| In-season (2026) | `maxime-lopez-2026-limited-10` | **14,90 €** |
| Toutes saisons | `maxime-lopez-2023-limited-388` | **0,33 €** |

Une carte in-season achetée 4,87 € s'affichait donc face à un floor de 0,33 €
— une perte apparente de 93 %, alors qu'elle est en plus-value. De quoi vendre
exactement au mauvais moment.

Le service renvoie désormais les deux floors. La fiche montre celui qui
s'applique à la carte, mentionne l'autre comme non comparable, et calcule la
plus-value sur la bonne référence.

### Les prix d'achat manquants, et les crédits

La synchro ne lisait que les *ventes directes conclues*. Une carte gagnée aux
enchères, achetée en achat immédiat, reçue en récompense ou issue d'un pack
n'avait donc aucun prix — et le bilan de saison refusait de calculer un net
faute de dépense connue.

`AnyCardInterface.ownershipHistory` couvre toutes ces voies, est **public** et
**batchable**. Il donne le montant réel, le mode d'acquisition
(`ENGLISH_AUCTION`, `INSTANT_BUY`, `REWARD`, `PACK`…) et, via
`settlementDelayReason = CONVERSION_CREDIT_USED`, **les achats réglés en
crédits** — la demande initiale.

Un transfert gratuit (récompense, pack, mint) est enregistré à 0 € plutôt que
laissé vide : c'est un fait, pas une donnée manquante. Le prix ne comble qu'un
trou et n'écrase jamais celui d'un CSV, qui vient de tes propres relevés.

## 2026-08-16 (soir) — Sorare Connect + l'adversaire enfin pris en compte

### Sorare Connect, avec sa limite dite d'emblée

OAuth 2.0 officiel (`sorare.com/oauth/authorize`) : bouton « Sorare Connect »,
échange du code, rafraîchissement automatique — les jetons d'accès ne durent
que 2 h, sans refresh la connexion tomberait toutes les deux heures — et
révocation côté Sorare à la déconnexion. Protection CSRF par cookie `state`.

**Limite structurante, citée mot pour mot de la doc Sorare** : le scope unique
exclut « Future lineups and rewards ». Connect ne peut donc **pas** alimenter
l'onglet Compo ni le bilan de saison. L'app garde les deux méthodes et
l'interface annonce ce que chacune débloque, plutôt que de laisser ces écrans
échouer plus tard :

- **Connect** — galerie, ventes, solde. Sans mot de passe ni code 2FA.
- **Mot de passe** — ajoute compos, divisions et gains.

### Le modèle ignorait complètement l'adversaire

Vérifié avant de coder : zéro occurrence d'adversaire, de difficulté ou de
domicile dans le calcul. Un attaquant contre le leader et contre le dernier
avaient rigoureusement la même projection.

`Club.domesticLeagueRanking` existe déjà côté Sorare (Man City 2ᵉ, Paris FC
11ᵉ — vérifié), et un seul appel par game week donne tous les matchs avec le
classement des deux clubs. Aucune dépendance externe.

L'ajustement est **volontairement bridé** à ±12 % pour l'écart de classement
et ±3 % pour le domicile : la position au classement est un indicateur
grossier, non comparable d'un championnat à l'autre. Seul l'écart *à
l'intérieur d'un match* est lu, et il est appliqué **après** l'intégration de
la projection Sorare — sinon l'adversaire serait compté deux fois pour les
joueurs que Sorare couvre.

### Recherche open source : rien à intégrer, et pourquoi

ClubElo (force des équipes) est gratuit mais en HTTP simple et injoignable
depuis l'environnement de test — non validable, donc non retenu. Understat
(xG) n'a pas d'API officielle : du scraping, avec le même problème de CGU que
celui déjà documenté pour `external_probable`. StatsBomb est historique,
openfootball redondant avec Sorare, `sorarepy` est en Python.

La brique qui manquait était déjà dans l'API Sorare.

## 2026-08-16 — Fraîcheur, transferts, vitesse et bilan de saison

Les quatre points restants du test d'usage.

### Une moyenne de forme ne dit pas de quand elle date

Lassine Sinayoko s'affichait « L5 74 · joué 14/15 » comme une donnée courante.
Son dernier match remontait à 89 jours (trêve estivale), et il avait été joué
**sous les couleurs d'Auxerre**, alors que la fiche indique Paris FC depuis son
transfert. Deux pièges silencieux, dans les deux cas la statistique décrit
autre chose que ce qu'on croit lire.

Les badges « pas joué depuis N j » et « stats à \<ancien club\> » apparaissent
désormais sur la ligne. Les deux signaux voyagent sur la requête par joueur
**déjà effectuée** pour les prix — coût réseau nul.

### Le scouting ne montrait rien pendant une minute

La liste et les prix étaient récupérés d'un bloc, or les prix coûtent une
requête par joueur cadencée à ~3 s. Séparés en deux passes : la liste arrive en
**3,2 s** (mesuré, contre ~60 s), triable immédiatement, et chaque ligne se
complète derrière avec un décompte des joueurs restants.

### On ne savait pas si tout ça rapportait

Rien dans l'app ne montrait d'argent réellement gagné — tout était projection.
Nouveau bilan dans Historique, alimenté par `mySo5Rankings` / `so5Rewards` :
classement, score et gains par game week, totaux de saison, et le **net face au
coût connu de la galerie**.

Le net reste vide tant que les prix d'achat sont inconnus, plutôt que d'afficher
les gains seuls comme un bénéfice — ce serait flatteur d'exactement ce que les
cartes ont coûté. Une game week jouée mais non encore payée est marquée « en
attente » au lieu d'être comptée à 0 €.

## 2026-08-15 (soir) — Test d'usage : le scouting recommandait un gardien remplaçant

Passage en revue du site en se mettant à la place d'un manager qui cherche à
faire du ROI, sur de vraies données Ligue 1.

### Le scouting classait sur la forme brute, sans regarder le temps de jeu

Premier résultat retourné : **Mathieu Gorgelin, gardien remplaçant du RC Lens,
1 match joué sur 15**, en tête du classement « meilleure forme » avec L5 85 —
une apparition, un gros score, et rien pour dire qu'il ne joue jamais. Suivre
cette recommandation fait perdre de l'argent, soit exactement l'inverse de ce
à quoi l'écran sert.

La forme est désormais pondérée par le temps de jeu (`lib/scoutingRank.ts`)
pour le **classement uniquement** : la L5 réelle reste affichée, rien n'est
caché. Un badge « peu de matchs » signale les moyennes qui reposent sur trop
peu de rencontres.

### Il manquait la seule colonne qui répond à la question posée

L'écran affichait forme, temps de jeu, prix et tendance côte à côte, en
laissant le rapprochement à faire de tête. Ajout de **pts/€** (forme pondérée
par euro), qui devient le tri par défaut.

Effet sur le même jeu de données : Ismaël Boura (Troyes, 9/15, 5,21 €) passe
premier à 8,90 pts/€, tandis que Lassine Sinayoko (14/15, 52,31 €) tombe
dernier à 1,10 pts/€ — il était le choix « évident » avant.

### Les erreurs techniques remontaient brutes à l'écran

Sans base de données joignable, la bannière affichait un extrait de stack
Prisma avec les numéros de ligne du schéma. Traduit en messages actionnables
(base injoignable, limite de requêtes Sorare, réseau, requête refusée), le
détail restant dans les logs serveur.

## 2026-08-15 — Les probabilités de titularisation étaient fausses

« J'ai cru voir que les probabilités sont pas OK ». Elles ne l'étaient pas, et
la cause est nette.

### Le bug

`pStart` était calculé depuis `lastFiveSo5Appearances` / `lastFifteenSo5Appearances`
— des compteurs d'**apparitions**, pas de titularisations. Un remplaçant entré
une minute compte comme une apparition pleine, donc un joueur qui entre en jeu
chaque semaine sans jamais démarrer affichait « titu 100% ».

Le second modèle (`computeForm`) n'allait pas mieux : `started` valait
`minutes >= 60`, et il était OR-é avec le drapeau stocké. Résultat, un
titulaire sorti à la mi-heure n'était pas compté comme titulaire, tandis qu'un
remplaçant entré tôt l'était.

Et les deux modèles écrivaient dans le même champ avec des sémantiques
différentes : le cron quotidien utilisait le premier, le bouton « recalculer »
le second.

### La correction

`PlayerGameStats.formationPlace` tranche proprement — non nul = onze de départ.
Vérifié sur des données réelles : un titulaire sorti à la mi-temps affiche
`minsPlayed 45 / formationPlace 11`, un entrant d'une minute
`minsPlayed 1 / formationPlace 0`. Les deux cas que l'ancienne règle ratait.

`pStart` (titularisation) et `pPlay` (entre en jeu) sont désormais deux
grandeurs distinctes. Le score projeté s'appuie sur `pPlay` — un remplaçant
marque aussi, le faire dépendre de la titularisation sous-évaluerait tous les
joueurs de rotation. `pStart` ne peut jamais dépasser `pPlay`.

### L'app ne prétend plus savoir ce qu'elle ignore

`Projection.pStartBasis` dit d'où vient le chiffre, et l'UI suit : « titu »
seulement quand la vraie composition est connue, « joue » quand seule la
participation l'est, « est. » quand il n'y a que le poste. Là où Sorare n'a
publié aucune cote, c'est écrit, au lieu d'un tiret à interpréter.

### Ce que ça débloque

La synchro de forme tournait sur le client authentifié et **n'était appelée par
aucun bouton** — donc la vraie donnée de composition n'arrivait jamais. Elle
passe sur le client public (`anyPlayer`) et gagne son bouton dans Données.

Au passage : `Player.sorareStarterOdds` était stocké mais n'apparaissait nulle
part hors du tableau des divisions ; il est maintenant sur la carte et la fiche
joueur, à côté du nôtre.

### Tests

Il n'existait aucun test sur le calcul de probabilité, ce qui explique que le
bug ait survécu. 27 ajoutés, dont les deux cas réels ci-dessus.

## 2026-08-14 (soir) — Onglet Compo : le moteur, pas seulement la structure

Retour sans détour : « pourquoi je n'ai pas un reflet exact des divisions
Sorare, des cartes de ma galerie déjà en line-up, et des compos possibles ? ».
Réponse honnête : la passe précédente avait livré la **structure** des divisions
sans jamais la relier à la galerie. L'onglet contenait deux blocs étrangers l'un
à l'autre — l'ancien « Composer » sur les quatre compétitions inventées de
`rules.ts`, et le tableau des divisions.

### Le vivier réel, division par division

`so5Leaderboard(slug).myBench` est la liste, établie par Sorare, des cartes de
la galerie réellement éligibles à **cette** division. Chaque entrée porte
`lockedForLeaderboard` (déjà engagée ailleurs, donc pas sélectionnable) et
`projectedScore(so5LeaderboardSlug:)` — la projection Sorare propre à cette
division, qui n'est pas son chiffre générique.

Chargé **à la demande** en dépliant une division : la game week en cours expose
76 leaderboards, tout précharger serait lent et gaspillé.

### Compo proposée, validée par Sorare

L'optimiseur LP existant (`optimizer.ts`) tourne désormais sur ce vivier au lieu
de la galerie filtrée par des règles écrites à la main. Et surtout :
`previewSo5Lineup` renvoie le verdict règle par règle de Sorare sur la compo
proposée. **On ne devine plus les règles de compo** — `rules.ts` ne sert plus
qu'à donner au solveur une forme (cinq cartes, un par poste, un capitaine).

L'écran montre le score projeté, le **delta vs la compo actuelle** (les cartes à
ajouter, celles à sortir) et le verdict Sorare. Un `gain` n'est calculé que si
la compo actuelle est chiffrable — sinon il reste nul plutôt que d'inventer un
écart égal à la totalité de la proposition.

### Cartes déjà engagées, visibles dans la galerie

`currentUser.blockchainCardsInLineups` alimente une pastille « en compo » sur
les cartes déjà alignées. Non bloquant : sans session Sorare le drapeau reste
faux, la galerie ne tombe pas.

### Retiré : le composeur sur compétitions fictives

Le sélecteur et le bouton « Composer » proposaient des compos pour des
compétitions qui n'existent pas forcément sur le compte. Supprimés, avec l'état
mort qui allait avec. Les compos sauvegardées restent consultables.

### Un vivier qui échoue le dit

Même leçon que les amicaux : quand le chargement du vivier échoue (typiquement
pas de session Sorare), la division affiche la raison au lieu de ne rien rendre.

### `npm run test:queries`

Le script qui avait débusqué trois requêtes mortes rejoint le repo. Il poste
chaque document GraphQL à l'API et distingue une erreur d'auth (forme valide)
d'un champ absent ou d'un dépassement de complexité. 16 documents, tous valides.

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
