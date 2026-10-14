/* People share a provider, never a watch history. Default retains existing data. */
var App = App || {};
(function (App) {
    'use strict';
    var viewerRaw = null, viewerCache = null;
    App.viewerPresets = [
        { name: 'VF · sans sous-titres', audio: 'fr', subtitles: 'off' },
        { name: 'VOSTFR', audio: 'original', subtitles: 'fr' },
        { name: 'VF · sous-titres français', audio: 'fr', subtitles: 'fr' },
        { name: 'VO · sans sous-titres', audio: 'original', subtitles: 'off' }
    ];
    App.loadViewers = function () {
        var data;
        var raw = Storage.get(Storage.KEYS.viewers) || '';
        var defaults = (Storage.get(Storage.KEYS.prefAudioLang) || 'fr') + '|' +
            (Storage.get(Storage.KEYS.prefSubLang) || 'off');
        var cacheKey = raw || defaults;
        if (cacheKey === viewerRaw && viewerCache) { return viewerCache; }
        try { data = JSON.parse(raw || 'null'); } catch (e) {}
        if (!data || !Array.isArray(data.list) || !data.list.length) {
            data = { active: 'default', list: [{ id: 'default', name: 'Maison',
                audio: Storage.get(Storage.KEYS.prefAudioLang) || 'fr',
                subtitles: Storage.get(Storage.KEYS.prefSubLang) || 'off', autoplay: false }] };
        }
        viewerRaw = cacheKey; viewerCache = data;
        return data;
    };
    App.currentViewer = function () {
        var data = App.loadViewers();
        for (var i = 0; i < data.list.length; i++) {
            if (data.list[i].id === data.active) { return data.list[i]; }
        }
        return data.list[0];
    };
    App.updateViewer = function (changes) {
        var data = App.loadViewers();
        var id = App.currentViewer().id;
        data.list.forEach(function (p) {
            if (p.id !== id) { return; }
            ['name', 'audio', 'subtitles', 'autoplay'].forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(changes, key)) { p[key] = changes[key]; }
            });
        });
        Storage.set(Storage.KEYS.viewers, JSON.stringify(data));
    };
    App.addViewer = function (name) {
        name = String(name || '').trim().slice(0, 24);
        if (!name) { return null; }
        var data = App.loadViewers();
        if (data.list.length >= 8) { App.toast('8 profils maximum'); return null; }
        var id = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        data.list.push({ id: id, name: name, audio: 'fr', subtitles: 'off', autoplay: false });
        Storage.set(Storage.KEYS.viewers, JSON.stringify(data));
        return id;
    };
    App.switchViewer = function (id) {
        var data = App.loadViewers();
        if (!data.list.some(function (p) { return p.id === id; })) { return false; }
        if (App.currentViewer().id === id) { return true; }
        /* Complete the legacy household migration before selecting a new person. */
        var household = App.catalogSourceFingerprint();
        [Storage.KEYS.resumeMap, Storage.KEYS.favChannels, Storage.KEYS.favSeries,
            Storage.KEYS.searchHistory, Storage.KEYS.followedSeries].forEach(function (key) {
            Storage.getScoped(key, household);
        });
        if (App.playingItem() && App.isSeekablePlaying()) { App.persistResumePosition(true); }
        App.stopResumeSaveLoop();
        App.hideNextEpisodePrompt(false);
        if (App.stopLivePreview) { App.stopLivePreview(); }
        Player.stop();
        App.playingIndex = -1;
        App.livePreviewActive = false;
        App.previousLive = null;
        App.pendingSeekSec = null;
        App.resumeSnap = null;
        App.activeSeries = null;
        App.activeSeason = null;
        App.seriesSeasons = [];
        App._seriesCtxToken = (App._seriesCtxToken || 0) + 1;
        App._seriesCtxLoading = '';
        App._seriesCtxWaiters = [];
        App._followGeneration = (App._followGeneration || 0) + 1;
        App._followRefreshBusy = false;
        App._followRefreshAgain = null;
        clearTimeout(App._followRefreshTimer);
        if (App._followRequestCancel) { App._followRequestCancel(); App._followRequestCancel = null; }
        data.active = id;
        Storage.set(Storage.KEYS.viewers, JSON.stringify(data));
        App.markPosterSourceDirty();
        App.markListWindowDirty();
        App.uiState = 'browse';
        App.setExclusiveOverlays({ list: true, dim: true });
        App.openTypes({ homeZone: 'content', homeRowIndex: 0, homeItemIndex: 0 });
        App.scheduleFollowedSeriesRefresh({ rebuildHome: true });
        return true;
    };
    App.viewerPresetLabel = function () {
        var p = App.currentViewer();
        for (var i = 0; i < App.viewerPresets.length; i++) {
            var preset = App.viewerPresets[i];
            if (p.audio === preset.audio && p.subtitles === preset.subtitles) { return preset.name; }
        }
        return 'Personnalisé · ' + p.audio + ' / ' + p.subtitles;
    };
    App.personalizedAdditions = function (max) {
        var categories = Object.create(null);
        var resume = App.loadResumeMap();
        var watched = Object.create(null);
        Object.keys(resume).forEach(function (key) {
            var rec = resume[key];
            if (!rec) { return; }
            if (rec.kind === 'vod') { watched['vod:' + rec.id] = true; }
            if (rec.seriesId) { watched['series:' + rec.seriesId] = true; }
        });
        App.loadFollowedSeries().forEach(function (rec) { watched['series:' + rec.seriesId] = true; });
        ['vod', 'series'].forEach(function (type) {
            App.catalogItems(type).forEach(function (item) {
                if (watched[type + ':' + (item.seriesId || item.id)] && item.categoryId) {
                    categories[type + ':' + item.categoryId] = true;
                }
            });
        });
        var out = [];
        ['vod', 'series'].forEach(function (type) {
            App.listRecentForType(type, 50).forEach(function (item) {
                if (out.length >= max || !categories[type + ':' + item.categoryId] ||
                    watched[type + ':' + (item.seriesId || item.id)]) { return; }
                out.push({ kind: type, item: item, title: App.displayCatalogTitle(item.name),
                    logo: item.logo || '', meta: 'Selon vos contenus regardés et suivis' });
            });
        });
        return out;
    };
})(App);
