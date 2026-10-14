'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUi(files, extra = {}) {
    const context = vm.createContext({ App: {}, clearTimeout() {}, setTimeout() {}, ...extra });
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), context, { filename: file });
    }
    return context;
}

function catalogApp() {
    const { App } = loadUi(['catalog.js', 'browse.js']);
    Object.assign(App, {
        catalog: { live: { categories: [{ id: 'a' }], items: [{ kind: 'live', categoryId: 'a', url: 'old' }] } },
        contentType: 'live', listLevel: 'content', activeCategoryId: 'a', visibleIndices: [0],
        uiState: 'browse', focusedIndex: 0, RECENT_CAT_ID: '__recent__',
        markPosterSourceDirty() { this._posterSourceDirty = true; },
        playingItem() { return null; }, rebuildZapList() {}, renderList() { this.rebuildPosterSource(); }
    });
    App.setContentType('live');
    return App;
}

test('a background refresh rebuilds category indices before rendering reordered channels', () => {
    const App = catalogApp();
    App.applyCatalogSoft({ live: { categories: [{ id: 'a' }, { id: 'b' }], items: [
        { kind: 'live', categoryId: 'b', name: 'B', url: 'b' },
        { kind: 'live', categoryId: 'a', name: 'A', url: 'a' }
    ] } });
    assert.deepEqual(Array.from(App.posterSource, row => row.item.url), ['a']);
});

test('a background refresh opens all content when its selected category disappears', () => {
    const App = catalogApp();
    App.applyCatalogSoft({ live: { categories: [{ id: 'b' }], items: [
        { kind: 'live', categoryId: 'b', name: 'B', url: 'b' }
    ] } });
    assert.equal(App.activeCategoryId, null);
    assert.deepEqual(Array.from(App.posterSource, row => row.item.url), ['b']);
});

test('a background refresh rebuilds the recent selection from newly added titles', () => {
    const App = catalogApp();
    App.contentType = 'vod';
    App.activeCategoryId = '__recent__';
    App.applyCatalogSoft({ vod: { categories: [], items: [
        { kind: 'vod', id: '1', addedAt: 1, url: 'old' },
        { kind: 'vod', id: '2', addedAt: 2, url: 'new' }
    ] } });
    assert.deepEqual(Array.from(App.posterSource, row => row.item.url), ['new', 'old']);
});

function seriesApp() {
    const seasons = [{ season: '1', name: 'Saison 1', episodes: [{ id: 'episode-1' }] }];
    const { App } = loadUi(['browse-nav.js', 'search-ui.js'], {
        Xtream: { getSeriesInfo(base, user, pass, id, done) { done(seasons); } }
    });
    Object.assign(App, {
        xtreamCreds: { base: 'https://example.invalid', username: 'test', password: 'test' },
        listRows: [], seriesSeasons: [],
        toast() {}, renderList() {}, rememberMenu() {},
        buildListRows() { this.listRows = this.listLevel === 'seasons' ? this.seriesSeasons : this.activeSeason.episodes; },
        setContentType(type) { this.contentType = type; }, setExclusiveOverlays() {},
        blurSearchInput() {}, hideSearchPane() {}, focusRowForPlaying() { return 0; }
    });
    return { App, seasons };
}

test('opening a series from search keeps synchronously cached seasons', () => {
    const { App, seasons } = seriesApp();
    App.openSeriesFromSearch({ seriesId: 'series-1', categoryId: 'a', name: 'Series' });
    assert.equal(App.seriesSeasons, seasons);
    assert.equal(App.listLevel, 'seasons');
    assert.equal(App.seriesLoading, false);
});

test('restoring a cached episode menu preserves its level and season', () => {
    const { App, seasons } = seriesApp();
    App.loadSeriesAndRestore({ seriesId: 'series-1', name: 'Series' }, {
        level: 'episodes', season: '1', focusedIndex: 0
    });
    assert.equal(App.listLevel, 'episodes');
    assert.equal(App.activeSeason, seasons[0]);
    assert.equal(App.seriesSeasons, seasons);
});

function imageRows(count = 10) {
    const cards = Array.from({ length: count }, (_, i) => {
        const img = { src: '', getAttribute(name) { return name === 'data-src' ? `https://example.invalid/${i}.png` : this.src; } };
        return { img, querySelector() { return img; } };
    });
    const section = {
        classList: { contains() { return true; } }, getAttribute() { return '0'; },
        querySelector() { return { children: cards }; }
    };
    return { children: [section], cards, querySelectorAll() { return []; } };
}

test('the Settings rail click works on the empty first-launch home', () => {
    const { App } = loadUi(['home-ui.js']);
    let click;
    let activated = -1;
    Object.assign(App, {
        uiState: 'browse', listLevel: 'types', homeFocus: {},
        useTypeMenu() { return false; },
        $homeRailNav: { getAttribute() { return ''; }, setAttribute() {}, addEventListener(name, fn) { click = fn; } },
        updateRailFocusUi() {}, activateHomeRail() { activated = this.homeFocus.railIndex; }
    });
    App.bindHomeRailClicks();
    click({ target: { classList: { contains() { return true; } }, getAttribute() { return '5'; } } });
    assert.equal(activated, 5);
});

test('rail clicks can leave Search or Settings without requiring a remote key', () => {
    for (const uiState of ['search', 'settings']) {
        const { App } = loadUi(['home-ui.js']);
        let click;
        let activated = -1;
        Object.assign(App, {
            uiState, listLevel: 'types', homeFocus: {},
            usesBrowseShell() { return true; }, isHomeDash() { return true; },
            $homeRailNav: { getAttribute() { return ''; }, setAttribute() {}, addEventListener(name, fn) { click = fn; } },
            updateRailFocusUi() {}, activateHomeRail() { activated = this.homeFocus.railIndex; }
        });
        App.bindHomeRailClicks();
        click({ target: { classList: { contains() { return true; } }, getAttribute() { return '3'; } } });
        assert.equal(activated, 3);
    }
});

test('Settings stays the active rail destination even when the underlying menu is Home', () => {
    const { App } = loadUi(['home-ui.js']);
    Object.assign(App, {
        uiState: 'settings', listLevel: 'types', contentType: 'live',
        HOME_RAIL: [
            { action: 'home' }, { action: 'type', type: 'live' },
            { action: 'search' }, { action: 'settings' }
        ]
    });
    assert.equal(App.currentShellRailIndex(), 3);
});

test('the browse shell exposes one global Search entry instead of duplicating it in categories', () => {
    const { App } = loadUi(['browse.js']);
    Object.assign(App, { listLevel: 'categories', contentType: 'live', usesBrowseShell: () => true });
    assert.equal(App.listLevelSupportsSearch(), false);
});

test('auxiliary screens preserve and restore the exact originating menu', () => {
    const { App } = loadUi(['home-ui.js']);
    const origin = { level: 'content', type: 'vod', categoryId: 'drama', focusedIndex: 7 };
    let restored;
    Object.assign(App, {
        menuMemory: null,
        rememberMenu() { this.menuMemory = origin; },
        restoreMenu() { restored = this.menuMemory; return true; }
    });
    App.captureAuxReturnMenu();
    App.menuMemory = { level: 'types' };
    assert.equal(App.restoreAuxReturnMenu(true), true);
    assert.equal(restored.level, 'content');
    assert.equal(restored.categoryId, 'drama');
    assert.equal(restored.focusedIndex, 7);
    assert.equal(App.auxReturnMenu, null);
});

test('opening an auxiliary rail destination restores focus to the originating content', () => {
    const { App } = loadUi(['home-ui.js']);
    let restored;
    Object.assign(App, {
        currentShellRailIndex() { return 2; },
        rememberMenu() {
            this.menuMemory = { level: 'content', type: 'vod', focusedIndex: 4,
                homeZone: 'rail', homeRailIndex: 7 };
        },
        restoreMenu() { restored = this.menuMemory; return true; }
    });
    App.captureAuxReturnMenu();
    App.restoreAuxReturnMenu(true);
    assert.equal(restored.homeZone, 'content');
    assert.equal(restored.homeRailIndex, 2);
    assert.equal(restored.focusedIndex, 4);
});

test('the guide row keeps flex layout despite the generic feature-button rule', () => {
    const css = fs.readFileSync(path.join(__dirname, '../app/css/style.css'), 'utf8');
    assert.match(css, /\.feature-panel\s*>\s*\.guide-row\s*\{[^}]*display\s*:\s*flex\s*;/);
});

test('live browse hints describe the direct action performed by OK', () => {
    const browse = fs.readFileSync(path.join(__dirname, '../app/js/browse.js'), 'utf8');
    assert.doesNotMatch(browse, /chaînes\s*·\s*OK ouvrir les options/i);
    assert.match(browse, /countLabel\(subCount, 'chaîne'\)[\s\S]*OK regarder/i);
});

test('playback opened from Search restores the same query and focused result', () => {
    const { App } = loadUi(['search-ui.js']);
    let renderedQuery = '';
    Object.assign(App, {
        $searchQuery: { value: 'Dune' },
        searchShellFocus: { zone: 'content', rowIndex: 1, itemIndex: 3 },
        blurSearchInput() {}, setExclusiveOverlays() {}, showSearchPane() {},
        runSearchFilter() { renderedQuery = this.$searchQuery.value; },
        clampSearchFocus() {}, updateSearchFocusUi() {}
    });
    App.captureSearchPlaybackReturn();
    App.$searchQuery.value = '';
    App.searchShellFocus = { zone: 'query', rowIndex: 0, itemIndex: 0 };
    assert.equal(App.restoreSearchAfterPlayback(), true);
    assert.equal(renderedQuery, 'Dune');
    assert.equal(App.uiState, 'search');
    assert.equal(JSON.stringify(App.searchShellFocus),
        JSON.stringify({ zone: 'content', rowIndex: 1, itemIndex: 3 }));
    assert.equal(App.searchPlaybackReturn, null);
});

test('selecting a live Search result captures its return context before playback', () => {
    const { App } = loadUi(['search-ui.js']);
    let played = '';
    Object.assign(App, {
        $searchQuery: { value: 'Info' },
        searchShellFocus: { zone: 'content', rowIndex: 0, itemIndex: 2 },
        rememberSearchQuery() {}, blurSearchInput() {}, hideSearchPane() {},
        setExclusiveOverlays() {}, playItem(item) { played = item.name; }
    });
    App.onSearchSelect({ kind: 'live', name: 'Info TV', url: 'demo' });
    assert.equal(played, 'Info TV');
    assert.equal(App.searchPlaybackReturn.query, 'Info');
    assert.equal(App.searchPlaybackReturn.focus.itemIndex, 2);
});

test('pointer clicks activate the exact visible catalogue card', () => {
    const { App } = loadUi(['browse.js']);
    let click;
    let activated = -1;
    const items = {
        getAttribute() { return ''; }, setAttribute() {},
        addEventListener(name, fn) { if (name === 'click') { click = fn; } }
    };
    Object.assign(App, {
        $items: items, uiState: 'browse', homeFocus: {},
        currentShellRailIndex: () => 2,
        updateListClasses() {}, onListEnter() { activated = this.focusedIndex; }
    });
    App.bindBrowseListClicks();
    const target = { parentNode: items, getAttribute(name) { return name === 'data-index' ? '6' : null; } };
    click({ target, preventDefault() {} });
    assert.equal(activated, 6);
    assert.equal(App.homeFocus.zone, 'content');
    assert.equal(App.homeFocus.railIndex, 2);
});

test('first launch Back opens the quit confirmation instead of an empty home', () => {
    const { App } = loadUi(['settings-ui.js']);
    let exit = 0;
    Object.assign(App, {
        settingsFocusables: [], hasCatalogContent: () => false,
        playingItem: () => null, showExit() { exit++; }
    });
    App.hideSettings();
    assert.equal(exit, 1);
});

test('home live-channel logos preserve their aspect ratio', () => {
    const css = fs.readFileSync(path.join(__dirname, '../app/css/style.css'), 'utf8');
    const rule = css.match(/\.home-card\.is-live \.home-card-art img\s*\{([^}]*)\}/);
    assert.ok(rule, 'missing home live-channel artwork rule');
    assert.match(rule[1], /object-fit\s*:\s*contain\s*;/);
});

test('home favorites show only the current programme below the channel logo', () => {
    const { App } = loadUi(['home-ui.js'], {
        EPG: { nowNext(id) { return id === 'tf1' ? { now: { title: 'Le journal' } } : null; } }
    });
    Object.assign(App, {
        HOME_ROW_MAX: 14,
        listContinueEntries() { return []; },
        listFavoriteChannels() { return [
            { id: 'tf1', name: '|FR| TF1', logo: 'tf1.png' },
            { id: 'unknown', name: '|FR| Inconnue', logo: 'unknown.png' }
        ]; },
        listRecentForType() { return []; }
    });

    App.buildHomeRows();

    assert.equal(App.homeRows[0].id, 'fav-live');
    assert.deepEqual(Array.from(App.homeRows[0].items, item => [item.title, item.meta]), [
        ['Le journal', ''],
        ['Programme indisponible', '']
    ]);
});

test('search loads visible artwork and loads later cards when their focus changes', () => {
    const { App } = loadUi(['home-ui.js', 'search-ui.js']);
    const searchRows = imageRows();
    Object.assign(App, {
        $searchShellRows: searchRows, searchRows: [{ items: new Array(10).fill({}) }],
        searchShellFocus: { zone: 'query', rowIndex: 0, itemIndex: 0 },
        isShellRailFocused() { return false; }, updateRailFocusUi() {}
    });
    App.updateSearchFocusUi();
    assert.equal(searchRows.cards[0].img.src, 'https://example.invalid/0.png');
    assert.equal(searchRows.cards[9].img.src, '');
    App.searchShellFocus = { zone: 'content', rowIndex: 0, itemIndex: 9 };
    searchRows.querySelector = () => null;
    App.updateSearchFocusUi();
    assert.equal(searchRows.cards[9].img.src, 'https://example.invalid/9.png');
});

test('home image loading follows the visible screen size instead of fixed row and card limits', () => {
    const rows = Array.from({ length: 4 }, (_, rowIndex) => {
        const cards = Array.from({ length: 14 }, (_, cardIndex) => {
            const img = {
                src: '',
                getAttribute(name) {
                    return name === 'data-src'
                        ? `https://example.invalid/${rowIndex}-${cardIndex}.png`
                        : this.src;
                }
            };
            return {
                img,
                offsetWidth: 168,
                classList: { contains() { return false; } },
                querySelector() { return img; }
            };
        });
        const track = { children: cards, clientWidth: 1840, scrollLeft: 0 };
        return {
            cards,
            classList: { contains(name) { return name === 'home-row'; } },
            getAttribute() { return String(rowIndex); },
            querySelector() { return track; }
        };
    });
    const rowsHost = {
        children: rows,
        clientWidth: 1840,
        clientHeight: 960,
        scrollTop: 0
    };
    const { App } = loadUi(['home-ui.js']);

    App.loadVisibleHomeImages(rowsHost, { zone: 'rail', rowIndex: 0, itemIndex: 0 });

    assert.equal(rows[0].cards[9].img.src, 'https://example.invalid/0-9.png');
    assert.equal(rows[2].cards[0].img.src, 'https://example.invalid/2-0.png');
    assert.equal(rows[0].cards[13].img.src, '');
});

test('search keeps every match reachable, including films and series in a large live catalog', () => {
    const { App } = loadUi(['catalog.js', 'search-ui.js']);
    Object.assign(App, {
        catalog: {
            live: { items: Array.from({ length: 100 }, (_, i) => ({ kind: 'live', name: `Match ${i}` })) },
            vod: { items: [{ kind: 'vod', name: 'Match Film' }] },
            series: { items: [{ kind: 'series', name: 'Match Series' }] }
        },
        $searchQuery: { value: 'Match' }, SEARCH_MAX_RESULTS: 80,
        renderSearchShell() {}, updateSearchFocusUi() {}
    });
    App.runSearchFilter();
    assert.equal(App.searchResults.length, 102);
    assert.equal(App.searchRows[0].items.length, 100);
    assert.deepEqual(Array.from(App.searchRows, row => row.id), ['search-live', 'search-series', 'search-vod']);
});

test('an immediate series loading error is not replaced by an empty seasons placeholder', () => {
    const { App } = loadUi(['search-ui.js'], {
        Xtream: { getSeriesInfo(base, user, pass, id, done, fail) { fail('Unavailable'); } }
    });
    Object.assign(App, {
        xtreamCreds: {}, toast() {}, setContentType() {}, setExclusiveOverlays() {},
        blurSearchInput() {}, hideSearchPane() {}, renderList() {},
        openContentList() { this.listLevel = 'content'; }
    });
    App.openSeriesFromSearch({ seriesId: 'series-1', name: 'Series' });
    assert.equal(App.listLevel, 'content');
    assert.equal(App.seriesLoading, false);
});
