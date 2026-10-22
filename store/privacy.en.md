# Chouette TV privacy information

Effective 22 October 2026. Publisher: **Leroy Pierre-Yves**. The permanent
version of this notice is available at
<https://github.com/ipaifix/chouette-tv/blob/main/store/privacy.en.md>.
Project support: **chouette-tv@ouifix.fr**.

Chouette TV is a player. It supplies no channels, subscriptions, playlists or
source accounts. Users configure their own authorized sources. There is no
Chouette TV account, project analytics or advertising service in this version.

## Data on the device

The application stores source server addresses, account credentials, playlist
and programme-guide URLs, catalogue/guide data, profile names and preferences,
favourites, searches, followed series and playback positions. These data enable
source access and the requested playback/personalization features. Credentials
are not encrypted by the application. Prefer HTTPS sources. HTTP is also accepted.

Storage uses localStorage, Tizen preferences and app-private files. Playlist
URLs and cached media URLs may themselves contain access credentials. Data stay
until they are replaced or erased, subject to storage failures and platform
behaviour. There is no automatic expiry of all user data.

## Network recipients

The configured source receives account, catalogue, guide and playback requests,
the device's IP address and technical client information. Image hosts referenced
by the source also receive image requests. Their own privacy rules apply.
The project operates no content server and receives no application telemetry.
The desktop development player may request hls.js from jsDelivr. Samsung TV
playback uses AVPlay.

## Erasure and support

Open Réglages (Settings), Données et confidentialité (Data and privacy), then
Effacer toutes les données (Erase all data), and confirm. This removes this
application's known settings, profiles, history and caches from localStorage,
Tizen preferences and private files. It also attempts to delete known files
left in the shared documents folder by older development versions. It preserves
other application namespaces. After success the application reloads into setup.
Storage-access failures are reported instead of a claim of complete erasure.

New installations never import the old shared files automatically. Removal
through the TV's uninstall function still requires verification on each target
model, especially when upgrading an old development installation.

Use the support address above for questions and rights requests. The project
cannot remotely erase device or source-provider data. Do not send passwords,
private playlists or unredacted logs. Contact the source provider for data it
holds or for revocation of compromised source credentials.
