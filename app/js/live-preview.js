/* Live TV browse: windowed stream preview (same player, reduced display rect) */
var App = App || {};
(function (App) {
    'use strict';

    /* Longer debounce: remote hold-scroll must not open/prepare a stream per row. */
    App.LIVE_PREVIEW_DEBOUNCE_MS = 900;
    App.livePreviewTimer = null;
    App.livePreviewUrl = '';
    App.livePreviewPendingUrl = '';
    App.livePreviewActive = false;
    App.livePreviewToken = 0;

    App.isLivePreviewContext = function () {
        if (App.uiState !== 'browse') { return false; }
        if (App.isPosterBrowse && App.isPosterBrowse()) { return false; }
        if (App.listLevel === 'favorites') { return App.contentType === 'live'; }
        return App.contentType === 'live' && App.listLevel === 'content';
    };

    App.focusedLiveChannel = function () {
        if (!App.isLivePreviewContext()) { return null; }
        var row = App.browseRowAt ? App.browseRowAt(App.focusedIndex) : (App.listRows[App.focusedIndex] || null);
        if (!row) { return null; }
        var item = null;
        if (row.kind === 'favorite-item' && row.item) {
            item = row.item;
        } else if (row.kind === 'channel' && row.channelIndex != null) {
            item = App.channels[row.channelIndex];
        }
        if (!item || !item.url) { return null; }
        if (item.kind && item.kind !== 'live') { return null; }
        if (App.isGroupHeader && App.isGroupHeader(item)) { return null; }
        return item;
    };

    App.clearLivePreviewTimer = function () {
        if (App.livePreviewTimer) {
            clearTimeout(App.livePreviewTimer);
            App.livePreviewTimer = null;
        }
    };

    App.getLivePreviewViewportRect = function () {
        var el = App.$livePreviewViewport || document.getElementById('live-preview-viewport');
        if (!el) { return null; }
        var r = el.getBoundingClientRect();
        if (!r || r.width < 8 || r.height < 8) { return null; }
        return {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height)
        };
    };

    App.applyLivePreviewDisplayRect = function () {
        var rect = App.getLivePreviewViewportRect();
        if (!rect || !Player || !Player.setDisplayRect) { return false; }
        Player.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
        return true;
    };

    App.setLivePreviewPlayingUi = function (playing) {
        if (!App.$livePreview) { return; }
        if (playing) {
            App.$livePreview.classList.add('is-playing');
            App.$livePreview.classList.remove('is-loading');
        } else {
            App.$livePreview.classList.remove('is-playing');
        }
    };

    App.setLivePreviewLoadingUi = function (loading) {
        if (!App.$livePreview) { return; }
        if (loading) {
            App.$livePreview.classList.add('is-loading');
            App.$livePreview.classList.remove('is-playing');
        } else {
            App.$livePreview.classList.remove('is-loading');
        }
    };

    App.updateLivePreviewMeta = function (item) {
        if (!App.$livePreviewName) { return; }
        if (!item) {
            App.$livePreviewName.textContent = '';
            if (App.$livePreviewEpg) { App.$livePreviewEpg.textContent = ''; }
            return;
        }
        App.$livePreviewName.textContent = typeof App.displayCatalogTitle === 'function'
            ? App.displayCatalogTitle(item.name || 'Chaîne')
            : (item.name || 'Chaîne');
        if (!App.$livePreviewEpg) { return; }
        var nn = (item.id && typeof EPG !== 'undefined') ? EPG.nowNext(item.id) : null;
        if (nn && nn.now) {
            App.$livePreviewEpg.textContent = EPG.fmtTime(nn.now.start) + '–' +
                EPG.fmtTime(nn.now.stop) + '  ·  ' + (nn.now.title || '');
        } else if (item.id && typeof EPG !== 'undefined' && EPG.isLoaded()) {
            App.$livePreviewEpg.textContent = 'Pas de programme EPG';
        } else if (typeof EPG !== 'undefined' && !EPG.isLoaded()) {
            App.$livePreviewEpg.textContent = 'EPG non chargé';
        } else {
            App.$livePreviewEpg.textContent = '';
        }
    };

    App.showLivePreviewChrome = function () {
        if (!App.$list || !App.$livePreview) { return; }
        App.$list.classList.add('is-live-preview');
        App.$livePreview.classList.remove('hidden');
        App.$livePreview.setAttribute('aria-hidden', 'false');
        App.setBrowseDim(false);
    };

    App.hideLivePreviewChrome = function () {
        if (App.$list) { App.$list.classList.remove('is-live-preview'); }
        if (App.$livePreview) {
            App.$livePreview.classList.add('hidden');
            App.$livePreview.classList.remove('is-playing', 'is-loading');
            App.$livePreview.setAttribute('aria-hidden', 'true');
        }
        App.updateLivePreviewMeta(null);
    };

    App.stopLivePreview = function (opts) {
        opts = opts || {};
        App.clearLivePreviewTimer();
        App.livePreviewToken += 1;
        var wasPreview = App.livePreviewActive;
        App.livePreviewActive = false;
        App.livePreviewUrl = '';
        App.livePreviewPendingUrl = '';
        App.setLivePreviewPlayingUi(false);
        App.setLivePreviewLoadingUi(false);
        if (!opts.keepChrome) {
            App.hideLivePreviewChrome();
        } else {
            App.updateLivePreviewMeta(null);
            if (App.$livePreview) {
                App.$livePreview.classList.remove('is-playing');
                App.$livePreview.classList.add('is-loading');
            }
        }
        if (wasPreview || opts.forceStop) {
            try { Player.stop(); } catch (e) {}
            App.playingIndex = -1;
        }
        if (!opts.keepRect && Player && Player.clearDisplayRect) {
            try { Player.clearDisplayRect(); } catch (e2) {}
        }
    };

    App.promoteLivePreviewToWatch = function () {
        App.clearLivePreviewTimer();
        App.livePreviewActive = false;
        App.livePreviewUrl = '';
        App.livePreviewPendingUrl = '';
        App.hideLivePreviewChrome();
        if (Player && Player.clearDisplayRect) {
            try { Player.clearDisplayRect(); } catch (e) {}
        }
        App.enterWatchMode();
        if (App.isSeekablePlaying && App.isSeekablePlaying()) {
            App.showVodControls(false);
        } else if (App.playingItem()) {
            App.showInfo();
        }
        App.updateListClasses();
    };

    App.startLivePreview = function (item) {
        if (!item || !item.url || !App.isLivePreviewContext()) { return; }
        App.livePreviewPendingUrl = '';
        App.showLivePreviewChrome();
        App.updateLivePreviewMeta(item);

        if (App.livePreviewActive && App.livePreviewUrl === item.url && App.playingItem()) {
            App.applyLivePreviewDisplayRect();
            App.setLivePreviewPlayingUi(true);
            return;
        }

        App.livePreviewToken += 1;
        var token = App.livePreviewToken;
        App.livePreviewActive = true;
        App.livePreviewUrl = item.url;
        App.setLivePreviewLoadingUi(true);
        App.setLivePreviewPlayingUi(false);

        /* Layout first so getBoundingClientRect matches the preview hole. */
        App.showLivePreviewChrome();
        setTimeout(function () {
            if (token !== App.livePreviewToken) { return; }
            if (!App.isLivePreviewContext()) { return; }
            App.applyLivePreviewDisplayRect();
            App.beginPlayback(item, 'live', 0, {
                keepBrowse: true,
                preview: true,
                silent: true,
                skipResumePrompt: true
            });
        }, 40);
    };

    App.scheduleLivePreview = function () {
        if (!App.isLivePreviewContext()) {
            App.clearLivePreviewTimer();
            App.livePreviewPendingUrl = '';
            if (App.livePreviewActive || (App.$list && App.$list.classList.contains('is-live-preview'))) {
                App.stopLivePreview({ forceStop: true });
                if (App.uiState === 'browse') {
                    App.setBrowseDim(true);
                }
            }
            return;
        }

        App.showLivePreviewChrome();
        var item = App.focusedLiveChannel();
        var wantUrl = item && item.url ? item.url : '';

        /* Already previewing this stream — do not touch the player or reset debounce. */
        if (item && App.livePreviewActive && App.livePreviewUrl === wantUrl) {
            App.clearLivePreviewTimer();
            App.livePreviewPendingUrl = '';
            App.updateLivePreviewMeta(item);
            if (App.$livePreviewPlaceholder) {
                App.$livePreviewPlaceholder.textContent = 'Aperçu…';
            }
            return;
        }

        /*
         * Do not stop/start on every focus tick. Keep the previous preview playing
         * while the user scrolls; only switch after debounce settles.
         * Also coalesce: updateListClasses() calls us often — don't reset the timer
         * if we are already waiting for the same pending URL.
         */
        if (wantUrl && App.livePreviewPendingUrl === wantUrl && App.livePreviewTimer) {
            App.updateLivePreviewMeta(item);
            return;
        }

        App.clearLivePreviewTimer();

        if (!item) {
            App.livePreviewPendingUrl = '';
            App.updateLivePreviewMeta(null);
            App.livePreviewTimer = setTimeout(function () {
                App.livePreviewTimer = null;
                App.livePreviewPendingUrl = '';
                if (!App.isLivePreviewContext()) { return; }
                if (App.focusedLiveChannel()) { return; }
                App.stopLivePreview({ keepChrome: true, forceStop: true, keepRect: true });
                App.updateLivePreviewMeta(null);
                if (App.$livePreviewPlaceholder) {
                    App.$livePreviewPlaceholder.textContent = 'Sélectionnez une chaîne';
                }
                App.setLivePreviewLoadingUi(true);
            }, App.LIVE_PREVIEW_DEBOUNCE_MS);
            return;
        }

        if (App.$livePreviewPlaceholder) {
            App.$livePreviewPlaceholder.textContent = 'Aperçu…';
        }
        App.updateLivePreviewMeta(item);

        App.livePreviewPendingUrl = wantUrl;
        App.livePreviewTimer = setTimeout(function () {
            App.livePreviewTimer = null;
            App.livePreviewPendingUrl = '';
            if (!App.isLivePreviewContext()) { return; }
            var focused = App.focusedLiveChannel();
            if (!focused || focused.url !== wantUrl) { return; }
            App.startLivePreview(focused);
        }, App.LIVE_PREVIEW_DEBOUNCE_MS);
    };

    App.onLivePreviewPlayerStatus = function (state) {
        if (!App.livePreviewActive) { return; }
        if (state === 'playing') {
            App.applyLivePreviewDisplayRect();
            App.setLivePreviewPlayingUi(true);
        } else if (state === 'error' || state === 'ended') {
            App.setLivePreviewPlayingUi(false);
            App.setLivePreviewLoadingUi(true);
            if (App.$livePreviewPlaceholder) {
                App.$livePreviewPlaceholder.textContent = state === 'error' ? 'Aperçu indisponible' : 'Aperçu';
            }
        }
        /* buffering: stay quiet — browse uses placeholder, not the watch toast. */
    };
})(App);
