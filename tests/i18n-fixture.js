'use strict';
/* The real i18n.js, pinned to French (no navigator, no saved choice), for tests that load app
 * files into a VM and assert on the French interface strings. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../app/js/i18n.js'), 'utf8');

function frenchI18n() {
    const ctx = vm.createContext({});
    vm.runInContext(SOURCE, ctx, { filename: 'i18n.js' });
    return ctx.I18n;
}

module.exports = { frenchI18n };
