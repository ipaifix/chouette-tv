/* Remote key routing */
var App = App || {};
(function (App) {
    'use strict';

    

    App.registerTvKeys = function () {
        if (typeof tizen === 'undefined' || !tizen.tvinputdevice) { return; }
        var names = [
            'ChannelUp', 'ChannelDown',
            'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaRewind', 'MediaFastForward', 'Info'
        ];
        for (var i = 0; i < names.length; i++) {
            try { tizen.tvinputdevice.registerKey(names[i]); } catch (e) {}
        }
    }

    App.onKeyDown = function (e) {
        if (App.uiState === 'feature') { App.onFeatureKeys(e); return; }
        if (App.uiState === 'exit') { App.onExitKeys(e); return; }
        if (App.uiState === 'resume') { App.onResumeKeys(e); return; }
        if (App.uiState === 'nextEpisode') { App.onNextEpisodeKeys(e); return; }
        if (App.uiState === 'liveFavorite') { App.onLiveFavoriteKeys(e); return; }

        /* Play/Pause/Stop/RW/FF — always while a seekable stream is active. */
        if (App.isSeekablePlaying() && App.handleVodMediaKeys(e)) { return; }

        if (App.uiState === 'settings') {
            if (App.usesBrowseShell && App.usesBrowseShell() &&
                App.isShellRailFocused && App.isShellRailFocused() &&
                typeof App.onShellRailKeys === 'function') {
                App.onShellRailKeys(e);
                return;
            }
            App.onSettingsKeys(e);
            return;
        }
        if (App.uiState === 'search') { App.onSearchKeys(e); return; }
        if (App.uiState === 'tracks') { App.onTracksKeys(e); return; }
        if (App.uiState === 'epg') { App.onEpgKeys(e); return; }

        if (App.uiState === 'browse') {
            App.onBrowseKeys(e);
            return;
        }

        /* ---- WATCH mode (fullscreen stream only) ---- */
        App.onWatchKeys(e);
    }

    App.clearBrowseHold = function () {
        /* Kept as a compatibility no-op for surfaces that cancel browse input. */
    };

    App.onBrowseKeys = function (e) {
        if (App.usesBrowseShell && App.usesBrowseShell() &&
            App.isShellRailFocused && App.isShellRailFocused() &&
            typeof App.onShellRailKeys === 'function') {
            App.clearBrowseHold();
            App.onShellRailKeys(e);
            return;
        }
        if (App.isHomeDash && App.isHomeDash() && typeof App.onHomeKeys === 'function') {
            App.clearBrowseHold();
            App.onHomeKeys(e);
            return;
        }
        if (App.isPosterBrowse()) {
            switch (e.keyCode) {
                case App.KEY.UP:
                    App.movePosterFocus(-1, 0);
                    e.preventDefault();
                    break;
                case App.KEY.DOWN:
                    App.movePosterFocus(1, 0);
                    e.preventDefault();
                    break;
                case App.KEY.LEFT: {
                    var cols = App.POSTER_COLS || 7;
                    if (App.usesBrowseShell && App.usesBrowseShell() &&
                        (App.focusedIndex % cols) === 0 &&
                        typeof App.focusShellRail === 'function') {
                        App.focusShellRail();
                        e.preventDefault();
                        break;
                    }
                    App.movePosterFocus(0, -1);
                    e.preventDefault();
                    break;
                }
                case App.KEY.RIGHT:
                    App.movePosterFocus(0, 1);
                    e.preventDefault();
                    break;
                case App.KEY.ENTER:
                    App.onListEnter();
                    e.preventDefault();
                    break;
                case App.KEY.RETURN:
                case App.KEY.ESC:
                    App.onListBack();
                    e.preventDefault();
                    break;
                case App.KEY.CH_UP:
                case App.KEY.PAGE_UP:
                    App.movePosterFocus(-(App.getPosterWindowRows ? App.getPosterWindowRows() : (App.POSTER_WINDOW_ROWS || 2)), 0);
                    e.preventDefault();
                    break;
                case App.KEY.CH_DOWN:
                case App.KEY.PAGE_DOWN:
                    App.movePosterFocus(App.getPosterWindowRows ? App.getPosterWindowRows() : (App.POSTER_WINDOW_ROWS || 2), 0);
                    e.preventDefault();
                    break;
            }
            return;
        }

        switch (e.keyCode) {
            case App.KEY.UP:
                App.clearBrowseHold();
                if (App.listLevel === 'types' && App.homeBrandFocused) {
                    App.setHomeBrandFocused(false);
                    e.preventDefault();
                    break;
                }
                App.focusedIndex = Math.max(0, App.focusedIndex - 1);
                if (typeof App.scheduleUi === 'function') {
                    App.scheduleUi(function () { App.updateListClasses(); });
                } else {
                    App.updateListClasses();
                }
                break;
            case App.KEY.DOWN:
                App.clearBrowseHold();
                if (App.listLevel === 'types' && App.homeBrandFocused) {
                    App.setHomeBrandFocused(false);
                    e.preventDefault();
                    break;
                }
                App.focusedIndex = Math.min(Math.max(0, App.listRows.length - 1), App.focusedIndex + 1);
                if (typeof App.scheduleUi === 'function') {
                    App.scheduleUi(function () { App.updateListClasses(); });
                } else {
                    App.updateListClasses();
                }
                break;
            case App.KEY.LEFT: {
                App.clearBrowseHold();
                if (App.listLevel === 'types' && App.homeBrandFocused) {
                    App.setHomeBrandFocused(false);
                    e.preventDefault();
                    break;
                }
                /* Shell: LEFT → rail (BACK remonte d’un niveau). */
                if (App.usesBrowseShell && App.usesBrowseShell() &&
                    typeof App.focusShellRail === 'function') {
                    App.focusShellRail();
                    e.preventDefault();
                    break;
                }
                App.onListBack();
                break;
            }
            case App.KEY.RIGHT: {
                if (App.listLevel === 'types') {
                    if (!App.homeBrandFocused) {
                        App.setHomeBrandFocused(true);
                    }
                    e.preventDefault();
                    break;
                }
                App.onListEnter();
                e.preventDefault();
                break;
            }
            case App.KEY.ENTER:
                App.clearBrowseHold();
                if (App.listLevel === 'types' && App.homeBrandFocused) {
                    App.refreshCatalogFromHome();
                    e.preventDefault();
                    break;
                }
                App.onListEnter();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.clearBrowseHold();
                if (App.listLevel === 'types' && App.homeBrandFocused) {
                    App.setHomeBrandFocused(false);
                    e.preventDefault();
                    break;
                }
                App.onListBack();
                e.preventDefault();
                break;
            case App.KEY.CH_UP:
            case App.KEY.PAGE_UP:
            case App.KEY.CH_DOWN:
            case App.KEY.PAGE_DOWN:
                /* Stream stopped in browse — ignore zap. */
                break;
        }
    }

    App.onWatchKeys = function (e) {
        /*
         * WATCH key contract:
         *   OK        → open player overlay (never pause); activate focused action
         *   Play/Pause→ pause/play only (media keys + Space)
         *   VOD overlay (2 rows): timeline scrub (default) · Aspect | Audio & ST
         *     ▲▼      → timeline ↔ bottom row · ◀▶ scrub on timeline / toggle bottom
         *   Live overlay: ◀▶ Aspect ↔ Audio ↔ Favori · ▼ guide
         *   Arrows    → if overlay closed, open it (no blind seek)
         *   BACK      → 1) close overlay/info if open · 2) stop + catalogue
         *               (safer two-step; not single-shot quit)
         */
        switch (e.keyCode) {
            case App.KEY.UP:
                if (App.isSeekablePlaying()) {
                    if (!App.vodBarVisible) {
                        App.openWatchOverlay();
                    } else if (App.moveVodFocus(-1)) {
                        App.bumpVodControls();
                    } else {
                        App.bumpVodControls();
                    }
                } else {
                    App.bumpInfo();
                }
                e.preventDefault();
                break;
            case App.KEY.DOWN:
                if (App.isSeekablePlaying()) {
                    if (!App.vodBarVisible) {
                        App.openWatchOverlay();
                    } else if (App.moveVodFocus(1)) {
                        App.showVodControls(true);
                    } else {
                        App.bumpVodControls();
                    }
                } else if (App.playingItem()) {
                    if (App.isWatchOverlayOpen()) {
                        if (App.showLiveGuide) { App.showLiveGuide(); }
                        else { App.showEpgPanel(); }
                    } else {
                        App.openWatchOverlay();
                    }
                }
                e.preventDefault();
                break;
            case App.KEY.LEFT:
                if (App.isSeekablePlaying()) {
                    if (!App.vodBarVisible) {
                        App.openWatchOverlay();
                    } else if (App.vodFocus === 'seek') {
                        App.scrubVod(-App.scrubStepForHold(-1));
                    } else if (typeof App.toggleVodBottomFocus === 'function' &&
                        App.toggleVodBottomFocus(-1)) {
                        App.bumpVodControls();
                    } else {
                        App.bumpVodControls();
                    }
                } else if (App.isWatchOverlayOpen()) {
                    App.moveInfoFocus(-1);
                    App.bumpInfo();
                } else {
                    App.openWatchOverlay();
                }
                e.preventDefault();
                break;
            case App.KEY.RIGHT:
                if (App.isSeekablePlaying()) {
                    if (!App.vodBarVisible) {
                        App.openWatchOverlay();
                    } else if (App.vodFocus === 'seek') {
                        App.scrubVod(App.scrubStepForHold(1));
                    } else if (typeof App.toggleVodBottomFocus === 'function' &&
                        App.toggleVodBottomFocus(1)) {
                        App.bumpVodControls();
                    } else {
                        App.bumpVodControls();
                    }
                } else if (App.isWatchOverlayOpen()) {
                    App.moveInfoFocus(1);
                    App.bumpInfo();
                } else {
                    App.openWatchOverlay();
                }
                e.preventDefault();
                break;
            case App.KEY.ENTER:
                if (typeof App.isNextEpisodeCtaVisible === 'function' &&
                    App.isNextEpisodeCtaVisible() && App.nextEpisodeLive) {
                    App.confirmNextEpisode();
                    e.preventDefault();
                    break;
                }
                if (App.isSeekablePlaying()) {
                    if (!App.vodBarVisible) {
                        App.openWatchOverlay();
                    } else if (App.vodFocus === 'subs') {
                        App.showTracksPanel();
                    } else if (App.vodFocus === 'follow') {
                        if (typeof App.toggleFollowPlayingSeries === 'function') {
                            App.toggleFollowPlayingSeries();
                        }
                        App.bumpVodControls();
                    } else if (App.vodFocus === 'aspect') {
                        App.cycleAspectFromOverlay();
                        App.bumpVodControls();
                    } else if (App.scrubTargetSec != null) {
                        App.confirmVodScrub();
                    } else {
                        App.bumpVodControls();
                    }
                } else if (App.isWatchOverlayOpen()) {
                    App.activateInfoAction();
                } else {
                    App.openWatchOverlay();
                }
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                /* Step 1: dismiss overlay. Step 2: dismiss next-episode CTA. Step 3: catalogue. */
                if (App.closeWatchOverlay()) {
                    e.preventDefault();
                    break;
                }
                if (typeof App.isNextEpisodeCtaVisible === 'function' &&
                    App.isNextEpisodeCtaVisible() && App.nextEpisodeLive) {
                    App.dismissNextEpisodePrompt();
                    e.preventDefault();
                    break;
                }
                App.showList();
                e.preventDefault();
                break;
            case App.KEY.INFO:
                App.openWatchOverlay();
                e.preventDefault();
                break;
            case App.KEY.SPACE:
            case App.KEY.MEDIA_PLAY_PAUSE:
            case App.KEY.MEDIA_PLAY:
            case App.KEY.MEDIA_PAUSE:
            case App.KEY.MEDIA_STOP:
            case App.KEY.MEDIA_REWIND:
            case App.KEY.MEDIA_FF:
                if (App.handleVodMediaKeys(e)) { return; }
                break;
            case App.KEY.CH_UP:
            case App.KEY.PAGE_UP:
                App.zap(1);
                e.preventDefault();
                break;
            case App.KEY.CH_DOWN:
            case App.KEY.PAGE_DOWN:
                App.zap(-1);
                e.preventDefault();
                break;
        }
    }

    App.handleVodMediaKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.SPACE:
            case App.KEY.MEDIA_PLAY_PAUSE:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (!App.isSeekablePlaying()) { return false; }
                if (App.uiState === 'tracks') { App.hideTracksPanel(true); App.uiState = 'watch'; }
                App.toggleVodPause();
                e.preventDefault();
                return true;
            case App.KEY.MEDIA_PLAY:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (!App.isSeekablePlaying()) { return false; }
                if (Player.isPaused()) { App.toggleVodPause(); }
                else if (App.uiState === 'watch') { App.bumpVodControls(); }
                e.preventDefault();
                return true;
            case App.KEY.MEDIA_PAUSE:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (!App.isSeekablePlaying()) { return false; }
                if (!Player.isPaused()) { App.toggleVodPause(); }
                else if (App.uiState === 'watch') { App.showVodControls(true); }
                e.preventDefault();
                return true;
            case App.KEY.MEDIA_STOP:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (App.isSeekablePlaying()) { App.persistResumePosition(true); }
                App.showList();
                e.preventDefault();
                return true;
            case App.KEY.MEDIA_REWIND:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (!App.isSeekablePlaying()) { return false; }
                if (App.uiState === 'tracks') {
                    App.hideTracksPanel(true);
                    App.uiState = 'watch';
                }
                /* Dedicated seek key: open overlay then scrub (no blind seek). */
                App.scrubVod(-App.scrubStepForHold(-1));
                e.preventDefault();
                return true;
            case App.KEY.MEDIA_FF:
                if (App.uiState === 'browse' || App.uiState === 'search') { return false; }
                if (!App.isSeekablePlaying()) { return false; }
                if (App.uiState === 'tracks') {
                    App.hideTracksPanel(true);
                    App.uiState = 'watch';
                }
                App.scrubVod(App.scrubStepForHold(1));
                e.preventDefault();
                return true;
            default:
                return false;
        }
    }

    App.onSettingsKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.UP:
                if (App.settingsEditing) { App.blurSettingsInputs(); App.updateSettingsFocusClasses(); }
                App.setSettingsFocus(App.settingsFocus - 1);
                e.preventDefault();
                break;
            case App.KEY.DOWN:
                if (App.settingsEditing) { App.blurSettingsInputs(); App.updateSettingsFocusClasses(); }
                App.setSettingsFocus(App.settingsFocus + 1);
                e.preventDefault();
                break;
            case App.KEY.LEFT:
                if (App.settingsEditing) {
                    /* Native caret movement inside an input, including TV keyboards. */
                    break;
                }
                if (App.usesBrowseShell && App.usesBrowseShell() &&
                    typeof App.focusShellRail === 'function') {
                    App.focusShellRail(typeof App.currentShellRailIndex === 'function'
                        ? App.currentShellRailIndex() : 0);
                    App.updateSettingsFocusClasses();
                }
                e.preventDefault();
                break;
            case App.KEY.RIGHT:
                if (!App.settingsEditing) { e.preventDefault(); }
                break;
            case App.KEY.ENTER:
                var el = App.settingsFocusables[App.settingsFocus];
                if (el === App.$settingSave) { App.saveSettings(); }
                else if (el === App.$settingRefresh) { App.refreshCatalogFromSettings(); }
                else if (el === App.$settingCancel) { App.hideSettings(); }
                else if (App.isSettingsInput(el)) {
                    if (App.settingsEditing) {
                        App.blurSettingsInputs();
                        App.updateSettingsFocusClasses();
                        App.setSettingsFocus(App.settingsFocus + 1);
                    } else {
                        App.beginSettingsEdit();
                    }
                }
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                if (App.settingsEditing) {
                    App.blurSettingsInputs();
                    App.updateSettingsFocusClasses();
                } else {
                    App.hideSettings();
                }
                e.preventDefault();
                break;
        }
    }

    /* Compact guide and confirmation screens use action maps rather than switches. */
    function dispatchKeys(event, commands) {
        var action = commands[event.keyCode];
        if (action) { action(); }
        event.preventDefault();
    }

    App.onEpgKeys = function (event) {
        var commands = {};
        function move(delta) {
            var limit = Math.max(0, App.epgItems.length - 1);
            App.epgFocusIndex = Math.min(limit, Math.max(0, App.epgFocusIndex + delta));
            App.updateEpgPanelClasses();
        }
        commands[App.KEY.UP] = function () { move(-1); };
        commands[App.KEY.DOWN] = function () { move(1); };
        commands[App.KEY.CH_UP] = commands[App.KEY.PAGE_UP] = function () { App.zap(1); };
        commands[App.KEY.CH_DOWN] = commands[App.KEY.PAGE_DOWN] = function () { App.zap(-1); };
        commands[App.KEY.ESC] = commands[App.KEY.RETURN] = App.hideEpgPanel;
        commands[App.KEY.ENTER] = function () { App.hideEpgPanel(); App.showList(); };
        dispatchKeys(event, commands);
    };

    App.onExitKeys = function (event) {
        var commands = {};
        commands[App.KEY.LEFT] = commands[App.KEY.RIGHT] = function () {
            App.exitChoiceYes = !App.exitChoiceYes;
            App.updateExitChoice();
        };
        commands[App.KEY.ESC] = commands[App.KEY.RETURN] = App.hideExit;
        commands[App.KEY.ENTER] = function () {
            var confirmed = App.exitChoiceYes;
            App.hideExit();
            if (confirmed) { App.exitApp(); }
        };
        dispatchKeys(event, commands);
    };
}(App));
