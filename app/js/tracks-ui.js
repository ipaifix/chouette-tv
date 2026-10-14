/* Audio/subtitle tracks */
var App = App || {};
(function (App) {
    'use strict';

    /* ---------- audio / subtitle tracks (watch mode) ---------- */

    App.isTracksRowFocusable = function (row) {
        return row && (row.kind === 'audio' || row.kind === 'text');
    }

    App.buildTracksRows = function () {
        App.tracksRows = [];
        var info = Player.getTracks();
        var i;

        App.tracksRows.push({ kind: 'section', label: 'Audio' });
        if (!info.audio.length) {
            App.tracksRows.push({ kind: 'empty', label: 'Aucune piste audio' });
        } else {
            for (i = 0; i < info.audio.length; i++) {
                var a = info.audio[i];
                App.tracksRows.push({
                    kind: 'audio',
                    index: a.index,
                    lang: a.lang || '',
                    label: a.label,
                    selected: a.index === info.selectedAudio
                });
            }
        }

        App.tracksRows.push({ kind: 'section', label: 'Subtitles' });
        App.tracksRows.push({
            kind: 'text',
            index: -1,
            lang: 'off',
            label: 'Off',
            selected: info.selectedText < 0
        });
        if (!info.text.length) {
            App.tracksRows.push({ kind: 'empty', label: 'Aucune piste de sous-titres' });
        } else {
            for (i = 0; i < info.text.length; i++) {
                var t = info.text[i];
                App.tracksRows.push({
                    kind: 'text',
                    index: t.index,
                    lang: t.lang || '',
                    label: t.label,
                    selected: t.index === info.selectedText
                });
            }
        }
    }

    App.renderTracksPanel = function () {
        App.buildTracksRows();
        if (!App.isTracksRowFocusable(App.tracksRows[App.tracksFocus])) {
            App.tracksFocus = 0;
            while (App.tracksFocus < App.tracksRows.length && !App.isTracksRowFocusable(App.tracksRows[App.tracksFocus])) {
                App.tracksFocus++;
            }
            if (App.tracksFocus >= App.tracksRows.length) { App.tracksFocus = 0; }
        }
        App.$tracksItems.innerHTML = '';
        for (var i = 0; i < App.tracksRows.length; i++) {
            var row = App.tracksRows[i];
            var li = document.createElement('li');
            if (row.kind === 'section') {
                li.className = 'is-section';
            } else if (row.kind === 'empty') {
                li.className = 'is-empty';
            } else {
                li.className = '';
                if (row.selected) { li.className += ' selected'; }
                if (i === App.tracksFocus) { li.className += ' focused'; }
            }
            li.appendChild(document.createTextNode(row.label));
            App.$tracksItems.appendChild(li);
        }
        var focused = App.$tracksItems.children[App.tracksFocus];
        if (focused && focused.scrollIntoView) {
            try { focused.scrollIntoView({ block: 'nearest' }); } catch (e) {
                focused.scrollIntoView(false);
            }
        }
    }

    App.updateTracksFocusUi = function () {
        var lis = App.$tracksItems.children;
        for (var i = 0; i < lis.length; i++) {
            var row = App.tracksRows[i];
            var cls = '';
            if (!row) { continue; }
            if (row.kind === 'section') { cls = 'is-section'; }
            else if (row.kind === 'empty') { cls = 'is-empty'; }
            else {
                if (row.selected) { cls += ' selected'; }
                if (i === App.tracksFocus) { cls += ' focused'; }
            }
            lis[i].className = cls.trim();
        }
        var focused = lis[App.tracksFocus];
        if (focused && focused.scrollIntoView) {
            try { focused.scrollIntoView({ block: 'nearest' }); } catch (e2) {
                focused.scrollIntoView(false);
            }
        }
    }

    App.moveTracksFocus = function (dir) {
        if (!App.tracksRows.length) { return; }
        var i = App.tracksFocus;
        for (var n = 0; n < App.tracksRows.length; n++) {
            i = (i + dir + App.tracksRows.length) % App.tracksRows.length;
            if (App.isTracksRowFocusable(App.tracksRows[i])) {
                App.tracksFocus = i;
                App.updateTracksFocusUi();
                return;
            }
        }
    }

    App.applyTracksSelection = function () {
        var row = App.tracksRows[App.tracksFocus];
        if (!App.isTracksRowFocusable(row)) { return; }
        if (row.kind === 'audio') {
            if (Player.selectAudioTrack(row.index)) {
                if (row.lang) { App.updateViewer({ audio: row.lang }); }
                App.toast('Audio : ' + row.label);
                App.renderTracksPanel();
                if (typeof App.refreshStreamQualityUi === 'function') {
                    App.refreshStreamQualityUi();
                }
            } else {
                App.toast('Impossible de changer de piste audio');
            }
            return;
        }
        if (row.kind === 'text') {
            if (row.index < 0) {
                Player.setSubtitlesOff();
                App.updateViewer({ subtitles: 'off' });
                App.toast('Sous-titres : désactivés');
            } else if (Player.selectSubtitleTrack(row.index)) {
                if (row.lang) { App.updateViewer({ subtitles: row.lang }); }
                App.toast('Sous-titres : ' + row.label);
            } else {
                App.toast('Impossible de changer de piste de sous-titres');
                return;
            }
            App.renderTracksPanel();
        }
    }

    App.showTracksPanel = function () {
        if (App.uiState === 'browse' || App.uiState === 'search' || App.uiState === 'settings' ||
            App.uiState === 'exit' || App.uiState === 'resume' ||
            App.uiState === 'nextEpisode') {
            return;
        }
        if (!App.playingItem()) {
            App.toast('Aucune lecture en cours');
            return;
        }
        var info = Player.getTracks();
        if (!info.audio.length && !info.text.length) {
            App.toast('Aucune piste audio ou de sous-titres');
            return;
        }
        App.tracksPrevState = 'watch';
        App.uiState = 'tracks';
        App.tracksFocus = 0;
        App.setExclusiveOverlays({ tracks: true });
        App.renderTracksPanel();
        /* Focus first selected row if any */
        for (var i = 0; i < App.tracksRows.length; i++) {
            if (App.isTracksRowFocusable(App.tracksRows[i]) && App.tracksRows[i].selected) {
                App.tracksFocus = i;
                App.updateTracksFocusUi();
                break;
            }
        }
    }

    App.hideTracksPanel = function (silent) {
        if (App.$tracksPanel) { App.$tracksPanel.classList.add('hidden'); }
        if (App.uiState !== 'tracks') { return; }
        App.uiState = 'watch';
        if (!silent) {
            App.setExclusiveOverlays({});
            if (App.isSeekablePlaying()) { App.showVodControls(Player.isPaused()); }
            else if (App.playingItem()) { App.showInfo(); }
        }
    }

    App.onTracksKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.UP:
                App.moveTracksFocus(-1);
                break;
            case App.KEY.DOWN:
                App.moveTracksFocus(1);
                break;
            case App.KEY.ENTER:
            case App.KEY.LEFT:
            case App.KEY.RIGHT:
                App.applyTracksSelection();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.hideTracksPanel();
                break;
        }
        e.preventDefault();
    }

    App.applyStoredTrackPrefs = function (skipMetadata) {
        var viewer = App.currentViewer ? App.currentViewer() : null;
        var audioPref = viewer ? viewer.audio : Storage.get(Storage.KEYS.prefAudioLang);
        var subPref = viewer ? viewer.subtitles : Storage.get(Storage.KEYS.prefSubLang);
        if (!audioPref && !subPref) { return; }
        var item = App.playingItem();
        var creds = App.xtreamCreds;
        if (!skipMetadata && audioPref === 'original' && item && !item.originalLanguage &&
            creds && creds.base && (item.kind === 'vod' || item.seriesId)) {
            var token = Player.getPlaybackToken();
            var viewerId = viewer && viewer.id;
            function finish(details) {
                if (token !== Player.getPlaybackToken() || App.currentViewer().id !== viewerId) { return; }
                var current = App.playingItem();
                if (!current || current.url !== item.url) { return; }
                if (details && details.originalLanguage) { current.originalLanguage = details.originalLanguage; }
                App.applyStoredTrackPrefs(true);
            }
            if (item.kind === 'vod') {
                Xtream.getVodDetails(creds.base, creds.username, creds.password, item.id, finish, function () { finish(null); });
            } else {
                Xtream.getSeriesInfo(creds.base, creds.username, creds.password, item.seriesId,
                    function (seasons) { finish(seasons.details); }, function () { finish(null); });
            }
            /* Subtitles should not wait for a potentially slow metadata request. */
            Player.applyPreferredTracks('', subPref || '');
            return;
        }
        try {
            var result = Player.applyPreferredTracks(audioPref, subPref || '', item && item.originalLanguage);
            if (result.originalUnknown) {
                App.toast('VO non identifiée : piste actuelle conservée. Vérifiez dans Audio / sous-titres.');
            } else if ((!result.audio && audioPref) || (!result.text && subPref !== 'off')) {
                App.toast('Langue préférée indisponible sur ce contenu');
            }
        } catch (e) {}
    }
})(App);
