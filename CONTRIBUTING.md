# Contribuer

Utiliser les modules `app/js/*.js`, reconstruire le bundle puis exécuter
`./tools/check.sh`. Le projet utilise des IIFE JavaScript et les API Tizen ;
éviter les dépendances qui imposent un navigateur récent sans validation TV.

Les régressions importantes doivent être testées hors ligne avec des APIs
simulées et des données fictives. Décrire les essais TV réellement effectués,
le modèle et les limitations ; ne pas présenter une simulation comme un essai matériel.

Garder les sources IPTV, comptes, certificats et visuels privés hors du dépôt.
Les exemples réseau utilisent des domaines réservés (`example.invalid`,
`example.test`) et des accès fictifs. Ne pas publier de catalogue de fournisseur.

Toute nouvelle source ou dépendance doit avoir une licence compatible et être
documentée. Toute nouvelle collecte/transmission de
données exige une mise à jour de la documentation de confidentialité.
