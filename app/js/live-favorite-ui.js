/* Dedicated live-player favorite confirmation. */
var App = App || {};
(function (App) {
    'use strict';

    function currentLive() {
        var item = App.playingItem ? App.playingItem() : null;
        return item && item.kind === 'live' ? item : null;
    }

    App.updateLiveFavoritePopupFocus = function () {
        if (App.$liveFavoriteConfirm) {
            App.$liveFavoriteConfirm.className = App.liveFavoriteFocus === 'confirm'
                ? 'focused' : '';
            if (App.$liveFavoriteConfirm.getAttribute('data-removing') === 'true') {
                App.$liveFavoriteConfirm.classList.add('is-destructive');
            }
        }
        if (App.$liveFavoriteCancel) {
            App.$liveFavoriteCancel.className = App.liveFavoriteFocus === 'cancel'
                ? 'focused' : '';
        }
    };

    App.showLiveFavoritePopup = function () {
        var item = currentLive();
        if (!item || !App.$liveFavoritePopup) { return false; }
        var favorite = !!(App.isFavoriteChannel && App.isFavoriteChannel(item));
        App.liveFavoriteFocus = 'confirm';
        App.$liveFavoriteMessage.textContent = favorite
            ? 'Retirer « ' + item.name + ' » des favoris ?'
            : 'Ajouter « ' + item.name + ' » aux favoris ?';
        App.$liveFavoriteConfirm.textContent = favorite
            ? 'Retirer des favoris' : 'Ajouter aux favoris';
        App.$liveFavoriteConfirm.setAttribute('data-removing', favorite ? 'true' : 'false');
        App.uiState = 'liveFavorite';
        App.setExclusiveOverlays({ liveFavorite: true });
        App.updateLiveFavoritePopupFocus();
        return true;
    };

    App.hideLiveFavoritePopup = function () {
        if (App.$liveFavoritePopup) { App.$liveFavoritePopup.classList.add('hidden'); }
        App.uiState = 'watch';
    };

    App.confirmLiveFavorite = function () {
        var item = currentLive();
        if (item && App.toggleFavoriteChannel) { App.toggleFavoriteChannel(item); }
        App.hideLiveFavoritePopup();
    };

    App.onLiveFavoriteKeys = function (e) {
        switch (e.keyCode) {
            case App.KEY.LEFT:
            case App.KEY.RIGHT:
                App.liveFavoriteFocus = App.liveFavoriteFocus === 'confirm' ? 'cancel' : 'confirm';
                App.updateLiveFavoritePopupFocus();
                e.preventDefault();
                break;
            case App.KEY.ENTER:
                if (App.liveFavoriteFocus === 'confirm') { App.confirmLiveFavorite(); }
                else { App.hideLiveFavoritePopup(); }
                e.preventDefault();
                break;
            case App.KEY.RETURN:
            case App.KEY.ESC:
                App.hideLiveFavoritePopup();
                e.preventDefault();
                break;
        }
    };

    if (App.$infoActionFavorite) {
        App.$infoActionFavorite.addEventListener('click', function () {
            App.infoFocus = 'favorite';
            App.showLiveFavoritePopup();
        });
    }
    if (App.$liveFavoriteConfirm) {
        App.$liveFavoriteConfirm.addEventListener('click', App.confirmLiveFavorite);
    }
    if (App.$liveFavoriteCancel) {
        App.$liveFavoriteCancel.addEventListener('click', App.hideLiveFavoritePopup);
    }
})(App);
