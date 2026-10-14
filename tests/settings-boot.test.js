'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../app/js', name), 'utf8');
function settings(saved = {}) {
    const values = { ...saved };
    const calls = [];
    const input = value => ({ value: value || '' });
    const App = {
        $settingXtreamServer: input(values.xtreamServer),
        $settingXtreamUser: input(values.xtreamUser),
        $settingXtreamPass: input(''), $settingUrl: input(''), $settingEpg: input(''),
        toast: message => calls.push(['toast', message]),
        loadPlaylist: () => calls.push(['load'])
    };
    const Storage = {
        KEYS: new Proxy({}, { get: (_, key) => key }),
        get: key => values[key] || '',
        set: (key, value) => { values[key] = value; calls.push(['set', key]); },
        flush: () => calls.push(['flush'])
    };
    const ctx = vm.createContext({ App, Storage });
    vm.runInContext(source('xtream.js'), ctx);
    vm.runInContext(source('settings-ui.js'), ctx);
    App.hideSettings = () => calls.push(['hide']);
    return { App, values, calls };
}

test('blank password retains the existing password for the same account', () => {
    const { App, values, calls } = settings({ xtreamServer: 'https://old.example', xtreamUser: 'old', xtreamPass: 'old-secret' });
    App.saveSettings();
    assert.equal(values.xtreamPass, 'old-secret');
    assert.ok(calls.some(c => c[0] === 'load'));
});

test('changing account requires its password before any persistence or request', () => {
    const { App, values, calls } = settings({ xtreamServer: 'https://old.example', xtreamUser: 'old', xtreamPass: 'old-secret' });
    App.$settingXtreamServer.value = 'https://new.example';
    App.$settingXtreamUser.value = 'new';
    App.saveSettings();
    assert.equal(values.xtreamServer, 'https://old.example');
    assert.deepEqual(calls.map(c => c[0]), ['toast']);
});

test('importing get.php credentials uses one complete account', () => {
    const { App, values } = settings({ xtreamServer: 'https://old.example', xtreamUser: 'old', xtreamPass: 'old-secret' });
    App.$settingXtreamServer.value = '';
    App.$settingXtreamUser.value = '';
    App.$settingUrl.value = 'https://new.example/get.php?username=new&password=new-secret';
    App.saveSettings();
    assert.equal(values.xtreamServer, 'https://new.example');
    assert.equal(values.xtreamUser, 'new');
    assert.equal(values.xtreamPass, 'new-secret');
});

test('switching to a plain M3U clears the previous account password', () => {
    const { App, values } = settings({ xtreamServer: 'https://old.example', xtreamUser: 'old', xtreamPass: 'old-secret' });
    App.$settingXtreamServer.value = '';
    App.$settingXtreamUser.value = '';
    App.$settingUrl.value = 'https://new.example/list.m3u';
    App.saveSettings();
    assert.equal(values.xtreamPass, '');
});

test('a partial account is not mixed with credentials from another playlist', () => {
    const { App, calls } = settings();
    App.$settingXtreamServer.value = 'https://first.example';
    App.$settingUrl.value = 'https://second.example/get.php?username=second&password=secret';
    App.saveSettings();
    assert.deepEqual(calls.map(c => c[0]), ['toast']);
});

test('invalid URL schemes are rejected before persisting', () => {
    const { App, calls } = settings();
    App.$settingUrl.value = 'file:///etc/passwd';
    App.saveSettings();
    assert.deepEqual(calls.map(c => c[0]), ['toast']);
});

function boot() {
    const timers = [];
    const callbacks = [];
    const applied = [];
    let fingerprint = 'source-a';
    let refreshes = 0;
    const App = {
        catalogSourceFingerprint: () => fingerprint,
        startFromCatalog: cat => { applied.push(cat); return true; }
    };
    const ctx = vm.createContext({
        App, Storage: { loadCatalogCache: cb => callbacks.push(cb) },
        window: { addEventListener() {} },
        setTimeout: cb => timers.push(cb)
    });
    vm.runInContext(source('boot.js'), ctx);
    App.refreshCatalogFromServer = () => { App.catalogLoadGen++; refreshes++; };
    return { App, callbacks, applied, setSource: s => { fingerprint = s; },
        drain: () => { while (timers.length) timers.shift()(); },
        refreshes: () => refreshes };
}
const catalog = () => ({ live: { items: [{ name: 'Demo', url: 'https://example.test/live.ts' }], categories: [] } });

test('valid boot cache displays without an automatic network refresh', () => {
    const b = boot();
    b.App.loadPlaylist({ fromBoot: true });
    b.callbacks[0]({ fingerprint: 'source-a', catalog: catalog() });
    b.drain();
    assert.equal(b.applied.length, 1);
    assert.equal(b.refreshes(), 0);
});

test('boot cache cannot overwrite a later settings reload', () => {
    const b = boot();
    b.App.loadPlaylist({ fromBoot: true });
    b.App.loadPlaylist();
    b.callbacks[0]({ fingerprint: 'source-a', catalog: catalog() });
    b.drain();
    assert.equal(b.applied.length, 0);
    assert.equal(b.refreshes(), 1);
});

test('a changed source invalidates the deferred boot cache', () => {
    const b = boot();
    b.App.loadPlaylist({ fromBoot: true });
    b.callbacks[0]({ fingerprint: 'source-a', catalog: catalog() });
    b.setSource('source-b');
    b.drain();
    assert.equal(b.applied.length, 0);
});

test('malformed cached items trigger a network recovery', () => {
    const b = boot();
    b.App.loadPlaylist({ fromBoot: true });
    b.callbacks[0]({ fingerprint: 'source-a', catalog: { live: { items: [null], categories: [] } } });
    b.drain();
    assert.equal(b.applied.length, 0);
    assert.equal(b.refreshes(), 1);
});

test('failure to render a valid cache triggers a network recovery', () => {
    const b = boot();
    b.App.startFromCatalog = () => false;
    b.App.loadPlaylist({ fromBoot: true });
    b.callbacks[0]({ fingerprint: 'source-a', catalog: catalog() });
    b.drain();
    assert.equal(b.refreshes(), 1);
});

test('a soft partial refresh preserves only unavailable catalog sections', () => {
    const b = boot();
    b.App.normalizeCatalog = value => ({
        live: value.live || { items: [], categories: [] },
        vod: value.vod || { items: [], categories: [] },
        series: value.series || { items: [], categories: [] },
        partialTypes: value.partialTypes ? Array.from(value.partialTypes) : []
    });
    const previous = {
        live: { items: [{ id: 'old-live' }], categories: [] },
        vod: { items: [{ id: 'old-vod' }], categories: [] },
        series: { items: [{ id: 'old-series' }], categories: [] }
    };
    const incoming = {
        live: { items: [{ id: 'new-live' }], categories: [] },
        vod: { items: [], categories: [] },
        series: { items: [{ id: 'new-series' }], categories: [] },
        partialTypes: ['vod']
    };
    const merged = b.App.mergePartialCatalog(incoming, previous);
    assert.equal(merged.live.items[0].id, 'new-live');
    assert.equal(merged.vod.items[0].id, 'old-vod');
    assert.equal(merged.series.items[0].id, 'new-series');
});

test('the Samsung WebAPI library loads before AVPlay detection in the bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    assert.ok(scripts.includes('$WEBAPIS/webapis/webapis.js'));
    assert.ok(scripts.indexOf('$WEBAPIS/webapis/webapis.js') < scripts.indexOf('js/app.bundle.js'));
});
