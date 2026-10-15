# Outils de développement

## Bundle et contrôles

```sh
./tools/build-bundle.sh
./tools/check.sh
```

Node.js 18+ et Bash sont requis. `NODE` peut désigner un autre exécutable Node.
Les contrôles vérifient syntaxe, bundle, régressions et export public sans
contacter de fournisseur. `build-bundle.sh --check` ne modifie pas le bundle.

## Variantes et export

```sh
node tools/build-variant.js branding/public.json dist/chouette-tv/app
node tools/privacy-audit.js --history
node tools/prepare-public.js dist/public-source
node tools/privacy-audit.js --tree dist/public-source
```

Les dossiers de sortie doivent être absents. La configuration de variante
personnelle et les comptes restent hors des sources publiques. L’export est
destiné à une revue locale ; l’option `--release` exige le fichier de licence.
Voir [BUILDING](../docs/BUILDING.md) et
[PUBLICATION](../docs/PUBLICATION.md).

## Parcours navigateur et mesures

`node tests/preview.js` démarre un serveur sur localhost. Configurer l’adresse
affichée comme serveur Xtream, avec `demo` / `demo`. La démonstration ne contacte
pas de fournisseur et ne fournit pas de flux vidéo.

`node tests/preview.js --gallery` remplit les grilles de 20 chaînes, 24 films et
18 séries fictifs avec des affiches géométriques locales pour les captures.

`node tests/browser-smoke.js` est facultatif : il nécessite Playwright et son
binaire Firefox installés séparément. Il utilise un profil neuf, bloque les
requêtes externes et contrôle configuration, navigation et rechargement.
`AUDIT_SCREENSHOT` désigne éventuellement une capture locale, à garder hors Git.

`node tests/catalog-benchmark.js` génère 40 000 entrées fictives pour mesurer
recherche et mémoire du processus sur ordinateur. `node tools/audit-netflix-light.js`
exécute les diagnostics synthétiques. Ces mesures ne remplacent pas un profilage TV.

## EPG facultatif

`make-channels.js` rapproche les identifiants d’une playlist d’un checkout local
de [iptv-org/epg](https://github.com/iptv-org/epg). `xmltv-to-json.js` convertit
un guide XMLTV vers le format JSON du lecteur.

```sh
node tools/make-channels.js private/playlist.m3u /tmp/epg/sites > /tmp/channels.xml
node tools/xmltv-to-json.js /tmp/guide.xml > /tmp/epg.json
```

La playlist, les droits sur les programmes et les outils/grabbers externes
restent à la charge de l’utilisateur. Aucun EPG ni catalogue n’est embarqué.
`epg-workflow.yml` est un exemple manuel pour un dépôt de données séparé ; il
produit un artefact à examiner et ne déploie rien. Copier également `guide-format.js`
et le parseur de playlist de l’application. Les sites sont triés par défaut ;
`EPG_SITE_ORDER` fixe une priorité de sites séparés par des virgules et
`EPG_SKIP_SITES` permet d’en exclure. L’exemple n’est pas activé dans la CI du lecteur.

