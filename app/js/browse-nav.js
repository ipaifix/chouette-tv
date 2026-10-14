/* Catalogue navigation (open/enter/back) */
var App = App || {};
(function (App) {
    'use strict';

    App.openTypes = function (restoreFocus) {
        App.listLevel = 'types';
        App.activeCategoryId = null;
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        App.homeBrandFocused = false;
        if (typeof App.buildHomeRows === 'function') {
            App.buildHomeRows();
        } else {
            App.buildListRows();
        }
        var homeIdx = typeof App.homeRailIndexForHome === 'function'
            ? App.homeRailIndexForHome() : 0;
        if (restoreFocus && typeof restoreFocus === 'object' && restoreFocus.homeZone) {
            App.homeFocus = {
                zone: restoreFocus.homeZone,
                railIndex: restoreFocus.homeRailIndex != null
                    ? restoreFocus.homeRailIndex : homeIdx,
                rowIndex: restoreFocus.homeRowIndex || 0,
                itemIndex: restoreFocus.homeItemIndex || 0
            };
        } else if (typeof restoreFocus === 'number') {
            App.homeFocus = {
                zone: 'rail',
                railIndex: restoreFocus,
                rowIndex: 0,
                itemIndex: 0
            };
            App.focusedIndex = restoreFocus;
        } else if (App.homeRows && App.homeRows.length) {
            App.homeFocus = {
                zone: 'content',
                railIndex: homeIdx,
                rowIndex: 0,
                itemIndex: 0
            };
        } else {
            App.homeFocus = {
                zone: 'rail',
                railIndex: homeIdx,
                rowIndex: 0,
                itemIndex: 0
            };
        }
        if (typeof App.clampHomeFocus === 'function') {
            App.clampHomeFocus();
        }
        App.focusedIndex = App.homeFocus.railIndex || 0;
        App.renderList();
    }

    App.openCategories = function (restoreFocus) {
        App.listLevel = 'categories';
        App.activeCategoryId = null;
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        if (typeof App.markListWindowDirty === 'function') {
            App.markListWindowDirty();
        }
        App.buildListRows();
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = Math.max(0, Math.min(App.listRows.length - 1, restoreFocus));
        } else {
            App.focusedIndex = App.defaultListFocusIndex();
        }
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = typeof App.homeRailIndexForType === 'function'
            ? App.homeRailIndexForType(App.contentType) : 0;
        App.renderList();
    }

    App.openContinueWatching = function (filter, restoreFocus) {
        App.continueFilter = (filter === 'vod' || filter === 'series') ? filter : null;
        App.listLevel = 'continue';
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        App.beginResumeSnap();
        App.buildListRows();
        App.endResumeSnap();
        if (!App.listRows.length) {
            App.toast('Rien à reprendre');
            if (App.continueFilter) {
                if (App.categories.length) { App.openCategories(); }
                else { App.openContentList(null); }
            } else {
                App.openTypes();
            }
            return;
        }
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = Math.max(0, Math.min(App.listRows.length - 1, restoreFocus));
        } else {
            App.focusedIndex = 0;
        }
        App.renderList();
        App.rememberMenu();
    }

    App.openFavorites = function (restoreFocus) {
        if (App.contentType !== 'live' && App.contentType !== 'series') {
            App.setContentType('live');
        }
        App.listLevel = 'favorites';
        App.activeCategoryId = null;
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        if (typeof App.markPosterSourceDirty === 'function') {
            App.markPosterSourceDirty();
        }
        if (typeof App.markListWindowDirty === 'function') {
            App.markListWindowDirty();
        }
        App.buildListRows();
        if (!App.listRows.length) {
            App.toast('Aucun favori');
            if (App.categories.length) { App.openCategories(); }
            else { App.openContentList(null); }
            return;
        }
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = Math.max(0, Math.min(App.listRows.length - 1, restoreFocus));
        } else {
            App.focusedIndex = 0;
        }
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = typeof App.homeRailIndexForType === 'function'
            ? App.homeRailIndexForType(App.contentType) : 0;
        App.renderList();
        App.rememberMenu();
    }

    App.openContentList = function (catId, restoreFocus) {
        App.listLevel = 'content';
        App.activeCategoryId = catId != null && catId !== '' ? catId : null;
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        if (typeof App.markPosterSourceDirty === 'function') {
            App.markPosterSourceDirty();
        }
        if (typeof App.markListWindowDirty === 'function') {
            App.markListWindowDirty();
        }
        App.buildVisibleIndices(App.activeCategoryId);
        App.ensurePlayingGroupExpanded();
        App.buildListRows();
        var n = App.browseRowCount();
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = n ? Math.max(0, Math.min(n - 1, restoreFocus)) : 0;
        } else if (App.playingItem() && App.contentType === 'live') {
            App.focusedIndex = App.focusRowForPlaying();
        } else if (App.playingItem() && App.isPosterBrowse()) {
            App.focusedIndex = App.focusRowForPlaying();
        } else if (App.isPosterBrowse()) {
            App.focusedIndex = 0;
        } else {
            App.focusedIndex = App.defaultListFocusIndex();
        }
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = typeof App.homeRailIndexForType === 'function'
            ? App.homeRailIndexForType(App.contentType) : 0;
        App.renderList();
    }

    App.openSeasons = function (seasons, restoreFocus) {
        App.seriesSeasons = seasons || [];
        App.activeSeason = null;
        App.listLevel = 'seasons';
        App.buildListRows();
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = Math.max(0, Math.min(App.listRows.length - 1, restoreFocus));
        } else {
            App.focusedIndex = 0;
        }
        App.renderList();
    }

    App.openEpisodes = function (season, restoreFocus) {
        App.activeSeason = season;
        App.listLevel = 'episodes';
        App.buildListRows();
        if (typeof restoreFocus === 'number') {
            App.focusedIndex = Math.max(0, Math.min(App.listRows.length - 1, restoreFocus));
        } else {
            App.focusedIndex = App.focusRowForPlaying();
        }
        App.renderList();
    }

    App.enterType = function (type) {
        App.setContentType(type);
        if (!App.channels.length) {
            App.toast('Aucun contenu pour ' + App.typeLabel(type));
            return;
        }
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = typeof App.homeRailIndexForType === 'function'
            ? App.homeRailIndexForType(type) : 0;
        if (App.categories.length) {
            App.openCategories();
        } else {
            App.openContentList(null);
        }
        App.rememberMenu();
    }

    App.useTypeMenu = function () {
        /* Keep the same Home/Search/Settings shell for M3U and Xtream. */
        return !!App.xtreamCreds.base || (App.hasCatalogContent && App.hasCatalogContent()) || App.hasMultipleTypes();
    }

    App.hasMultipleTypes = function () {
        var n = 0;
        if (App.catalogItems('live').length) { n++; }
        if (App.catalogItems('vod').length) { n++; }
        if (App.catalogItems('series').length) { n++; }
        return n > 1;
    }

    App.restoreMenu = function () {
        var mem = App.menuMemory;
        if (!mem) {
            var level = Storage.get(Storage.KEYS.menuLevel);
            if (level) {
                mem = {
                    type: Storage.get(Storage.KEYS.menuType) || 'live',
                    level: level,
                    categoryId: Storage.get(Storage.KEYS.menuCat) || null,
                    focusedIndex: parseInt(Storage.get(Storage.KEYS.menuFocus), 10) || 0,
                    expanded: null,
                    seriesId: Storage.get(Storage.KEYS.menuSeries) || '',
                    season: Storage.get(Storage.KEYS.menuSeason) || ''
                };
                App.loadPersistedMenuExpanded();
            }
        }
        if (!mem) { return false; }
        if (mem.expanded) { App.expandedGroups = mem.expanded; }
        // Migrate previous session levels
        if (mem.level === 'channels') { mem.level = 'content'; }

        var type = mem.type || 'live';
        if (!App.bucketFor(type).items.length) {
            type = App.catalogItems('live').length ? 'live'
                : (App.catalogItems('vod').length ? 'vod' : 'series');
        }
        App.setContentType(type);

        if (mem.level === 'types') {
            App.openTypes(mem);
            return true;
        }

        if (mem.level === 'continue') {
            App.openContinueWatching(
                mem.continueFilter != null ? mem.continueFilter : App.continueFilter,
                mem.focusedIndex
            );
            return true;
        }

        if (mem.level === 'favorites') {
            App.openFavorites(mem.focusedIndex);
            return true;
        }

        if (mem.level === 'categories') {
            if (App.categories.length) {
                App.openCategories(mem.focusedIndex);
                return true;
            }
            App.openContentList(null, mem.focusedIndex);
            return true;
        }

        if (mem.level === 'seasons' || mem.level === 'episodes') {
            if (App.contentType === 'series' && mem.seriesId) {
                var seriesItem = null;
                for (var s = 0; s < App.channels.length; s++) {
                    if (App.channels[s].seriesId === mem.seriesId) {
                        seriesItem = App.channels[s];
                        break;
                    }
                }
                if (seriesItem) {
                    App.loadSeriesAndRestore(seriesItem, mem);
                    return true;
                }
            }
            App.openContentList(mem.categoryId || null, 0);
            return true;
        }

        /* content */
        if (mem.categoryId && App.categories.length) {
            if (!App.isRecentCategory(mem.categoryId)) {
                var found = false;
                for (var i = 0; i < App.categories.length; i++) {
                    if (App.categories[i].id === mem.categoryId) { found = true; break; }
                }
                if (!found) {
                    if (App.categories.length) { App.openCategories(); }
                    else { App.openContentList(null); }
                    return true;
                }
            }
        }
        App.openContentList(mem.categoryId || null, mem.focusedIndex);
        return true;
    }

    App.loadSeriesAndRestore = function (seriesItem, mem) {
        App.activeSeries = seriesItem;
        App.toast('Chargement de ' + seriesItem.name + '…');
        App.seriesLoading = true;
        /* A cached series response can complete synchronously. */
        App.listLevel = 'seasons';
        App.seriesSeasons = [];
        App.focusedIndex = 0;
        App.renderList();
        Xtream.getSeriesInfo(
            App.xtreamCreds.base, App.xtreamCreds.username, App.xtreamCreds.password,
            seriesItem.seriesId,
            function (seasons) {
                App.seriesLoading = false;
                App.seriesSeasons = seasons;
                if (mem.level === 'episodes' && mem.season) {
                    var match = null;
                    for (var i = 0; i < seasons.length; i++) {
                        if (seasons[i].season === String(mem.season)) {
                            match = seasons[i];
                            break;
                        }
                    }
                    if (match) {
                        App.openEpisodes(match, mem.focusedIndex);
                        App.rememberMenu();
                        return;
                    }
                }
                App.openSeasons(seasons, mem.level === 'seasons' ? mem.focusedIndex : 0);
                App.rememberMenu();
            },
            function (err) {
                App.seriesLoading = false;
                App.toast(err);
                App.openContentList(mem.categoryId || null, 0);
            }
        );
    }

    App.stopPlaybackForBrowse = function () {
        if (typeof App.stopLivePreview === 'function') {
            App.stopLivePreview({ forceStop: false, keepChrome: false, keepRect: false });
        } else {
            App.livePreviewActive = false;
            App.livePreviewUrl = '';
            App.livePreviewPendingUrl = '';
        }
        if (App.isSeekablePlaying() || App.playingItem()) {
            try { App.persistResumePosition(true); } catch (e) {}
            if (typeof App.syncFollowedSeriesNow === 'function') {
                var stopped = App.playingItem();
                if (stopped && stopped.kind === 'episode') {
                    try { App.syncFollowedSeriesNow(stopped); } catch (eFollow) {}
                }
            }
        }
        App.stopResumeSaveLoop();
        App.hideVodControls();
        App.hideVodPauseIndicator();
        App.pendingSeekSec = null;
        App.lastKnownPos = 0;
        App.lastKnownDur = 0;
        App.scrubTargetSec = null;
        try { Player.stop(); } catch (e2) {}
        if (Player && Player.clearDisplayRect) {
            try { Player.clearDisplayRect(); } catch (e3) {}
        }
        App.playingIndex = -1;
    }

    App.showList = function () {
        if (!App.catalogItems('live').length && !App.catalogItems('vod').length &&
            !App.catalogItems('series').length) {
            App.showSettings();
            return;
        }
        /* Stop fullscreen stream — live preview may restart after focus debounce. */
        App.stopPlaybackForBrowse();
        if (typeof App.restoreSearchAfterPlayback === 'function' &&
            App.restoreSearchAfterPlayback()) {
            return;
        }
        App.setExclusiveOverlays({ list: true, dim: true });
        App.uiState = 'browse';
        if (!App.restoreMenu()) {
            if (App.useTypeMenu()) {
                App.openTypes();
            } else {
                App.setContentType(App.catalogItems('live').length ? 'live'
                    : (App.catalogItems('vod').length ? 'vod' : 'series'));
                if (App.categories.length) { App.openCategories(); }
                else { App.openContentList(null); }
            }
        }
        if (App.$list) { App.$list.classList.remove('hidden'); }
        if (typeof App.scheduleLivePreview === 'function') {
            App.scheduleLivePreview();
        }
    }

    App.hideList = function () {
        App.rememberMenu();
        if (typeof App.clearLivePreviewTimer === 'function') {
            App.clearLivePreviewTimer();
        }
        App.livePreviewActive = false;
        App.livePreviewUrl = '';
        App.livePreviewPendingUrl = '';
        if (typeof App.hideLivePreviewChrome === 'function') {
            App.hideLivePreviewChrome();
        }
        if (App.$list) { App.$list.classList.add('hidden'); }
        App.setBrowseDim(false);
        App.uiState = 'watch';
        App.setExclusiveOverlays({});
        if (Player && Player.clearDisplayRect) {
            try { Player.clearDisplayRect(); } catch (e) {}
        }

        if (App.isSeekablePlaying()) {
            App.showVodControls(Player.isPaused());
            if (Player.isPaused()) { App.showVodPauseIndicator(true); }
        } else if (App.playingItem()) {
            App.showInfo();
        }
    }

    /* Enter watch mode after selecting playable content — menu fully gone. */
    App.enterWatchMode = function () {
        App.rememberMenu();
        if (typeof App.clearLivePreviewTimer === 'function') {
            App.clearLivePreviewTimer();
        }
        App.livePreviewActive = false;
        App.livePreviewUrl = '';
        App.livePreviewPendingUrl = '';
        if (typeof App.hideLivePreviewChrome === 'function') {
            App.hideLivePreviewChrome();
        }
        if (Player && Player.clearDisplayRect) {
            try { Player.clearDisplayRect(); } catch (e) {}
        }
        App.setExclusiveOverlays({});
        App.uiState = 'watch';
    }

    App.onListEnter = function () {
        if (App.seriesLoading) { return; }
        var row = App.browseRowAt(App.focusedIndex);
        if (!row) { return; }

        if (row.kind === 'search') {
            App.showSearch();
            return;
        }
        if (row.kind === 'continue') {
            App.openContinueWatching(row.filter);
            return;
        }
        if (row.kind === 'favorites') {
            App.openFavorites();
            return;
        }
        if (row.kind === 'continue-item') {
            var resumeItem = App.itemFromResumeEntry(row.entry);
            App.showItemActions(resumeItem, { entry: row.entry });
            return;
        }
        if (row.kind === 'favorite-item') {
            var favItem = row.item;
            if (!favItem) {
                App.toast('Contenu indisponible');
                return;
            }
            if (App.contentType === 'series' || favItem.kind === 'series') {
                if (App.showDetails) { App.showDetails(favItem); return; }
                App.openedFromFavorites = true;
                App.activeSeries = favItem;
                App.toast('Chargement de ' + favItem.name + '…');
                App.seriesLoading = true;
                Xtream.getSeriesInfo(
                    App.xtreamCreds.base, App.xtreamCreds.username, App.xtreamCreds.password,
                    favItem.seriesId,
                    function (seasons) {
                        App.seriesLoading = false;
                        App.openSeasons(seasons);
                        App.rememberMenu();
                    },
                    function (err) {
                        App.seriesLoading = false;
                        App.toast(err);
                    }
                );
                return;
            }
            if (!favItem.url) {
                App.toast('Flux indisponible');
                return;
            }
            if (App.livePreviewActive && App.playingItem && App.playingItem() &&
                App.playingItem().url === favItem.url) {
                if (App.promoteLivePreviewToWatch) { App.promoteLivePreviewToWatch(); }
                else { App.playItem(favItem, 'live'); }
                return;
            }
            App.playItem(favItem, 'live');
            return;
        }
        if (row.kind === 'settings') {
            App.showSettings();
            return;
        }
        if (row.kind === 'exit') {
            App.showExit();
            return;
        }
        if (row.kind === 'type') {
            App.enterType(row.type);
            return;
        }
        if (row.kind === 'category') {
            App.openContentList(row.catId);
            App.rememberMenu();
            return;
        }
        if (row.kind === 'header') {
            App.expandedGroups[row.group] = !App.expandedGroups[row.group];
            var keepGroup = row.group;
            App.renderList();
            for (var i = 0; i < App.listRows.length; i++) {
                if (App.listRows[i].kind === 'header' && App.listRows[i].group === keepGroup) {
                    App.focusedIndex = i;
                    break;
                }
            }
            App.updateListClasses();
            App.rememberMenu();
            return;
        }
        if (row.kind === 'series') {
            var seriesItem = App.channels[row.channelIndex];
            if (App.showDetails && seriesItem) { App.showDetails(seriesItem); return; }
            if (!seriesItem) {
                App.toast('Série introuvable');
                return;
            }
            App.openedFromFavorites = false;
            App.activeSeries = seriesItem;
            App.toast('Chargement de ' + seriesItem.name + '…');
            App.seriesLoading = true;
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
                }
            );
            return;
        }
        if (row.kind === 'season') {
            App.openEpisodes(App.seriesSeasons[row.seasonIndex]);
            App.rememberMenu();
            return;
        }
        if (row.kind === 'episode') {
            App.playItem(row.item, 'episode');
            return;
        }
        if (row.kind === 'channel') {
            var chItem = App.channels[row.channelIndex];
            if (!chItem) {
                App.toast('Contenu introuvable');
                return;
            }
            if (!chItem.url) {
                App.toast('Flux indisponible');
                return;
            }
            if ((chItem.kind || App.contentType) === 'live' &&
                App.livePreviewActive && App.playingItem && App.playingItem() &&
                App.playingItem().url === chItem.url) {
                if (App.promoteLivePreviewToWatch) { App.promoteLivePreviewToWatch(); }
                else { App.playItem(chItem, 'live'); }
                return;
            }
            if (App.showDetails && (chItem.kind || App.contentType) === 'vod') {
                App.showDetails(chItem);
            } else { App.playItem(chItem, chItem.kind || App.contentType); }
        }
    }

    App.onListBack = function () {
        if (App.seriesLoading) { return; }
        if (App.listLevel === 'continue') {
            App.rememberMenu();
            if (App.continueFilter === 'vod' || App.continueFilter === 'series') {
                App.setContentType(App.continueFilter);
                if (App.categories.length) {
                    App.openCategories();
                } else {
                    App.openContentList(null);
                }
            } else if (App.useTypeMenu()) {
                App.openTypes({
                    homeZone: 'content',
                    homeRailIndex: 0,
                    homeRowIndex: 0,
                    homeItemIndex: 0
                });
            } else {
                App.openCategories();
            }
            App.rememberMenu();
            return;
        }
        if (App.listLevel === 'favorites') {
            App.rememberMenu();
            if (App.contentType !== 'live' && App.contentType !== 'series') {
                App.setContentType('live');
            }
            if (App.categories.length) {
                App.openCategories();
            } else if (App.useTypeMenu()) {
                App.openTypes();
            } else {
                App.openContentList(null);
            }
            App.rememberMenu();
            return;
        }
        if (App.listLevel === 'episodes') {
            App.rememberMenu();
            App.openSeasons(App.seriesSeasons);
            App.rememberMenu();
            return;
        }
        if (App.listLevel === 'seasons') {
            App.rememberMenu();
            if (App.openedFromFavorites) {
                App.openedFromFavorites = false;
                App.openFavorites();
                App.rememberMenu();
                return;
            }
            App.openContentList(App.activeCategoryId);
            App.rememberMenu();
            return;
        }
        if (App.listLevel === 'content') {
            App.rememberMenu();
            if (App.categories.length) {
                App.openCategories();
            } else if (App.useTypeMenu()) {
                App.openTypes({
                    homeZone: 'content',
                    homeRailIndex: App.homeRailIndexForHome
                        ? App.homeRailIndexForHome() : 0,
                    homeRowIndex: 0,
                    homeItemIndex: 0
                });
            } else {
                App.showExit();
                return;
            }
            App.rememberMenu();
            return;
        }
        if (App.listLevel === 'categories') {
            App.rememberMenu();
            if (App.useTypeMenu()) {
                App.openTypes({
                    homeZone: 'content',
                    homeRailIndex: App.homeRailIndexForHome
                        ? App.homeRailIndexForHome() : 0,
                    homeRowIndex: 0,
                    homeItemIndex: 0
                });
                App.rememberMenu();
            } else {
                App.showExit();
            }
            return;
        }
        /* types root → quit prompt (stream already stopped in browse) */
        App.showExit();
    }
})(App);
