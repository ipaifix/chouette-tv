/* Xtream Codes API (player_api.php) — same path Smarters uses. */
var Xtream = (function () {
    'use strict';

    function normalizeBase(url) {
        url = (url || '').trim();
        if (!url) { return ''; }
        url = url.split('#')[0];
        url = url.replace(/\/(?:get|player_api|xmltv)\.php(?:\?.*)?$/i, '');
        url = url.replace(/\/+$/, '');
        return url;
    }

    function parseM3uCredentials(url) {
        url = (url || '').trim();
        url = url.split('#')[0];
        var q = url.indexOf('?');
        if (q < 0 || !/\/get\.php$/i.test(url.substring(0, q))) { return null; }
        var base = normalizeBase(url.substring(0, q));
        var params = url.substring(q + 1).split('&');
        var user = '';
        var pass = '';
        for (var i = 0; i < params.length; i++) {
            var eq = params[i].indexOf('=');
            if (eq < 0) { continue; }
            var key;
            var val;
            try {
                key = decodeURIComponent(params[i].substring(0, eq).replace(/\+/g, ' ')).toLowerCase();
                val = decodeURIComponent(params[i].substring(eq + 1).replace(/\+/g, ' '));
            } catch (e) { return null; }
            if (key === 'username') { user = val; }
            else if (key === 'password') { pass = val; }
        }
        if (!base || !user || !pass) { return null; }
        return { base: base, username: user, password: pass };
    }

    var seriesInfoCache = Object.create(null);
    var seriesCacheClock = 0;
    var SERIES_CACHE_TTL = 15 * 60000;
    var SERIES_CACHE_MAX = 8;
    var SERIES_EPISODE_MAX = 2000;

    function xhrGet(url, onDone, onError) {
        return Http.get(url, { timeoutMs: 90000, label: 'Xtream' }, onDone, onError);
    }

    function seriesCacheKey(base, user, pass, seriesId) {
        return JSON.stringify([normalizeBase(base), user, pass, String(seriesId)]);
    }

    function apiUrl(base, user, pass, action, extra) {
        var u = base + '/player_api.php?username=' + encodeURIComponent(user) +
            '&password=' + encodeURIComponent(pass);
        if (action) { u += '&action=' + encodeURIComponent(action); }
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] != null) {
                    u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extra[k]);
                }
            }
        }
        /* Bust intermediate caches so boot always sees a fresh library. */
        u += '&_=' + String(Date.now());
        return u;
    }

    function clearSeriesInfoCache() {
        seriesInfoCache = Object.create(null);
    }

    function liveStreamUrl(base, user, pass, streamId, format) {
        var ext = (format === 'm3u8') ? 'm3u8' : 'ts';
        return base + '/live/' + encodeURIComponent(user) + '/' + encodeURIComponent(pass) +
            '/' + encodeURIComponent(streamId) + '.' + ext;
    }

    function movieUrl(base, user, pass, streamId, ext) {
        ext = String(ext || 'mp4').replace(/^\./, '');
        return base + '/movie/' + encodeURIComponent(user) + '/' + encodeURIComponent(pass) +
            '/' + encodeURIComponent(streamId) + '.' + encodeURIComponent(ext);
    }

    function seriesEpisodeUrl(base, user, pass, episodeId, ext) {
        ext = String(ext || 'mp4').replace(/^\./, '');
        return base + '/series/' + encodeURIComponent(user) + '/' + encodeURIComponent(pass) +
            '/' + encodeURIComponent(episodeId) + '.' + encodeURIComponent(ext);
    }

    function epgUrl(base, user, pass) {
        return base + '/xmltv.php?username=' + encodeURIComponent(user) +
            '&password=' + encodeURIComponent(pass);
    }

    function parseJson(text, onErrorLabel) {
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            return { error: onErrorLabel + ' : réponse API invalide' };
        }
        if (data && data.user_info && String(data.user_info.auth) === '0') {
            return { error: onErrorLabel + ' : authentification refusée' };
        }
        return { data: data };
    }

    function isArray(v) {
        return Object.prototype.toString.call(v) === '[object Array]';
    }

    function parseJsonArray(text, onErrorLabel) {
        var parsed = parseJson(text, onErrorLabel);
        if (parsed.error) { return parsed; }
        if (parsed.data && !isArray(parsed.data)) {
            return { error: onErrorLabel + ' : réponse API inattendue' };
        }
        return { data: parsed.data || [] };
    }

    function buildCategories(catData, items, indexedCounts) {
        var catMap = Object.create(null);
        var categories = [];
        var i;
        if (catData && catData.length) {
            for (i = 0; i < catData.length; i++) {
                var cat = catData[i];
                if (!cat || cat.category_id == null) { continue; }
                var cid = String(cat.category_id);
                var cname = cat.category_name || ('Category ' + cid);
                catMap[cid] = cname;
                categories.push({ id: cid, name: cname });
            }
        }
        var seenCat = Object.create(null);
        if (indexedCounts) {
            Object.keys(indexedCounts).forEach(function (categoryId) {
                if (categoryId && !catMap[categoryId]) { categories.push({ id: categoryId, name: 'Category ' + categoryId }); }
            });
        }
        for (i = 0; !indexedCounts && i < items.length; i++) {
            var categoryId = items[i].categoryId;
            if (categoryId && !catMap[categoryId] && !seenCat[categoryId]) {
                seenCat[categoryId] = true;
                categories.push({ id: categoryId, name: 'Category ' + categoryId });
            }
        }
        var counts = indexedCounts || Object.create(null);
        for (i = 0; !indexedCounts && i < items.length; i++) {
            var id = items[i].categoryId;
            if (id) { counts[id] = (counts[id] || 0) + 1; }
        }
        var filtered = [];
        for (i = 0; i < categories.length; i++) {
            if (counts[categories[i].id]) {
                filtered.push(categories[i]);
            }
        }
        return filtered;
    }

    function mapLiveStreams(data, base, user, pass, format) {
        var items = [];
        for (var i = 0; i < data.length; i++) {
            var s = data[i];
            if (!s || s.stream_id == null) { continue; }
            var chNum = s.num != null ? parseInt(s.num, 10) : NaN;
            items.push({
                kind: 'live',
                id: s.epg_channel_id || String(s.stream_id),
                streamId: String(s.stream_id),
                name: s.name || ('Stream ' + s.stream_id),
                url: liveStreamUrl(base, user, pass, s.stream_id, format),
                categoryId: s.category_id != null ? String(s.category_id) : '',
                logo: s.stream_icon || '',
                num: isFinite(chNum) ? chNum : 0,
                catalogIndex: i,
                userAgent: '',
                referrer: ''
            });
        }
        return items;
    }

    function parseAddedAt(s) {
        if (!s) { return 0; }
        var raw = s.added != null ? s.added
            : (s.last_modified != null ? s.last_modified : 0);
        var n = parseInt(raw, 10);
        return isNaN(n) ? 0 : n;
    }

    function mapVodStreams(data, base, user, pass) {
        var items = [];
        for (var i = 0; i < data.length; i++) {
            var s = data[i];
            if (!s || s.stream_id == null) { continue; }
            var ext = s.container_extension || 'mp4';
            items.push({
                kind: 'vod',
                id: String(s.stream_id),
                streamId: String(s.stream_id),
                name: s.name || ('Movie ' + s.stream_id),
                url: movieUrl(base, user, pass, s.stream_id, ext),
                categoryId: s.category_id != null ? String(s.category_id) : '',
                logo: s.stream_icon || '',
                extension: ext,
                addedAt: parseAddedAt(s),
                userAgent: '',
                referrer: ''
            });
        }
        return items;
    }

    function mapSeriesList(data) {
        var items = [];
        for (var i = 0; i < data.length; i++) {
            var s = data[i];
            if (!s || s.series_id == null) { continue; }
            items.push({
                kind: 'series',
                id: String(s.series_id),
                seriesId: String(s.series_id),
                name: s.name || ('Série ' + s.series_id),
                url: '',
                categoryId: s.category_id != null ? String(s.category_id) : '',
                logo: s.cover || '',
                addedAt: parseAddedAt(s),
                userAgent: '',
                referrer: ''
            });
        }
        return items;
    }

    /**
     * Fetch live + VOD + series.
     * onDone(catalog)
     *   catalog: {
     *     live:   { categories:[{id,name}], items:[...] },
     *     vod:    { categories:[{id,name}], items:[...] },
     *     series: { categories:[{id,name}], items:[...] },
     *     epgUrl, base, username, password
     *   }
     */
    function load(base, user, pass, opts, onDone, onError) {
        opts = opts || {};
        base = normalizeBase(base);
        user = (user || '').trim();
        pass = (pass || '').trim();
        if (!base || !user || !pass) {
            onError('Xtream : serveur, identifiant et mot de passe requis');
            return;
        }

        if (opts.incremental && typeof DataJobs !== 'undefined') {
            return loadIncremental(base, user, pass, opts, onDone, onError);
        }

        var format = opts.format || 'ts';
        var pending = 6;
        var liveCats = { data: [] };
        var liveStreams = null;
        var vodCats = { data: [] };
        var vodStreams = { data: [] };
        var seriesCats = { data: [] };
        var seriesList = { data: [] };
        var failedTypes = Object.create(null);

        function finish() {
            if (--pending > 0) { return; }

            var liveItems = mapLiveStreams((liveStreams && liveStreams.data) || [], base, user, pass, format);
            var vodItems = mapVodStreams((vodStreams && vodStreams.data) || [], base, user, pass);
            var seriesItems = mapSeriesList((seriesList && seriesList.data) || []);
            if (!liveItems.length && !vodItems.length && !seriesItems.length) {
                onError((liveStreams && liveStreams.error) || 'Xtream : aucun contenu disponible');
                return;
            }

            var partialTypes = [];
            var typeNames = ['live', 'vod', 'series'];
            for (var p = 0; p < typeNames.length; p++) {
                if (failedTypes[typeNames[p]]) { partialTypes.push(typeNames[p]); }
            }
            onDone({
                live: {
                    categories: buildCategories((liveCats && liveCats.data) || [], liveItems),
                    items: liveItems
                },
                vod: {
                    categories: buildCategories((vodCats && vodCats.data) || [], vodItems),
                    items: vodItems
                },
                series: {
                    categories: buildCategories((seriesCats && seriesCats.data) || [], seriesItems),
                    items: seriesItems
                },
                epgUrl: epgUrl(base, user, pass),
                base: base,
                username: user,
                password: pass,
                partialTypes: partialTypes
            });
        }

        function optionalArray(label, setter) {
            return function (text) {
                var parsed = parseJsonArray(text, label);
                if (parsed.error) { setter({ data: [] }); }
                else { setter(parsed); }
                finish();
            };
        }

        function optionalFail(setter) {
            return function () {
                setter({ data: [] });
                finish();
            };
        }

        xhrGet(apiUrl(base, user, pass, 'get_live_categories'),
            optionalArray('Xtream live categories', function (v) { liveCats = v; }),
            optionalFail(function (v) { liveCats = v; }));

        xhrGet(apiUrl(base, user, pass, 'get_live_streams'), function (text) {
            liveStreams = parseJsonArray(text, 'Xtream live');
            if (liveStreams.error) { failedTypes.live = true; }
            finish();
        }, function (err) {
            failedTypes.live = true;
            liveStreams = { error: err };
            finish();
        });

        xhrGet(apiUrl(base, user, pass, 'get_vod_categories'),
            optionalArray('Xtream VOD categories', function (v) { vodCats = v; }),
            optionalFail(function (v) { vodCats = v; }));

        xhrGet(apiUrl(base, user, pass, 'get_vod_streams'),
            function (text) {
                vodStreams = parseJsonArray(text, 'Xtream VOD');
                if (vodStreams.error) { failedTypes.vod = true; vodStreams = { data: [] }; }
                finish();
            }, function () {
                failedTypes.vod = true;
                vodStreams = { data: [] };
                finish();
            });

        xhrGet(apiUrl(base, user, pass, 'get_series_categories'),
            optionalArray('Xtream series categories', function (v) { seriesCats = v; }),
            optionalFail(function (v) { seriesCats = v; }));

        xhrGet(apiUrl(base, user, pass, 'get_series'),
            function (text) {
                seriesList = parseJsonArray(text, 'Xtream series');
                if (seriesList.error) { failedTypes.series = true; seriesList = { data: [] }; }
                finish();
            }, function () {
                failedTypes.series = true;
                seriesList = { data: [] };
                finish();
            });
    }

    /* At most two requests; normalize each response immediately and yield every ~6 ms. */
    function loadIncremental(base, user, pass, opts, onDone, onError) {
        var cancelled = false, active = 0, completed = 0, next = 0;
        var cancellations = [], failed = [], success = 0, finished = false;
        var cat = { live: { items: [], categories: [] }, vod: { items: [], categories: [] },
            series: { items: [], categories: [] }, base: base, username: user, password: pass,
            epgUrl: epgUrl(base, user, pass), partialTypes: failed };
        var jobs = [
            ['live', 'get_live_streams', false], ['vod', 'get_vod_streams', false],
            ['series', 'get_series', false], ['live', 'get_live_categories', true],
            ['vod', 'get_vod_categories', true], ['series', 'get_series_categories', true]
        ];
        function cancel() {
            cancelled = true;
            cancellations.forEach(function (stop) { if (typeof stop === 'function') { stop(); } });
            cancellations = [];
        }
        function pump() {
            if (cancelled || finished) { return; }
            while (active < 2 && next < jobs.length) { request(jobs[next++]); }
            if (completed === jobs.length) {
                finished = true;
                ['live', 'vod', 'series'].forEach(function (type) {
                    cat[type].categories = buildCategories(cat[type].categories, cat[type].items, cat[type]._categoryCounts);
                });
                if (!success) { onError('Xtream : aucun contenu disponible'); }
                else { onDone(cat); }
            }
        }
        function request(job) {
            active++;
            var type = job[0], categories = job[2];
            function settle(items, error) {
                if (cancelled) { return; }
                if (categories) { cat[type].categories = items || []; }
                else {
                    cat[type].items = items || [];
                    if (error) { failed.push(type); }
                    else {
                        if (items.length) { success++; }
                        cat[type].categories = buildCategories([], items, cat[type]._categoryCounts);
                        if (items.length && opts.onProgress) { opts.onProgress(cat); }
                    }
                }
                active--; completed++; pump();
            }
            var stop = Http.get(apiUrl(base, user, pass, job[1]),
                { timeoutMs: categories ? 15000 : 90000, label: 'Xtream' }, function (text) {
                    if (cancelled) { return; }
                    if (categories) {
                        var parsed = parseJsonArray(text, 'Xtream');
                        settle(parsed.data || [], !!parsed.error);
                        return;
                    }
                    var mappedCount = 0;
                    cancellations.push(DataJobs.array(text, function (record, index) {
                        var mapped = type === 'live' ? mapLiveStreams([record], base, user, pass, opts.format)
                            : type === 'vod' ? mapVodStreams([record], base, user, pass) : mapSeriesList([record]);
                        if (mapped[0] && type === 'live') { mapped[0].catalogIndex = index; }
                        if (mapped[0]) { DataJobs.indexItem(cat[type], mapped[0], mappedCount++); }
                        return mapped[0];
                    }, function (items) { settle(items, false); }, function () { settle([], true); }));
                }, function () { settle([], true); });
            cancellations.push(stop);
        }
        pump();
        return cancel;
    }

    /**
     * Fetch seasons/episodes for one series.
     * onDone([{ season: '1', name: 'Season 1', episodes: [{id,name,url,episodeNum}] }])
     */
    function normalizeDetails(info) {
        info = info || {};
        function field(value) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
        var backdrops = info.backdrop_path;
        return {
            plot: field(info.plot || info.description), year: field(info.year || info.releasedate || info.releaseDate).slice(0, 4),
            duration: field(info.duration), genre: field(info.genre), cast: field(info.cast || info.actors),
            director: field(info.director), rating: field(info.rating),
            originalLanguage: field(info.original_language),
            backdrop: field(isArray(backdrops) ? backdrops[0] : backdrops),
            poster: field(info.movie_image || info.cover)
        };
    }

    function getVodDetails(base, user, pass, id, onDone, onError) {
        return xhrGet(apiUrl(normalizeBase(base), user, pass, 'get_vod_info', { vod_id: id }), function (text) {
            var parsed = parseJson(text, 'Xtream film');
            if (parsed.error) { onError(parsed.error); return; }
            onDone(normalizeDetails(parsed.data && parsed.data.info));
        }, onError);
    }

    function getSeriesInfo(base, user, pass, seriesId, onDone, onError, opts) {
        base = normalizeBase(base);
        user = (user || '').trim();
        pass = (pass || '').trim();
        seriesId = String(seriesId || '');
        if (!base || !user || !pass || !seriesId) {
            onError('Xtream : identifiants et série requis');
            return;
        }

        var cacheKey = seriesCacheKey(base, user, pass, seriesId);
        var hit = seriesInfoCache[cacheKey];
        if (!(opts && opts.force) && hit && Date.now() - hit.at < SERIES_CACHE_TTL) {
            hit.used = ++seriesCacheClock;
            onDone(hit.seasons);
            return;
        }

        return xhrGet(apiUrl(base, user, pass, 'get_series_info', { series_id: seriesId }), function (text) {
            var parsed = parseJson(text, 'Xtream series info');
            if (parsed.error) {
                onError(parsed.error);
                return;
            }
            var data = parsed.data || {};
            var info = data.info || {};
            var seriesName = info.name || info.title || '';
            var episodesMap = data.episodes || {};
            var seasonsMeta = data.seasons;
            if (!isArray(seasonsMeta)) { seasonsMeta = []; }
            var seasonNames = Object.create(null);
            var i;

            for (i = 0; i < seasonsMeta.length; i++) {
                var sm = seasonsMeta[i];
                if (!sm) { continue; }
                var sn = String(sm.season_number != null ? sm.season_number : (sm.season || ''));
                if (sn) {
                    seasonNames[sn] = sm.name || ('Season ' + sn);
                }
            }

            var keys = [];
            for (var k in episodesMap) {
                if (Object.prototype.hasOwnProperty.call(episodesMap, k)) {
                    keys.push(k);
                }
            }
            keys.sort(function (a, b) {
                return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
            });

            var seasons = [];
            for (i = 0; i < keys.length; i++) {
                var seasonKey = keys[i];
                var eps = episodesMap[seasonKey] || [];
                if (!isArray(eps)) { continue; }
                var episodes = [];
                for (var e = 0; e < eps.length; e++) {
                    var ep = eps[e];
                    if (!ep || ep.id == null) { continue; }
                    var ext = ep.container_extension || 'mp4';
                    var epNum = ep.episode_num != null ? ep.episode_num : (e + 1);
                    var title = ep.title || ep.name || ('Episode ' + epNum);
                    episodes.push({
                        kind: 'episode',
                        id: String(ep.id),
                        episodeId: String(ep.id),
                        episodeNum: epNum,
                        name: 'E' + epNum + ' — ' + title,
                        url: seriesEpisodeUrl(base, user, pass, ep.id, ext),
                        extension: ext,
                        season: String(seasonKey),
                        seriesId: seriesId,
                        seriesTitle: seriesName,
                        originalLanguage: typeof info.original_language === 'string' ? info.original_language : '',
                        userAgent: '',
                        referrer: ''
                    });
                }
                if (!episodes.length) { continue; }
                seasons.push({
                    season: String(seasonKey),
                    name: seasonNames[seasonKey] || ('Season ' + seasonKey),
                    episodes: episodes
                });
            }

            if (!seasons.length) {
                onError('Xtream : aucun épisode disponible pour cette série');
                return;
            }
            seasons.details = normalizeDetails(info);
            delete seriesInfoCache[cacheKey];
            var weight = 0;
            seasons.forEach(function (season) { weight += season.episodes.length; });
            if (weight <= SERIES_EPISODE_MAX) {
                seriesInfoCache[cacheKey] = { seasons: seasons, at: Date.now(), used: ++seriesCacheClock, weight: weight };
            }
            var cachedKeys = Object.keys(seriesInfoCache);
            cachedKeys.sort(function (a, b) { return seriesInfoCache[b].used - seriesInfoCache[a].used; });
            var total = 0;
            cachedKeys.forEach(function (key, index) {
                total += seriesInfoCache[key].weight;
                if (index >= SERIES_CACHE_MAX || total > SERIES_EPISODE_MAX) { delete seriesInfoCache[key]; }
            });
            onDone(seasons);
        }, onError);
    }

    return {
        load: load,
        getSeriesInfo: getSeriesInfo,
        getVodDetails: getVodDetails,
        clearSeriesInfoCache: clearSeriesInfoCache,
        normalizeBase: normalizeBase,
        parseM3uCredentials: parseM3uCredentials,
        movieUrl: movieUrl,
        liveStreamUrl: liveStreamUrl,
        epgUrl: epgUrl,
        seriesEpisodeUrl: seriesEpisodeUrl
    };
})();
