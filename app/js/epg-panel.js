/* Programme sheet for the active live channel. */
var App = App || {};
(function installProgrammeSheet(app) {
    'use strict';
    app.updateEpgPanelClasses = function () {
        var viewport = app.$epgItems, children = viewport.children;
        Array.prototype.forEach.call(children, function (node, index) {
            node.classList[index === app.epgFocusIndex ? 'add' : 'remove']('focused');
        });
        var selection = children[app.epgFocusIndex];
        if (!selection) { return; }
        var top = selection.offsetTop - viewport.offsetTop;
        var outside = top < viewport.scrollTop || top + selection.offsetHeight > viewport.scrollTop + viewport.clientHeight;
        if (outside) { viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 2); }
    };

    app.renderEpgPanel = function () {
        var media = app.playingItem();
        if (!media) { return; }
        var live = media.kind === 'live';
        app.epgItems = live && media.id ? EPG.schedule(media.id) : [];
        app.$epgTitle.textContent = 'Programme — ' + media.name;
        app.$epgItems.innerHTML = '';
        var clock = Date.now();
        var rows = app.epgItems.map(function (programme) {
            var row = document.createElement('li'), range = document.createElement('span');
            range.className = 'epg-time';
            range.textContent = [programme.start, programme.stop].map(EPG.fmtTime).join('–');
            row.appendChild(range);
            row.appendChild(document.createTextNode(programme.title));
            if (clock >= programme.start && clock < programme.stop) { row.classList.add('now'); }
            return row;
        });
        if (!rows.length) {
            var explanation = document.createElement('li');
            explanation.textContent = !live ? 'Le guide TV concerne les chaînes en direct'
                : EPG.isLoaded() ? 'Aucun programme disponible pour cette chaîne'
                : 'Ajoutez un guide TV dans les réglages pour afficher les programmes';
            rows.push(explanation);
        }
        rows.forEach(function (row) { app.$epgItems.appendChild(row); });
        app.updateEpgPanelClasses();
    };

    app.showEpgPanel = function () {
        if (!app.playingItem()) { return; }
        app.epgFocusIndex = 0;
        app.uiState = 'epg';
        app.setExclusiveOverlays({ epg: true });
        app.renderEpgPanel();
    };
    app.hideEpgPanel = function () {
        app.setExclusiveOverlays({});
        app.uiState = 'watch';
    };
}(App));
