'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(files, extra = {}) {
    const ctx = vm.createContext({ App: {}, setTimeout, clearTimeout, setInterval, clearInterval,
        window: { addEventListener() {} }, ...extra });
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file + '.js'), 'utf8'), ctx, { filename: file });
    return ctx;
}
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ live: { items: [], categories: [] }, vod: { items: [], categories: [] }, series: { items: [], categories: [] } });

test('provider dividers never enter search, guide or zap classification', () => {
    const { App } = load(['browse']);
    for (const name of ['▼--- FRANCE ---▼', '**** SPORTS ****', '--- NEWS ---', '★★★★']) {
        assert.equal(App.isGroupHeader({ name }), true, name);
    }
    for (const name of ['CANAL+', 'Ciné - HD', 'Star*', '|FR| TF1 FHD']) {
        assert.equal(App.isGroupHeader({ name }), false, name);
    }
});

test('catalog refresh preserves the actual playing identity through reorder and removal', () => {
    const { App } = load(['catalog', 'ui-overlays', 'playback']);
    const a = { kind: 'live', streamId: 'a', name: 'A', url: 'opened-a' };
    const b = { kind: 'live', streamId: 'b', name: 'B', url: 'b' };
    Object.assign(App, { catalog: empty(), contentType: 'live', uiState: 'watch', isGroupHeader: () => false, playingIndex: 0 });
    App.catalog.live.items = [a, b]; App.rebuildZapList('live');
    const refreshed = empty(); refreshed.live.items = [b, { ...a, url: 'new-a-url' }];
    App.applyCatalogSoft(refreshed);
    assert.equal(App.playingItem().streamId, 'a'); assert.equal(App.playingIndex, 1);
    assert.equal(App.playingItem().url, 'opened-a');
    refreshed.live.items = [b]; App.applyCatalogSoft(refreshed);
    assert.equal(App.playingItem().streamId, 'a');
    assert.equal(App.zapList.length, 2);
});

test('the entire offline snapshot omits authenticated URLs and rebuilds them from settings', () => {
    let saved;
    const { App, Xtream } = load(['xtream', 'catalog'], { Storage: { saveCatalogCache(v) { saved = v; } } });
    const catalog = empty();
    Object.assign(catalog, { base: 'https://provider.invalid', username: 'synthetic-user', password: 'synthetic-secret',
        epgUrl: 'https://provider.invalid/xmltv.php?password=synthetic-secret' });
    catalog.live.items = [{ kind: 'live', streamId: '7', id: 'epg-7', name: 'Seven', url: Xtream.liveStreamUrl(catalog.base, catalog.username, catalog.password, '7'), _searchText: 'seven' }];
    catalog.vod.items = [{ kind: 'vod', streamId: '8', name: 'Film', extension: 'mkv', url: Xtream.movieUrl(catalog.base, catalog.username, catalog.password, '8', 'mkv') }];
    App.persistCatalogCache('opaque', catalog);
    assert.doesNotMatch(JSON.stringify(saved), /synthetic-user|synthetic-secret|_searchText|xmltv\.php/);
    assert.equal(catalog.live.items[0].url.includes('synthetic-secret'), true, 'active model remains playable');
    App.xtreamFromStorage = () => ({ server: catalog.base, user: 'new-user', pass: 'new-pass' });
    App.restoreCatalogUrls(saved.catalog);
    assert.equal(saved.catalog.live.items[0].url, 'https://provider.invalid/live/new-user/new-pass/7.ts');
    assert.equal(saved.catalog.vod.items[0].url, 'https://provider.invalid/movie/new-user/new-pass/8.mkv');
});

test('series metadata has an LRU limit, expires and supports an explicit fresh follow check', () => {
    let now = 1000000, requests = 0;
    class Clock extends Date { static now() { return now; } }
    const { Xtream } = load(['xtream'], { Date: Clock, Http: { get(url, options, done) {
        requests++; done('{"episodes":{"1":[{"id":1}]}}');
    } } });
    const get = (id, options) => Xtream.getSeriesInfo('https://example.invalid', 'u', 'p', id, () => {}, assert.fail, options);
    get('1'); get('1'); assert.equal(requests, 1);
    get('1', { force: true }); assert.equal(requests, 2);
    now += 16 * 60000; get('1'); assert.equal(requests, 3);
    for (let i = 2; i <= 10; i++) get(String(i));
    const before = requests; get('1'); assert.equal(requests, before + 1);
});

test('300 episode lookups parse history once and invalidate across profile values', () => {
    let raw = JSON.stringify(Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['vod:' + i, { kind: 'vod', id: String(i), pos: 100, dur: 1000 }]))), parses = 0;
    const json = Object.create(JSON); json.parse = value => { parses++; return JSON.parse(value); };
    const { App } = load(['resume'], { JSON: json, Storage: { KEYS: { resumeMap: 'resume' } } });
    App.getProfileValue = () => raw;
    for (let i = 0; i < 300; i++) App.getResumeEntry({ kind: 'episode', id: String(i) });
    assert.equal(parses, 1);
    raw = '{"episode:1":{"kind":"episode","id":"1","pos":55}}';
    assert.equal(App.getResumeEntry({ kind: 'episode', id: '1' }).pos, 55);
    assert.equal(parses, 2);
});

test('history is bounded and prioritizes in-progress entries over watched markers', () => {
    let saved;
    const { App } = load(['resume'], { Storage: { KEYS: { resumeMap: 'resume' } } });
    App.setProfileValue = (key, value) => { saved = JSON.parse(value); };
    const map = Object.fromEntries(Array.from({ length: 1100 }, (_, i) => ['vod:' + i, { done: i !== 0, at: i, pos: 50 }]));
    App.saveResumeMap(map);
    assert.equal(Object.keys(saved).length, 1000); assert.ok(saved['vod:0']); assert.ok(saved['vod:1099']);
});

test('editing settings leaves LEFT and RIGHT to the native caret', () => {
    const { App } = load(['remote']);
    App.KEY = { LEFT: 37, RIGHT: 39 }; App.settingsEditing = true;
    App.blurSettingsInputs = assert.fail;
    for (const keyCode of [37, 39]) App.onSettingsKeys({ keyCode, preventDefault: assert.fail });
    assert.equal(App.settingsEditing, true);
});

test('home row scrolling uses real layout rather than a 320-pixel estimate', () => {
    const { App } = load(['home-ui']);
    App.$homeRows = { scrollTop: 100, getBoundingClientRect: () => ({ top: 20 }) };
    App.snapHomeRowToTop({ getBoundingClientRect: () => ({ top: 1470 }) }, 5);
    assert.equal(App.$homeRows.scrollTop, 1550);
});

test('failed EPG refresh retains the last valid guide and loaded flag', () => {
    let requests = [];
    class Clock extends Date { static now() { return 1700000000000; } }
    const { EPG } = load(['epg'], { Date: Clock, Http: { get(url, options, done, fail) { requests.push({ done, fail }); } } });
    EPG.load('same', ['1'], () => {}, assert.fail);
    requests[0].done('{"1":[{"start":1700000000,"stop":1700003600,"title":"News"}]}');
    let failed = 0; EPG.load('same', ['1'], assert.fail, () => { failed++; });
    assert.equal(EPG.nowNext('1').now.title, 'News'); requests[1].fail('offline');
    assert.equal(EPG.isLoaded(), true); assert.equal(EPG.nowNext('1').now.title, 'News'); assert.equal(failed, 1);
});

test('HTTP cancellation aborts the transport silently and late callbacks cannot publish', () => {
    let xhr, aborted = 0, published = 0;
    const { Http } = load(['http'], { XMLHttpRequest: class {
        constructor() { xhr = this; } open() {} send() {} abort() { aborted++; }
    } });
    const cancel = Http.get('synthetic', {}, () => { published++; }, assert.fail);
    const lateLoad = xhr.onload; cancel(); xhr.status = 200; xhr.responseText = 'late'; lateLoad();
    assert.equal(aborted, 1); assert.equal(published, 0);
});

test('incremental JSON reader handles escaped delimiters and yields without retaining raw records', async () => {
    const { DataJobs } = load(['data-jobs']);
    const input = Array.from({ length: 3000 }, (_, i) => ({ id: i, name: 'comma, ] } \\" quote', ignored: { deep: [1, 2] } }));
    let completed = false;
    const promise = new Promise((resolve, reject) => DataJobs.array(JSON.stringify(input), row => ({ id: row.id, name: row.name }), value => { completed = true; resolve(value); }, reject));
    assert.equal(completed, false);
    const output = await promise;
    assert.equal(output.length, 3000); assert.equal(output[2999].name, input[2999].name); assert.equal(output[0].ignored, undefined);
    for (const invalid of ['[{},]', '[{},,{}]', '[{}] junk', '[{"id":]']) {
        const error = await new Promise(resolve => DataJobs.array(invalid, row => row, () => resolve(null), resolve));
        assert.ok(error, invalid);
    }
});

test('incremental catalog uses at most two requests and publishes early playable sections', async () => {
    let active = 0, maximum = 0, progress = [], timeouts = [];
    const { Xtream } = load(['data-jobs', 'xtream'], { Http: { get(url, options, done) {
        active++; maximum = Math.max(maximum, active); timeouts.push(options.timeoutMs);
        const action = new URL(url).searchParams.get('action');
        setTimeout(() => { active--; done(JSON.stringify(action === 'get_live_streams' ? [{ stream_id: 1, name: 'Live' }]
            : action === 'get_vod_streams' ? [{ stream_id: 2, name: 'Film' }]
            : action === 'get_series' ? [{ series_id: 3, name: 'Series' }] : [])); }, 0);
        return () => {};
    } } });
    const result = await new Promise((resolve, reject) => Xtream.load('https://example.invalid', 'u', 'p', { incremental: true,
        onProgress: catalog => progress.push(catalog.live.items.length + catalog.vod.items.length + catalog.series.items.length) }, resolve, reject));
    assert.equal(maximum, 2); assert.deepEqual(progress, [1, 2, 3]);
    assert.equal(result.series.items.length, 1); assert.ok(timeouts.includes(15000));
});

function xmlTime(t) { return new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'; }
test('XMLTV reader filters to 48h, preserves entities/CDATA and validates closing tags without a DOM', async () => {
    const { XmltvReader } = load(['epg-xml']);
    const now = Date.now();
    const programme = (id, start, title) => `<programme channel="${id}" start="${xmlTime(start)}" stop="${xmlTime(start + 3600000)}"><title>${title}</title></programme>`;
    const xml = '<?xml version="1.0"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv>' +
        programme('wanted', now, 'News &amp; &#x1F600; <![CDATA[<programme>]]>') +
        programme('wanted', now + 60 * 3600000, 'Too far') + programme('wanted', now - 10 * 3600000, 'Old') +
        programme('other', now, 'Not wanted') + '</tv>';
    function time(value) { return Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8), +value.slice(8, 10), +value.slice(10, 12), +value.slice(12, 14)); }
    const out = await new Promise((resolve, reject) => XmltvReader.parse(xml, { wanted: true }, time, resolve, reject));
    assert.equal(out.wanted.length, 1); assert.equal(out.wanted[0].title, 'News & 😀 <programme>'); assert.equal(out.other, undefined);
    for (const invalid of ['<tv><programme></tv>', '<tv></tv><tv/>', '<tv>', '<!DOCTYPE tv [<!ENTITY x "bad">]><tv/>']) {
        const error = await new Promise(resolve => XmltvReader.parse(invalid, null, time, () => resolve(null), resolve));
        assert.ok(error, invalid);
    }
});

test('journal cache writes and reads small batches and rejects interrupted snapshots', async () => {
    const { DataJobs } = load(['data-jobs']); const catalog = empty();
    catalog.xtream = true; catalog.live.items = Array.from({ length: 3000 }, (_, i) => ({ kind: 'live', streamId: String(i), name: 'TV ' + i }));
    const payload = { fingerprint: 'opaque', savedAt: 123, catalog }, chunks = [];
    await new Promise((resolve, reject) => DataJobs.writeCatalog(payload, chunk => chunks.push(chunk), resolve, reject));
    assert.ok(chunks.length > 20); assert.ok(chunks.every(chunk => chunk.length < 20000));
    const restored = await new Promise(resolve => DataJobs.readCatalog(chunks.join(''), resolve));
    assert.equal(restored.catalog.live.items.length, 3000); assert.equal(restored.catalog.xtream, true);
    const interrupted = await new Promise(resolve => DataJobs.readCatalog(chunks.slice(0, -1).join(''), resolve));
    assert.equal(interrupted, null);
});

test('a failed journal promotion leaves the previous offline snapshot untouched', async () => {
    const old = 'previous working cache', files = new Map([['/documents/chouette-tv-catalog.jsonl', old]]);
    const file = name => ({ fullPath: '/documents/' + name, openStream(mode, done) {
        files.set(this.fullPath, ''); const pathname = this.fullPath;
        done({ write(chunk) { files.set(pathname, files.get(pathname) + chunk); }, close() {} });
    } });
    const dir = { fullPath: '/documents', resolve: file, createFile: file, moveTo(from, to, overwrite, done, fail) { fail(); } };
    const { Storage } = load(['data-jobs', 'storage'], { tizen: { filesystem: { resolve(name, done) { done(dir); } } } });
    const ok = await new Promise(resolve => Storage.saveCatalogCache({ fingerprint: 'new', catalog: empty() }, resolve));
    assert.equal(ok, false); assert.equal(files.get('/documents/chouette-tv-catalog.jsonl'), old);
});

test('background suspension stops guide/history/follow work and invalidates old requests', () => {
    let stopped = 0, aborted = 0;
    const { App } = load(['boot'], { EPG: { cancel() { aborted++; } } });
    Object.assign(App, { stopResumeSaveLoop() { stopped++; }, _followRequestCancel() { aborted++; }, _followRefreshBusy: true });
    App.setBackgroundSuspended(true);
    assert.equal(App.backgroundSuspended, true); assert.equal(stopped, 1); assert.equal(aborted, 2);
    assert.equal(App._followRefreshBusy, false); assert.equal(App._followGeneration, 1);
});

test('M3U keeps Home/Search/Settings navigation even with a single live bucket', () => {
    const { App } = load(['browse-nav']);
    App.xtreamCreds = { base: '' }; App.hasCatalogContent = () => true; App.catalogItems = type => type === 'live' ? [{}] : [];
    assert.equal(App.useTypeMenu(), true);
});

test('legacy TV colors have static declarations and non-zero flex gaps are not required', () => {
    const css = fs.readFileSync(path.join(__dirname, '../app/css/style.css'), 'utf8');
    for (const declaration of css.matchAll(/^\s*([\w-]+):[^;\n]*var\(--[^;\n]*;/gm)) {
        const before = css.slice(0, declaration.index).trimEnd().split('\n').pop();
        assert.match(before, new RegExp('^\\s*' + declaration[1] + ':'));
        assert.doesNotMatch(before, /var\(/);
    }
    assert.doesNotMatch(css, /\bgap:\s*(?!0[;\s])\d+/);
});

test('artwork has four in-flight loads and a retained pixel budget, and oversized sources are dropped', () => {
    const { App } = load(['home-ui']);
    const images = Array.from({ length: 100 }, (_, i) => {
        const listeners = {}, attrs = { 'data-src': 'https://example.invalid/' + i };
        return { naturalWidth: 300, naturalHeight: 450, style: {},
            getAttribute: key => attrs[key], removeAttribute: key => { delete attrs[key]; },
            set src(value) { attrs.src = value; }, get src() { return attrs.src; },
            addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener(type) { delete listeners[type]; },
            finish() { if (listeners.load) listeners.load({ type: 'load' }); }
        };
    });
    images.forEach(img => App.loadHomeCardImage({ querySelector: () => img }));
    assert.equal(images.filter(img => img.src).length, 4);
    images.forEach(img => img.finish());
    assert.ok(images.filter(img => img.src).length <= 59, '300x450 posters fit within eight million retained pixels');
    images[0].naturalWidth = 4000;
    App.loadHomeCardImage({ querySelector: () => images[0] }); images[0].finish();
    assert.equal(images[0].src, undefined); assert.equal(images[0]._homeOversized, true);
    App.$homeRows = { querySelectorAll: () => images, textContent: '' };
    App.releaseBrowseViews(); assert.ok(images.every(img => !img.src));
});

test('a superseded chunked search never publishes its old results', () => {
    const tasks = new Map(); let seq = 0, ticks = 0;
    class Clock extends Date { static now() { return ticks += 10; } }
    const { App } = load(['catalog', 'search-ui'], { Date: Clock,
        setTimeout(fn) { const id = ++seq; tasks.set(id, fn); return id; }, clearTimeout(id) { tasks.delete(id); } });
    App.catalog = empty(); App.catalog.live.items = Array.from({ length: 5000 }, (_, i) => ({ kind: 'live', name: 'First ' + i }));
    App.catalog.vod.items = [{ kind: 'vod', name: 'Second movie' }];
    App.$searchQuery = { value: 'First' }; let paints = 0;
    App.renderSearchShell = () => { paints++; }; App.updateSearchFocusUi = () => {};
    App.runSearchFilter(true); const firstTask = [...tasks][0]; tasks.delete(firstTask[0]); firstTask[1]();
    assert.equal(paints, 0);
    App.$searchQuery.value = 'Second'; App.runSearchFilter(true);
    while (tasks.size) { const [id, fn] = [...tasks][0]; tasks.delete(id); fn(); }
    assert.equal(paints, 1); assert.equal(App.searchResults.length, 1); assert.equal(App.searchResults[0].name, 'Second movie');
});

test('imported indices remain consistent with full indexing after normalization and offline hydration', async () => {
    const { App, DataJobs } = load(['data-jobs', 'catalog', 'search-ui']);
    App.catalog = empty();
    for (let i = 0; i < 1000; i++) {
        const item = { kind: 'vod', id: String(i), name: 'Démo ' + i, categoryId: String(i % 4), addedAt: i };
        DataJobs.indexItem(App.catalog.vod, item, i); App.catalog.vod.items.push(item);
    }
    const normalized = App.normalizeCatalog(App.catalog); App.catalog = normalized; App.rebuildCatalogIndexes();
    assert.equal(App.categoryCounts.vod['2'], 250); assert.equal(App.recentByType.vod[0].item.id, '999');
    assert.equal(App.recentByType.vod.length, 50); assert.equal(App.collectSearchPool().length, 1000);
    assert.equal(App.collectSearchPool()[0]._searchText, 'demo 0');
    const chunks = []; await new Promise((resolve, reject) => DataJobs.writeCatalog({ fingerprint: 'x', catalog: normalized }, chunk => chunks.push(chunk), resolve, reject));
    const hydrated = await new Promise(resolve => DataJobs.readCatalog(chunks.join(''), resolve));
    assert.equal(hydrated.catalog.vod._recent[0].item.id, '999');
    assert.equal(hydrated.catalog.vod._categoryCounts['2'], 250);
});

test('unavailable rail destinations are skipped while M3U retains the shared shell', () => {
    const { App } = load(['home-ui']);
    Object.assign(App, { HOME_RAIL: [{ action: 'home' }, { action: 'type', type: 'vod' }, { action: 'search' }],
        hasCatalogContent: () => true, catalogItems: type => type === 'live' ? [{}] : [],
        homeFocus: { zone: 'rail', railIndex: 0 }, isHomeDash: () => false,
        updateRailFocusUi() {}, updateShellKeysHint() {} });
    assert.equal(App.shellRailAvailable(1), false); App.moveShellRailFocus(1);
    assert.equal(App.homeFocus.railIndex, 2);
});

test('replacing a catalog request cancels its transport and settles its settings controls', () => {
    let aborts = 0, settled = 0;
    const { App } = load(['boot'], {
        Storage: { KEYS: { playlistUrl: 'url' }, get: () => '' },
        Xtream: { load: () => () => { aborts++; } }
    });
    Object.assign(App, { catalogSourceFingerprint: () => 'source',
        xtreamFromStorage: () => ({ server: 'https://example.invalid', user: 'demo', pass: 'test' }), toast() {} });
    App.refreshCatalogFromServer({ onSettled: () => { settled++; } });
    App.refreshCatalogFromServer({ onSettled: () => { settled++; } });
    assert.equal(aborts, 1); assert.equal(settled, 1); assert.equal(App.catalogRequestActive, true);
    App.cancelCatalogLoad();
    assert.equal(aborts, 2); assert.equal(settled, 2); assert.equal(App.catalogRequestActive, false);
});
