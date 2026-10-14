#!/usr/bin/env node
/* Select guide sources from a playlist and a local iptv-org/epg checkout. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { events, escape } = require('./guide-format');

function playlistIds(file) {
    const sandbox = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/js/playlist.js'), 'utf8'), sandbox);
    return new Set(sandbox.Playlist.parse(fs.readFileSync(file, 'utf8')).channels.map(channel => channel.id).filter(Boolean));
}

function selectSources(identifiers, directory, preferred = [], blocked = []) {
    const chosen = new Map();
    const priorities = new Map(preferred.map((site, index) => [site, index]));
    const sites = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory() && !blocked.includes(entry.name))
        .map(entry => entry.name).sort((a, b) => (priorities.get(a) ?? preferred.length) - (priorities.get(b) ?? preferred.length) || a.localeCompare(b));
    for (const site of sites) {
        const folder = path.join(directory, site);
        const candidates = new Map();
        for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.channels.xml')).sort()) {
            let channel = null;
            for (const item of events(fs.readFileSync(path.join(folder, file), 'utf8'))) {
                if (item.type === 'start' && item.name === 'channel') channel = { ...item.attributes, text: '' };
                else if (item.type === 'text' && channel) channel.text += item.value;
                else if (item.type === 'end' && item.name === 'channel' && channel) {
                    const identity = channel.xmltv_id || '', [base, feed = ''] = identity.split('@');
                    if (identifiers.has(base) && !chosen.has(base)) {
                        const weight = !feed ? 0 : /english/i.test(feed) ? 1 : /^hd$/i.test(feed) ? 2 : /^sd$/i.test(feed) ? 3 : 4;
                        const previous = candidates.get(base);
                        if (!previous || weight < previous.weight) candidates.set(base, { ...channel, weight, site });
                    }
                    channel = null;
                }
            }
        }
        for (const [id, channel] of candidates) chosen.set(id, channel);
    }
    return chosen;
}

function main(args) {
    if (args.length !== 2) throw Error('Usage: node tools/make-channels.js playlist.m3u epg-sites-directory');
    const wanted = playlistIds(args[0]);
    const list = value => (value || '').split(',').map(site => site.trim()).filter(Boolean);
    const selected = selectSources(wanted, args[1], list(process.env.EPG_SITE_ORDER), list(process.env.EPG_SKIP_SITES));
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<channels>'];
    for (const key of [...selected.keys()].sort()) {
        const record = selected.get(key);
        const fields = { site: record.site, lang: record.lang || 'en', xmltv_id: record.xmltv_id, site_id: record.site_id || '' };
        const attributes = Object.entries(fields).map(([name, value]) => `${name}="${escape(value)}"`).join(' ');
        lines.push(`  <channel ${attributes}>${escape(record.text.trim())}</channel>`);
    }
    process.stdout.write(lines.concat('</channels>', '').join('\n'));
    process.stderr.write(`Guide sources selected: ${selected.size}/${wanted.size}\n`);
    // Report a count only: playlist identifiers can reveal private catalogues.
    if (selected.size < wanted.size) process.stderr.write(`Missing guide sources: ${wanted.size - selected.size}\n`);
}
if (require.main === module) {
    try { main(process.argv.slice(2)); } catch (_) { console.error('Guide source selection failed; check the local input files.'); process.exitCode = 1; }
}
module.exports = { selectSources };
