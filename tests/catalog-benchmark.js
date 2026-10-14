/* Informational desktop benchmark for large catalogs; no provider/network access. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const App = { TYPE_ROWS: [], SEARCH_MAX_RESULTS: 80, HOME_ROW_MAX: 14 };
const context = vm.createContext({ App, Storage: { get() { return ''; } },
    Xtream: { parseM3uCredentials() { return null; }, normalizeBase(v) { return v; } },
    setTimeout, clearTimeout });
for (const file of ['catalog.js', 'search-ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), context, { filename: file });
}
function items(kind, count) {
    return Array.from({ length: count }, (_, i) => ({
        kind, id: kind + '-' + i, name: (i % 10 === 0 ? 'Démo ' : 'Contenu ') + i,
        categoryId: String(i % 120), url: 'https://example.invalid/' + kind + '/' + i
    }));
}
App.catalog = {
    live: { categories: [], items: items('live', 20000) },
    vod: { categories: [], items: items('vod', 10000) },
    series: { categories: [], items: items('series', 10000) }
};
App.$searchQuery = { value: 'Démo' };
App.renderSearchShell = App.updateSearchFocusUi = App.clampSearchFocus = function () {};

const samples = [];
for (let i = 0; i < 25; i++) {
    const start = performance.now();
    App.runSearchFilter();
    samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const rssMb = process.memoryUsage().rss / 1024 / 1024;
console.log(JSON.stringify({
    catalogItems: 40000,
    iterations: samples.length,
    medianMs: Number(samples[12].toFixed(2)),
    p95Ms: Number(samples[23].toFixed(2)),
    results: App.searchResults.length,
    rssMb: Number(rssMb.toFixed(1)),
    note: 'Desktop Node VM; not representative of Samsung TV firmware.'
}, null, 2));
