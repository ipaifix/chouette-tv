# Chouette TV

Lecteur IPTV pour **Samsung Smart TV (Tizen)**.
Il ne fournit aucune chaîne, playlist, abonnement ou compte.
Au premier lancement, configurez votre source dans **Réglages**.

Le code est distribué sous licence MIT. Chouette TV est le nom et le branding
publics ; des variantes locales peuvent utiliser une autre identité sans
modifier les sources de l’application.

## Utilisation

- Xtream Codes : serveur, identifiant et mot de passe ; direct, films et séries.
- M3U/M3U8 : URL de playlist, avec catégories `group-title`.
- Guide : URL EPG configurée, guide Xtream ou `url-tvg` de la playlist.
- Profils locaux, langues préférées, favoris et séries suivies.
- Reprise des films/épisodes, recherche et fiches fournies par la source.
- Guide TV paginé, aperçu du direct et réglages audio/sous-titres.

Le compte Xtream est prioritaire. Sans cache, l’application charge le catalogue
depuis la source ; avec un cache compatible, elle l’affiche au démarrage.
**Réglages → Actualiser le catalogue** recharge les données. Une erreur réseau
conserve le dernier contenu disponible lorsque possible. Une rubrique Xtream
indisponible peut donner un catalogue partiel.

Les données sont locales à l’appareil et séparées par personne/source. Les
accès restent dans les réglages persistants ; ils ne sont pas chiffrés par
l’application. Une réinstallation debug peut conserver des fichiers.
Lire [la documentation de confidentialité](docs/PRIVACY.md).

## Télécommande

- Catalogue : flèches pour naviguer, OK pour ouvrir/lire, BACK pour remonter.
- Lecture : OK ouvre les commandes ; flèches et OK pour Aspect, Audio/ST et Favori.
- Direct : CH± change de chaîne ; le bouton Favori ajoute ou retire une chaîne.
- Films/épisodes : commandes de pause/avance ; BACK ferme les commandes puis revient au catalogue.
- Guide : ← → change la fenêtre, ↑ ↓ navigue, OK lance le direct.

L’enchaînement des épisodes est désactivé initialement et configurable par
personne. Aucun replay/catch-up n’est inclus.

## Développement et variantes

Node.js 18+ et Bash suffisent aux contrôles hors ligne :

```sh
./tools/build-bundle.sh
./tools/check.sh
node tools/build-variant.js
```

Le build public non signé est dans `dist/chouette-tv/app/`. Le fichier
`branding/public.json` définit nom, icônes, identité Tizen et namespace de
stockage. Une configuration ignorée dans `private/` permet une autre version.
Voir [builds et personnalisation](docs/BUILDING.md).

L’application utilise des modules JavaScript IIFE, un bundle concaténé et
AVPlay sur Samsung ; la vidéo HTML5 sert au développement navigateur.
Éditer les modules sources, puis reconstruire `app/js/app.bundle.js`.

Pour une démonstration locale sans fournisseur : `node tests/preview.js`, puis
ouvrir l’adresse affichée et saisir les accès fictifs `demo` / `demo`.
Les fixtures fournissent des métadonnées et visuels locaux, sans vidéo réelle.
Voir [les outils](tools/README.md).

## Performance et limites

Le catalogue se charge progressivement ; les imports de recherche/guide sont
découpés en travaux annulables. Les séries, historiques, cartes et images ont
des budgets pour limiter l’accumulation sur les TV. Cela ne garantit pas une
consommation de RAM donnée : réseau, moteur vidéo et décodage des images
restent dépendants du matériel.

Les contrôles automatisés simulent Tizen/AVPlay et ne qualifient pas les codecs,
pistes, veille/reprise ou stockage plein sur TV. Le User-Agent de playlist ne
peut être appliqué que sur TV ; le Referrer M3U n’est pas appliqué par AVPlay.

## Publication et contributions

Préparer une copie de sources avec une liste de fichiers autorisés :

```sh
node tools/privacy-audit.js --history
node tools/prepare-public.js
node tools/privacy-audit.js --tree dist/public-source
```

Ces outils ne publient rien. Ils excluent l’historique Git, les fichiers
privés et les données de déploiement. Les images/documents exigent également
une revue visuelle.

Voir [le dossier de publication](docs/PUBLICATION.md),
[contribuer](CONTRIBUTING.md), [sécurité](SECURITY.md) et
[la description préparée pour le store](store/listing.fr.md).
