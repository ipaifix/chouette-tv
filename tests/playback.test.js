'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(context, file) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'js', file), 'utf8'), context, { filename: file });
}

function timers() {
    const pending = new Map();
    let next = 0;
    return {
        setTimeout(fn, delay) { const id = ++next; pending.set(id, { fn, delay }); return id; },
        clearTimeout(id) { pending.delete(id); },
        setInterval() { return ++next; },
        clearInterval() {},
        flush(delay) {
            for (const [id, task] of [...pending]) {
                if (task.delay === delay) { pending.delete(id); task.fn(); }
            }
        }
    };
}

function avplayHarness() {
    const callbacks = [];
    const listeners = [];
    const statuses = [];
    const calls = { play: 0, stop: 0 };
    const avplay = {
        open() {}, close() {}, setDisplayRect() {}, setDisplayMethod() {}, setSilentSubtitle() {},
        stop() { calls.stop++; }, play() { calls.play++; },
        setListener(listener) { listeners.push(listener); },
        prepareAsync(ok, fail) { callbacks.push({ ok, fail }); },
        getCurrentTime() { return 0; }, getDuration() { return 120000; },
        getCurrentStreamInfo() { return []; }
    };
    const context = vm.createContext({ ...timers(), webapis: { avplay }, window: { innerWidth: 1920, innerHeight: 1080 } });
    load(context, 'player.js');
    context.Player.init((...args) => statuses.push(args));
    return { ...context, avplay, callbacks, listeners, statuses, calls };
}

test('preferred tracks select VF without subtitles and VOSTFR using original-language metadata', () => {
    const h = avplayHarness();
    const selected = [], silent = [];
    h.avplay.getTotalTrackInfo = () => [
        { type: 'AUDIO', index: 0, extra_info: '{"language":"fra"}' },
        { type: 'AUDIO', index: 1, extra_info: '{"language":"eng"}' },
        { type: 'TEXT', index: 2, extra_info: '{"track_lang":"fra"}' }
    ];
    h.avplay.setSelectTrack = (type, index) => selected.push([type, index]);
    h.avplay.setSilentSubtitle = value => silent.push(value);
    h.Player.applyPreferredTracks('fr', 'off');
    assert.deepEqual(selected, [['AUDIO', 0]]);
    assert.equal(silent.at(-1), true);
    selected.length = 0;
    h.Player.applyPreferredTracks('original', 'fr', 'en');
    assert.deepEqual(selected, [['AUDIO', 1], ['TEXT', 2]]);
    assert.equal(silent.at(-1), false);
    selected.length = 0;
    const result = h.Player.applyPreferredTracks('original', 'fr');
    assert.equal(result.originalUnknown, true);
    assert.deepEqual(selected, [['TEXT', 2]]);
});

test('AVPlay ignores prepare and listener callbacks after a channel change', () => {
    const h = avplayHarness();
    h.Player.play('https://example.test/a');
    h.Player.play('https://example.test/b');
    h.callbacks[0].ok();
    h.callbacks[0].fail('old failure');
    const stops = h.calls.stop;
    h.listeners[0].onstreamcompleted();
    h.listeners[0].onerror('old error');
    assert.equal(h.calls.play, 0);
    assert.equal(h.calls.stop, stops);
    assert.deepEqual(h.statuses, []);
    h.callbacks[1].ok();
    assert.equal(h.calls.play, 1);
    assert.equal(h.statuses.at(-1)[0], 'playing');
});

test('AVPlay cannot restart playback when preparation finishes after Stop', () => {
    const h = avplayHarness();
    h.Player.play('https://example.test/a');
    h.Player.stop();
    h.callbacks[0].ok();
    assert.equal(h.calls.play, 0);
    assert.deepEqual(h.statuses, []);
});

test('AVPlay reports asynchronous play failure and ignores obsolete seek completion', () => {
    const h = avplayHarness();
    h.Player.play('https://example.test/a');
    h.avplay.play = () => { throw new Error('decoder unavailable'); };
    assert.doesNotThrow(() => h.callbacks[0].ok());
    assert.deepEqual(h.statuses.at(-1), ['error', 'decoder unavailable']);
    let completeSeek;
    h.avplay.seekTo = (ms, ok) => { completeSeek = ok; };
    h.Player.seekTo(40);
    h.Player.stop();
    const count = h.statuses.length;
    completeSeek();
    assert.equal(h.statuses.length, count);
});

function html5Harness() {
    const scripts = [];
    const events = new Map();
    const video = {
        style: {}, paused: true, currentTime: 0, duration: 1800,
        addEventListener() {}, pause() {}, removeAttribute() {}, load() {},
        canPlayType() { return ''; }, play() { return Promise.resolve(); }
    };
    const document = {
        getElementById(id) { return id === 'html5-player' ? video : null; },
        createElement() { return {}; }, head: { appendChild(script) { scripts.push(script); } },
        addEventListener(name, fn) { events.set(name, fn); },
        removeEventListener(name, fn) { if (events.get(name) === fn) { events.delete(name); } }
    };
    const context = vm.createContext({ ...timers(), document, window: {} });
    load(context, 'player.js');
    context.Player.init();
    return { Player: context.Player, window: context.window, video, scripts, events };
}

test('late hls.js load cannot attach the previous stream after a channel change', async () => {
    const h = html5Harness();
    const sources = [];
    function Hls() {}
    Hls.isSupported = () => true;
    Hls.Events = { ERROR: 'error' };
    Hls.prototype.loadSource = url => sources.push(url);
    Hls.prototype.attachMedia = Hls.prototype.on = function () {};
    h.Player.play('https://example.test/a.m3u8');
    h.Player.play('https://example.test/b.mp4');
    h.window.Hls = Hls;
    h.scripts[0].onload();
    await Promise.resolve();
    assert.deepEqual(sources, []);
    assert.equal(h.video.src, 'https://example.test/b.mp4');
});

test('stopping a blocked HTML5 stream removes its gesture listeners', async () => {
    const h = html5Harness();
    h.video.play = () => Promise.reject({ name: 'NotAllowedError' });
    h.Player.play('https://example.test/a.mp4');
    await Promise.resolve();
    assert.equal(h.events.size, 2);
    h.Player.stop();
    assert.equal(h.events.size, 0);
});

test('late autoplay rejection cannot register gesture listeners after Stop', async () => {
    const h = html5Harness();
    let rejectPlay;
    h.video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
    h.Player.play('https://example.test/a.mp4');
    h.Player.stop();
    rejectPlay({ name: 'NotAllowedError' });
    await Promise.resolve();
    assert.equal(h.events.size, 0);
});

function appHarness() {
    const clock = timers();
    const store = {};
    const App = {
        RESUME_MIN_SEC: 30, RESUME_END_RATIO: 0.95, RESUME_END_MARGIN_SEC: 60,
        CONTINUE_MAX: 100, uiState: 'watch', livePreviewActive: false,
        toast() {}, setVodBufferingUi() {}, bumpVodControls() {}, applyStoredTrackPrefs() {},
        showVodControls() {}, showVodPauseIndicator() {},
        playingItem() { return this.current; }, catalogItems() { return []; }
    };
    const Player = {
        token: 1, getPlaybackToken() { return this.token; },
        isPaused() { return false; }, getPosition() { return 0; }, getDuration() { return 0; },
        seekTo() {}
    };
    const context = vm.createContext({
        ...clock, App, Player,
        Storage: { KEYS: { resumeMap: 'resume' }, get(key) { return store[key]; }, set(key, value) { store[key] = value; } }
    });
    load(context, 'resume.js');
    load(context, 'playback.js');
    return { App, Player, context, clock };
}

test('delayed resume seek belongs only to the playback that scheduled it', () => {
    const { App, Player, clock } = appHarness();
    const seeks = [];
    App.current = { kind: 'vod', id: 'a' };
    App.pendingSeekSec = 500;
    Player.seekTo = sec => seeks.push(sec);
    App.onPlayerStatus('playing');
    App.current = { kind: 'vod', id: 'b' };
    Player.token++;
    clock.flush(200);
    assert.deepEqual(seeks, []);
    App.pendingSeekSec = 200;
    App.onPlayerStatus('playing');
    clock.flush(200);
    assert.deepEqual(seeks, [200]);
});

test('resume metadata follows the episode even when another series is active', () => {
    const { App } = appHarness();
    App.activeSeries = { seriesId: 'b', name: 'Series B' };
    App.catalogItems = () => [{ seriesId: 'a', name: 'Series A' }];
    const episode = { kind: 'episode', id: '1', seriesId: 'a', name: 'Episode A1' };
    const result = App.buildResumePayload(episode, 100, 1800, false);
    assert.equal(result.seriesId, 'a');
    assert.equal(result.seriesTitle, 'Series A');
});

test('series context callbacks cannot overwrite a newer series or consume its waiters', () => {
    const { App, context } = appHarness();
    const requests = [];
    context.Xtream = { getSeriesInfo(base, user, pass, sid, ok, fail) { requests.push({ sid, ok, fail }); } };
    App.xtreamCreds = {};
    load(context, 'vod-controls.js');
    const a = { kind: 'episode', id: 'a1', seriesId: 'a', seriesTitle: 'A' };
    const b = { kind: 'episode', id: 'b1', seriesId: 'b', seriesTitle: 'B' };
    const outcomes = [];
    App.ensureSeriesContextForEpisode(a, ok => outcomes.push(['a', ok]));
    App.ensureSeriesContextForEpisode(b, ok => outcomes.push(['b', ok]));
    App.ensureSeriesContextForEpisode(b, ok => outcomes.push(['b waiter', ok]));
    requests[0].ok([{ season: 1, episodes: [a] }]);
    assert.equal(App._seriesCtxLoading, 'b');
    assert.deepEqual(outcomes, [['a', false]]);
    requests[1].ok([{ season: 1, episodes: [b] }]);
    assert.equal(App.activeSeason.episodes[0].id, 'b1');
    assert.deepEqual(outcomes, [['a', false], ['b', true], ['b waiter', true]]);
});

test('next episode lookup never uses the playing index from another series', () => {
    const { App, context } = appHarness();
    load(context, 'vod-controls.js');
    App.activeSeason = {
        season: 1,
        episodes: [{ kind: 'episode', id: 'a1', url: 'a1' }, { kind: 'episode', id: 'a2', url: 'a2' }]
    };
    App.seriesSeasons = [App.activeSeason];
    App.playingIndex = 0;
    assert.equal(App.findNextEpisode({ kind: 'episode', id: 'b1', url: 'b1' }), null);
    assert.equal(App.findNextEpisode(App.activeSeason.episodes[0]).item.id, 'a2');
});

test('a completed film remains marked watched and leaves Continue watching', () => {
    const { App } = appHarness();
    App.current = { kind: 'vod', id: 'film', name: 'Film' };
    App.lastKnownPos = 119;
    App.lastKnownDur = 120;
    App.hideVodControls = App.hideVodPauseIndicator = function () {};
    App.onPlayerStatus('ended');
    const entry = App.getResumeEntry(App.current);
    assert.ok(entry);
    assert.equal(entry.done, true);
    assert.equal(entry.pos, 120);
    assert.equal(App.listContinueEntries('vod').length, 0);
});

test('cached catalog reconstructs playback credentials from settings', () => {
    let bootError = '';
    const App = {
        normalizeCatalog: value => ({
            live: value.live, vod: value.vod, series: value.series,
            base: '', username: '', password: '', epgUrl: ''
        }),
        xtreamFromStorage: () => ({ server: 'https://provider.test', user: 'alice', pass: 'secret' }),
        catalogItems(type) { return this.catalog[type].items; },
        isGroupHeader: () => false,
        rebuildCatalogIndexes() {}, loadPersistedMenuExpanded() {}, setContentType() {},
        rebuildZapList() {}, stopResumeSaveLoop() {}, setExclusiveOverlays() {},
        useTypeMenu: () => true, openTypes() {}, rememberMenu() {},
        $list: { classList: { remove() {} } },
        toast(message) { bootError = message; }, showSettings() {}
    };
    const context = vm.createContext({ App, Player: { stop() {} }, setTimeout() {}, clearTimeout() {} });
    load(context, 'playback.js');
    const ok = App.startFromCatalog({
        live: { categories: [], items: [{ kind: 'live', name: 'One', url: 'https://stream.test' }] },
        vod: { categories: [], items: [] }, series: { categories: [], items: [] }
    });
    assert.equal(ok, true, bootError);
    assert.equal(App.xtreamCreds.base, 'https://provider.test');
    assert.equal(App.xtreamCreds.username, 'alice');
    assert.equal(App.xtreamCreds.password, 'secret');
});
