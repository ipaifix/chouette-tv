/* Followed series: next unwatched / newly released → Continuer à regarder */
var App = App || {};
(function (App) {
    'use strict';

    var followCache = null; /* { list: [] } */
    var followScope = '';

    function parseFollowedList(raw) {
        if (!raw) { return []; }
        try {
            var arr = JSON.parse(raw);
            if (Object.prototype.toString.call(arr) !== '[object Array]') { return []; }
            var out = [];
            var i;
            for (i = 0; i < arr.length; i++) {
                var e = arr[i];
                if (!e || typeof e !== 'object') { continue; }
                var sid = e.seriesId != null ? String(e.seriesId) : '';
                if (!sid) { continue; }
                var seen = [];
                var ids = e.seenIds;
                var s;
                if (Object.prototype.toString.call(ids) === '[object Array]') {
                    for (s = 0; s < ids.length; s++) {
                        if (ids[s]) { seen.push(String(ids[s])); }
                    }
                }
                out.push({
                    seriesId: sid,
                    name: e.name ? String(e.name) : '',
                    logo: e.logo ? String(e.logo) : '',
                    seenIds: seen,
                    at: Number(e.at) > 0 ? Number(e.at) : 0
                });
            }
            return out;
        } catch (err) {
            return [];
        }
    }

    App.loadFollowedSeries = function () {
        var scope = App.profileScope ? App.profileScope() : '';
        if (followCache && followScope === scope) { return followCache.list; }
        followScope = scope;
        var raw = App.getProfileValue ? App.getProfileValue(Storage.KEYS.followedSeries)
            : Storage.get(Storage.KEYS.followedSeries);
        followCache = { list: parseFollowedList(raw) };
        return followCache.list;
    };

    App.saveFollowedSeries = function (list) {
        followCache = { list: list || [] };
        followScope = App.profileScope ? App.profileScope() : '';
        try {
            if (App.setProfileValue) {
                App.setProfileValue(Storage.KEYS.followedSeries, JSON.stringify(followCache.list));
            } else {
                Storage.set(Storage.KEYS.followedSeries, JSON.stringify(followCache.list));
            }
        } catch (e) {}
    };

    App.seriesIdFromItem = function (item) {
        if (!item) { return ''; }
        if (item.seriesId) { return String(item.seriesId); }
        if (item.kind === 'series' && item.id) { return String(item.id); }
        if (App.activeSeries && App.activeSeries.seriesId) {
            return String(App.activeSeries.seriesId);
        }
        return '';
    };

    App.seriesRecordForEpisode = function (item) {
        var sid = App.seriesIdFromItem(item);
        if (!sid) { return null; }
        var catalog = typeof App.catalogItems === 'function' ? App.catalogItems('series') : [];
        var i;
        for (i = 0; i < catalog.length; i++) {
            if (catalog[i] && String(catalog[i].seriesId) === sid) {
                return catalog[i];
            }
        }
        if (App.activeSeries && String(App.activeSeries.seriesId) === sid) {
            return App.activeSeries;
        }
        return {
            kind: 'series',
            seriesId: sid,
            name: (item && item.seriesTitle) || App.seriesTitleForId(sid) || '',
            logo: ''
        };
    };

    App.isFollowedSeries = function (item) {
        var sid = App.seriesIdFromItem(item);
        if (!sid) { return false; }
        var list = App.loadFollowedSeries();
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].seriesId) === sid) { return true; }
        }
        return false;
    };

    App.getFollowedSeriesEntry = function (seriesId) {
        if (!seriesId) { return null; }
        var sid = String(seriesId);
        var list = App.loadFollowedSeries();
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].seriesId) === sid) { return list[i]; }
        }
        return null;
    };

    App.flattenSeriesEpisodes = function (seasons) {
        var out = [];
        var s;
        var e;
        var eps;
        seasons = seasons || [];
        for (s = 0; s < seasons.length; s++) {
            eps = (seasons[s] && seasons[s].episodes) || [];
            for (e = 0; e < eps.length; e++) {
                if (eps[e] && (eps[e].id || eps[e].url)) { out.push(eps[e]); }
            }
        }
        return out;
    };

    App.episodeIdList = function (episodes) {
        var ids = [];
        var i;
        for (i = 0; i < episodes.length; i++) {
            if (episodes[i] && episodes[i].id) { ids.push(String(episodes[i].id)); }
        }
        return ids;
    };

    /* Next episode after the last fully watched one. Null if still in progress. */
    App.findFollowContinueEpisode = function (seasons, seriesId) {
        var eps = App.flattenSeriesEpisodes(seasons);
        if (!eps.length) { return null; }
        var lastDoneIdx = -1;
        var inProgress = false;
        var i;
        var rec;
        for (i = 0; i < eps.length; i++) {
            rec = typeof App.getResumeEntry === 'function' ? App.getResumeEntry(eps[i]) : null;
            if (rec && rec.done) {
                lastDoneIdx = i;
            } else if (rec && !rec.done && (rec.queued || rec.pos >= 1)) {
                inProgress = true;
            }
        }
        if (inProgress) { return null; }
        if (lastDoneIdx + 1 < eps.length) { return eps[lastDoneIdx + 1]; }
        return null;
    };

    App.updateFollowedSeenIds = function (seriesId, seenIds, extra) {
        var list = App.loadFollowedSeries().slice();
        var sid = String(seriesId);
        var i;
        for (i = 0; i < list.length; i++) {
            if (!list[i] || String(list[i].seriesId) !== sid) { continue; }
            list[i].seenIds = seenIds || [];
            if (extra && extra.name) { list[i].name = extra.name; }
            list[i].at = Date.now();
            App.saveFollowedSeries(list);
            return;
        }
    };

    App.applyFollowedSeasons = function (seriesItem, seasons, opts) {
        opts = opts || {};
        var sid = App.seriesIdFromItem(seriesItem);
        if (!sid || !App.isFollowedSeries(seriesItem)) {
            return { queued: false, isNew: false };
        }
        var eps = App.flattenSeriesEpisodes(seasons);
        var ids = App.episodeIdList(eps);
        var entry = App.getFollowedSeriesEntry(sid);
        var prev = (entry && entry.seenIds) || [];
        var prevMap = {};
        var i;
        for (i = 0; i < prev.length; i++) { prevMap[prev[i]] = true; }
        var isNew = false;
        if (prev.length) {
            for (i = 0; i < ids.length; i++) {
                if (!prevMap[ids[i]]) { isNew = true; break; }
            }
        }
        var next = App.findFollowContinueEpisode(seasons, sid);
        var queued = false;
        if (next && next.url && typeof App.queueNextEpisodeResume === 'function') {
            if (typeof App.enrichEpisodeMeta === 'function') { App.enrichEpisodeMeta(next); }
            if (!next.seriesTitle && seriesItem && seriesItem.name) {
                next.seriesTitle = seriesItem.name;
            }
            if (!next.seriesId) { next.seriesId = sid; }
            App.queueNextEpisodeResume(next);
            queued = true;
        }
        App.updateFollowedSeenIds(sid, ids, {
            name: (seriesItem && seriesItem.name) || (entry && entry.name) || ''
        });
        return { queued: queued, isNew: isNew, next: next };
    };

    App.toggleFollowSeries = function (item) {
        var rec = item && item.kind === 'episode' ? App.seriesRecordForEpisode(item) : item;
        var sid = App.seriesIdFromItem(rec || item);
        if (!sid) {
            App.toast('Impossible de suivre cette série');
            return false;
        }
        var list = App.loadFollowedSeries().slice();
        var idx = -1;
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].seriesId) === sid) { idx = i; break; }
        }
        if (idx >= 0) {
            list.splice(idx, 1);
            App.saveFollowedSeries(list);
            App.toast('Série retirée du suivi');
            return false;
        }
        if (list.length >= (App.FOLLOW_MAX || 40)) {
            list.pop();
        }
        list.unshift({
            seriesId: sid,
            name: (rec && rec.name) || (item && (item.seriesTitle || item.name)) || '',
            logo: (rec && rec.logo) || '',
            seenIds: [],
            at: Date.now()
        });
        App.saveFollowedSeries(list);
        App.toast('Série suivie — les nouveaux épisodes iront dans Continuer à regarder');
        return true;
    };

    App.syncFollowedSeriesNow = function (item) {
        if (!item || !App.isFollowedSeries(item)) { return; }
        var rec = App.seriesRecordForEpisode(item) || item;
        var seasons = App.seriesSeasons || [];
        if (!seasons.length && App.activeSeason) { seasons = [App.activeSeason]; }
        if (!seasons.length) { return; }
        App.applyFollowedSeasons(rec, seasons, { notifyNew: false });
    };

    App.toggleFollowPlayingSeries = function () {
        var ch = App.playingItem();
        if (!ch || ch.kind !== 'episode') { return false; }
        if (typeof App.enrichEpisodeMeta === 'function') { App.enrichEpisodeMeta(ch); }
        var on = App.toggleFollowSeries(ch);
        if (typeof App.updateVodFollowUi === 'function') { App.updateVodFollowUi(); }
        if (on) {
            if (typeof App.ensureSeriesContextForEpisode === 'function') {
                App.ensureSeriesContextForEpisode(ch, function () {
                    App.syncFollowedSeriesNow(ch);
                });
            } else {
                App.syncFollowedSeriesNow(ch);
            }
        }
        return on;
    };

    App.refreshFollowedSeries = function (opts) {
        if (App.backgroundSuspended) { return; }
        opts = opts || {};
        var list = App.loadFollowedSeries();
        if (!list.length || !App.xtreamCreds || typeof Xtream === 'undefined' ||
            typeof Xtream.getSeriesInfo !== 'function') {
            return;
        }
        if (App._followRefreshBusy) {
            App._followRefreshAgain = opts;
            return;
        }
        App._followRefreshBusy = true;
        App._followRefreshAgain = null;
        var creds = App.xtreamCreds;
        var generation = App._followGeneration || 0;
        var scope = App.profileScope ? App.profileScope() : '';
        function stale() {
            return generation !== (App._followGeneration || 0) ||
                scope !== (App.profileScope ? App.profileScope() : '');
        }
        var i = 0;
        var added = 0;
        var firstName = '';

        function finish() {
            if (stale()) { return; }
            App._followRefreshBusy = false;
            if (opts.notifyNew && added > 0) {
                if (added === 1 && firstName) {
                    App.toast('Nouvel épisode · ' + firstName);
                } else {
                    App.toast(added + ' nouveaux épisodes à suivre');
                }
            }
            if (opts.rebuildHome && App.uiState === 'browse' &&
                typeof App.isHomeDash === 'function' && App.isHomeDash() &&
                typeof App.renderHomeDash === 'function') {
                App.renderHomeDash();
            }
            if (App._followRefreshAgain) {
                var again = App._followRefreshAgain;
                App._followRefreshAgain = null;
                App.refreshFollowedSeries(again);
            }
        }

        function step() {
            if (stale()) { return; }
            if (i >= list.length) {
                finish();
                return;
            }
            var fav = list[i++];
            if (!fav || !fav.seriesId) {
                setTimeout(step, 40);
                return;
            }
            App._followRequestCancel = Xtream.getSeriesInfo(
                creds.base, creds.username, creds.password,
                fav.seriesId,
                function (seasons) {
                    if (stale()) { return; }
                    var rec = App.findSeriesByFavorite
                        ? App.findSeriesByFavorite(fav)
                        : App.seriesRecordForEpisode({ kind: 'episode', seriesId: fav.seriesId, seriesTitle: fav.name });
                    if (!rec) {
                        rec = {
                            kind: 'series',
                            seriesId: fav.seriesId,
                            name: fav.name || ''
                        };
                    }
                    var res = App.applyFollowedSeasons(rec, seasons || [], opts);
                    if (res.queued && res.isNew) {
                        added += 1;
                        if (!firstName) {
                            firstName = rec.name || fav.name || 'Série';
                            if (typeof App.displayCatalogTitle === 'function') {
                                firstName = App.displayCatalogTitle(firstName);
                            }
                        }
                    }
                    setTimeout(step, 80);
                },
                function () { setTimeout(step, 80); },
                { force: true }
            );
        }
        step();
    };

    App.scheduleFollowedSeriesRefresh = function (opts) {
        clearTimeout(App._followRefreshTimer);
        if (App.backgroundSuspended) { return; }
        App._followRefreshTimer = setTimeout(function () {
            App.refreshFollowedSeries(opts || {});
        }, 450);
    };
})(App);
