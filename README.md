# Cockpit — Sorare (mobile, sans serveur perso)

Effectif, probabilité de titularisation, projections, et compos optimisées par
compétition. Next.js + Postgres (Neon) + Vercel, installable comme une app sur
ton téléphone. Zéro machine à toi qui tourne.

## Ce que tu obtiens sur le plan gratuit

- **App accessible partout**, en HTTPS, sur `https://ton-projet.vercel.app`.
- **Synchro automatique une fois par jour** (limite du plan Hobby de Vercel :
  les cron jobs ne peuvent tourner qu'une fois par jour, et Vercel peut les
  déclencher n'importe quand dans l'heure programmée, pas à la seconde
  près).
- **Bouton « Rafraîchir » dans l'app** pour forcer une synchro complète à la
  demande, n'importe quand.
- **Base Postgres gratuite** via Neon (généreux en usage perso).

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

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la connection string Neon |
| `SORARE_EMAIL` | ton email Sorare |
| `SORARE_PASSWORD` | ton mot de passe (change-le si tu l'as déjà partagé quelque part) |
| `SORARE_AUD` | `sorare-cockpit` |
| `SORARE_API_KEY` | vide pour commencer |
| `CRON_SECRET` | une chaîne aléatoire (`openssl rand -hex 32`) |
| `APP_PASSWORD` | le mot de passe qui protège l'app (voir ci-dessous) |

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

Ouvre l'app, onglet **Synchro** → « Rafraîchir toutes les données ». Deux cas :

- Ça tourne et remplit une barre de progression → tu es bon, va sur l'onglet
  **Effectif**.
- `2FA required` dans les logs → va chercher le code reçu par email, mets-le
  dans `SORARE_OTP` sur Vercel, redéploie, relance la synchro, puis revide
  `SORARE_OTP` (le token tient 30 jours une fois émis).

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
