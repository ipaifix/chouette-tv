/* Settings UI */
var App = App || {};
(function (App) {
    'use strict';

    App.settingsEditing = false;
    App.settingsRefreshBusy = false;

    App.isSettingsInput = function (el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    };

    App.beginSettingsEdit = function () {
        var el = App.settingsFocusables[App.settingsFocus];
        if (!App.isSettingsInput(el)) { return; }
        App.settingsEditing = true;
        el.readOnly = false;
        el.focus();
        try { el.select(); } catch (e) {}
    };

    App.blurSettingsInputs = function () {
        App.settingsEditing = false;
        for (var i = 0; i < App.settingsFocusables.length; i++) {
            var el = App.settingsFocusables[i];
            if (App.isSettingsInput(el)) {
                el.readOnly = true;
                try { el.blur(); } catch (e) {}
            }
        }
    };

    App.updateSettingsFocusClasses = function () {
        var railFocused = App.isShellRailFocused && App.isShellRailFocused();
        for (var i = 0; i < App.settingsFocusables.length; i++) {
            var el = App.settingsFocusables[i];
            if (!railFocused && i === App.settingsFocus) {
                el.classList.add('focused');
            } else {
                el.classList.remove('focused');
            }
        }
        var focused = !railFocused ? App.settingsFocusables[App.settingsFocus] : null;
        if (focused && focused.scrollIntoView) {
            try { focused.scrollIntoView({ block: 'nearest' }); } catch (e) {
                focused.scrollIntoView(false);
            }
        }
        if (typeof App.updateRailFocusUi === 'function') {
            App.updateRailFocusUi();
        }
    };

    App.showSettings = function (keepDraft) {
        var draftFocus = App.settingsFocus;
        if (App.uiState === 'browse' && typeof App.captureAuxReturnMenu === 'function') {
            App.captureAuxReturnMenu();
        }
        App.settingsReturnState = (App.uiState === 'browse' || App.uiState === 'search') ? 'browse' : 'watch';
        App.uiState = 'settings';
        App.blurSettingsInputs();
        App.refreshSettingsFocusables();
        var storedServer = Storage.get(Storage.KEYS.xtreamServer);
        var storedUser = Storage.get(Storage.KEYS.xtreamUser);
        var storedPass = Storage.get(Storage.KEYS.xtreamPass);

        if (!keepDraft && App.$settingXtreamServer) {
            App.$settingXtreamServer.value = storedServer;
        }
        if (!keepDraft && App.$settingXtreamUser) {
            App.$settingXtreamUser.value = storedUser;
        }

        if (!keepDraft && App.$settingXtreamPass) {
            App.$settingXtreamPass.value = '';
            if (storedPass) {
                App.$settingXtreamPass.placeholder = '•••• (enregistré)';
                App.$settingXtreamPass.setAttribute('data-has-saved', '1');
            } else {
                App.$settingXtreamPass.placeholder = 'Votre mot de passe';
                App.$settingXtreamPass.setAttribute('data-has-saved', '');
            }
        }

        if (!keepDraft && App.$settingUrl) { App.$settingUrl.value = Storage.get(Storage.KEYS.playlistUrl); }
        if (!keepDraft && App.$settingEpg) { App.$settingEpg.value = Storage.get(Storage.KEYS.epgUrl); }

        var shell = App.usesBrowseShell && App.usesBrowseShell();
        if (shell) {
            App.setExclusiveOverlays({ list: true, settings: true });
            if (App.$list) {
                App.$list.classList.remove('hidden');
                App.$list.classList.add('is-shell');
                App.$list.classList.add('is-shell-settings');
            }
            if (typeof App.hideSearchPane === 'function') { App.hideSearchPane(); }
            if (typeof App.showBrowseShell === 'function') { App.showBrowseShell(); }
            if (App.$homeMain) { App.$homeMain.classList.add('hidden'); }
            if (App.$listCol) { App.$listCol.classList.add('hidden'); }
            App.homeFocus = App.homeFocus || {};
            App.homeFocus.zone = 'content';
            App.homeFocus.railIndex = typeof App.currentShellRailIndex === 'function'
                ? App.currentShellRailIndex() : 0;
            if (typeof App.renderRail === 'function') { App.renderRail(); }
            document.body.classList.add('is-shell-settings');
        } else {
            App.setExclusiveOverlays({
                settings: true,
                dim: App.settingsReturnState === 'browse'
            });
            document.body.classList.remove('is-shell-settings');
        }

        if (App.$settings) { App.$settings.classList.remove('hidden'); }
        if (App.settingsFocusables.length) { App.setSettingsFocus(keepDraft ? draftFocus : 0); }
    };

    App.dismissSettingsShell = function () {
        App.blurSettingsInputs();
        if (App.$settings) { App.$settings.classList.add('hidden'); }
        if (App.$list) { App.$list.classList.remove('is-shell-settings'); }
        document.body.classList.remove('is-shell-settings');
        for (var i = 0; i < App.settingsFocusables.length; i++) {
            App.settingsFocusables[i].classList.remove('focused');
        }
    };

    App.hideSettings = function (restore) {
        if (restore !== false && (!App.hasCatalogContent || !App.hasCatalogContent()) &&
            (!App.playingItem || !App.playingItem())) {
            App.blurSettingsInputs();
            App.showExit();
            return;
        }
        App.dismissSettingsShell();
        if (App.settingsReturnState === 'browse' || !App.playingItem()) {
            App.uiState = 'browse';
            App.setExclusiveOverlays({ list: true, dim: true });
            if (restore !== false && typeof App.restoreAuxReturnMenu === 'function' &&
                App.restoreAuxReturnMenu(true)) {
                return;
            }
            App.auxReturnMenu = null;
            if (restore !== false && typeof App.renderList === 'function') { App.renderList(); }
            return;
        }
        App.auxReturnMenu = null;
        App.uiState = 'watch';
        App.setExclusiveOverlays({});
        if (App.isSeekablePlaying()) { App.showVodControls(Player.isPaused()); }
        else if (App.playingItem()) { App.showInfo(); }
    };

    App.setSettingsFocus = function (i) {
        App.blurSettingsInputs();
        App.settingsFocus = Math.max(0, Math.min(App.settingsFocusables.length - 1, i));
        App.updateSettingsFocusClasses();
    };

    App.refreshCatalogFromSettings = function () {
        if (App.settingsRefreshBusy) { return; }
        if (!App.catalogSourceFingerprint || !App.catalogSourceFingerprint()) {
            App.toast('Enregistrez d’abord un compte IPTV ou une playlist M3U');
            return;
        }
        App.settingsRefreshBusy = true;
        if (App.$settingRefresh) {
            App.$settingRefresh.disabled = true;
            App.$settingRefresh.textContent = 'Actualisation…';
        }
        App.blurSettingsInputs();
        App.updateSettingsFocusClasses();
        App.refreshCatalogFromServer({
            soft: App.hasCatalogContent && App.hasCatalogContent(),
            fromHome: false,
            onSettled: function () {
                App.settingsRefreshBusy = false;
                if (App.$settingRefresh) {
                    App.$settingRefresh.disabled = false;
                    App.$settingRefresh.textContent = 'Actualiser le catalogue';
                }
            }
        });
    };

    App.saveSettings = function () {
        var server = App.$settingXtreamServer.value.trim();
        var user = App.$settingXtreamUser.value.trim();
        var pass = App.$settingXtreamPass.value.trim();
        var m3u = App.$settingUrl.value.trim();
        var epg = App.$settingEpg.value.trim();
        server = Xtream.normalizeBase(server);

        if (!server && !user && m3u) {
            /* A playlist supplies a complete account, never pieces of another one. */
            pass = '';
            var parsed = Xtream.parseM3uCredentials(m3u);
            if (parsed) {
                server = parsed.base;
                user = parsed.username;
                pass = parsed.password;
            }
        } else if (server && user && !pass &&
            server === Xtream.normalizeBase(Storage.get(Storage.KEYS.xtreamServer)) &&
            user === Storage.get(Storage.KEYS.xtreamUser)) {
            /* Empty password means keep the saved password only for this account. */
            pass = Storage.get(Storage.KEYS.xtreamPass);
        }

        if ((server || user) && (!server || !user || !pass)) {
            App.toast('Renseignez le serveur, le compte et son mot de passe');
            return;
        }
        if (!server && !m3u) {
            App.toast('Renseignez un compte Xtream ou une URL M3U');
            return;
        }
        var urls = [server, m3u, epg];
        for (var i = 0; i < urls.length; i++) {
            if (urls[i] && !/^https?:\/\/[^\s/?#]+(?:[^\s]*)$/i.test(urls[i])) {
                App.toast('Utilisez une URL complète commençant par http:// ou https://');
                return;
            }
        }
        if (server && /[?#]/.test(server)) {
            App.toast('Le serveur Xtream doit être une URL sans paramètres ni fragment');
            return;
        }

        Storage.set(Storage.KEYS.xtreamServer, server);
        Storage.set(Storage.KEYS.xtreamUser, user);
        Storage.set(Storage.KEYS.xtreamPass, pass);
        Storage.set(Storage.KEYS.playlistUrl, m3u);
        Storage.set(Storage.KEYS.epgUrl, epg);
        Storage.flush();
        App.hideSettings(false);
        App.loadPlaylist();
    };

    if (App.$settingSave && App.$settingSave.addEventListener) {
        App.$settingSave.addEventListener('click', App.saveSettings);
    }
    if (App.$settingRefresh && App.$settingRefresh.addEventListener) {
        App.$settingRefresh.addEventListener('click', App.refreshCatalogFromSettings);
    }
    if (App.$settingCancel && App.$settingCancel.addEventListener) {
        App.$settingCancel.addEventListener('click', function () { App.hideSettings(); });
    }
    (function bindSettingsInputClicks() {
        var inputs = [App.$settingXtreamServer, App.$settingXtreamUser,
            App.$settingXtreamPass, App.$settingUrl, App.$settingEpg];
        for (var i = 0; i < inputs.length; i++) {
            (function (input) {
                if (!input || !input.addEventListener) { return; }
                input.addEventListener('click', function () {
                    App.refreshSettingsFocusables();
                    var index = App.settingsFocusables.indexOf(input);
                    if (index >= 0) { App.setSettingsFocus(index); }
                    App.beginSettingsEdit();
                });
            })(inputs[i]);
        }
    })();
})(App);
