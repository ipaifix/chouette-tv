'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chouette-tv-build-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.mkdirSync(path.join(dir, 'app/js'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../tools/build-bundle.sh'), path.join(dir, 'tools/build-bundle.sh'));
    for (const name of fs.readdirSync(path.join(__dirname, '../app/js'))) {
        if (name.endsWith('.js') && name !== 'app.bundle.js') {
            fs.writeFileSync(path.join(dir, 'app/js', name), `/* fixture ${name} */\n`);
        }
    }
    return { dir, bundle: path.join(dir, 'app/js/app.bundle.js'),
        run: (...args) => spawnSync('bash', [path.join(dir, 'tools/build-bundle.sh'), ...args], { encoding: 'utf8' }) };
}

test('the bundle is reproducible and stale source is detected without changing the output', t => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const before = fs.readFileSync(f.bundle, 'utf8');
    assert.doesNotMatch(before, /Generated:/);
    assert.equal(f.run('--check').status, 0);
    fs.appendFileSync(path.join(f.dir, 'app/js/boot.js'), '\n/* edited */\n');
    assert.equal(f.run('--check').status, 1);
    assert.equal(fs.readFileSync(f.bundle, 'utf8'), before);
    assert.equal(f.run().status, 0);
    assert.equal(f.run('--check').status, 0);
});

test('a missing source cannot truncate the last working bundle', t => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const before = fs.readFileSync(f.bundle, 'utf8');
    fs.unlinkSync(path.join(f.dir, 'app/js/playlist.js'));
    assert.notEqual(f.run().status, 0);
    assert.equal(fs.readFileSync(f.bundle, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.dirname(f.bundle)).filter(n => n.startsWith('.app.bundle.')), []);
});
