/* Optional integration checks: npm-installed playwright + its Firefox browser.
 * No real IPTV account is used. All requests stay on the local fixture server.
 * Install the matching browser with: playwright install firefox */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { firefox } = require('playwright');

async function main() {
    const root = path.resolve(__dirname, '../app');
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/$WEBAPIS/webapis/webapis.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end('/* Samsung library is absent in desktop browsers. */');
            return;
        }
        const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.writeHead(404); res.end(); return;
        }
        const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await firefox.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        const errors = [];
        const external = [];
        page.on('pageerror', err => errors.push(err.message));
        await context.route('**/*', route => {
            if (new URL(route.request().url()).origin === origin) { return route.continue(); }
            external.push(route.request().resourceType());
            return route.abort();
        });
        await page.goto(origin);
        await page.waitForFunction(() => App.uiState === 'settings');
        assert.equal(await page.locator('#settings').isVisible(), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => App.uiState === 'exit');
        assert.equal(await page.locator('#exit-confirm').isVisible(), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => App.uiState === 'settings');
        assert.equal(await page.locator('#settings').isVisible(), true);
        console.log('PASS first launch → Settings → BACK → quit confirmation → Settings');

        await page.evaluate(() => {
            App.showSettings();
            App.$settingXtreamServer.value = 'https://demo.invalid';
            App.$settingXtreamUser.value = 'new-account';
            App.$settingXtreamPass.value = '';
            App.saveSettings();
        });
        assert.equal(await page.evaluate(() => App.uiState), 'settings');
        assert.equal(await page.evaluate(() => Storage.get(Storage.KEYS.xtreamUser)), '');
        console.log('PASS incomplete credentials stay in Settings without saving');

        await page.evaluate(base => {
            const cat = {
                live: { categories: [{ id: 'tv', name: 'TV' }], items: [{ kind: 'live', name: 'Demo Live', id: 'live-1', categoryId: 'tv', url: base + '/fixture.ts', logo: base + '/icon-117.png' }] },
                vod: { categories: [{ id: 'films', name: 'Films' }], items: [{ kind: 'vod', name: 'Demo Film', id: 'film-1', categoryId: 'films', url: base + '/fixture.mp4', logo: base + '/icon-117.png' }] },
                series: { categories: [{ id: 'series', name: 'Séries' }], items: [{ kind: 'series', name: 'Demo Series', id: 'series-1', seriesId: 'series-1', categoryId: 'series', logo: base + '/icon-117.png' }] }
            };
            Storage.set(Storage.KEYS.playlistUrl, base + '/fixture.m3u');
            localStorage.setItem('chouette-tv.catalogCache', JSON.stringify({ v: 1, fingerprint: App.catalogSourceFingerprint(), catalog: cat }));
        }, origin);
        await page.reload();
        await page.waitForFunction(() => App.uiState === 'browse' && App.catalogItems('vod').length === 1);
        assert.equal(await page.locator('#home-main').isVisible(), true);
        assert.ok((await page.locator('#home-rows').innerText()).includes('Demo Film'));
        console.log('PASS cached live/films/series catalog restores and renders');

        await page.evaluate(() => App.showSearch());
        await page.keyboard.type('Demo');
        await page.waitForFunction(() => App.searchResults.length === 3);
        assert.equal(await page.locator('#search-main').isVisible(), true);
        assert.equal(await page.locator('#search-shell-rows .home-row').count(), 3);
        await page.waitForFunction(() => {
            const imgs = Array.from(document.querySelectorAll('#search-shell-rows img[data-src]'));
            return imgs.length === 3 && imgs.every(img => img.complete && img.naturalWidth > 0);
        });
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => App.searchShellFocus.zone), 'content');
        console.log('PASS keyboard search → all three types → loaded posters → navigation');

        await page.evaluate(() => App.showLiveGuide());
        const guideLayout = await page.locator('.guide-row').first().evaluate(el => ({
            display: getComputedStyle(el).display,
            timelineWidth: el.querySelector('.guide-timeline').getBoundingClientRect().width
        }));
        assert.equal(guideLayout.display, 'flex');
        assert.ok(guideLayout.timelineWidth > 100);
        console.log('PASS Guide TV rows keep a usable timeline width');
        if (process.env.AUDIT_SCREENSHOT) { await page.screenshot({ path: process.env.AUDIT_SCREENSHOT }); }
        assert.deepEqual(errors, [], 'uncaught browser errors');
        assert.deepEqual(external, [], 'no request to an external source');
        console.log('PASS no uncaught JavaScript error or external network request');
    } finally {
        if (browser) { await browser.close(); }
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
