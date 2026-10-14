# Préparer la publication

La préparation est locale. Aucun dépôt public, paquet signé ou soumission
Samsung n’est créé par les outils.

## Export public contrôlable

```sh
./tools/check.sh
node tools/privacy-audit.js --history
node tools/prepare-public.js
node tools/privacy-audit.js --tree dist/public-source
```

L’export `dist/public-source/` utilise une liste explicite de fichiers. Il
contient un projet Chouette TV reconstruit, les tests et la documentation.
Il exclut `.git`, les configurations personnelles, notes de comptes,
brouillons de courriels, photos, anciens screenshots, fichiers graphiques
locaux, rapports issus d’une source réelle, playlists, paquets signés et état
de déploiement. Il ne retire rien de la copie de travail d’origine.

Le scanner signale uniquement fichiers/objets, lignes et types d’anomalie,
jamais les valeurs sensibles. Il recherche accès connus, clés/tokens usuels,
URL authentifiées, adresses personnelles, chemins de compte et IP privées.
Pour ajouter des valeurs spécifiques à surveiller, créer localement
`private/audit-patterns.json` contenant un tableau de chaînes d’au moins cinq
caractères. Ne jamais publier ce fichier ni le rapport d’historique brut.

Un résultat sans signalement signifie « aucune correspondance aux règles ».
Ce n’est pas une preuve absolue d’absence de secret. Vérifier manuellement
les images, documents, métadonnées, pièces jointes et futures contributions.
Les PNG du branding généré ne conservent pas les métadonnées auxiliaires.

## Historique Git et identité

L’audit `--history` inspecte tous les objets locaux, y compris ceux accessibles
par reflog ou devenus inaccessibles, et compte les identités auteur/committer
sans afficher leurs adresses. Les noms/emails de commits sont des données
publiques si cet historique est poussé. `.gitignore` ne nettoie ni les fichiers
déjà suivis ni l’historique.

Les signalements distinguent `branch-or-tag` (branche locale/distante ou tag),
`local-reference-only` (autre référence locale, notamment snapshot) et
`local-object-only` (objet conservé sans référence actuelle). Un objet local
sans référence n’est pas envoyé par un push normal ; sa présence ne prouve
pas une exposition distante. Ne pas transmettre le dossier `.git` en archive
ni pousser toutes les références avec `--mirror` depuis la copie privée.

Le dépôt public doit utiliser une identité Git publique choisie. Avant chaque
publication, vérifier les fichiers suivis avec `git status`, puis exécuter les
contrôles. Un accès déjà publié doit être révoqué ; supprimer sa ligne ou
réécrire l’historique ne suffit pas.

## Points à finaliser

- Disponibilité du nom Chouette TV : la recherche Web ne vaut pas une recherche de marques.
- URL et compte public du projet ; adresse/contact publics choisis.
- URI et identifiants Samsung finaux ; certificat de diffusion conservé hors Git.
- Politique de confidentialité avec contact et URL publics.
- Description du store, screenshots avec données fictives et droits de tous les assets.
- Source de test pour reviewers : aucun ancien flux n’est présenté comme garanti disponible ou autorisé.
- Qualification sur les TV cibles et vérification d’un premier lancement sans donnée personnelle.

Pour préparer une copie finale :

```sh
node tools/prepare-public.js dist/release-source --release
```

Ce contrôle vérifie la présence de `LICENSE`. Il ne certifie pas l’acceptation
Samsung ou l’absence de toute donnée personnelle. Examiner la copie finale
avant de la publier.
