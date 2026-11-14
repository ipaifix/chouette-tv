'use strict';
/* Interface languages: lookup, fallback, detection and completeness of the en/nl tables. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'app/js');

function load(opts) {
    opts = opts || {};
    const saved = Object.assign({}, opts.saved || {});
    const ctx = {
        Storage: {
            KEYS: { uiLang: 'chouette-tv.uiLang' },
            get: function (k) { return saved[k] || ''; },
            set: function (k, v) { saved[k] = v; },
            flush: function () {}
        }
    };
    if (opts.navigator !== undefined) { ctx.navigator = opts.navigator; }
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8'), ctx);
    return { I18n: ctx.I18n, saved: saved };
}

test('French is the source: returned as-is in French', () => {
    const { I18n } = load({ navigator: { language: 'fr-FR' } });
    assert.equal(I18n.lang(), 'fr');
    assert.equal(I18n.t('Réglages'), 'Réglages');
});

test('English and Dutch lookups, with French fallback for an unknown string', () => {
    assert.equal(load({ navigator: { language: 'en-GB' } }).I18n.t('Réglages'), 'Settings');
    assert.equal(load({ navigator: { language: 'nl-NL' } }).I18n.t('Réglages'), 'Instellingen');
    assert.equal(load({ navigator: { language: 'nl-NL' } }).I18n.t('Pas dans la table'), 'Pas dans la table');
});

test('placeholders are filled in every language', () => {
    const en = load({ navigator: { language: 'en' } }).I18n;
    const fr = load({ navigator: { language: 'fr' } }).I18n;
    assert.equal(en.t('Guide TV chargé ({n} chaînes)', { n: 12 }), 'TV guide loaded (12 channels)');
    assert.equal(fr.t('Guide TV chargé ({n} chaînes)', { n: 12 }), 'Guide TV chargé (12 chaînes)');
    assert.equal(en.t('Guide TV chargé ({n} chaînes)', {}), 'TV guide loaded ({n} channels)');
});

test('{app} is the product name from Branding, so white-label variants translate too', () => {
    const ctx = { Branding: { name: 'Owl TV' }, navigator: { language: 'en' } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8'), ctx);
    assert.equal(ctx.I18n.t('Quitter {app} ?'), 'Exit Owl TV?');
    assert.equal(load({ navigator: { language: 'nl' } }).I18n.t('Quitter {app} ?'), 'Chouette TV afsluiten?');
});

test('detection: saved choice, then the TV language, then English', () => {
    assert.equal(load({ saved: { 'chouette-tv.uiLang': 'en' }, navigator: { language: 'nl-NL' } }).I18n.lang(), 'en');
    assert.equal(load({ navigator: { language: 'nl-BE' } }).I18n.lang(), 'nl');
    assert.equal(load({ navigator: { language: 'de-DE' } }).I18n.lang(), 'en');
    assert.equal(load({ navigator: { languages: ['nl-NL'] } }).I18n.lang(), 'nl');
    assert.equal(load({ saved: { 'chouette-tv.uiLang': 'xx' } }).I18n.lang(), 'en');
    assert.equal(load({}).I18n.lang(), 'en');
    assert.equal(load({ navigator: {} }).I18n.lang(), 'en');
});

test('setLang saves supported languages only, and cycles fr → en → nl → fr', () => {
    const { I18n, saved } = load({ navigator: { language: 'fr' } });
    assert.equal(I18n.setLang('nl'), true);
    assert.equal(saved['chouette-tv.uiLang'], 'nl');
    assert.equal(I18n.lang(), 'nl');
    assert.equal(I18n.setLang('de'), false);
    assert.equal(I18n.lang(), 'nl');
    assert.equal(I18n.next('fr'), 'en');
    assert.equal(I18n.next('en'), 'nl');
    assert.equal(I18n.next('nl'), 'fr');
});

function sourceFiles() {
    return fs.readdirSync(JS).filter((f) => f.endsWith('.js') && f !== 'app.bundle.js' && f !== 'i18n.js');
}

/* Every I18n.t('…') key in the sources and every data-i18n text or attribute in index.html. */
function decode(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function usedKeys() {
    const keys = new Set();
    const call = /I18n\.t\(\s*'((?:[^'\\]|\\.)*)'/g;
    for (const f of sourceFiles()) {
        const src = fs.readFileSync(path.join(JS, f), 'utf8');
        let m;
        while ((m = call.exec(src))) { keys.add(m[1].replace(/\\'/g, "'")); }
    }
    const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
    const text = /<([a-z0-9]+)\b[^>]*\sdata-i18n(?=[\s>])[^>]*>([^<]*)<\/\1>/g;
    let m;
    while ((m = text.exec(html))) {
        const explicit = /\sdata-i18n-src="([^"]*)"/.exec(m[0]);
        const key = explicit ? explicit[1] : m[2].trim();
        if (key) { keys.add(decode(key)); }
    }
    const tag = /<[a-z0-9]+\b[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g;
    while ((m = tag.exec(html))) {
        for (const attr of m[1].split(',')) {
            const v = new RegExp('\\sdata-i18n-src-' + attr.trim() + '="([^"]*)"').exec(m[0]) ||
                new RegExp('\\s' + attr.trim() + '="([^"]*)"').exec(m[0]);
            if (v && v[1]) { keys.add(decode(v[1])); }
        }
    }
    return keys;
}

test('every interface string has an English and a Dutch entry', () => {
    const tables = load({}).I18n._tables;
    const keys = usedKeys();
    assert.ok(keys.size > 150, 'expected the interface strings to be wrapped, found ' + keys.size);
    for (const lang of ['en', 'nl']) {
        const missing = [...keys].filter((k) => !Object.prototype.hasOwnProperty.call(tables[lang], k));
        assert.deepEqual(missing, [], lang + ' is missing translations');
    }
});

test('no unused entries in the tables', () => {
    const tables = load({}).I18n._tables;
    const keys = usedKeys();
    for (const lang of ['en', 'nl']) {
        const stale = Object.keys(tables[lang]).filter((k) => !keys.has(k));
        assert.deepEqual(stale, [], lang + ' has entries nothing uses');
    }
});

test('placeholders match between French and each translation', () => {
    const tables = load({}).I18n._tables;
    const names = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    for (const lang of ['en', 'nl']) {
        for (const [fr, tr] of Object.entries(tables[lang])) {
            assert.equal(names(tr), names(fr), lang + ' placeholders differ for: ' + fr);
        }
    }
});

test('no accented French literal is left outside I18n.t()', () => {
    const accent = /[éèêàâçùûôîïëÉÈÀÇ]/;
    const literal = /'((?:[^'\\\n]|\\.)*)'/g;
    const offenders = [];
    for (const f of sourceFiles()) {
        fs.readFileSync(path.join(JS, f), 'utf8').split('\n').forEach((line, i) => {
            const code = line.replace(/\/\/.*$/, '');
            if (/^\s*(\*|\/\*)/.test(code)) { return; }
            let m;
            while ((m = literal.exec(code))) {
                if (!accent.test(m[1])) { continue; }
                if (/I18n\.t\(\s*$/.test(code.slice(0, m.index))) { continue; }
                offenders.push(f + ':' + (i + 1) + ' ' + m[1]);
            }
        });
    }
    assert.deepEqual(offenders, []);
});
