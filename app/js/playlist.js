/* Chouette playlist reader: metadata records followed by media addresses. */
var Playlist = (function createPlaylistReader() {
    'use strict';
    var optionFields = { 'http-user-agent': 'userAgent', 'user-agent': 'userAgent',
        'http-referrer': 'referrer', referer: 'referrer', referrer: 'referrer' };

    function splitRecord(value) {
        var attributes = Object.create(null), position = 0, label = '', delimiter = '';
        while (position < value.length) {
            var character = value.charAt(position);
            if (delimiter) {
                if (character === delimiter) { delimiter = ''; }
            } else if (character === '"' || character === "'") {
                delimiter = character;
            } else if (character === ',') {
                label = value.slice(position + 1).trim();
                value = value.slice(0, position);
                break;
            }
            position += 1;
        }
        var field = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
        var result;
        while ((result = field.exec(value))) {
            attributes[result[1].toLowerCase()] = result[2] != null ? result[2]
                : result[3] != null ? result[3] : result[4];
        }
        return { attributes: attributes, label: label };
    }

    function applyOption(entry, assignment) {
        var separator = assignment.indexOf('=');
        if (separator < 1) { return; }
        var name = assignment.slice(0, separator).trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(optionFields, name)) {
            entry[optionFields[name]] = assignment.slice(separator + 1);
        }
    }

    function parse(contents) {
        var output = { channels: [], categories: [], epgUrl: '' };
        var groups = Object.create(null), record = null;
        String(contents || '').replace(/^\uFEFF/, '').split(/\r\n|[\n\r]/).forEach(function (row) {
            row = row.trim();
            if (!row) { return; }
            if (/^#EXTM3U(?:\s|$)/i.test(row)) {
                var header = splitRecord(row).attributes;
                output.epgUrl = header['url-tvg'] || header['x-tvg-url'] || output.epgUrl;
                return;
            }
            if (/^#EXTINF:/i.test(row)) {
                var metadata = splitRecord(row), fields = metadata.attributes;
                var group = (fields['group-title'] || '').trim(), category = '';
                if (group) {
                    category = 'm3u:' + group;
                    if (!groups[group]) {
                        groups[group] = true;
                        output.categories.push({ name: group, id: category });
                    }
                }
                record = { name: metadata.label || 'Unknown', logo: fields['tvg-logo'] || '',
                    id: fields['tvg-id'] || '', kind: 'live', categoryId: category,
                    referrer: '', userAgent: '' };
                return;
            }
            if (/^#EXTVLCOPT:/i.test(row)) {
                if (record) { applyOption(record, row.slice(row.indexOf(':') + 1)); }
                return;
            }
            if (row.charAt(0) === '#' || !record) { return; }
            var address = row.split('|');
            record.url = address.shift();
            if (address.length) {
                address.join('|').split('&').forEach(function (assignment) { applyOption(record, assignment); });
            }
            output.channels[output.channels.length] = record;
            record = null;
        });
        return output;
    }

    return {
        parse: parse,
        load: function (address, ready, rejected) {
            var fresh = address + (address.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now();
            return Http.get(fresh, { label: 'Playlist', timeoutMs: 60000 }, function (body) {
                var catalog = parse(body);
                if (!catalog.channels.length) { rejected('La playlist est vide ou invalide'); return; }
                ready(catalog.channels, catalog.epgUrl, catalog.categories);
            }, rejected);
        }
    };
}());
