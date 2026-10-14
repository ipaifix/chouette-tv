/* Persistent settings: localStorage + tizen.preference + documents/ file.
 * Each build has its own namespace; legacy migration is explicitly opt-in. */
var Storage = (function () {
    'use strict';

    var brand = typeof Branding !== 'undefined' ? Branding :
        { storageNamespace: 'chouette-tv', legacyStorageNamespace: null };
    var PREFIX_NEW = brand.storageNamespace + '.';
    var PREFIX_OLD = brand.legacyStorageNamespace ? brand.legacyStorageNamespace + '.' : '';

    var KEY_NAMES = [
        'playlistUrl', 'epgUrl',
        'xtreamServer', 'xtreamUser', 'xtreamPass',
        'resumeMap', 'prefAudioLang', 'prefSubLang',
        'favChannels', 'favSeries', 'searchHistory', 'followedSeries',
        'profileRegistry', 'profileMigration', 'viewers',
        'menuType', 'menuLevel', 'menuCat', 'menuFocus', 'menuExpanded',
        'menuSeries', 'menuSeason', 'lastChannelUrl'
    ];

    var KEYS = {};
    var LEGACY_KEYS = {};
    var i;
    for (i = 0; i < KEY_NAMES.length; i++) {
        KEYS[KEY_NAMES[i]] = PREFIX_NEW + KEY_NAMES[i];
        LEGACY_KEYS[KEY_NAMES[i]] = PREFIX_OLD ? PREFIX_OLD + KEY_NAMES[i] : '';
    }

    var SETTINGS_FILE_NAME = brand.storageNamespace + '-settings.json';
    var SETTINGS_FILE = 'documents/' + SETTINGS_FILE_NAME;
    var SETTINGS_FILE_NAME_LEGACY = brand.legacyStorageNamespace ? brand.legacyStorageNamespace + '-settings.json' : '';
    var SETTINGS_FILE_LEGACY = SETTINGS_FILE_NAME_LEGACY ? 'documents/' + SETTINGS_FILE_NAME_LEGACY : '';

    /* Catalogue snapshot (live/vod/series) — fichier séparé, trop gros pour settings. */
    var CATALOG_FILE_NAME = brand.storageNamespace + '-catalog.json';
    var CATALOG_FILE = 'documents/' + CATALOG_FILE_NAME;
    var CATALOG_LS_KEY = PREFIX_NEW + 'catalogCache';
    var CATALOG_JOURNAL_NAME = brand.storageNamespace + '-catalog.jsonl';
    var CATALOG_JOURNAL = 'documents/' + CATALOG_JOURNAL_NAME;
    var CATALOG_PENDING_NAME = brand.storageNamespace + '-catalog.pending.jsonl';
    var catalogWriting = false;
    var catalogPending = null;

    var SETTINGS_KEYS = [
        KEYS.playlistUrl, KEYS.epgUrl,
        KEYS.xtreamServer, KEYS.xtreamUser, KEYS.xtreamPass,
        KEYS.resumeMap, KEYS.prefAudioLang, KEYS.prefSubLang,
        KEYS.favChannels, KEYS.favSeries, KEYS.searchHistory, KEYS.followedSeries,
        KEYS.profileRegistry, KEYS.profileMigration, KEYS.viewers
    ];
    var PROFILE_KEYS = [KEYS.resumeMap, KEYS.favChannels, KEYS.favSeries,
        KEYS.searchHistory, KEYS.followedSeries];

    var storeCache = Object.create(null);
    var fileFlushTimer = null;
    var fileFlushInProgress = false;
    var fileFlushAgain = false;

    function hasTizenPreference() {
        return typeof tizen !== 'undefined' && tizen.preference &&
            typeof tizen.preference.getValue === 'function' &&
            typeof tizen.preference.setValue === 'function';
    }

    function hasTizenFilesystem() {
        return typeof tizen !== 'undefined' && tizen.filesystem;
    }

    function legacyKeyFor(key) {
        if (PREFIX_OLD && key.indexOf(PREFIX_NEW) === 0) {
            return PREFIX_OLD + key.substring(PREFIX_NEW.length);
        }
        return '';
    }

    function readRaw(key) {
        if (Object.prototype.hasOwnProperty.call(storeCache, key)) {
            return storeCache[key];
        }
        try {
            var v = window.localStorage.getItem(key);
            if (v != null && v !== '') {
                storeCache[key] = v;
                return v;
            }
        } catch (e) {}
        try {
            if (hasTizenPreference()) {
                if (typeof tizen.preference.exists === 'function' && tizen.preference.exists(key)) {
                    var pv = String(tizen.preference.getValue(key) || '');
                    if (pv) {
                        storeCache[key] = pv;
                        return pv;
                    }
                }
            }
        } catch (e2) {}
        return '';
    }

    function get(key) {
        var v = readRaw(key);
        if (v) { return v; }
        var legacy = legacyKeyFor(key);
        if (legacy) {
            v = readRaw(legacy);
            if (v) {
                /* Migrate legacy → new on read */
                set(key, v);
                return v;
            }
        }
        return '';
    }

    function writeRaw(key, value) {
        value = value == null ? '' : String(value);
        /* Keep empty values too: a failed deletion must not revive stale storage. */
        storeCache[key] = value;
        try {
            if (value) { window.localStorage.setItem(key, value); }
            else { window.localStorage.removeItem(key); }
        } catch (e) {}
        try {
            if (hasTizenPreference()) {
                if (value) {
                    tizen.preference.setValue(key, value);
                } else if (typeof tizen.preference.exists === 'function' &&
                    tizen.preference.exists(key) &&
                    typeof tizen.preference.remove === 'function') {
                    tizen.preference.remove(key);
                }
            }
        } catch (e2) {}
    }

    function set(key, value) {
        writeRaw(key, value);
        var legacy = legacyKeyFor(key);
        if (legacy) {
            writeRaw(legacy, value);
        }
        if (SETTINGS_KEYS.indexOf(key) >= 0) {
            scheduleFlush();
        }
    }

    function collectSettingsObject() {
        var obj = {};
        var keys = SETTINGS_KEYS.slice();
        var registry = parseRegistry(readRaw(KEYS.profileRegistry));
        for (var r = 0; r < registry.length; r++) { keys.push(registry[r]); }
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = get(k);
            if (v) { obj[k] = v; }
        }
        return obj;
    }

    function applySettingsObject(obj, onlyIfEmpty) {
        if (!obj || typeof obj !== 'object') { return; }
        var k;
        for (k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) { continue; }
            var v = obj[k];
            if (v == null || v === '') { continue; }
            /* Accept legacy keys from file */
            var target = k;
            if (PREFIX_OLD && k.indexOf(PREFIX_OLD) === 0) {
                target = PREFIX_NEW + k.substring(PREFIX_OLD.length);
            } else if (Object.prototype.hasOwnProperty.call(KEYS, k)) {
                target = KEYS[k];
            }
            if (SETTINGS_KEYS.indexOf(target) < 0 && !isScopedKey(target)) { continue; }
            if (onlyIfEmpty && get(target)) { continue; }
            writeRaw(target, String(v));
            var leg = legacyKeyFor(target);
            if (leg) { writeRaw(leg, String(v)); }
        }
    }

    function isScopedKey(key) {
        return key.indexOf(PREFIX_NEW) === 0 &&
            /^profile\.[0-9a-f]{16}\.(resumeMap|favChannels|favSeries|searchHistory|followedSeries)$/.test(key.substring(PREFIX_NEW.length));
    }

    function parseRegistry(raw) {
        if (!raw) { return []; }
        try {
            var arr = JSON.parse(raw);
            if (Object.prototype.toString.call(arr) !== '[object Array]') { return []; }
            var out = [];
            for (var i = 0; i < arr.length; i++) {
                var key = String(arr[i] || '');
                if (isScopedKey(key) && out.indexOf(key) < 0) { out.push(key); }
            }
            return out;
        } catch (e) { return []; }
    }

    function hashScope(value, seed) {
        var hash = seed >>> 0;
        value = String(value || '');
        for (var i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return ('00000000' + hash.toString(16)).slice(-8);
    }

    function scopeToken(scope) {
        return hashScope(scope, 2166136261) + hashScope(scope, 3335557771);
    }

    function scopedKey(baseKey, scope) {
        if (PROFILE_KEYS.indexOf(baseKey) < 0 || !scope) { return baseKey; }
        return PREFIX_NEW + 'profile.' + scopeToken(scope) + '.' +
            baseKey.substring(PREFIX_NEW.length);
    }

    function registerScopedKey(key) {
        var registry = parseRegistry(readRaw(KEYS.profileRegistry));
        if (registry.indexOf(key) >= 0) { return; }
        registry.push(key);
        writeRaw(KEYS.profileRegistry, JSON.stringify(registry));
    }

    function sanitizeMigratedProfile(baseKey, value) {
        if (baseKey !== KEYS.resumeMap && baseKey !== KEYS.favChannels) { return value; }
        try {
            var parsed = JSON.parse(value);
            if (baseKey === KEYS.resumeMap && parsed && typeof parsed === 'object') {
                for (var key in parsed) {
                    if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] && parsed[key].id) {
                        parsed[key].url = '';
                    }
                }
            } else if (Object.prototype.toString.call(parsed) === '[object Array]') {
                for (var i = 0; i < parsed.length; i++) {
                    if (parsed[i] && parsed[i].streamId) { parsed[i].url = ''; }
                }
            }
            return JSON.stringify(parsed);
        } catch (e) { return value; }
    }

    function migrateProfileOnce(scope) {
        if (!scope || readRaw(KEYS.profileMigration)) { return; }
        for (var i = 0; i < PROFILE_KEYS.length; i++) {
            var value = get(PROFILE_KEYS[i]);
            if (!value) { continue; }
            var key = scopedKey(PROFILE_KEYS[i], scope);
            writeRaw(key, sanitizeMigratedProfile(PROFILE_KEYS[i], value));
            registerScopedKey(key);
            writeRaw(PROFILE_KEYS[i], '');
            var legacy = legacyKeyFor(PROFILE_KEYS[i]);
            if (legacy) { writeRaw(legacy, ''); }
        }
        writeRaw(KEYS.profileMigration, scopeToken(scope));
        scheduleFlush();
    }

    function getScoped(baseKey, scope) {
        if (!scope) { return get(baseKey); }
        migrateProfileOnce(scope);
        return get(scopedKey(baseKey, scope));
    }

    function setScoped(baseKey, scope, value) {
        if (!scope) { set(baseKey, value); return; }
        migrateProfileOnce(scope);
        var key = scopedKey(baseKey, scope);
        registerScopedKey(key);
        writeRaw(key, value);
        scheduleFlush();
    }

    function writeSettingsFileSync(json) {
        return writeFileSyncPath(SETTINGS_FILE, json);
    }

    function writeSettingsFileClassic(json, done) {
        writeNamedFileClassic(SETTINGS_FILE_NAME, json, done);
    }

    function flush() {
        clearTimeout(fileFlushTimer);
        fileFlushTimer = null;
        if (fileFlushInProgress) {
            fileFlushAgain = true;
            return;
        }
        var json;
        try {
            json = JSON.stringify(collectSettingsObject());
        } catch (e) {
            return;
        }
        if (writeSettingsFileSync(json)) { return; }
        fileFlushInProgress = true;
        writeSettingsFileClassic(json, function () {
            fileFlushInProgress = false;
            if (fileFlushAgain) {
                fileFlushAgain = false;
                flush();
            }
        });
    }

    function scheduleFlush() {
        clearTimeout(fileFlushTimer);
        fileFlushTimer = setTimeout(flush, 50);
    }

    function readSettingsFileSync(path) {
        if (!path || !hasTizenFilesystem() || typeof tizen.filesystem.openFile !== 'function') {
            return null;
        }
        var handle;
        try {
            handle = tizen.filesystem.openFile(path, 'r');
            var text = handle.readString();
            return text ? JSON.parse(text) : null;
        } catch (e) {
            return null;
        } finally {
            if (handle) { try { handle.close(); } catch (eClose) {} }
        }
    }

    function readSettingsFileClassic(path, done) {
        var completed = false;
        function finish(value) {
            if (completed) { return; }
            completed = true;
            done(value);
        }
        if (!path || !hasTizenFilesystem() || typeof tizen.filesystem.resolve !== 'function') {
            finish(null);
            return;
        }
        try {
            tizen.filesystem.resolve(path, function (file) {
                try {
                    file.readAsText(function (text) {
                        var parsed = null;
                        try { parsed = text ? JSON.parse(text) : null; } catch (eParse) {}
                        finish(parsed);
                    }, function () { finish(null); }, 'UTF-8');
                } catch (eRead) {
                    if (completed) { throw eRead; }
                    finish(null);
                }
            }, function () { finish(null); }, 'r');
        } catch (eResolve) {
            if (completed) { throw eResolve; }
            finish(null);
        }
    }

    function hydrate(done) {
        var fromSync = readSettingsFileSync(SETTINGS_FILE) ||
            readSettingsFileSync(SETTINGS_FILE_LEGACY);
        if (fromSync) {
            applySettingsObject(fromSync, true);
            done();
            return;
        }
        readSettingsFileClassic(SETTINGS_FILE, function (fromNew) {
            if (fromNew) {
                applySettingsObject(fromNew, true);
                done();
                return;
            }
            readSettingsFileClassic(SETTINGS_FILE_LEGACY, function (fromLegacy) {
                if (fromLegacy) {
                    applySettingsObject(fromLegacy, true);
                }
                done();
            });
        });
    }

    function writeNamedFileClassic(fileName, json, done) {
        var completed = false;
        function finish(ok) {
            if (completed) { return; }
            completed = true;
            if (done) { done(ok); }
        }
        if (!hasTizenFilesystem() || typeof tizen.filesystem.resolve !== 'function') {
            finish(false);
            return;
        }
        function resolved(dir) {
            var file;
            try {
                file = dir.resolve(fileName);
            } catch (eResolve) {
                try {
                    file = dir.createFile(fileName);
                } catch (eCreate) {
                    finish(false);
                    return;
                }
            }
            try {
                file.openStream('w', function (stream) {
                    var ok = false;
                    try { stream.write(json); ok = true; } catch (eWrite) {}
                    try { stream.close(); } catch (eClose) { ok = false; }
                    finish(ok);
                }, function () { finish(false); }, 'UTF-8');
            } catch (eOpen) {
                if (completed) { throw eOpen; }
                finish(false);
            }
        }
        try {
            tizen.filesystem.resolve('documents', resolved, function () { finish(false); }, 'rw');
        } catch (eResolve) {
            if (completed) { throw eResolve; }
            finish(false);
        }
    }

    function writeFileSyncPath(path, json) {
        if (!hasTizenFilesystem() || typeof tizen.filesystem.openFile !== 'function') {
            return false;
        }
        var handle;
        try {
            handle = tizen.filesystem.openFile(path, 'w');
            handle.writeString(json);
            handle.close();
            handle = null;
            return true;
        } catch (e) {
            return false;
        } finally {
            if (handle) { try { handle.close(); } catch (eClose) {} }
        }
    }

    function saveCatalogCache(payload, done) {
        var size = 0;
        ['live', 'vod', 'series'].forEach(function (type) {
            size += payload && payload.catalog && payload.catalog[type] && payload.catalog[type].items.length || 0;
        });
        if (typeof DataJobs !== 'undefined' && (size > 2000 ||
            (hasTizenFilesystem() && typeof tizen.filesystem.resolve === 'function'))) {
            saveCatalogJournal(payload, done);
            return;
        }
        var json;
        try {
            json = JSON.stringify(payload || null);
        } catch (e) {
            if (done) { done(false); }
            return;
        }
        if (!json) {
            if (done) { done(false); }
            return;
        }
        /* File is the durable cache; skip localStorage write (too large for TV LS). */
        if (writeFileSyncPath(CATALOG_FILE, json)) {
            if (done) { done(true); }
            return;
        }
        writeNamedFileClassic(CATALOG_FILE_NAME, json, function (ok) {
            if (ok) {
                if (done) { done(true); }
                return;
            }
            /* Browser / no filesystem: keep a localStorage fallback. */
            try {
                window.localStorage.setItem(CATALOG_LS_KEY, json);
                if (done) { done(true); }
            } catch (eLs) {
                /* A failed replacement leaves the previous offline cache usable. */
                if (done) { done(false); }
            }
        });
    }

    function saveCatalogJournal(payload, done) {
        if (catalogWriting) {
            if (catalogPending && catalogPending.done) { catalogPending.done(false); }
            catalogPending = { payload: payload, done: done }; return;
        }
        catalogWriting = true;
        var stream = null, finished = false;
        function finish(ok) {
            if (finished) { return; }
            finished = true;
            if (stream) { try { stream.close(); } catch (eClose) {} stream = null; }
            catalogWriting = false;
            if (done) { done(ok); }
            if (catalogPending) {
                var pending = catalogPending; catalogPending = null;
                saveCatalogCache(pending.payload, pending.done);
            }
        }
        /* Never truncate the working cache. Only replace it after the temporary journal is closed. */
        if (!hasTizenFilesystem() || typeof tizen.filesystem.resolve !== 'function') { finish(false); return; }
        try {
            tizen.filesystem.resolve('documents', function (dir) {
                if (typeof dir.moveTo !== 'function') { finish(false); return; }
                var file;
                try { file = dir.resolve(CATALOG_PENDING_NAME); }
                catch (eMissing) {
                    try { file = dir.createFile(CATALOG_PENDING_NAME); }
                    catch (eCreate) { finish(false); return; }
                }
                try {
                    file.openStream('w', function (opened) {
                        stream = opened;
                        DataJobs.writeCatalog(payload, function (chunk) { stream.write(chunk); }, function () {
                            try { stream.close(); stream = null; }
                            catch (eClose) { finish(false); return; }
                            try {
                                dir.moveTo(file.fullPath, dir.fullPath + '/' + CATALOG_JOURNAL_NAME, true, function () {
                                    /* Remove the obsolete legacy snapshot, which may contain authenticated URLs. */
                                    try { window.localStorage.removeItem(CATALOG_LS_KEY); } catch (eLs) {}
                                    if (dir.deleteFile) {
                                        try { dir.deleteFile(dir.fullPath + '/' + CATALOG_FILE_NAME, function () {}, function () {}); } catch (eDelete) {}
                                    }
                                    finish(true);
                                }, function () { finish(false); });
                            } catch (eMove) { finish(false); }
                        }, function () { finish(false); });
                    }, function () { finish(false); }, 'UTF-8');
                } catch (eOpen) { finish(false); }
            }, function () { finish(false); }, 'rw');
        } catch (eResolve) { finish(false); }
    }

    function parseCatalogPayload(obj) {
        if (!obj || typeof obj !== 'object') { return null; }
        if (!obj.fingerprint || !obj.catalog) { return null; }
        return obj;
    }

    function loadCatalogCache(done) {
        if (typeof DataJobs !== 'undefined' && hasTizenFilesystem() && typeof tizen.filesystem.resolve === 'function') {
            try {
                tizen.filesystem.resolve(CATALOG_JOURNAL, function (file) {
                    try {
                        file.readAsText(function (text) {
                            var base = get(KEYS.xtreamServer), user = get(KEYS.xtreamUser), pass = get(KEYS.xtreamPass);
                            DataJobs.readCatalog(text, function (payload) {
                                if (payload) { done(payload); }
                                else { loadLegacyCatalogCache(done); }
                            }, function (item, type) {
                                if (typeof Xtream === 'undefined' || !base || !user || !pass) { return item; }
                                if (type === 'live') { item.url = Xtream.liveStreamUrl(Xtream.normalizeBase(base), user, pass, item.streamId || item.id, 'ts'); }
                                if (type === 'vod') { item.url = Xtream.movieUrl(Xtream.normalizeBase(base), user, pass, item.streamId || item.id, item.extension); }
                                return item;
                            });
                        }, function () { loadLegacyCatalogCache(done); }, 'UTF-8');
                    } catch (eRead) { loadLegacyCatalogCache(done); }
                }, function () { loadLegacyCatalogCache(done); }, 'r');
            } catch (eResolve) { loadLegacyCatalogCache(done); }
            return;
        }
        loadLegacyCatalogCache(done);
    }

    function loadLegacyCatalogCache(done) {
        function finish(parsed) {
            /* Defer JSON-heavy consumers one tick when payload is large. */
            setTimeout(function () { done(parsed); }, 0);
        }
        var fromSync = readSettingsFileSync(CATALOG_FILE);
        var parsed = parseCatalogPayload(fromSync);
        if (parsed) {
            finish(parsed);
            return;
        }
        readSettingsFileClassic(CATALOG_FILE, function (fromFile) {
            var fallback = parseCatalogPayload(fromFile);
            if (!fallback) {
                try {
                    var ls = window.localStorage.getItem(CATALOG_LS_KEY);
                    fallback = ls ? parseCatalogPayload(JSON.parse(ls)) : null;
                } catch (eLs) {}
            }
            finish(fallback);
        });
    }

    return {
        KEYS: KEYS,
        LEGACY_KEYS: LEGACY_KEYS,
        SETTINGS_KEYS: SETTINGS_KEYS,
        get: get,
        set: set,
        getScoped: getScoped,
        setScoped: setScoped,
        scopedKey: scopedKey,
        flush: flush,
        hydrate: hydrate,
        saveCatalogCache: saveCatalogCache,
        loadCatalogCache: loadCatalogCache
    };
})();
