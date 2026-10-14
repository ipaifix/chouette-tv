#!/usr/bin/env node
/* Project XMLTV events into a bounded channel map for the Chouette reader. */
'use strict';
const fs = require('node:fs');
const { events, guideTime } = require('./guide-format');

function convert(document, clock = Date.now()) {
    const channels = Object.create(null), stack = [];
    const bounds = { from: clock - 3600000, to: clock + 172800000 };
    let programme = null, total = 0, kept = 0, root = false;
    for (const item of events(document)) {
        if (item.type === 'start') {
            if (!stack.length) {
                if (root || item.name !== 'tv') throw Error('Expected XMLTV root');
                root = true;
            }
            stack.push(item.name);
            if (item.name === 'programme' && stack.length === 2) {
                total++;
                const props = item.attributes;
                const begin = guideTime(props.start), finish = guideTime(props.stop);
                programme = { channel: String(props.channel || '').split('@')[0],
                    start: begin, stop: Number.isFinite(finish) ? Math.max(begin, finish) : begin,
                    title: '', captureTitle: false, titleComplete: false };
            }
            if (programme && item.name === 'title') programme.captureTitle = !programme.titleComplete;
        } else if (item.type === 'text') {
            if (!stack.length && item.value.trim()) throw Error('Text outside XMLTV');
            if (programme && programme.captureTitle && stack[stack.length - 1] === 'title') programme.title += item.value;
        } else {
            stack.pop();
            if (programme && item.name === 'title') { programme.titleComplete = true; programme.captureTitle = false; }
            if (item.name !== 'programme' || !programme) continue;
            const row = programme; programme = null;
            if (!row.channel || !Number.isFinite(row.start) || row.stop < bounds.from || row.start > bounds.to) continue;
            const target = channels[row.channel] || (channels[row.channel] = []);
            target.push({ title: row.title.trim(), stop: Math.round(row.stop / 1000), start: Math.round(row.start / 1000) });
            kept++;
        }
    }
    if (!root) throw Error('Empty XMLTV document');
    Object.values(channels).forEach(schedule => schedule.sort((first, second) => first.start - second.start));
    return { channels, total, kept };
}
if (require.main === module) {
    try {
        if (process.argv.length !== 3) throw Error('Expected guide path');
        const result = convert(fs.readFileSync(process.argv[2], 'utf8'));
        process.stdout.write(JSON.stringify(result.channels));
        console.error(`Guide entries selected: ${result.kept}/${result.total}; channels: ${Object.keys(result.channels).length}`);
    } catch (_) { console.error('Guide conversion failed; check the local XMLTV file.'); process.exitCode = 1; }
}
module.exports = { convert };
