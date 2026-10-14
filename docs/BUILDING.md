# Builds et personnalisation

Prérequis : Node.js 18 ou plus récent et Bash. Aucun paquet npm n’est nécessaire
pour le bundle, les variantes ou les contrôles hors ligne.

## Vérifier les sources

```sh
./tools/build-bundle.sh
./tools/check.sh
```

`NODE` permet de choisir un exécutable Node. Le bundle est déterministe et
remplacé après succès ; `./tools/build-bundle.sh --check` contrôle sa concordance.
La CI exécute les contrôles et l’audit du futur export public.

## Préparer Chouette TV

```sh
node tools/build-variant.js
```

Le projet Tizen non signé est créé dans `dist/chouette-tv/app/`. Le nom,
les trois icônes, le manifeste et les clés de stockage proviennent de
`branding/public.json`. L’outil refuse d’écraser un dossier existant.
Pour un autre dossier :

```sh
node tools/build-variant.js branding/public.json dist/chouette-test/app
```

## Préparer une autre version

Copier `branding/custom.example.json` dans `private/personal.json`, adapter ses
champs et placer ses visuels PNG près de cette configuration. `private/` est
ignoré et exclu de l’export public. La configuration n’accepte aucun champ de
compte ou de source IPTV : les accès se saisissent sur le téléviseur.

```sh
node tools/build-variant.js private/personal.json dist/personal/app
```

- `name` : nom affiché dans l’interface et le manifeste.
- `slug` : nom du dossier/paquet de sortie.
- `packageId` : dix caractères alphanumériques, distincts pour deux applications coexistantes.
- `appSuffix` : suffixe de l’identifiant Tizen, généralement `iptv`.
- `widgetId` : URI d’identification. `example.org` est provisoire, pas un site de projet.
- `storageNamespace` : identifiant stable et unique des données locales.
- `legacyStorageNamespace` : `null` pour une version indépendante ; renseigner
  uniquement pour une migration délibérée de l’ancienne version.
- `icon`, `icon117`, `icon512` : chemins relatifs à la configuration ; PNG
  carrés de 512, 117 et 512 pixels. Les métadonnées auxiliaires sont retirées au build.

Changer un identifiant ou le namespace peut rendre les anciennes données
inaccessibles ; fixer ces champs avant la première diffusion. Le namespace
évite les imports involontaires, mais ne chiffre pas les données.

## Signature et essai Samsung

Ouvrir le dossier `app/` généré avec l’extension Tizen TV ou Tizen Studio,
configurer localement son certificat, puis construire le paquet `.wgt`.
Le tooling fourni prépare les sources ; il ne signe, n’installe ni ne soumet
de paquet. La configuration utilise Debug et un profil de signature vide.
Pour une diffusion, régler le mode Release et le profil approprié dans cette
copie après [vérification du dossier de publication](PUBLICATION.md).

Le package provisoire public est `ChouetteTV`, application `ChouetteTV.iptv`.
Confirmer l’identité finale avec le parcours Samsung avant diffusion.
Voir [configuration Samsung](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html).

Tester sur la TV minimale visée : AVPlay, formats, pistes audio/sous-titres,
télécommande, veille/reprise, réseau indisponible et stockage plein. Les tests
simulés ne remplacent pas cette qualification.
