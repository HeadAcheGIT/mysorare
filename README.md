# Cockpit — Sorare (mobile, sans serveur perso)

Effectif, probabilité de titularisation, projections, et compos optimisées par
compétition. Next.js + Postgres (Neon) + Vercel, installable comme une app sur
ton téléphone. Zéro machine à toi qui tourne.

## Comment l'app récupère tes données

Deux sources, aucune des deux ne dépend d'une connexion Sorare :

- **Ta galerie** vient de l'export CSV « my gallery » de SorareScore, importé
  depuis l'onglet **Données**. C'est la seule information que l'API Sorare
  réserve aux comptes connectés, et s'y connecter depuis Vercel est peu fiable :
  Sorare redéclenche la double authentification dès que l'IP change, ce qui
  arrive à chaque exécution en serverless.
- **Tout le reste** — photos, clubs et écussons, blessures, suspensions, scores
  récents, projection officielle Sorare, calendrier des game weeks — vient de
  l'API **publique** de Sorare, qui ne demande aucun jeton.

La connexion Sorare reste disponible dans l'onglet Données, mais elle est
optionnelle : l'app fonctionne entièrement sans.

## Ce que tu obtiens sur le plan gratuit

- **App accessible partout**, en HTTPS, sur `https://ton-projet.vercel.app`,
  protégée par mot de passe.
- **Onglet Semaine** : compte à rebours jusqu'à la clôture des compos, et une
  liste courte de ce sur quoi agir (indisponibles, valeurs sûres, joueurs en
  progression, cartes à vendre, poids morts, moins-values).
- **Galerie** : tes cartes avec photos, écussons, courbe de forme, filtres par
  poste, rareté et in-season, tri par score, forme, valeur ou nom.
- **Projections sans connexion** : calculées à partir du taux d'apparition sur
  les 5 et 15 derniers matchs du club et de la moyenne sur les matchs
  réellement joués, mélangées à la projection Sorare quand elle existe.
- **Synchro automatique une fois par jour** (limite du plan Hobby de Vercel :
  un cron par jour, déclenché quelque part dans l'heure programmée). Elle
  reprend là où la précédente s'est arrêtée, pour rester sous la limite de
  20 requêtes/minute de l'API publique.
- **Base Postgres gratuite** via Neon.

### Une clé API Sorare (gratuite) débloque le reste

L'API publique plafonne la complexité des requêtes à 500 (30 000 avec une clé)
et à 20 requêtes/minute (600 avec une clé). Concrètement, sans clé le
calendrier détaillé des matchs est hors budget et l'enrichissement se fait par
lots de 15 joueurs. Renseigner `SORARE_API_KEY` accélère tout d'un ordre de
grandeur — la demande se fait auprès de Sorare.

## Déploiement, étape par étape

### 1. Crée la base (Neon)

1. [neon.tech](https://neon.tech) → compte gratuit → nouveau projet.
2. Copie la **connection string** (bouton "Connect"), format
   `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`.

### 2. Pousse le code sur GitLab/GitHub

```bash
cd sorare-cockpit-mobile
git init && git add . && git commit -m "init"
git remote add origin <ton-repo>
git push -u origin main
```

### 3. Importe le projet sur Vercel

1. [vercel.com](https://vercel.com) → New Project → importe le repo.
2. Dans **Settings → Environment Variables**, ajoute :

| Variable | Obligatoire | Valeur |
|---|---|---|
| `DATABASE_URL` | oui | la connection string Neon |
| `APP_PASSWORD` | oui | le mot de passe qui protège l'app (voir ci-dessous) |
| `CRON_SECRET` | oui | une chaîne aléatoire **ASCII uniquement** (`openssl rand -hex 32`) |
| `SORARE_AUD` | non | `sorare-cockpit` |
| `SORARE_API_KEY` | non | lève les limites de l'API publique (voir plus haut) |
| `APIFOOTBALL_KEY` | non | seulement pour le bouton « compos officielles » |

`SORARE_EMAIL` et `SORARE_PASSWORD` ne sont plus nécessaires : la connexion
Sorare, si tu la veux, se fait directement dans l'app (onglet Données), code à
6 chiffres compris. Le mot de passe n'est jamais stocké, seul le jeton l'est.

`CRON_SECRET` doit être en ASCII pur : Vercel l'envoie dans un en-tête HTTP et
refuse de builder si la valeur contient un accent.

`APP_PASSWORD` est **obligatoire** : l'app est publique sur son URL Vercel, et
c'est la seule chose qui la protège (`middleware.ts` demande une
authentification HTTP sur toutes les pages et routes API). Sans cette variable,
chaque requête renvoie une erreur 500 — délibérément, plutôt que de laisser
l'app ouverte. Au premier accès, le navigateur affiche une fenêtre de connexion :
n'importe quel nom d'utilisateur convient, seul le mot de passe est vérifié.

3. **Settings → Functions → Fluid Compute** : active-le. Sans ça, le budget
   d'exécution par fonction reste très court sur Hobby ; avec Fluid Compute
   (gratuit), il monte à plusieurs dizaines de secondes — nécessaire pour que
   la synchro par lots ait le temps de tourner.
4. Déploie.

### 4. Les tables se créent toutes seules

Rien à faire : le build lance `prisma migrate deploy`, qui applique les
migrations de `prisma/migrations/` sur la base Neon à chaque déploiement.

Si `DATABASE_URL` n'est pas encore configurée, l'étape est simplement ignorée
et le build passe quand même — c'est l'app qui signalera la base manquante au
moment de l'utiliser, là où c'est exploitable.

Après avoir modifié `prisma/schema.prisma`, génère la migration correspondante
et commite-la ; elle s'appliquera au déploiement suivant :

```bash
npx prisma migrate dev --name decris-ton-changement
```

### 5. Premier lancement

1. Ouvre l'app, saisis le mot de passe `APP_PASSWORD`.
2. Onglet **Données** → « Importer ma galerie » → choisis l'export CSV
   « my gallery » téléchargé depuis SorareScore. L'import enchaîne
   automatiquement sur la récupération des photos et des stats.
3. Onglet **Données** → « Rafraîchir photos et stats » quand tu veux
   recalculer projections et game week sans réimporter.

Réimporte un CSV frais après chaque achat ou vente : l'import remplace la
galerie, les cartes absentes du fichier sont retirées.

### 6. Installe l'app sur ton téléphone

- **iPhone (Safari)** : ouvre l'URL Vercel → bouton Partager → « Sur l'écran
  d'accueil ».
- **Android (Chrome)** : ouvre l'URL → menu ⋮ → « Ajouter à l'écran
  d'accueil » (ou bannière d'installation automatique).

Ça se lance en plein écran, sans barre d'adresse, comme une vraie app.

## Marché — recherche et watchlist, à la demande

Pas de veille en continu, pas d'API X ou de websocket de prix : tout se
déclenche quand tu tapes dans l'app.

- **Recherche** : tape un nom de joueur → l'app appelle `SEARCH_PLAYERS` sur
  l'API Sorare à ce moment précis.
- **Prix** : bouton « Prix » → `PLAYER_MARKET` renvoie le plancher de prix
  (la plus petite annonce en cours) par rareté, à l'instant T.
- **Watchlist** : « + Suivre » sauvegarde le joueur en base (table
  `WatchlistItem`). « Tout vérifier » relance un appel prix pour chaque
  joueur suivi, en série — toujours à la demande, jamais en tâche de fond.

Pour les rumeurs, blessures, actu transferts : c'est le rôle de la
conversation avec Claude, pas de l'app. Poser la question directement marche
mieux qu'un flux automatisé — pas d'API X payante à intégrer, et Claude peut
chercher sur le web à la demande.

## Pourquoi la synchro est en deux temps

Une fonction serverless a un temps d'exécution limité par invocation. Un
appel API par joueur pour reconstruire la forme ne tient pas dans une seule
requête dès que l'effectif dépasse une poignée de cartes. Donc :

- `/api/sync` (rapide, 1-2 appels) : récupère l'effectif et le game week en
  cours.
- `/api/sync/batch` (répété) : traite ~6 joueurs par appel. Le bouton
  « Rafraîchir » de l'app boucle dessus jusqu'à ce que tout soit à jour — la
  barre de progression, c'est cette boucle.
- Le cron quotidien fait la même chose côté serveur, mais dans le budget
  d'une seule invocation : s'il ne finit pas tout l'effectif en une passe, le
  reste attend le lendemain — ou ton prochain tap sur « Rafraîchir ».

Pour un effectif de moins de 60-80 cartes avec Fluid Compute activé, une
synchro complète (bouton manuel) prend generalement une poignée de secondes à
une minute.

## Le modèle de probabilité de titularisation

Pas un seul chiffre brut comme Sorare, mais une agrégation de plusieurs
sources indépendantes, avec un score de confiance basé sur leur accord.
`Projection.pStart` est le résultat pondéré ; `Projection.confidence` (0-1)
chute quand les sources se contredisent, et grimpe avec le nombre de sources
qui votent. Chaque lecture individuelle est conservée dans
`ProjectionSource` — utile pour comprendre *pourquoi* le modèle hésite sur
un joueur, pas juste *que* le score final est incertain.

Sources actives aujourd'hui :

- **`internal_form`** — le modèle historique (minutes/titularisations
  pondérées par la récence), voir `lib/services/projections.ts`.
- **`injury_status`** — pas un vote parmi d'autres : une blessure ou
  suspension active écrase tout le reste et force `pStart` à 0.
- **`fixture_congestion`** — heuristique sur la fréquence des matchs
  récents du joueur (3+ matchs en 8 jours → risque de rotation). Approximatif :
  il ne connaît que l'historique de ce joueur, pas le calendrier réel du club.

Sources préparées dans le schéma mais **non implémentées**, honnêtement :

- **`squad_depth`** (profondeur de poste) — demanderait l'effectif complet du
  club, pas juste tes cartes. Non branché.
- **`external_probable`** (compos probables Sofascore/Fotmob) — demanderait
  de scraper des sites tiers, ce qui pose une vraie question de conditions
  d'utilisation que ce projet ne contourne pas silencieusement. Non branché.

Si tu veux activer ces deux dernières, il faudra soit une API légale pour la
première (aucune trouvée à ce jour), soit un accord/API officielle pour la
seconde plutôt qu'un scraper.

Un humain garde toujours le dernier mot : `Override` écrase l'agrégat entier
pour un joueur donné, peu importe ce que disent les sources.

### La 3e source : compos officielles via API-Football

Pas de scraping — [api-sports.io](https://dashboard.api-football.com) est une
vraie API avec 100 requêtes/jour gratuites, tous endpoints inclus. Signe-toi,
récupère ta clé, mets-la dans `APIFOOTBALL_KEY`.

**Limite à connaître avant d'y compter** : l'endpoint compos ne donne que la
compo **officielle confirmée**, publiée par le club généralement 20 à 40
minutes avant le coup d'envoi — jamais avant. Ce n'est donc pas un outil de
planification à J-2 ou J-3, mais un filet de sécurité de dernière minute :
le bouton « Vérifier les compos officielles » (onglet Synchro) est fait pour
être tapé toi-même, à la main, dans la demi-heure qui précède le verrouillage
de ta compo Sorare — pas automatisable via le cron quotidien, qui ne peut pas
viser cette fenêtre précisément sur le plan gratuit Vercel.

Ce que ça fait concrètement : pour chaque club de ton effectif, une requête
`/fixtures` (prochain match) puis `/fixtures/lineups` (compo, si publiée) —
regroupées par club, pas par joueur, pour économiser le quota. Un titulaire
confirmé écrase le modèle interne (poids 5, quasi absolu) ; un joueur absent
de la compo passe à `pStart` quasi nul. Les mappings joueur/club vers les ids
API-Football sont mis en cache en base (`ExternalTeamMapping`,
`ExternalPlayerMapping`) après la première recherche, pour ne pas re-consommer
de quota à chaque vérification.

## L'optimiseur

Programme linéaire en variables binaires (`javascript-lp-solver`) : maximise
le score projeté + bonus capitaine, sous contraintes de taille, postes,
rareté, clubs, cartes in-season, plafond de L15 cumulé. Les règles par
compétition sont dans `lib/services/rules.ts` — ce sont des points de départ,
recopie les vraies valeurs depuis la page de règles de chaque compétition sur
Sorare, elles changent d'une saison à l'autre.

## Si le schéma GraphQL a dérivé

```bash
curl -o schema.graphql https://api.sorare.com/graphql/schema
```

Le client remonte l'erreur avec le nom exact du champ fautif. La correction
se fait dans `lib/sorare/queries.ts`, en général une ligne.

## Sécurité

- `.env` n'est jamais commité (`.gitignore` déjà en place) ; en prod les
  secrets vivent uniquement dans les variables d'environnement Vercel.
- `/api/cron` exige le header `Authorization: Bearer <CRON_SECRET>` — Vercel
  l'envoie automatiquement pour les cron jobs qu'il déclenche lui-même.
- Si tu as un jour collé ton mot de passe Sorare en clair quelque part (chat,
  fichier partagé…), change-le sur sorare.com avant de continuer, et active
  la 2FA si ce n'est pas déjà fait.

## Suite logique

- Marché & alertes transferts : la requête `CardMarket` existe côté Python
  dans la version précédente du projet, à porter ici si tu veux ce module.
- Comparaison compo jouée / meilleure compo possible a posteriori.
- Notifications push quand une projection change fortement avant un game
  week (nécessite un provider push, ex. OneSignal ou Web Push natif).
