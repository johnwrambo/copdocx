/** Compatibility composition for the existing COPDoc.booking API. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  app.booking = app.application.createBooking({
    storage: app.repositories.storage,
    getConfig: function () { return app.config; },
    getModel: function () { return app.model; },
    getOfficers: function () { return app.officers; },
    getImportWorkflow: function () { return app.importWorkflow; },
    getCrypto: function () { return global.crypto; },
    getLocks: function () { return global.navigator && global.navigator.locks; }
  });
})(typeof window !== "undefined" ? window : globalThis);
