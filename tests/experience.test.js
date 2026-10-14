'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function element(tag = 'div') {
    const attrs = {}, classes = new Set();
    return { tagName: tag.toUpperCase(), children: [], style: {}, value: '',
        classList: { add(...v) { v.forEach(c => classes.add(c)); }, remove(...v) { v.forEach(c => classes.delete(c)); },
            contains(v) { return classes.has(v); }, toggle(v, on) { on ? classes.add(v) : classes.delete(v); } },
        set textContent(v) { this.text = String(v); this.children = []; }, get textContent() { return this.text || ''; },
        appendChild(el) { this.children.push(el); }, setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; },
        addEventListener(k, fn) { this[k] = fn; }, focus() {}, scrollIntoView() {} };
}
function harness(files) {
    const local = new Map(), tasks = new Map();
    let seq = 0;
    const ctx = vm.createContext({ App: {}, window: { localStorage: {
        getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k)
    } }, document: { createElement: element, body: element(), getElementById() { return null; } },
    setTimeout(fn, delay) { const id = ++seq; tasks.set(id, { fn, delay }); return id; },
    clearTimeout(id) { tasks.delete(id); }, clearInterval() {}, Player: { stop() {} } });
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), ctx, { filename: file });
    }
    return Object.assign(ctx, { tasks, tick(delay) {
        for (const [id, t] of [...tasks]) { if (t.delay === delay) { tasks.delete(id); t.fn(); } }
    } });
}

test('people retain separate provider histories and language settings across reloads', () => {
    const h = harness(['storage.js', 'catalog.js', 'profiles.js']);
    const { App: a, Storage: s } = h;
    a.catalogSourceFingerprint = () => 'provider-one';
    a.toast = () => {};
    s.set(s.KEYS.resumeMap, '{"vod:1":{"pos":50,"id":"1"}}');
    assert.match(a.getProfileValue(s.KEYS.resumeMap), /50/);
    const id = a.addViewer('Zoé');
    const data = a.loadViewers(); data.active = id; s.set(s.KEYS.viewers, JSON.stringify(data));
    assert.equal(a.getProfileValue(s.KEYS.resumeMap), '');
    a.setProfileValue(s.KEYS.resumeMap, '{"vod:2":{"pos":90}}');
    a.updateViewer({ audio: 'original', subtitles: 'fr', autoplay: true });
    assert.equal(a.currentViewer().subtitles, 'fr');
    const updated = a.loadViewers(); updated.active = 'default'; s.set(s.KEYS.viewers, JSON.stringify(updated));
    assert.match(a.getProfileValue(s.KEYS.resumeMap), /50/);
    assert.equal(a.currentViewer().audio, 'fr');
    assert.equal(a.currentViewer().autoplay, false);
    updated.active = id; s.set(s.KEYS.viewers, JSON.stringify(updated));
    assert.equal(a.currentViewer().audio, 'original');
    assert.equal(a.currentViewer().autoplay, true);
    a.catalogSourceFingerprint = () => 'provider-two';
    assert.equal(a.getProfileValue(s.KEYS.resumeMap), '');
});

test('switch saves playback under the departing viewer and invalidates pending work', () => {
    const { App: a } = harness(['storage.js', 'catalog.js', 'profiles.js']);
    a.catalogSourceFingerprint = () => 'provider-one';
    a.toast = () => {};
    const id = a.addViewer('Alex');
    const saved = [];
    Object.assign(a, { playingItem: () => ({ kind: 'vod' }), isSeekablePlaying: () => true,
        persistResumePosition() { saved.push(a.currentViewer().id); }, stopResumeSaveLoop() {}, hideNextEpisodePrompt() {},
        markPosterSourceDirty() {}, markListWindowDirty() {}, setExclusiveOverlays() {}, openTypes() {}, scheduleFollowedSeriesRefresh() {} });
    assert.equal(a.switchViewer(id), true);
    assert.deepEqual(saved, ['default']);
    assert.equal(a.currentViewer().id, id);
    assert.equal(a.playingIndex, -1);
    assert.equal(a._seriesCtxToken, 1);
    assert.equal(a._followGeneration, 1);
});

test('selecting the active profile is a no-op and keeps playback intact', () => {
    const { App: a } = harness(['storage.js', 'catalog.js', 'profiles.js']);
    let stopped = 0;
    a.catalogSourceFingerprint = () => 'provider-one';
    a.playingItem = () => ({ kind: 'live' });
    a.stopResumeSaveLoop = () => { stopped++; };
    assert.equal(a.switchViewer('default'), true);
    assert.equal(stopped, 0);
    assert.equal(a.currentViewer().id, 'default');
});

test('a late followed-series response cannot queue episodes for the next viewer', () => {
    const h = harness(['follow.js']);
    const a = h.App; let done, applied = 0, scope = 'a';
    h.Xtream = { getSeriesInfo(b, u, p, id, callback) { done = callback; } };
    Object.assign(a, { profileScope: () => scope, loadFollowedSeries: () => [{ seriesId: '1' }],
        xtreamCreds: {}, applyFollowedSeasons() { applied++; } });
    a.refreshFollowedSeries(); scope = 'b'; a._followGeneration = 1;
    done([]);
    assert.equal(applied, 0);
});

function countdown() {
    const h = harness(['vod-controls.js']);
    const a = h.App;
    Object.assign(a, { $nextEpisodePrompt: element(), $nextEpisodeSub: element(), $nextEpisodeBtn: element(),
        currentViewer: () => ({ id: 'one', autoplay: true }), rememberMenu() {}, setExclusiveOverlays() {} });
    return h;
}
test('autoplay counts ten seconds, cancellation stops it and disabled autoplay stays manual', () => {
    const h = countdown(), a = h.App; let plays = 0;
    a.confirmNextEpisode = () => { plays++; };
    a.showNextEpisodePrompt({ item: { name: 'Épisode 2' } }, { exclusive: true });
    assert.match(a.$nextEpisodeSub.textContent, /10 s/);
    for (let i = 0; i < 9; i++) { h.tick(1000); }
    assert.equal(plays, 0);
    h.tick(1000); assert.equal(plays, 1);
    a.showNextEpisodePrompt({ item: { name: 'Épisode 3' } }, { exclusive: true });
    a.dismissNextEpisodePrompt();
    for (let i = 0; i < 11; i++) { h.tick(1000); }
    assert.equal(plays, 1);
    a.currentViewer = () => ({ id: 'one', autoplay: false });
    a.showNextEpisodePrompt({ item: { name: 'Épisode 4' } }, { exclusive: true });
    assert.equal(h.tasks.size, 0);
});

test('leaving a detail page ignores its pending response and restores search', () => {
    const h = harness(['experience-ui.js']), a = h.App; let done;
    h.Xtream = { getVodDetails(b, u, p, id, cb) { done = cb; } };
    Object.assign(a, { uiState: 'search', clearBrowseHold() {}, blurSearchInput() {}, blurSettingsInputs() {},
        displayCatalogTitle: s => s, profileScope: () => 'one', getResumeEntry: () => null, shouldOfferResume: () => false,
        xtreamCreds: { base: 'local' }, setExclusiveOverlays() {}, updateSearchFocusUi() {} });
    const item = { kind: 'vod', id: '1', name: 'Film' };
    a.showDetails(item); a.closeFeature(); done({ originalLanguage: 'en', plot: 'Late' });
    assert.equal(a.uiState, 'search');
    assert.equal(item.originalLanguage, undefined);
    assert.equal(a.$featurePanel.classList.contains('hidden'), true);
});

test('guide filters favorites and current shows without discarding channels lacking EPG by default', () => {
    const h = harness(['experience-ui.js']), a = h.App;
    const channels = [{ id: '1', url: 'one' }, { id: '2', url: 'two' }, { id: '3', url: 'three' }];
    h.EPG = { nowNext: id => id === '1' ? { now: {} } : null };
    a.catalogItems = () => channels; a.listFavoriteChannels = () => [channels[1]]; a.isGroupHeader = () => false;
    assert.equal(a.guideChannels(false, false).length, 3);
    assert.equal(a.guideChannels(false, true)[0].id, '1');
    assert.equal(a.guideChannels(true, false)[0].id, '2');
    assert.equal(a.guideChannels(true, true).length, 0);
});

test('original-language lookup during resume cannot apply tracks after a profile change', () => {
    const h = harness(['tracks-ui.js']), a = h.App;
    let done, viewer = { id: 'a', audio: 'original', subtitles: 'fr' };
    const calls = [];
    h.Player = { getPlaybackToken: () => 1, applyPreferredTracks(...args) { calls.push(args); return { audio: true, text: true }; } };
    h.Xtream = { getVodDetails(b, u, p, id, callback) { done = callback; } };
    const item = { id: '1', kind: 'vod', url: 'film' };
    Object.assign(a, { currentViewer: () => viewer, playingItem: () => item, xtreamCreds: { base: 'local' }, toast() {} });
    a.applyStoredTrackPrefs();
    assert.deepEqual(calls, [['', 'fr']]);
    viewer = { id: 'b', audio: 'fr', subtitles: 'off' };
    done({ originalLanguage: 'en' });
    assert.equal(calls.length, 1);
    assert.equal(item.originalLanguage, undefined);
});

test('detail metadata handles missing fields without fabricating a synopsis', () => {
    const h = harness([]); let finish;
    h.Http = { get(url, options, ok) { finish = ok; } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js/xtream.js'), 'utf8'), h);
    let result;
    h.Xtream.getVodDetails('http://local', 'demo', 'demo', '1', r => { result = r; }, assert.fail);
    finish(JSON.stringify({ info: { plot: { unsafe: true }, year: '2026', original_language: 'en' } }));
    assert.equal(result.plot, '');
    assert.equal(result.year, '2026');
    assert.equal(result.originalLanguage, 'en');
});

function buttonsBelow(root) {
    const out = [];
    (function walk(el) {
        if (el.tagName === 'BUTTON') { out.push(el); }
        (el.children || []).forEach(walk);
    })(root);
    return out;
}

test('series details prioritize a real resume episode and mount only twenty episode controls', () => {
    const h = harness(['experience-ui.js']), a = h.App;
    const episodes = Array.from({ length: 300 }, (_, i) => ({ kind: 'episode', id: String(i + 1), episodeNum: i + 1, name: 'E' + (i + 1), url: 'episode-' + (i + 1) }));
    const loaded = [{ season: '1', name: 'Season 1', episodes }];
    let played;
    h.Xtream = { getSeriesInfo(b, u, p, id, done) { done(loaded); } };
    Object.assign(a, { uiState: 'browse', clearBrowseHold() {}, blurSearchInput() {}, blurSettingsInputs() {},
        displayCatalogTitle: s => s, profileScope: () => 'one',
        getResumeEntry: item => item.id === '151' ? { pos: 80, dur: 600, at: 3 } : null,
        shouldOfferResume: entry => !!(entry && entry.pos >= 30),
        isFollowedSeries: () => false, currentViewer: () => ({ name: 'Maison' }), viewerPresetLabel: () => 'VF',
        xtreamCreds: { base: 'local' }, setExclusiveOverlays() {},
        playItem(...args) { played = args; } });
    a.showDetails({ kind: 'series', seriesId: '1', name: 'Long series' });
    let buttons = buttonsBelow(a.$featurePanel);
    assert.equal(buttons[1].textContent, 'Reprendre · S1 E151');
    assert.equal(buttons.filter(b => /^E\d/.test(b.textContent)).length, 20);
    buttons.find(b => b.textContent === 'Épisodes suivants →').click();
    buttons = buttonsBelow(a.$featurePanel);
    assert.equal(buttons.filter(b => /^E\d/.test(b.textContent)).length, 20);
    assert.ok(buttons.some(b => b.textContent === 'E21'));
    assert.equal(buttons.find(b => b.textContent === 'E21').classList.contains('focused'), true);
    buttons[1].click(); assert.equal(played[0].id, '151'); assert.equal(played[2].startAt, 80);
    assert.equal(played[2].skipResumePrompt, true); assert.equal(a.$featurePanel.children.length, 0);
});

test('Continue watching resumes directly and exposes Options through DOWN then OK', () => {
    const h = harness(['home-ui.js']), a = h.App; let played = 0, options = 0, startAt;
    const entry = { kind: 'vod', id: '1', pos: 75 }, item = { kind: 'vod', id: '1', url: 'movie' };
    Object.assign(a, { homeFocus: { zone: 'content', rowIndex: 0, itemIndex: 0 },
        homeRows: [{ items: [{ kind: 'continue', entry }] }], itemFromResumeEntry: () => item,
        shouldOfferResume: () => true, updateHomeFocusUi() {},
        playItem(target, kind, opts) { played++; startAt = opts.startAt; assert.equal(opts.skipResumePrompt, true); },
        showItemActions(target, opts) { options++; assert.equal(opts.entry, entry); } });
    a.activateHomeCard(); assert.equal(played, 1); assert.equal(startAt, 75);
    a.moveHomeFocus(1, 0); a.activateHomeCard(); assert.equal(options, 1);
    a.moveHomeFocus(-1, 0); a.activateHomeCard(); assert.equal(played, 2);
});

test('an open guide is repainted after import without changing its channel page or timeline', () => {
    const h = harness(['experience-ui.js']), a = h.App;
    let populated = false;
    h.EPG = { fmtTime: () => '12:00', schedule: () => populated ? [{ start: Date.now() + 7200000, stop: Date.now() + 7260000, title: 'Fresh programme' }] : [], nowNext: () => null };
    Object.assign(a, { uiState: 'browse', clearBrowseHold() {}, blurSearchInput() {}, blurSettingsInputs() {},
        setExclusiveOverlays() {}, displayCatalogTitle: value => value, isGroupHeader: () => false,
        catalogItems: () => Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: 'TV ' + i, url: 'live' })) });
    a.showLiveGuide({ start: 8, offset: 2, favorites: false, now: false });
    populated = true; a.refreshVisibleGuide();
    const buttons = buttonsBelow(a.$featurePanel);
    const channels = buttons.filter(b => b.classList.contains('guide-row'));
    assert.equal(channels.length, 8); assert.equal(channels[0].children[0].textContent, 'TV 8');
    assert.ok(channels[0].children[1].children.some(el => el.textContent.includes('Fresh programme')));
    assert.equal(channels[0].classList.contains('focused'), true);
});

test('live favorites use a dedicated player popup without stopping playback', () => {
    const h = harness(['live-favorite-ui.js']), a = h.App;
    let favorite = true, toggles = 0;
    const live = { kind: 'live', name: 'La Une', url: 'live' };
    const popup = element(); popup.classList.add('hidden');
    Object.assign(a, { KEY: { LEFT: 37, RIGHT: 39, ENTER: 13, RETURN: 10009, ESC: 27 },
        uiState: 'watch', $liveFavoritePopup: popup, $liveFavoriteMessage: element(),
        $liveFavoriteConfirm: element('button'), $liveFavoriteCancel: element('button'),
        playingItem: () => live, isFavoriteChannel: () => favorite,
        toggleFavoriteChannel() { favorite = false; toggles++; },
        setExclusiveOverlays(keep) {
            if (keep.liveFavorite) { popup.classList.remove('hidden'); }
        } });
    assert.equal(a.showLiveFavoritePopup(), true);
    assert.equal(a.uiState, 'liveFavorite');
    assert.equal(popup.classList.contains('hidden'), false);
    assert.equal(a.$liveFavoriteConfirm.textContent, 'Retirer des favoris');
    assert.match(a.$liveFavoriteMessage.textContent, /La Une/);
    a.confirmLiveFavorite();
    assert.equal(toggles, 1);
    assert.equal(a.uiState, 'watch');
    assert.equal(popup.classList.contains('hidden'), true);
    a.showLiveFavoritePopup();
    assert.equal(a.$liveFavoriteConfirm.textContent, 'Ajouter aux favoris');
});

test('continue watching can be cleaned from its visible action menu even if content vanished', () => {
    const h = harness(['experience-ui.js']), a = h.App;
    let removed = 0, rendered = 0;
    Object.assign(a, { uiState: 'browse', clearBrowseHold() {}, blurSearchInput() {}, blurSettingsInputs() {},
        displayCatalogTitle: s => s, continueItemLabel: () => 'Ancien film', setExclusiveOverlays() {},
        removeContinueEntry() { removed++; return true; }, renderList() { rendered++; } });
    a.showItemActions(null, { entry: { kind: 'vod', id: '404' } });
    const buttons = buttonsBelow(a.$featurePanel);
    assert.deepEqual(buttons.map(b => b.textContent), ['← Retour', 'Retirer de Continuer à regarder']);
    buttons[1].click();
    assert.equal(removed, 1);
    assert.equal(rendered, 1);
});

test('browse source contains no long-press deletion or favorite shortcut', () => {
    const remote = fs.readFileSync(path.join(__dirname, '../app/js/remote.js'), 'utf8');
    const browse = fs.readFileSync(path.join(__dirname, '../app/js/browse.js'), 'utf8');
    assert.doesNotMatch(remote, /armBrowseHold|releaseBrowseHold|toggleFavoriteFocused\(\)/);
    assert.doesNotMatch(browse, /maintenir\s*▶|INFO\s*[★a-z]/i);
});

test('selecting a live channel starts playback instead of opening an options menu', () => {
    const browse = fs.readFileSync(path.join(__dirname, '../app/js/browse-nav.js'), 'utf8');
    const home = fs.readFileSync(path.join(__dirname, '../app/js/home-ui.js'), 'utf8');
    assert.doesNotMatch(browse, /showItemActions\(favItem/);
    assert.doesNotMatch(browse, /showItemActions\(chItem/);
    assert.doesNotMatch(home, /showItemActions\(live/);
    assert.match(browse, /App\.playItem\(favItem, 'live'\)/);
    assert.match(home, /App\.playItem\(live, 'live'\)/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../app/js/experience-ui.js'), 'utf8'),
        /item\.kind === 'live' \? 'Regarder'/);
});
