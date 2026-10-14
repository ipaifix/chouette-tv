/* Local-only fixture server for manual Firefox/remote-control smoke tests.
 * No provider is contacted. Never package this server with the application. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../app');
const stress = process.argv.includes('--stress');
const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, origin);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/$WEBAPIS/webapis/webapis.js') {
        res.setHeader('Content-Type', 'application/javascript');
        res.end('/* Desktop Firefox uses HTML5 playback. */');
        return;
    }
    if (url.pathname === '/player_api.php') {
        const logo = origin + '/icon-117.png';
        const responses = {
            get_live_categories: [{ category_id: 'tv', category_name: 'TV démo' }],
            get_live_streams: Array.from({ length: stress ? 10000 : 12 }, (_, i) => ({ stream_id: i + 1,
                name: 'Démo TV ' + (i + 1), category_id: 'tv', stream_icon: logo })),
            get_vod_categories: [{ category_id: 'films', category_name: 'Films démo' }],
            get_vod_streams: Array.from({ length: stress ? 54000 : 1 }, (_, i) => ({ stream_id: i + 2,
                name: 'Démo Film ' + (i + 1), category_id: 'films', stream_icon: logo, container_extension: 'mp4' })),
            get_series_categories: [{ category_id: 'series', category_name: 'Séries démo' }],
            get_series: Array.from({ length: stress ? 20000 : 1 }, (_, i) => ({ series_id: i + 3,
                name: 'Démo Série ' + (i + 1), category_id: 'series', cover: logo })),
            get_vod_info: { info: { plot: 'Deux amis partent explorer une île oubliée. Une aventure de démonstration pour tester la fiche du film.', year: '2026', duration: '01:42:00', genre: 'Aventure', cast: 'Camille Martin, Alex Dupont', original_language: 'en', movie_image: logo } },
            get_series_info: { info: { name: 'Démo Série', plot: 'Une série de démonstration en deux saisons.', genre: 'Comédie', original_language: 'en' },
                episodes: { '1': Array.from({ length: stress ? 300 : 3 }, (_, i) => i + 1).map(n => ({ id: String(30 + n), title: 'Démo Épisode ' + n, episode_num: n, season: 1, container_extension: 'mp4' })),
                    '2': [{ id: '41', title: 'Le retour', episode_num: 1, season: 2, container_extension: 'mp4' }] } }
        };
        res.setHeader('Content-Type', 'application/json');
        if (stress) {
            responses.get_live_streams.push({ stream_id: 10001, name: '▼--- FRANCE ---▼', category_id: 'tv' });
            responses.get_live_streams.push({ stream_id: 10002, name: '**** SPORTS ****', category_id: 'tv' });
        }
        res.end(JSON.stringify(responses[url.searchParams.get('action')] || []));
        return;
    }
    if (url.pathname === '/demo.m3u') {
        res.setHeader('Content-Type', 'text/plain');
        res.end('#EXTM3U\n' + Array.from({ length: 12 }, (_, i) =>
            `#EXTINF:-1 tvg-id="${i + 1}" tvg-logo="${origin}/icon-117.png" group-title="TV démo",Démo M3U ${i + 1}\n${origin}/demo-${i + 1}.ts`).join('\n'));
        return;
    }
    if (url.pathname === '/xmltv.php') {
        const data = {};
        for (let i = 1; i <= 11; i++) {
            data[String(i)] = Array.from({ length: 16 }, (_, n) => ({
                start: Date.now() - 1800000 + n * 3600000, stop: Date.now() + 1800000 + n * 3600000,
                title: ['Le journal', 'Découverte', 'Cinéma', 'Culture'][n % 4] + ' · chaîne ' + i
            }));
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return;
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
    }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port} — identifiants fictifs demo/demo`));
