/* Xtream credentials helpers (from Storage) */
var App = App || {};
(function (App) {
    'use strict';

    App.xtreamFromStorage = function () {
        var server = Storage.get(Storage.KEYS.xtreamServer);
        var user = Storage.get(Storage.KEYS.xtreamUser);
        var pass = Storage.get(Storage.KEYS.xtreamPass);
        if (server && user && pass) {
            return { server: server, user: user, pass: pass };
        }
        return { server: server || '', user: user || '', pass: pass || '' };
    };
})(App);
