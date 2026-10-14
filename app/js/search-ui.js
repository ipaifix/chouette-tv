/* Search UI — panneau droit style accueil (rangées Live / Films / Séries) */
var App = App || {};
(function (App) {
    'use strict';

    App.normalizeSearchText = function (s) {
        s = String(s || '').toLowerCase();
        try {
            if (typeof s.normalize === 'function') {
                s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            }
        } catch (e) {}
        return s
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ýÿ]/g, 'y')
            .replace(/ç/g, 'c')
            .replace(/ñ/g, 'n');
    };

    App.kindBadge = function (kind) {
        if (kind === 'vod') { return 'Film'; }
        if (kind === 'series') { return 'Série'; }
        if (kind === 'episode') { return 'Épisode'; }
        if (kind === 'search-query') { return 'Recherche'; }
        return 'TV';
    };

    App.listSearchHistory = function () {
        var raw = App.getProfileValue ? App.getProfileValue(Storage.KEYS.searchHistory)
            : Storage.get(Storage.KEYS.searchHistory);
        if (!raw) { return []; }
        try {
            var arr = JSON.parse(raw);
            if (Object.prototype.toString.call(arr) !== '[object Array]') { return []; }
            var out = [];
            var i;
            for (i = 0; i < arr.length; i++) {
                var q = String(arr[i] || '').trim();
                if (q && out.indexOf(q) < 0) { out.push(q); }
            }
            return out.slice(0, App.SEARCH_HISTORY_MAX || 12);
        } catch (e) {
            return [];
        }
    };

    App.saveSearchHistory = function (list) {
        try {
            if (App.setProfileValue) {
                App.setProfileValue(Storage.KEYS.searchHistory, JSON.stringify(list || []));
            } else {
                Storage.set(Storage.KEYS.searchHistory, JSON.stringify(list || []));
            }
        } catch (e) {}
    };

    App.rememberSearchQuery = function (q) {
        q = String(q || '').trim();
        if (q.length < 2) { return; }
        var list = App.listSearchHistory();
        var i = list.indexOf(q);
        if (i >= 0) { list.splice(i, 1); }
        list.unshift(q);
        App.saveSearchHistory(list.slice(0, App.SEARCH_HISTORY_MAX || 12));
    };

    App.buildSearchHistoryRows = function () {
        var hist = App.listSearchHistory();
        App.searchResults = [];
        App.searchRows = [];
        if (!hist.length) { return; }
        var items = [];
        var i;
        for (i = 0; i < hist.length; i++) {
            items.push({
                kind: 'search-query',
                title: hist[i],
                query: hist[i],
                meta: 'Récent',
                logo: ''
            });
        }
        App.searchRows = [{
            id: 'search-history',
            title: 'Recherches récentes',
            items: items
        }];
    };

    App.applySearchHistoryQuery = function (q) {
        q = String(q || '').trim();
        if (!App.$searchQuery) { return; }
        App.$searchQuery.value = q;
        App.blurSearchInput();
        App.rememberSearchQuery(q);
        App.runSearchFilter(true);
        if ((App.searchRows || []).length && App.searchRows[0].id !== 'search-history') {
            App.searchShellFocus = { zone: 'content', rowIndex: 0, itemIndex: 0 };
            App._searchScrollRow = -1;
        } else {
            App.searchShellFocus = { zone: 'query', rowIndex: 0, itemIndex: 0 };
        }
        App.updateSearchFocusUi();
    };

    App.collectSearchPool = function () {
        if (App._searchCatalog === App.catalog && App._searchPool) { return App._searchPool; }
        var pool = [];
        var types = ['live', 'vod', 'series'];
        var t;
        var i;
        for (t = 0; t < types.length; t++) {
            var bucket = App.bucketFor(types[t]);
            if (bucket._searchItems) { pool = pool.concat(bucket._searchItems); continue; }
            var items = bucket.items || [];
            for (i = 0; i < items.length; i++) {
                if (items[i] && !(App.isGroupHeader && App.isGroupHeader(items[i]))) {
                    pool.push(items[i]);
                }
            }
        }
        App._searchCatalog = App.catalog;
        App._searchPool = pool;
        return pool;
    };

    App.buildSearchRows = function (prebuilt) {
        var byKind = prebuilt || { live: [], vod: [], series: [] };
        var i;
        for (i = 0; !prebuilt && i < App.searchResults.length; i++) {
            var item = App.searchResults[i];
            if (!item) { continue; }
            var kind = item.kind || 'live';
            if (!byKind[kind]) { byKind[kind] = []; }
            byKind[kind].push({
                kind: kind,
                item: item
            });
        }
        var rows = [];
        if (byKind.live.length) {
            rows.push({ id: 'search-live', title: 'TV', items: byKind.live });
        }
        if (byKind.series.length) {
            rows.push({ id: 'search-series', title: 'Séries', items: byKind.series });
        }
        if (byKind.vod.length) {
            rows.push({ id: 'search-vod', title: 'Films', items: byKind.vod });
        }
        App.searchRows = rows;
    };

    App.runSearchFilter = function (chunked) {
        var generation = App._searchGeneration = (App._searchGeneration || 0) + 1;
        clearTimeout(App._searchWorkTimer);
        var qEl = App.$searchQuery;
        var q = App.normalizeSearchText(qEl ? qEl.value.trim() : '');
        var pool = App.collectSearchPool();
        var results = [];
        var rows = { live: [], vod: [], series: [] };
        var index = 0;
        chunked = chunked === true && pool.length > 2000;
        function finish() {
            if (generation !== App._searchGeneration) { return; }
            App.searchResults = results;
            if (q) { App.buildSearchRows(rows); }
            else { App.buildSearchHistoryRows(); }
            App.clampSearchFocus();
            App.renderSearchShell();
            App.updateSearchFocusUi();
        }
        function step() {
            if (generation !== App._searchGeneration) { return; }
            var start = Date.now();
            for (; q && index < pool.length; index++) {
                var item = pool[index];
                if (item._searchText == null) { item._searchText = App.normalizeSearchText(item.name); }
                if (item._searchText.indexOf(q) >= 0) {
                    results.push(item);
                    var kind = item.kind || 'live';
                    if (rows[kind]) { rows[kind].push({ kind: kind, item: item }); }
                }
                if (chunked && index % 100 === 99 && Date.now() - start >= 6) {
                    index++;
                    App._searchWorkTimer = setTimeout(step, 0);
                    return;
                }
            }
            finish();
        }
        if (chunked) {
            if (App.$searchShellMeta) { App.$searchShellMeta.textContent = 'Recherche…'; }
            App._searchWorkTimer = setTimeout(step, 0);
        } else { step(); }
    };

    App.scheduleSearchFilter = function () {
        clearTimeout(App.searchDebounceTimer);
        App._searchGeneration = (App._searchGeneration || 0) + 1;
        clearTimeout(App._searchWorkTimer);
        App.searchDebounceTimer = setTimeout(function () { App.runSearchFilter(true); }, App.SEARCH_DEBOUNCE_MS);
    };

    App.showSearchPane = function () {
        if (typeof App.showBrowseShell === 'function') {
            App.showBrowseShell();
        }
        if (App.$homeMain) { App.$homeMain.classList.add('hidden'); }
        if (App.$listCol) { App.$listCol.classList.add('hidden'); }
        if (App.$searchMain) { App.$searchMain.classList.remove('hidden'); }
        if (App.$list) {
            App.$list.classList.add('is-shell');
            App.$list.classList.add('is-search-shell');
            App.$list.classList.remove('is-home');
            App.$list.classList.remove('is-poster');
            App.$list.classList.remove('is-poster-live');
            App.$list.classList.remove('is-live-preview');
            App.$list.classList.remove('hidden');
        }
        if (App.$livePreview) {
            App.$livePreview.classList.add('hidden');
        }
        if (typeof App.renderRail === 'function') {
            App.renderRail();
        }
    };

    App.hideSearchPane = function () {
        if (App.$searchMain) { App.$searchMain.classList.add('hidden'); }
        if (App.$list) { App.$list.classList.remove('is-search-shell'); }
    };

    App.renderSearchShell = function () {
        if (!App.$searchShellRows) { return; }
        if (App.releaseHomeArtwork) { App.releaseHomeArtwork(App.$searchShellRows); }
        App.$searchShellRows.innerHTML = '';
        var q = App.$searchQuery ? App.$searchQuery.value.trim() : '';
        if (App.$searchShellMeta) {
            if (!q) {
                App.$searchShellMeta.textContent = App.searchRows.length
                    ? 'Recherches récentes · OK pour relancer'
                    : (App.searchEditing
                        ? 'Saisissez une chaîne, un film ou une série'
                        : 'OK pour commencer la saisie');
            } else if (!App.searchRows.length) {
                App.$searchShellMeta.textContent = 'Aucun résultat';
            } else {
                App.$searchShellMeta.textContent = App.searchResults.length + ' résultat' +
                    (App.searchResults.length > 1 ? 's' : '');
            }
        }
        if (!q) {
            if (!App.searchRows.length) {
                var tip = document.createElement('div');
                tip.className = 'home-empty';
                tip.textContent = 'Tape une recherche pour afficher TV, Films et Séries.';
                App.$searchShellRows.appendChild(tip);
                return;
            }
        } else if (!App.searchRows.length) {
            var none = document.createElement('div');
            none.className = 'home-empty';
            none.textContent = 'Aucun résultat pour « ' + q + ' ».';
            App.$searchShellRows.appendChild(none);
            return;
        }
        for (var i = 0; i < App.searchRows.length; i++) {
            var row = App.searchRows[i];
            var section = document.createElement('section');
            section.className = 'home-row';
            section.setAttribute('data-row', String(i));
            var head = document.createElement('div');
            head.className = 'home-row-title';
            head.textContent = row.title;
            var track = document.createElement('div');
            track.className = 'home-row-track';
            var f = App.searchShellFocus || {};
            var size = App.HOME_ROW_MAX || 14;
            var from = row.windowStart || 0;
            if (f.zone === 'content' && f.rowIndex === i) { from = Math.floor(f.itemIndex / size) * size; }
            row.windowStart = from;
            var until = Math.min(row.items.length, from + size);
            if (row.items.length > size) {
                head.textContent += ' · ' + (from + 1) + ' — ' + until + ' / ' + row.items.length;
                function pageButton(label, target, rowIndex) {
                    var pager = document.createElement('button');
                    pager.className = 'search-page-button';
                    pager.textContent = label;
                    pager.addEventListener('click', function () {
                        App.blurSearchInput();
                        App.searchShellFocus = { zone: 'content', rowIndex: rowIndex, itemIndex: target };
                        App.updateSearchFocusUi();
                    });
                    head.appendChild(pager);
                }
                if (from > 0) { pageButton('← Précédents', Math.max(0, from - size), i); }
                if (until < row.items.length) { pageButton('Suivants →', until, i); }
            }
            for (var j = from; j < until; j++) {
                var model = row.items[j];
                var content = model.item;
                var cardData = content ? { kind: model.kind, item: content,
                    title: App.displayCatalogTitle(content.name || ''),
                    meta: model.kind === 'live' && App.homeMetaForLive ? App.homeMetaForLive(content) : App.catalogTitleCountry(content.name),
                    logo: content.logo || '' } : model;
                var card = App.createHomeCard(cardData, i, j);
                track.appendChild(card);
            }
            section.appendChild(head);
            section.appendChild(track);
            App.$searchShellRows.appendChild(section);
        }
    };

    App.clampSearchFocus = function () {
        var f = App.searchShellFocus || { zone: 'query', rowIndex: 0, itemIndex: 0 };
        if (f.zone === 'query') {
            App.searchShellFocus = f;
            return;
        }
        var rows = App.searchRows || [];
        if (!rows.length) {
            f.zone = 'query';
            f.rowIndex = 0;
            f.itemIndex = 0;
        } else {
            f.rowIndex = Math.max(0, Math.min(rows.length - 1, f.rowIndex || 0));
            var n = rows[f.rowIndex].items.length;
            f.itemIndex = n ? Math.max(0, Math.min(n - 1, f.itemIndex || 0)) : 0;
        }
        App.searchShellFocus = f;
    };

    App.updateSearchFocusUi = function () {
        App.clampSearchFocus();
        var f = App.searchShellFocus;
        var focusedRow = (App.searchRows || [])[f.rowIndex];
        var size = App.HOME_ROW_MAX || 14;
        if (f.zone === 'content' && focusedRow && focusedRow.items.length > size &&
            Math.floor(f.itemIndex / size) * size !== (focusedRow.windowStart || 0)) {
            App.renderSearchShell();
        }
        var railFocused = App.isShellRailFocused && App.isShellRailFocused();
        if (App.$searchShellRows && typeof App.loadVisibleHomeImages === 'function') {
            App.loadVisibleHomeImages(App.$searchShellRows, f);
        }

        if (App.$searchQuery) {
            if (!railFocused && f.zone === 'query') {
                App.$searchQuery.classList.add('focused');
            } else {
                App.$searchQuery.classList.remove('focused');
            }
        }

        var cards = App.$searchShellRows
            ? App.$searchShellRows.querySelectorAll('.home-card') : [];
        for (var c = 0; c < cards.length; c++) {
            var el = cards[c];
            var ri = parseInt(el.getAttribute('data-row'), 10);
            var ii = parseInt(el.getAttribute('data-item'), 10);
            var on = !railFocused && f.zone === 'content' &&
                ri === f.rowIndex && ii === f.itemIndex;
            if (on) {
                el.classList.add('focused');
                try { el.focus(); } catch (eFocus) {}
            }
            else { el.classList.remove('focused'); }
        }

        if (f.zone === 'content' && !railFocused && App.$searchShellRows) {
            var section = App.$searchShellRows.querySelector(
                '.home-row[data-row="' + f.rowIndex + '"]'
            );
            if (section) {
                var track = section.querySelector('.home-row-track');
                var card = section.querySelector(
                    '.home-card[data-item="' + f.itemIndex + '"]'
                );
                if (track && card) {
                    if (typeof App.scrollHomeTrackToCard === 'function') {
                        App.scrollHomeTrackToCard(track, card, f.itemIndex - (focusedRow.windowStart || 0),
                            focusedRow.id === 'search-live');
                    } else if (!f.itemIndex) {
                        track.scrollLeft = 0;
                    } else {
                        var left = card.offsetLeft;
                        var right = left + card.offsetWidth;
                        var viewL = track.scrollLeft;
                        var viewR = viewL + track.clientWidth;
                        if (left < viewL + 24) {
                            track.scrollLeft = Math.max(0, left - 24);
                        } else if (right > viewR - 24) {
                            track.scrollLeft = Math.max(0, right - track.clientWidth + 24);
                        }
                    }
                }
                if (App._searchScrollRow !== f.rowIndex) {
                    App._searchScrollRow = f.rowIndex;
                    var cr = App.$searchShellRows.getBoundingClientRect();
                    var sr = section.getBoundingClientRect();
                    App.$searchShellRows.scrollTop = Math.max(
                        0,
                        App.$searchShellRows.scrollTop + (sr.top - cr.top)
                    );
                }
            }
        }
        if (typeof App.updateRailFocusUi === 'function') {
            App.updateRailFocusUi();
        }
    };

    App.beginSearchEdit = function () {
        if (!App.$searchQuery) { return; }
        App.searchEditing = true;
        App.searchShellFocus = { zone: 'query', rowIndex: 0, itemIndex: 0 };
        App.$searchQuery.readOnly = false;
        App.$searchQuery.classList.add('is-editing');
        App.$searchQuery.focus();
        try { App.$searchQuery.select(); } catch (e) {}
        if (App.$searchShellMeta && !App.$searchQuery.value.trim() &&
            !(App.searchRows || []).length) {
            App.$searchShellMeta.textContent = 'Saisissez une chaîne, un film ou une série';
        }
        App.updateSearchFocusUi();
    };

    App.blurSearchInput = function () {
        App.searchEditing = false;
        if (App.$searchQuery) {
            App.$searchQuery.readOnly = true;
            App.$searchQuery.classList.remove('is-editing');
            try { App.$searchQuery.blur(); } catch (e) {}
        }
    };

    /* A fullscreen playback started from Search must return to the same query
     * and card, instead of falling through to the last catalogue menu. */
    App.captureSearchPlaybackReturn = function () {
        App.searchPlaybackReturn = {
            query: App.$searchQuery ? App.$searchQuery.value : '',
            focus: {
                zone: (App.searchShellFocus && App.searchShellFocus.zone) || 'query',
                rowIndex: (App.searchShellFocus && App.searchShellFocus.rowIndex) || 0,
                itemIndex: (App.searchShellFocus && App.searchShellFocus.itemIndex) || 0
            }
        };
    };

    App.restoreSearchAfterPlayback = function () {
        var saved = App.searchPlaybackReturn;
        if (!saved) { return false; }
        App.searchPlaybackReturn = null;
        App.listLevel = 'search';
        App.uiState = 'search';
        App.blurSearchInput();
        if (App.$searchQuery) { App.$searchQuery.value = saved.query || ''; }
        App.setExclusiveOverlays({ list: true, dim: true });
        App.showSearchPane();
        App.runSearchFilter(true);
        App.searchShellFocus = saved.focus || { zone: 'query', rowIndex: 0, itemIndex: 0 };
        App._searchScrollRow = -1;
        App.clampSearchFocus();
        App.updateSearchFocusUi();
        return true;
    };

    App.showSearch = function () {
        if (App.uiState === 'browse' && typeof App.captureAuxReturnMenu === 'function') {
            App.captureAuxReturnMenu();
        } else {
            App.rememberMenu();
        }
        App.listLevel = 'search';
        App.searchCanCategory = false;
        App.searchScopeLocked = false;
        App.searchScope = 'global';
        App.searchCategoryId = null;
        App.searchResults = [];
        App.searchRows = [];
        App.searchShellFocus = { zone: 'query', rowIndex: 0, itemIndex: 0 };
        App._searchScrollRow = -1;
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = (function () {
            var rail = App.HOME_RAIL || [];
            for (var i = 0; i < rail.length; i++) {
                if (rail[i].action === 'search') { return i; }
            }
            return 0;
        })();
        App.blurSearchInput();
        var last = '';
        var hist = App.listSearchHistory();
        if (hist.length) { last = hist[0]; }
        if (App.$searchQuery) { App.$searchQuery.value = last; }
        App.uiState = 'search';
        App.setExclusiveOverlays({ list: true, dim: true });
        App.showSearchPane();
        if (last) {
            App.runSearchFilter(true);
        } else {
            App.buildSearchHistoryRows();
            App.renderSearchShell();
            App.updateSearchFocusUi();
        }
        App.beginSearchEdit();
    };

    App.dismissSearchShell = function () {
        clearTimeout(App.searchDebounceTimer);
        App._searchGeneration = (App._searchGeneration || 0) + 1;
        clearTimeout(App._searchWorkTimer);
        App.blurSearchInput();
        App.hideSearchPane();
        var typedOut = App.$searchQuery ? App.$searchQuery.value.trim() : '';
        if (typedOut) { App.rememberSearchQuery(typedOut); }
        if (App.$searchQuery) { App.$searchQuery.classList.remove('focused'); }
    };

    App.hideSearch = function () {
        App.dismissSearchShell();
        App.uiState = 'browse';
        App.setExclusiveOverlays({ list: true, dim: true });
        if (typeof App.restoreAuxReturnMenu === 'function' &&
            App.restoreAuxReturnMenu(true)) {
            return;
        }
        App.auxReturnMenu = null;
        if (typeof App.renderList === 'function') { App.renderList(); }
    };

    App.openSeriesFromSearch = function (seriesItem) {
        App.setContentType('series');
        App.openedFromFavorites = false;
        App.activeCategoryId = seriesItem.categoryId || App.activeCategoryId;
        App.activeSeries = seriesItem;
        clearTimeout(App.searchDebounceTimer);
        App.blurSearchInput();
        App.hideSearchPane();
        App.uiState = 'browse';
        App.setExclusiveOverlays({ list: true, dim: true });
        App.toast('Chargement de ' + seriesItem.name + '…');
        App.seriesLoading = true;
        /* Install the placeholder before either a cached or network response. */
        App.listLevel = 'seasons';
        App.seriesSeasons = [];
        App.focusedIndex = 0;
        App.renderList();
        Xtream.getSeriesInfo(
            App.xtreamCreds.base, App.xtreamCreds.username, App.xtreamCreds.password,
            seriesItem.seriesId,
            function (seasons) {
                App.seriesLoading = false;
                App.openSeasons(seasons);
                App.rememberMenu();
            },
            function (err) {
                App.seriesLoading = false;
                App.toast(err);
                App.openContentList(App.activeCategoryId);
            }
        );
    };

    App.onSearchSelect = function (item) {
        if (!item) { return; }
        if (item.kind === 'search-query') {
            App.applySearchHistoryQuery(item.query || item.title);
            return;
        }
        var typed = App.$searchQuery ? App.$searchQuery.value.trim() : '';
        if (typed) { App.rememberSearchQuery(typed); }
        if (App.showDetails && (item.kind === 'series' || item.kind === 'vod')) {
            App.blurSearchInput();
            App.showDetails(item);
            return;
        }
        if (item.kind === 'series') {
            App.openSeriesFromSearch(item);
            return;
        }
        clearTimeout(App.searchDebounceTimer);
        App.blurSearchInput();
        App.captureSearchPlaybackReturn();
        App.hideSearchPane();
        App.uiState = 'browse';
        App.setExclusiveOverlays({});
        App.playItem(item, item.kind || 'live');
    };

    App.activateSearchFocus = function () {
        var f = App.searchShellFocus || {};
        if (f.zone === 'query') {
            if (App.searchEditing) {
                App.blurSearchInput();
                if ((App.searchRows || []).length) {
                    App.searchShellFocus = { zone: 'content', rowIndex: 0, itemIndex: 0 };
                    App._searchScrollRow = -1;
                }
                App.updateSearchFocusUi();
            } else {
                App.beginSearchEdit();
            }
            return;
        }
        var row = (App.searchRows || [])[f.rowIndex];
        if (!row || !row.items[f.itemIndex]) { return; }
        var card = row.items[f.itemIndex];
        if (card.kind === 'search-query') {
            App.onSearchSelect(card);
            return;
        }
        App.onSearchSelect(card.item);
    };

    App.moveSearchFocus = function (dRow, dCol) {
        var f = App.searchShellFocus || { zone: 'query', rowIndex: 0, itemIndex: 0 };
        var rows = App.searchRows || [];

        if (f.zone === 'query') {
            if (dCol < 0 && App.usesBrowseShell && App.usesBrowseShell()) {
                App.blurSearchInput();
                App.focusShellRail(App.homeFocus.railIndex);
                return;
            }
            if (dRow > 0 && rows.length) {
                App.blurSearchInput();
                f.zone = 'content';
                f.rowIndex = 0;
                f.itemIndex = 0;
                App._searchScrollRow = -1;
                App.searchShellFocus = f;
                App.updateSearchFocusUi();
            }
            return;
        }

        if (dCol < 0 && f.itemIndex <= 0) {
            if (App.usesBrowseShell && App.usesBrowseShell()) {
                App.focusShellRail(App.homeFocus.railIndex);
                return;
            }
            f.zone = 'query';
            App.searchShellFocus = f;
            App.updateSearchFocusUi();
            return;
        }
        if (dCol) {
            var n = rows[f.rowIndex] ? rows[f.rowIndex].items.length : 0;
            if (!n) { return; }
            var next = f.itemIndex + dCol;
            if (next < 0 || next >= n) { return; }
            f.itemIndex = next;
            App.searchShellFocus = f;
            App.updateSearchFocusUi();
            return;
        }
        if (dRow < 0 && f.rowIndex <= 0) {
            f.zone = 'query';
            App.searchShellFocus = f;
            App.updateSearchFocusUi();
            return;
        }
        if (dRow) {
            var nr = f.rowIndex + dRow;
            if (nr < 0 || nr >= rows.length) { return; }
            var prev = f.itemIndex;
            f.rowIndex = nr;
            f.itemIndex = Math.max(0, Math.min(rows[nr].items.length - 1, prev));
            App.searchShellFocus = f;
            App.updateSearchFocusUi();
        }
    };

    App.onSearchKeys = function (e) {
        if (App.usesBrowseShell && App.usesBrowseShell() &&
            App.isShellRailFocused && App.isShellRailFocused() &&
            typeof App.onShellRailKeys === 'function') {
            App.onShellRailKeys(e);
            return;
        }

        if (App.searchEditing) {
            if (e.keyCode === App.KEY.RETURN || e.keyCode === App.KEY.ESC) {
                App.hideSearch();
                e.preventDefault();
                return;
            }
            if (e.keyCode === App.KEY.ENTER) {
                App.blurSearchInput();
                var typedEnter = App.$searchQuery ? App.$searchQuery.value.trim() : '';
                if (typedEnter) { App.rememberSearchQuery(typedEnter); }
                if ((App.searchRows || []).length) {
                    App.searchShellFocus = { zone: 'content', rowIndex: 0, itemIndex: 0 };
                    App._searchScrollRow = -1;
                }
                App.updateSearchFocusUi();
                e.preventDefault();
                return;
            }
            if (e.keyCode === App.KEY.DOWN) {
                App.blurSearchInput();
                if ((App.searchRows || []).length) {
                    App.searchShellFocus = { zone: 'content', rowIndex: 0, itemIndex: 0 };
                    App._searchScrollRow = -1;
                    App.updateSearchFocusUi();
                }
                e.preventDefault();
                return;
            }
            /* Let printable keys reach the input; filter on input event. */
            return;
        }

        switch (e.keyCode) {
            case App.KEY.UP:
                App.moveSearchFocus(-1, 0);
                e.preventDefault();
                break;
            case App.KEY.DOWN:
                App.moveSearchFocus(1, 0);
                e.preventDefault();
                break;
            case App.KEY.LEFT:
                App.moveSearchFocus(0, -1);
                e.preventDefault();
                break;
            case App.KEY.RIGHT:
                App.moveSearchFocus(0, 1);
                e.preventDefault();
                break;
            case App.KEY.ENTER:
                App.activateSearchFocus();
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.hideSearch();
                e.preventDefault();
                break;
        }
    };

    App.bindSearchShellEvents = function () {
        if (!App.$searchQuery || App.$searchQuery.getAttribute('data-bound') === '1') { return; }
        App.$searchQuery.setAttribute('data-bound', '1');
        App.$searchQuery.addEventListener('input', function () {
            App.scheduleSearchFilter();
        });
        App.$searchQuery.addEventListener('click', function () {
            if (App.uiState === 'search') { App.beginSearchEdit(); }
        });
        if (App.$searchShellRows) {
            App.$searchShellRows.addEventListener('click', function (e) {
                if (App.uiState !== 'search') { return; }
                var t = e.target;
                while (t && t !== App.$searchShellRows &&
                    (!t.classList || !t.classList.contains('home-card'))) {
                    t = t.parentNode;
                }
                if (!t || t === App.$searchShellRows) { return; }
                var ri = parseInt(t.getAttribute('data-row'), 10);
                var ii = parseInt(t.getAttribute('data-item'), 10);
                if (isNaN(ri) || isNaN(ii)) { return; }
                App.homeFocus = App.homeFocus || {};
                App.homeFocus.zone = 'content';
                App.searchShellFocus = { zone: 'content', rowIndex: ri, itemIndex: ii };
                App.updateSearchFocusUi();
                App.activateSearchFocus();
            });
        }
    };
})(App);
