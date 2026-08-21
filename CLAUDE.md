# Instructions pour les sessions Claude sur ce dépôt

Consignes du propriétaire du projet, à suivre par défaut à chaque session
de travail sur ce dépôt — pas seulement quand on te le redemande.

## Push en prod

Il n'y a pas d'environnement de staging : le déploiement se fait par push
sur `origin main` (GitLab → Vercel, auto-deploy — voir README.md,
« Déploiement, étape par étape »). Autorisation permanente donnée par
l'utilisateur : à la fin d'un travail terminé et vérifié dans une session,
commit puis `git push origin main` sans redemander confirmation à chaque
fois.

Avant de pousser, le travail doit être réellement fini et vérifié — cette
autorisation porte sur *ne pas redemander la permission de pousher*, pas
sur *sauter la vérification* :

- `npm test` et `npx tsc --noEmit` passent.
- `npm run build` passe quand c'est raisonnable de le lancer (toujours pour
  un changement qui touche des routes API, la base, ou une dépendance).
- Un changement qui touche des requêtes GraphQL Sorare est passé par
  `npm run test:queries`.
- Un changement de comportement observable a été vérifié en conditions
  réelles quand c'est possible (voir la note dans l'historique du dépôt sur
  la vérification en local avant de conclure qu'un correctif marche).

Ce qui reste soumis à confirmation malgré cette autorisation, sans
changement : `git push --force`, toute réécriture d'historique, la
suppression de branches, et toute action listée comme nécessitant une
permission explicite ailleurs dans les règles de sécurité (au-delà du push
normal sur `main`, cette autorisation ne s'étend à rien d'autre).

## Tout documenter

Chaque session qui change le comportement de l'app — une fonctionnalité,
un correctif de fond, pas une faute de frappe — se termine par une entrée
dans `CHANGELOG.md`, écrite dans le format déjà en place en haut de ce
fichier : narratif, en français, daté, orienté « pourquoi » plutôt que
liste de commits. Une entrée qui vaut la peine explique une vraie décision
ou une vraie découverte (un chiffre mesuré, un piège évité, un compromis
choisi) — pas juste « ajout de X ».

En plus du changelog :

- `README.md` est mis à jour dès qu'un comportement qu'il décrit change
  réellement (une nouvelle variable d'environnement, une limite d'API
  différente, une fonctionnalité qui remplace une autre).
- Le message de commit reste soigné et explique le pourquoi, pas seulement
  le quoi — c'est ce que `CHANGELOG.md` et l'historique git ont toujours
  fait sur ce dépôt jusqu'ici, à continuer.

Un correctif trivial (faute de frappe, réglage mineur sans impact
observable) n'a pas besoin de sa propre entrée de changelog.
