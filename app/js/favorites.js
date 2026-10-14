/* Live TV + Series favorites (persist + resolve against current catalog) */
var App = App || {};
(function (App) {
    'use strict';

    var favLiveCache = null;   /* { list: [], keys: {} } */
    var favSeriesCache = null; /* { list: [], keys: {} } */
    var favLiveScope = '';
    var favSeriesScope = '';

    App.favoriteKeyFor = function (item) {
        if (!item) { return ''; }
        if (item.streamId) { return 'sid:' + String(item.streamId); }
        if (item.url) { return 'url:' + String(item.url); }
        if (item.id) { return 'id:' + String(item.id); }
        return '';
    };

    App.favoriteSeriesKeyFor = function (item) {
        if (!item) { return ''; }
        if (item.seriesId) { return 'series:' + String(item.seriesId); }
        if (item.id) { return 'id:' + String(item.id); }
        return '';
    };

    function buildFavIndex(list) {
        var keys = {};
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (!e) { continue; }
            if (e.key) { keys[e.key] = true; }
            if (e.streamId) { keys['sid:' + String(e.streamId)] = true; }
            if (e.seriesId) { keys['series:' + String(e.seriesId)] = true; }
            if (e.url) { keys['url:' + String(e.url)] = true; }
            if (e.id) { keys['id:' + String(e.id)] = true; }
        }
        return { list: list, keys: keys };
    }

    function parseFavEntries(raw, kind) {
        if (!raw) { return []; }
        try {
            var arr = JSON.parse(raw);
            if (Object.prototype.toString.call(arr) !== '[object Array]') { return []; }
            var out = [];
            for (var i = 0; i < arr.length; i++) {
                var e = arr[i];
                if (!e || typeof e !== 'object') { continue; }
                var key = e.key ? String(e.key) : '';
                if (kind === 'series') {
                    if (!key && e.seriesId) { key = 'series:' + String(e.seriesId); }
                    if (!key && e.id) { key = 'id:' + String(e.id); }
                    if (!key) { continue; }
                    out.push({
                        key: key,
                        seriesId: e.seriesId != null ? String(e.seriesId) : '',
                        id: e.id != null ? String(e.id) : '',
                        name: e.name ? String(e.name) : '',
                        logo: e.logo ? String(e.logo) : '',
                        categoryId: e.categoryId != null ? String(e.categoryId) : '',
                        at: Number(e.at) > 0 ? Number(e.at) : 0
                    });
                } else {
                    if (!key && e.streamId) { key = 'sid:' + String(e.streamId); }
                    if (!key && e.url) { key = 'url:' + String(e.url); }
                    if (!key && e.id) { key = 'id:' + String(e.id); }
                    if (!key) { continue; }
                    out.push({
                        key: key,
                        url: e.url ? String(e.url) : '',
                        streamId: e.streamId != null ? String(e.streamId) : '',
                        id: e.id != null ? String(e.id) : '',
                        name: e.name ? String(e.name) : '',
                        at: Number(e.at) > 0 ? Number(e.at) : 0
                    });
                }
            }
            return out;
        } catch (err) {
            return [];
        }
    }

    /* ---------- Live channels ---------- */

    App.loadFavoriteList = function () {
        var scope = App.profileScope ? App.profileScope() : '';
        if (favLiveCache && favLiveScope === scope) { return favLiveCache.list; }
        favLiveScope = scope;
        var raw = App.getProfileValue ? App.getProfileValue(Storage.KEYS.favChannels)
            : Storage.get(Storage.KEYS.favChannels);
        favLiveCache = buildFavIndex(parseFavEntries(raw, 'live'));
        return favLiveCache.list;
    };

    App.saveFavoriteList = function (list) {
        favLiveCache = buildFavIndex(list || []);
        favLiveScope = App.profileScope ? App.profileScope() : '';
        try {
            if (App.setProfileValue) {
                App.setProfileValue(Storage.KEYS.favChannels, JSON.stringify(favLiveCache.list));
            } else {
                Storage.set(Storage.KEYS.favChannels, JSON.stringify(favLiveCache.list));
            }
        } catch (e) {}
    };

    App.findLiveByFavorite = function (fav) {
        if (!fav) { return null; }
        var items = App.catalogItems('live');
        var i;
        var ch;
        if (fav.streamId) {
            for (i = 0; i < items.length; i++) {
                ch = items[i];
                if (ch && ch.streamId && String(ch.streamId) === String(fav.streamId)) {
                    return ch;
                }
            }
        }
        if (fav.url) {
            for (i = 0; i < items.length; i++) {
                ch = items[i];
                if (ch && ch.url && ch.url === fav.url) { return ch; }
            }
        }
        if (fav.key) {
            for (i = 0; i < items.length; i++) {
                ch = items[i];
                if (ch && App.favoriteKeyFor(ch) === fav.key) { return ch; }
            }
        }
        /*
         * Last resort: EPG id alone is shared by FHD/HD/SD variants — prefer
         * an exact name match when we stored one.
         */
        if (fav.id) {
            var nameHit = null;
            var anyHit = null;
            for (i = 0; i < items.length; i++) {
                ch = items[i];
                if (!ch || !ch.id || App.isGroupHeader(ch)) { continue; }
                if (String(ch.id) !== String(fav.id)) { continue; }
                if (!anyHit) { anyHit = ch; }
                if (fav.name && ch.name && String(ch.name) === String(fav.name)) {
                    nameHit = ch;
                    break;
                }
            }
            return nameHit || anyHit;
        }
        return null;
    };

    App.isFavoriteChannel = function (item) {
        if (!item || App.isGroupHeader(item)) { return false; }
        App.loadFavoriteList();
        if (!favLiveCache) { return false; }
        var key = App.favoriteKeyFor(item);
        if (key && favLiveCache.keys[key]) { return true; }
        if (item.streamId && favLiveCache.keys['sid:' + String(item.streamId)]) {
            return true;
        }
        if (item.url && favLiveCache.keys['url:' + String(item.url)]) { return true; }
        /* Never match on EPG id alone (shared across quality variants). */
        return false;
    };

    App.countFavoriteChannels = function () {
        return App.listFavoriteChannels().length;
    };

    /* One resolved channel per saved favorite (not every EPG-id twin). */
    App.listFavoriteChannels = function () {
        var favs = App.loadFavoriteList();
        var scored = [];
        var seen = {};
        var i;
        for (i = 0; i < favs.length; i++) {
            var ch = App.findLiveByFavorite(favs[i]);
            if (!ch || !ch.url) { continue; }
            if (App.isGroupHeader && App.isGroupHeader(ch)) { continue; }
            var k = App.favoriteKeyFor(ch) || ch.url;
            if (seen[k]) { continue; }
            seen[k] = true;
            scored.push({
                item: ch,
                num: ch.num > 0 ? ch.num : 0,
                idx: ch.catalogIndex != null ? ch.catalogIndex : i
            });
        }
        scored.sort(function (a, b) {
            if (a.num && b.num && a.num !== b.num) { return a.num - b.num; }
            if (a.num && !b.num) { return -1; }
            if (!a.num && b.num) { return 1; }
            return a.idx - b.idx;
        });
        var out = [];
        for (i = 0; i < scored.length; i++) { out.push(scored[i].item); }
        return out;
    };

    App.toggleFavoriteChannel = function (item) {
        if (!item || App.isGroupHeader(item)) { return false; }
        var key = App.favoriteKeyFor(item);
        if (!key && !item.url && !item.streamId) {
            App.toast('Impossible d’ajouter aux favoris');
            return false;
        }
        var list = App.loadFavoriteList().slice();
        var idx = -1;
        var i;
        for (i = 0; i < list.length; i++) {
            var e = list[i];
            if (!e) { continue; }
            if (key && e.key === key) { idx = i; break; }
            if (item.streamId && e.streamId &&
                String(item.streamId) === String(e.streamId)) {
                idx = i;
                break;
            }
            if (item.url && e.url && item.url === e.url) {
                idx = i;
                break;
            }
            if (item.streamId && e.key === 'sid:' + String(item.streamId)) {
                idx = i;
                break;
            }
            if (item.url && e.key === 'url:' + String(item.url)) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) {
            list.splice(idx, 1);
            App.saveFavoriteList(list);
            App.toast('Retiré des favoris');
            return false;
        }
        if (!key) {
            App.toast('Impossible d’ajouter aux favoris');
            return false;
        }
        list.unshift({
            key: key,
            url: item.streamId ? '' : (item.url ? String(item.url) : ''),
            streamId: item.streamId != null ? String(item.streamId) : '',
            id: item.id != null ? String(item.id) : '',
            name: item.name ? String(item.name) : '',
            at: Date.now()
        });
        App.saveFavoriteList(list);
        App.toast('Ajouté aux favoris');
        return true;
    };

    /* ---------- Series ---------- */

    App.loadFavoriteSeriesList = function () {
        var scope = App.profileScope ? App.profileScope() : '';
        if (favSeriesCache && favSeriesScope === scope) { return favSeriesCache.list; }
        favSeriesScope = scope;
        var raw = App.getProfileValue ? App.getProfileValue(Storage.KEYS.favSeries)
            : Storage.get(Storage.KEYS.favSeries);
        favSeriesCache = buildFavIndex(parseFavEntries(raw, 'series'));
        return favSeriesCache.list;
    };

    App.saveFavoriteSeriesList = function (list) {
        favSeriesCache = buildFavIndex(list || []);
        favSeriesScope = App.profileScope ? App.profileScope() : '';
        try {
            if (App.setProfileValue) {
                App.setProfileValue(Storage.KEYS.favSeries, JSON.stringify(favSeriesCache.list));
            } else {
                Storage.set(Storage.KEYS.favSeries, JSON.stringify(favSeriesCache.list));
            }
        } catch (e) {}
    };

    App.findSeriesByFavorite = function (fav) {
        if (!fav) { return null; }
        var items = App.catalogItems('series');
        var i;
        var s;
        if (fav.seriesId) {
            for (i = 0; i < items.length; i++) {
                s = items[i];
                if (s && s.seriesId && String(s.seriesId) === String(fav.seriesId)) {
                    return s;
                }
            }
        }
        if (fav.id) {
            for (i = 0; i < items.length; i++) {
                s = items[i];
                if (s && s.id && String(s.id) === String(fav.id)) { return s; }
            }
        }
        if (fav.key) {
            for (i = 0; i < items.length; i++) {
                s = items[i];
                if (s && App.favoriteSeriesKeyFor(s) === fav.key) { return s; }
            }
        }
        return null;
    };

    App.isFavoriteSeries = function (item) {
        if (!item || item.kind === 'vod' || item.kind === 'live') { return false; }
        App.loadFavoriteSeriesList();
        if (!favSeriesCache) { return false; }
        var key = App.favoriteSeriesKeyFor(item);
        if (key && favSeriesCache.keys[key]) { return true; }
        if (item.seriesId && favSeriesCache.keys['series:' + String(item.seriesId)]) {
            return true;
        }
        if (item.id && favSeriesCache.keys['id:' + String(item.id)]) { return true; }
        return false;
    };

    App.countFavoriteSeries = function () {
        return App.listFavoriteSeries().length;
    };

    App.listFavoriteSeries = function () {
        var favs = App.loadFavoriteSeriesList();
        var out = [];
        var seen = {};
        for (var i = 0; i < favs.length; i++) {
            var s = App.findSeriesByFavorite(favs[i]);
            if (!s || !s.seriesId) { continue; }
            var k = App.favoriteSeriesKeyFor(s) || s.seriesId;
            if (seen[k]) { continue; }
            seen[k] = true;
            out.push(s);
        }
        return out;
    };

    App.toggleFavoriteSeries = function (item) {
        if (!item || !item.seriesId) {
            App.toast('Impossible d’ajouter aux favoris');
            return false;
        }
        var key = App.favoriteSeriesKeyFor(item);
        if (!key) {
            App.toast('Impossible d’ajouter aux favoris');
            return false;
        }
        var list = App.loadFavoriteSeriesList().slice();
        var idx = -1;
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i].key === key) { idx = i; break; }
            if (item.seriesId && list[i].seriesId &&
                String(item.seriesId) === String(list[i].seriesId)) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) {
            list.splice(idx, 1);
            App.saveFavoriteSeriesList(list);
            App.toast('Retiré des favoris');
            return false;
        }
        list.unshift({
            key: key,
            seriesId: String(item.seriesId),
            id: item.id != null ? String(item.id) : String(item.seriesId),
            name: item.name ? String(item.name) : '',
            logo: item.logo ? String(item.logo) : '',
            categoryId: item.categoryId != null ? String(item.categoryId) : '',
            at: Date.now()
        });
        App.saveFavoriteSeriesList(list);
        App.toast('Ajouté aux favoris');
        return true;
    };

})(App);
