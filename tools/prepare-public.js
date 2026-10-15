/* Export an explicit source allowlist, never .git, private accounts or device state. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildVariant, stripPngMetadata } = require('./build-variant');
const { scanTree, loadPrivatePatterns } = require('./privacy-audit');
const ROOT = path.resolve(__dirname, '..');
const FILES = [
    '.gitignore', '.github/workflows/check.yml', 'README.md', 'LICENSE',
    'CONTRIBUTING.md', 'SECURITY.md', 'branding/public.json', 'branding/custom.example.json',
    'branding/chouette/logo.svg', 'branding/chouette/icon.png', 'branding/chouette/icon-117.png', 'branding/chouette/icon-512.png',
    'docs/BUILDING.md', 'docs/PUBLICATION.md', 'docs/PRIVACY.md', 'docs/INSTALLATION.md',
    'docs/screenshots/README.md', 'docs/screenshots/live-tv.png', 'docs/screenshots/movies.png',
    'docs/screenshots/tv-guide.png', 'docs/screenshots/series.png',
    'store/disclaimer.md', 'store/listing.fr.md',
    'tools/README.md', 'tools/build-bundle.sh', 'tools/check.sh', 'tools/build-variant.js',
    'tools/privacy-audit.js', 'tools/prepare-public.js', 'tools/make-channels.js', 'tools/xmltv-to-json.js',
    'tools/audit-netflix-light.js', 'tools/epg-workflow.yml', 'tools/guide-format.js',
    'tests/data.test.js', 'tests/build.test.js', 'tests/catalog-benchmark.js', 'tests/audit-fixes.test.js',
    'tests/browser-smoke.js', 'tests/playback.test.js', 'tests/settings-boot.test.js', 'tests/ui.test.js',
    'tests/experience.test.js', 'tests/preview.js', 'tests/publication.test.js'
];
function prepare(out, release = false) {
    if (release && !fs.existsSync(path.join(ROOT, 'LICENSE'))) throw Error('Release requires LICENSE.');
    out = path.resolve(out);
    if (fs.existsSync(out)) throw Error('Output already exists; choose a new directory');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const temp = fs.mkdtempSync(path.join(path.dirname(out), '.public-'));
    try {
        for (const file of FILES) {
            const src = path.join(ROOT, file);
            if (fs.lstatSync(src).isSymbolicLink()) throw Error('Symlink in source allowlist');
            const target = path.join(temp, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            if (file.endsWith('.png')) fs.writeFileSync(target, stripPngMetadata(fs.readFileSync(src)));
            else fs.copyFileSync(src, target);
        }
        buildVariant(path.join(ROOT, 'branding/public.json'), path.join(temp, 'app'));
        const audit = scanTree(temp, loadPrivatePatterns());
        if (audit.findings.length) throw Error('Public export rejected: ' + audit.findings.map(f => f.location + ':' + (f.line || '') + ' ' + f.rule).join('; '));
        fs.renameSync(temp, out);
        console.log('Public source prepared (' + audit.files + ' files).');
        console.log('Output: ' + out);
    } catch (e) { fs.rmSync(temp, { recursive: true, force: true }); throw e; }
}
if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.filter(a => a !== '--release').length > 1) throw Error('Usage: node tools/prepare-public.js [output-directory] [--release]');
        prepare(args.find(a => a !== '--release') || path.join(ROOT, 'dist/public-source'), args.includes('--release'));
    } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { prepare, FILES };
