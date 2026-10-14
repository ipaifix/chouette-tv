/* Browse shell: rail persistant + panneau droit (accueil ou catalogue) */
var App = App || {};
(function (App) {
    'use strict';

    App.isHomeDash = function () {
        return App.listLevel === 'types';
    };

    /* Rail visible dès qu’on a Live / Films / Séries. */
    App.usesBrowseShell = function () {
        return typeof App.useTypeMenu === 'function' && !!App.useTypeMenu();
    };

    App.isShellRailFocused = function () {
        return App.usesBrowseShell() && App.homeFocus && App.homeFocus.zone === 'rail';
    };

    App.homeRailIndexForHome = function () {
        var rail = App.HOME_RAIL || [];
        for (var i = 0; i < rail.length; i++) {
            if (rail[i].action === 'home') { return i; }
        }
        return 0;
    };

    App.homeRailIndexForType = function (type) {
        var rail = App.HOME_RAIL || [];
        for (var i = 0; i < rail.length; i++) {
            if (rail[i].action === 'type' && rail[i].type === type) { return i; }
        }
        return App.homeRailIndexForHome();
    };

    /* Index rail « section courante » (actif visuel, pas forcément focus). */
    App.currentShellRailIndex = function () {
        if (App.uiState === 'search' || App.listLevel === 'search') {
            var rail = App.HOME_RAIL || [];
            for (var i = 0; i < rail.length; i++) {
                if (rail[i].action === 'search') { return i; }
            }
        }
        if (App.uiState === 'settings') {
            var railS = App.HOME_RAIL || [];
            for (var s = 0; s < railS.length; s++) {
                if (railS[s].action === 'settings') { return s; }
            }
        }
        if (App.listLevel === 'types') { return App.homeRailIndexForHome(); }
        return App.homeRailIndexForType(App.contentType);
    };

    App.cloneMenuMemory = function (memory) {
        if (!memory) { return null; }
        try { return JSON.parse(JSON.stringify(memory)); } catch (e) { return memory; }
    };

    App.captureAuxReturnMenu = function () {
        if (App.auxReturnMenu) { return; }
        var activeRailIndex = typeof App.currentShellRailIndex === 'function'
            ? App.currentShellRailIndex() : null;
        if (typeof App.rememberMenu === 'function') { App.rememberMenu(); }
        App.auxReturnMenu = App.cloneMenuMemory(App.menuMemory);
        /* Activating an auxiliary destination moves the rail focus before this
         * snapshot. Restore the catalogue content, not that transient button. */
        if (App.auxReturnMenu && activeRailIndex != null &&
            App.auxReturnMenu.homeRailIndex !== activeRailIndex) {
            App.auxReturnMenu.homeZone = 'content';
            App.auxReturnMenu.homeRailIndex = activeRailIndex;
        }
    };

    App.restoreAuxReturnMenu = function (clearAfter) {
        var memory = App.auxReturnMenu;
        if (!memory) { return false; }
        App.menuMemory = App.cloneMenuMemory(memory);
        var restored = typeof App.restoreMenu === 'function' && App.restoreMenu();
        if (clearAfter !== false) { App.auxReturnMenu = null; }
        return !!restored;
    };

    App.homeLogoForContinue = function (entry) {
        if (!entry) { return ''; }
        var item = typeof App.itemFromResumeEntry === 'function'
            ? App.itemFromResumeEntry(entry) : null;
        if (item && item.logo) { return item.logo; }
        if (entry.kind === 'episode' && entry.seriesId) {
            var series = App.catalogItems('series');
            for (var i = 0; i < series.length; i++) {
                if (series[i] && String(series[i].seriesId) === String(entry.seriesId) &&
                    series[i].logo) {
                    return series[i].logo;
                }
            }
        }
        if (entry.kind === 'vod' && entry.id) {
            var vods = App.catalogItems('vod');
            for (var v = 0; v < vods.length; v++) {
                if (vods[v] && String(vods[v].id) === String(entry.id) && vods[v].logo) {
                    return vods[v].logo;
                }
            }
        }
        return '';
    };

    App.homeMetaForContinue = function (entry) {
        if (!entry) { return ''; }
        if (entry.kind === 'episode') {
            return typeof App.seasonEpisodeLabel === 'function'
                ? (App.seasonEpisodeLabel(entry) || '')
                : '';
        }
        var raw = entry.title || '';
        return typeof App.catalogTitleCountry === 'function'
            ? App.catalogTitleCountry(raw) : '';
    };

    App.homeNowPlayingForLive = function (ch) {
        if (!ch) { return ''; }
        if (ch.id && typeof EPG !== 'undefined') {
            var nn = EPG.nowNext(ch.id);
            if (nn && nn.now && nn.now.title) { return String(nn.now.title); }
        }
        return '';
    };

    /* Now-playing from EPG, else country code from "|FR| …". */
    App.homeMetaForLive = function (ch) {
        if (!ch) { return ''; }
        var nowPlaying = App.homeNowPlayingForLive(ch);
        if (nowPlaying) { return nowPlaying; }
        return typeof App.catalogTitleCountry === 'function'
            ? App.catalogTitleCountry(ch.name) : '';
    };

    App.homeMetaForCatalogItem = function (item) {
        if (!item) { return ''; }
        return typeof App.catalogTitleCountry === 'function'
            ? App.catalogTitleCountry(item.name) : '';
    };

    App.buildHomeRows = function () {
        var max = App.HOME_ROW_MAX || 14;
        var rows = [];
        var i;

        var continues = App.listContinueEntries
            ? App.listContinueEntries(null).slice(0, max) : [];
        if (continues.length) {
            var cItems = [];
            for (i = 0; i < continues.length; i++) {
                var e = continues[i];
                cItems.push({
                    kind: 'continue',
                    entry: e,
                    title: App.continueItemLabel(e),
                    meta: App.homeMetaForContinue(e),
                    logo: App.homeLogoForContinue(e)
                });
            }
            rows.push({
                id: 'continue',
                title: 'Continuer à regarder',
                items: cItems
            });
        }

        var favs = App.listFavoriteChannels
            ? App.listFavoriteChannels().slice(0, max) : [];
        if (favs.length) {
            var fItems = [];
            for (i = 0; i < favs.length; i++) {
                var ch = favs[i];
                fItems.push({
                    kind: 'live',
                    item: ch,
                    title: App.homeNowPlayingForLive(ch) || 'Programme indisponible',
                    meta: '',
                    logo: ch.logo || ''
                });
            }
            rows.push({
                id: 'fav-live',
                title: 'TV favoris',
                items: fItems
            });
        }

        var recentSeries = App.listRecentForType
            ? App.listRecentForType('series', max) : [];
        if (recentSeries.length) {
            var sItems = [];
            for (i = 0; i < recentSeries.length; i++) {
                var s = recentSeries[i];
                sItems.push({
                    kind: 'series',
                    item: s,
                    title: App.displayCatalogTitle(s.name || 'Série'),
                    meta: App.homeMetaForCatalogItem(s),
                    logo: s.logo || ''
                });
            }
            rows.push({
                id: 'recent-series',
                title: 'Récemment ajouté dans Séries',
                items: sItems
            });
        }

        var recentVod = App.listRecentForType
            ? App.listRecentForType('vod', max) : [];
        if (recentVod.length) {
            var vItems = [];
            for (i = 0; i < recentVod.length; i++) {
                var v = recentVod[i];
                vItems.push({
                    kind: 'vod',
                    item: v,
                    title: App.displayCatalogTitle(v.name || 'Film'),
                    meta: App.homeMetaForCatalogItem(v),
                    logo: v.logo || ''
                });
            }
            rows.push({
                id: 'recent-vod',
                title: 'Récemment ajouté dans Films',
                items: vItems
            });
        }

        if (App.loadFollowedSeries) {
            var followed = App.loadFollowedSeries();
            var followedItems = [];
            followed.forEach(function (record) {
                var item = App.findSeriesByFavorite(record);
                if (item && followedItems.length < max) {
                    followedItems.push({ kind: 'series', item: item,
                        title: App.displayCatalogTitle(item.name), logo: item.logo || '', meta: 'Série suivie' });
                }
            });
            if (followedItems.length) { rows.splice(continues.length ? 1 : 0, 0,
                { id: 'followed', title: 'Mes séries suivies', items: followedItems }); }
        }
        if (App.personalizedAdditions) {
            var picks = App.personalizedAdditions(max);
            if (picks.length) { rows.splice(continues.length ? 1 : 0, 0,
                { id: 'for-you', title: 'Ajouts dans vos catégories', items: picks }); }
        }
        if (App.currentViewer && rows.length) {
            rows[0].title = App.currentViewer().name + ' · ' + rows[0].title;
        }
        App.homeRows = rows;
    };

    App.clampHomeFocus = function () {
        var rail = App.HOME_RAIL || [];
        var f = App.homeFocus || { zone: 'rail', railIndex: 0, rowIndex: 0, itemIndex: 0 };
        f.railIndex = Math.max(0, Math.min(Math.max(0, rail.length - 1), f.railIndex || 0));
        if (rail.length && App.shellRailAvailable && !App.shellRailAvailable(f.railIndex)) {
            f.railIndex = App.homeRailIndexForHome();
        }
        if (App.isHomeDash()) {
            var rows = App.homeRows || [];
            if (!rows.length) {
                f.zone = 'rail';
                f.rowIndex = 0;
                f.itemIndex = 0;
            } else {
                f.rowIndex = Math.max(0, Math.min(rows.length - 1, f.rowIndex || 0));
                var n = (rows[f.rowIndex] && rows[f.rowIndex].items)
                    ? rows[f.rowIndex].items.length : 0;
                f.itemIndex = n ? Math.max(0, Math.min(n - 1, f.itemIndex || 0)) : 0;
                if (f.zone !== 'rail' && f.zone !== 'content') { f.zone = 'content'; }
            }
        } else if (f.zone !== 'rail' && f.zone !== 'content') {
            f.zone = 'content';
        }
        App.homeFocus = f;
    };

    App.hideBrowseShell = function () {
        if (App.$homeRail) { App.$homeRail.classList.add('hidden'); }
        if (App.$homeMain) { App.$homeMain.classList.add('hidden'); }
        if (App.$listCol) { App.$listCol.classList.remove('hidden'); }
        if (App.$list) {
            App.$list.classList.remove('is-shell');
            App.$list.classList.remove('is-home');
        }
    };

    App.showBrowseShell = function () {
        if (App.$homeRail) { App.$homeRail.classList.remove('hidden'); }
        if (App.$listBrand) { App.$listBrand.classList.add('hidden'); }
        if (App.$list) {
            App.$list.classList.add('is-shell');
        }
        App.homeBrandFocused = false;
    };

    App.showHomePane = function () {
        App.showBrowseShell();
        if (typeof App.hideSearchPane === 'function') { App.hideSearchPane(); }
        if (App.$homeMain) { App.$homeMain.classList.remove('hidden'); }
        if (App.$listCol) { App.$listCol.classList.add('hidden'); }
        if (App.$list) {
            App.$list.classList.add('is-home');
            App.$list.classList.remove('is-poster');
            App.$list.classList.remove('is-poster-live');
            App.$list.classList.remove('is-live-preview');
            App.$list.classList.remove('is-shell-settings');
        }
        document.body.classList.remove('is-shell-settings');
        if (App.$livePreview) {
            App.$livePreview.classList.add('hidden');
            App.$livePreview.setAttribute('aria-hidden', 'true');
        }
    };

    App.showCataloguePane = function () {
        App.showBrowseShell();
        if (typeof App.hideSearchPane === 'function') { App.hideSearchPane(); }
        if (App.$homeMain) { App.$homeMain.classList.add('hidden'); }
        if (App.$listCol) { App.$listCol.classList.remove('hidden'); }
        if (App.$list) {
            App.$list.classList.remove('is-home');
            App.$list.classList.remove('is-shell-settings');
        }
        document.body.classList.remove('is-shell-settings');
    };

    /* Compat anciens noms */
    App.hideHomeDashChrome = function () {
        if (App.usesBrowseShell()) {
            App.showCataloguePane();
        } else {
            App.hideBrowseShell();
        }
    };

    App.showHomeDashChrome = function () {
        App.showHomePane();
    };

    App.renderRail = function () {
        var host = App.$homeRailNav || App.$homeRail;
        if (!host) { return; }
        var rail = App.HOME_RAIL || [];
        var needBuild = host.children.length !== rail.length;
        if (needBuild) {
            host.innerHTML = '';
            for (var r = 0; r < rail.length; r++) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'home-rail-btn';
                if (rail[r].section === 'secondary') {
                    btn.className += ' is-secondary-start';
                }
                btn.setAttribute('data-rail', String(r));
                btn.setAttribute('data-rail-id', rail[r].id || '');
                btn.textContent = rail[r].label;
                host.appendChild(btn);
            }
        }
        for (var visible = 0; visible < host.children.length; visible++) {
            if (App.shellRailAvailable(visible)) { host.children[visible].classList.remove('hidden'); }
            else { host.children[visible].classList.add('hidden'); }
        }
        App.updateRailFocusUi();
    };
    App.shellRailAvailable = function (index) {
        var item = (App.HOME_RAIL || [])[index];
        if (!item) { return false; }
        if (!App.hasCatalogContent || !App.hasCatalogContent() || !App.catalogItems) { return true; }
        if (item.action === 'type') { return App.catalogItems(item.type).length > 0; }
        if (item.action === 'guide') { return App.catalogItems('live').length > 0; }
        return true;
    };

    App.updateRailFocusUi = function () {
        var host = App.$homeRailNav || App.$homeRail;
        if (!host) { return; }
        App.clampHomeFocus();
        var f = App.homeFocus;
        var activeIdx = App.currentShellRailIndex();
        var railBtns = host.children;
        for (var i = 0; i < railBtns.length; i++) {
            var el = railBtns[i];
            if (!el || !el.classList || !el.classList.contains('home-rail-btn')) { continue; }
            var focused = f.zone === 'rail' && i === f.railIndex;
            var active = i === activeIdx;
            if (active) { el.classList.add('is-active'); }
            else { el.classList.remove('is-active'); }
            if (focused) { el.classList.add('focused'); }
            else { el.classList.remove('focused'); }
        }
    };

    App.focusShellRail = function (preferIndex) {
        if (!App.usesBrowseShell()) { return; }
        var idx = preferIndex != null ? preferIndex : App.currentShellRailIndex();
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'rail';
        App.homeFocus.railIndex = idx;
        App.clampHomeFocus();
        App.updateRailFocusUi();
        if (App.isHomeDash()) {
            App.updateHomeContentFocusUi();
        } else if (typeof App.updateListClasses === 'function') {
            App.updateListClasses();
        }
        App.updateShellKeysHint();
        if (!App.isHomeDash() && typeof App.updateBrowseContextHeader === 'function') {
            App.updateBrowseContextHeader();
        }
    };

    App.focusShellContent = function () {
        if (!App.usesBrowseShell()) { return; }
        App.homeFocus = App.homeFocus || {};
        App.homeFocus.zone = 'content';
        App.homeFocus.railIndex = App.currentShellRailIndex();
        App.clampHomeFocus();
        App.updateRailFocusUi();
        if (App.uiState === 'settings' && typeof App.updateSettingsFocusClasses === 'function') {
            App.updateSettingsFocusClasses();
            return;
        }
        if (App.uiState === 'search' && typeof App.updateSearchFocusUi === 'function') {
            App.updateSearchFocusUi();
            return;
        }
        if (App.isHomeDash()) {
            App.updateHomeContentFocusUi();
        } else if (typeof App.updateListClasses === 'function') {
            App.updateListClasses();
        }
        App.updateShellKeysHint();
        if (typeof App.scheduleLivePreview === 'function') {
            App.scheduleLivePreview();
        }
    };

    App.createHomeCard = function (item, rowIndex, itemIndex) {
        var card = document.createElement('div');
        card.className = 'home-card' +
            (item.kind === 'live' ? ' is-live' : '') +
            (item.kind === 'search-query' ? ' is-query' : '');
        card.setAttribute('data-row', String(rowIndex));
        card.setAttribute('data-item', String(itemIndex));
        card.setAttribute('role', 'button');
        card.tabIndex = -1;

        if (item.kind === 'search-query') {
            var qTitle = document.createElement('div');
            qTitle.className = 'home-card-title';
            qTitle.textContent = item.title || '';
            card.appendChild(qTitle);
            if (item.meta) {
                var qMeta = document.createElement('div');
                qMeta.className = 'home-card-meta';
                qMeta.textContent = item.meta;
                card.appendChild(qMeta);
            }
            return card;
        }

        var art = document.createElement('div');
        art.className = 'home-card-art';
        var placeholder = document.createElement('span');
        placeholder.className = 'home-card-placeholder';
        placeholder.textContent = item.kind === 'live' ? 'TV' : 'Sans image';
        art.appendChild(placeholder);

        if (item.logo) {
            var img = document.createElement('img');
            img.alt = '';
            img.width = item.kind === 'live' ? 148 : 168;
            img.height = item.kind === 'live' ? 148 : 252;
            img.setAttribute('decoding', 'async');
            img.setAttribute('data-src', item.logo);
            img.onload = function () { art.classList.remove('is-empty'); };
            img.onerror = function () {
                try { img.style.display = 'none'; } catch (eImg) {}
                art.classList.add('is-empty');
            };
            art.appendChild(img);
            art.classList.add('is-empty');
        } else {
            art.classList.add('is-empty');
        }

        if (item.kind === 'continue' && item.entry &&
            typeof App.appendWatchProgress === 'function') {
            var wrap = document.createElement('div');
            App.appendWatchProgress(wrap, item.entry, {
                seriesStyle: item.entry.kind === 'episode'
            });
            var badge = wrap.querySelector('.watch-badge');
            var bar = wrap.querySelector('.watch-progress');
            if (badge) { art.appendChild(badge); }
            if (bar) { art.appendChild(bar); }
            if (wrap.className.indexOf('has-progress') >= 0) {
                card.className += ' has-progress';
            }
            if (wrap.className.indexOf('watch-done') >= 0) {
                card.className += ' watch-done';
            }
        }

        var title = document.createElement('div');
        title.className = 'home-card-title';
        title.textContent = item.title || '';

        card.appendChild(art);
        card.appendChild(title);
        if (item.meta) {
            var meta = document.createElement('div');
            meta.className = 'home-card-meta';
            meta.textContent = item.meta;
            card.appendChild(meta);
        }
        if (item.kind === 'continue') {
            var options = document.createElement('button');
            options.className = 'continue-options';
            options.textContent = 'Options'; options.tabIndex = -1;
            options.addEventListener('click', function (e) {
                if (e && e.stopPropagation) { e.stopPropagation(); }
                App.showItemActions(App.itemFromResumeEntry(item.entry), { entry: item.entry });
            });
            card.appendChild(options);
        }
        return card;
    };

    var imageQueue = [], imageActive = 0, imageGeneration = 0, retainedImages = [];
    function trimArtwork() {
        var pixels = 0;
        for (var p = 0; p < retainedImages.length; p++) { pixels += retainedImages[p]._homePixels || 0; }
        while (retainedImages.length > 64 || pixels > 8000000) {
            var victim = -1;
            for (var i = 0; i < retainedImages.length; i++) {
                if (!retainedImages[i]._homePinned) { victim = i; break; }
            }
            if (victim < 0) { break; }
            var image = retainedImages.splice(victim, 1)[0];
            pixels -= image._homePixels || 0; image._homePixels = 0;
            if (image.removeAttribute) { image.removeAttribute('src'); }
            if (image.parentNode && image.parentNode.classList) { image.parentNode.classList.add('is-empty'); }
        }
    }
    function pumpImages() {
        while (imageActive < 4 && imageQueue.length) {
            var job = imageQueue.shift();
            if (!job.img._homeLoadJob || job.generation !== imageGeneration) { continue; }
            imageActive++;
            (function (active) {
                var ended = false, timer;
                function finish(event) {
                    if (ended) { return; }
                    ended = true; clearTimeout(timer);
                    active.img.removeEventListener('load', finish);
                    active.img.removeEventListener('error', finish);
                    if (active.img._homeLoadJob === active) { active.img._homeLoadJob = null; }
                    if (event && event.type === 'load' && active.generation === imageGeneration) {
                        var width = active.img.naturalWidth || active.img.width || 0;
                        var height = active.img.naturalHeight || active.img.height || 0;
                        if (width > 2048 || height > 2048) {
                            active.img._homeOversized = true;
                            active.img.removeAttribute('src');
                            if (active.img.parentNode && active.img.parentNode.classList) { active.img.parentNode.classList.add('is-empty'); }
                        } else {
                            active.img._homePixels = width * height;
                            retainedImages.push(active.img); trimArtwork();
                        }
                    }
                    if (active.generation === imageGeneration) { imageActive--; pumpImages(); }
                }
                active.cancel = finish;
                active.img.addEventListener('load', finish);
                active.img.addEventListener('error', finish);
                timer = setTimeout(function () { active.img.removeAttribute('src'); finish(); }, 15000);
                active.img.style.display = '';
                active.img.src = active.src;
            })(job);
        }
    }
    function unloadImage(card) {
        if (!card || !card.querySelector) { return; }
        var img = card.querySelector('img[data-src]');
        if (!img) { return; }
        var job = img._homeLoadJob;
        var retained = retainedImages.indexOf(img);
        if (retained >= 0) { retainedImages.splice(retained, 1); }
        img._homePixels = 0; img._homePinned = false;
        img._homeLoadJob = null;
        if (job && job.cancel) { job.cancel(); }
        if (img.removeAttribute) { img.removeAttribute('src'); }
        if (img.parentNode && img.parentNode.classList) { img.parentNode.classList.add('is-empty'); }
    }
    App.releaseHomeArtwork = function (host) {
        if (!host || !host.querySelectorAll) { return; }
        var cards = host.querySelectorAll('.home-card, .detail-body');
        for (var i = 0; i < cards.length; i++) { unloadImage(cards[i]); }
    };
    App.loadHomeCardImage = function (card) {
        if (!card) { return; }
        var img = card.querySelector('img[data-src]');
        if (!img) { return; }
        var src = img.getAttribute('data-src');
        if (!src || img._homeOversized || img.getAttribute('src') === src) { return; }
        if (!img.addEventListener || !img.removeEventListener) { img.src = src; return; }
        if (img._homeLoadJob) { return; }
        var job = { img: img, src: src, generation: imageGeneration };
        img._homeLoadJob = job;
        imageQueue.push(job); pumpImages();
    };
    App.releaseBrowseViews = function () {
        imageGeneration++;
        imageQueue = []; imageActive = 0; retainedImages = [];
        clearTimeout(App._searchWorkTimer);
        App._searchGeneration = (App._searchGeneration || 0) + 1;
        [App.$homeRows, App.$searchShellRows, App.$items].forEach(function (host) {
            if (host && host.querySelectorAll) {
                var images = host.querySelectorAll('img');
                for (var i = 0; i < images.length; i++) {
                    var job = images[i]._homeLoadJob;
                    if (job && job.cancel) { job.cancel(); }
                    if (images[i].removeAttribute) { images[i].removeAttribute('src'); }
                }
            }
            if (host) { host.textContent = ''; }
        });
        App._listFocusedEl = App._listPlayingEl = null;
        App._posterFocusedEl = null;
        App._homeFocusedCard = App._homeActiveRow = null;
        if (App.markListWindowDirty) { App.markListWindowDirty(); }
    };

    App.loadVisibleHomeImages = function (rowsHost, focus) {
        rowsHost = rowsHost || App.$homeRows;
        if (!rowsHost) { return; }
        var f = focus || App.homeFocus || {};
        var rowIdx = f.zone === 'content' ? (f.rowIndex || 0) : 0;
        var rowH = App.HOME_ROW_EST_H || 320;
        var hostH = rowsHost.clientHeight || 0;
        var firstVisibleRow = hostH
            ? Math.max(0, Math.floor((rowsHost.scrollTop || 0) / rowH))
            : rowIdx;
        /* One row of margin covers mixed live/poster heights and the next scroll. */
        var visibleRowCount = hostH ? Math.ceil(hostH / rowH) + 2 : 2;
        var firstRow = Math.max(0, Math.min(firstVisibleRow, rowIdx) - 1);
        var lastRow = Math.max(
            firstVisibleRow + visibleRowCount,
            f.zone === 'content' ? rowIdx + 1 : 0
        );
        var sections = rowsHost.children;
        for (var s = 0; s < sections.length; s++) {
            var section = sections[s];
            if (!section || !section.classList || !section.classList.contains('home-row')) {
                continue;
            }
            var ri = parseInt(section.getAttribute('data-row'), 10);
            var track = section.querySelector('.home-row-track');
            if (!track) { continue; }
            var cards = track.children;
            for (var pin = 0; pin < cards.length; pin++) {
                var pinImage = cards[pin].querySelector && cards[pin].querySelector('img[data-src]');
                if (pinImage) {
                    var pinIndex = cards[pin].getAttribute ? parseInt(cards[pin].getAttribute('data-item'), 10) : pin;
                    pinImage._homePinned = f.zone === 'content' && ri === rowIdx && pinIndex === f.itemIndex;
                }
            }
            if (ri < firstRow || ri > lastRow) {
                for (var off = 0; off < cards.length; off++) { unloadImage(cards[off]); }
                continue;
            }
            var sample = cards[0];
            var cardW = sample && sample.offsetWidth ? sample.offsetWidth :
                (sample && sample.classList && sample.classList.contains('is-live')
                    ? (App.HOME_CARD_LIVE_W || 148) : (App.HOME_CARD_W || 168));
            var span = cardW + (App.HOME_CARD_GAP || 16);
            var viewW = track.clientWidth || rowsHost.clientWidth || 1200;
            var scrollLeft = track.scrollLeft || 0;
            var start = Math.max(0, Math.floor(scrollLeft / span) - 1);
            var end = Math.min(cards.length,
                Math.ceil((scrollLeft + viewW) / span) + 1);
            if (ri === rowIdx && f.zone === 'content') {
                var focusedItem = (f.itemIndex || 0) -
                    (parseInt(cards[0] && cards[0].getAttribute && cards[0].getAttribute('data-item'), 10) || 0);
                start = Math.min(start, Math.max(0, focusedItem - 2));
                end = Math.max(end,
                    Math.min(cards.length, focusedItem + 6));
            }
            for (var far = 0; far < cards.length; far++) {
                if (far < start - 1 || far > end + 1) { unloadImage(cards[far]); }
            }
            for (var c = start; c < end; c++) {
                App.loadHomeCardImage(cards[c]);
            }
        }
    };

    App.renderHomeDash = function () {
        if (!App.$homeRows) { return; }
        App.releaseHomeArtwork(App.$homeRows);
        App.beginResumeSnap();
        try {
            App.buildHomeRows();
            if (!App.homeFocus || App.listLevel === 'types') {
                /* Keep zone; sync rail to Accueil when landing home. */
                App.homeFocus = App.homeFocus || {};
                if (App.homeFocus.zone !== 'rail') {
                    App.homeFocus.railIndex = App.homeRailIndexForHome();
                }
            }
            App.clampHomeFocus();
            App.showHomePane();
            App.renderRail();

            App.$homeRows.innerHTML = '';
            if (!App.homeRows.length) {
                var empty = document.createElement('div');
                empty.className = 'home-empty';
                empty.textContent = 'Rien à afficher pour l’instant — ouvre En direct, Films ou Séries.';
                App.$homeRows.appendChild(empty);
            } else {
                for (var i = 0; i < App.homeRows.length; i++) {
                    var row = App.homeRows[i];
                    var section = document.createElement('section');
                    section.className = 'home-row';
                    section.setAttribute('data-row', String(i));

                    var head = document.createElement('div');
                    head.className = 'home-row-title';
                    head.textContent = row.title;

                    var track = document.createElement('div');
                    track.className = 'home-row-track';

                    for (var j = 0; j < row.items.length; j++) {
                        track.appendChild(App.createHomeCard(row.items[j], i, j));
                    }

                    section.appendChild(head);
                    section.appendChild(track);
                    App.$homeRows.appendChild(section);
                }
            }

            App._homeScrollRow = -1;
            App._homeFocusedCard = null;
            App._homeActiveRow = null;
            App.updateHomeFocusUi();
            App.loadVisibleHomeImages();
        } catch (err) {
            try {
                App.toast('Erreur sur l’accueil : ' + (err && err.message ? err.message : err), true);
            } catch (e2) {}
        }
        App.endResumeSnap();
    };

    App.updateShellKeysHint = function () {
        /* Hints télécommande retirés — navigation volontairement sans bandeau d’aide. */
    };

    App.updateHomeKeysHint = function () {};

    App.snapHomeRowToTop = function (section, rowIndex) {
        if (!section || !App.$homeRows) { return; }
        var target = 0;
        if (section.getBoundingClientRect && App.$homeRows.getBoundingClientRect) {
            target = Math.max(0, section.getBoundingClientRect().top -
                App.$homeRows.getBoundingClientRect().top + App.$homeRows.scrollTop);
        } else { target = Math.max(0, section.offsetTop || 0); }
        if (Math.abs(App.$homeRows.scrollTop - target) > 2) {
            App.$homeRows.scrollTop = target;
        }
    };

    App.scrollHomeTrackToCard = function (track, card, itemIndex, isLive) {
        if (!track) { return; }
        if (!itemIndex) {
            track.scrollLeft = 0;
            return;
        }
        var cardW = isLive ? (App.HOME_CARD_LIVE_W || 148) : (App.HOME_CARD_W || 168);
        var gap = App.HOME_CARD_GAP || 16;
        var pad = 36;
        var viewW = track.clientWidth || 1200;
        var cardLeft = card && isFinite(card.offsetLeft) ? card.offsetLeft : itemIndex * (cardW + gap);
        var cardRight = cardLeft + (card && card.offsetWidth || cardW);
        var sl = track.scrollLeft;
        if (cardLeft < sl + pad) {
            track.scrollLeft = Math.max(0, cardLeft - pad);
        } else if (cardRight > sl + viewW - pad) {
            track.scrollLeft = Math.max(0, cardRight - viewW + pad);
        }
    };

    App.ensureHomeFocusVisible = function () {
        var f = App.homeFocus || {};
        if (f.zone !== 'content' || !App.$homeRows) { return; }
        var section = App.$homeRows.querySelector(
            '.home-row[data-row="' + f.rowIndex + '"]'
        );
        if (!section) { return; }
        var track = section.querySelector('.home-row-track');
        var card = section.querySelector(
            '.home-card[data-item="' + f.itemIndex + '"]'
        );
        var row = App.homeRows && App.homeRows[f.rowIndex];
        var item = row && row.items && row.items[f.itemIndex];
        var isLive = !!(item && item.kind === 'live');

        if (App._homeScrollRow !== f.rowIndex) {
            App._homeScrollRow = f.rowIndex;
            App.snapHomeRowToTop(section, f.rowIndex);
        }

        App.scrollHomeTrackToCard(track, card, f.itemIndex, isLive);
    };

    App.updateHomeContentFocusUi = function () {
        var f = App.homeFocus || {};
        var prevCard = App._homeFocusedCard;
        var prevRow = App._homeActiveRow;
        var nextCard = null;
        var nextRow = null;

        if (f.zone === 'content' && App.$homeRows) {
            nextRow = App.$homeRows.querySelector(
                '.home-row[data-row="' + f.rowIndex + '"]'
            );
            if (nextRow) {
                nextCard = nextRow.querySelector(
                    '.home-card[data-item="' + f.itemIndex + '"]'
                );
            }
        }

        if (prevCard && prevCard !== nextCard) {
            prevCard.classList.remove('focused');
            prevCard.classList.remove('is-options-focused');
        }
        if (prevRow && prevRow !== nextRow) {
            prevRow.classList.remove('is-active');
        }
        if (nextCard) {
            nextCard.classList.add('focused');
            nextCard.classList.toggle('is-options-focused', f.cardAction === 'options');
            var options = f.cardAction === 'options' ? nextCard.querySelector('.continue-options') : null;
            try { (options || nextCard).focus(); } catch (e) {}
        }
        if (nextRow) { nextRow.classList.add('is-active'); }

        App._homeFocusedCard = nextCard;
        App._homeActiveRow = nextRow;
        App.ensureHomeFocusVisible();
        App.loadVisibleHomeImages();
    };

    App.updateHomeFocusUi = function () {
        App.clampHomeFocus();
        App.updateRailFocusUi();
        App.updateHomeContentFocusUi();
        App.updateShellKeysHint();
    };

    App.moveShellRailFocus = function (dRow) {
        var f = App.homeFocus || { zone: 'rail', railIndex: 0, rowIndex: 0, itemIndex: 0 };
        var rail = App.HOME_RAIL || [];
        f.zone = 'rail';
        var next = (f.railIndex || 0) + dRow;
        while (next >= 0 && next < rail.length && !App.shellRailAvailable(next)) { next += dRow < 0 ? -1 : 1; }
        if (next >= 0 && next < rail.length) { f.railIndex = next; }
        App.homeFocus = f;
        if (typeof App.scheduleUi === 'function') {
            App.scheduleUi(function () {
                App.updateRailFocusUi();
                if (App.isHomeDash()) {
                    App.updateHomeContentFocusUi();
                } else if (typeof App.updateListClasses === 'function') {
                    App.updateListClasses();
                }
                App.updateShellKeysHint();
            });
        } else {
            App.updateRailFocusUi();
            if (App.isHomeDash()) {
                App.updateHomeContentFocusUi();
            } else if (typeof App.updateListClasses === 'function') {
                App.updateListClasses();
            }
            App.updateShellKeysHint();
        }
    };

    App.moveHomeFocus = function (dRow, dCol) {
        var f = App.homeFocus || { zone: 'rail', railIndex: 0, rowIndex: 0, itemIndex: 0 };
        var rows = App.homeRows || [];

        if (f.zone === 'rail') {
            if (dCol > 0) {
                App.focusShellContent();
                return;
            }
            if (dRow) {
                App.moveShellRailFocus(dRow);
            }
            return;
        }

        /* content (accueil rangées) */
        var currentCard = rows[f.rowIndex] && rows[f.rowIndex].items[f.itemIndex];
        if (currentCard && currentCard.kind === 'continue' &&
            ((dRow > 0 && f.cardAction !== 'options') || (dRow < 0 && f.cardAction === 'options'))) {
            f.cardAction = dRow > 0 ? 'options' : '';
            App.homeFocus = f; App.updateHomeFocusUi(); return;
        }
        if (dCol < 0 && f.itemIndex <= 0) {
            App.focusShellRail(App.homeRailIndexForHome());
            return;
        }
        if (dCol) {
            var n = rows[f.rowIndex] ? rows[f.rowIndex].items.length : 0;
            if (!n) { return; }
            var nextItem = f.itemIndex + dCol;
            if (nextItem < 0 || nextItem >= n) { return; }
            f.itemIndex = nextItem;
            f.cardAction = '';
            App.homeFocus = f;
            if (typeof App.scheduleUi === 'function') {
                App.scheduleUi(function () { App.updateHomeFocusUi(); });
            } else {
                App.updateHomeFocusUi();
            }
            return;
        }
        if (dRow) {
            var nextRow = f.rowIndex + dRow;
            if (nextRow < 0 || nextRow >= rows.length) { return; }
            var prevItem = f.itemIndex;
            f.rowIndex = nextRow;
            f.cardAction = '';
            var nn = rows[f.rowIndex].items.length;
            f.itemIndex = Math.max(0, Math.min(nn - 1, prevItem));
            App.homeFocus = f;
            if (typeof App.scheduleUi === 'function') {
                App.scheduleUi(function () { App.updateHomeFocusUi(); });
            } else {
                App.updateHomeFocusUi();
            }
        }
    };

    App.activateHomeRail = function () {
        var rail = (App.HOME_RAIL || [])[App.homeFocus.railIndex];
        if (!rail) { return; }
        if (!App.shellRailAvailable(App.homeFocus.railIndex)) { return; }

        if (App.uiState === 'settings' && rail.action === 'settings') {
            App.focusShellContent();
            return;
        }
        if (App.uiState === 'search' && rail.action === 'search') {
            App.focusShellContent();
            return;
        }

        /* Quitte réglages / recherche avant de changer de section. */
        if (App.uiState === 'settings' && rail.action !== 'settings') {
            if (typeof App.dismissSettingsShell === 'function') {
                App.dismissSettingsShell();
            }
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
        }
        if (App.uiState === 'search' && rail.action !== 'search') {
            if (typeof App.dismissSearchShell === 'function') {
                App.dismissSearchShell();
            }
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
        }

        if (rail.action === 'profiles' || rail.action === 'guide') {
            App.restoreAuxReturnMenu(true);
            if (rail.action === 'profiles') { App.showProfiles(); }
            else { App.showLiveGuide(); }
            return;
        }

        if (rail.action === 'home') {
            App.auxReturnMenu = null;
            if (App.listLevel === 'types' && App.uiState === 'browse') {
                App.focusShellContent();
                return;
            }
            App.openTypes({
                homeZone: 'content',
                homeRailIndex: App.homeRailIndexForHome(),
                homeRowIndex: 0,
                homeItemIndex: 0
            });
            App.rememberMenu();
            return;
        }
        if (rail.action === 'settings') {
            App.showSettings();
            return;
        }
        if (rail.action === 'search') {
            App.showSearch();
            return;
        }
        if (rail.action === 'type') {
            App.auxReturnMenu = null;
            if (App.contentType === rail.type && App.listLevel !== 'types' &&
                App.listLevel !== 'search' &&
                (App.listLevel === 'categories' || App.listLevel === 'content' ||
                    App.listLevel === 'favorites' || App.listLevel === 'continue')) {
                App.focusShellContent();
                return;
            }
            App.enterType(rail.type);
        }
    };

    App.activateHomeCard = function () {
        var f = App.homeFocus;
        var row = App.homeRows[f.rowIndex];
        if (!row || !row.items || !row.items[f.itemIndex]) { return; }
        var card = row.items[f.itemIndex];

        if (card.kind === 'continue') {
            var resumeItem = App.itemFromResumeEntry(card.entry);
            if (f.cardAction === 'options' || !resumeItem || !resumeItem.url) {
                App.showItemActions(resumeItem, { entry: card.entry });
            } else {
                App.playItem(resumeItem, resumeItem.kind, { skipResumePrompt: true,
                    startAt: App.shouldOfferResume(card.entry) ? card.entry.pos : 0 });
            }
            return;
        }
        if (card.kind === 'live') {
            var live = card.item;
            if (!live || !live.url) {
                App.toast('Flux indisponible');
                return;
            }
            App.playItem(live, 'live');
            return;
        }
        if (card.kind === 'vod') {
            var vod = card.item;
            if (!vod || !vod.url) {
                App.toast('Flux indisponible');
                return;
            }
            App.showDetails(vod);
            return;
        }
        if (card.kind === 'series') {
            var seriesItem = card.item;
            if (App.showDetails && seriesItem) { App.showDetails(seriesItem); return; }
            if (!seriesItem) {
                App.toast('Série introuvable');
                return;
            }
            App.setContentType('series');
            App.openedFromFavorites = false;
            App.activeSeries = seriesItem;
            App.toast('Chargement de ' + seriesItem.name + '…');
            App.seriesLoading = true;
            Xtream.getSeriesInfo(
                App.xtreamCreds.base, App.xtreamCreds.username, App.xtreamCreds.password,
                seriesItem.seriesId,
                function (seasons) {
                    App.seriesLoading = false;
                    App.openSeasons(seasons);
                    App.rememberMenu();
                },
                function (err) {
                    App.seriesLoading = false;
                    App.toast(err);
                }
            );
        }
    };

    App.onHomeEnter = function () {
        if (App.seriesLoading) { return; }
        if (App.homeFocus.zone === 'rail') {
            App.activateHomeRail();
        } else {
            App.activateHomeCard();
        }
    };

    App.onShellRailKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.UP:
                App.moveShellRailFocus(-1);
                e.preventDefault();
                break;
            case App.KEY.DOWN:
                App.moveShellRailFocus(1);
                e.preventDefault();
                break;
            case App.KEY.RIGHT:
                App.focusShellContent();
                e.preventDefault();
                break;
            case App.KEY.LEFT:
                e.preventDefault();
                break;
            case App.KEY.ENTER:
                App.activateHomeRail();
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                if (App.listLevel === 'types') {
                    App.showExit();
                } else {
                    App.onListBack();
                }
                e.preventDefault();
                break;
            default:
                break;
        }
    };

    App.onHomeKeys = function (e) {
        if (App.homeFocus && App.homeFocus.zone === 'rail') {
            App.onShellRailKeys(e);
            return;
        }
        switch (e.keyCode) {
            case App.KEY.UP:
                App.moveHomeFocus(-1, 0);
                e.preventDefault();
                break;
            case App.KEY.DOWN:
                App.moveHomeFocus(1, 0);
                e.preventDefault();
                break;
            case App.KEY.LEFT:
                App.moveHomeFocus(0, -1);
                e.preventDefault();
                break;
            case App.KEY.RIGHT:
                App.moveHomeFocus(0, 1);
                e.preventDefault();
                break;
            case App.KEY.ENTER:
                App.onHomeEnter();
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.showExit();
                e.preventDefault();
                break;
            case App.KEY.CH_UP:
            case App.KEY.PAGE_UP:
                App.moveHomeFocus(-1, 0);
                e.preventDefault();
                break;
            case App.KEY.CH_DOWN:
            case App.KEY.PAGE_DOWN:
                App.moveHomeFocus(1, 0);
                e.preventDefault();
                break;
        }
    };

    App.bindHomeRailClicks = function () {
        var host = App.$homeRailNav || App.$homeRail;
        if (!host || host.getAttribute('data-bound') === '1') { return; }
        host.setAttribute('data-bound', '1');
        host.addEventListener('click', function (e) {
            var shellState = App.uiState === 'browse' || App.uiState === 'search' ||
                App.uiState === 'settings';
            if (!shellState || (!App.usesBrowseShell() && !App.isHomeDash())) { return; }
            var t = e.target;
            while (t && t !== host &&
                (!t.classList || !t.classList.contains('home-rail-btn'))) {
                t = t.parentNode;
            }
            if (!t || t === host) { return; }
            var idx = parseInt(t.getAttribute('data-rail'), 10);
            if (isNaN(idx)) { return; }
            App.homeFocus = {
                zone: 'rail',
                railIndex: idx,
                rowIndex: App.homeFocus.rowIndex || 0,
                itemIndex: App.homeFocus.itemIndex || 0
            };
            App.updateRailFocusUi();
            App.activateHomeRail();
        });
        if (App.$homeRows) {
            App.$homeRows.addEventListener('click', function (e) {
                if (App.uiState !== 'browse' || !App.isHomeDash()) { return; }
                var t = e.target;
                while (t && t !== App.$homeRows &&
                    (!t.classList || !t.classList.contains('home-card'))) {
                    t = t.parentNode;
                }
                if (!t || t === App.$homeRows) { return; }
                var ri = parseInt(t.getAttribute('data-row'), 10);
                var ii = parseInt(t.getAttribute('data-item'), 10);
                if (isNaN(ri) || isNaN(ii)) { return; }
                App.homeFocus = {
                    zone: 'content',
                    railIndex: App.homeRailIndexForHome(),
                    rowIndex: ri,
                    itemIndex: ii
                };
                App.updateHomeFocusUi();
                App.onHomeEnter();
            });
        }
    };
})(App);
