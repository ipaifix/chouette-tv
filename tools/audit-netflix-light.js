/* Audit-only diagnostics. Synthetic data, no network, no application writes.
 * Run: node tools/audit-netflix-light.js
 * Desktop timings are NOT Samsung TV performance measurements. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
function load(files, globals) {
    const ctx = vm.createContext({ setTimeout, clearTimeout, ...globals });
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file + '.js'), 'utf8'), ctx);
    }
    return ctx;
}
function samples(fn, count = 15) {
    const times = [];
    for (let i = 0; i < count; i++) {
        const start = performance.now(); fn(); times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { medianMs: +times[Math.floor(count / 2)].toFixed(2),
        p95Ms: +times[Math.min(count - 1, Math.ceil(count * .95) - 1)].toFixed(2) };
}
function item(kind, i) {
    return { kind, id: String(i), name: 'Contenu démo ' + i, categoryId: String(i % 120),
        seriesId: kind === 'series' ? String(i) : undefined,
        streamId: kind !== 'series' ? String(i) : undefined,
        addedAt: 1700000000 + i, logo: 'https://example.invalid/poster/' + i + '.jpg',
        url: kind === 'series' ? '' : 'https://example.invalid/' + kind + '/' + i };
}
const report = { environment: 'Desktop Node VM, synthetic inputs; no DOM, GPU, flash or real TV', search: [] };
for (const size of [1000, 40000, 100000]) {
    const App = { TYPE_ROWS: [], SEARCH_MAX_RESULTS: 80, HOME_ROW_MAX: 14 };
    load(['catalog', 'search-ui'], { App, Storage: { get() { return ''; } } });
    App.catalog = {};
    for (const [kind, share] of [['live', .5], ['vod', .25], ['series', .25]]) {
        App.catalog[kind] = { categories: [], items: Array.from({ length: size * share }, (_, i) => item(kind, i)) };
    }
    App.$searchQuery = { value: '' };
    App.renderSearchShell = App.clampSearchFocus = App.updateSearchFocusUi = () => {};
    const result = { items: size, queries: {} };
    for (const q of ['démo', 'introuvable-xyz']) {
        App.$searchQuery.value = q;
        result.queries[q] = samples(() => App.runSearchFilter());
    }
    App.$searchQuery.value = 'démo'; App.runSearchFilter();
    result.collectedResults = App.searchResults.length;
    result.reachableCards = App.searchRows.reduce((n, row) => n + row.items.length, 0);
    result.indexBuild = samples(() => App.rebuildCatalogIndexes());
    result.serializeCatalog = samples(() => JSON.stringify(App.catalog));
    result.catalogJsonMiB = +(Buffer.byteLength(JSON.stringify(App.catalog)) / 1024 / 1024).toFixed(2);
    report.search.push(result);
}
// Repeated season renders reuse the parsed history and its lookup index.
const history = {};
for (let i = 0; i < 500; i++) {
    history['vod:' + i] = { kind: 'vod', id: String(i), pos: 100, dur: 1000, at: 1, title: 'Vu ' + i };
}
const rawHistory = JSON.stringify(history);
let parses = 0;
const countJson = Object.create(JSON);
countJson.parse = (...args) => { parses++; return JSON.parse(...args); };
const resumeApp = { RESUME_END_RATIO: .9, RESUME_END_MARGIN_SEC: 60,
    getProfileValue() { return rawHistory; } };
load(['resume'], { App: resumeApp, JSON: countJson, Storage: { KEYS: { resumeMap: 'resume' } } });
const eps = Array.from({ length: 300 }, (_, i) => ({ kind: 'episode', id: 'ep-' + i }));
const episodeTiming = samples(() => eps.forEach(ep => resumeApp.getResumeEntry(ep)), 5);
parses = 0; eps.forEach(ep => resumeApp.getResumeEntry(ep));
report.episodeHistoryLookup = { episodes: 300, storedHistoryEntries: 500,
    parsesPerSeasonRender: parses, ...episodeTiming };
// Visiting many series must evict old metadata from the bounded cache.
let requests = 0;
const seriesCtx = load(['xtream'], { Http: { get(url, opts, done) {
    requests++;
    const id = new URL(url).searchParams.get('series_id');
    done(JSON.stringify({ info: { name: 'Série ' + id }, episodes: {
        '1': Array.from({ length: 100 }, (_, i) => ({ id: id + '-' + i, title: 'Épisode ' + i }))
    } }));
} } });
for (let i = 0; i < 100; i++) {
    seriesCtx.Xtream.getSeriesInfo('https://example.invalid', 'synthetic-user', 'synthetic-pass', String(i + 1), () => {}, err => { throw Error(err); });
}
const before = requests;
seriesCtx.Xtream.getSeriesInfo('https://example.invalid', 'synthetic-user', 'synthetic-pass', '1', () => {}, err => { throw Error(err); });
report.seriesCache = { seriesVisited: 100, episodesPerSeries: 100, requests,
    firstSeriesStillCached: requests === before };
// Xtream snapshots omit credentials and rebuild authenticated stream URLs on load.
let saved;
const cacheApp = {};
load(['catalog'], { App: cacheApp, Storage: { saveCatalogCache(v) { saved = v; } } });
cacheApp.persistCatalogCache('synthetic-fingerprint', {
    base: 'https://example.invalid', username: 'synthetic-user', password: 'synthetic-pass',
    epgUrl: 'https://example.invalid/xmltv.php?username=synthetic-user&password=synthetic-pass',
    live: { items: [{ kind: 'live', streamId: '1', url: 'https://example.invalid/live/synthetic-user/synthetic-pass/1.ts' }], categories: [] }
});
report.cacheCredentials = { topLevelPasswordCleared: saved.catalog.password === '',
    syntheticPasswordStillInSerializedPayload: JSON.stringify(saved).includes('synthetic-pass') };
// Refresh must remap the playing identity even when the zap list is reordered.
const softApp = { TYPE_ROWS: [], contentType: 'live', listLevel: 'content', uiState: 'settings',
    activeCategoryId: null, playingIndex: 0, isGroupHeader() { return false; },
    playingItem() { return this.zapList[this.playingIndex] || null; } };
load(['catalog', 'playback'], { App: softApp });
const a = item('live', 1), b = item('live', 2);
softApp.catalog = { live: { items: [a, b], categories: [] }, vod: { items: [] }, series: { items: [] } };
softApp.rebuildZapList('live');
softApp.applyCatalogSoft({ live: { items: [b, a], categories: [] } });
report.refreshPlaybackIdentity = { actualPlayerItemId: a.id, modelPlayingItemId: softApp.playingItem().id,
    identityMismatch: softApp.playingItem().id !== a.id };
// EPG parser timing, large JSON equivalent (XML DOM peak needs browser/TV profiling).
const now = Date.now();
const guide = {};
for (let ch = 0; ch < 500; ch++) {
    guide['ch-' + ch] = Array.from({ length: 336 }, (_, i) => ({
        start: now + (i - 96) * 1800000, stop: now + (i - 95) * 1800000, title: 'Programme ' + i
    }));
}
const guideText = JSON.stringify(guide);
const epgCtx = load(['epg'], { Http: { get(url, opts, done) { done(guideText); } } });
report.guideJson = { channels: 500, programmes: 168000,
    jsonMiB: +(Buffer.byteLength(guideText) / 1024 / 1024).toFixed(2),
    parseAndIndex: samples(() => epgCtx.EPG.load('synthetic', Object.keys(guide), () => {}, err => { throw Error(err); }), 5) };
async function realCatalogue(localUrl) {
    const base = new URL(localUrl);
    if (base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') {
        throw Error('Only a local read-only audit relay is allowed; never pass credentials here');
    }
    const payloads = new Map();
    await Promise.all(['get_live_categories', 'get_live_streams', 'get_vod_categories',
        'get_vod_streams', 'get_series_categories', 'get_series'].map(async action => {
        const url = new URL('/player_api.php', base);
        url.searchParams.set('action', action);
        const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw Error('Local relay failed');
        payloads.set(action, await response.text());
    }));
    const ctx = load(['xtream'], { Http: { get(url, opts, done) {
        done(payloads.get(new URL(url).searchParams.get('action')));
    } } });
    let catalogue;
    const normalize = samples(() => ctx.Xtream.load(base.origin, 'demo', 'demo', {},
        value => { catalogue = value; }, err => { throw Error(err); }), 7);
    const App = { TYPE_ROWS: [], SEARCH_MAX_RESULTS: 80, HOME_ROW_MAX: 14, catalog: catalogue };
    load(['catalog', 'search-ui'], { App, Storage: { get() { return ''; } } });
    App.$searchQuery = { value: '' };
    App.renderSearchShell = App.clampSearchFocus = App.updateSearchFocusUi = () => {};
    const search = {};
    for (const q of ['a', 'introuvable-xyz', 'harry']) {
        App.$searchQuery.value = q;
        search[q] = samples(() => App.runSearchFilter(), 15);
        search[q].collected = App.searchResults.length;
        search[q].reachable = App.searchRows.reduce((n, row) => n + row.items.length, 0);
    }
    return { counts: Object.fromEntries(['live', 'vod', 'series'].map(k => [k, catalogue[k].items.length])),
        rawJsonMiB: +([...payloads.values()].reduce((n, body) => n + Buffer.byteLength(body), 0) / 1024 / 1024).toFixed(2),
        parseNormalizeAndCategories: normalize,
        indexBuild: samples(() => App.rebuildCatalogIndexes()),
        serializeNormalizedCatalogue: samples(() => JSON.stringify(App.catalog)),
        normalizedJsonMiB: +(Buffer.byteLength(JSON.stringify(App.catalog)) / 1024 / 1024).toFixed(2), search,
        note: 'Real provider catalogue through a local relay; CPU timings in desktop Node, no rendering or TV flash writes' };
}
if (process.argv[2]) {
    realCatalogue(process.argv[2]).then(real => {
        report.realCatalogue = real; console.log(JSON.stringify(report, null, 2));
    }).catch(() => { console.error('Audit failed (details hidden to protect source access).'); process.exitCode = 1; });
} else {
    console.log(JSON.stringify(report, null, 2));
}
