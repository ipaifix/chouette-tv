/* Reports locations and rule names only: never print matched secrets or excerpts. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BINARY = /\.(png|jpe?g|pdf|kra|wgt|p12|pfx|zip)$/i;
const PRIVATE_FILE = /(?:^|\/)(?:private|\.git|Debug|Release|Build|Test|\.tizen-rds|\.sign)(?:\/|$)|(?:^|\/)(?:creeds\.ignore|\.DS_Store|author-signature\.xml|signature1\.xml)$|\.(?:eml|p12|pfx|pem|key|wgt|local\.json)$/i;
const personalBrand = new RegExp('chou' + 'choux', 'i');
function loadPrivatePatterns() {
    const file = path.join(ROOT, 'private/audit-patterns.json');
    if (!fs.existsSync(file)) return [];
    const values = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(values) || values.some(p => typeof p !== 'string' || p.length < 5)) throw Error('Invalid private audit patterns');
    return values;
}
function syntheticHost(host) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
        /(?:^|\.)(?:invalid|test|example)$/.test(host) || /^(?:[^.]+\.)*example\.(?:com|org|net)$/.test(host);
}
function scanText(text, location, privatePatterns = []) {
    const findings = [];
    const add = (rule, line) => findings.push({ location, line, rule });
    text.split('\n').forEach((value, index) => {
        const line = index + 1;
        if (personalBrand.test(value)) add('personal-brand', line);
        if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(value)) add('home-directory', line);
        if (/\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/.test(value)) add('private-network-address', line);
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) add('private-key', line);
        if (/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/.test(value)) add('access-token', line);
        const emails = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
        for (const mail of emails) {
            const host = mail.split('@')[1];
            if (host !== 'users.noreply.github.com' && !syntheticHost(host)) add('email-address', line);
        }
        const urls = value.match(/https?:\/\/[^\s<>"'`]+/g) || [];
        for (const raw of urls) {
            let url;
            try { url = new URL(raw); } catch (_) { continue; }
            if (syntheticHost(url.hostname)) continue;
            if (url.username || url.password || [...url.searchParams.keys()].some(k => /^(?:user(?:name)?|pass(?:word)?|token|api[_-]?key|access[_-]?token|auth|secret)$/i.test(k)) ||
                /^\/(?:live|movie|series)\/[^/]+\/[^/]+\//i.test(url.pathname)) add('authenticated-url', line);
        }
        // Optional local values/hosts to catch provider-specific identifiers.
        if (privatePatterns.some(p => p.length >= 5 && value.includes(p))) add('known-private-value', line);
    });
    return findings;
}
function walk(dir, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isSymbolicLink()) throw Error('Symlink requires review: ' + name);
        if (entry.isDirectory()) files.push(...walk(path.join(dir, entry.name), name + '/'));
        else if (entry.isFile()) files.push(name);
    }
    return files;
}
function scanTree(dir, patterns = []) {
    const result = { files: 0, findings: [], binaryFiles: [] };
    for (const name of walk(dir)) {
        result.files++;
        if (PRIVATE_FILE.test(name)) result.findings.push({ location: name, rule: 'private-file' });
        if (personalBrand.test(name)) result.findings.push({ location: name, rule: 'personal-filename' });
        if (BINARY.test(name)) { result.binaryFiles.push(name); continue; }
        result.findings.push(...scanText(fs.readFileSync(path.join(dir, name), 'utf8'), name, patterns));
    }
    return result;
}
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
function scanWorkingTree(patterns) {
    const names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
    const result = { files: 0, findings: [], binaryFiles: [], excluded: [] };
    for (const name of names) {
        // Only included public sources. Historical tracked binary assets are still audited below.
        if (PRIVATE_FILE.test(name) || name === 'docs/audit-netflix-light-2026-10-06.md') { result.excluded.push(name); continue; }
        if (!fs.existsSync(path.join(ROOT, name))) continue;
        result.files++;
        if (BINARY.test(name)) { result.binaryFiles.push(name); continue; }
        result.findings.push(...scanText(fs.readFileSync(path.join(ROOT, name), 'utf8'), name, patterns));
    }
    return result;
}
function scanHistory(patterns) {
    // All local objects, including reflogs and unreachable blobs: ignore rules do not apply here.
    const objects = git(['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype) %(objectsize)']).trim().split('\n');
    const mapped = new Map(git(['rev-list', '--objects', '--all', '--reflog']).split('\n').filter(Boolean).map(line => {
        const [sha, ...parts] = line.split(' '); return [sha, parts.join(' ')];
    }));
    const allReferenced = new Set(git(['rev-list', '--objects', '--all']).split('\n').filter(Boolean).map(line => line.split(' ')[0]));
    const standardRefs = git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags']).trim().split('\n').filter(Boolean);
    const referenced = new Set(standardRefs.length ? git(['rev-list', '--objects', ...standardRefs]).split('\n').filter(Boolean).map(line => line.split(' ')[0]) : []);
    const result = { blobs: 0, commits: 0, identities: 0, findings: [], binaryBlobs: [] };
    const identities = new Set();
    for (const entry of objects) {
        const [sha, type] = entry.split(' ');
        if (type !== 'blob' && type !== 'commit') continue;
        const raw = execFileSync('git', ['cat-file', type, sha], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
        if (type === 'commit') {
            result.commits++;
            const text = raw.toString('utf8');
            for (const match of text.matchAll(/^(?:author|committer) (.+?) \d+ [+-]\d+$/gm)) identities.add(match[1]);
            result.findings.push(...scanText(text.split('\n\n').slice(1).join('\n\n'), 'commit ' + sha.slice(0, 12), patterns));
            continue;
        }
        result.blobs++;
        const name = mapped.get(sha) || '[unmapped blob]';
        const location = sha.slice(0, 12) + ':' + name;
        const reachability = referenced.has(sha) ? 'branch-or-tag' : allReferenced.has(sha) ? 'local-reference-only' : 'local-object-only';
        if (PRIVATE_FILE.test(name)) result.findings.push({ location, rule: 'private-file-in-history', reachability });
        if (BINARY.test(name) || raw.includes(0)) { result.binaryBlobs.push({ object: sha.slice(0, 12), file: name }); continue; }
        result.findings.push(...scanText(raw.toString('utf8'), location, patterns).map(f => ({ ...f, reachability })));
    }
    result.identities = identities.size;
    return result;
}
if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        const patterns = loadPrivatePatterns();
        const treeIndex = args.indexOf('--tree');
        const result = treeIndex >= 0 ? scanTree(path.resolve(args[treeIndex + 1]), patterns) :
            { workingTree: scanWorkingTree(patterns), ...(args.includes('--history') ? { history: scanHistory(patterns) } : {}) };
        console.log(JSON.stringify(result, null, 2));
        const count = result.findings ? result.findings.length : result.workingTree.findings.length + (result.history ? result.history.findings.length : 0);
        if (count) process.exitCode = 1;
    } catch (_) { console.error('Audit could not complete; no credential values were printed.'); process.exitCode = 2; }
}
module.exports = { scanText, scanTree, scanHistory, syntheticHost, loadPrivatePatterns };
