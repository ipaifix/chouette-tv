/* Toast, info bar, exclusive overlays */
var App = App || {};
(function (App) {
    'use strict';

    App.toast = function (message, persistent) {
        clearTimeout(App.toastTimer);
        var surface = App.$toast;
        if (!surface) { return; }
        surface.textContent = String(message == null ? '' : message);
        surface.classList.remove('hidden');
        App.toastTimer = persistent ? null : setTimeout(function () {
            if (App.$toast === surface) { surface.classList.add('hidden'); }
        }, 3000);
    };

    /* ---------- info bar ---------- */

    App.playingItem = function () {
        if (App.playingIndex < 0 || App.playingIndex >= App.zapList.length) { return null; }
        return App.zapList[App.playingIndex];
    }

    App.fillStreamQualityEl = function (el, hintText) {
        if (!el || typeof Player.getStreamQuality !== 'function') { return; }
        var q = Player.getStreamQuality(hintText || '');
        el.textContent = '';
        if (!q.badges || !q.badges.length) {
            el.classList.add('hidden');
            el.setAttribute('aria-hidden', 'true');
            return;
        }
        for (var i = 0; i < q.badges.length; i++) {
            var badge = document.createElement('span');
            badge.className = 'sq-badge';
            var label = q.badges[i];
            var up = String(label).toUpperCase();
            if (up.indexOf('HDR') >= 0 || up.indexOf('DOLBY VISION') >= 0 || up === 'HLG') {
                badge.className += ' sq-hdr';
            } else if (up.indexOf('ATMOS') >= 0 || up.indexOf('DOLBY') >= 0 ||
                up.indexOf('DTS') === 0) {
                badge.className += ' sq-audio';
            } else if (up === 'IMAX') {
                badge.className += ' sq-imax';
            }
            badge.textContent = label;
            el.appendChild(badge);
        }
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
    }

    App.refreshStreamQualityUi = function () {
        var ch = App.playingItem();
        var hint = ch ? ch.name : '';
        if (App.$infoQuality && App.$infoBar && !App.$infoBar.classList.contains('hidden')) {
            App.fillStreamQualityEl(App.$infoQuality, hint);
        }
        if (App.$vodQuality && App.$vodControls && !App.$vodControls.classList.contains('hidden')) {
            App.fillStreamQualityEl(App.$vodQuality, hint);
        }
    }

    App.scheduleStreamQualityRefresh = function () {
        clearTimeout(App.streamQualityTimer);
        /* Tracks often appear shortly after PLAYING (esp. adaptive). */
        App.streamQualityTimer = setTimeout(function () {
            App.refreshStreamQualityUi();
            clearTimeout(App.streamQualityTimer2);
            App.streamQualityTimer2 = setTimeout(App.refreshStreamQualityUi, 1200);
        }, 350);
    }

    App.renderInfoBar = function () {
        var ch = App.playingItem();
        if (!ch) { return; }
        App.$infoName.textContent = typeof App.displayCatalogTitle === 'function'
            ? App.displayCatalogTitle(ch.name)
            : ch.name;
        App.$infoMode.textContent = Player.currentModeLabel();
        App.fillStreamQualityEl(App.$infoQuality, ch.name);

        var nn = (ch.kind === 'live' && ch.id) ? EPG.nowNext(ch.id) : null;
        if (nn && nn.now) {
            App.$epgNow.textContent = 'Maintenant   ' + EPG.fmtTime(nn.now.start) + '–' +
                EPG.fmtTime(nn.now.stop) + '   ' + nn.now.title;
        } else if (ch.kind === 'live' && EPG.isLoaded()) {
            App.$epgNow.textContent = 'Aucun programme disponible pour cette chaîne';
        } else if (ch.kind === 'live') {
            App.$epgNow.textContent = 'Aucun guide TV — ajoutez une adresse EPG dans Réglages';
        } else {
            App.$epgNow.textContent = ch.kind === 'vod' ? 'Film' : (ch.kind === 'episode' ? 'Épisode' : '');
        }
        App.$epgNext.textContent = (nn && nn.next)
            ? 'À suivre  ' + EPG.fmtTime(nn.next.start) + '   ' + nn.next.title
            : '';
        App.updateInfoFocusUi();
    }

    App.updateInfoFocusUi = function () {
        if (App.$infoActionAspect) {
            App.$infoActionAspect.className = 'watch-action' +
                (App.infoFocus === 'aspect' ? ' focused' : '');
        }
        if (App.$infoActionSubs) {
            App.$infoActionSubs.className = 'watch-action' +
                (App.infoFocus === 'subs' ? ' focused' : '');
        }
        if (App.$infoActionFavorite) {
            var ch = App.playingItem();
            var favorite = !!(ch && ch.kind === 'live' && App.isFavoriteChannel &&
                App.isFavoriteChannel(ch));
            App.$infoActionFavorite.className = 'watch-action' +
                (App.infoFocus === 'favorite' ? ' focused' : '') +
                (favorite ? ' is-on' : '');
            App.$infoActionFavorite.textContent = favorite ? '★ Favori' : '☆ Favori';
        }
        if (typeof App.updateAspectActionLabels === 'function') {
            App.updateAspectActionLabels();
        }
    }

    App.showInfo = function () {
        if (!App.playingItem() || App.uiState === 'epg' || App.uiState === 'browse' ||
            App.uiState === 'search' || App.uiState === 'tracks') { return; }
        if (!App.$infoBar) { return; }
        if (App.$infoBar.classList.contains('hidden')) {
            App.infoFocus = 'aspect';
        }
        App.renderInfoBar();
        App.$infoBar.classList.remove('hidden');
        clearTimeout(App.infoTimer);
        App.infoTimer = setTimeout(App.hideInfo, 5000);
    }

    App.bumpInfo = function () {
        if (!App.playingItem()) { return; }
        App.showInfo();
    }

    App.activateInfoAction = function () {
        if (App.infoFocus === 'favorite') {
            if (typeof App.showLiveFavoritePopup === 'function') {
                App.showLiveFavoritePopup();
            }
            return;
        }
        if (App.infoFocus === 'subs') {
            App.showTracksPanel();
            return;
        }
        App.cycleAspectFromOverlay();
        App.bumpInfo();
    }

    App.moveInfoFocus = function (delta) {
        var order = ['aspect', 'subs', 'favorite'];
        var index = order.indexOf(App.infoFocus);
        if (index < 0) { index = 0; }
        App.infoFocus = order[(index + delta + order.length) % order.length];
        App.updateInfoFocusUi();
    }

    App.hideInfo = function () {
        clearTimeout(App.infoTimer);
        if (App.$infoBar) { App.$infoBar.classList.add('hidden'); }
    }

    App.setBrowseDim = function (on) {
        if (!App.$browseDim) { return; }
        if (on) { App.$browseDim.classList.remove('hidden'); }
        else { App.$browseDim.classList.add('hidden'); }
    }

    /*
     * Exclusive overlay layers — only one primary UI surface at a time.
     * keep: { list, search, settings, exit, epg, tracks, resume, nextEpisode, liveFavorite, vod, info, pause, dim }
     * Toast + subtitles stay independent (transient / stream-synced).
     */
    App.setExclusiveOverlays = function (keep) {
        keep = keep || {};
        if (!keep.feature && App.$featurePanel) { App.$featurePanel.classList.add('hidden'); }
        if (!keep.liveFavorite && App.$liveFavoritePopup) {
            App.$liveFavoritePopup.classList.add('hidden');
        }
        function showEl(el, on) {
            if (!el) { return; }
            if (on) { el.classList.remove('hidden'); }
            else { el.classList.add('hidden'); }
        }
        if (!keep.info) { App.hideInfo(); }
        if (!keep.vod) { App.hideVodControls(); }
        if (!keep.pause) { App.hideVodPauseIndicator(); }
        if (!keep.resume) {
            if (App.$resumeDialog) { App.$resumeDialog.classList.add('hidden'); }
            App.resumePending = null;
        }
        if (!keep.nextEpisode) {
            if (typeof App.hideNextEpisodePrompt === 'function') {
                App.hideNextEpisodePrompt(false);
            } else {
                clearTimeout(App.nextEpisodeTimer);
                App.nextEpisodeTimer = null;
                if (App.$nextEpisodePrompt) { App.$nextEpisodePrompt.classList.add('hidden'); }
                App.nextEpisodePending = null;
                App.nextEpisodeLive = false;
            }
        }
        if (!keep.tracks && App.$tracksPanel) {
            App.$tracksPanel.classList.add('hidden');
        }
        showEl(App.$list, !!keep.list);
        showEl(App.$search, !!keep.search);
        showEl(App.$settings, !!keep.settings);
        showEl(App.$exit, !!keep.exit);
        showEl(App.$epgPanel, !!keep.epg);
        showEl(App.$tracksPanel, !!keep.tracks);
        showEl(App.$resumeDialog, !!keep.resume);
        showEl(App.$nextEpisodePrompt, !!keep.nextEpisode);
        showEl(App.$liveFavoritePopup, !!keep.liveFavorite);
        if (keep.vod && App.$vodControls) { App.$vodControls.classList.remove('hidden'); }
        if (keep.info && App.$infoBar) { App.$infoBar.classList.remove('hidden'); }
        if (keep.pause && App.$vodPause) { App.$vodPause.classList.remove('hidden'); }
        App.setBrowseDim(!!keep.dim);
    }

    App.setSubtitleText = function (text) {
        if (!App.$subtitleOverlay) { return; }
        if (App.livePreviewActive || App.uiState === 'browse' || App.uiState === 'search') {
            App.$subtitleOverlay.textContent = '';
            App.$subtitleOverlay.classList.add('hidden');
            return;
        }
        if (text) {
            App.$subtitleOverlay.textContent = text;
            App.$subtitleOverlay.classList.remove('hidden');
        } else {
            App.$subtitleOverlay.textContent = '';
            App.$subtitleOverlay.classList.add('hidden');
        }
    }
})(App);
