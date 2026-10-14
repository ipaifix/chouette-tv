/* Shared state + DOM refs */
var App = App || {};
(function (App) {
    'use strict';

/*
     * No playlist ships with the app. Sources, in priority order:
     *   1. Xtream Codes (server + user + pass) via player_api.php
     *   2. M3U URL saved in Réglages
     *   EPG: saved URL, else Xtream xmltv.php, else url-tvg="" from M3U header
     *
     * Persistence: Storage module (localStorage + preference + documents file).
     * Catalogue: snapshot documents/<namespace>-catalog.json — chargé au boot depuis
     *   le cache ; actualisation réseau manuelle depuis Réglages.
     */

    App.KEY = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
        ENTER: 13, RETURN: 10009,
        CH_UP: 427, CH_DOWN: 428,
        ESC: 27,
        SPACE: 32,
        PAGE_UP: 33,
        PAGE_DOWN: 34,
        /* Tizen media keys (register via tvinputdevice) */
        MEDIA_PLAY_PAUSE: 10252,
        MEDIA_PLAY: 415,
        MEDIA_PAUSE: 19,
        MEDIA_STOP: 413,
        MEDIA_REWIND: 412,
        MEDIA_FF: 417,
        INFO: 457
    };

    /*
     * UI modes (Netflix / Flex style):
     *   'browse'  — catalogue (types / categories / content / …)
     *   'watch'   — fullscreen playback (+ optional player overlay)
     *   'search' | 'settings' | 'epg' | 'tracks' | 'exit' | 'resume'
     *
     * Key contract (two separate modes):
     *   BROWSE — ▲▼◀▶ menus · OK ouvrir · BACK remonter (◀ aussi)
     *   WATCH  — OK ouvre overlay (pas pause) · Play/Pause (média / Espace)
     *            pause-play · flèches naviguent dans l’overlay (hors overlay :
     *            ouvrent l’overlay, pas de seek aveugle) · actions à l’écran
     *            (Aspect, Audio/ST) · BACK ferme d’abord l’overlay / info,
     *            2e BACK stop + catalogue (choix documenté).
     *   Pas de touches couleur (Rouge/Jaune/…).
     */
    App.uiState = 'browse';
    App.SEARCH_DEBOUNCE_MS = 220;
    App.SEARCH_MAX_RESULTS = 80;
    App.SEARCH_HISTORY_MAX = 12;

    App.EPG_REFRESH_MS = 6 * 3600 * 1000;

    /* Catalog buckets (Xtream). M3U only fills live. */
    App.catalog = {
        live: { categories: [], items: [] },
        vod: { categories: [], items: [] },
        series: { categories: [], items: [] }
    };
    App.xtreamCreds = { base: '', username: '', password: '' };
    App.contentType = 'live'; // 'live' | 'vod' | 'series'

    App.channels = [];          // alias of active type items (live/vod/series list)
    App.categories = [];
    App.headerEpgUrl = '';
    App.playingIndex = -1;      // index into zapList
    App.zapList = [];           // playable items for CH+/- (usually live)
    App.focusedIndex = 0;
    /* Accueil dashboard: focus rail | content rows */
    App.homeBrandFocused = false;
    App.homeFocus = { zone: 'rail', railIndex: 0, rowIndex: 0, itemIndex: 0 };
    App.homeRows = [];
    App.HOME_ROW_MAX = 14;
    App.HOME_RAIL = [
        { id: 'home', label: 'Accueil', action: 'home' },
        { id: 'live', label: 'En direct', action: 'type', type: 'live' },
        { id: 'guide', label: 'Guide TV', action: 'guide' },
        { id: 'vod', label: 'Films', action: 'type', type: 'vod' },
        { id: 'series', label: 'Séries', action: 'type', type: 'series' },
        { id: 'search', label: 'Recherche', action: 'search' },
        { id: 'profiles', label: 'Profil', action: 'profiles', section: 'secondary' },
        { id: 'settings', label: 'Réglages', action: 'settings' }
    ];
    App.catalogRefreshing = false;
    App.epgFocusIndex = 0;
    App.epgItems = [];
    App.infoTimer = null;
    App.streamQualityTimer = null;
    App.streamQualityTimer2 = null;
    App.toastTimer = null;

    /*
     * Menu levels (Smarters-style):
     *   types → categories → content → (series) seasons → episodes
     */
    App.listLevel = 'types';
    App.activeCategoryId = null;
    App.visibleIndices = [];
    App.listRows = [];
    App.expandedGroups = {};
    App.menuMemory = null;

    App.activeSeries = null;    // series list item
    App.seriesSeasons = [];     // from get_series_info
    App.activeSeason = null;    // { season, name, episodes }
    App.seriesLoading = false;


    App.TYPE_ROWS = [
        { type: 'live', label: 'TV' },
        { type: 'vod', label: 'Films' },
        { type: 'series', label: 'Séries' }
    ];

    var surfaceIds = {
        '$nextEpisodeCancel': 'next-episode-cancel',
        '$list': 'channel-list',
        '$listCol': 'channel-list-col',
        '$listBrand': 'channel-list-brand',
        '$listLogo': 'channel-list-logo',
        '$homeRail': 'home-rail',
        '$homeRailNav': 'home-rail-nav',
        '$browsePane': 'browse-pane',
        '$homeMain': 'home-main',
        '$homeRows': 'home-rows',
        '$homeDash': 'home-main',
        '$homeRefreshOverlay': 'home-refresh-overlay',
        '$listTitle': 'channel-list-title',
        '$listSub': 'channel-list-sub',
        '$listMode': 'channel-list-mode',
        '$listKeys': 'channel-list-keys',
        '$items': 'channel-items',
        '$browseDim': 'browse-dim',
        '$livePreview': 'live-preview',
        '$livePreviewViewport': 'live-preview-viewport',
        '$livePreviewPlaceholder': 'live-preview-placeholder',
        '$livePreviewName': 'live-preview-name',
        '$livePreviewEpg': 'live-preview-epg',
        '$infoBar': 'info-bar',
        '$infoName': 'info-name',
        '$infoMode': 'info-mode',
        '$infoQuality': 'info-quality',
        '$epgNow': 'epg-now',
        '$epgNext': 'epg-next',
        '$epgPanel': 'epg-panel',
        '$epgTitle': 'epg-panel-title',
        '$epgItems': 'epg-panel-items',
        '$toast': 'toast',
        '$subtitleOverlay': 'subtitle-overlay',
        '$tracksPanel': 'tracks-panel',
        '$tracksItems': 'tracks-items',
        '$search': 'search',
        '$searchMain': 'search-main',
        '$searchShellMeta': 'search-shell-meta',
        '$searchShellRows': 'search-shell-rows',
        '$settings': 'settings',
        '$settingXtreamServer': 'setting-xtream-server',
        '$settingXtreamUser': 'setting-xtream-user',
        '$settingXtreamPass': 'setting-xtream-pass',
        '$settingUrl': 'setting-url',
        '$settingEpg': 'setting-epg',
        '$settingSave': 'setting-save',
        '$settingRefresh': 'setting-refresh',
        '$settingCancel': 'setting-cancel',
        '$exit': 'exit-confirm',
        '$exitYes': 'exit-yes',
        '$exitNo': 'exit-no',
        '$vodControls': 'vod-controls',
        '$vodTitle': 'vod-controls-title',
        '$vodQuality': 'vod-quality',
        '$vodTimeCur': 'vod-time-cur',
        '$vodTimeDur': 'vod-time-dur',
        '$vodBar': 'vod-bar',
        '$vodBarFill': 'vod-bar-fill',
        '$vodBarBuf': 'vod-bar-buf',
        '$vodBarScrub': 'vod-bar-scrub',
        '$vodActionAspect': 'vod-action-aspect',
        '$vodActionSubs': 'vod-action-subs',
        '$vodActionFollow': 'vod-action-follow',
        '$vodPlayStatus': 'vod-play-status',
        '$vodPause': 'vod-pause-indicator',
        '$infoActionAspect': 'info-action-aspect',
        '$infoActionSubs': 'info-action-subs',
        '$infoActionFavorite': 'info-action-favorite',
        '$liveFavoritePopup': 'live-favorite-popup',
        '$liveFavoriteMessage': 'live-favorite-message',
        '$liveFavoriteConfirm': 'live-favorite-confirm',
        '$liveFavoriteCancel': 'live-favorite-cancel',
        '$resumeDialog': 'resume-dialog',
        '$resumeSub': 'resume-sub',
        '$resumeYes': 'resume-yes',
        '$resumeNo': 'resume-no',
        '$nextEpisodePrompt': 'next-episode-prompt',
        '$nextEpisodeBtn': 'next-episode-btn',
        '$nextEpisodeSub': 'next-episode-sub'
    };
    Object.keys(surfaceIds).forEach(function (key) { App[key] = document.getElementById(surfaceIds[key]); });
    App.$homeKeys = null;

    App.$searchQuery = document.getElementById('search-query-shell') ||
        document.getElementById('search-query');
    App.$searchScope = null;
    App.$searchScopeValue = null;
    App.$searchScopeHint = null;
    App.$searchResultsMeta = App.$searchShellMeta;
    App.$searchResults = null;
    App.searchEditing = false;
    App.searchScope = 'global';
    App.searchCanCategory = false;
    App.searchScopeLocked = false;
    App.searchCategoryId = null;
    App.searchCategoryLabel = '';
    App.searchResults = [];
    App.searchRows = [];
    App.searchShellFocus = { zone: 'query', rowIndex: 0, itemIndex: 0 };
    App.searchFocus = 0;
    App.searchDebounceTimer = null;


    App.settingsFocusables = [];
    App.refreshSettingsFocusables = function () {
        App.settingsFocusables = [];
        var raw = [
            App.$settingXtreamServer, App.$settingXtreamUser, App.$settingXtreamPass,
            App.$settingUrl, App.$settingEpg,
            App.$settingSave, App.$settingRefresh, App.$settingCancel
        ];
        for (var i = 0; i < raw.length; i++) {
            if (raw[i]) { App.settingsFocusables.push(raw[i]); }
        }
    };
    App.refreshSettingsFocusables();
    App.settingsFocus = 0;

    App.exitChoiceYes = true;

    /* VOD / episode controls */
    App.SEEK_STEP_SEC = 5; /* short press scrub step */
    App.SEEK_HOLD_MAX_SEC = 60;
    App.scrubHoldStart = 0;
    App.scrubHoldDir = 0;
    App.RESUME_MIN_SEC = 45;
    App.RESUME_END_MARGIN_SEC = 60;
    App.RESUME_END_RATIO = 0.9;
    App.VOD_BAR_HIDE_MS = 3500;
    App.NEXT_EPISODE_HIDE_MS = 60000;
    App.NEXT_EPISODE_REMAIN_SEC = 60;
    App.RESUME_SAVE_MS = 12000;
    App.CONTINUE_MAX = 18;
    App.FOLLOW_MAX = 40;
    App.RECENT_MAX = 50;
    App.RECENT_CAT_ID = '__recent__';
    App.POSTER_COLS = 7;
    App.POSTER_WINDOW_ROWS = 2; /* fallback; runtime uses getPosterWindowRows() */
    App.categoryCounts = { live: {}, vod: {}, series: {} };
    App.recentByType = { vod: [], series: [] };
    App.posterWindowStart = 0; /* first visible row index in poster grid */
    App.posterSource = []; /* flat cards for poster grid */
    App._posterSourceDirty = true;
    App.LIST_WINDOW_ROWS = 12; /* text list virtual window (categories, etc.) */
    App.listWindowStart = 0;
    App._listWindowDirty = true;
    App._uiRaf = 0;
    App._uiRafFn = null;
    /* Home card layout constants (match CSS .home-card / .home-row) */
    App.HOME_CARD_W = 168;
    App.HOME_CARD_LIVE_W = 148;
    App.HOME_CARD_GAP = 16;
    App.HOME_ROW_EST_H = 320;

    /* Coalesce UI work to one paint per frame (Tizen key-repeat). */
    App.scheduleUi = function (fn) {
        App._uiRafFn = fn;
        if (App._uiRaf) { return; }
        var raf = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : function (cb) { return setTimeout(cb, 16); };
        App._uiRaf = raf(function () {
            App._uiRaf = 0;
            var f = App._uiRafFn;
            App._uiRafFn = null;
            if (typeof f === 'function') { f(); }
        });
    };

    App.markPosterSourceDirty = function () {
        App._posterSourceDirty = true;
    };

    App.markListWindowDirty = function () {
        App._listWindowDirty = true;
    };
    App.resumeSnap = null; /* resume map snapshot for one render pass */
    App.continueFilter = null; /* null | 'vod' | 'series' for Continue watching */
    App.recentIndices = []; /* indices into App.channels for "Derniers ajouts" */
    App.openedFromFavorites = false; /* series opened from ★ Favoris → back to that list */


    App.vodBarVisible = false;
    App.vodBarTimer = null;
    App.nextEpisodeTimer = null;
    App.resumeSaveTimer = null;
    App.pendingSeekSec = null;
    App.resumeChoiceYes = true;
    App.resumePending = null; /* { item, preferredKind, pos } */
    App.nextEpisodePending = null; /* { item, season } */
    App.nextEpisodeLive = false; /* CTA shown during playback, still in watch */
    App.nextEpisodeDismissed = false;
    App.lastKnownPos = 0;
    App.lastKnownDur = 0;
    App.playFlashTimer = null;
    App.settingsReturnState = 'browse';
    App.tracksRows = [];
    App.tracksFocus = 0;
    App.tracksPrevState = 'watch';
    App.vodFocus = 'seek'; /* 'seek' | 'aspect' | 'subs' | 'follow' */
    App.infoFocus = 'aspect'; /* 'aspect' | 'subs' | 'favorite' — live overlay actions */
    App.liveFavoriteFocus = 'confirm';
    App.scrubTargetSec = null; /* null = follow live position; number = scrubbing */

    /* Restore file → memory/localStorage/preference when WebStorage was wiped (debug reinstall). */
})(App);
