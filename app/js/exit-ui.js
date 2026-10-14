/* Exit confirm */
var App = App || {};
(function (App) {
    'use strict';

    /* ---------- exit ---------- */

    App.showExit = function () {
        App.persistResumePosition(true);
        App.exitReturnState = App.uiState;
        App.exitSettingsReturnState = App.settingsReturnState;
        var keepBrowse = (App.uiState === 'browse' || App.uiState === 'search');
        App.settingsReturnState = keepBrowse ? 'browse' : 'watch';
        App.uiState = 'exit';
        App.exitChoiceYes = true;
        App.updateExitChoice();
        App.setExclusiveOverlays({ exit: true, dim: true });
    }

    App.hideExit = function () {
        if (App.$exit) { App.$exit.classList.add('hidden'); }
        if (App.exitReturnState === 'settings') {
            App.showSettings(true);
            App.settingsReturnState = App.exitSettingsReturnState;
            return;
        }
        if (App.settingsReturnState === 'browse' || !App.playingItem()) {
            if (!App.catalogItems('live').length && !App.catalogItems('vod').length &&
                !App.catalogItems('series').length) {
                App.uiState = 'watch';
                App.setExclusiveOverlays({});
                return;
            }
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
            App.renderList();
            return;
        }
        App.uiState = 'watch';
        App.setExclusiveOverlays({});
        if (App.isSeekablePlaying()) { App.showVodControls(Player.isPaused()); }
        else if (App.playingItem()) { App.showInfo(); }
    }

    App.updateExitChoice = function () {
        App.$exitYes.className = App.exitChoiceYes ? 'focused' : '';
        App.$exitNo.className = App.exitChoiceYes ? '' : 'focused';
    }

    App.exitApp = function () {
        App.persistResumePosition(true);
        Storage.flush();
        if (typeof tizen !== 'undefined' && tizen.application) {
            tizen.application.getCurrentApplication().exit();
        } else {
            Player.stop();
            App.toast('Application fermée — fermez l’onglet du navigateur', true);
        }
    }
    if (App.$exitNo && App.$exitNo.addEventListener) {
        App.$exitNo.addEventListener('click', App.hideExit);
    }
    if (App.$exitYes && App.$exitYes.addEventListener) {
        App.$exitYes.addEventListener('click', App.exitApp);
    }
})(App);
