# Interface screenshots

Captured from the real Chouette TV interface in a desktop browser at 1920 × 1080 on 15 October 2026. The interface remains in French. Images demonstrate navigation, not physical-TV playback validation.

Catalogue data comes from `node tests/preview.js --gallery`: 20 fictional channels, 24 films and 18 series, with original geometric SVG artwork generated locally by the fixture server. The guide uses the standard demo programmes. No private IPTV source, real account, personal photograph or third-party film poster is used.

- `live-tv.png`: channel catalogue and current programmes.
- `movies.png`: all-movies catalogue (first visible page).
- `series.png`: all-series catalogue (first visible page).
- `tv-guide.png`: programme timeline and navigation.

To refresh, run the demo server in a fresh browser session, configure its printed local URL with `demo` / `demo`, and navigate the actual interface. Inspect every image before committing. Exclude account/settings screens, source URLs, browser chrome and developer logs. Save PNGs without auxiliary metadata.
