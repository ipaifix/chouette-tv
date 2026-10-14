/* Build a clean, unsigned Tizen project without changing the source checkout. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const FIELDS = ['name', 'slug', 'packageId', 'appSuffix', 'widgetId', 'storageNamespace',
    'legacyStorageNamespace', 'icon', 'icon117', 'icon512'];

function stripPngMetadata(data) {
    const chunks = [data.subarray(0, 8)];
    const allowed = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']);
    let offset = 8, ended = false;
    while (offset + 12 <= data.length) {
        const length = data.readUInt32BE(offset), end = offset + 12 + length;
        if (end > data.length) throw Error('Invalid PNG chunk');
        const type = data.toString('ascii', offset + 4, offset + 8);
        if (allowed.has(type)) chunks.push(data.subarray(offset, end));
        offset = end;
        if (type === 'IEND') { ended = true; break; }
    }
    if (!ended) throw Error('Incomplete PNG');
    return Buffer.concat(chunks);
}

function readBrand(configFile) {
    const brand = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    for (const key of Object.keys(brand)) {
        if (!FIELDS.includes(key)) throw Error('Unknown branding field: ' + key);
    }
    if (typeof brand.name !== 'string' || !brand.name.trim() || brand.name.length > 64 || /[\x00-\x1f]/.test(brand.name)) throw Error('Invalid name');
    for (const key of ['slug', 'storageNamespace']) {
        if (!/^[a-z][a-z0-9-]{1,49}$/.test(brand[key] || '')) throw Error('Invalid ' + key);
    }
    if (!/^[A-Za-z0-9]{10}$/.test(brand.packageId || '')) throw Error('packageId must contain exactly 10 alphanumeric characters');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(brand.appSuffix || '')) throw Error('Invalid appSuffix');
    if (brand.legacyStorageNamespace != null && !/^[a-z][a-z0-9-]{1,49}$/.test(brand.legacyStorageNamespace)) throw Error('Invalid legacyStorageNamespace');
    const url = new URL(brand.widgetId);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Invalid widgetId');
    brand.assets = {};
    for (const key of ['icon', 'icon117', 'icon512']) {
        if (typeof brand[key] !== 'string') throw Error('Missing ' + key);
        const file = path.resolve(path.dirname(configFile), brand[key]);
        const data = fs.readFileSync(file);
        if (!data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw Error('Icons must be PNG');
        const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
        const size = key === 'icon117' ? 117 : 512;
        if (width !== size || height !== size) throw Error(key + ' must be ' + size + ' × ' + size);
        brand.assets[key] = stripPngMetadata(data);
    }
    return brand;
}
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function applyBrand(appDir, brand) {
    let html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    html = html.replace(/<title>[^<]*<\/title>/, () => '<title>' + xml(brand.name) + '</title>')
        .replace(/(<div id="channel-list-title">)[^<]*/, (_, prefix) => prefix + xml(brand.name))
        .replace(/(<div id="exit-msg">)[^<]*/, (_, prefix) => prefix + 'Quitter ' + xml(brand.name) + ' ?')
        .replace(/(<img id="(?:home-rail-logo|channel-list-logo)"[^>]* alt=")[^"]*/g, (_, prefix) => prefix + xml(brand.name))
        .replace(/(id="channel-list-brand"[^>]* aria-label=")[^"]*/, (_, prefix) => prefix + 'Actualiser le catalogue ' + xml(brand.name))
        .replace(/(<p id="channel-list-brand-hint"[^>]*>)[^<]*/, '$1Sélectionnez le logo pour actualiser');
    fs.writeFileSync(path.join(appDir, 'index.html'), html);
    let config = fs.readFileSync(path.join(appDir, 'config.xml'), 'utf8');
    config = config.replace(/(<widget\b[^>]*\bid=")[^"]*/, (_, prefix) => prefix + xml(brand.widgetId))
        .replace(/(<tizen:application\b[^>]*\bid=")[^"]*/, '$1' + brand.packageId + '.' + brand.appSuffix)
        .replace(/(<tizen:application\b[^>]*\bpackage=")[^"]*/, '$1' + brand.packageId)
        .replace(/<name>[^<]*<\/name>/, () => '<name>' + xml(brand.name) + '</name>');
    fs.writeFileSync(path.join(appDir, 'config.xml'), config);
    fs.writeFileSync(path.join(appDir, 'js/branding.js'), '/* Generated variant identity; contains no source account. */\nvar Branding = ' +
        JSON.stringify({ name: brand.name, storageNamespace: brand.storageNamespace, legacyStorageNamespace: brand.legacyStorageNamespace || null }) + ';\n');
    for (const [key, file] of [['icon', 'icon.png'], ['icon117', 'icon-117.png'], ['icon512', 'icon-512.png']]) {
        fs.writeFileSync(path.join(appDir, file), brand.assets[key]);
    }
    const yamlFile = path.join(appDir, 'tizen_web_project.yaml');
    const yaml = fs.readFileSync(yamlFile, 'utf8').replace(/^output_name:.*$/m, 'output_name: ' + brand.slug);
    fs.writeFileSync(yamlFile, yaml);
}

function buildVariant(configFile, outDir) {
    const brand = readBrand(configFile);
    outDir = path.resolve(outDir);
    if (fs.existsSync(outDir)) throw Error('Output already exists; choose a new directory or remove it deliberately');
    const parent = path.dirname(outDir);
    fs.mkdirSync(parent, { recursive: true });
    const temp = fs.mkdtempSync(path.join(parent, '.variant-'));
    try {
        fs.mkdirSync(path.join(temp, 'app/js'), { recursive: true });
        fs.mkdirSync(path.join(temp, 'app/css'));
        fs.mkdirSync(path.join(temp, 'tools'));
        for (const file of ['config.xml', 'index.html', 'tizen_web_project.yaml']) fs.copyFileSync(path.join(ROOT, 'app', file), path.join(temp, 'app', file));
        fs.copyFileSync(path.join(ROOT, 'app/css/style.css'), path.join(temp, 'app/css/style.css'));
        // Same explicit module list as the source bundle; no drafts or device files.
        const script = fs.readFileSync(path.join(ROOT, 'tools/build-bundle.sh'), 'utf8');
        const modules = script.match(/FILES=\(([\s\S]*?)\)/)[1].trim().split(/\s+/);
        for (const file of modules) {
            if (!/^[a-z][a-z0-9-]*\.js$/.test(file)) throw Error('Invalid bundle module name');
            const source = path.join(ROOT, 'app/js', file);
            if (fs.lstatSync(source).isSymbolicLink()) throw Error('Symlink in bundle modules');
            fs.copyFileSync(source, path.join(temp, 'app/js', file));
        }
        fs.writeFileSync(path.join(temp, 'tools/build-bundle.sh'), script);
        applyBrand(path.join(temp, 'app'), brand);
        const built = spawnSync('bash', [path.join(temp, 'tools/build-bundle.sh')], { encoding: 'utf8' });
        if (built.status !== 0) throw Error('Bundle generation failed');
        fs.renameSync(path.join(temp, 'app'), outDir);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    return outDir;
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.length > 2) throw Error('Usage: node tools/build-variant.js [branding.json] [output-directory]');
        const config = path.resolve(args[0] || path.join(ROOT, 'branding/public.json'));
        const brand = readBrand(config);
        console.log('Unsigned variant prepared: ' + buildVariant(config, args[1] || path.join(ROOT, 'dist', brand.slug, 'app')));
    } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { readBrand, applyBrand, buildVariant, stripPngMetadata };
