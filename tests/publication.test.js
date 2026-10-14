'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildVariant, readBrand, stripPngMetadata } = require('../tools/build-variant');
const { prepare } = require('../tools/prepare-public');
const { scanText, scanTree } = require('../tools/privacy-audit');
const ROOT = path.resolve(__dirname, '..');
function temp(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-publication-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
function fakeStorage(initial) {
    const entries = new Map(Object.entries(initial || {}));
    return { getItem: key => entries.get(key) || '', setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key), entries };
}
function storage(brand, initial = {}, tizen) {
    const localStorage = fakeStorage(initial);
    const ctx = vm.createContext({ Branding: brand, window: { localStorage }, tizen, setTimeout, clearTimeout });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/js/storage.js'), 'utf8'), ctx);
    return { ...ctx, localStorage };
}
test('public app starts without importing foreign accounts from preferences or shared files', () => {
    const opened = [];
    const brand = { storageNamespace: 'chouette-tv', legacyStorageNamespace: null };
    const foreign = { 'personal.xtreamUser': 'private-user', 'old-player.xtreamUser': 'private-user' };
    const { Storage, localStorage } = storage(brand, foreign, { preference: {
        exists: key => Object.hasOwn(foreign, key), getValue: key => foreign[key]
    }, filesystem: {
        openFile(file) { opened.push(file); throw Error('missing public file'); },
        resolve(file, ok, fail) { opened.push(file); fail(); }
    } });
    let hydrated = false;
    Storage.hydrate(() => { hydrated = true; });
    assert.equal(hydrated, true);
    assert.equal(Storage.get(Storage.KEYS.xtreamUser), '');
    assert.equal(localStorage.entries.get('personal.xtreamUser'), 'private-user');
    assert.deepEqual([...new Set(opened)], ['documents/chouette-tv-settings.json']);
});
test('legacy migration is opt-in and remains functional for a private variant', () => {
    const { Storage, localStorage } = storage({ storageNamespace: 'personal', legacyStorageNamespace: 'old-player' }, { 'old-player.xtreamUser': 'demo' });
    assert.equal(Storage.get(Storage.KEYS.xtreamUser), 'demo');
    assert.equal(localStorage.entries.get('personal.xtreamUser'), 'demo');
});
test('variant build escapes names, isolates storage and never changes the source project', t => {
    const dir = temp(t);
    const source = fs.readFileSync(path.join(ROOT, 'app/index.html'));
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'branding/public.json')));
    Object.assign(config, { name: 'Owl & "Friends" $&', slug: 'owl-test', packageId: 'OwlTest001', storageNamespace: 'owl-test' });
    for (const key of ['icon', 'icon117', 'icon512']) config[key] = path.resolve(ROOT, 'branding', config[key]);
    const file = path.join(dir, 'brand.json');
    fs.writeFileSync(file, JSON.stringify(config));
    const out = path.join(dir, 'app');
    buildVariant(file, out);
    assert.deepEqual(fs.readFileSync(path.join(ROOT, 'app/index.html')), source);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /Owl &amp; &quot;Friends&quot; \$&amp;/);
    assert.doesNotMatch(html, /Chouette TV/);
    assert.match(fs.readFileSync(path.join(out, 'config.xml'), 'utf8'), /id="OwlTest001\.iptv" package="OwlTest001"/);
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(out, 'js/branding.js'), 'utf8'), context);
    assert.equal(context.Branding.name, config.name);
    assert.equal(context.Branding.storageNamespace, config.storageNamespace);
    assert.equal(context.Branding.legacyStorageNamespace, null);
    assert.throws(() => buildVariant(file, out), /already exists/);
});
test('variant configuration rejects account fields and invalid package identities', t => {
    const dir = temp(t), file = path.join(dir, 'brand.json');
    const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'branding/public.json')));
    fs.writeFileSync(file, JSON.stringify({ ...brand, password: 'demo' }));
    assert.throws(() => readBrand(file), /Unknown branding field/);
    fs.writeFileSync(file, JSON.stringify({ ...brand, packageId: 'short' }));
    assert.throws(() => readBrand(file), /10 alphanumeric/);
});
test('PNG text metadata and trailing content are not copied into variants', () => {
    const png = fs.readFileSync(path.join(ROOT, 'branding/chouette/icon.png'));
    const text = Buffer.from('Comment\0private synthetic note');
    const chunk = Buffer.alloc(12 + text.length);
    chunk.writeUInt32BE(text.length); chunk.write('tEXt', 4); text.copy(chunk, 8);
    const modified = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33), Buffer.from('private trailer')]);
    const clean = stripPngMetadata(modified);
    assert.equal(clean.includes(text), false);
    assert.equal(clean.includes(Buffer.from('private trailer')), false);
    assert.deepEqual(clean, stripPngMetadata(png));
});
test('audit reports real-host credential URLs but accepts reserved-domain fixtures', () => {
    const origin = 'https://' + 'provider.vendor';
    const secret = 'unique-fixture-value';
    const findings = scanText(origin + '/get.php?username=user&password=' + secret, 'fixture');
    assert.equal(findings[0].rule, 'authenticated-url');
    assert.equal(JSON.stringify(findings).includes(secret), false);
    assert.equal(scanText('https://example.invalid/get.php?username=demo&password=demo', 'fixture').length, 0);
    assert.equal(scanText('person@example.invalid', 'fixture').length, 0);
    assert.equal(scanText(origin + '/live/user/pass/7.ts', 'fixture')[0].rule, 'authenticated-url');
    assert.equal(scanText('a reference to private-provider', 'fixture', ['private-provider'])[0].rule, 'known-private-value');
});
test('public export has no private files, personal branding or Git database and remains rebuildable', t => {
    const dir = temp(t), out = path.join(dir, 'source');
    prepare(out);
    assert.equal(fs.existsSync(path.join(out, '.git')), false);
    assert.equal(fs.existsSync(path.join(out, 'private')), false);
    assert.equal(fs.existsSync(path.join(out, 'store/reviewer-test.m3u')), false);
    assert.equal(fs.existsSync(path.join(out, 'settings.jpg')), false);
    assert.deepEqual(scanTree(out).findings, []);
    assert.equal(fs.existsSync(path.join(out, 'LICENSE')), true);
    prepare(path.join(dir, 'release'), true);
    const script = fs.readFileSync(path.join(out, 'tools/build-bundle.sh'), 'utf8');
    assert.match(script, /branding\.js/);
});
