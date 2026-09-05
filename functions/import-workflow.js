/** Compatibility composition for import commands and their review dialogs. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {}, dialogs;
  var service = app.application.createImport({
    recovery: app.repositories.recovery,
    getConfig: function () { return app.config; },
    getModel: function () { return app.model; },
    getMedia: function () { return app.media; },
    getCrypto: function () { return global.crypto; },
    getLocks: function () { return global.navigator && global.navigator.locks; },
    decodeBase64: function (value) { return global.atob(value); },
    notifyRecovered: function () { if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new global.CustomEvent("copdocx-import-recovered")); },
    onRecoveryChanged: function () { if (dialogs) dialogs.refreshRecoveryUi(); }
  });
  dialogs = app.ui.createImportDialogs(service);
  app.importWorkflow = Object.assign({}, service, dialogs);
  if (global.document && global.document.addEventListener) global.document.addEventListener("DOMContentLoaded", dialogs.refreshRecoveryUi);
  if (global.addEventListener) global.addEventListener("storage", function (event) { if (event.key === service.JOURNAL_KEY) dialogs.refreshRecoveryUi(); });
})(typeof window !== "undefined" ? window : globalThis);
