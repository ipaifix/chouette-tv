'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function load(name, globals = {}) {
    const context = vm.createContext({ setTimeout, clearTimeout, ...globals });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js/', name + '.js'), 'utf8'), context);
    return context;
}

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key)
    };
}

test('malformed credential escapes do not crash startup', () => {
    const { Xtream } = load('xtream');
    assert.equal(Xtream.parseM3uCredentials('https://example.test/get.php?username=u&password=%ZZ'), null);
    const parsed = Xtream.parseM3uCredentials('https://example.test/GET.php?username=a%2Bb&password=p%26q#ignored');
    assert.equal(parsed.username, 'a+b');
    assert.equal(parsed.password, 'p&q');
    assert.equal(parsed.base, 'https://example.test');
});

test('Xtream playback encodes each credential and identifier path segment', () => {
    const { Xtream } = load('xtream');
    assert.equal(Xtream.movieUrl('https://example.test', 'a/b', 'p?#%', '1/2', '.mp4'),
        'https://example.test/movie/a%2Fb/p%3F%23%25/1%2F2.mp4');
    assert.equal(Xtream.seriesEpisodeUrl('https://example.test', 'a/b', 'p?#%', '3', 'mkv'),
        'https://example.test/series/a%2Fb/p%3F%23%25/3.mkv');
});

test('series cache does not return URLs containing a previous password', () => {
    let requests = 0;
    const { Xtream } = load('xtream', { Http: { get(url, opts, done) {
        requests++;
        done(JSON.stringify({ episodes: { 1: [{ id: 7, title: 'Episode' }] } }));
    } } });
    let result;
    Xtream.getSeriesInfo('https://example.test', 'user', 'old', '1', (v) => { result = v; }, assert.fail);
    Xtream.getSeriesInfo('https://example.test', 'user', 'new', '1', (v) => { result = v; }, assert.fail);
    assert.equal(requests, 2);
    assert.match(result[0].episodes[0].url, /\/new\/7\.mp4$/);
});

test('Xtream accepts a VOD-only account and encodes live credentials consistently', () => {
    function catalog(live) {
        const { Xtream } = load('xtream', { Http: { get(url, opts, done) {
            const action = new URL(url).searchParams.get('action');
            done(JSON.stringify(action === 'get_vod_streams' ? [{ stream_id: 1 }]
                : action === 'get_live_streams' ? live : []));
        } } });
        let result;
        Xtream.load('https://example.test', 'a/b', 'p?#%', {}, (v) => { result = v; }, assert.fail);
        return result;
    }
    assert.equal(catalog([]).vod.items.length, 1);
    assert.equal(catalog([{ stream_id: 2 }]).live.items[0].url,
        'https://example.test/live/a%2Fb/p%3F%23%25/2.ts');
});

test('Xtream marks only failed content endpoints as partial', () => {
    const { Xtream } = load('xtream', { Http: { get(url, opts, done, fail) {
        const action = new URL(url).searchParams.get('action');
        if (action === 'get_vod_streams') { fail('temporary failure'); return; }
        done(JSON.stringify(action === 'get_live_streams' ? [{ stream_id: 2 }] : []));
    } } });
    let result;
    Xtream.load('https://example.test', 'user', 'pass', {}, value => { result = value; }, assert.fail);
    assert.deepEqual(Array.from(result.partialTypes), ['vod']);
    assert.equal(result.live.items.length, 1);
    assert.equal(result.vod.items.length, 0);
});

test('M3U names preserve commas outside quoted attributes', () => {
    const { Playlist } = load('playlist');
    const result = Playlist.parse('#EXTM3U\n#EXTINF:-1 group-title="News, World",News, Weather\nhttps://example.test/live');
    assert.equal(result.channels[0].name, 'News, Weather');
    assert.equal(result.categories[0].name, 'News, World');
});

test('M3U categories accept names matching object prototype properties', () => {
    const { Playlist } = load('playlist');
    const result = Playlist.parse('#EXTM3U\n#EXTINF:-1 group-title="constructor",One\nhttps://example.test/1\n#EXTINF:-1 group-title="__proto__",Two\nhttps://example.test/2');
    assert.equal(result.categories.length, 2);
    assert.equal(result.channels[0].categoryId, 'm3u:constructor');
    assert.equal(result.channels[1].categoryId, 'm3u:__proto__');
});

test('HTTP setup failures enter the error callback once without leaking the URL', () => {
    const { Http } = load('http', { XMLHttpRequest: class {
        open() { throw new Error('invalid https://example.test/?password=secret'); }
    } });
    const errors = [];
    assert.doesNotThrow(() => Http.get('https://example.test', {}, assert.fail, (e) => errors.push(e)));
    assert.equal(errors.length, 1);
    assert.doesNotMatch(errors[0], /password|secret/);
});

test('HTTP transport settles only once after competing terminal events', () => {
    let xhr;
    const { Http } = load('http', { XMLHttpRequest: class {
        constructor() { xhr = this; }
        open() {}
        send() {}
    } });
    const errors = [];
    Http.get('https://example.test', {}, assert.fail, (e) => errors.push(e));
    xhr.ontimeout();
    xhr.onerror();
    assert.equal(errors.length, 1);
});

test('EPG ignores malformed rows and accepts reserved channel IDs', () => {
    const body = '{"constructor":[null,{"start":1700000000,"stop":1700003600,"title":"News"}],"bad":"wrong"}';
    class FixedDate extends Date { static now() { return 1700000000000; } }
    const { EPG } = load('epg', { Date: FixedDate, Http: { get(url, opts, done) { done(body); } } });
    let count;
    EPG.load('https://example.test/guide', ['constructor', 'bad'], (n) => { count = n; }, assert.fail);
    assert.equal(count, 1);
    assert.equal(EPG.hasData('constructor'), true);
    assert.equal(EPG.hasData('toString'), false);
});

test('EPG overlapping stop times do not hide the current programme', () => {
    const t = 1700000000000;
    const body = JSON.stringify({ news: [
        { start: t - 50000, stop: t + 50000, title: 'Long programme' },
        { start: t - 40000, stop: t - 30000, title: 'Short programme' },
        { start: t + 60000, stop: t + 90000, title: 'Future programme' }
    ] });
    class FixedDate extends Date { static now() { return t; } }
    const { EPG } = load('epg', { Date: FixedDate, Http: { get(url, opts, done) { done(body); } } });
    EPG.load('https://example.test/guide', ['news'], () => {}, assert.fail);
    const result = EPG.nowNext('news');
    assert.equal(result.now.title, 'Long programme');
    assert.equal(result.next.title, 'Future programme');
});

test('EPG late responses cannot replace the most recently requested guide', () => {
    const requests = [];
    class FixedDate extends Date { static now() { return 1700000000000; } }
    const { EPG } = load('epg', { Date: FixedDate, Http: { get(url, opts, done, fail) { requests.push({ done, fail }); } } });
    let completed = 0;
    EPG.load('https://example.test/old', ['old'], () => { completed++; }, assert.fail);
    EPG.load('https://example.test/new', ['new'], () => { completed++; }, assert.fail);
    requests[1].done('{"new":[{"start":1700000000,"stop":1700003600}]}');
    requests[0].done('{"old":[{"start":1700000000,"stop":1700003600}]}');
    assert.equal(EPG.hasData('new'), true);
    assert.equal(EPG.hasData('old'), false);
    assert.equal(completed, 1);
    requests[0].fail('stale error');
});

test('EPG uses stop-exclusive boundaries, numeric timestamps and wanted channel filtering', () => {
    const t = 1700000000000;
    class FixedDate extends Date { static now() { return t; } }
    const { EPG } = load('epg', { Date: FixedDate, Http: { get(url, opts, done) { done(JSON.stringify({
        news: [
            { start: t - 30000, stop: t, title: 'Past' },
            { start: String(t / 1000), stop: String(t / 1000 + 60), title: 'Current' },
            { start: t + 60000, stop: t + 120000, title: 'Next' }
        ], unwanted: [{ start: t, stop: t + 60000 }]
    })); } } });
    EPG.load('https://example.test/guide', ['news'], () => {}, assert.fail);
    assert.equal(EPG.nowNext('news').now.title, 'Current');
    assert.equal(EPG.nowNext('news').next.title, 'Next');
    assert.equal(EPG.schedule('news').length, 2);
    assert.equal(EPG.hasData('unwanted'), false);
});

test('EPG malformed XML produces a parse error instead of an empty successful guide', () => {
    const { EPG } = load('epg', {
        Http: { get(url, opts, done) { done('<broken'); } },
        DOMParser: class { parseFromString() { return {
            getElementsByTagName(name) { return name === 'parsererror' ? [{}] : []; }
        }; } }
    });
    const errors = [];
    EPG.load('https://example.test/guide', [], assert.fail, (e) => errors.push(e));
    assert.equal(errors.length, 1);
    assert.equal(EPG.isLoaded(), false);
});

test('cleared settings stay cleared in memory when persistent deletion fails', () => {
    const localStorage = memoryStorage({ 'chouette-tv.xtreamUser': 'old', 'old-player.xtreamUser': 'old' });
    localStorage.removeItem = () => { throw new Error('storage unavailable'); };
    const { Storage } = load('storage', { window: { localStorage },
        Branding: { storageNamespace: 'chouette-tv', legacyStorageNamespace: 'old-player' } });
    Storage.set(Storage.KEYS.xtreamUser, '');
    assert.equal(Storage.get(Storage.KEYS.xtreamUser), '');
});

test('hydration normalizes known settings and ignores unknown keys', () => {
    const localStorage = memoryStorage();
    const { Storage } = load('storage', { window: { localStorage }, tizen: { filesystem: {
        openFile() { return {
            readString() { return JSON.stringify({ playlistUrl: 'https://example.test/list', 'chouette-tv.unknown': 'ignored' }); },
            close() {}
        }; }
    } } });
    Storage.hydrate(() => {});
    assert.equal(Storage.get(Storage.KEYS.playlistUrl), 'https://example.test/list');
    assert.equal(localStorage.getItem('chouette-tv.unknown'), null);
});

test('profile storage migrates legacy data once and isolates later sources', () => {
    const localStorage = memoryStorage({
        'chouette-tv.favSeries': JSON.stringify([{ seriesId: '7' }]),
        'chouette-tv.resumeMap': JSON.stringify({ 'vod:9': { pos: 50 } })
    });
    const { Storage } = load('storage', { window: { localStorage } });
    const first = 'src-v2|first';
    const second = 'src-v2|second';
    assert.equal(Storage.getScoped(Storage.KEYS.favSeries, first),
        JSON.stringify([{ seriesId: '7' }]));
    assert.equal(Storage.getScoped(Storage.KEYS.resumeMap, first),
        JSON.stringify({ 'vod:9': { pos: 50 } }));
    assert.equal(Storage.getScoped(Storage.KEYS.favSeries, second), '');
    Storage.setScoped(Storage.KEYS.favSeries, second, JSON.stringify([{ seriesId: '8' }]));
    assert.equal(Storage.getScoped(Storage.KEYS.favSeries, first),
        JSON.stringify([{ seriesId: '7' }]));
    assert.equal(Storage.getScoped(Storage.KEYS.favSeries, second),
        JSON.stringify([{ seriesId: '8' }]));
});

test('profile keys are opaque and never contain source credentials', () => {
    const { Storage } = load('storage', { window: { localStorage: memoryStorage() } });
    const scope = 'xtream|https://provider.test|alice|top-secret';
    const key = Storage.scopedKey(Storage.KEYS.resumeMap, scope);
    assert.match(key, /^chouette-tv\.profile\.[0-9a-f]{16}\.resumeMap$/);
    assert.doesNotMatch(key, /provider|alice|secret/);
});

test('favorite caches switch with the active provider and omit authenticated stream URLs', () => {
    let scope = 'source-a';
    let written;
    const values = {
        'source-a': JSON.stringify([{ key: 'sid:1', streamId: '1', name: 'A' }]),
        'source-b': JSON.stringify([{ key: 'sid:2', streamId: '2', name: 'B' }])
    };
    const App = {
        profileScope: () => scope,
        getProfileValue: () => values[scope],
        setProfileValue: (key, value) => { written = JSON.parse(value); values[scope] = value; },
        isGroupHeader: () => false, toast() {}
    };
    const Storage = { KEYS: { favChannels: 'favorites', favSeries: 'series' } };
    load('favorites', { App, Storage });
    assert.equal(App.loadFavoriteList()[0].streamId, '1');
    scope = 'source-b';
    assert.equal(App.loadFavoriteList()[0].streamId, '2');
    App.toggleFavoriteChannel({ streamId: '3', id: 'epg', name: 'C', url: 'https://user:secret@provider.test/live' });
    assert.equal(written[0].streamId, '3');
    assert.equal(written[0].url, '');
});

test('new resume records omit Xtream URLs when a stable content ID exists', () => {
    const App = {};
    load('resume', { App, Storage: { KEYS: {} } });
    const record = App.buildResumePayload({
        kind: 'vod', id: '42', name: 'Film',
        url: 'https://provider.test/movie/alice/secret/42.mp4'
    }, 60, 120, false);
    assert.equal(record.id, '42');
    assert.equal(record.url, '');
});

test('catalog fingerprint and cache payload do not expose credentials', () => {
    let payload;
    const App = { TYPE_ROWS: [] };
    const Storage = {
        KEYS: { playlistUrl: 'playlist' }, get() { return ''; },
        getScoped() { return ''; }, setScoped() {}, saveCatalogCache(value) { payload = value; }
    };
    const Xtream = { normalizeBase: v => v, parseM3uCredentials() { return null; } };
    const { App: loaded } = load('catalog', { App, Storage, Xtream });
    loaded.xtreamFromStorage = () => ({ server: 'https://provider.test', user: 'alice', pass: 'top-secret' });
    const fingerprint = loaded.catalogSourceFingerprint();
    assert.match(fingerprint, /^src-v2\|[0-9a-f]{16}$/);
    assert.doesNotMatch(fingerprint, /provider|alice|secret/);
    loaded.persistCatalogCache(fingerprint, {
        live: { categories: [], items: [{ name: 'One', url: 'https://stream.test' }] },
        base: 'https://provider.test', username: 'alice', password: 'top-secret'
    });
    assert.equal(payload.catalog.base, '');
    assert.equal(payload.catalog.username, '');
    assert.equal(payload.catalog.password, '');
});

test('filesystem SecurityError does not prevent startup or localStorage catalog fallback', async () => {
    const localStorage = memoryStorage();
    const { Storage } = load('storage', { window: { localStorage }, tizen: { filesystem: {
        resolve() { throw new Error('SecurityError'); }
    } } });
    let hydrated = false;
    assert.doesNotThrow(() => Storage.hydrate(() => { hydrated = true; }));
    assert.equal(hydrated, true);
    const payload = { fingerprint: 'test', catalog: { live: { items: [], categories: [] } } };
    let saved;
    assert.doesNotThrow(() => Storage.saveCatalogCache(payload, (ok) => { saved = ok; }));
    assert.equal(saved, true);
    assert.equal((await new Promise((resolve) => Storage.loadCatalogCache(resolve))).fingerprint, 'test');
});

test('classic settings writes serialize so older content cannot overwrite the latest save', () => {
    const pending = [];
    const contents = [];
    const { Storage } = load('storage', { window: { localStorage: memoryStorage() }, tizen: { filesystem: {
        resolve(path, done) { pending.push(() => done({ resolve() { return {
            openStream(mode, opened) { opened({ write: (json) => contents.push(JSON.parse(json)), close() {} }); }
        }; } })); }
    } } });
    Storage.set(Storage.KEYS.xtreamUser, 'old');
    Storage.flush();
    Storage.set(Storage.KEYS.xtreamUser, 'new');
    Storage.flush();
    assert.equal(pending.length, 1);
    pending.shift()();
    assert.equal(pending.length, 1);
    pending.shift()();
    assert.equal(contents.at(-1)['chouette-tv.xtreamUser'], 'new');
});

test('catalog quota failure preserves the previous offline cache', async () => {
    const localStorage = memoryStorage({ 'chouette-tv.catalogCache': JSON.stringify({ fingerprint: 'old', catalog: {} }) });
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    const { Storage } = load('storage', { window: { localStorage } });
    let saved;
    Storage.saveCatalogCache({ fingerprint: 'new', catalog: {} }, (ok) => { saved = ok; });
    assert.equal(saved, false);
    assert.equal((await new Promise((resolve) => Storage.loadCatalogCache(resolve))).fingerprint, 'old');
});

test('durable classic catalog file takes precedence over an old localStorage fallback', async () => {
    const localStorage = memoryStorage({ 'chouette-tv.catalogCache': JSON.stringify({ fingerprint: 'old', catalog: {} }) });
    const { Storage } = load('storage', { window: { localStorage }, tizen: { filesystem: {
        resolve(path, done) { done({ readAsText(read) { read(JSON.stringify({ fingerprint: 'new', catalog: {} })); } }); }
    } } });
    assert.equal((await new Promise((resolve) => Storage.loadCatalogCache(resolve))).fingerprint, 'new');
});

function runTool(name, setup) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-data-test-'));
    try {
        const args = setup(dir);
        return spawnSync(process.execPath, [path.join(__dirname, '../tools', name), ...args], { encoding: 'utf8' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('channel-map generation decodes entities once before escaping generated XML', () => {
    const result = runTool('make-channels.js', (dir) => {
        fs.writeFileSync(path.join(dir, 'list.m3u'), '#EXTM3U\n#EXTINF:-1 tvg-id="News.test",News\nhttps://example.test/live');
        fs.mkdirSync(path.join(dir, 'sites', 'example.test'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'sites', 'example.test', 'example.channels.xml'),
            '<channels><channel xmltv_id="News.test" site_id="a&amp;b" lang="en">News &amp; Weather</channel></channels>');
        return [path.join(dir, 'list.m3u'), path.join(dir, 'sites')];
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /site_id="a&amp;b"/);
    assert.match(result.stdout, />News &amp; Weather<\/channel>/);
    assert.doesNotMatch(result.stdout, /&amp;amp;/);
});

test('XMLTV conversion supports reserved channel names and Unicode entities', () => {
    const result = runTool('xmltv-to-json.js', (dir) => {
        const stamp = (t) => new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
        const file = path.join(dir, 'guide.xml');
        fs.writeFileSync(file, '<tv><programme channel="constructor@HD" start="' + stamp(Date.now() - 60000) +
            '" stop="' + stamp(Date.now() + 60000) + '"><title>News &#x1F4FA; &#128512; &amp;amp;</title></programme></tv>');
        return [file];
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).constructor[0].title, 'News 📺 😀 &amp;');
});
