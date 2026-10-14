/* Small cancellable jobs. No worker/framework dependency on older TV engines. */
var DataJobs = (function () {
    'use strict';
    function header(name) {
        name = String(name || '').trim();
        return /^[▼▶►★☆*\s]*-{3,}.*-{3,}[▼▶►★☆*\s]*$/.test(name) ||
            /^\*{3,}.*\*{3,}$/.test(name) || /^-{2,}|-{2,}\s*$/.test(name) ||
            (/---/.test(name) && /[★☆*]/.test(name)) || /^[\s\-—–★☆|]+$/.test(name);
    }
    function indexItem(bucket, item, index) {
        if (!bucket._categoryCounts) {
            bucket._categoryCounts = Object.create(null); bucket._recent = []; bucket._searchItems = [];
        }
        if (header(item.name)) { return; }
        var counts = bucket._categoryCounts, category = item.categoryId || '';
        counts[''] = (counts[''] || 0) + 1;
        if (category) { counts[category] = (counts[category] || 0) + 1; }
        if (typeof App !== 'undefined' && App.normalizeSearchText) { item._searchText = App.normalizeSearchText(item.name); }
        bucket._searchItems.push(item);
        if (item.kind !== 'vod' && item.kind !== 'series') { return; }
        var added = item.addedAt || 0, id = parseInt(item.id || item.streamId || item.seriesId || '0', 10) || 0;
        var recent = bucket._recent, last = recent[recent.length - 1];
        if (recent.length >= 50 && (added < last.addedAt || (added === last.addedAt && id <= last.idNum))) { return; }
        var lo = 0, hi = recent.length;
        while (lo < hi) {
            var mid = (lo + hi) >> 1, other = recent[mid];
            if (other.addedAt > added || (other.addedAt === added && other.idNum >= id)) { lo = mid + 1; }
            else { hi = mid; }
        }
        recent.splice(lo, 0, { item: item, index: index, addedAt: added, idNum: id });
        if (recent.length > 50) { recent.pop(); }
    }
    /* Read one JSON array record at a time: never retain the provider's raw object array. */
    function array(text, map, done, fail) {
        var cancelled = false, timer = null;
        var pos = 0, from = 0, depth = 0, quoted = false, escaped = false;
        var result = [], index = 0, afterComma = false;
        function cancel() { cancelled = true; clearTimeout(timer); text = ''; result = []; }
        while (/\s/.test(text.charAt(pos)) && pos < text.length) { pos++; }
        if (text.charAt(pos++) !== '[') { fail('Réponse API inattendue'); return cancel; }
        from = pos;
        function record(end) {
            var value = text.substring(from, end).trim();
            if (!value) { if (afterComma) { throw new Error('missing record'); } return; }
            var item = map(JSON.parse(value), index++);
            if (item) { result.push(item); }
        }
        function step() {
            if (cancelled) { return; }
            var start = Date.now(), scanned = 0;
            try {
                for (; pos < text.length; pos++) {
                    var ch = text.charAt(pos);
                    if (quoted) {
                        if (escaped) { escaped = false; }
                        else if (ch === '\\') { escaped = true; }
                        else if (ch === '"') { quoted = false; }
                    } else if (ch === '"') { quoted = true; }
                    else if (ch === ']' && depth === 0) {
                        record(pos);
                        if (text.substring(pos + 1).trim()) { throw new Error('trailing data'); }
                        var out = result; result = []; text = '';
                        done(out); return;
                    } else if (ch === ',' && depth === 0) {
                        if (!text.substring(from, pos).trim()) { throw new Error('missing record'); }
                        record(pos); from = pos + 1; afterComma = true;
                    } else if (ch === '{' || ch === '[') { depth++; afterComma = false; }
                    else if (ch === '}' || ch === ']') { depth--; }
                    else if (!/\s/.test(ch)) { afterComma = false; }
                    if (depth < 0 || pos - from > 2 * 1024 * 1024) { throw new Error('invalid record'); }
                    if (++scanned >= 65536 || (scanned % 512 === 0 && Date.now() - start >= 6)) {
                        pos++; timer = setTimeout(step, 0); return;
                    }
                }
                throw new Error('incomplete array');
            } catch (e) { text = ''; result = []; fail('Réponse API invalide'); }
        }
        timer = setTimeout(step, 0);
        return cancel;
    }
    /* Journal format: one compact record per line, committed footer detects interrupted writes. */
    function writeCatalog(payload, write, done, fail) {
        var types = ['live', 'vod', 'series'], type = 0, index = 0, count = 0;
        var catalog = payload.catalog;
        var header = { v: 3, fingerprint: payload.fingerprint, savedAt: payload.savedAt,
            xtream: !!catalog.xtream, epgUrl: catalog.epgUrl || '', categories: {} };
        types.forEach(function (kind) { header.categories[kind] = catalog[kind].categories; });
        try { write(JSON.stringify(header) + '\n'); } catch (e) { fail(); return; }
        function step() {
            var start = Date.now(), lines = [];
            try {
                while (type < types.length) {
                    var kind = types[type], items = catalog[kind].items;
                    if (index >= items.length) { type++; index = 0; continue; }
                    lines.push(JSON.stringify({ type: kind, item: items[index++] })); count++;
                    if (lines.length >= 100 || Date.now() - start >= 6) {
                        write(lines.join('\n') + '\n'); setTimeout(step, 0); return;
                    }
                }
                if (lines.length) { write(lines.join('\n') + '\n'); }
                write(JSON.stringify({ end: true, count: count }) + '\n'); done();
            } catch (e) { fail(); }
        }
        setTimeout(step, 0);
    }
    function readCatalog(text, done, hydrate) {
        var pos = text.indexOf('\n'), header, count = 0, ended = false;
        var catalog = { live: { items: [], categories: [] }, vod: { items: [], categories: [] }, series: { items: [], categories: [] } };
        try {
            header = JSON.parse(text.slice(0, pos));
            if (pos < 0 || header.v !== 3 || !header.fingerprint || !header.categories) { throw new Error('header'); }
            ['live', 'vod', 'series'].forEach(function (kind) {
                if (!Array.isArray(header.categories[kind])) { throw new Error('categories'); }
                catalog[kind].categories = header.categories[kind];
            });
            catalog.xtream = !!header.xtream; catalog.epgUrl = header.epgUrl || ''; pos++;
        } catch (e) { done(null); return; }
        function step() {
            var start = Date.now(), rows = 0;
            try {
                while (pos < text.length) {
                    var end = text.indexOf('\n', pos);
                    if (end < 0 || ended) { throw new Error('footer'); }
                    var row = JSON.parse(text.slice(pos, end)); pos = end + 1;
                    if (row.end) {
                        if (row.count !== count) { throw new Error('count'); }
                        ended = true;
                    } else {
                        if (!Object.prototype.hasOwnProperty.call(catalog, row.type) || !row.item) { throw new Error('record'); }
                        if (hydrate && header.xtream) { row.item = hydrate(row.item, row.type); }
                        indexItem(catalog[row.type], row.item, catalog[row.type].items.length);
                        catalog[row.type].items.push(row.item); count++;
                    }
                    if (++rows >= 100 || Date.now() - start >= 6) { setTimeout(step, 0); return; }
                }
                if (!ended) { throw new Error('incomplete'); }
                text = '';
                done({ v: 3, fingerprint: header.fingerprint, savedAt: header.savedAt, catalog: catalog });
            } catch (e) { text = ''; done(null); }
        }
        setTimeout(step, 0);
    }
    return { array: array, writeCatalog: writeCatalog, readCatalog: readCatalog, indexItem: indexItem, isHeader: header };
})();
