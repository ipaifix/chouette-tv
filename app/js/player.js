/* Chouette playback controller. Samsung and browser transports share lifecycle tokens. */
var Player = (function createPlaybackController() {
    'use strict';
    var projectionProfiles = [
        ['Original', 'AUTO_ASPECT_RATIO', 'contain', 1],
        ['Stretch', 'FULL_SCREEN', 'fill', 1],
        ['Letterbox', 'LETTER_BOX', 'contain', 1],
        ['Wide 4:3', 'FULL_SCREEN', 'contain', 4 / 3]
    ];
    var hasAvplay;
    try { hasAvplay = typeof webapis === 'object' && !!webapis.avplay; }
    catch (unavailable) { hasAvplay = false; }
    var modeIndex = 0, videoEl = null, customRect = null;
    var statusCb = function () {}, timeCb = function () {}, subtitleCb = function () {};
    var hlsInstance = null, hlsJsLoading = null, playbackToken = 0, autoplayResume = null;
    var pausedFlag = false, timePollTimer = null, TIME_POLL_MS = 500;
    var subtitlesSilent = false, selectedAudioIndex = -1, selectedTextIndex = -1;

    function attempt(operation) {
        try { return operation(); } catch (unsupported) { return undefined; }
    }

    function init(onStatus) {
        if (typeof onStatus === 'function') { statusCb = onStatus; }
        if (hasAvplay) { return; }
        videoEl = document.getElementById('html5-player');
        if (!videoEl) { return; }
        var nativeSurface = document.getElementById('av-player');
        if (nativeSurface) { nativeSurface.style.display = 'none'; }
        videoEl.style.display = 'block';
        var callbacks = {
            timeupdate: emitTime,
            pause: function () { pausedFlag = true; },
            play: function () { pausedFlag = false; },
            seeking: function () { statusCb('seeking'); },
            seeked: function () { statusCb('seeked'); emitTime(); },
            waiting: function () { statusCb('buffering'); },
            canplay: function () { if (!videoEl.paused) { statusCb('playing'); } }
        };
        Object.keys(callbacks).forEach(function (event) { videoEl.addEventListener(event, callbacks[event]); });
    }

    function setSubtitleHandler(cb) {
        subtitleCb = typeof cb === 'function' ? cb : function () {};
    }

    function emitSubtitle(text) {
        try { subtitleCb(text == null ? '' : String(text)); } catch (e) {}
    }

    function clearSubtitleDisplay() {
        emitSubtitle('');
    }

    function parseExtraInfo(raw) {
        if (!raw) { return {}; }
        if (typeof raw === 'object') { return raw; }
        try {
            return JSON.parse(raw) || {};
        } catch (e) {
            return {};
        }
    }

    function trackLangFromExtra(extra, type) {
        if (!extra) { return ''; }
        if (type === 'AUDIO') {
            return String(extra.language || extra.lang || extra.track_lang || '').trim();
        }
        return String(extra.track_lang || extra.language || extra.lang || '').trim();
    }

    function trackLabel(type, index, extra) {
        var lang = trackLangFromExtra(extra, type);
        var bits = [];
        if (extra.title || extra.name) { bits.push(String(extra.title || extra.name)); }
        if (lang) { bits.push(lang); }
        if (type === 'AUDIO' && extra.channels) {
            bits.push(extra.channels + 'ch');
        }
        if (type === 'AUDIO' && extra.fourCC) {
            bits.push(String(extra.fourCC));
        }
        if (type === 'TEXT' && extra.fourCC) {
            bits.push(String(extra.fourCC));
        }
        if (bits.length) { return bits.join(' · '); }
        return (type === 'AUDIO' ? 'Audio' : 'Subtitle') + ' ' + (index + 1);
    }

    function emitTime() {
        try {
            timeCb(getPosition(), getDuration());
        } catch (e) {}
    }

    function startTimePoll() {
        stopTimePoll();
        if (!hasAvplay) { return; }
        timePollTimer = setInterval(emitTime, TIME_POLL_MS);
    }

    function stopTimePoll() {
        if (timePollTimer) {
            clearInterval(timePollTimer);
            timePollTimer = null;
        }
    }

    function setTimeUpdate(cb) {
        timeCb = typeof cb === 'function' ? cb : function () {};
    }

    function applyDisplayMode() {
        var profile = projectionProfiles[modeIndex];
        var screenWidth = window.innerWidth || 1920, screenHeight = window.innerHeight || 1080;
        var rectangle = customRect || {
            x: Math.round(screenWidth * (1 - profile[3]) / 2), y: 0,
            w: Math.round(screenWidth * profile[3]), h: screenHeight
        };
        if (hasAvplay) {
            attempt(function () {
                var method = customRect ? 'AUTO_ASPECT_RATIO' : profile[1];
                webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_' + method);
            });
            var accepted = attempt(function () {
                webapis.avplay.setDisplayRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
                return true;
            });
            if (!accepted) {
                attempt(function () { webapis.avplay.setDisplayRect(0, 0, screenWidth, screenHeight); });
            }
        } else if (videoEl) {
            var layout = customRect ? { left: rectangle.x + 'px', top: rectangle.y + 'px',
                width: rectangle.w + 'px', height: rectangle.h + 'px', objectFit: 'contain', transform: '' }
                : { left: '0', top: '0', width: '100%', height: '100%', objectFit: profile[2],
                    transform: profile[3] === 1 ? '' : 'scaleX(' + profile[3] + ')' };
            Object.keys(layout).forEach(function (property) { videoEl.style[property] = layout[property]; });
        }
        return profile[0];
    }

    function setDisplayRect(x, y, width, height) {
        var rectangle = x == null || width == null || height == null ? null
            : { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
        var changed = JSON.stringify(customRect) !== JSON.stringify(rectangle);
        customRect = rectangle;
        if (changed) { applyDisplayMode(); }
        return getDisplayRect();
    }

    function clearDisplayRect() { setDisplayRect(null); }
    function getDisplayRect() {
        if (!customRect) { return null; }
        return JSON.parse(JSON.stringify(customRect));
    }
    function currentModeLabel() { return projectionProfiles[modeIndex][0]; }
    function cycleDisplayMode(direction) {
        var count = projectionProfiles.length;
        modeIndex = ((modeIndex + (direction || 1)) % count + count) % count;
        return applyDisplayMode();
    }

    function stop() {
        playbackToken++;
        clearAutoplayResume();
        stopTimePoll();
        pausedFlag = false;
        subtitlesSilent = false;
        selectedTextIndex = selectedAudioIndex = -1;
        emitSubtitle('');
        if (hasAvplay) {
            ['stop', 'close'].forEach(function (method) { attempt(function () { webapis.avplay[method](); }); });
            return;
        }
        if (!videoEl) { return; }
        ['onplaying', 'onended', 'onerror'].forEach(function (event) { videoEl[event] = null; });
        if (hlsInstance) { attempt(function () { hlsInstance.destroy(); }); hlsInstance = null; }
        attempt(function () { videoEl.pause(); });
        videoEl.removeAttribute('src');
        videoEl.load();
    }

    function play(address, options) {
        stop();
        if (hasAvplay) { openSamsung(address, options || {}); }
        else { openBrowser(address); }
    }

    function openSamsung(address, options) {
        var session = playbackToken;
        function guarded(action) {
            return function () { if (session === playbackToken) { action.apply(null, arguments); } };
        }
        function failure(error) { statusCb('error', error && error.message ? error.message : error); }
        try {
            var native = webapis.avplay;
            native.open(address);
            [['userAgent', 'USER_AGENT'], ['cookie', 'COOKIE']].forEach(function (setting) {
                if (options[setting[0]]) { attempt(function () { native.setStreamingProperty(setting[1], options[setting[0]]); }); }
            });
            var viewport = customRect || { x: 0, y: 0, w: window.innerWidth || 1920, h: window.innerHeight || 1080 };
            native.setDisplayRect(viewport.x, viewport.y, viewport.w, viewport.h);
            native.setListener({
                onerror: guarded(failure),
                onbufferingstart: guarded(function () { statusCb('buffering'); }),
                oncurrentplaytime: guarded(emitTime),
                onbufferingcomplete: guarded(function () { if (!pausedFlag) { statusCb('playing'); } emitTime(); }),
                onsubtitlechange: guarded(function (duration, text) { emitSubtitle(subtitlesSilent ? '' : text); }),
                onstreamcompleted: guarded(function () {
                    playbackToken++;
                    attempt(function () { native.stop(); });
                    stopTimePoll(); pausedFlag = false; emitSubtitle(''); statusCb('ended');
                })
            });
            native.prepareAsync(guarded(function () {
                try {
                    applyDisplayMode();
                    attempt(function () { native.setSilentSubtitle(false); });
                    subtitlesSilent = false;
                    native.play();
                    pausedFlag = false;
                    startTimePoll(); refreshSelectedFromStream(); statusCb('playing'); emitTime();
                } catch (error) { failure(error); }
            }), guarded(failure));
        } catch (error) { failure(error); }
    }

    function requestHls(ready) {
        if (window.Hls) { ready(window.Hls); return; }
        if (hlsJsLoading === null) {
            var resolveLibrary;
            hlsJsLoading = new Promise(function (resolve) { resolveLibrary = resolve; });
            var script = document.createElement('script');
            script.onload = function () { resolveLibrary(window.Hls || null); };
            script.onerror = function () { resolveLibrary(null); };
            script.src = ['https://cdn.jsdelivr.net/npm/', 'hls.js@1'].join('');
            document.head.appendChild(script);
        }
        hlsJsLoading.then(ready);
    }

    function openBrowser(address) {
        var session = playbackToken;
        if (!videoEl) { statusCb('error', 'Lecteur vidéo HTML5 introuvable'); return; }
        function current() { return session === playbackToken; }
        videoEl.onplaying = function () {
            if (!current()) { return; }
            clearAutoplayResume(); pausedFlag = false; statusCb('playing'); emitTime();
        };
        videoEl.onended = function () {
            if (current()) { playbackToken++; clearAutoplayResume(); pausedFlag = false; statusCb('ended'); }
        };
        videoEl.onerror = function () {
            if (current()) { statusCb('error', 'Ce navigateur ne peut pas lire cette vidéo'); }
        };
        applyDisplayMode();
        statusCb('buffering');
        var hls = /\.m3u8(?:[?#]|$)/i.test(address);
        if (!hls || videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = address;
            tryPlay(session);
            return;
        }
        requestHls(function (Library) {
            if (!current()) { return; }
            if (!Library || !Library.isSupported()) { statusCb('error', 'Lecture HLS indisponible dans ce navigateur'); return; }
            hlsInstance = new Library();
            hlsInstance.on(Library.Events.ERROR, function (event, error) {
                if (current() && error.fatal) { statusCb('error', 'Lecture HLS interrompue : ' + error.type); }
            });
            hlsInstance.attachMedia(videoEl);
            hlsInstance.loadSource(address);
            tryPlay(session);
        });
    }

    function clearAutoplayResume() {
        if (autoplayResume !== null) {
            ['click', 'keydown'].forEach(function (event) { document.removeEventListener(event, autoplayResume); });
            autoplayResume = null;
        }
    }

    function tryPlay(session) {
        session = session == null ? playbackToken : session;
        if (session !== playbackToken || !videoEl) { return; }
        var promise;
        try { promise = videoEl.play(); }
        catch (error) { statusCb('error', 'Lecture vidéo indisponible'); return; }
        if (!promise || typeof promise.catch !== 'function') { return; }
        promise.catch(function (error) {
            if (session !== playbackToken || !error || error.name !== 'NotAllowedError') { return; }
            clearAutoplayResume();
            autoplayResume = function () { clearAutoplayResume(); tryPlay(session); };
            ['click', 'keydown'].forEach(function (event) { document.addEventListener(event, autoplayResume); });
            statusCb('blocked');
        });
    }

    function pause() {
        if (hasAvplay) {
            try {
                var st = webapis.avplay.getState();
                if (st === 'PLAYING') {
                    webapis.avplay.pause();
                    pausedFlag = true;
                    statusCb('paused');
                    emitTime();
                    return true;
                }
            } catch (e) {}
            return false;
        }
        if (videoEl && !videoEl.paused) {
            videoEl.pause();
            pausedFlag = true;
            statusCb('paused');
            emitTime();
            return true;
        }
        return false;
    }

    function resume() {
        if (hasAvplay) {
            try {
                var st = webapis.avplay.getState();
                if (st === 'PAUSED') {
                    webapis.avplay.play();
                    pausedFlag = false;
                    statusCb('playing');
                    emitTime();
                    return true;
                }
                if (st === 'READY' || st === 'IDLE') {
                    webapis.avplay.play();
                    pausedFlag = false;
                    statusCb('playing');
                    return true;
                }
            } catch (e) {}
            return false;
        }
        if (videoEl && videoEl.paused) {
            tryPlay();
            pausedFlag = false;
            statusCb('playing');
            emitTime();
            return true;
        }
        return false;
    }

    function togglePause() {
        if (isPaused()) {
            resume();
            return false;
        }
        pause();
        return true;
    }

    function isPaused() {
        if (hasAvplay) {
            try {
                return webapis.avplay.getState() === 'PAUSED';
            } catch (e) {
                return pausedFlag;
            }
        }
        if (videoEl) { return !!videoEl.paused; }
        return pausedFlag;
    }

    /* Position / duration in seconds (AVPlay APIs return ms). */
    function getPosition() {
        if (hasAvplay) {
            try {
                var t = webapis.avplay.getCurrentTime();
                return (typeof t === 'number' && t >= 0) ? t / 1000 : 0;
            } catch (e) {
                return 0;
            }
        }
        if (videoEl) {
            var ct = videoEl.currentTime;
            return (typeof ct === 'number' && isFinite(ct) && ct >= 0) ? ct : 0;
        }
        return 0;
    }

    function getDuration() {
        if (hasAvplay) {
            try {
                var d = webapis.avplay.getDuration();
                return (typeof d === 'number' && d > 0) ? d / 1000 : 0;
            } catch (e) {
                return 0;
            }
        }
        if (videoEl) {
            var d2 = videoEl.duration;
            return (typeof d2 === 'number' && isFinite(d2) && d2 > 0) ? d2 : 0;
        }
        return 0;
    }

    function seekTo(seconds) {
        var token = playbackToken;
        seconds = Number(seconds);
        if (!isFinite(seconds) || seconds < 0) { seconds = 0; }
        var dur = getDuration();
        if (dur > 0) {
            seconds = Math.min(seconds, Math.max(0, dur - 0.5));
        }
        if (hasAvplay) {
            try {
                var ms = Math.round(seconds * 1000);
                statusCb('seeking');
                webapis.avplay.seekTo(ms, function () {
                    if (token !== playbackToken) { return; }
                    emitTime();
                    statusCb('seeked');
                }, function () {
                    if (token !== playbackToken) { return; }
                    emitTime();
                    statusCb('seeked');
                });
                return true;
            } catch (e) {
                try {
                    webapis.avplay.seekTo(Math.round(seconds * 1000));
                    emitTime();
                    statusCb('seeked');
                    return true;
                } catch (e2) {
                    return false;
                }
            }
        }
        if (videoEl) {
            try {
                videoEl.currentTime = seconds;
                emitTime();
                return true;
            } catch (e3) {
                return false;
            }
        }
        return false;
    }

    function decoderLifecycle(method) {
        if (hasAvplay) { attempt(function () { webapis.avplay[method](); }); }
    }
    function suspend() { decoderLifecycle('suspend'); }
    function restore() { decoderLifecycle('restore'); }

    function refreshSelectedFromStream() {
        if (hasAvplay) {
            try {
                var cur = webapis.avplay.getCurrentStreamInfo();
                if (!cur || !cur.length) { return; }
                for (var i = 0; i < cur.length; i++) {
                    var t = cur[i];
                    if (!t) { continue; }
                    if (t.type === 'AUDIO') { selectedAudioIndex = Number(t.index); }
                    if (t.type === 'TEXT' && !subtitlesSilent) { selectedTextIndex = Number(t.index); }
                }
            } catch (e) {}
            return;
        }
        if (videoEl && videoEl.audioTracks) {
            for (var a = 0; a < videoEl.audioTracks.length; a++) {
                if (videoEl.audioTracks[a].enabled) {
                    selectedAudioIndex = a;
                    break;
                }
            }
        }
        if (videoEl && videoEl.textTracks) {
            selectedTextIndex = -1;
            for (var s = 0; s < videoEl.textTracks.length; s++) {
                if (videoEl.textTracks[s].mode === 'showing') {
                    selectedTextIndex = s;
                    break;
                }
            }
        }
    }

    function getTracks() {
        var audio = [];
        var text = [];
        if (hasAvplay) {
            try {
                var all = webapis.avplay.getTotalTrackInfo() || [];
                for (var i = 0; i < all.length; i++) {
                    var tr = all[i];
                    if (!tr) { continue; }
                    var extra = parseExtraInfo(tr.extra_info);
                    var idx = Number(tr.index);
                    var entry = {
                        index: idx,
                        type: tr.type,
                        lang: trackLangFromExtra(extra, tr.type),
                        label: trackLabel(tr.type, idx, extra),
                        extra: extra
                    };
                    if (tr.type === 'AUDIO') { audio.push(entry); }
                    else if (tr.type === 'TEXT') { text.push(entry); }
                }
            } catch (e) {}
            refreshSelectedFromStream();
            return {
                audio: audio,
                text: text,
                selectedAudio: selectedAudioIndex,
                selectedText: subtitlesSilent ? -1 : selectedTextIndex
            };
        }

        if (videoEl && videoEl.audioTracks && videoEl.audioTracks.length) {
            for (var a = 0; a < videoEl.audioTracks.length; a++) {
                var at = videoEl.audioTracks[a];
                audio.push({
                    index: a,
                    type: 'AUDIO',
                    lang: String(at.language || '').trim(),
                    label: (at.label || at.language || ('Audio ' + (a + 1))),
                    extra: {}
                });
                if (at.enabled) { selectedAudioIndex = a; }
            }
        }
        if (videoEl && videoEl.textTracks && videoEl.textTracks.length) {
            for (var s = 0; s < videoEl.textTracks.length; s++) {
                var st = videoEl.textTracks[s];
                /* Skip metadata tracks */
                if (st.kind && st.kind !== 'subtitles' && st.kind !== 'captions') { continue; }
                text.push({
                    index: s,
                    type: 'TEXT',
                    lang: String(st.language || '').trim(),
                    label: (st.label || st.language || ('Subtitle ' + (s + 1))),
                    extra: {}
                });
                if (st.mode === 'showing') { selectedTextIndex = s; }
            }
        }
        return {
            audio: audio,
            text: text,
            selectedAudio: selectedAudioIndex,
            selectedText: selectedTextIndex
        };
    }

    function selectAudioTrack(index) {
        index = Number(index);
        if (!isFinite(index) || index < 0) { return false; }
        if (hasAvplay) {
            try {
                webapis.avplay.setSelectTrack('AUDIO', index);
                selectedAudioIndex = index;
                return true;
            } catch (e) {
                return false;
            }
        }
        if (videoEl && videoEl.audioTracks && videoEl.audioTracks.length > index) {
            for (var i = 0; i < videoEl.audioTracks.length; i++) {
                videoEl.audioTracks[i].enabled = (i === index);
            }
            selectedAudioIndex = index;
            return true;
        }
        return false;
    }

    function selectSubtitleTrack(index) {
        /* index < 0 → subtitles off */
        if (index == null || index < 0) {
            return setSubtitlesOff();
        }
        index = Number(index);
        if (!isFinite(index) || index < 0) { return false; }

        if (hasAvplay) {
            try {
                try { webapis.avplay.setSilentSubtitle(false); } catch (e1) {}
                subtitlesSilent = false;
                webapis.avplay.setSelectTrack('TEXT', index);
                selectedTextIndex = index;
                return true;
            } catch (e) {
                return false;
            }
        }
        if (videoEl && videoEl.textTracks) {
            for (var i = 0; i < videoEl.textTracks.length; i++) {
                var kind = videoEl.textTracks[i].kind;
                if (kind && kind !== 'subtitles' && kind !== 'captions') { continue; }
                videoEl.textTracks[i].mode = (i === index) ? 'showing' : 'disabled';
            }
            selectedTextIndex = index;
            return true;
        }
        return false;
    }

    function setSubtitlesOff() {
        clearSubtitleDisplay();
        selectedTextIndex = -1;
        if (hasAvplay) {
            try {
                webapis.avplay.setSilentSubtitle(true);
                subtitlesSilent = true;
                return true;
            } catch (e) {
                subtitlesSilent = true;
                return false;
            }
        }
        if (videoEl && videoEl.textTracks) {
            for (var i = 0; i < videoEl.textTracks.length; i++) {
                videoEl.textTracks[i].mode = 'disabled';
            }
            return true;
        }
        return true;
    }

    /*
     * Prefer language codes (e.g. "fra", "fr", "eng"). Matches prefix
     * (fr ↔ fra). audioPref / subPref: language string; subPref "off" disables.
     */
    function applyPreferredTracks(audioPref, subPref, originalLanguage) {
        var tracks = getTracks();
        var applied = { audio: false, text: false };
        if (audioPref === 'original') {
            audioPref = originalLanguage || '';
            if (!audioPref) {
                for (var oi = 0; oi < tracks.audio.length; oi++) {
                    if (/\b(original|vo)\b/i.test(tracks.audio[oi].label || '')) {
                        applied.audio = selectAudioTrack(tracks.audio[oi].index);
                        break;
                    }
                }
                applied.originalUnknown = !applied.audio;
            }
        }

        function matchLang(pref, lang) {
            if (!pref || !lang) { return false; }
            pref = String(pref).toLowerCase();
            lang = String(lang).toLowerCase();
            return lang === pref || lang.indexOf(pref) === 0 || pref.indexOf(lang) === 0;
        }

        if (audioPref && tracks.audio.length) {
            for (var i = 0; i < tracks.audio.length; i++) {
                if (matchLang(audioPref, tracks.audio[i].lang)) {
                    applied.audio = selectAudioTrack(tracks.audio[i].index);
                    break;
                }
            }
        }

        if (subPref === 'off' || subPref === '') {
            applied.text = setSubtitlesOff();
        } else if (subPref && tracks.text.length) {
            for (var j = 0; j < tracks.text.length; j++) {
                if (matchLang(subPref, tracks.text[j].lang)) {
                    applied.text = selectSubtitleTrack(tracks.text[j].index);
                    break;
                }
            }
        }
        return applied;
    }

    function mapVideoCodec(fourCC) {
        var c = String(fourCC || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!c) { return ''; }
        if (c === 'H264' || c === 'AVC1' || c === 'AVC' || c === 'X264') { return 'H.264'; }
        if (c === 'H265' || c === 'HEVC' || c === 'HVC1' || c === 'HEV1') { return 'HEVC'; }
        if (c === 'AV01' || c === 'AV1') { return 'AV1'; }
        if (c === 'VP09' || c === 'VP9') { return 'VP9'; }
        if (c === 'VP08' || c === 'VP8') { return 'VP8'; }
        if (c === 'MPEG' || c === 'MP2V' || c === 'MP4V') { return 'MPEG'; }
        return String(fourCC);
    }

    function mapAudioCodec(fourCC) {
        var c = String(fourCC || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!c) { return ''; }
        if (c === 'AACL' || c === 'AAC' || c === 'MP4A' || c === 'AACLC') { return 'AAC'; }
        if (c === 'AC3' || c === 'A52') { return 'Dolby Digital'; }
        if (c === 'EC3' || c === 'EAC3' || c === 'EAC') { return 'Dolby Digital Plus'; }
        if (c === 'AC4') { return 'Dolby AC-4'; }
        if (c === 'MLPA' || c === 'TRUEHD' || c === 'THD') { return 'Dolby TrueHD'; }
        if (c === 'DTS' || c === 'DTS1' || c === 'DTS2') { return 'DTS'; }
        if (c === 'DTSH' || c === 'DTSX' || c === 'DTSHD') { return 'DTS-HD'; }
        if (c === 'OPUS') { return 'Opus'; }
        if (c === 'MP3' || c === 'MPA') { return 'MP3'; }
        if (c === 'FLAC') { return 'FLAC'; }
        if (c === 'PCM' || c === 'LPCM' || c === 'SOWT') { return 'PCM'; }
        return String(fourCC);
    }

    function channelLayoutLabel(channels) {
        var n = Number(channels);
        if (!isFinite(n) || n <= 0) { return ''; }
        if (n === 1) { return 'Mono'; }
        if (n === 2) { return 'Stéréo'; }
        if (n === 6) { return '5.1'; }
        if (n === 8) { return '7.1'; }
        return n + 'ch';
    }

    function resolutionLabel(w, h) {
        w = Number(w) || 0;
        h = Number(h) || 0;
        var longEdge = Math.max(w, h);
        var shortEdge = Math.min(w, h);
        if (longEdge >= 3800 || shortEdge >= 2100) { return '4K UHD'; }
        if (longEdge >= 2500 || shortEdge >= 1400) { return 'QHD'; }
        if (longEdge >= 1800 || shortEdge >= 1000) { return 'FHD'; }
        if (longEdge >= 1200 || shortEdge >= 700) { return 'HD'; }
        if (longEdge > 0 || shortEdge > 0) { return 'SD'; }
        return '';
    }

    function formatBitrate(bps) {
        var n = Number(String(bps == null ? '' : bps).replace(/\s+/g, ''));
        if (!isFinite(n) || n <= 0) { return ''; }
        if (n >= 1000000) { return (Math.round(n / 100000) / 10) + ' Mb/s'; }
        if (n >= 1000) { return Math.round(n / 1000) + ' kb/s'; }
        return n + ' b/s';
    }

    /*
     * Stream quality from AVPlay track extra_info (Width/Height/fourCC/…)
     * or HTML5 videoWidth/videoHeight. HDR / Atmos / IMAX are rarely in
     * AVPlay metadata — pass hintText (channel/title) for name-based tags.
     */
    function getStreamQuality(hintText) {
        var out = {
            width: 0,
            height: 0,
            resolution: '',
            videoCodec: '',
            videoBitrate: '',
            audioCodec: '',
            audioLayout: '',
            audioLang: '',
            hdr: '',
            atmos: false,
            imax: false,
            badges: []
        };
        var videoExtra = null;
        var audioExtra = null;

        if (hasAvplay) {
            try {
                var all = webapis.avplay.getTotalTrackInfo() || [];
                refreshSelectedFromStream();
                for (var i = 0; i < all.length; i++) {
                    var tr = all[i];
                    if (!tr) { continue; }
                    var extra = parseExtraInfo(tr.extra_info);
                    if (tr.type === 'VIDEO' && !videoExtra) { videoExtra = extra; }
                    if (tr.type === 'AUDIO') {
                        var aIdx = Number(tr.index);
                        if (selectedAudioIndex >= 0) {
                            if (aIdx === selectedAudioIndex) { audioExtra = extra; }
                        } else if (!audioExtra) {
                            audioExtra = extra;
                        }
                    }
                }
                /* Prefer current stream when available (adaptive may differ). */
                try {
                    var cur = webapis.avplay.getCurrentStreamInfo() || [];
                    for (var c = 0; c < cur.length; c++) {
                        var ct = cur[c];
                        if (!ct) { continue; }
                        var cx = parseExtraInfo(ct.extra_info);
                        if (ct.type === 'VIDEO') { videoExtra = cx; }
                        if (ct.type === 'AUDIO') { audioExtra = cx; }
                    }
                } catch (eCur) {}
            } catch (e) {}
        } else if (videoEl) {
            out.width = videoEl.videoWidth || 0;
            out.height = videoEl.videoHeight || 0;
        }

        if (videoExtra) {
            out.width = Number(videoExtra.Width || videoExtra.width || 0) || out.width;
            out.height = Number(videoExtra.Height || videoExtra.height || 0) || out.height;
            out.videoCodec = mapVideoCodec(videoExtra.fourCC || videoExtra.FourCC);
            out.videoBitrate = formatBitrate(videoExtra.Bit_rate || videoExtra.bit_rate || videoExtra.bitrate);
        }
        out.resolution = resolutionLabel(out.width, out.height);

        if (audioExtra) {
            out.audioCodec = mapAudioCodec(audioExtra.fourCC || audioExtra.FourCC);
            out.audioLayout = channelLayoutLabel(audioExtra.channels || audioExtra.channel);
            out.audioLang = String(audioExtra.language || audioExtra.lang || '').trim();
        }

        var hint = String(hintText || '');
        var hintUp = hint.toUpperCase();
        if (/\bDOLBY\s*VISION\b|\bDV\b/.test(hintUp) || /DOLBY.?VISION/i.test(hint)) {
            out.hdr = 'Dolby Vision';
        } else if (/\bHDR10\+?\b/.test(hintUp)) {
            out.hdr = /HDR10\+/.test(hintUp) ? 'HDR10+' : 'HDR10';
        } else if (/\bHLG\b/.test(hintUp)) {
            out.hdr = 'HLG';
        } else if (/\bHDR\b/.test(hintUp)) {
            out.hdr = 'HDR';
        }
        if (/\bATMOS\b/.test(hintUp)) { out.atmos = true; }
        if (/\bIMAX\b/.test(hintUp)) { out.imax = true; }

        /* Also sniff HDR-ish fields some firmwares may expose. */
        if (!out.hdr && videoExtra) {
            var hdrRaw = String(
                videoExtra.hdr || videoExtra.HDR || videoExtra.hdr_type ||
                videoExtra.transfer_characteristics || ''
            ).toLowerCase();
            if (hdrRaw.indexOf('dolby') >= 0 || hdrRaw.indexOf('dv') >= 0) {
                out.hdr = 'Dolby Vision';
            } else if (hdrRaw.indexOf('hlg') >= 0) {
                out.hdr = 'HLG';
            } else if (hdrRaw.indexOf('hdr10+') >= 0) {
                out.hdr = 'HDR10+';
            } else if (hdrRaw.indexOf('hdr') >= 0) {
                out.hdr = 'HDR';
            }
        }

        if (out.resolution) { out.badges.push(out.resolution); }
        else if (out.width && out.height) {
            out.badges.push(out.width + '×' + out.height);
        }
        if (out.videoCodec) { out.badges.push(out.videoCodec); }
        if (out.hdr) { out.badges.push(out.hdr); }
        if (out.imax) { out.badges.push('IMAX'); }
        if (out.atmos) {
            out.badges.push('Dolby Atmos');
        } else if (out.audioCodec) {
            var audioBadge = out.audioCodec;
            if (out.audioLayout) { audioBadge += ' · ' + out.audioLayout; }
            out.badges.push(audioBadge);
        } else if (out.audioLayout) {
            out.badges.push(out.audioLayout);
        }
        if (out.videoBitrate) { out.badges.push(out.videoBitrate); }

        return out;
    }

    return {
        init: init,
        play: play,
        stop: stop,
        pause: pause,
        resume: resume,
        togglePause: togglePause,
        isPaused: isPaused,
        getPosition: getPosition,
        getPlaybackToken: function () { return playbackToken; },
        getDuration: getDuration,
        seekTo: seekTo,
        setTimeUpdate: setTimeUpdate,
        setSubtitleHandler: setSubtitleHandler,
        cycleDisplayMode: cycleDisplayMode,
        currentModeLabel: currentModeLabel,
        setDisplayRect: setDisplayRect,
        clearDisplayRect: clearDisplayRect,
        getDisplayRect: getDisplayRect,
        getTracks: getTracks,
        getStreamQuality: getStreamQuality,
        selectAudioTrack: selectAudioTrack,
        selectSubtitleTrack: selectSubtitleTrack,
        setSubtitlesOff: setSubtitlesOff,
        applyPreferredTracks: applyPreferredTracks,
        suspend: suspend,
        restore: restore
    };
}());
