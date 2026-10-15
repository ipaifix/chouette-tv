/* Local-only fixture server for manual Firefox/remote-control smoke tests.
 * No provider is contacted. Never package this server with the application. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../app');
const stress = process.argv.includes('--stress');
const gallery = process.argv.includes('--gallery');
const galleryNames = {
    live: ['Culture', 'Découverte', 'Nature', 'Cinéma', 'Histoire', 'Voyages', 'Sciences', 'Musique', 'Évasion', 'Cuisine', 'Spectacles', 'Sports', 'Monde', 'Jeunesse', 'Océans', 'Montagne', 'Savoirs', 'Arts', 'Planète', 'Horizons'],
    vod: ['Les lumières du port', 'La dernière escale', 'Un été ailleurs', 'Au-delà des dunes', 'Le chemin des étoiles', 'La ville endormie', 'Les jours bleus', 'Une île en hiver', 'Le grand départ', 'Demain, la mer', 'Sous les aurores', 'Le jardin secret', 'La ligne des crêtes', 'Les passagers du vent', 'Une nuit à Lisbonne', 'Le temps des lucioles', 'La route du nord', 'Le phare oublié', 'Les heures dorées', 'Un monde plus loin', 'Le chant des vagues', 'Le refuge', 'Les portes du ciel', 'L’autre rive'],
    series: ['Les veilleurs', 'Carnets de voyage', 'La vallée', 'Chroniques du large', 'À contretemps', 'Les nouveaux mondes', 'Quartier libre', 'L’atelier', 'Les chemins de traverse', 'Entre deux rives', 'Les saisons du ciel', 'Le bureau des rêves', 'En pleine nature', 'Les voix de la ville', 'Au fil de l’eau', 'L’expédition', 'La constellation', 'Les années lumière']
};
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function galleryArtwork(type, index) {
    const colors = [['#112842', '#49b6d0'], ['#362047', '#e59ac1'], ['#173c38', '#8fd2a0'], ['#433122', '#e6bc6d'], ['#252849', '#99a8f2'], ['#42212b', '#ed8c87']][index % 6];
    const title = galleryNames[type][index % galleryNames[type].length];
    const words = title.split(' '), cut = Math.ceil(words.length / 2);
    const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720"><rect width="480" height="720" fill="${colors[0]}"/><circle cx="${120 + index % 4 * 65}" cy="200" r="100" fill="${colors[1]}" opacity=".8"/><path d="M0 470L170 250 340 470 480 330V720H0Z" fill="${colors[1]}" opacity=".35"/><path d="M0 560L270 360 480 550V720H0Z" fill="#070d19" opacity=".6"/><text x="32" y="53" fill="white" font-family="Arial,sans-serif" font-size="22" letter-spacing="5">CHOUETTE · DEMO</text><text x="32" y="610" fill="white" font-family="Arial,sans-serif" font-size="32" font-weight="bold">${escapeXml(lines[0])}</text><text x="32" y="652" fill="white" font-family="Arial,sans-serif" font-size="32" font-weight="bold">${escapeXml(lines[1])}</text></svg>`;
}
const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, origin);
    res.setHeader('Cache-Control', 'no-store');
    if (gallery && url.pathname.startsWith('/demo-art/')) {
        const match = /^\/demo-art\/(live|vod|series)\/(\d+)\.svg$/.exec(url.pathname);
        if (!match) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(galleryArtwork(match[1], Number(match[2]))); return;
    }
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
        if (gallery && !stress) {
            for (const [type, action, category] of [['live', 'get_live_streams', 'tv'], ['vod', 'get_vod_streams', 'films'], ['series', 'get_series', 'series']]) {
                responses[action] = galleryNames[type].map((name, i) => ({
                    [type === 'series' ? 'series_id' : 'stream_id']: i + 1,
                    name: (type === 'live' ? 'Démo ' : '') + name, category_id: category,
                    stream_icon: origin + '/demo-art/' + type + '/' + i + '.svg',
                    cover: origin + '/demo-art/' + type + '/' + i + '.svg', container_extension: 'mp4'
                }));
            }
        }
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
