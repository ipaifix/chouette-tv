/* Profile, detail and guide surfaces share keyboard and pointer focus. */
var App = App || {};
(function (App) {
    'use strict';
    var cancelDetails = null;
    var controls = [], focus = 0, returnState = 'browse', generation = 0;
    var guide = null, surfaceType = '';
    function node(tag, text, cls, parent) {
        var el = document.createElement(tag);
        if (text != null) { el.textContent = text; }
        if (cls) { el.className = cls; }
        if (parent) { parent.appendChild(el); }
        return el;
    }
    function focusAt(index) {
        focus = Math.max(0, Math.min(controls.length - 1, index));
        controls.forEach(function (el, i) {
            el.classList.toggle('focused', i === focus);
        });
        var el = controls[focus];
        if (el) {
            el.focus();
            if (el.scrollIntoView) {
                try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
            }
        }
    }
    function moveFocusSpatial(key) {
        var current = controls[focus];
        if (!current || !current.getBoundingClientRect) {
            focusAt(focus + ((key === App.KEY.UP || key === App.KEY.LEFT) ? -1 : 1));
            return;
        }
        var from = current.getBoundingClientRect();
        var fx = from.left + from.width / 2;
        var fy = from.top + from.height / 2;
        var best = -1;
        var bestScore = Infinity;
        for (var i = 0; i < controls.length; i++) {
            if (i === focus || !controls[i] || !controls[i].getBoundingClientRect || controls[i].disabled) { continue; }
            var rect = controls[i].getBoundingClientRect();
            var x = rect.left + rect.width / 2;
            var y = rect.top + rect.height / 2;
            var dx = x - fx;
            var dy = y - fy;
            var primary;
            var cross;
            if (key === App.KEY.LEFT && dx < -1) { primary = -dx; cross = Math.abs(dy); }
            else if (key === App.KEY.RIGHT && dx > 1) { primary = dx; cross = Math.abs(dy); }
            else if (key === App.KEY.UP && dy < -1) { primary = -dy; cross = Math.abs(dx); }
            else if (key === App.KEY.DOWN && dy > 1) { primary = dy; cross = Math.abs(dx); }
            else { continue; }
            var score = primary * 4 + cross;
            if (score < bestScore) { bestScore = score; best = i; }
        }
        if (best >= 0) { focusAt(best); }
    }
    function control(el, action) {
        var index = controls.length;
        controls.push(el);
        el.addEventListener('focus', function () {
            focus = index;
            controls.forEach(function (c, i) { c.classList.toggle('focused', i === index); });
        });
        if (action) { el.addEventListener('click', action); }
        return el;
    }
    function button(text, action, parent) {
        var el = node('button', text, 'feature-button', parent || App.$featurePanel);
        el.type = 'button';
        return control(el, action);
    }
    function surface(title, type) {
        if (cancelDetails) { cancelDetails(); cancelDetails = null; }
        if (App.releaseHomeArtwork) {
            App.releaseHomeArtwork(App.$homeRows); App.releaseHomeArtwork(App.$searchShellRows);
            App.releaseHomeArtwork(App.$featurePanel);
        }
        if (App.uiState !== 'feature') { returnState = App.uiState; }
        if (App.blurSearchInput) { App.blurSearchInput(); }
        if (App.blurSettingsInputs) { App.blurSettingsInputs(); }
        App.clearBrowseHold();
        if (App.stopLivePreview && App.livePreviewActive) { App.stopLivePreview(); }
        if (!App.$featurePanel) {
            App.$featurePanel = node('section', null, '', document.body);
            App.$featurePanel.id = 'feature-panel';
            App.$featurePanel.setAttribute('role', 'dialog');
            App.$featurePanel.setAttribute('aria-modal', 'true');
        }
        generation++;
        surfaceType = type;
        controls = [];
        focus = 0;
        guide = null;
        App.uiState = 'feature';
        App.setExclusiveOverlays({ feature: true });
        App.$featurePanel.className = 'feature-panel feature-' + type;
        App.$featurePanel.textContent = '';
        App.$featurePanel.scrollTop = 0;
        App.$featurePanel.setAttribute('aria-label', title);
        button('← Retour', function () { App.closeFeature(); });
        node('h1', title, 'feature-title', App.$featurePanel);
        return App.$featurePanel;
    }
    App.closeFeature = function (restore) {
        if (cancelDetails) { cancelDetails(); cancelDetails = null; }
        if (App.releaseHomeArtwork) { App.releaseHomeArtwork(App.$featurePanel); }
        generation++;
        guide = null;
        if (App.$featurePanel) {
            App.$featurePanel.classList.add('hidden');
            App.$featurePanel.textContent = '';
        }
        controls = [];
        App.uiState = returnState;
        if (restore === false) { return; }
        if (returnState === 'search') {
            App.setExclusiveOverlays({ list: true, search: true, dim: true });
            App.updateSearchFocusUi();
        } else if (returnState === 'settings') {
            App.setExclusiveOverlays({ list: true, settings: true });
            App.updateSettingsFocusClasses();
        } else if (returnState === 'watch') {
            App.setExclusiveOverlays({});
        } else {
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
            App.renderList();
        }
    };
    App.onFeatureKeys = function (e) {
        var key = e.keyCode;
        var current = controls[focus];
        if (key === App.KEY.RETURN || key === App.KEY.ESC) {
            App.closeFeature();
        } else if (current && current.tagName === 'INPUT' &&
            key !== App.KEY.UP && key !== App.KEY.DOWN && key !== App.KEY.ENTER && key !== 9) {
            return; /* Native text entry and caret movement. */
        } else if (guide && current && current.getAttribute('data-guide-channel') &&
            (key === App.KEY.LEFT || key === App.KEY.RIGHT)) {
            guide.offset = Math.max(0, Math.min(12, guide.offset + (key === App.KEY.RIGHT ? 2 : -2)));
            App.showLiveGuide(guide);
        } else if (key === 9 && e.shiftKey) {
            focusAt(focus - 1);
        } else if (key === 9) {
            focusAt(focus + 1);
        } else if (key === App.KEY.UP || key === App.KEY.LEFT ||
            key === App.KEY.DOWN || key === App.KEY.RIGHT) {
            if (key === App.KEY.DOWN && guide && focus === controls.length - 1 && guide.start + 8 < guide.count) {
                guide.start += 8; App.showLiveGuide(guide);
            } else { moveFocusSpatial(key); }
        } else if (key === App.KEY.ENTER && current) {
            if (current.tagName === 'INPUT') { focusAt(focus + 1); }
            else { current.click(); }
        }
        e.preventDefault();
    };
    App.showProfiles = function () {
        var keepFocus = App.uiState === 'feature' && surfaceType === 'profiles' ? focus : 1;
        var host = surface('Qui regarde ?', 'profiles');
        var viewer = App.currentViewer();
        var people = node('div', null, 'feature-actions', host);
        App.loadViewers().list.forEach(function (person) {
            button((person.id === viewer.id ? '✓ ' : '') + person.name, function () {
                if (person.id === viewer.id) {
                    App.closeFeature();
                    return;
                }
                App.closeFeature(false);
                App.switchViewer(person.id);
            }, people);
        });
        node('h2', 'Préférences de ' + viewer.name, '', host);
        node('p', 'Audio et sous-titres : ' + App.viewerPresetLabel(), 'feature-muted', host);
        var presets = node('div', null, 'feature-actions', host);
        App.viewerPresets.forEach(function (preset) {
            button((viewer.audio === preset.audio && viewer.subtitles === preset.subtitles ? '✓ ' : '') + preset.name,
                function () {
                    App.updateViewer({ audio: preset.audio, subtitles: preset.subtitles });
                    if (App.playingItem()) { App.applyStoredTrackPrefs(); }
                    App.showProfiles();
                }, presets);
        });
        node('p', 'La VO utilise la langue originale renseignée ou une piste identifiée « original ». Sinon, la piste actuelle est conservée.', 'feature-muted', host);
        button('Épisode suivant automatique : ' + (viewer.autoplay ? 'oui' : 'non'), function () {
            App.updateViewer({ autoplay: !viewer.autoplay }); App.showProfiles();
        });
        var form = node('div', null, 'feature-actions', host);
        var label = node('label', 'Nom du profil', '', form);
        var input = node('input', null, 'feature-input', label);
        input.type = 'text'; input.maxLength = 24; input.value = viewer.name;
        input.setAttribute('aria-label', 'Nom du profil');
        control(input);
        button('Renommer', function () {
            var name = input.value.trim().slice(0, 24);
            if (name) { App.updateViewer({ name: name }); App.showProfiles(); }
        }, form);
        button('Créer un profil avec ce nom', function () {
            var id = App.addViewer(input.value);
            if (id) { App.closeFeature(false); App.switchViewer(id); }
        }, form);
        node('p', 'Chaque profil conserve ses reprises, favoris, recherches et séries suivies. Les profils sont enregistrés sur cet appareil.', 'feature-muted', host);
        focusAt(keepFocus);
    };

    /* Visible actions replace the former long-press shortcuts. */
    App.showItemActions = function (item, opts) {
        opts = opts || {};
        /* Live TV never pauses on an intermediate menu. */
        if (item && item.kind === 'live') {
            if (item.url) { App.playItem(item, 'live'); }
            else { App.toast('Flux indisponible'); }
            return;
        }
        var title = item && item.name ? App.displayCatalogTitle(item.name) :
            (opts.entry && App.continueItemLabel ? App.continueItemLabel(opts.entry) : 'Contenu');
        var host = surface('Options · ' + title, 'item-actions');
        var actions = node('div', null, 'feature-action-list', host);
        var playable = item && item.url;
        if (playable) {
            var resume = opts.entry || (App.getResumeEntry ? App.getResumeEntry(item) : null);
            var playLabel = resume && App.shouldOfferResume && App.shouldOfferResume(resume)
                ? 'Reprendre la lecture' : 'Lire';
            button(playLabel, function () {
                App.closeFeature(false);
                App.playItem(item, item.kind || opts.kind || 'live', {
                    skipResumePrompt: true, startAt: App.shouldOfferResume && App.shouldOfferResume(resume) ? resume.pos : 0
                });
            }, actions);
            if (resume && App.shouldOfferResume && App.shouldOfferResume(resume)) {
                button('Recommencer depuis le début', function () {
                    App.closeFeature(false);
                    App.playItem(item, item.kind || 'vod', { skipResumePrompt: true, startAt: 0 });
                }, actions);
            }
        }
        if (opts.entry) {
            var remove = button('Retirer de Continuer à regarder', function () {
                if (!App.removeContinueEntry(opts.entry)) { return; }
                App.closeFeature();
            }, actions);
            remove.classList.add('is-destructive');
        }
        if (!playable) {
            node('p', 'Ce contenu n’est plus disponible, mais il peut être retiré de la liste.', 'feature-muted', host);
        }
        focusAt(1);
        host.scrollTop = 0;
    };

    App.showDetails = function (item) {
        if (!item) { return; }
        var host = surface(App.displayCatalogTitle(item.name || 'Fiche'), 'details');
        var token = generation;
        var scope = App.profileScope();
        var actions = node('div', null, 'feature-actions', host);
        var body = node('div', 'Chargement des informations…', 'detail-body', host);
        var isSeries = item.kind === 'series';
        var seasons = null;
        function valid() { return token === generation && App.uiState === 'feature' && scope === App.profileScope(); }
        function start(target, season, entry) {
            if (season) { App.activeSeries = item; App.seriesSeasons = seasons; App.activeSeason = season; }
            if (returnState === 'search' && typeof App.captureSearchPlaybackReturn === 'function') {
                App.captureSearchPlaybackReturn();
            }
            App.closeFeature(false);
            App.playItem(target, target.kind, entry !== undefined
                ? { skipResumePrompt: true, startAt: App.shouldOfferResume(entry) ? entry.pos : 0 } : {});
        }
        if (!isSeries) {
            var entry = App.getResumeEntry(item);
            button(App.shouldOfferResume(entry) ? 'Reprendre' : 'Lire', function () { start(item, null, entry); }, actions);
        } else {
            var primaryEpisode = null, primarySeason = null, primaryEntry = null;
            var primaryButton = button('Chargement des épisodes…', function () {
                if (primaryEpisode) { start(primaryEpisode, primarySeason, primaryEntry); }
            }, actions);
            primaryButton.disabled = true;
            var seriesFavorite = App.isFavoriteSeries && App.isFavoriteSeries(item);
            var favoriteButton = button(seriesFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', function () {
                App.toggleFavoriteSeries(item);
                App.showDetails(item);
            }, actions);
            if (seriesFavorite) { favoriteButton.classList.add('is-destructive'); }
            button(App.isFollowedSeries(item) ? '✓ Série suivie — retirer' : '+ Suivre cette série', function () {
                App.toggleFollowSeries(item);
                if (seasons && App.isFollowedSeries(item)) { App.applyFollowedSeasons(item, seasons); }
                App.showDetails(item);
            }, actions);
        }
        function render(details) {
            if (!valid()) { return; }
            details = details || {};
            body.textContent = '';
            if (details.originalLanguage) { item.originalLanguage = details.originalLanguage; }
            var picture = details.poster || item.logo;
            if (/^https?:\/\//i.test(picture || '')) {
                var imageClass = 'detail-image is-poster';
                var img = node('img', null, imageClass, body);
                img.alt = ''; img.width = 300; img.height = 450;
                img.onerror = function () { this.style.display = 'none'; };
                if (App.loadHomeCardImage) {
                    img.setAttribute('data-src', picture);
                    App.loadHomeCardImage(body);
                } else { img.src = picture; }
            }
            node('p', [details.year, details.duration, details.genre, details.rating ? 'Note : ' + details.rating : ''].filter(Boolean).join(' · '), 'detail-meta', body);
            node('p', details.plot || 'Synopsis non fourni par la source.', 'detail-plot', body);
            if (details.cast) { node('p', 'Avec : ' + details.cast, '', body); }
            if (details.director) { node('p', 'Réalisation : ' + details.director, '', body); }
            if (details.originalLanguage) { node('p', 'Langue originale : ' + details.originalLanguage, '', body); }
            node('p', App.currentViewer().name + ' · ' + App.viewerPresetLabel() + ' · selon les pistes disponibles', 'feature-muted', body);
        }
        function renderSeasons(loaded) {
            if (!valid()) { return; }
            seasons = loaded;
            var bestAt = -1;
            if (App.beginResumeSnap) { App.beginResumeSnap(); }
            loaded.forEach(function (season) {
                season.episodes.forEach(function (episode) {
                    var entry = App.getResumeEntry(episode);
                    if (!primaryEpisode && !(entry && entry.done)) {
                        primaryEpisode = episode; primarySeason = season; primaryEntry = entry;
                    }
                    if (entry && !entry.done && Number(entry.at || 0) > bestAt) {
                        bestAt = Number(entry.at || 0);
                        primaryEpisode = episode; primarySeason = season; primaryEntry = entry;
                    }
                });
            });
            if (App.endResumeSnap) { App.endResumeSnap(); }
            if (!primaryEpisode && loaded[0] && loaded[0].episodes[0]) {
                primaryEpisode = loaded[0].episodes[0]; primarySeason = loaded[0];
            }
            if (primaryEpisode) {
                primaryButton.disabled = false;
                primaryButton.textContent = (App.shouldOfferResume(primaryEntry) ? 'Reprendre' : 'Lire') +
                    ' · S' + primarySeason.season + ' E' + (primaryEpisode.episodeNum || 1);
            }
            render(loaded.details);
            var area = node('div', null, 'detail-seasons', host);
            var episodeArea = node('div', null, 'detail-episodes', host);
            var actionControls = controls.slice();
            var seasonControlCount;
            function chooseSeason(season, keepCurrentFocus, page) {
                controls = controls.slice(0, seasonControlCount);
                episodeArea.textContent = '';
                page = page || 0;
                var pageSize = 20;
                var episodes = season.episodes || [];
                node('h2', season.name.replace(/^Season\b/, 'Saison'), '', episodeArea);
                if (episodes.length > pageSize) {
                    node('p', 'Épisodes ' + (page * pageSize + 1) + ' — ' + Math.min(episodes.length, (page + 1) * pageSize) + ' / ' + episodes.length, 'feature-muted', episodeArea);
                }
                if (page > 0) { button('← Épisodes précédents', function () { chooseSeason(season, false, page - 1); }, episodeArea); }
                if (App.beginResumeSnap) { App.beginResumeSnap(); }
                episodes.slice(page * pageSize, (page + 1) * pageSize).forEach(function (episode) {
                    var rec = App.getResumeEntry(episode);
                    button((rec && rec.done ? '✓ Vu · ' : rec && rec.pos > 0 ? 'Reprendre · ' : '') + episode.name,
                        function () { start(episode, season); }, episodeArea);
                });
                if (App.endResumeSnap) { App.endResumeSnap(); }
                if ((page + 1) * pageSize < episodes.length) {
                    button('Épisodes suivants →', function () { chooseSeason(season, false, page + 1); }, episodeArea);
                }
                if (!keepCurrentFocus) { focusAt(seasonControlCount + (page > 0 ? 1 : 0)); }
            }
            function seasonPage(from, keepFocus) {
                area.textContent = '';
                controls = actionControls.slice();
                if (from > 0) { button('← Saisons précédentes', function () { seasonPage(Math.max(0, from - 12), false); }, area); }
                loaded.slice(from, from + 12).forEach(function (season) {
                    button(season.name.replace(/^Season\b/, 'Saison'), function () { chooseSeason(season, false); }, area);
                });
                if (from + 12 < loaded.length) { button('Saisons suivantes →', function () { seasonPage(from + 12, false); }, area); }
                seasonControlCount = controls.length;
                if (loaded[from]) { chooseSeason(loaded[from], keepFocus); }
            }
            seasonPage(0, true);
            focusAt(focus);
        }
        var c = App.xtreamCreds;
        if (!c || !c.base) { render({}); focusAt(1); return; }
        function fail() {
            if (!valid()) { return; }
            render({});
            node('p', 'Informations indisponibles. Vous pouvez réessayer.', 'feature-muted', body);
            button('Réessayer', function () { App.showDetails(item); }, body);
        }
        if (isSeries) { cancelDetails = Xtream.getSeriesInfo(c.base, c.username, c.password, item.seriesId, renderSeasons, fail); }
        else { cancelDetails = Xtream.getVodDetails(c.base, c.username, c.password, item.id || item.streamId, render, fail); }
        focusAt(1);
    };

    App.guideChannels = function (favoritesOnly, nowOnly) {
        var channels = favoritesOnly ? App.listFavoriteChannels() : App.catalogItems('live');
        return channels.filter(function (ch) {
            if (!ch || !ch.url || App.isGroupHeader(ch)) { return false; }
            var nn = nowOnly ? EPG.nowNext(ch.id) : null;
            return !nowOnly || !!(nn && nn.now);
        });
    };
    App.showLiveGuide = function (state) {
        state = state || { start: 0, offset: 0, favorites: false, now: false };
        var host = surface('Guide TV', 'guide');
        guide = state;
        var toolbar = node('div', null, 'feature-actions', host);
        button('Favoris : ' + (state.favorites ? 'oui' : 'non'), function () {
            state.favorites = !state.favorites; state.start = 0; App.showLiveGuide(state);
        }, toolbar);
        button('Programmes en cours : ' + (state.now ? 'oui' : 'tous'), function () {
            state.now = !state.now; state.start = 0; state.offset = 0; App.showLiveGuide(state);
        }, toolbar);
        button('Chaîne précédente', function () {
            var previous = App.previousLive;
            if (!previous) { App.toast('Aucune chaîne précédente'); return; }
            App.closeFeature(false); App.playItem(previous, 'live');
        }, toolbar);
        button('← 2 h', function () { state.offset = Math.max(0, state.offset - 2); App.showLiveGuide(state); }, toolbar);
        button('Maintenant', function () { state.offset = 0; App.showLiveGuide(state); }, toolbar);
        button('+ 2 h →', function () { state.offset = Math.min(12, state.offset + 2); App.showLiveGuide(state); }, toolbar);
        var channels = App.guideChannels(state.favorites, state.now);
        state.count = channels.length;
        var from = Date.now() + state.offset * 3600000;
        var until = from + 7200000;
        node('p', EPG.fmtTime(from) + ' — ' + EPG.fmtTime(until) + ' · OK : regarder · ← → : horaires · ↑ ↓ : chaînes', 'feature-muted', host);
        if (!channels.length) { node('p', 'Aucune chaîne pour ce filtre. Désactivez-le pour afficher toutes les chaînes.', '', host); }
        channels.slice(state.start, state.start + 8).forEach(function (ch) {
            var row = button('', function () { App.closeFeature(false); App.playItem(ch, 'live'); }, host);
            row.classList.add('guide-row');
            row.setAttribute('data-guide-channel', '1');
            node('span', App.displayCatalogTitle(ch.name), 'guide-channel', row);
            var timeline = node('span', null, 'guide-timeline', row);
            var programs = EPG.schedule(ch.id).filter(function (p) { return p.stop > from && p.start < until; });
            if (!programs.length) { node('span', 'Programme non renseigné', 'guide-empty', timeline); }
            programs.forEach(function (p) {
                var cell = node('span', EPG.fmtTime(p.start) + ' ' + p.title, 'guide-program', timeline);
                cell.style.left = (Math.max(0, p.start - from) / 7200000 * 100) + '%';
                cell.style.width = ((Math.min(until, p.stop) - Math.max(from, p.start)) / 7200000 * 100) + '%';
                cell.title = p.title;
            });
        });
        if (state.start > 0) { button('↑ Chaînes précédentes', function () { state.start = Math.max(0, state.start - 8); App.showLiveGuide(state); }); }
        if (state.start + 8 < channels.length) { button('↓ Chaînes suivantes', function () { state.start += 8; App.showLiveGuide(state); }); }
        focusAt(channels.length ? 7 : 1);
    };
    App.refreshVisibleGuide = function () {
        if (App.uiState !== 'feature' || surfaceType !== 'guide' || !guide) { return; }
        var previousFocus = focus;
        App.showLiveGuide(guide);
        focusAt(previousFocus);
    };
})(App);
