/* Resume map + Continue watching */
var App = App || {};
(function (App) {
    'use strict';
    var cachedRaw = null;
    var cachedMap = {};
    var lookupMap = null;
    var lookupIndex = null;

    /* ---------- VOD / episode: progress, pause, resume ---------- */

    App.isSeekableItem = function (item) {
        return !!(item && (item.kind === 'vod' || item.kind === 'episode'));
    }

    App.isSeekablePlaying = function () {
        return App.isSeekableItem(App.playingItem());
    }

    App.resumeKeyFor = function (item) {
        if (!item) { return ''; }
        if (item.kind === 'vod' && item.id) { return 'vod:' + item.id; }
        if (item.kind === 'episode' && item.id) { return 'episode:' + item.id; }
        if (item.url) { return 'url:' + item.url; }
        return '';
    }

    App.loadResumeMap = function () {
        var raw = App.getProfileValue ? App.getProfileValue(Storage.KEYS.resumeMap)
            : Storage.get(Storage.KEYS.resumeMap);
        if (raw === cachedRaw) { return cachedMap; }
        cachedRaw = raw;
        lookupMap = null;
        try {
            var obj = raw ? JSON.parse(raw) : {};
            cachedMap = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
        } catch (e) {
            cachedMap = {};
        }
        return cachedMap;
    }

    App.beginResumeSnap = function () {
        App.resumeSnap = App.loadResumeMap();
    }

    App.endResumeSnap = function () {
        App.resumeSnap = null;
    }

    App.currentResumeMap = function () {
        return App.resumeSnap || App.loadResumeMap();
    }

    App.saveResumeMap = function (map) {
        map = map || {};
        var keys = Object.keys(map);
        var limit = App.RESUME_HISTORY_MAX || 1000;
        if (keys.length > limit) {
            keys.sort(function (a, b) {
                var ea = map[a] || {}, eb = map[b] || {};
                if (!!ea.done !== !!eb.done) { return ea.done ? 1 : -1; }
                return (Number(eb.at) || 0) - (Number(ea.at) || 0);
            });
            for (var i = limit; i < keys.length; i++) { delete map[keys[i]]; }
        }
        try {
            if (App.setProfileValue) {
                App.setProfileValue(Storage.KEYS.resumeMap, JSON.stringify(map || {}));
            } else {
                Storage.set(Storage.KEYS.resumeMap, JSON.stringify(map || {}));
            }
        } catch (e) {}
        App.resumeSnap = null;
        cachedRaw = null;
        lookupMap = null;
    }

    App.isResumeDone = function (entry) {
        if (!entry) { return false; }
        if (entry.done) { return true; }
        var pos = Number(entry.pos);
        var dur = Number(entry.dur);
        if (!(pos > 0) || !(dur > 0)) { return false; }
        return pos >= dur * App.RESUME_END_RATIO || pos >= dur - App.RESUME_END_MARGIN_SEC;
    }

    App.normalizeResumeEntry = function (raw) {
        if (!raw || typeof raw !== 'object') { return null; }
        var queued = !!raw.queued;
        var pos = Number(raw.pos);
        if (!isFinite(pos) || pos < 0) { return null; }
        /* Queued next-episode rows may sit at ~0; others need a real position. */
        if (pos <= 0) {
            if (!queued) { return null; }
            pos = 1;
        }
        var dur = Number(raw.dur) > 0 ? Number(raw.dur) : 0;
        var entry = {
            pos: pos,
            dur: dur,
            at: Number(raw.at) > 0 ? Number(raw.at) : 0,
            done: !!raw.done,
            queued: queued,
            title: raw.title ? String(raw.title) : '',
            kind: raw.kind ? String(raw.kind) : '',
            id: raw.id != null ? String(raw.id) : '',
            url: raw.url ? String(raw.url) : '',
            seriesId: raw.seriesId != null ? String(raw.seriesId) : '',
            seriesTitle: raw.seriesTitle ? String(raw.seriesTitle) : '',
            season: raw.season != null && raw.season !== '' ? String(raw.season) : '',
            episode: raw.episode != null && raw.episode !== '' ? raw.episode : '',
            ext: raw.ext ? String(raw.ext) : ''
        };
        if (!entry.done && App.isResumeDone(entry)) { entry.done = true; }
        if (entry.done) { entry.queued = false; }
        return entry;
    }

    App.getResumeEntry = function (item) {
        if (!item) { return null; }
        var map = App.currentResumeMap();
        var key = App.resumeKeyFor(item);
        if (key && map[key]) {
            return App.normalizeResumeEntry(map[key]);
        }
        /* Index legacy URL/id entries once, not once per episode button. */
        if (lookupMap !== map) {
            lookupIndex = Object.create(null);
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) { continue; }
                var e = App.normalizeResumeEntry(map[k]);
                if (!e) { continue; }
                if (e.id) { lookupIndex[(e.kind || '') + ':' + e.id] = e; }
                if (e.url) { lookupIndex['url:' + e.url] = e; }
            }
            lookupMap = map;
        }
        return (item.id && (lookupIndex[(item.kind || '') + ':' + item.id] || lookupIndex[':' + item.id])) ||
            (item.url && lookupIndex['url:' + item.url]) || null;
    }

    App.clearResumeKey = function (key) {
        if (!key) { return false; }
        var map = App.loadResumeMap();
        if (!Object.prototype.hasOwnProperty.call(map, key)) { return false; }
        delete map[key];
        App.saveResumeMap(map);
        return true;
    }

    App.clearResumeEntry = function (item) {
        var key = App.resumeKeyFor(item);
        if (!key) { return; }
        App.clearResumeKey(key);
    }

    App.markResumeCompleted = function (item) {
        if (!App.isSeekableItem(item)) { return; }
        var key = App.resumeKeyFor(item);
        if (!key) { return; }
        var existing = App.getResumeEntry(item);
        var dur = Player.getDuration() || App.lastKnownDur || (existing && existing.dur) || 0;
        var pos = dur || Player.getPosition() || App.lastKnownPos || (existing && existing.pos) || 1;
        var map = App.loadResumeMap();
        map[key] = App.buildResumePayload(item, pos, dur, true);
        App.saveResumeMap(map);
    };

    App.removeContinueEntry = function (entry) {
        if (!entry) { return false; }
        var key = entry.key || '';
        if (!key) {
            if (entry.kind === 'vod' && entry.id) { key = 'vod:' + entry.id; }
            else if (entry.kind === 'episode' && entry.id) { key = 'episode:' + entry.id; }
            else if (entry.url) { key = 'url:' + entry.url; }
        }
        if (!key || !App.clearResumeKey(key)) {
            App.toast('Impossible de supprimer');
            return false;
        }
        App.toast('Retiré de Continuer à regarder');
        return true;
    }

    App.shouldOfferResume = function (entry) {
        if (!entry || entry.done || !(entry.pos >= App.RESUME_MIN_SEC)) { return false; }
        if (entry.dur > 0) {
            if (entry.pos >= entry.dur * App.RESUME_END_RATIO) { return false; }
            if (entry.pos >= entry.dur - App.RESUME_END_MARGIN_SEC) { return false; }
        }
        return true;
    }

    App.seriesTitleForId = function (seriesId) {
        if (!seriesId) { return ''; }
        if (App.activeSeries && String(App.activeSeries.seriesId) === String(seriesId) &&
            App.activeSeries.name) {
            return String(App.activeSeries.name);
        }
        var series = typeof App.catalogItems === 'function' ? App.catalogItems('series') : [];
        var i;
        for (i = 0; i < series.length; i++) {
            if (series[i] && String(series[i].seriesId) === String(seriesId) && series[i].name) {
                return String(series[i].name);
            }
        }
        return '';
    };

    App.enrichEpisodeMeta = function (item) {
        if (!item || item.kind !== 'episode') { return item; }
        if (!item.seriesId && App.activeSeries && App.activeSeries.seriesId) {
            item.seriesId = String(App.activeSeries.seriesId);
        }
        if (!item.seriesTitle) {
            item.seriesTitle = App.seriesTitleForId(item.seriesId) || '';
        }
        return item;
    };

    App.buildResumePayload = function (ch, pos, dur, done) {
        if (ch && ch.kind === 'episode') { App.enrichEpisodeMeta(ch); }
        var entry = {
            pos: Math.floor(pos),
            dur: Math.floor(dur || 0),
            at: Date.now(),
            done: !!done,
            queued: false,
            title: ch.name || '',
            kind: ch.kind || '',
            id: ch.id != null ? String(ch.id) : '',
            /* Xtream URLs embed credentials; IDs are sufficient to restore those rows. */
            url: ch.id ? '' : (ch.url || ''),
            ext: ch.extension ? String(ch.extension) : ''
        };
        if (ch.kind === 'episode') {
            entry.seriesId = ch.seriesId || '';
            entry.seriesTitle = ch.seriesTitle || '';
            entry.season = ch.season != null ? String(ch.season) : '';
            entry.episode = ch.episodeNum != null ? ch.episodeNum : '';
        }
        return entry;
    }

    /* One Continue watching card per series: drop older episodes of the same show. */
    App.markOtherSeriesEpisodesDone = function (keepItem) {
        if (!keepItem || keepItem.kind !== 'episode' || !keepItem.seriesId) { return; }
        var keepKey = App.resumeKeyFor(keepItem);
        var sid = String(keepItem.seriesId);
        var map = App.loadResumeMap();
        var changed = false;
        var k;
        for (k in map) {
            if (!Object.prototype.hasOwnProperty.call(map, k)) { continue; }
            if (keepKey && k === keepKey) { continue; }
            var e = App.normalizeResumeEntry(map[k]);
            if (!e || e.kind !== 'episode' || e.done) { continue; }
            if (String(e.seriesId) !== sid) { continue; }
            e.done = true;
            e.queued = false;
            map[k] = e;
            changed = true;
        }
        if (changed) { App.saveResumeMap(map); }
    };

    /* As soon as a series episode starts, put it in Continuer à regarder. */
    App.seedContinueWatching = function (item, startAt) {
        if (!item || item.kind !== 'episode') { return false; }
        App.enrichEpisodeMeta(item);
        var key = App.resumeKeyFor(item);
        if (!key) { return false; }
        var map = App.loadResumeMap();
        var existing = App.normalizeResumeEntry(map[key]);
        var pos = Math.floor(Number(startAt) || 0);
        if (!(pos >= 1)) { pos = 1; }
        if (existing && !existing.done && existing.pos >= App.RESUME_MIN_SEC) {
            existing.at = Date.now();
            map[key] = existing;
            App.saveResumeMap(map);
            App.markOtherSeriesEpisodesDone(item);
            return true;
        }
        var entry = App.buildResumePayload(item, pos, existing && existing.dur ? existing.dur : 0, false);
        if (pos < App.RESUME_MIN_SEC) { entry.queued = true; }
        map[key] = entry;
        App.saveResumeMap(map);
        App.markOtherSeriesEpisodesDone(item);
        return true;
    };

    /* After an episode ends: put the next one in Continue watching (start / queued). */
    App.queueNextEpisodeResume = function (nextItem) {
        if (!nextItem || nextItem.kind !== 'episode') { return false; }
        App.enrichEpisodeMeta(nextItem);
        var key = App.resumeKeyFor(nextItem);
        if (!key) { return false; }

        var map = App.loadResumeMap();
        var existing = App.normalizeResumeEntry(map[key]);
        if (existing && !existing.done && existing.pos >= App.RESUME_MIN_SEC) {
            /* Already mid-episode — keep progress, bump recency for Continue watching. */
            existing.at = Date.now();
            existing.queued = false;
            map[key] = existing;
            App.saveResumeMap(map);
            App.markOtherSeriesEpisodesDone(nextItem);
            return true;
        }

        var entry = App.buildResumePayload(nextItem, 1, 0, false);
        entry.queued = true;
        map[key] = entry;
        App.saveResumeMap(map);
        App.markOtherSeriesEpisodesDone(nextItem);
        return true;
    }

    App.persistResumePosition = function (force) {
        var ch = App.playingItem();
        if (!App.isSeekableItem(ch)) { return; }
        var pos = Player.getPosition();
        var dur = Player.getDuration();
        if (!(pos > 0) && App.lastKnownPos > 0) { pos = App.lastKnownPos; }
        if (!(dur > 0) && App.lastKnownDur > 0) { dur = App.lastKnownDur; }
        if (!(pos >= 1)) { return; }

        var key = App.resumeKeyFor(ch);
        if (!key) { return; }
        if (App._endedResumeKey && key === App._endedResumeKey) { return; }
        var nearEnd = dur > 0 &&
            (pos >= dur * App.RESUME_END_RATIO || pos >= dur - App.RESUME_END_MARGIN_SEC);

        if (nearEnd) {
            var mapDone = App.loadResumeMap();
            mapDone[key] = App.buildResumePayload(ch, Math.min(pos, dur || pos), dur, true);
            App.saveResumeMap(mapDone);
            /* Swap Continue watching to the next episode before / as this one ends. */
            if (ch.kind === 'episode' && typeof App.advanceSeriesResume === 'function') {
                App.advanceSeriesResume(ch);
            }
            return;
        }

        var map = App.loadResumeMap();
        var prev = App.normalizeResumeEntry(map[key]);
        /* Episodes appear in Continue watching immediately; films still need the threshold. */
        if (!force && pos < App.RESUME_MIN_SEC) {
            if (ch.kind !== 'episode' && !(prev && prev.queued)) { return; }
        }

        var entry = App.buildResumePayload(ch, pos, dur, false);
        /* Keep queued until real progress so Continue watching stays populated. */
        if ((prev && prev.queued && pos < App.RESUME_MIN_SEC) ||
            (ch.kind === 'episode' && pos < App.RESUME_MIN_SEC)) {
            entry.queued = true;
        }
        map[key] = entry;
        App.saveResumeMap(map);
    }

    App.formatMinutesLeft = function (entry) {
        if (!entry || !(entry.dur > 0) || !(entry.pos >= 0)) { return ''; }
        var left = Math.max(0, Math.round((entry.dur - entry.pos) / 60));
        if (left <= 0) { return ''; }
        if (left >= 60) {
            var h = Math.floor(left / 60);
            var m = left % 60;
            return m > 0 ? (h + ' h ' + m + ' min') : (h + ' h');
        }
        return left + ' min';
    }

    App.seasonEpisodeLabel = function (entry) {
        if (!entry) { return ''; }
        if (!entry.season) { return ''; }
        var s = 'S' + entry.season;
        if (entry.episode != null && entry.episode !== '') {
            s += ' E' + entry.episode;
        }
        return s;
    }

    App.watchProgressUi = function (entry, opts) {
        if (!entry) { return null; }
        opts = opts || {};
        var done = App.isResumeDone(entry);
        var pct = (entry.dur > 0)
            ? Math.min(100, Math.max(1, Math.round((entry.pos / entry.dur) * 100)))
            : 0;
        var label;
        if (opts.seriesStyle) {
            var se = App.seasonEpisodeLabel(entry);
            if (done) {
                label = se ? (se + ' · Vu') : 'Vu';
            } else if (entry.queued && !(entry.pos >= App.RESUME_MIN_SEC)) {
                label = se ? (se + ' · À suivre') : 'À suivre';
            } else {
                var left = App.formatMinutesLeft(entry);
                label = se ? (se + (left ? ' · ' + left : '')) : (left || 'En cours');
            }
        } else if (done) {
            label = 'Vu';
        } else if (entry.queued && !(entry.pos >= App.RESUME_MIN_SEC)) {
            label = 'À suivre';
        } else {
            label = App.formatMinutesLeft(entry) || 'En cours';
        }
        return { label: label, pct: done ? 100 : pct, done: done };
    }

    App.appendWatchProgress = function (li, entry, opts) {
        var ui = App.watchProgressUi(entry, opts);
        if (!ui) { return; }
        if (li.className.indexOf('has-progress') < 0) {
            li.className += (li.className ? ' ' : '') + 'has-progress';
        }
        if (ui.done && li.className.indexOf('watch-done') < 0) {
            li.className += ' watch-done';
        }
        var badge = document.createElement('span');
        badge.className = 'watch-badge' + (ui.done ? ' is-done' : ' is-progress');
        badge.textContent = ui.label;
        li.appendChild(badge);
        if (ui.pct > 0 && !ui.done) {
            var bar = document.createElement('span');
            bar.className = 'watch-progress';
            var fill = document.createElement('i');
            fill.style.width = ui.pct + '%';
            bar.appendChild(fill);
            li.appendChild(bar);
        }
    }

    App.bestSeriesResume = function (seriesId) {
        if (!seriesId) { return null; }
        var map = App.currentResumeMap();
        var bestInProgress = null;
        var bestDone = null;
        var sid = String(seriesId);
        for (var key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) { continue; }
            var e = App.normalizeResumeEntry(map[key]);
            if (!e || e.kind !== 'episode') { continue; }
            if (String(e.seriesId) !== sid) { continue; }
            if (e.done) {
                if (!bestDone || (e.at || 0) > (bestDone.at || 0)) { bestDone = e; }
            } else if (e.pos >= 1) {
                if (!bestInProgress || (e.at || 0) > (bestInProgress.at || 0)) {
                    bestInProgress = e;
                }
            }
        }
        return bestInProgress || bestDone;
    }

    App.bestSeasonResume = function (seasonObj) {
        if (!seasonObj || !seasonObj.episodes) { return null; }
        var bestInProgress = null;
        var bestDone = null;
        for (var i = 0; i < seasonObj.episodes.length; i++) {
            var e = App.getResumeEntry(seasonObj.episodes[i]);
            if (!e) { continue; }
            if (e.done) {
                if (!bestDone || (e.at || 0) > (bestDone.at || 0)) { bestDone = e; }
            } else if (e.pos >= 1) {
                if (!bestInProgress || (e.at || 0) > (bestInProgress.at || 0)) {
                    bestInProgress = e;
                }
            }
        }
        return bestInProgress || bestDone;
    }

    App.listContinueEntries = function (kindFilter) {
        var map = App.currentResumeMap();
        var list = [];
        for (var key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) { continue; }
            var e = App.normalizeResumeEntry(map[key]);
            if (!e || e.done) { continue; }
            /* In-progress (≥ threshold) or queued next episode after series ended. */
            if (!e.queued && !(e.pos >= App.RESUME_MIN_SEC)) { continue; }
            if (!e.kind) {
                if (key.indexOf('vod:') === 0) { e.kind = 'vod'; }
                else if (key.indexOf('episode:') === 0) { e.kind = 'episode'; }
            }
            if (kindFilter === 'vod' && e.kind !== 'vod') { continue; }
            if (kindFilter === 'series' && e.kind !== 'episode') { continue; }
            if (e.kind !== 'vod' && e.kind !== 'episode') { continue; }
            e.key = key;
            list.push(e);
        }
        list.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        /* One card per series (most recent episode / queued next). */
        var seenSeries = {};
        var collapsed = [];
        var i;
        for (i = 0; i < list.length; i++) {
            var row = list[i];
            if (row.kind === 'episode' && row.seriesId) {
                var sid = String(row.seriesId);
                if (seenSeries[sid]) { continue; }
                seenSeries[sid] = true;
            }
            collapsed.push(row);
        }
        return collapsed.slice(0, App.CONTINUE_MAX);
    }

    App.continueItemLabel = function (entry) {
        if (!entry) { return ''; }
        var clean = typeof App.displayCatalogTitle === 'function'
            ? App.displayCatalogTitle : function (s) { return String(s || ''); };
        if (entry.kind === 'episode') {
            var name = clean(entry.seriesTitle || entry.title || 'Épisode');
            var se = App.seasonEpisodeLabel(entry);
            return se ? (name + ' · ' + se) : name;
        }
        return clean(entry.title || 'Film');
    }

    App.itemFromResumeEntry = function (entry) {
        if (!entry) { return null; }
        var i;
        var ext = (entry.ext || 'mp4').replace(/^\./, '');
        var base = App.xtreamCreds && App.xtreamCreds.base;
        var user = App.xtreamCreds && App.xtreamCreds.username;
        var pass = App.xtreamCreds && App.xtreamCreds.password;

        if (entry.kind === 'vod') {
            var vods = (App.catalog.vod && App.catalog.vod.items) || [];
            for (i = 0; i < vods.length; i++) {
                if (entry.id && String(vods[i].id) === String(entry.id)) { return vods[i]; }
                if (entry.url && vods[i].url === entry.url) { return vods[i]; }
            }
            /* Rebuild playable item from Xtream ids when catalogue miss / stale URL. */
            if (entry.id && base && user && pass && typeof Xtream.movieUrl === 'function') {
                return {
                    kind: 'vod',
                    id: String(entry.id),
                    streamId: String(entry.id),
                    url: Xtream.movieUrl(base, user, pass, entry.id, ext),
                    name: entry.title || 'Film',
                    extension: ext
                };
            }
            if (entry.url) {
                return {
                    kind: 'vod',
                    id: entry.id || '',
                    url: entry.url,
                    name: entry.title || 'Film',
                    extension: ext
                };
            }
            return null;
        }
        if (entry.kind === 'episode') {
            if (entry.id && base && user && pass && typeof Xtream.seriesEpisodeUrl === 'function') {
                return {
                    kind: 'episode',
                    id: String(entry.id),
                    episodeId: String(entry.id),
                    url: Xtream.seriesEpisodeUrl(base, user, pass, entry.id, ext),
                    name: entry.title || 'Épisode',
                    season: entry.season || '',
                    episodeNum: entry.episode,
                    seriesId: entry.seriesId || '',
                    seriesTitle: entry.seriesTitle || '',
                    extension: ext
                };
            }
            if (entry.url) {
                return {
                    kind: 'episode',
                    id: entry.id || '',
                    url: entry.url,
                    name: entry.title || 'Épisode',
                    season: entry.season || '',
                    episodeNum: entry.episode,
                    seriesId: entry.seriesId || '',
                    seriesTitle: entry.seriesTitle || '',
                    extension: ext
                };
            }
        }
        return null;
    }

    App.countContinueEntries = function (kindFilter) {
        return App.listContinueEntries(kindFilter).length;
    }

    App.startResumeSaveLoop = function () {
        App.stopResumeSaveLoop();
        if (!App.isSeekablePlaying()) { return; }
        App.resumeSaveTimer = setInterval(function () {
            if (!App.backgroundSuspended && App.isSeekablePlaying() && !Player.isPaused()) {
                App.persistResumePosition(false);
            }
        }, App.RESUME_SAVE_MS);
    }

    App.stopResumeSaveLoop = function () {
        if (App.resumeSaveTimer) {
            clearInterval(App.resumeSaveTimer);
            App.resumeSaveTimer = null;
        }
    }
})(App);
