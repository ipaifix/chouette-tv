/* VOD controls: bar, scrub, watch overlay, resume dialog */
var App = App || {};
(function (App) {
    'use strict';

    App.formatPlaybackTime = function (sec) {
        sec = Math.max(0, Math.floor(Number(sec) || 0));
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        var mm = (m < 10 && h > 0 ? '0' : '') + m;
        var ss = (s < 10 ? '0' : '') + s;
        return h > 0 ? (h + ':' + mm + ':' + ss) : (m + ':' + ss);
    }

    App.updateVodProgressUi = function (pos, dur) {
        App.lastKnownPos = pos || 0;
        App.lastKnownDur = dur || 0;
        var displayPos = (App.scrubTargetSec != null) ? App.scrubTargetSec : pos;
        if (App.$vodTimeCur) { App.$vodTimeCur.textContent = App.formatPlaybackTime(displayPos); }
        if (App.$vodTimeDur) {
            App.$vodTimeDur.textContent = dur > 0 ? App.formatPlaybackTime(dur) : '--:--';
        }
        var pct = (dur > 0) ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
        if (App.$vodBarFill) { App.$vodBarFill.style.width = pct + '%'; }
        if (Player.isPaused() && App.$vodBarBuf) {
            App.$vodBarBuf.style.width = '0%';
        }
        App.updateVodScrubUi(dur);
    }

    App.updateVodScrubUi = function (dur) {
        dur = dur > 0 ? dur : App.lastKnownDur;
        if (!App.$vodBarScrub) { return; }
        if (App.scrubTargetSec == null || !(dur > 0)) {
            App.$vodBarScrub.classList.add('hidden');
            return;
        }
        var pct = Math.min(100, Math.max(0, (App.scrubTargetSec / dur) * 100));
        App.$vodBarScrub.style.left = pct + '%';
        App.$vodBarScrub.classList.remove('hidden');
    }

    App.updateAspectActionLabels = function () {
        var label = 'Aspect · ' + Player.currentModeLabel();
        if (App.$vodActionAspect) { App.$vodActionAspect.textContent = label; }
        if (App.$infoActionAspect) { App.$infoActionAspect.textContent = label; }
        if (App.$infoMode) { App.$infoMode.textContent = Player.currentModeLabel(); }
    }

    App.cycleAspectFromOverlay = function () {
        var mode = Player.cycleDisplayMode(1);
        App.updateAspectActionLabels();
        App.toast('Aspect: ' + mode);
        return mode;
    }

    App.updateVodFocusUi = function () {
        if (typeof App.updateVodFollowUi === 'function') { App.updateVodFollowUi(); }
        if (App.$vodActionAspect) {
            App.$vodActionAspect.className = 'watch-action' + (App.vodFocus === 'aspect' ? ' focused' : '');
        }
        if (App.$vodActionSubs) {
            App.$vodActionSubs.className = 'watch-action' + (App.vodFocus === 'subs' ? ' focused' : '');
        }
        if (App.$vodActionFollow) {
            var followOn = App.$vodActionFollow.classList.contains('is-on');
            App.$vodActionFollow.className = 'watch-action' +
                (App.vodFocus === 'follow' ? ' focused' : '') +
                (followOn ? ' is-on' : '') +
                (App.$vodActionFollow.classList.contains('hidden') ? ' hidden' : '');
        }
        if (App.$vodBar) {
            if (App.vodFocus === 'seek') { App.$vodBar.classList.add('is-focused'); }
            else { App.$vodBar.classList.remove('is-focused'); }
        }
        App.updateAspectActionLabels();
        App.updateVodPlayStatusUi();
    }

    App.vodBottomFocusables = function () {
        var list = ['aspect', 'subs'];
        var ch = App.playingItem();
        if (ch && ch.kind === 'episode' && App.$vodActionFollow &&
            !App.$vodActionFollow.classList.contains('hidden')) {
            list.push('follow');
        }
        return list;
    };

    App.updateVodFollowUi = function () {
        if (!App.$vodActionFollow) { return; }
        var ch = App.playingItem();
        var show = !!(ch && ch.kind === 'episode' &&
            (ch.seriesId || (App.activeSeries && App.activeSeries.seriesId)));
        if (!show) {
            App.$vodActionFollow.classList.add('hidden');
            App.$vodActionFollow.classList.remove('is-on');
            if (App.vodFocus === 'follow') { App.vodFocus = 'aspect'; }
            return;
        }
        App.$vodActionFollow.classList.remove('hidden');
        var on = typeof App.isFollowedSeries === 'function' && App.isFollowedSeries(ch);
        App.$vodActionFollow.textContent = on ? 'Suivie' : 'Suivre';
        if (on) { App.$vodActionFollow.classList.add('is-on'); }
        else { App.$vodActionFollow.classList.remove('is-on'); }
    };

    /* Vertical only: timeline (seek) ↔ bottom row (aspect default). */
    App.moveVodFocus = function (dir) {
        if (dir > 0) {
            if (App.vodFocus !== 'seek') { return false; }
            App.vodFocus = 'aspect';
            App.updateVodFocusUi();
            return true;
        }
        if (App.vodFocus !== 'seek') {
            App.vodFocus = 'seek';
            App.updateVodFocusUi();
            return true;
        }
        return false;
    }

    /* Bottom row: Aspect ↔ Audio & sous-titres ↔ Suivre. */
    App.toggleVodBottomFocus = function (dir) {
        dir = dir == null ? 1 : dir;
        var actions = App.vodBottomFocusables();
        if (!actions.length) { return false; }
        var i = actions.indexOf(App.vodFocus);
        if (i < 0) { return false; }
        var next = i + dir;
        if (next < 0 || next >= actions.length) { return true; }
        App.vodFocus = actions[next];
        App.updateVodFocusUi();
        return true;
    }

    App.updateVodPlayStatusUi = function () {
        if (!App.$vodPlayStatus) { return; }
        var paused = Player.isPaused();
        App.$vodPlayStatus.textContent = paused ? '❚❚' : '▶';
        if (paused) { App.$vodPlayStatus.classList.add('is-paused'); }
        else { App.$vodPlayStatus.classList.remove('is-paused'); }
    }

    App.clearVodScrub = function () {
        App.scrubTargetSec = null;
        if (App.$vodBarScrub) { App.$vodBarScrub.classList.add('hidden'); }
        App.resetScrubHold();
    }

    App.resetScrubHold = function () {
        App.scrubHoldStart = 0;
        App.scrubHoldDir = 0;
    };

    /* Short press ≈ 5s; hold accelerates up to SEEK_HOLD_MAX_SEC. */
    App.scrubStepForHold = function (dir) {
        var now = Date.now();
        var base = App.SEEK_STEP_SEC || 5;
        var max = App.SEEK_HOLD_MAX_SEC || 60;
        if (!App.scrubHoldStart || App.scrubHoldDir !== dir) {
            App.scrubHoldStart = now;
            App.scrubHoldDir = dir;
            return base;
        }
        var elapsed = now - App.scrubHoldStart;
        var step = base + Math.floor(elapsed / 350) * 5;
        return Math.min(max, step);
    };

    App.setVodBufferingUi = function (on) {
        if (!App.$vodBarBuf) { return; }
        App.$vodBarBuf.style.width = on ? '100%' : '0%';
    }

    App.showVodPauseIndicator = function (paused) {
        if (!App.$vodPause) { return; }
        clearTimeout(App.playFlashTimer);
        App.updateVodPlayStatusUi();
        if (paused) {
            App.$vodPause.textContent = '❚❚';
            App.$vodPause.classList.remove('is-play');
            App.$vodPause.classList.remove('hidden');
        } else {
            App.$vodPause.textContent = '▶';
            App.$vodPause.classList.add('is-play');
            App.$vodPause.classList.remove('hidden');
            App.playFlashTimer = setTimeout(function () {
                if (!App.$vodPause) { return; }
                App.$vodPause.classList.add('hidden');
                App.$vodPause.classList.remove('is-play');
            }, 700);
        }
    }

    App.hideVodPauseIndicator = function () {
        clearTimeout(App.playFlashTimer);
        if (!App.$vodPause) { return; }
        App.$vodPause.classList.add('hidden');
        App.$vodPause.classList.remove('is-play');
    }

    App.showVodControls = function (keepOpen) {
        if (!App.$vodControls) { return; }
        if (!App.isSeekablePlaying()) { return; }
        if (App.uiState !== 'watch') { return; }
        var ch = App.playingItem();
        if (App.$vodTitle) {
            App.$vodTitle.textContent = ch
                ? (typeof App.displayCatalogTitle === 'function'
                    ? App.displayCatalogTitle(ch.name)
                    : ch.name)
                : '';
        }
        if (typeof App.fillStreamQualityEl === 'function') {
            App.fillStreamQualityEl(App.$vodQuality, ch ? ch.name : '');
        }
        if (!App.vodBarVisible) {
            App.vodFocus = 'seek';
            App.clearVodScrub();
        }
        App.updateVodFollowUi();
        App.updateVodProgressUi(Player.getPosition(), Player.getDuration());
        App.updateVodFocusUi();
        App.$vodControls.classList.remove('hidden');
        App.vodBarVisible = true;
        clearTimeout(App.vodBarTimer);
        if (!keepOpen && !Player.isPaused() && App.scrubTargetSec == null) {
            App.vodBarTimer = setTimeout(App.hideVodControls, App.VOD_BAR_HIDE_MS);
        }
    }

    App.hideVodControls = function () {
        clearTimeout(App.vodBarTimer);
        App.vodBarTimer = null;
        App.vodBarVisible = false;
        App.clearVodScrub();
        App.vodFocus = 'seek';
        if (App.$vodControls) { App.$vodControls.classList.add('hidden'); }
        if (App.$vodBar) { App.$vodBar.classList.remove('is-focused'); }
    }

    App.bumpVodControls = function () {
        App.showVodControls(Player.isPaused() || App.scrubTargetSec != null);
    }

    App.openWatchOverlay = function () {
        if (App.isSeekablePlaying()) {
            App.showVodControls(true);
            return;
        }
        if (App.playingItem()) { App.showInfo(); }
    }

    App.isWatchOverlayOpen = function () {
        if (App.isSeekablePlaying()) { return App.vodBarVisible; }
        return !!(App.playingItem() && App.$infoBar && !App.$infoBar.classList.contains('hidden'));
    }

    App.closeWatchOverlay = function () {
        if (App.isSeekablePlaying() && App.vodBarVisible) {
            if (App.scrubTargetSec != null) {
                App.clearVodScrub();
                App.updateVodProgressUi(Player.getPosition(), Player.getDuration());
            }
            App.hideVodControls();
            return true;
        }
        if (App.$infoBar && !App.$infoBar.classList.contains('hidden')) {
            App.hideInfo();
            return true;
        }
        return false;
    }

    App.scrubVod = function (deltaSec) {
        if (!App.isSeekablePlaying()) { return; }
        var pos = Player.getPosition();
        var dur = Player.getDuration();
        if (!(dur > 0) && App.lastKnownDur > 0) { dur = App.lastKnownDur; }
        var base = App.scrubTargetSec != null ? App.scrubTargetSec
            : (pos > 0 ? pos : App.lastKnownPos);
        var target = Math.max(0, base + deltaSec);
        if (dur > 0) { target = Math.min(target, Math.max(0, dur - 0.5)); }
        App.scrubTargetSec = target;
        App.vodFocus = 'seek';
        App.showVodControls(true);
        App.updateVodProgressUi(pos, dur);
        App.updateVodFocusUi();
    }

    App.confirmVodScrub = function () {
        if (App.scrubTargetSec == null) { return false; }
        var target = App.scrubTargetSec;
        App.clearVodScrub();
        Player.seekTo(target);
        App.bumpVodControls();
        App.persistResumePosition(true);
        return true;
    }

    App.toggleVodPause = function () {
        if (!App.isSeekablePlaying()) { return; }
        var nowPaused = Player.togglePause();
        App.showVodPauseIndicator(nowPaused);
        if (nowPaused) {
            App.persistResumePosition(true);
            App.showVodControls(true);
        } else {
            App.showVodControls(false);
        }
    }

    App.seekVod = function (deltaSec) {
        if (!App.isSeekablePlaying()) { return; }
        App.clearVodScrub();
        var pos = Player.getPosition();
        var dur = Player.getDuration();
        var target = Math.max(0, pos + deltaSec);
        if (dur > 0) { target = Math.min(target, Math.max(0, dur - 0.5)); }
        Player.seekTo(target);
        App.bumpVodControls();
        App.persistResumePosition(true);
    }

    App.updateResumeChoice = function () {
        if (App.$resumeYes) { App.$resumeYes.className = App.resumeChoiceYes ? 'focused' : ''; }
        if (App.$resumeNo) { App.$resumeNo.className = App.resumeChoiceYes ? '' : 'focused'; }
    }

    App.showResumeDialog = function (item, preferredKind, entry) {
        if (!item || !entry || !App.$resumeDialog) { return; }
        App.resumePending = {
            item: item,
            preferredKind: preferredKind || item.kind,
            pos: entry.pos
        };
        App.resumeChoiceYes = true;
        if (App.$resumeSub) {
            App.$resumeSub.textContent = item.name + ' — ' + App.formatPlaybackTime(entry.pos) +
                (entry.dur > 0 ? ' / ' + App.formatPlaybackTime(entry.dur) : '');
        }
        App.updateResumeChoice();
        App.rememberMenu();
        App.uiState = 'resume';
        App.setExclusiveOverlays({ resume: true });
    }

    App.hideResumeDialog = function () {
        if (App.$resumeDialog) { App.$resumeDialog.classList.add('hidden'); }
        App.resumePending = null;
        if (App.uiState === 'resume') { App.uiState = 'watch'; }
    }

    App.confirmResume = function (fromStart) {
        var pending = App.resumePending;
        if (!pending) {
            App.hideResumeDialog();
            return;
        }
        var item = pending.item;
        var kind = pending.preferredKind;
        var startAt = fromStart ? 0 : pending.pos;
        App.hideResumeDialog();
        if (fromStart) { App.clearResumeEntry(item); }
        App.beginPlayback(item, kind, startAt, {});
    }

    App.onResumeKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.LEFT:
            case App.KEY.RIGHT:
                App.resumeChoiceYes = !App.resumeChoiceYes;
                App.updateResumeChoice();
                break;
            case App.KEY.ENTER:
                App.confirmResume(!App.resumeChoiceYes);
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                /* BACK = depuis le début */
                App.confirmResume(true);
                break;
        }
        e.preventDefault();
    }

    /* ---------- next episode (series only) ---------- */

    App.episodeMatches = function (a, b) {
        if (!a || !b) { return false; }
        if (a.url && b.url && a.url === b.url) { return true; }
        if (a.id && b.id && String(a.id) === String(b.id)) { return true; }
        if (a.episodeId && b.episodeId && String(a.episodeId) === String(b.episodeId)) {
            return true;
        }
        return false;
    }

    App.episodeInSeasons = function (item, seasons) {
        if (!item || !seasons || !seasons.length) { return false; }
        var s;
        var e;
        var eps;
        for (s = 0; s < seasons.length; s++) {
            eps = (seasons[s] && seasons[s].episodes) || [];
            for (e = 0; e < eps.length; e++) {
                if (App.episodeMatches(eps[e], item)) { return true; }
            }
        }
        return false;
    };

    App.applySeriesSeasonsContext = function (item, seasons) {
        App.seriesSeasons = seasons || [];
        if (!item) { return; }
        var s;
        var e;
        var eps;
        for (s = 0; s < App.seriesSeasons.length; s++) {
            eps = (App.seriesSeasons[s] && App.seriesSeasons[s].episodes) || [];
            for (e = 0; e < eps.length; e++) {
                if (App.episodeMatches(eps[e], item)) {
                    App.activeSeason = App.seriesSeasons[s];
                    return;
                }
            }
        }
    };

    App.ensureSeriesContextForEpisode = function (item, done) {
        done = typeof done === 'function' ? done : function () {};
        if (!item || item.kind !== 'episode') {
            done(false);
            return;
        }
        if (typeof App.enrichEpisodeMeta === 'function') {
            App.enrichEpisodeMeta(item);
        }
        if (App.episodeInSeasons(item, App.seriesSeasons) ||
            (App.activeSeason && App.episodeInSeasons(item, [App.activeSeason]))) {
            done(true);
            return;
        }
        var sid = item.seriesId || (App.activeSeries && App.activeSeries.seriesId) || '';
        if (!sid || !App.xtreamCreds || typeof Xtream === 'undefined' ||
            typeof Xtream.getSeriesInfo !== 'function') {
            done(false);
            return;
        }
        sid = String(sid);
        if (App._seriesCtxLoading === sid) {
            App._seriesCtxWaiters = App._seriesCtxWaiters || [];
            App._seriesCtxWaiters.push(done);
            return;
        }
        if (!App.activeSeries || String(App.activeSeries.seriesId) !== sid) {
            var catalog = typeof App.catalogItems === 'function' ? App.catalogItems('series') : [];
            var i;
            var found = null;
            for (i = 0; i < catalog.length; i++) {
                if (catalog[i] && String(catalog[i].seriesId) === sid) {
                    found = catalog[i];
                    break;
                }
            }
            App.activeSeries = found || {
                seriesId: sid,
                name: item.seriesTitle || ''
            };
        }
        App._seriesCtxLoading = sid;
        var waiters = [done];
        App._seriesCtxWaiters = waiters;
        var requestToken = (App._seriesCtxToken || 0) + 1;
        App._seriesCtxToken = requestToken;

        function finish(ok, seasons) {
            /* Older requests keep their own callbacks and cannot replace newer context. */
            var current = App._seriesCtxToken === requestToken;
            if (current) {
                App._seriesCtxLoading = '';
                App._seriesCtxWaiters = [];
                current = !!(App.activeSeries && String(App.activeSeries.seriesId) === sid);
                if (ok && current) { App.applySeriesSeasonsContext(item, seasons || []); }
            }
            for (var w = 0; w < waiters.length; w++) {
                try { waiters[w](!!(ok && current)); } catch (eWait) {}
            }
        }

        Xtream.getSeriesInfo(
            App.xtreamCreds.base, App.xtreamCreds.username, App.xtreamCreds.password,
            sid,
            function (seasons) {
                finish(true, seasons);
            },
            function () {
                finish(false);
            }
        );
    };

    App.findNextEpisode = function (current, seasonsOpt) {
        if (!current || current.kind !== 'episode') { return null; }

        var seasons = seasonsOpt;
        if (!seasons || !seasons.length) {
            seasons = App.seriesSeasons || [];
        }
        if (!seasons.length && App.activeSeason) {
            seasons = [App.activeSeason];
        }

        var seasonIdx = -1;
        var epIdx = -1;
        var s;
        var e;
        var eps;

        for (s = 0; s < seasons.length; s++) {
            eps = (seasons[s] && seasons[s].episodes) || [];
            for (e = 0; e < eps.length; e++) {
                if (App.episodeMatches(eps[e], current)) {
                    seasonIdx = s;
                    epIdx = e;
                    break;
                }
            }
            if (seasonIdx >= 0) { break; }
        }

        /* Fallback: the active season can be absent from the loaded seasons. */
        if (seasonIdx < 0 && App.activeSeason && seasons === (App.seriesSeasons || [])) {
            eps = App.activeSeason.episodes || [];
            for (e = 0; e < eps.length; e++) {
                if (App.episodeMatches(eps[e], current)) {
                    epIdx = e;
                    break;
                }
            }
            if (epIdx >= 0) {
                for (s = 0; s < seasons.length; s++) {
                    if (seasons[s] === App.activeSeason ||
                        (seasons[s].season != null &&
                            String(seasons[s].season) === String(App.activeSeason.season))) {
                        seasonIdx = s;
                        break;
                    }
                }
                if (seasonIdx < 0) {
                    seasons = [App.activeSeason].concat(seasons);
                    seasonIdx = 0;
                }
            }
        }

        if (seasonIdx < 0 || epIdx < 0) { return null; }

        eps = (seasons[seasonIdx] && seasons[seasonIdx].episodes) || [];
        if (epIdx + 1 < eps.length && eps[epIdx + 1] && eps[epIdx + 1].url) {
            return { item: eps[epIdx + 1], season: seasons[seasonIdx] };
        }

        for (s = seasonIdx + 1; s < seasons.length; s++) {
            eps = (seasons[s] && seasons[s].episodes) || [];
            if (eps.length && eps[0] && eps[0].url) {
                return { item: eps[0], season: seasons[s] };
            }
        }
        return null;
    }

    App.advanceSeriesResume = function (current) {
        if (!current || current.kind !== 'episode') { return null; }
        var next = App.findNextEpisode(current);
        if (next && next.item) {
            if (typeof App.queueNextEpisodeResume === 'function') {
                App.queueNextEpisodeResume(next.item);
            }
            return next;
        }
        App.ensureSeriesContextForEpisode(current, function (ok) {
            if (!ok) { return; }
            var n = App.findNextEpisode(current);
            if (n && n.item && typeof App.queueNextEpisodeResume === 'function') {
                App.queueNextEpisodeResume(n.item);
            }
        });
        return null;
    };

    App.showNextEpisodePrompt = function (next, opts) {
        if (!next || !next.item || !App.$nextEpisodePrompt) { return; }
        opts = opts || {};
        App.nextEpisodePending = next;
        App.nextEpisodeCancelFocused = false;
        var cancelButton = App.$nextEpisodeCancel;
        if (cancelButton) { cancelButton.className = ''; }
        if (App.$nextEpisodeSub) {
            App.$nextEpisodeSub.textContent = next.item.name || '';
        }
        if (App.$nextEpisodeBtn) {
            App.$nextEpisodeBtn.className = 'focused';
        }
        clearTimeout(App.nextEpisodeTimer);
        App.nextEpisodeTimer = null;
        if (opts.exclusive) {
            App.nextEpisodeLive = false;
            App.rememberMenu();
            App.uiState = 'nextEpisode';
            App.setExclusiveOverlays({ nextEpisode: true });
            if (App.currentViewer && App.currentViewer().autoplay && !App.nextEpisodeDismissed) {
                var remaining = 10;
                var viewerId = App.currentViewer().id;
                function tick() {
                    if (App.uiState !== 'nextEpisode' || App.nextEpisodePending !== next ||
                        App.currentViewer().id !== viewerId || !App.currentViewer().autoplay) { return; }
                    if (remaining === 0) { App.confirmNextEpisode(); return; }
                    if (App.$nextEpisodeSub) {
                        App.$nextEpisodeSub.textContent = next.item.name + ' · Lecture dans ' + remaining + ' s';
                    }
                    remaining--;
                    App.nextEpisodeTimer = setTimeout(tick, 1000);
                }
                tick();
            }
        } else {
            App.nextEpisodeLive = true;
            App.$nextEpisodePrompt.classList.remove('hidden');
        }
    }

    App.hideNextEpisodePrompt = function (restoreWatch) {
        clearTimeout(App.nextEpisodeTimer);
        App.nextEpisodeTimer = null;
        App.nextEpisodePending = null;
        App.nextEpisodeLive = false;
        if (App.$nextEpisodePrompt) { App.$nextEpisodePrompt.classList.add('hidden'); }
        if (App.uiState === 'nextEpisode' && restoreWatch !== false) {
            App.uiState = 'watch';
        }
    }

    App.dismissNextEpisodePrompt = function () {
        App.nextEpisodeDismissed = true;
        var wasExclusive = App.uiState === 'nextEpisode';
        App.hideNextEpisodePrompt(true);
        if (wasExclusive) {
            App.setExclusiveOverlays({});
        }
    }

    App.confirmNextEpisode = function () {
        var pending = App.nextEpisodePending;
        if (!pending || !pending.item) {
            App.dismissNextEpisodePrompt();
            return;
        }
        var item = pending.item;
        var season = pending.season;
        App.nextEpisodeDismissed = false;
        App.hideNextEpisodePrompt(true);
        App.setExclusiveOverlays({});
        if (season) { App.activeSeason = season; }
        App.playItem(item, 'episode', { skipResumePrompt: true, startAt: 0 });
    }

    App.isNextEpisodeCtaVisible = function () {
        return !!(App.nextEpisodePending && App.$nextEpisodePrompt &&
            !App.$nextEpisodePrompt.classList.contains('hidden'));
    };

    App.maybeShowNextEpisodeDuringPlayback = function (pos, dur) {
        var ch = App.playingItem();
        if (!ch || ch.kind !== 'episode') { return; }
        if (App.nextEpisodeDismissed) { return; }
        if (App.uiState !== 'watch') { return; }
        if (!(dur > 0) || !(pos > 0)) { return; }
        var remain = dur - pos;
        var remainSec = App.NEXT_EPISODE_REMAIN_SEC || 60;
        var near = remain <= remainSec ||
            pos >= dur * App.RESUME_END_RATIO ||
            pos >= dur - App.RESUME_END_MARGIN_SEC;
        if (!near) { return; }
        if (App.isNextEpisodeCtaVisible()) { return; }
        var next = App.findNextEpisode(ch);
        if (!next || !next.item) {
            if (App.episodeInSeasons(ch, App.seriesSeasons) ||
                (App.activeSeason && App.episodeInSeasons(ch, [App.activeSeason]))) {
                return;
            }
            App.ensureSeriesContextForEpisode(ch, function (ok) {
                if (!ok || App.nextEpisodeDismissed) { return; }
                if (App.playingItem() !== ch) { return; }
                App.maybeShowNextEpisodeDuringPlayback(
                    Player.getPosition(), Player.getDuration()
                );
            });
            return;
        }
        if (typeof App.queueNextEpisodeResume === 'function') {
            App.queueNextEpisodeResume(next.item);
        }
        App.showNextEpisodePrompt(next, { exclusive: false });
    };

    App.onEpisodePlaybackEnded = function () {
        var ch = App.playingItem();
        if (!ch || ch.kind !== 'episode') { return false; }
        var next = App.findNextEpisode(ch);
        if (next && next.item) {
            if (typeof App.queueNextEpisodeResume === 'function') {
                App.queueNextEpisodeResume(next.item);
            }
            App.showNextEpisodePrompt(next, { exclusive: true });
            return true;
        }
        if (App.nextEpisodePending && App.nextEpisodePending.item) {
            App.showNextEpisodePrompt(App.nextEpisodePending, { exclusive: true });
            return true;
        }
        if (App.episodeInSeasons(ch, App.seriesSeasons) ||
            (App.activeSeason && App.episodeInSeasons(ch, [App.activeSeason]))) {
            App.toast('Fin de la série');
            return true;
        }
        App.ensureSeriesContextForEpisode(ch, function (ok) {
            if (App.playingItem() !== ch) { return; }
            if (App.uiState !== 'watch' && App.uiState !== 'nextEpisode') { return; }
            var n = ok ? App.findNextEpisode(ch) : null;
            if (n && n.item) {
                if (typeof App.queueNextEpisodeResume === 'function') {
                    App.queueNextEpisodeResume(n.item);
                }
                App.showNextEpisodePrompt(n, { exclusive: true });
            } else {
                App.toast('Fin de la série');
            }
        });
        return true;
    }

    App.onNextEpisodeKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.ENTER:
                if (App.nextEpisodeCancelFocused) { App.dismissNextEpisodePrompt(); }
                else { App.confirmNextEpisode(); }
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.dismissNextEpisodePrompt();
                break;
            case App.KEY.UP:
            case App.KEY.DOWN:
            case App.KEY.LEFT:
            case App.KEY.RIGHT:
                App.nextEpisodeCancelFocused = !App.nextEpisodeCancelFocused;
                if (App.$nextEpisodeBtn) { App.$nextEpisodeBtn.className = App.nextEpisodeCancelFocused ? '' : 'focused'; }
                var cancel = App.$nextEpisodeCancel;
                if (cancel) { cancel.className = App.nextEpisodeCancelFocused ? 'focused' : ''; }
                break;
            default:
                break;
        }
        e.preventDefault();
    }

    var cancelNext = App.$nextEpisodeCancel;
    if (cancelNext) { cancelNext.addEventListener('click', function () { App.dismissNextEpisodePrompt(); }); }
    if (App.$nextEpisodeBtn && App.$nextEpisodeBtn.getAttribute('data-bound') !== '1') {
        App.$nextEpisodeBtn.setAttribute('data-bound', '1');
        App.$nextEpisodeBtn.addEventListener('click', function () {
            if (App.isNextEpisodeCtaVisible()) {
                App.confirmNextEpisode();
            }
        });
    }

    if (App.$vodActionFollow && App.$vodActionFollow.getAttribute('data-bound') !== '1') {
        App.$vodActionFollow.setAttribute('data-bound', '1');
        App.$vodActionFollow.addEventListener('click', function () {
            if (App.uiState !== 'watch' || !App.isSeekablePlaying()) { return; }
            App.vodFocus = 'follow';
            if (typeof App.toggleFollowPlayingSeries === 'function') {
                App.toggleFollowPlayingSeries();
            }
            App.showVodControls(true);
        });
    }
})(App);
