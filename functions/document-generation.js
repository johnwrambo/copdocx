/** Compatibility composition for the existing COPDoc.documents public API. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {}, documents = app.documents = app.documents || {};
  var repository = app.repositories.createDocumentGenerations({
    storage: app.repositories.storage,
    getImportWorkflow: function () { return app.importWorkflow; },
    getLocks: function () { return global.navigator && global.navigator.locks; }
  });
  Object.assign(documents, app.application.createDocumentGeneration({
    documents: documents, repository: repository,
    getCrypto: function () { return global.crypto; },
    encodeText: function (value) { return new global.TextEncoder().encode(value); }
  }));
})(typeof window !== "undefined" ? window : globalThis);
