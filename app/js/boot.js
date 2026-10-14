/* Boot + load playlist/EPG ; refresh catalogue manuel (logo Accueil / Settings) */
var App = App || {};
(function (App) {
    'use strict';

    /* Invalide les callbacks réseau périmés (Save rapide, double boot, etc.). */
    App.catalogLoadGen = 0;

    

    App.loadEpg = function () {
        if (App.backgroundSuspended || App.catalogRequestActive) { return; }
        var url = Storage.get(Storage.KEYS.epgUrl) || App.headerEpgUrl;
        if (!url) { return; }
        var ids = [];
        var liveItems = App.catalogItems('live');
        for (var i = 0; i < liveItems.length; i++) {
            if (liveItems[i] && liveItems[i].id) { ids.push(liveItems[i].id); }
        }
        EPG.load(url, ids, function (count) {
            if (App.refreshVisibleGuide) { App.refreshVisibleGuide(); }
            App.toast('Guide TV chargé (' + count + ' chaînes)');
            /* Avoid full menu rebuild — refresh only visible EPG surfaces. */
            if (App.$infoBar && !App.$infoBar.classList.contains('hidden') &&
                typeof App.renderInfoBar === 'function') {
                App.renderInfoBar();
            }
            if (App.uiState === 'epg' && typeof App.renderEpgPanel === 'function') {
                App.renderEpgPanel();
            }
            if (typeof App.focusedLiveChannel === 'function' &&
                typeof App.updateLivePreviewMeta === 'function') {
                var live = App.focusedLiveChannel();
                if (live) { App.updateLivePreviewMeta(live); }
            }
        }, function (err) {
            App.toast(err);
        });
    }

    App.showHomeRefreshSpinner = function () {
        if (!App.$homeRefreshOverlay) { return; }
        App.$homeRefreshOverlay.classList.remove('hidden');
        App.$homeRefreshOverlay.setAttribute('aria-hidden', 'false');
    }

    App.hideHomeRefreshSpinner = function () {
        if (!App.$homeRefreshOverlay) { return; }
        App.$homeRefreshOverlay.classList.add('hidden');
        App.$homeRefreshOverlay.setAttribute('aria-hidden', 'true');
    }

    App.clearCatalogRefreshingUi = function () {
        App.catalogRefreshing = false;
        App.hideHomeRefreshSpinner();
    }

    App.onCatalogRefreshDone = function (fingerprint, catalog, opts) {
        opts = opts || {};
        var partial = catalog && catalog.partialTypes || [];
        if (opts.soft && App.hasCatalogContent() && partial.length) {
            catalog = App.mergePartialCatalog(catalog, App.catalog);
        }
        if (typeof Xtream.clearSeriesInfoCache === 'function') {
            Xtream.clearSeriesInfoCache();
        }
        if (opts.soft && App.hasCatalogContent()) {
            App.applyCatalogSoft(catalog);
        } else {
            App.startFromCatalog(catalog);
        }
        /* Paint the catalogue before serializing the offline copy. */
        setTimeout(function () {
            if (fingerprint === App.catalogSourceFingerprint()) { App.persistCatalogCache(fingerprint, catalog); }
        }, 100);
        App.toast(partial.length
            ? 'Catalogue partiel — rubriques indisponibles conservées'
            : 'Catalogue à jour');
        clearTimeout(App.epgLoadTimer);
        App.epgLoadTimer = setTimeout(App.loadEpg, 1500);
        if (typeof App.scheduleFollowedSeriesRefresh === 'function') {
            App.scheduleFollowedSeriesRefresh({ notifyNew: true, rebuildHome: true });
        }
    }

    App.mergePartialCatalog = function (incoming, previous) {
        incoming = App.normalizeCatalog(incoming);
        previous = App.normalizeCatalog(previous);
        var partial = incoming.partialTypes || [];
        for (var i = 0; i < partial.length; i++) {
            var type = partial[i];
            if (type === 'live' || type === 'vod' || type === 'series') {
                incoming[type] = previous[type];
            }
        }
        return incoming;
    };

    App.onCatalogRefreshError = function (err, opts) {
        opts = opts || {};
        if (App.hasCatalogContent()) {
            App.toast('Maj catalogue échouée — dernier catalogue conservé');
            return;
        }
        App.toast((err || 'Erreur réseau') + ' — vérifiez les réglages', true);
        App.showSettings();
    }

    /**
     * Fetch always from server (Xtream live+vod+series, or M3U).
     * opts.soft — update in place if a catalogue is already on screen.
     * opts.fromHome — spinner Accueil (pas de toast « Mise à jour… »).
     */
    App.refreshCatalogFromServer = function (opts) {
        opts = opts || {};
        var soft = !!opts.soft;
        var fromHome = !!opts.fromHome;
        var onSettled = typeof opts.onSettled === 'function' ? opts.onSettled : null;
        var settled = false;
        var gen = ++App.catalogLoadGen;
        if (App.cancelCatalogLoad) { App.cancelCatalogLoad(); App.cancelCatalogLoad = null; }
        var fingerprint = App.catalogSourceFingerprint();
        var creds = App.xtreamFromStorage();
        var server = creds.server;
        var user = creds.user;
        var pass = creds.pass;
        var url = Storage.get(Storage.KEYS.playlistUrl);
        var displayedProgress = false;
        App.catalogRequestActive = true;
        var loadOptions = { format: 'ts', incremental: true, onProgress: function (catalog) {
            if (!stillCurrent() || soft) { return; }
            if (displayedProgress) { App.applyCatalogSoft(catalog); }
            else if (!App.hasCatalogContent()) {
                App.startFromCatalog(catalog);
                displayedProgress = true;
            }
        } };

        function stillCurrent() {
            return gen === App.catalogLoadGen;
        }

        function finishRefreshUi() {
            if (settled) { return; }
            settled = true;
            if (stillCurrent()) { App.catalogRequestActive = false; App.cancelCatalogLoad = null; }
            if (fromHome) { App.clearCatalogRefreshingUi(); }
            if (onSettled) { onSettled(); }
        }

        function trackCancellation(cancel) {
            if (settled) { return; }
            App.cancelCatalogLoad = function () {
                if (typeof cancel === 'function') { cancel(); }
                finishRefreshUi();
            };
        }

        function xtreamDone(catalog) {
            if (!stillCurrent()) { finishRefreshUi(); return; }
            finishRefreshUi();
            App.onCatalogRefreshDone(fingerprint, catalog, { soft: soft || displayedProgress });
        }

        function xtreamFail(err) {
            if (!stillCurrent()) { finishRefreshUi(); return; }
            finishRefreshUi();
            App.onCatalogRefreshError(err, { soft: soft });
        }

        if (server && user && pass) {
            if (!fromHome) { App.toast('Mise à jour du catalogue…', true); }
            trackCancellation(Xtream.load(server, user, pass, loadOptions, xtreamDone, xtreamFail));
            return;
        }

        var parsed = Xtream.parseM3uCredentials(url);
        if (parsed) {
            Storage.set(Storage.KEYS.xtreamServer, parsed.base);
            Storage.set(Storage.KEYS.xtreamUser, parsed.username);
            Storage.set(Storage.KEYS.xtreamPass, parsed.password);
            Storage.flush();
            fingerprint = App.catalogSourceFingerprint();
            if (!fromHome) { App.toast('Mise à jour du catalogue…', true); }
            trackCancellation(Xtream.load(parsed.base, parsed.username, parsed.password, loadOptions,
                xtreamDone, xtreamFail));
            return;
        }

        if (!url) {
            finishRefreshUi();
            if (!App.hasCatalogContent()) {
                App.toast('Bienvenue — configurez Xtream ou une URL M3U');
                App.showSettings();
            }
            return;
        }

        if (!fromHome) { App.toast('Mise à jour du catalogue…', true); }
        trackCancellation(Playlist.load(url, function (list, epgUrl, cats) {
            if (!stillCurrent()) { finishRefreshUi(); return; }
            finishRefreshUi();
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
            var catalog = App.normalizeCatalog({
                live: { categories: cats || [], items: liveItems },
                vod: App.emptyBucket(),
                series: App.emptyBucket(),
                epgUrl: epgUrl || ''
            });
            App.onCatalogRefreshDone(fingerprint, catalog, { soft: soft });
        }, function (err) {
            if (!stillCurrent()) { finishRefreshUi(); return; }
            finishRefreshUi();
            App.onCatalogRefreshError(err, { soft: soft });
        }));
    }

    /* Actualisation manuelle du catalogue (anti double-trigger). */
    App.refreshCatalogFromHome = function () {
        if (App.catalogRefreshing) { return; }
        if (!App.catalogSourceFingerprint()) {
            App.toast('Bienvenue — configurez Xtream ou une URL M3U');
            App.showSettings();
            return;
        }
        App.catalogRefreshing = true;
        App.showHomeRefreshSpinner();
        App.refreshCatalogFromServer({
            soft: App.hasCatalogContent(),
            fromHome: true
        });
    }

    App.setHomeBrandFocused = function (on) {
        App.homeBrandFocused = !!on;
        if (App.$listBrand) {
            if (App.homeBrandFocused) {
                App.$listBrand.classList.add('is-focused');
            } else {
                App.$listBrand.classList.remove('is-focused');
            }
        }
        if (typeof App.updateListClasses === 'function') {
            App.updateListClasses();
        }
    }

    App.bindHomeBrandActions = function () {
        if (typeof App.bindHomeRailClicks === 'function') {
            App.bindHomeRailClicks();
        }
        if (!App.$listBrand || App.$listBrand.getAttribute('data-bound') === '1') { return; }
        App.$listBrand.setAttribute('data-bound', '1');
        App.$listBrand.addEventListener('click', function (e) {
            if (App.uiState !== 'browse' || App.listLevel !== 'types') { return; }
            if (e && e.preventDefault) { e.preventDefault(); }
            App.refreshCatalogFromHome();
        });
    }

    /*
     * Entry point unique (boot + Settings Save).
     * Settings Save: refresh réseau systématique.
     * opts.fromBoot — cache si dispo (pas de refresh forcé) ; sinon fetch réseau.
     */
    App.loadPlaylist = function (opts) {
        opts = opts || {};
        var gen = ++App.catalogLoadGen;
        var fromBoot = !!opts.fromBoot;
        var fingerprint = App.catalogSourceFingerprint();

        if (!fingerprint) {
            App.toast('Bienvenue — configurez Xtream ou une URL M3U');
            App.showSettings();
            return;
        }

        if (!fromBoot) {
            App.refreshCatalogFromServer({ soft: false });
            return;
        }

        Storage.loadCatalogCache(function (cached) {
            function applyCached() {
                if (gen !== App.catalogLoadGen ||
                    fingerprint !== App.catalogSourceFingerprint()) { return; }
                var cacheOk = cached && cached.fingerprint === fingerprint &&
                    App.isUsableCachedCatalog(App.restoreCatalogUrls ? App.restoreCatalogUrls(cached.catalog) : cached.catalog);

                if (cacheOk) {
                    try {
                        /* Only a successfully displayed cache skips the network. */
                        if (App.startFromCatalog(cached.catalog) !== false) {
                            if (cached.v !== 3 && App.persistCatalogCache &&
                                App.xtreamCreds && App.xtreamCreds.base) {
                                setTimeout(function () {
                                    if (fingerprint !== App.catalogSourceFingerprint()) { return; }
                                    cached.catalog.base = App.xtreamCreds.base;
                                    cached.catalog.username = App.xtreamCreds.username;
                                    cached.catalog.password = App.xtreamCreds.password;
                                    App.persistCatalogCache(fingerprint, cached.catalog);
                                }, 500);
                            }
                            return;
                        }
                    } catch (eCache) {}
                }
                App.refreshCatalogFromServer({ soft: false });
            }
            /* Yield one frame so shell/splash can paint before heavy catalog work. */
            setTimeout(applyCached, 0);
        });
    }

    App.isUsableCachedCatalog = function (catalog) {
        if (!catalog || typeof catalog !== 'object') { return false; }
        var types = ['live', 'vod', 'series'];
        var count = 0;
        for (var i = 0; i < types.length; i++) {
            var bucket = catalog[types[i]];
            if (!bucket) { continue; }
            if (!Array.isArray(bucket.items) || !Array.isArray(bucket.categories)) { return false; }
            for (var j = 0; j < bucket.items.length; j++) {
                var item = bucket.items[j];
                if (!item || typeof item !== 'object' || typeof item.name !== 'string' ||
                    (types[i] === 'series' ? !item.seriesId :
                        (typeof item.url !== 'string' || !item.url))) { return false; }
                count++;
            }
            for (var k = 0; k < bucket.categories.length; k++) {
                if (!bucket.categories[k] || typeof bucket.categories[k] !== 'object') { return false; }
            }
        }
        return count > 0;
    };

    App.boot = function () {
        try {
            Player.init(App.onPlayerStatus);
            Player.setTimeUpdate(App.onPlayerTimeUpdate);
            Player.setSubtitleHandler(App.setSubtitleText);
            App.registerTvKeys();
            App.bindHomeBrandActions();
            if (typeof App.bindBrowseListClicks === 'function') {
                App.bindBrowseListClicks();
            }
            if (typeof App.bindSearchShellEvents === 'function') {
                App.bindSearchShellEvents();
            }
            document.addEventListener('keydown', App.onKeyDown);
            document.addEventListener('keyup', function (e) {
                if (e.keyCode === App.KEY.LEFT || e.keyCode === App.KEY.RIGHT ||
                    e.keyCode === App.KEY.MEDIA_REWIND || e.keyCode === App.KEY.MEDIA_FF) {
                    if (typeof App.resetScrubHold === 'function') {
                        App.resetScrubHold();
                    }
                }
            });
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    if (App.hideNextEpisodePrompt) { App.hideNextEpisodePrompt(true); }
                    App.persistResumePosition(true);
                    App.setBackgroundSuspended(true);
                    Storage.flush();
                    Player.suspend();
                } else {
                    App.setBackgroundSuspended(false);
                    Player.restore();
                    if (App.startResumeSaveLoop) { App.startResumeSaveLoop(); }
                }
            });
            App.epgRefreshTimer = setInterval(App.loadEpg, App.EPG_REFRESH_MS);
            Storage.hydrate(function () {
                try {
                    /* Boot: cache si possible ; refresh réseau seulement sans cache. */
                    App.loadPlaylist({ fromBoot: true });
                } catch (err) {
                    App.toast('Erreur de chargement : ' + (err && err.message ? err.message : err), true);
                    App.showSettings();
                }
            });
        } catch (err) {
            try {
                App.toast('Démarrage impossible : ' + (err && err.message ? err.message : err), true);
            } catch (e2) {}
            try { App.showSettings(); } catch (e3) {}
        }
    }

    App.setBackgroundSuspended = function (hidden) {
        App.backgroundSuspended = hidden;
        if (hidden) {
            if (App.stopResumeSaveLoop) { App.stopResumeSaveLoop(); }
            clearInterval(App.epgRefreshTimer); App.epgRefreshTimer = null;
            clearTimeout(App._followRefreshTimer);
            App._followGeneration = (App._followGeneration || 0) + 1;
            App._followRefreshBusy = false;
            App._followRefreshAgain = null;
            if (App._followRequestCancel) { App._followRequestCancel(); App._followRequestCancel = null; }
            if (EPG.cancel) { EPG.cancel(); }
            clearTimeout(App.epgLoadTimer);
            clearTimeout(App._searchWorkTimer);
            App._searchGeneration = (App._searchGeneration || 0) + 1;
            if (App.stopLivePreview) { App.stopLivePreview(); }
        } else {
            if (!App.epgRefreshTimer) { App.epgRefreshTimer = setInterval(App.loadEpg, App.EPG_REFRESH_MS); }
            if (App.uiState === 'search' && App.runSearchFilter) { App.runSearchFilter(true); }
            if (App.scheduleFollowedSeriesRefresh) { App.scheduleFollowedSeriesRefresh({ rebuildHome: true }); }
            if (!EPG.isLoaded || !EPG.isLoaded()) { App.loadEpg(); }
        }
    };

    window.addEventListener('load', App.boot);
})(App);
