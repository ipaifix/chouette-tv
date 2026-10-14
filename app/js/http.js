/* Shared XHR helper for playlist / Xtream / EPG (Tizen-friendly callbacks). */
var Http = (function () {
    'use strict';

    /**
     * GET text.
     * opts: { timeoutMs?: number, label?: string }
     * onDone(text), onError(message)
     */
    function get(url, opts, onDone, onError) {
        if (typeof opts === 'function') {
            onError = onDone;
            onDone = opts;
            opts = {};
        }
        opts = opts || {};
        var label = opts.label || 'HTTP';
        var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 60000;
        var xhr;
        var settled = false;
        function fail(message) {
            if (settled) { return; }
            settled = true;
            onError(message);
        }
        try {
            xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = timeoutMs;
            xhr.onload = function () {
                if (settled) { return; }
                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                    settled = true;
                    onDone(xhr.responseText);
                } else {
                    fail(label + ' HTTP ' + xhr.status);
                }
            };
            xhr.onerror = function () { fail(label + ' : erreur réseau'); };
            xhr.ontimeout = function () { fail(label + ' request timed out'); };
            xhr.onabort = function () { fail(label + ' request aborted'); };
            xhr.send();
        } catch (e) {
            /* Do not expose exception text: request URLs may contain credentials. */
            if (settled) { throw e; }
            fail(label + ' request could not be started');
        }
        /* Silent cancellation is distinct from a network failure. */
        return function () {
            if (settled) { return; }
            settled = true;
            xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
            try { xhr.abort(); } catch (eAbort) {}
        };
    }

    return { get: get };
})();
