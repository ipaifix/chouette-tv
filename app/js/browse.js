/* Catalogue list build / render */
var App = App || {};
(function (App) {
    'use strict';

    App.countLabel = function (count, singular, plural) {
        return String(count) + ' ' + (count === 1 ? singular : (plural || singular + 's'));
    };

    App.activateBrowseIndex = function (index, e) {
        if (App.uiState !== 'browse' || !isFinite(index)) { return; }
        if (e && e.preventDefault) { e.preventDefault(); }
        App.focusedIndex = index;
        App.homeBrandFocused = false;
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = typeof App.currentShellRailIndex === 'function'
            ? App.currentShellRailIndex() : (App.homeFocus.railIndex || 0);
        App.updateListClasses();
        App.onListEnter();
    };

    /* ---------- accordion helpers (live separators) ---------- */

    App.isGroupHeader = function (ch) {
        var name = ((ch && ch.name) || '').trim();
        if (typeof DataJobs !== 'undefined') { return DataJobs.isHeader(name); }
        if (!name) { return false; }
        if (/^[▼▶►★☆*\s]*-{3,}.*-{3,}[▼▶►★☆*\s]*$/.test(name)) { return true; }
        if (/^\*{3,}.*\*{3,}$/.test(name)) { return true; }
        if (/^-{2,}/.test(name) || /-{2,}\s*$/.test(name)) { return true; }
        if (/---/.test(name) && /[★☆*]/.test(name)) { return true; }
        if (/^[\s\-—–★☆|]+$/.test(name)) { return true; }
        return /^-{2,}.*-{2,}/.test(name);
    }

    App.cleanHeaderLabel = function (name) {
        return String(name || '')
            .replace(/^[▼▶►★☆*\s]+/, '')
            .replace(/[★☆*\s]+$/, '')
            .replace(/^-+/, '')
            .replace(/-+$/, '')
            .trim() || name;
    }

    App.buildVisibleIndices = function (catId) {
        App.visibleIndices = [];
        if (App.isRecentCategory(catId)) {
            App.buildRecentIndices();
            for (var r = 0; r < App.recentIndices.length; r++) {
                App.visibleIndices.push(App.recentIndices[r]);
            }
            return;
        }
        for (var i = 0; i < App.channels.length; i++) {
            if (!catId || App.channels[i].categoryId === catId) {
                App.visibleIndices.push(i);
            }
        }
    }

    /*
     * Grid style accueil : Films / Séries (portrait) + TV (carré logo).
     * Aussi la page Favoris TV / Séries.
     */
    App.isPosterBrowse = function () {
        if (App.listLevel === 'content') {
            return App.contentType === 'vod' || App.contentType === 'series' ||
                App.contentType === 'live';
        }
        if (App.listLevel === 'favorites') {
            return App.contentType === 'live' || App.contentType === 'series';
        }
        return false;
    }

    App.isLivePosterBrowse = function () {
        return App.isPosterBrowse() && App.contentType === 'live';
    }

    /* Flat list of cards for the poster grid (skips M3U group headers). */
    App.rebuildPosterSource = function () {
        if (!App._posterSourceDirty && App.posterSource && App.posterSource.length >= 0 &&
            App._posterSourceLevel === App.listLevel &&
            App._posterSourceType === App.contentType &&
            App._posterSourceCat === App.activeCategoryId) {
            return;
        }
        App.posterSource = [];
        var i;
        if (App.listLevel === 'favorites') {
            var favs = App.contentType === 'series'
                ? (App.listFavoriteSeries ? App.listFavoriteSeries() : [])
                : (App.listFavoriteChannels ? App.listFavoriteChannels() : []);
            for (i = 0; i < favs.length; i++) {
                if (!favs[i]) { continue; }
                App.posterSource.push({
                    kind: 'favorite-item',
                    item: favs[i],
                    channelIndex: null
                });
            }
        } else {
            for (i = 0; i < App.visibleIndices.length; i++) {
                var chIndex = App.visibleIndices[i];
                var ch = App.channels[chIndex];
                if (!ch || App.isGroupHeader(ch)) { continue; }
                if (App.contentType === 'live' && !ch.url) { continue; }
                App.posterSource.push({
                    kind: App.contentType === 'series' ? 'series' : 'channel',
                    item: ch,
                    channelIndex: chIndex
                });
            }
        }
        App._posterSourceDirty = false;
        App._posterSourceLevel = App.listLevel;
        App._posterSourceType = App.contentType;
        App._posterSourceCat = App.activeCategoryId;
    }

    App.browseRowCount = function () {
        if (App.isPosterBrowse()) {
            App.rebuildPosterSource();
            return App.posterSource.length;
        }
        return App.listRows.length;
    }

    App.browseRowAt = function (index) {
        if (App.isPosterBrowse()) {
            var entry = App.posterSource && App.posterSource[index];
            if (!entry) { return null; }
            if (entry.kind === 'favorite-item') {
                return { kind: 'favorite-item', item: entry.item };
            }
            return {
                kind: entry.kind,
                channelIndex: entry.channelIndex,
                group: null
            };
        }
        return App.listRows[index] || null;
    }

    App.groupKey = function (channelIndex) {
        return App.contentType + ':' + String(App.activeCategoryId || 'all') + ':' + channelIndex;
    }

    App.listLevelSupportsSearch = function () {
        if (App.usesBrowseShell && App.usesBrowseShell()) { return false; }
        return App.listLevel === 'types' || App.listLevel === 'categories' || App.listLevel === 'content';
    }

    App.prependSearchRow = function () {
        if (App.listLevelSupportsSearch()) {
            App.listRows.unshift({ kind: 'search', label: 'Rechercher' });
        }
    }

    App.insertContinueRow = function () {
        var filter = null;
        if (App.listLevel === 'types') {
            filter = null;
        } else if ((App.listLevel === 'categories' || App.listLevel === 'content') &&
            (App.contentType === 'vod' || App.contentType === 'series')) {
            filter = App.contentType;
        } else {
            return;
        }
        var n = App.countContinueEntries(filter);
        if (!n) { return; }
        var row = {
            kind: 'continue',
            label: 'Continuer à regarder',
            count: n,
            filter: filter
        };
        /* After Search if present, otherwise at top. */
        if (App.listRows.length && App.listRows[0].kind === 'search') {
            App.listRows.splice(1, 0, row);
        } else {
            App.listRows.unshift(row);
        }
    }

    /* Favorites row for Live TV / Séries (categories), after Search / Continue. */
    App.insertFavoritesRow = function () {
        if (App.contentType !== 'live' && App.contentType !== 'series') { return; }
        if (App.listLevel !== 'categories' && App.listLevel !== 'content') { return; }
        var n = App.contentType === 'series'
            ? App.countFavoriteSeries()
            : App.countFavoriteChannels();
        if (!n) { return; }
        var row = {
            kind: 'favorites',
            label: '★ Favoris',
            count: n
        };
        var insertAt = 0;
        if (App.listRows.length && App.listRows[0].kind === 'search') { insertAt = 1; }
        if (App.listRows.length > insertAt && App.listRows[insertAt].kind === 'continue') {
            insertAt += 1;
        }
        App.listRows.splice(insertAt, 0, row);
    }

    App.defaultListFocusIndex = function () {
        for (var i = 0; i < App.listRows.length; i++) {
            var k = App.listRows[i].kind;
            if (k === 'search' || k === 'continue' || k === 'favorites' ||
                k === 'settings' || k === 'exit') {
                continue;
            }
            return i;
        }
        return 0;
    }

    App.appendSettingsRow = function () {
        if (App.listLevel === 'types') {
            App.listRows.push({ kind: 'settings', label: 'Réglages' });
            App.listRows.push({ kind: 'exit', label: 'Quitter' });
        } else if (App.listLevel === 'categories' && !App.useTypeMenu()) {
            App.listRows.push({ kind: 'settings', label: 'Réglages' });
            App.listRows.push({ kind: 'exit', label: 'Quitter' });
        } else if (App.listLevel === 'content' && !App.useTypeMenu() && !App.categories.length) {
            App.listRows.push({ kind: 'settings', label: 'Réglages' });
            App.listRows.push({ kind: 'exit', label: 'Quitter' });
        }
    }

    App.buildListRows = function () {
        App.listRows = [];
        var i;

        if (App.listLevel === 'types') {
            for (i = 0; i < App.TYPE_ROWS.length; i++) {
                var t = App.TYPE_ROWS[i];
                var bucket = App.bucketFor(t.type);
                App.listRows.push({
                    kind: 'type',
                    type: t.type,
                    label: t.label,
                    count: (bucket.items || []).length
                });
            }
            App.prependSearchRow();
            App.insertContinueRow();
            App.appendSettingsRow();
            return;
        }

        if (App.listLevel === 'continue') {
            var entries = App.listContinueEntries(App.continueFilter);
            for (i = 0; i < entries.length; i++) {
                App.listRows.push({
                    kind: 'continue-item',
                    entry: entries[i],
                    label: App.continueItemLabel(entries[i])
                });
            }
            return;
        }

        if (App.listLevel === 'favorites') {
            var favs = App.contentType === 'series'
                ? App.listFavoriteSeries()
                : App.listFavoriteChannels();
            for (i = 0; i < favs.length; i++) {
                App.listRows.push({
                    kind: 'favorite-item',
                    item: favs[i],
                    label: App.displayCatalogTitle(
                        favs[i].name || (App.contentType === 'series' ? 'Série' : 'Chaîne')
                    )
                });
            }
            return;
        }

        if (App.listLevel === 'categories') {
            var allLabel = App.contentType === 'vod' ? 'Tous les films'
                : (App.contentType === 'series' ? 'Toutes les séries' : 'Toutes les chaînes');
            App.listRows.push({ kind: 'category', catId: null, label: allLabel, count: App.channels.length });
            if (App.contentType === 'vod' || App.contentType === 'series') {
                var recentN = App.countRecentItems();
                if (recentN > 0) {
                    App.listRows.push({
                        kind: 'category',
                        catId: App.RECENT_CAT_ID,
                        label: 'Derniers ajouts',
                        count: recentN
                    });
                }
            }
            for (i = 0; i < App.categories.length; i++) {
                App.listRows.push({
                    kind: 'category',
                    catId: App.categories[i].id,
                    label: App.categories[i].name,
                    count: App.countInCategory(App.categories[i].id)
                });
            }
            App.prependSearchRow();
            App.insertContinueRow();
            App.insertFavoritesRow();
            App.appendSettingsRow();
            return;
        }

        if (App.listLevel === 'seasons') {
            for (i = 0; i < App.seriesSeasons.length; i++) {
                App.listRows.push({
                    kind: 'season',
                    seasonIndex: i,
                    label: App.seriesSeasons[i].name,
                    count: App.seriesSeasons[i].episodes.length
                });
            }
            return;
        }

        if (App.listLevel === 'episodes') {
            var eps = (App.activeSeason && App.activeSeason.episodes) || [];
            for (i = 0; i < eps.length; i++) {
                App.listRows.push({ kind: 'episode', episodeIndex: i, item: eps[i] });
            }
            return;
        }

        /* content level — grids use posterSource (visibleIndices), not listRows. */
        if (App.contentType === 'vod' || App.contentType === 'series' ||
            App.contentType === 'live') {
            App.listRows = [];
            return;
        }

        var useAccordion = true;
        var currentGroup = null;
        for (i = 0; i < App.visibleIndices.length; i++) {
            var chIndex = App.visibleIndices[i];
            var ch = App.channels[chIndex];
            if (useAccordion && App.isGroupHeader(ch)) {
                currentGroup = App.groupKey(chIndex);
                if (App.expandedGroups[currentGroup] == null) {
                    App.expandedGroups[currentGroup] = false;
                }
                App.listRows.push({
                    kind: 'header',
                    channelIndex: chIndex,
                    group: currentGroup,
                    label: App.cleanHeaderLabel(ch.name)
                });
            } else if (useAccordion && currentGroup) {
                if (App.expandedGroups[currentGroup]) {
                    App.listRows.push({
                        kind: 'channel',
                        channelIndex: chIndex,
                        group: currentGroup
                    });
                }
            } else {
                App.listRows.push({
                    kind: 'channel',
                    channelIndex: chIndex,
                    group: null
                });
            }
        }
        App.prependSearchRow();
        App.insertContinueRow();
        App.insertFavoritesRow();
        App.appendSettingsRow();
    }

    App.ensurePlayingGroupExpanded = function () {
        if (App.playingIndex < 0 || App.listLevel !== 'content' || App.contentType !== 'live') { return; }
        var current = App.playingItem();
        if (!current || !current.url) { return; }
        var currentGroup = null;
        var i;
        for (i = 0; i < App.visibleIndices.length; i++) {
            var chIndex = App.visibleIndices[i];
            var ch = App.channels[chIndex];
            if (App.isGroupHeader(ch)) {
                currentGroup = App.groupKey(chIndex);
            } else if (ch.url === current.url && currentGroup) {
                App.expandedGroups[currentGroup] = true;
                return;
            }
        }
    }

    App.focusRowForPlaying = function () {
        var current = App.playingItem();
        if (!current) { return 0; }
        var i;
        if (App.isPosterBrowse()) {
            App.rebuildPosterSource();
            for (i = 0; i < App.posterSource.length; i++) {
                var entry = App.posterSource[i];
                var pch = entry && entry.item;
                if (!pch) { continue; }
                if (current.url && pch.url === current.url) { return i; }
                if (!pch.url && current.id && pch.id === current.id) { return i; }
                if (current.streamId && pch.streamId &&
                    String(current.streamId) === String(pch.streamId)) {
                    return i;
                }
            }
            return 0;
        }
        for (i = 0; i < App.listRows.length; i++) {
            if (App.listRows[i].kind === 'channel' || App.listRows[i].kind === 'series') {
                var ch = App.channels[App.listRows[i].channelIndex];
                if (ch && current.url && ch.url === current.url) { return i; }
                if (ch && !ch.url && ch.id === current.id) { return i; }
            }
            if (App.listRows[i].kind === 'episode' && App.listRows[i].item &&
                App.listRows[i].item.url === current.url) {
                return i;
            }
        }
        if (App.contentType === 'live') {
            var group = null;
            for (var j = 0; j < App.visibleIndices.length; j++) {
                var idx = App.visibleIndices[j];
                if (App.isGroupHeader(App.channels[idx])) { group = App.groupKey(idx); }
                else if (App.channels[idx].url === current.url && group) {
                    for (var r = 0; r < App.listRows.length; r++) {
                        if (App.listRows[r].kind === 'header' && App.listRows[r].group === group) {
                            return r;
                        }
                    }
                }
            }
        }
        return 0;
    }

    App.createPosterCard = function (item, index) {
        var isLive = !!(item && (item.kind === 'live' || App.contentType === 'live'));
        var li = document.createElement('li');
        li.className = 'is-poster home-card' + (isLive ? ' is-live' : '');
        li.setAttribute('data-index', String(index));
        li.setAttribute('role', 'button');
        li.tabIndex = -1;
        li.addEventListener('click', function (e) {
            if (e && e.stopPropagation) { e.stopPropagation(); }
            App.activateBrowseIndex(index, e);
        });

        var art = document.createElement('div');
        art.className = 'home-card-art poster-art';
        var placeholder = document.createElement('span');
        placeholder.className = 'home-card-placeholder poster-placeholder';
        placeholder.textContent = isLive ? 'TV' : 'Sans image';
        art.appendChild(placeholder);

        if (item && item.logo) {
            var img = document.createElement('img');
            img.alt = '';
            img.width = 168;
            img.height = isLive ? 168 : 252;
            img.setAttribute('decoding', 'async');
            img.setAttribute('data-src', item.logo);
            img.onload = function () {
                art.classList.remove('is-empty');
            };
            img.onerror = function () {
                try { img.style.display = 'none'; } catch (eImg) {}
                art.classList.add('is-empty');
            };
            art.appendChild(img);
            art.classList.add('is-empty');
        } else {
            art.classList.add('is-empty');
        }

        var title = document.createElement('div');
        title.className = 'home-card-title poster-title';
        title.textContent = (item && typeof App.displayCatalogTitle === 'function')
            ? App.displayCatalogTitle(item.name)
            : ((item && item.name) || '');

        li.appendChild(art);
        li.appendChild(title);

        var metaText = '';
        if (isLive && typeof App.homeMetaForLive === 'function') {
            metaText = App.homeMetaForLive(item) || '';
        } else if (!isLive && typeof App.homeMetaForCatalogItem === 'function') {
            metaText = App.homeMetaForCatalogItem(item) || '';
        }
        if (metaText) {
            var meta = document.createElement('div');
            meta.className = 'home-card-meta';
            meta.textContent = metaText;
            li.appendChild(meta);
        }

        if (item && item.kind === 'series' && App.isFavoriteSeries(item)) {
            li.className += ' is-fav';
            var favBadge = document.createElement('span');
            favBadge.className = 'poster-fav';
            favBadge.textContent = '★';
            art.appendChild(favBadge);
        } else if (isLive && App.isFavoriteChannel && App.isFavoriteChannel(item)) {
            li.className += ' is-fav';
            var favLive = document.createElement('span');
            favLive.className = 'poster-fav';
            favLive.textContent = '★';
            art.appendChild(favLive);
        }

        if (item && item.kind === 'vod') {
            App.appendWatchProgress(li, App.getResumeEntry(item));
        } else if (item && item.kind === 'series') {
            App.appendWatchProgress(li, App.bestSeriesResume(item.seriesId), {
                seriesStyle: true
            });
        }
        var badge = li.querySelector('.watch-badge');
        var bar = li.querySelector('.watch-progress');
        if (badge) { art.appendChild(badge); }
        if (bar) { art.appendChild(bar); }

        return li;
    }

    App.loadPosterCardImage = function (li) {
        if (!li) { return; }
        var img = li.querySelector('img[data-src]');
        if (!img) { return; }
        var src = img.getAttribute('data-src');
        if (!src || img.getAttribute('src') === src) { return; }
        img.src = src;
    }

    App.loadVisiblePosterImages = function () {
        if (!App.$items) { return; }
        var lis = App.$items.children;
        for (var i = 0; i < lis.length; i++) {
            App.loadPosterCardImage(lis[i]);
        }
    }

    /* How many full poster rows fit in #channel-items at 1080p. */
    App.estimatePosterRowHeight = function () {
        var cols = App.POSTER_COLS || 7;
        var w = App.$items && App.$items.clientWidth ? App.$items.clientWidth : 1824;
        var cellW = w / cols;
        var artRatio = App.isLivePosterBrowse() ? 1 : 1.5;
        /* art + title (~22) + optional meta (~18) + padding */
        return Math.ceil(cellW * artRatio + (App.isLivePosterBrowse() ? 48 : 34));
    }

    App.getPosterWindowRows = function () {
        var fallback = App.POSTER_WINDOW_ROWS || 2;
        var h = App.$items && App.$items.clientHeight ? App.$items.clientHeight : 0;
        var rowH = App.estimatePosterRowHeight();
        var sample = App.$items && App.$items.querySelector('li.is-poster');
        if (sample && sample.offsetHeight > 40) {
            rowH = sample.offsetHeight;
        }
        if (!h || h < 80) {
            /* Before layout: assume ~1080 minus compact header/padding. */
            h = 900;
        }
        var rows = Math.floor(h / rowH);
        if (rows < 1) { rows = 1; }
        if (rows > 4) { rows = 4; }
        return rows || fallback;
    }

    /* Keep focused poster inside the scrollable grid viewport. */
    App.ensurePosterInView = function () {
        if (!App.$items) { return; }
        var focused = App.$items.querySelector('li.is-poster.focused');
        if (!focused) { return; }
        var viewH = App.$items.clientHeight;
        if (!viewH) { return; }
        var top = focused.offsetTop - App.$items.offsetTop;
        var bottom = top + focused.offsetHeight;
        var st = App.$items.scrollTop;
        var pad = 8;
        if (top < st + pad) {
            App.$items.scrollTop = Math.max(0, top - pad);
        } else if (bottom > st + viewH - pad) {
            App.$items.scrollTop = Math.max(0, bottom - viewH + pad);
        }
    }

    App.renderPosterWindow = function (force) {
        if (!App.$items) { return; }
        App.rebuildPosterSource();
        var cols = App.POSTER_COLS || 7;
        var winRows = App.getPosterWindowRows();
        var n = App.posterSource.length;
        var focusRow = n ? Math.floor(App.focusedIndex / cols) : 0;
        var totalRows = n ? Math.ceil(n / cols) : 0;
        var maxStart = Math.max(0, totalRows - winRows);
        var startRow = App.posterWindowStart || 0;

        if (focusRow < startRow) { startRow = focusRow; }
        if (focusRow >= startRow + winRows) {
            startRow = focusRow - winRows + 1;
        }
        startRow = Math.max(0, Math.min(maxStart, startRow));

        var needRebuild = !!force || startRow !== App.posterWindowStart ||
            winRows !== (App._posterWinRowsApplied || 0) ||
            !App.$items.querySelector('.is-poster');
        App.posterWindowStart = startRow;
        App._posterWinRowsApplied = winRows;

        if (!needRebuild) {
            App.updatePosterFocus();
            return;
        }

        var frag = document.createDocumentFragment();
        App.$items.innerHTML = '';
        App.$items.scrollTop = 0;
        App._posterFocusedEl = null;
        if (!n) {
            var empty = document.createElement('li');
            empty.className = 'is-poster-empty';
            empty.textContent = App.contentType === 'live'
                ? 'Aucune chaîne'
                : 'Aucun titre';
            App.$items.appendChild(empty);
            return;
        }

        var startIdx = startRow * cols;
        var endIdx = Math.min(n, startIdx + winRows * cols);
        for (var i = startIdx; i < endIdx; i++) {
            var entry = App.posterSource[i];
            var item = entry && entry.item;
            if (!item) { continue; }
            var card = App.createPosterCard(item, i);
            if (i === App.focusedIndex &&
                !(App.isShellRailFocused && App.isShellRailFocused())) {
                card.classList.add('focused');
                App._posterFocusedEl = card;
            }
            frag.appendChild(card);
        }
        App.$items.appendChild(frag);
        App.loadVisiblePosterImages();
        App.ensurePosterInView();
    }

    App.updatePosterFocus = function () {
        if (!App.$items) { return; }
        var railFocused = App.isShellRailFocused && App.isShellRailFocused();
        var next = null;
        if (!railFocused) {
            next = App.$items.querySelector(
                'li.is-poster[data-index="' + App.focusedIndex + '"]'
            );
        }
        var prev = App._posterFocusedEl;
        if (prev && prev !== next) {
            prev.classList.remove('focused');
        }
        if (next) {
            next.classList.add('focused');
            try { next.focus(); } catch (e) {}
        }
        App._posterFocusedEl = next;
        App.ensurePosterInView();
    }

    App.movePosterFocus = function (dRow, dCol) {
        var cols = App.POSTER_COLS || 7;
        var n = (App.posterSource && App.posterSource.length) || 0;
        if (!n) {
            App.rebuildPosterSource();
            n = App.posterSource.length;
        }
        if (!n) { return; }
        var idx = App.focusedIndex;
        var row = Math.floor(idx / cols);
        var col = idx % cols;
        var maxRow = Math.floor((n - 1) / cols);
        var next = idx;

        if (dCol) {
            var newCol = col + dCol;
            if (newCol < 0 || newCol >= cols) { return; }
            next = row * cols + newCol;
            if (next >= n) { return; }
        }
        if (dRow) {
            var newRow = row + dRow;
            if (newRow < 0) { newRow = 0; }
            if (newRow > maxRow) { newRow = maxRow; }
            next = newRow * cols + col;
            if (next >= n) { next = n - 1; }
        }
        if (next === idx) { return; }
        App.focusedIndex = next;
        if (typeof App.scheduleUi === 'function') {
            App.scheduleUi(function () { App.renderPosterWindow(false); });
        } else {
            App.renderPosterWindow(false);
        }
    }

    App.rememberMenu = function () {
        var expandedCopy = {};
        try {
            expandedCopy = JSON.parse(JSON.stringify(App.expandedGroups));
        } catch (e) {
            expandedCopy = {};
        }
        var hf = App.homeFocus || {};
        App.menuMemory = {
            type: App.contentType,
            level: App.listLevel,
            categoryId: App.activeCategoryId,
            focusedIndex: App.focusedIndex,
            expanded: expandedCopy,
            seriesId: App.activeSeries ? App.activeSeries.seriesId : '',
            season: App.activeSeason ? App.activeSeason.season : '',
            continueFilter: App.continueFilter,
            homeZone: hf.zone || 'rail',
            homeRailIndex: hf.railIndex || 0,
            homeRowIndex: hf.rowIndex || 0,
            homeItemIndex: hf.itemIndex || 0
        };
        Storage.set(Storage.KEYS.menuType, App.contentType);
        Storage.set(Storage.KEYS.menuLevel, App.listLevel);
        Storage.set(Storage.KEYS.menuCat, App.activeCategoryId || '');
        Storage.set(Storage.KEYS.menuFocus, String(App.focusedIndex));
        Storage.set(Storage.KEYS.menuSeries, App.activeSeries ? (App.activeSeries.seriesId || '') : '');
        Storage.set(Storage.KEYS.menuSeason, App.activeSeason ? (App.activeSeason.season || '') : '');
        try { Storage.set(Storage.KEYS.menuExpanded, JSON.stringify(App.expandedGroups)); } catch (e2) {}
        var ch = App.playingItem();
        if (ch && ch.url) {
            Storage.set(Storage.KEYS.lastChannelUrl, ch.url);
        }
    }

    App.loadPersistedMenuExpanded = function () {
        var raw = Storage.get(Storage.KEYS.menuExpanded);
        if (!raw) { return; }
        try {
            var obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') { App.expandedGroups = obj; }
        } catch (e) {}
    }

    App.renderList = function () {
        if (!App.$list) { return; }
        if (App.usesBrowseShell && App.usesBrowseShell()) {
            if (App.isHomeDash && App.isHomeDash() && typeof App.renderHomeDash === 'function') {
                App.renderHomeDash();
                return;
            }
            if (typeof App.showCataloguePane === 'function') {
                App.showCataloguePane();
            }
            if (typeof App.renderRail === 'function') {
                App.renderRail();
            }
            App.homeFocus = App.homeFocus || {};
            if (App.homeFocus.zone !== 'rail') {
                App.homeFocus.zone = 'content';
                App.homeFocus.railIndex = typeof App.currentShellRailIndex === 'function'
                    ? App.currentShellRailIndex() : 0;
            }
        } else if (App.isHomeDash && App.isHomeDash() && typeof App.renderHomeDash === 'function') {
            App.renderHomeDash();
            return;
        } else if (typeof App.hideBrowseShell === 'function') {
            App.hideBrowseShell();
        } else if (typeof App.hideHomeDashChrome === 'function') {
            App.hideHomeDashChrome();
        }
        if (!App.$items) { return; }
        App.beginResumeSnap();
        try {
            if (App.listLevel === 'content') {
                App.ensurePlayingGroupExpanded();
            }
            App.buildListRows();
            var rowCount = App.browseRowCount();
            if (App.focusedIndex < 0) { App.focusedIndex = 0; }
            if (rowCount === 0) {
                App.focusedIndex = 0;
            } else if (App.focusedIndex >= rowCount) {
                App.focusedIndex = rowCount - 1;
            }

            App.$items.innerHTML = '';

            if (App.isPosterBrowse()) {
                App.homeBrandFocused = false;
                if (App.$listBrand) { App.$listBrand.classList.remove('is-focused'); }
                App.$list.classList.remove('is-home');
                App.$list.classList.remove('is-live-preview');
                App.$list.classList.add('is-poster');
                if (App.isLivePosterBrowse && App.isLivePosterBrowse()) {
                    App.$list.classList.add('is-poster-live');
                } else {
                    App.$list.classList.remove('is-poster-live');
                }
                if (App.$livePreview) { App.$livePreview.classList.add('hidden'); }
                if (App.$listMode) { App.$listMode.textContent = App.typeLabel(App.contentType); }
                if (App.$listTitle) {
                    if (App.listLevel === 'favorites') {
                        App.$listTitle.textContent = 'Favoris';
                    } else {
                        App.$listTitle.textContent = App.categoryName(App.activeCategoryId);
                    }
                }
                if (App.$listSub) {
                    App.rebuildPosterSource();
                    var subCount = App.posterSource.length;
                    if (App.listLevel === 'favorites') {
                        App.$listSub.textContent = App.contentType === 'series'
                            ? (App.countLabel(subCount, 'série') + ' · OK ouvrir les options')
                            : (App.countLabel(subCount, 'chaîne') + ' · OK regarder');
                    } else if (App.contentType === 'live') {
                        App.$listSub.textContent = App.countLabel(subCount, 'chaîne') +
                            ' · OK regarder';
                    } else if (App.contentType === 'series') {
                        App.$listSub.textContent = App.countLabel(subCount, 'série') +
                            ' · OK ouvrir la fiche';
                    } else {
                        App.$listSub.textContent = App.countLabel(subCount, 'film') +
                            ' · OK pour lire';
                    }
                }
                if (App.$listKeys) {
                    App.$listKeys.textContent =
                        '▲▼◀▶ naviguer · OK ouvrir · ◀ menu · BACK retour';
                }
                App.posterWindowStart = 0;
                App.renderPosterWindow(true);
            } else {
                App.$list.classList.remove('is-poster');
                App.$list.classList.remove('is-poster-live');

            if (App.listLevel === 'types') {
                /* Fallback if home-ui missing — classic list. */
                App.$list.classList.add('is-home');
                App.$list.classList.remove('is-live-preview');
                if (App.$livePreview) {
                    App.$livePreview.classList.add('hidden');
                    App.$livePreview.setAttribute('aria-hidden', 'true');
                }
                if (App.$listMode) { App.$listMode.textContent = 'Accueil'; }
                if (App.$listTitle) { App.$listTitle.textContent = Branding.name; }
                if (App.$listSub) {
                    App.$listSub.textContent = 'Choisis TV, Films ou Séries';
                }
                if (App.$listKeys) {
                    App.$listKeys.textContent = '▲▼ naviguer · OK ouvrir · BACK quitter';
                }
            } else {
                App.homeBrandFocused = false;
                if (App.$listBrand) { App.$listBrand.classList.remove('is-focused'); }
                App.$list.classList.remove('is-home');
                /* Badge = section (TV / Films / Séries) pour savoir où on est. */
                if (App.$listMode) {
                    App.$listMode.textContent = App.typeLabel(App.contentType);
                }
                if (App.listLevel === 'continue') {
                    if (App.$listTitle) { App.$listTitle.textContent = 'Continuer à regarder'; }
                    if (App.$listSub) {
                        App.$listSub.textContent = App.continueFilter === 'vod'
                            ? 'Films en cours · OK pour les options'
                            : (App.continueFilter === 'series'
                                ? 'Séries en cours · OK pour les options'
                                : 'Reprendre ou retirer un contenu avec le menu Options');
                    }
                } else if (App.listLevel === 'favorites') {
                    if (App.$listTitle) { App.$listTitle.textContent = 'Favoris'; }
                    if (App.$listSub) {
                        App.$listSub.textContent = App.contentType === 'series'
                            ? 'Séries favorites · OK pour ouvrir la fiche'
                            : 'Chaînes favorites · OK pour les options';
                    }
                } else if (App.listLevel === 'categories') {
                    if (App.$listTitle) { App.$listTitle.textContent = 'Catégories'; }
                    if (App.$listSub) {
                        App.$listSub.textContent = App.countLabel(App.channels.length, 'titre');
                    }
                } else if (App.listLevel === 'seasons') {
                    if (App.$listTitle) {
                        App.$listTitle.textContent = App.activeSeries
                            ? App.displayCatalogTitle(App.activeSeries.name)
                            : 'Saisons';
                    }
                    if (App.$listSub) { App.$listSub.textContent = 'Choisir une saison'; }
                } else if (App.listLevel === 'episodes') {
                    if (App.$listTitle) {
                        App.$listTitle.textContent = App.activeSeason ? App.activeSeason.name : 'Épisodes';
                    }
                    if (App.$listSub) { App.$listSub.textContent = 'OK pour lire · plein écran'; }
                } else {
                    if (App.$listTitle) { App.$listTitle.textContent = App.categoryName(App.activeCategoryId); }
                    if (App.$listSub) {
                        App.$listSub.textContent = App.contentType === 'live'
                            ? 'OK pour regarder ou gérer le favori'
                            : (App.contentType === 'series'
                                ? 'OK pour ouvrir la série'
                                : 'OK pour lire · plein écran');
                    }
                }
                if (App.$listKeys) {
                    if (App.listLevel === 'content' && App.contentType === 'live') {
                        App.$listKeys.textContent =
                            '▲▼ aperçu · OK options · ◀ menu · BACK remonter';
                    } else if (App.listLevel === 'favorites') {
                        App.$listKeys.textContent = App.contentType === 'series'
                            ? '▲▼ naviguer · OK ouvrir la fiche · ◀ menu · BACK remonter'
                            : '▲▼ aperçu · OK options · ◀ menu · BACK remonter';
                    } else if (App.listLevel === 'continue') {
                        App.$listKeys.textContent =
                            '▲▼ naviguer · OK options · BACK remonter';
                    } else {
                        App.$listKeys.textContent =
                            '▲▼ naviguer · OK ouvrir · ◀ menu · BACK remonter';
                    }
                }
            }

            App.listWindowStart = 0;
            App._listWindowDirty = true;
            App._listFocusedEl = null;
            App._listPlayingEl = null;
            App.renderListWindow(true);
            } /* end non-poster */
        } catch (err) {
            try { App.toast('Erreur du menu : ' + (err && err.message ? err.message : err), true); } catch (e2) {}
        }
        App.endResumeSnap();
        App.updateListClasses();
    }

    App.usesListWindow = function () {
        if (App.isPosterBrowse && App.isPosterBrowse()) { return false; }
        if (App.isHomeDash && App.isHomeDash()) { return false; }
        return App.listLevel === 'categories' || App.listLevel === 'content' ||
            App.listLevel === 'seasons' || App.listLevel === 'episodes' ||
            App.listLevel === 'continue' || App.listLevel === 'favorites' ||
            App.listLevel === 'types';
    };

    App.getListWindowSize = function () {
        var fallback = App.LIST_WINDOW_ROWS || 12;
        var h = App.$items && App.$items.clientHeight ? App.$items.clientHeight : 0;
        if (!h || h < 80) { h = 900; }
        var rowH = 52;
        var sample = App.$items && App.$items.querySelector('li');
        if (sample && sample.offsetHeight > 20) {
            rowH = sample.offsetHeight;
        }
        var rows = Math.floor(h / rowH) + 2;
        if (rows < 8) { rows = 8; }
        if (rows > 24) { rows = 24; }
        return rows || fallback;
    };

    App.createListRowElement = function (row, index) {
        if (!row) { return null; }
        var li = document.createElement('li');
        li.setAttribute('data-index', String(index));
        li.setAttribute('role', 'button');
        li.tabIndex = -1;
        li.addEventListener('click', function (e) {
            if (e && e.stopPropagation) { e.stopPropagation(); }
            App.activateBrowseIndex(index, e);
        });

        if (row.kind === 'search') {
            li.className = 'is-search';
            li.appendChild(document.createTextNode(row.label || 'Recherche'));
        } else if (row.kind === 'continue') {
            li.className = 'is-continue';
            li.appendChild(document.createTextNode(row.label || 'Continue'));
            var cMeta = document.createElement('span');
            cMeta.className = 'item-meta';
            cMeta.textContent = String(row.count || 0);
            li.appendChild(cMeta);
        } else if (row.kind === 'favorites') {
            li.className = 'is-favorite';
            li.appendChild(document.createTextNode(row.label || 'Favoris'));
            var fMeta = document.createElement('span');
            fMeta.className = 'item-meta';
            fMeta.textContent = String(row.count || 0);
            li.appendChild(fMeta);
        } else if (row.kind === 'continue-item') {
            li.className = 'is-channel has-progress';
            li.appendChild(document.createTextNode(row.label || ''));
            App.appendWatchProgress(li, row.entry, {
                seriesStyle: row.entry && row.entry.kind === 'episode'
            });
        } else if (row.kind === 'favorite-item') {
            li.className = 'is-channel is-fav';
            var starF = document.createElement('span');
            starF.className = 'fav-star';
            starF.textContent = '★ ';
            li.appendChild(starF);
            li.appendChild(document.createTextNode(row.label || 'Chaîne'));
        } else if (row.kind === 'settings' || row.kind === 'exit') {
            li.className = row.kind === 'settings' ? 'is-settings' : 'is-settings is-exit';
            li.appendChild(document.createTextNode(row.label || ''));
        } else if (row.kind === 'type' || row.kind === 'category' || row.kind === 'season') {
            li.className = row.kind === 'type' ? 'is-type' : 'is-category';
            li.appendChild(document.createTextNode(row.label || ''));
            if (row.kind === 'season') {
                var seasonEntry = App.bestSeasonResume(App.seriesSeasons[row.seasonIndex]);
                if (seasonEntry) {
                    App.appendWatchProgress(li, seasonEntry, { seriesStyle: true });
                } else {
                    var sMeta = document.createElement('span');
                    sMeta.className = 'item-meta';
                    sMeta.textContent = String(row.count || 0);
                    li.appendChild(sMeta);
                }
            } else {
                var meta = document.createElement('span');
                meta.className = 'item-meta';
                meta.textContent = String(row.count || 0);
                li.appendChild(meta);
            }
        } else if (row.kind === 'header') {
            var open = !!App.expandedGroups[row.group];
            li.className = 'is-header';
            var mark = document.createElement('span');
            mark.className = 'group-mark';
            mark.textContent = open ? '▼ ' : '▶ ';
            li.appendChild(mark);
            li.appendChild(document.createTextNode(row.label || ''));
        } else if (row.kind === 'episode') {
            li.className = 'is-channel';
            var ep = row.item;
            li.appendChild(document.createTextNode(
                (ep && App.displayCatalogTitle(ep.name)) || 'Episode'
            ));
            if (ep) { App.appendWatchProgress(li, App.getResumeEntry(ep)); }
        } else if (row.kind === 'series') {
            li.className = 'is-channel';
            if (row.group) { li.className += ' is-child'; }
            var seriesItem = App.channels[row.channelIndex];
            if (!seriesItem) { return null; }
            if (App.isFavoriteSeries(seriesItem)) {
                li.className += ' is-fav';
                var starS = document.createElement('span');
                starS.className = 'fav-star';
                starS.textContent = '★ ';
                li.appendChild(starS);
            }
            li.appendChild(document.createTextNode(
                App.displayCatalogTitle(seriesItem.name || 'Série')
            ));
            App.appendWatchProgress(li, App.bestSeriesResume(seriesItem.seriesId), {
                seriesStyle: true
            });
        } else {
            li.className = 'is-channel';
            if (row.group) { li.className += ' is-child'; }
            var item = App.channels[row.channelIndex];
            if (!item) { return null; }
            if (App.contentType === 'live' && App.isFavoriteChannel(item)) {
                li.className += ' is-fav';
                var star = document.createElement('span');
                star.className = 'fav-star';
                star.textContent = '★ ';
                li.appendChild(star);
            }
            if (item.kind === 'live' && item.id && EPG.hasData(item.id)) {
                var badge = document.createElement('span');
                badge.className = 'epg-badge';
                badge.textContent = 'EPG';
                li.appendChild(badge);
            }
            li.appendChild(document.createTextNode(
                App.displayCatalogTitle(item.name || 'Chaîne')
            ));
            if (item.kind === 'vod') {
                App.appendWatchProgress(li, App.getResumeEntry(item));
            }
        }
        return li;
    };

    App.rowIsPlaying = function (row, current) {
        if (!row || !current) { return false; }
        if (row.kind === 'channel' || row.kind === 'series') {
            var ch = App.channels[row.channelIndex];
            return !!(ch && current.url && ch.url === current.url);
        }
        if (row.kind === 'favorite-item' && row.item && row.item.url === current.url) {
            return true;
        }
        if (row.kind === 'episode' && row.item && row.item.url === current.url) {
            return true;
        }
        if (row.kind === 'continue-item' && row.entry && row.entry.url &&
            row.entry.url === current.url) {
            return true;
        }
        return false;
    };

    App.renderListWindow = function (force) {
        if (!App.$items) { return; }
        var n = App.listRows.length;
        var win = App.getListWindowSize();
        var maxStart = Math.max(0, n - win);
        var start = App.listWindowStart || 0;
        var focus = App.focusedIndex || 0;

        if (focus < start) { start = focus; }
        if (focus >= start + win) { start = focus - win + 1; }
        start = Math.max(0, Math.min(maxStart, start));

        var needRebuild = !!force || App._listWindowDirty ||
            start !== App.listWindowStart ||
            win !== (App._listWinApplied || 0) ||
            !App.$items.firstChild;
        App.listWindowStart = start;
        App._listWinApplied = win;
        App._listWindowDirty = false;

        if (!needRebuild) {
            App.updateListFocusOnly();
            return;
        }

        var frag = document.createDocumentFragment();
        App.$items.innerHTML = '';
        App.$items.scrollTop = 0;
        App._listFocusedEl = null;
        App._listPlayingEl = null;
        var current = App.playingItem();
        var railFocused = App.isShellRailFocused && App.isShellRailFocused();
        var end = Math.min(n, start + win);
        for (var i = start; i < end; i++) {
            var li = App.createListRowElement(App.listRows[i], i);
            if (!li) { continue; }
            if (App.rowIsPlaying(App.listRows[i], current)) {
                li.classList.add('playing');
                App._listPlayingEl = li;
            }
            if (!railFocused && !App.homeBrandFocused && i === App.focusedIndex) {
                li.classList.add('focused');
                App._listFocusedEl = li;
            }
            frag.appendChild(li);
        }
        App.$items.appendChild(frag);
        App.ensureListFocusInView();
    };

    App.ensureListFocusInView = function () {
        if (!App.$items) { return; }
        var focused = App._listFocusedEl ||
            App.$items.querySelector('li[data-index="' + App.focusedIndex + '"]');
        if (!focused) { return; }
        var top = focused.offsetTop - App.$items.offsetTop;
        var viewH = App.$items.clientHeight;
        if (!viewH) { return; }
        if (top < App.$items.scrollTop ||
            top + focused.offsetHeight > App.$items.scrollTop + viewH) {
            App.$items.scrollTop = Math.max(0, top - viewH / 2);
        }
    };

    App.updateListFocusOnly = function () {
        if (!App.$items) { return; }
        var railFocused = App.isShellRailFocused && App.isShellRailFocused();
        var next = null;
        if (!railFocused && !App.homeBrandFocused) {
            next = App.$items.querySelector(
                'li[data-index="' + App.focusedIndex + '"]'
            );
        }
        var prev = App._listFocusedEl;
        if (prev && prev !== next) { prev.classList.remove('focused'); }
        if (next) { next.classList.add('focused'); }
        if (next) { try { next.focus(); } catch (e) {} }
        App._listFocusedEl = next;

        var current = App.playingItem();
        var playingNext = null;
        if (current) {
            var lis = App.$items.children;
            for (var i = 0; i < lis.length; i++) {
                var idx = parseInt(lis[i].getAttribute('data-index'), 10);
                if (App.rowIsPlaying(App.listRows[idx], current)) {
                    playingNext = lis[i];
                    break;
                }
            }
        }
        if (App._listPlayingEl && App._listPlayingEl !== playingNext) {
            App._listPlayingEl.classList.remove('playing');
        }
        if (playingNext) { playingNext.classList.add('playing'); }
        App._listPlayingEl = playingNext;
        App.ensureListFocusInView();
    };

    App.bindBrowseListClicks = function () {
        if (!App.$items || App.$items.getAttribute('data-bound') === '1') { return; }
        App.$items.setAttribute('data-bound', '1');
        App.$items.addEventListener('click', function (e) {
            var el = e && e.target;
            while (el && el !== App.$items &&
                !(el.getAttribute && el.getAttribute('data-index') != null)) {
                el = el.parentNode;
            }
            if (!el || el === App.$items) { return; }
            var index = parseInt(el.getAttribute('data-index'), 10);
            App.activateBrowseIndex(index, e);
        });
    };

    /* Titre du panneau droit selon l’élément focusé (section + catégorie). */
    App.headerLabelForGroup = function (groupKey) {
        if (!groupKey) { return ''; }
        for (var i = 0; i < App.listRows.length; i++) {
            var row = App.listRows[i];
            if (row && row.kind === 'header' && row.group === groupKey) {
                return row.label || '';
            }
        }
        return '';
    };

    App.updateBrowseContextHeader = function () {
        if (App.isHomeDash && App.isHomeDash()) { return; }
        if (!App.$listMode && !App.$listTitle) { return; }

        /* Section toujours visible (TV / Films / Séries). */
        if (App.$listMode && App.listLevel !== 'types') {
            App.$listMode.textContent = App.typeLabel(App.contentType);
        }

        if (App.isShellRailFocused && App.isShellRailFocused()) {
            var rail = (App.HOME_RAIL || [])[App.homeFocus.railIndex];
            if (rail && App.$listTitle) {
                if (rail.action === 'type') {
                    App.$listTitle.textContent = rail.label;
                } else if (rail.action === 'home') {
                    App.$listTitle.textContent = 'Accueil';
                } else {
                    App.$listTitle.textContent = rail.label;
                }
            }
            return;
        }

        var row = App.browseRowAt ? App.browseRowAt(App.focusedIndex) : null;
        if (!row) { return; }

        if (App.listLevel === 'categories') {
            if (row.kind === 'category' && App.$listTitle) {
                App.$listTitle.textContent = row.label || 'Catégorie';
            } else if (row.kind === 'search' && App.$listTitle) {
                App.$listTitle.textContent = 'Recherche';
            } else if (row.kind === 'continue' && App.$listTitle) {
                App.$listTitle.textContent = 'Continuer à regarder';
            } else if (row.kind === 'favorites' && App.$listTitle) {
                App.$listTitle.textContent = 'Favoris';
            } else if (App.$listTitle) {
                App.$listTitle.textContent = 'Catégories';
            }
            return;
        }

        if (App.listLevel === 'content') {
            if (row.kind === 'header' && App.$listTitle) {
                App.$listTitle.textContent = row.label || App.categoryName(App.activeCategoryId);
            } else if ((row.kind === 'channel' || row.kind === 'series') && row.group) {
                var gLabel = App.headerLabelForGroup(row.group);
                if (App.$listTitle) {
                    App.$listTitle.textContent = gLabel || App.categoryName(App.activeCategoryId);
                }
            } else if (row.kind === 'search' && App.$listTitle) {
                App.$listTitle.textContent = 'Recherche';
            } else if (row.kind === 'continue' && App.$listTitle) {
                App.$listTitle.textContent = 'Continuer à regarder';
            } else if (row.kind === 'favorites' && App.$listTitle) {
                App.$listTitle.textContent = 'Favoris';
            } else if (App.$listTitle) {
                App.$listTitle.textContent = App.categoryName(App.activeCategoryId);
            }
        }
    };

    App.updateListClasses = function () {
        if (App.isHomeDash && App.isHomeDash() && typeof App.updateHomeFocusUi === 'function') {
            App.updateHomeFocusUi();
            return;
        }
        if (App.usesBrowseShell && App.usesBrowseShell() && typeof App.updateRailFocusUi === 'function') {
            App.updateRailFocusUi();
        }
        if (!App.$items) { return; }
        if (App.isPosterBrowse()) {
            App.renderPosterWindow(false);
            if (typeof App.updateBrowseContextHeader === 'function') {
                App.updateBrowseContextHeader();
            }
            if (typeof App.scheduleLivePreview === 'function') {
                App.scheduleLivePreview();
            }
            return;
        }
        if (App.usesListWindow && App.usesListWindow()) {
            App.renderListWindow(false);
        } else {
            App.updateListFocusOnly();
        }
        if (typeof App.scheduleLivePreview === 'function') {
            App.scheduleLivePreview();
        }
        if (typeof App.updateBrowseContextHeader === 'function') {
            App.updateBrowseContextHeader();
        }
        if (App.$listBrand) {
            if (App.listLevel === 'types' && App.homeBrandFocused) {
                App.$listBrand.classList.add('is-focused');
            } else {
                App.$listBrand.classList.remove('is-focused');
            }
        }
    }
})(App);
