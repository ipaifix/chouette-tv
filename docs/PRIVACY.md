# Données et confidentialité — Chouette TV

Document de fonctionnement pour la version préparée le 14 octobre 2026.
À adapter si des services, de la télémétrie ou des fonctions réseau sont ajoutés.

L’application ne fournit pas de compte Chouette TV ni de serveur de contenus.
Elle ne contient pas de fournisseur, playlist ou identifiants préconfigurés.
Les profils de personnes sont locaux à l’appareil.

## Données enregistrées sur l’appareil

- Adresse du serveur IPTV, identifiant et mot de passe ; URL de playlist et EPG.
- Cache du catalogue et du guide, métadonnées et URL nécessaires à la lecture.
- Noms de profils, langues, favoris, recherches, suivis et positions de reprise.

La persistance utilise localStorage, les préférences Tizen et des fichiers dans
`documents/`. Les identifiants de connexion sont nécessaires au fonctionnement
et **ne sont pas chiffrés par l’application**. Les identifiants opaques des
sources/profils évitent certaines répétitions ; ils ne rendent pas anonymes
les données privées d’un utilisateur.

Les URL Xtream sont reconstruites depuis les réglages quand possible. Une
playlist M3U peut contenir des accès dans ses URL ; ces URL peuvent rester dans
les caches et favoris. Les données peuvent survivre à une réinstallation de
développement via les fichiers `documents/`. Ne pas promettre qu’une simple
désinstallation efface toutes les données.

## Destinataires et connexions

Le fournisseur configuré reçoit les requêtes de compte, catalogue, guide et
lecture, ainsi que l’adresse IP et les informations techniques du client.
Les hôtes des affiches/logos référencés dans le catalogue reçoivent aussi les
requêtes d’images. Les règles de confidentialité de ces tiers s’appliquent.
Préférer HTTPS ; l’application accepte également HTTP selon la source.

Le lecteur de développement dans un navigateur peut télécharger hls.js depuis
jsDelivr. Cela ajoute une requête à ce service. Le lecteur Samsung utilise
AVPlay. Aucun service de télémétrie du projet n’est intégré dans cette version.

## Effacement et support

L’interface permet de changer les réglages et certaines données de visionnage.
Elle ne propose pas encore de bouton d’effacement intégral vérifié couvrant
toutes les couches Tizen. Avant cession d’un téléviseur, effacer les données de
l’application et les fichiers persistants concernés ; vérifier l’effacement
sur le modèle utilisé. Révoquer auprès du fournisseur tout accès compromis.

Ne jamais joindre de compte, playlist privée, journal brut ou capture montrant
des identifiants à une issue publique. Fournir des exemples fictifs sur
`example.invalid`, une description et la version utilisée.

Avant publication en store, renseigner l’identité et le contact publics du
responsable ainsi qu’une URL stable de cette politique. Ces coordonnées ne
sont pas encore définies dans cette préparation.
