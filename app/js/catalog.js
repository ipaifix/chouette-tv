/* Catalog model */
var App = App || {};
(function (App) {
    'use strict';

    App.typeLabel = function (type) {
        for (var i = 0; i < App.TYPE_ROWS.length; i++) {
            if (App.TYPE_ROWS[i].type === type) { return App.TYPE_ROWS[i].label; }
        }
        return type;
    }

    /* Always return { categories:[], items:[] } — avoids null-ref crashes on Tizen. */
    App.emptyBucket = function () {
        return { categories: [], items: [] };
    }

    App.normalizeBucket = function (bucket) {
        if (!bucket || typeof bucket !== 'object') { return App.emptyBucket(); }
        var cats = bucket.categories;
        var items = bucket.items;
        return {
            categories: Object.prototype.toString.call(cats) === '[object Array]' ? cats : [],
            items: Object.prototype.toString.call(items) === '[object Array]' ? items : [],
            _categoryCounts: bucket._categoryCounts || null,
            _recent: bucket._recent || null,
            _searchItems: bucket._searchItems || null
        };
    }

    App.normalizeCatalog = function (cat) {
        cat = cat || {};
        return {
            live: App.normalizeBucket(cat.live),
            vod: App.normalizeBucket(cat.vod),
            series: App.normalizeBucket(cat.series),
            epgUrl: cat.epgUrl || '',
            base: cat.base || '',
            username: cat.username || '',
            password: cat.password || '',
            partialTypes: Object.prototype.toString.call(cat.partialTypes) === '[object Array]'
                ? cat.partialTypes.slice() : []
        };
    }

    App.bucketFor = function (type) {
        return App.normalizeBucket(App.catalog[type]);
    }

    App.catalogItems = function (type) {
        return App.bucketFor(type).items;
    }

    /*
     * Playlist titles often look like "|FR| TF1 FHD".
     * Split leading |CODE| for display; keep raw name for matching/favorites.
     */
    App.splitCatalogTitle = function (raw) {
        var full = String(raw == null ? '' : raw);
        var country = '';
        var title = full;
        var m = title.match(/^\s*\|\s*([^|]+?)\s*\|\s*/);
        if (m) {
            country = String(m[1] || '').trim();
            title = title.slice(m[0].length);
        }
        title = title.replace(/^\s*\|+\s*/, '').replace(/\s*\|+\s*$/, '').trim();
        if (!title) { title = full.replace(/\|/g, '').trim() || full.trim(); }
        return { title: title, country: country };
    }

    App.displayCatalogTitle = function (raw) {
        return App.splitCatalogTitle(raw).title;
    }

    App.catalogTitleCountry = function (raw) {
        return App.splitCatalogTitle(raw).country;
    }

    App.setContentType = function (type) {
        App.contentType = type || 'live';
        var bucket = App.bucketFor(App.contentType);
        App.channels = bucket.items;
        App.categories = bucket.categories;
    }

    /* Precompute category counts + recent lists once per catalog load. */
    App.rebuildCatalogIndexes = function () {
        App.categoryCounts = { live: Object.create(null), vod: Object.create(null), series: Object.create(null) };
        App.recentByType = { vod: [], series: [] };
        var types = ['live', 'vod', 'series'];
        var t;
        for (t = 0; t < types.length; t++) {
            var type = types[t];
            var items = (App.catalog[type] && App.catalog[type].items) || [];
            var importedCounts = App.catalog[type] && App.catalog[type]._categoryCounts;
            if (importedCounts) { App.categoryCounts[type] = importedCounts; continue; }
            var counts = App.categoryCounts[type];
            var i;
            for (i = 0; i < items.length; i++) {
                var ch = items[i];
                if (!ch || (App.isGroupHeader && App.isGroupHeader(ch))) { continue; }
                var cid = ch.categoryId || '';
                if (cid) { counts[cid] = (counts[cid] || 0) + 1; }
            }
            counts[''] = items.length;
        }
        function buildRecent(type) {
            if (App.catalog[type] && App.catalog[type]._recent) {
                App.recentByType[type] = App.catalog[type]._recent; return;
            }
            var items = (App.catalog[type] && App.catalog[type].items) || [];
            var scored = [];
            var i;
            for (i = 0; i < items.length; i++) {
                var ch = items[i];
                if (!ch) { continue; }
                var addedAt = ch.addedAt || 0;
                var idNum = parseInt(ch.id || ch.streamId || ch.seriesId || '0', 10) || 0;
                var max = App.RECENT_MAX || 50;
                var last = scored[scored.length - 1];
                if (scored.length >= max && (addedAt < last.addedAt ||
                    (addedAt === last.addedAt && idNum <= last.idNum))) { continue; }
                var entry = {
                    item: ch,
                    index: i,
                    addedAt: addedAt,
                    idNum: idNum
                };
                var lo = 0, hi = scored.length;
                while (lo < hi) {
                    var mid = (lo + hi) >> 1, other = scored[mid];
                    if (other.addedAt > addedAt || (other.addedAt === addedAt && other.idNum >= idNum)) { lo = mid + 1; }
                    else { hi = mid; }
                }
                scored.splice(lo, 0, entry);
                if (scored.length > max) { scored.pop(); }
            }
            scored.sort(function (a, b) {
                if (b.addedAt !== a.addedAt) { return b.addedAt - a.addedAt; }
                return b.idNum - a.idNum;
            });
            var max = App.RECENT_MAX || 50;
            var out = [];
            for (i = 0; i < scored.length && i < max; i++) {
                out.push(scored[i]);
            }
            App.recentByType[type] = out;
        }
        buildRecent('vod');
        buildRecent('series');
        if (typeof App.markPosterSourceDirty === 'function') {
            App.markPosterSourceDirty();
        }
        if (typeof App.markListWindowDirty === 'function') {
            App.markListWindowDirty();
        }
    }

    App.countInCategory = function (catId) {
        var type = App.contentType || 'live';
        var counts = App.categoryCounts && App.categoryCounts[type];
        if (!counts) {
            var n = 0;
            for (var i = 0; i < App.channels.length; i++) {
                if (!catId || App.channels[i].categoryId === catId) { n++; }
            }
            return n;
        }
        if (!catId) { return counts[''] || App.channels.length; }
        return counts[catId] || 0;
    }

    App.categoryName = function (catId) {
        if (!catId) {
            if (App.contentType === 'vod') { return 'Tous les films'; }
            if (App.contentType === 'series') { return 'Toutes les séries'; }
            return 'Toutes les chaînes';
        }
        if (catId === App.RECENT_CAT_ID) { return 'Derniers ajouts'; }
        for (var i = 0; i < App.categories.length; i++) {
            if (App.categories[i].id === catId) { return App.categories[i].name; }
        }
        return 'Catégorie';
    }

    App.isRecentCategory = function (catId) {
        return catId === App.RECENT_CAT_ID;
    }

    /* Newest first — uses precomputed recentByType when available. */
    App.buildRecentIndices = function () {
        App.recentIndices = [];
        if (App.contentType !== 'vod' && App.contentType !== 'series') { return; }
        var cached = App.recentByType && App.recentByType[App.contentType];
        if (cached && cached.length) {
            for (var i = 0; i < cached.length; i++) {
                App.recentIndices.push(cached[i].index);
            }
            return;
        }
        var scored = [];
        var j;
        for (j = 0; j < App.channels.length; j++) {
            var ch = App.channels[j];
            if (!ch) { continue; }
            scored.push({
                index: j,
                addedAt: ch.addedAt || 0,
                idNum: parseInt(ch.id || ch.streamId || ch.seriesId || '0', 10) || 0
            });
        }
        scored.sort(function (a, b) {
            if (b.addedAt !== a.addedAt) { return b.addedAt - a.addedAt; }
            return b.idNum - a.idNum;
        });
        var max = App.RECENT_MAX || 50;
        for (j = 0; j < scored.length && j < max; j++) {
            App.recentIndices.push(scored[j].index);
        }
    }

    App.countRecentItems = function () {
        if (App.contentType === 'vod' || App.contentType === 'series') {
            var cached = App.recentByType && App.recentByType[App.contentType];
            if (cached) { return cached.length; }
        }
        App.buildRecentIndices();
        return App.recentIndices.length;
    }

    /* Recent items for a type without mutating App.contentType / App.channels. */
    App.listRecentForType = function (type, max) {
        if (type !== 'vod' && type !== 'series') { return []; }
        var limit = max > 0 ? max : (App.RECENT_MAX || 50);
        var cached = App.recentByType && App.recentByType[type];
        if (cached && cached.length) {
            var out = [];
            for (var i = 0; i < cached.length && i < limit; i++) {
                out.push(cached[i].item);
            }
            return out;
        }
        var items = App.catalogItems(type);
        var scored = [];
        var j;
        for (j = 0; j < items.length; j++) {
            var ch = items[j];
            if (!ch) { continue; }
            scored.push({
                item: ch,
                addedAt: ch.addedAt || 0,
                idNum: parseInt(ch.id || ch.streamId || ch.seriesId || '0', 10) || 0
            });
        }
        scored.sort(function (a, b) {
            if (b.addedAt !== a.addedAt) { return b.addedAt - a.addedAt; }
            return b.idNum - a.idNum;
        });
        var out2 = [];
        for (j = 0; j < scored.length && j < limit; j++) {
            out2.push(scored[j].item);
        }
        return out2;
    }

    App.hasCatalogContent = function () {
        return !!(App.catalogItems('live').length ||
            App.catalogItems('vod').length ||
            App.catalogItems('series').length);
    }

    function sourceHash(value, seed) {
        var hash = seed >>> 0;
        value = String(value || '');
        for (var i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return ('00000000' + hash.toString(16)).slice(-8);
    }

    function opaqueSourceId(value) {
        return 'src-v2|' + sourceHash(value, 2166136261) + sourceHash(value, 3335557771);
    }

    /* Fingerprint of the active source without persisting credentials or URLs. */
    App.catalogSourceFingerprint = function () {
        var creds = App.xtreamFromStorage ? App.xtreamFromStorage() : {};
        var server = creds.server || '';
        var user = creds.user || '';
        var pass = creds.pass || '';
        if (server && user && pass) {
            return opaqueSourceId('xtream|' + Xtream.normalizeBase(server) + '|' + user + '|' + pass);
        }
        var url = Storage.get(Storage.KEYS.playlistUrl) || '';
        var parsed = Xtream.parseM3uCredentials(url);
        if (parsed) {
            return opaqueSourceId('xtream|' + parsed.base + '|' + parsed.username + '|' + parsed.password);
        }
        if (url) { return opaqueSourceId('m3u|' + url); }
        return '';
    }

    App.profileScope = function () {
        var source = App.catalogSourceFingerprint();
        var user = App.currentViewer ? App.currentViewer().id : 'default';
        /* Keep the original household data in the default profile. */
        return user === 'default' ? source : source + '|viewer:' + user;
    };
    App.getProfileValue = function (key) {
        return Storage.getScoped(key, App.profileScope());
    };
    App.setProfileValue = function (key, value) {
        Storage.setScoped(key, App.profileScope(), value);
    };

    /*
     * Soft catalog replace after a background refresh: keep UI level / playback,
     * refresh in-memory buckets and re-render browse if visible.
     */
    App.applyCatalogSoft = function (cat) {
        var playing = App.playingItem();
        cat = App.normalizeCatalog(cat);
        App.catalog = {
            live: cat.live,
            vod: cat.vod,
            series: cat.series
        };
        App.xtreamCreds = {
            base: cat.base || '',
            username: cat.username || '',
            password: cat.password || ''
        };
        var prevEpg = App.headerEpgUrl || '';
        App.headerEpgUrl = cat.epgUrl || '';
        if (typeof App.rebuildCatalogIndexes === 'function') {
            App.rebuildCatalogIndexes();
        }
        var previousType = App.contentType || 'live';
        var keepType = previousType;
        if (!App.catalogItems(keepType).length) {
            keepType = App.catalogItems('live').length ? 'live'
                : (App.catalogItems('vod').length ? 'vod' : 'series');
        }
        App.setContentType(keepType);
        if (keepType !== previousType) {
            App.activeCategoryId = null;
            App.activeSeries = null;
            App.activeSeason = null;
            App.seriesSeasons = [];
            if (App.listLevel === 'seasons' || App.listLevel === 'episodes') {
                App.listLevel = App.categories.length ? 'categories' : 'content';
            }
        }
        if (App.activeCategoryId && !App.isRecentCategory(App.activeCategoryId)) {
            var hasCategory = false;
            for (var c = 0; c < App.categories.length; c++) {
                if (App.categories[c].id === App.activeCategoryId) {
                    hasCategory = true;
                    break;
                }
            }
            if (!hasCategory) { App.activeCategoryId = null; }
        }
        /* Stored positions refer to the old bucket; categories/recent items may move. */
        if (typeof App.buildVisibleIndices === 'function') {
            App.buildVisibleIndices(App.activeCategoryId);
        }
        var preferred = (playing && playing.kind) || 'live';
        App.rebuildZapList(preferred);
        App.playingIndex = -1;
        if (playing) {
            for (var z = 0; z < App.zapList.length; z++) {
                var candidate = App.zapList[z];
                if (candidate.kind === playing.kind &&
                    ((candidate.streamId || candidate.id) === (playing.streamId || playing.id)) &&
                    (candidate.streamId || candidate.id)) {
                    App.playingIndex = z;
                    /* Metadata may change, but this is still the stream actually opened. */
                    candidate.url = playing.url;
                    break;
                }
                if (candidate.url === playing.url) { App.playingIndex = z; break; }
            }
            if (App.playingIndex < 0) {
                App.playingIndex = App.zapList.length;
                App.zapList.push(playing);
            }
        }
        if (App.uiState === 'browse' && typeof App.renderList === 'function') {
            try { App.renderList(); } catch (eRender) {}
        }
        if (App.headerEpgUrl && App.headerEpgUrl !== prevEpg && typeof App.loadEpg === 'function') {
            App.loadEpg();
        }
    }

    App.persistCatalogCache = function (fingerprint, cat) {
        if (!fingerprint || !cat) { return; }
        var cached = App.normalizeCatalog(cat);
        var secret = cat.password || (App.xtreamCreds && App.xtreamCreds.password) || '';
        if (cat.xtream || (cat.base && cat.username && cat.password)) {
            cached.xtream = true;
            cached.epgUrl = '';
            ['live', 'vod', 'series'].forEach(function (type) {
                cached[type] = { categories: cached[type].categories, items: cached[type].items.map(function (item) {
                    var copy = {};
                    for (var key in item) {
                        if (Object.prototype.hasOwnProperty.call(item, key) && key !== 'url' && key.charAt(0) !== '_') {
                            if ((key === 'logo' || key === 'referrer') &&
                                (/[?&](?:username|password|token|auth|key)=|^https?:\/\/[^/]+@/i.test(item[key] || '') ||
                                    (secret && (String(item[key]).indexOf(secret) >= 0 ||
                                        String(item[key]).indexOf(encodeURIComponent(secret)) >= 0)))) { continue; }
                            if (item[key] !== '' && item[key] != null) { copy[key] = item[key]; }
                        }
                    }
                    return copy;
                }) };
            });
        }
        cached.base = '';
        cached.username = '';
        cached.password = '';
        Storage.saveCatalogCache({
            v: 2,
            fingerprint: fingerprint,
            savedAt: Date.now(),
            catalog: cached
        }, function (ok) {
            if (ok === false && typeof App.toast === 'function') {
                App.toast('Catalogue chargé · copie hors ligne non enregistrée (stockage indisponible ou plein)');
            }
        });
    }

    App.restoreCatalogUrls = function (cat) {
        if (!cat || !cat.xtream) { return cat; }
        var creds = App.xtreamFromStorage();
        var base = Xtream.normalizeBase(creds.server);
        if (!base || !creds.user || !creds.pass) { return null; }
        ['live', 'vod'].forEach(function (type) {
            ((cat[type] && cat[type].items) || []).forEach(function (item) {
                var id = item.streamId || item.id;
                if (item.url) { return; }
                item.url = type === 'live' ? Xtream.liveStreamUrl(base, creds.user, creds.pass, id, 'ts')
                    : Xtream.movieUrl(base, creds.user, creds.pass, id, item.extension);
            });
        });
        cat.epgUrl = Xtream.epgUrl(base, creds.user, creds.pass);
        return cat;
    };
})(App);
