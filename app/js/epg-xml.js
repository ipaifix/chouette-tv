/* Bounded XMLTV reader: validates the XML structure without building a document DOM. */
var XmltvReader = (function () {
    'use strict';
    function decode(text) {
        if (/&(?![^;\s<&]+;)/.test(text)) { throw new Error('unescaped entity'); }
        return text.replace(/&([^;\s<]+);/g, function (whole, key) {
            var entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
            if (Object.prototype.hasOwnProperty.call(entities, key)) { return entities[key]; }
            var n = /^#x[0-9a-f]+$/i.test(key) ? parseInt(key.slice(2), 16)
                : /^#[0-9]+$/.test(key) ? parseInt(key.slice(1), 10) : NaN;
            if (!(n > 0 && n <= 1114111) || (n >= 55296 && n <= 57343)) { throw new Error('invalid entity'); }
            return n < 65536 ? String.fromCharCode(n)
                : String.fromCharCode(55296 + ((n - 65536) >> 10), 56320 + ((n - 65536) & 1023));
        });
    }
    function parse(text, wanted, time, done, fail) {
        var pos = 0, stack = [], root = false, closed = false, current = null;
        var out = Object.create(null), timer = null, cancelled = false;
        var from = Date.now() - 2 * 3600000, until = Date.now() + 48 * 3600000;
        function cancel() { cancelled = true; clearTimeout(timer); text = ''; out = null; current = null; }
        function contents(value, cdata) {
            if (!stack.length && value.trim()) { throw new Error('text outside root'); }
            if (current && stack[stack.length - 1] === 'title' && current.title.length < 512) {
                current.title += (cdata ? value : decode(value)).slice(0, 512 - current.title.length);
            }
        }
        function step() {
            if (cancelled) { return; }
            var start = Date.now(), consumed = pos, tokens = 0;
            try {
                while (pos < text.length) {
                    var lt = text.indexOf('<', pos);
                    if (lt < 0) { contents(text.slice(pos), false); pos = text.length; break; }
                    contents(text.slice(pos, lt), false);
                    pos = lt;
                    var end;
                    if (text.substr(pos, 4) === '<!--') {
                        end = text.indexOf('-->', pos + 4);
                        if (end < 0) { throw new Error('comment'); }
                        pos = end + 3;
                    } else if (text.substr(pos, 9) === '<![CDATA[') {
                        end = text.indexOf(']]>', pos + 9);
                        if (end < 0) { throw new Error('CDATA'); }
                        contents(text.slice(pos + 9, end), true); pos = end + 3;
                    } else if (text.substr(pos, 2) === '<?') {
                        end = text.indexOf('?>', pos + 2);
                        if (end < 0) { throw new Error('instruction'); }
                        pos = end + 2;
                    } else {
                        var quote = '', scan = pos + 1;
                        for (; scan < text.length; scan++) {
                            var ch = text.charAt(scan);
                            if (quote) { if (ch === quote) { quote = ''; } }
                            else if (ch === '"' || ch === "'") { quote = ch; }
                            else if (ch === '>') { break; }
                            if (scan - pos > 65536) { throw new Error('oversized tag'); }
                        }
                        if (scan === text.length) { throw new Error('incomplete tag'); }
                        var token = text.slice(pos + 1, scan); pos = scan + 1;
                        if (/^!DOCTYPE\s+tv(?:\s+[^\[<>]*)?$/i.test(token)) {
                            if (root) { throw new Error('late doctype'); }
                        } else {
                            var close = token.charAt(0) === '/', selfClosing = /\/\s*$/.test(token);
                            var match = /^\/?([A-Za-z_][\w:.-]*)([\s\S]*)$/.exec(token);
                            if (!match) { throw new Error('invalid tag'); }
                            var name = match[1], rest = match[2], attributes = Object.create(null);
                            if (selfClosing) { rest = rest.replace(/\/\s*$/, ''); }
                            if (close) {
                                if (rest.trim() || stack.pop() !== name) { throw new Error('unbalanced XML'); }
                            } else {
                                var attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/;
                                while (rest.trim()) {
                                    var a = attr.exec(rest);
                                    if (!a || Object.prototype.hasOwnProperty.call(attributes, a[1])) { throw new Error('attribute'); }
                                    attributes[a[1]] = decode(a[2] != null ? a[2] : a[3]);
                                    rest = rest.slice(a[0].length);
                                }
                                if (!stack.length) {
                                    if (root || closed || name !== 'tv') { throw new Error('root'); }
                                    root = true;
                                }
                                if (name === 'programme' && stack.length === 1) {
                                    var id = attributes.channel, begin = time(attributes.start || ''), stop = time(attributes.stop || '');
                                    current = id && (!wanted || wanted[id]) && isFinite(begin) &&
                                        stop > from && begin < until ? { id: id, start: begin, stop: stop, title: '' } : null;
                                }
                                if (!selfClosing) { stack.push(name); }
                            }
                            if ((close || selfClosing) && name === 'programme' && current) {
                                if (!out[current.id]) { out[current.id] = []; }
                                if (out[current.id].length < 512) {
                                    out[current.id].push({ start: current.start, stop: current.stop, title: current.title });
                                }
                                current = null;
                            }
                            if ((close || selfClosing) && name === 'tv') { closed = true; }
                            if (stack.length > 64) { throw new Error('too deep'); }
                        }
                    }
                    if (++tokens >= 500 || pos - consumed >= 65536 || Date.now() - start >= 6) {
                        timer = setTimeout(step, 0); return;
                    }
                }
                if (!root || !closed || stack.length) { throw new Error('incomplete XML'); }
                var result = out; text = ''; out = null;
                done(result);
            } catch (e) { text = ''; out = null; fail('Guide TV invalide : données illisibles'); }
        }
        timer = setTimeout(step, 0);
        return cancel;
    }
    return { parse: parse };
})();
