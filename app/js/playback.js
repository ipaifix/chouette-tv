/* Playback / zap */
var App = App || {};
(function (App) {
    'use strict';

    

    App.rebuildZapList = function (preferredKind) {
        preferredKind = preferredKind || 'live';
        var liveItems = App.catalogItems('live');
        var vodItems = App.catalogItems('vod');
        var out = [];
        var i;
        var it;

        if (preferredKind === 'live' && liveItems.length) {
            for (i = 0; i < liveItems.length; i++) {
                it = liveItems[i];
                if (it && it.url && !App.isGroupHeader(it)) { out.push(it); }
            }
            App.zapList = out;
        } else if (preferredKind === 'vod' && vodItems.length) {
            for (i = 0; i < vodItems.length; i++) {
                it = vodItems[i];
                if (it && it.url) { out.push(it); }
            }
            App.zapList = out;
        } else if (preferredKind === 'episode' && App.activeSeason) {
            App.zapList = (App.activeSeason.episodes || []).slice();
        } else {
            for (i = 0; i < liveItems.length; i++) {
                it = liveItems[i];
                if (it && it.url && !App.isGroupHeader(it)) { out.push(it); }
            }
            App.zapList = out;
        }
    }

    App.findZapIndexByUrl = function (url) {
        if (!url) { return -1; }
        for (var i = 0; i < App.zapList.length; i++) {
            if (App.zapList[i] && App.zapList[i].url === url) { return i; }
        }
        return -1;
    }

    App.playItem = function (item, preferredKind, opts) {
        if (!item || !item.url) {
            App.toast('Flux indisponible');
            return;
        }
        opts = opts || {};

        /* Offer resume for films / episodes before starting playback. */
        if (App.isSeekableItem(item) && !opts.skipResumePrompt && opts.startAt == null) {
            var saved = opts.resumeEntry
                ? App.normalizeResumeEntry(opts.resumeEntry)
                : App.getResumeEntry(item);
            if (App.shouldOfferResume(saved)) {
                App.showResumeDialog(item, preferredKind || item.kind, saved);
                return;
            }
        }

        App.beginPlayback(item, preferredKind, opts.startAt || 0, opts);
    }

    App.beginPlayback = function (item, preferredKind, startAt, opts) {
        if (!item || !item.url) {
            App.toast('Flux indisponible');
            return;
        }
        opts = opts || {};

        var prev = App.playingItem();
        if (prev && prev.kind === 'live' && item.kind === 'live' && prev.url !== item.url && !opts.preview) {
            App.previousLive = prev;
        }
        if (prev && App.isSeekableItem(prev) && App.resumeKeyFor(prev) !== App.resumeKeyFor(item)) {
            App.persistResumePosition(true);
        }

        App.rebuildZapList(preferredKind || item.kind || 'live');
        var idx = App.findZapIndexByUrl(item.url);
        if (idx < 0) {
            App.zapList = [item];
            idx = 0;
        }
        App.playingIndex = idx;
        if (!opts.preview && typeof App.releaseBrowseViews === 'function') { App.releaseBrowseViews(); }
        Storage.set(Storage.KEYS.lastChannelUrl, item.url);

        App.pendingSeekSec = (App.isSeekableItem(item) && startAt > 0) ? startAt : null;
        App.lastKnownPos = App.pendingSeekSec || 0;
        App.lastKnownDur = 0;
        App.clearVodScrub();
        App.stopResumeSaveLoop();
        App.nextEpisodeDismissed = false;
        App._endedResumeKey = '';
        if (typeof App.hideNextEpisodePrompt === 'function') {
            App.hideNextEpisodePrompt(false);
        }

        if (item.kind === 'episode') {
            if (typeof App.enrichEpisodeMeta === 'function') {
                App.enrichEpisodeMeta(item);
            }
            if (typeof App.seedContinueWatching === 'function') {
                App.seedContinueWatching(item, startAt);
            }
            if (typeof App.ensureSeriesContextForEpisode === 'function') {
                App.ensureSeriesContextForEpisode(item, function (ok) {
                    if (!ok) { return; }
                    var cur = App.playingItem();
                    if (!cur || App.resumeKeyFor(cur) !== App.resumeKeyFor(item)) { return; }
                    App.rebuildZapList('episode');
                    var z = App.findZapIndexByUrl(item.url);
                    if (z >= 0) { App.playingIndex = z; }
                });
            }
        }

        if (!opts.silent) {
            App.toast('Chargement de ' + item.name + '…', true);
        }
        Player.play(item.url, { userAgent: item.userAgent || '' });

        if (App.uiState === 'epg') {
            App.epgFocusIndex = 0;
            App.renderEpgPanel();
        } else if (opts.preview && (App.uiState === 'browse' || App.uiState === 'search')) {
            /* Windowed live preview under catalogue — stay in browse. */
            App.livePreviewActive = true;
            App.livePreviewUrl = item.url;
            if (typeof App.applyLivePreviewDisplayRect === 'function') {
                App.applyLivePreviewDisplayRect();
            }
            App.updateListClasses();
            return;
        } else if (opts.keepBrowse && (App.uiState === 'browse' || App.uiState === 'search')) {
            /* Legacy keepBrowse path — VOD must not keep playing behind browse. */
            if (App.isSeekableItem(item)) {
                App.enterWatchMode();
                App.showVodControls(false);
            } else {
                App.updateListClasses();
                return;
            }
        } else {
            if (typeof App.stopLivePreview === 'function') {
                App.clearLivePreviewTimer();
                App.livePreviewActive = false;
                App.livePreviewUrl = '';
                App.livePreviewPendingUrl = '';
                App.hideLivePreviewChrome();
            }
            if (Player && Player.clearDisplayRect) {
                try { Player.clearDisplayRect(); } catch (eRect) {}
            }
            App.enterWatchMode();
            if (App.isSeekableItem(item)) {
                App.showVodControls(false);
            } else {
                App.showInfo();
            }
        }
        App.updateListClasses();
    }

    App.zap = function (delta) {
        if (!App.zapList.length) { return; }
        /* No zap while browsing catalogue — stream is stopped. */
        if (App.uiState === 'browse' || App.uiState === 'search') { return; }
        /* playingIndex -1 at boot/browse: start from first/last without auto-play side effects. */
        var base = App.playingIndex;
        if (base < 0 || base >= App.zapList.length) {
            base = delta > 0 ? -1 : 0;
        }
        if (App.isSeekablePlaying()) { App.persistResumePosition(true); }
        var next = (base + delta + App.zapList.length) % App.zapList.length;
        App.playItem(App.zapList[next], App.zapList[next].kind, { skipResumePrompt: true });
    }

    App.startFromCatalog = function (cat) {
        App.previousLive = null;
        try {
            cat = App.normalizeCatalog(cat);
            App.catalog = {
                live: cat.live,
                vod: cat.vod,
                series: cat.series
            };
            var storedCreds = App.xtreamFromStorage ? App.xtreamFromStorage() : {};
            App.xtreamCreds = {
                base: cat.base || storedCreds.server || '',
                username: cat.username || storedCreds.user || '',
                password: cat.password || storedCreds.pass || ''
            };
            App.headerEpgUrl = cat.epgUrl || '';
            if (typeof App.rebuildCatalogIndexes === 'function') {
                App.rebuildCatalogIndexes();
            }
            App.loadPersistedMenuExpanded();
            App.setContentType('live');
            App.rebuildZapList('live');
            App.playingIndex = -1;

            /* Boot: catalogue plein écran, sans auto-play — l'utilisateur choisit d'abord. */
            App.menuMemory = null;
            App.stopResumeSaveLoop();
            try { Player.stop(); } catch (eStop) {}
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
            if (App.useTypeMenu()) {
                App.openTypes();
            } else if (App.categories.length) {
                App.openCategories();
            } else {
                App.openContentList(null);
            }
            App.rememberMenu();
            if (App.$list) { App.$list.classList.remove('hidden'); }
            /* Defer heavy post-paint work so browse is interactive first. */
            setTimeout(function () {
                if (typeof App.scheduleFollowedSeriesRefresh === 'function') {
                    App.scheduleFollowedSeriesRefresh({ notifyNew: true, rebuildHome: true });
                }
            }, 500);
            clearTimeout(App.epgLoadTimer);
            App.epgLoadTimer = setTimeout(function () {
                if (typeof App.loadEpg === 'function') {
                    App.loadEpg();
                }
            }, 1500);
            return true;
        } catch (err) {
            try {
                App.toast('Erreur de démarrage : ' + (err && err.message ? err.message : err), true);
            } catch (e2) {}
            try { App.showSettings(); } catch (e3) {}
            return false;
        }
    }

    /* M3U / legacy: start(list, epgUrl, cats) */
    App.start = function (listOrCatalog, epgUrl, cats) {
        if (listOrCatalog && listOrCatalog.live &&
            Object.prototype.toString.call(listOrCatalog.live.items) === '[object Array]') {
            App.startFromCatalog(listOrCatalog);
            return;
        }
        var list = listOrCatalog || [];
        if (Object.prototype.toString.call(list) !== '[object Array]') {
            list = [];
        }
        var liveItems = [];
        for (var i = 0; i < list.length; i++) {
            var ch = list[i] || {};
            liveItems.push({
                kind: 'live',
                id: ch.id || '',
                name: ch.name || 'Chaîne',
                url: ch.url || '',
                categoryId: ch.categoryId || '',
                logo: ch.logo || '',
                userAgent: ch.userAgent || '',
                referrer: ch.referrer || ''
            });
        }
        App.catalog = {
            live: {
                categories: cats || [],
                items: liveItems
            },
            vod: App.emptyBucket(),
            series: App.emptyBucket()
        };
        App.xtreamCreds = { base: '', username: '', password: '' };
        App.startFromCatalog({
            live: App.catalog.live,
            vod: App.catalog.vod,
            series: App.catalog.series,
            epgUrl: epgUrl || ''
        });
    }

    App.onPlayerStatus = function (state, detail) {
        if (App.livePreviewActive && typeof App.onLivePreviewPlayerStatus === 'function') {
            App.onLivePreviewPlayerStatus(state, detail);
        }
        if (state === 'playing') {
            var playbackToken = Player.getPlaybackToken();
            if (!App.livePreviewActive) {
                App.toast('Lecture en cours');
            }
            App.setVodBufferingUi(false);
            if (typeof App.scheduleStreamQualityRefresh === 'function') {
                App.scheduleStreamQualityRefresh();
            }
            if (App.pendingSeekSec != null && App.isSeekablePlaying()) {
                var seekTo = App.pendingSeekSec;
                App.pendingSeekSec = null;
                setTimeout(function () {
                    if (Player.getPlaybackToken() !== playbackToken || !App.isSeekablePlaying()) { return; }
                    Player.seekTo(seekTo);
                    App.bumpVodControls();
                }, 200);
            }
            /* Apply preferred audio / subtitle languages once stream is ready */
            setTimeout(function () {
                if (Player.getPlaybackToken() === playbackToken) { App.applyStoredTrackPrefs(); }
            }, 400);
            if (App.isSeekablePlaying()) {
                App.startResumeSaveLoop();
                if (App.uiState === 'watch') {
                    if (Player.isPaused()) {
                        App.showVodPauseIndicator(true);
                        App.showVodControls(true);
                    } else if (App.vodBarVisible) {
                        App.showVodControls(false);
                    }
                }
            }
        } else if (state === 'buffering') {
            /* Browse / live preview: no watch toast (preview has its own loading UI). */
            if (!App.livePreviewActive &&
                App.uiState !== 'browse' && App.uiState !== 'search') {
                App.toast('Chargement…', true);
            }
            if (App.isSeekablePlaying()) { App.setVodBufferingUi(true); }
        } else if (state === 'seeking') {
            if (App.isSeekablePlaying()) {
                App.setVodBufferingUi(true);
                if (App.uiState === 'watch') { App.bumpVodControls(); }
            }
        } else if (state === 'seeked') {
            App.setVodBufferingUi(false);
            if (App.isSeekablePlaying()) {
                App.updateVodProgressUi(Player.getPosition(), Player.getDuration());
                if (App.uiState === 'watch') { App.bumpVodControls(); }
            }
        } else if (state === 'paused') {
            if (App.isSeekablePlaying()) {
                App.persistResumePosition(true);
                if (App.uiState === 'watch') {
                    App.showVodPauseIndicator(true);
                    App.showVodControls(true);
                }
            }
        } else if (state === 'blocked') {
            App.toast('Lecture automatique bloquée — cliquez ou appuyez sur une touche', true);
        } else if (state === 'ended') {
            if (App.isSeekablePlaying()) {
                App._endedResumeKey = App.resumeKeyFor(App.playingItem()) || '';
                App.markResumeCompleted(App.playingItem());
                App.hideVodControls();
                App.hideVodPauseIndicator();
                App.stopResumeSaveLoop();
            }
            /* Series: offer next episode (or toast end). Films / live: generic toast. */
            if (App.uiState === 'feature') { return; }
            if (typeof App.onEpisodePlaybackEnded === 'function' && App.onEpisodePlaybackEnded()) {
                /* handled */
            } else if (!App.livePreviewActive) {
                App.toast('Lecture terminée');
            }
        } else if (state === 'error') {
            if (!App.livePreviewActive) {
                App.toast('Lecture impossible : ' + (detail || 'cause inconnue') +
                    ' — CH+/- pour changer de chaîne');
            }
            App.stopResumeSaveLoop();
        }
    }

    App.onPlayerTimeUpdate = function (pos, dur) {
        if (!App.isSeekablePlaying()) { return; }
        App.updateVodProgressUi(pos, dur);
        if (typeof App.maybeShowNextEpisodeDuringPlayback === 'function') {
            App.maybeShowNextEpisodeDuringPlayback(pos, dur);
        }
    }
})(App);
