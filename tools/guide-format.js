/* Small XML event reader for Chouette's offline guide tooling. No network or DTD expansion. */
'use strict';

function decode(value) {
    if (value.replace(/&[^;\s<&]+;/g, '').includes('&')) throw Error('Unescaped XML ampersand');
    const names = new Map([['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['amp', '&']]);
    return value.replace(/&([^;]+);/g, (expression, key) => {
        if (names.has(key)) return names.get(key);
        const hex = /^#x([\da-f]+)$/i.exec(key), decimal = /^#(\d+)$/.exec(key);
        const code = hex ? Number.parseInt(hex[1], 16) : decimal ? Number(decimal[1]) : NaN;
        if (!Number.isInteger(code) || code < 1 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) throw Error('Invalid XML entity');
        return String.fromCodePoint(code);
    });
}

function attributes(markup) {
    const out = Object.create(null);
    let remaining = markup;
    while (remaining.trim()) {
        const item = /^\s+([^\s=<>]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/.exec(remaining);
        if (!item || Object.hasOwn(out, item[1])) throw Error('Invalid XML attributes');
        out[item[1]] = decode(item[2] == null ? item[3] : item[2]);
        remaining = remaining.slice(item[0].length);
    }
    return out;
}

function* events(document) {
    let offset = 0;
    const stack = [];
    while (offset < document.length) {
        if (document[offset] !== '<') {
            const end = document.indexOf('<', offset), next = end < 0 ? document.length : end;
            yield { type: 'text', value: decode(document.slice(offset, next)) };
            offset = next;
            continue;
        }
        let delimiter, closing;
        if (document.startsWith('<!--', offset)) { delimiter = '-->'; closing = offset + 4; }
        else if (document.startsWith('<?', offset)) { delimiter = '?>'; closing = offset + 2; }
        else if (document.startsWith('<![CDATA[', offset)) { delimiter = ']]>'; closing = offset + 9; }
        if (delimiter) {
            const end = document.indexOf(delimiter, closing);
            if (end < 0) throw Error('Unclosed XML section');
            if (delimiter === ']]>') yield { type: 'text', value: document.slice(closing, end) };
            offset = end + delimiter.length;
            continue;
        }
        let cursor = offset + 1, quote = null;
        for (; cursor < document.length; cursor++) {
            const symbol = document[cursor];
            if (quote) { if (symbol === quote) quote = null; }
            else if (symbol === '"' || symbol === "'") quote = symbol;
            else if (symbol === '>') break;
        }
        if (cursor === document.length) throw Error('Unclosed XML tag');
        const markup = document.slice(offset + 1, cursor);
        offset = cursor + 1;
        if (/^!DOCTYPE\b/i.test(markup)) {
            if (/[\[\]]/.test(markup)) throw Error('DTD entities are unsupported');
            continue;
        }
        const tag = /^(\/)?([A-Za-z_][\w:.-]*)([\s\S]*?)(\/)?$/.exec(markup);
        if (!tag) throw Error('Invalid XML element');
        const [, endTag, name, rest, empty] = tag;
        if (endTag) {
            if (rest.trim() || stack.pop() !== name) throw Error('Unbalanced XML');
            yield { type: 'end', name };
        } else {
            yield { type: 'start', name, attributes: attributes(rest) };
            if (empty) yield { type: 'end', name };
            else stack.push(name);
        }
    }
    if (stack.length) throw Error('Unclosed XML document');
}

function guideTime(value) {
    const source = String(value || '').trim();
    const stamp = source.slice(0, 14), timezone = source.slice(14).trim() || '+0000';
    if (!/^\d{14}$/.test(stamp) || !/^[+-]\d{4}$/.test(timezone)) return NaN;
    const parts = [0, 4, 6, 8, 10, 12].map((start, i) => Number(stamp.slice(start, i ? start + 2 : 4)));
    const days = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
    if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > days ||
        parts[3] > 23 || parts[4] > 59 || parts[5] > 59 || Number(timezone.slice(1, 3)) > 23 || Number(timezone.slice(3)) > 59) return NaN;
    const magnitude = Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(3));
    const shift = (timezone[0] === '-' ? -1 : 1) * magnitude * 60000;
    return Date.UTC(parts[0], parts[1] - 1, ...parts.slice(2)) - shift;
}

const escape = value => String(value).replace(/[<>&"']/g, symbol => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[symbol]));
module.exports = { events, guideTime, escape };
