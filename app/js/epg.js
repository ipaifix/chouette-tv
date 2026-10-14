/* Chouette guide repository: atomic refreshes and indexed programme intervals. */
var EPG = (function createGuideRepository() {
    'use strict';
    var repository = Object.create(null), available = false, revision = 0;
    var pending = [];
    var own = Object.prototype.hasOwnProperty;

    function abortPending() {
        pending.splice(0).forEach(function (abort) { if (typeof abort === 'function') { abort(); } });
    }

    function xmlTimestamp(raw) {
        var value = String(raw || '').trim();
        var fields = /^(\d{14})(?:\s+([+-])(\d{4}))?$/.exec(value);
        if (!fields) { return NaN; }
        var clock = fields[1], components = [clock.slice(0, 4), clock.slice(4, 6), clock.slice(6, 8),
            clock.slice(8, 10), clock.slice(10, 12), clock.slice(12, 14)].map(Number);
        var days = new Date(Date.UTC(components[0], components[1], 0)).getUTCDate();
        if (components[1] < 1 || components[1] > 12 || components[2] < 1 || components[2] > days ||
            components[3] > 23 || components[4] > 59 || components[5] > 59) { return NaN; }
        var utc = Date.UTC(components[0], components[1] - 1, components[2], components[3], components[4], components[5]);
        var zone = fields[3] || '0000';
        if (Number(zone.slice(0, 2)) > 23 || Number(zone.slice(2)) > 59) { return NaN; }
        var offset = Number(zone.slice(0, 2)) * 60 + Number(zone.slice(2));
        return utc - (fields[2] === '-' ? -offset : offset) * 60000;
    }

    function timestamp(value) {
        var numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value));
        if (!numeric) { return typeof value === 'string' ? Date.parse(value) : NaN; }
        var amount = Number(value);
        return amount * (amount < 1000000000000 ? 1000 : 1);
    }

    function index(rows) {
        var sorted = rows.slice().sort(function (first, second) { return first.start - second.start; });
        var latest = [], boundary = -Infinity;
        sorted.forEach(function (programme) {
            boundary = Math.max(boundary, programme.stop);
            latest.push(boundary);
        });
        return { rows: sorted, latest: latest };
    }

    function add(map, channel, start, stop, title, selected, window) {
        if (!channel || (selected && !own.call(selected, channel)) || !isFinite(start) || !isFinite(stop)) { return; }
        if (stop <= window.from || start >= window.to) { return; }
        var bucket = map[channel] || (map[channel] = []);
        if (bucket.length < 512) { bucket.push({ title: String(title || ''), stop: Math.max(start, stop), start: start }); }
    }

    function jsonGuide(body, selected, window) {
        var source = JSON.parse(body), buckets = Object.create(null);
        if (!source || typeof source !== 'object' || Array.isArray(source)) { throw Error('channel map required'); }
        Object.keys(source).forEach(function (channel) {
            if (!Array.isArray(source[channel])) { return; }
            source[channel].forEach(function (programme) {
                if (!programme || typeof programme !== 'object') { return; }
                add(buckets, channel, timestamp(programme.start), timestamp(programme.stop), programme.title, selected, window);
            });
        });
        return buckets;
    }

    function domGuide(body, selected, window) {
        var document = new DOMParser().parseFromString(body, 'text/xml');
        if (document.getElementsByTagName('parsererror').length ||
            (document.documentElement && document.documentElement.nodeName !== 'tv')) { throw Error('XMLTV required'); }
        var buckets = Object.create(null), programmes = document.getElementsByTagName('programme');
        Array.prototype.forEach.call(programmes, function (programme) {
            var titles = programme.getElementsByTagName('title');
            add(buckets, programme.getAttribute('channel'), xmlTimestamp(programme.getAttribute('start')),
                xmlTimestamp(programme.getAttribute('stop')), titles.length ? titles[0].textContent : '', selected, window);
        });
        return buckets;
    }

    function refresh(address, channels, ready, rejected) {
        revision += 1;
        abortPending();
        var requestId = revision, selected = null, now = Date.now();
        var window = { from: now - 7200000, to: now + 172800000 };
        if (channels && channels.length) {
            selected = Object.create(null);
            channels.forEach(function (channel) { if (channel) { selected[channel] = true; } });
        }
        function failure(reason) { if (requestId === revision) { rejected(reason); } }
        function commit(buckets) {
            if (requestId !== revision) { return; }
            var replacement = Object.create(null);
            Object.keys(buckets).forEach(function (channel) { replacement[channel] = index(buckets[channel]); });
            repository = replacement;
            available = true;
            ready(Object.keys(replacement).length);
        }
        pending.push(Http.get(address, { label: 'EPG', timeoutMs: 60000 }, function (body) {
            if (requestId !== revision) { return; }
            var first = body.replace(/^\s+/, '').charAt(0);
            try {
                if (first === '<' && typeof XmltvReader !== 'undefined') {
                    pending.push(XmltvReader.parse(body, selected, xmlTimestamp, commit, failure));
                } else {
                    commit(first === '{' || first === '[' ? jsonGuide(body, selected, window) : domGuide(body, selected, window));
                }
            } catch (error) { failure('Guide TV invalide : données illisibles'); }
        }, failure));
    }

    function pair(channel) {
        var indexed = repository[channel];
        if (!indexed || !indexed.rows.length) { return null; }
        var rows = indexed.rows, clock = Date.now(), left = 0, right = rows.length;
        while (left !== right) {
            var pivot = Math.floor((right + left) / 2);
            if (clock < rows[pivot].start) { right = pivot; } else { left = pivot + 1; }
        }
        var next = rows[left] || null, active = null, cursor = left;
        while (cursor > 0 && indexed.latest[cursor - 1] > clock) {
            cursor -= 1;
            if (rows[cursor].stop > clock) { active = rows[cursor]; break; }
        }
        return active || next ? { next: next, now: active } : null;
    }

    return {
        load: refresh,
        nowNext: pair,
        schedule: function (channel) {
            var bucket = repository[channel], now = Date.now();
            return bucket ? bucket.rows.filter(function (entry) { return entry.stop > now; }) : [];
        },
        fmtTime: function (milliseconds) {
            var value = new Date(milliseconds);
            return [value.getHours(), value.getMinutes()].map(function (part) {
                return ('0' + part).slice(-2);
            }).join(':');
        },
        isLoaded: function () { return available; },
        hasData: function (channel) { return !!(repository[channel] && repository[channel].rows.length); },
        cancel: function () { revision += 1; abortPending(); }
    };
}());
