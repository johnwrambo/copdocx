/** Reviewed classic-script boundaries. No loader, network or application side effects. */
(function (global) {
  "use strict";
  var root = global.COPDoc = global.COPDoc || {};
  var manifest = {
  "schema": "copdocx.modules.v1",
  "version": 1,
  "dependencyScope": "Required Stage 8 boundary modules; existing public script order is preserved by host pages.",
  "modules": [
    {
      "path": "assets/icons/copdoc-icons.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/address.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/admin-disposition.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/admin.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/admin.js",
        "functions/application/admin.js"
      ]
    },
    {
      "path": "functions/age.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/alien-number.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/app-bar.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/admin.js"
      ]
    },
    {
      "path": "functions/application/admin.js",
      "layer": "application",
      "dependencies": [
        "functions/repositories/admin.js"
      ]
    },
    {
      "path": "functions/application/booking.js",
      "layer": "application",
      "dependencies": []
    },
    {
      "path": "functions/application/document-generation.js",
      "layer": "application",
      "dependencies": []
    },
    {
      "path": "functions/application/import.js",
      "layer": "application",
      "dependencies": []
    },
    {
      "path": "functions/application/transfer.js",
      "layer": "application",
      "dependencies": []
    },
    {
      "path": "functions/arrest-report.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/arrest-roster.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/preferences.js"
      ]
    },
    {
      "path": "functions/baseball-card-contract.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/baseball-page.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/preferences.js",
        "functions/repositories/bookin.js"
      ]
    },
    {
      "path": "functions/baseballcard.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/preferences.js",
        "functions/repositories/bookin.js"
      ]
    },
    {
      "path": "functions/book-in.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/bookin.js",
        "functions/documents/bookin-pdf.js"
      ]
    },
    {
      "path": "functions/booking-workflow.js",
      "layer": "compat",
      "dependencies": [
        "functions/application/booking.js",
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/cards.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/case-edit.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/date.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/document-context.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/document-fingerprints.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/document-generation.js",
      "layer": "compat",
      "dependencies": [
        "functions/repositories/browser-storage.js",
        "functions/repositories/document-generations.js",
        "functions/application/document-generation.js"
      ]
    },
    {
      "path": "functions/document-history.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/document-registry.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/documents/bookin-pdf.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/domain/booking-projection.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/domain/canonical-records.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/domain/encounter-subject-policy.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/encounter-narrative.js",
      "layer": "application",
      "dependencies": [
        "functions/projections/encounter-narrative.js",
        "functions/repositories/bookin.js",
        "functions/repositories/admin.js",
        "functions/repositories/preferences.js"
      ]
    },
    {
      "path": "functions/encounters.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/bookin.js"
      ]
    },
    {
      "path": "functions/file-upload.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/home.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/workspace.js",
        "functions/repositories/admin.js",
        "functions/repositories/bookin.js"
      ]
    },
    {
      "path": "functions/import-schema.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/import-workflow.js",
      "layer": "compat",
      "dependencies": [
        "functions/application/import.js",
        "functions/ui/import-dialogs.js",
        "functions/repositories/recovery.js"
      ]
    },
    {
      "path": "functions/integrity-page.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/integrity.js",
      "layer": "infrastructure",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/investigation-wall.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/investigations.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/le-search.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/lead-csv.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/lead-source.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/leads.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/bookin.js",
        "functions/repositories/workspace.js"
      ]
    },
    {
      "path": "functions/location-map.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/map-markup.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/map-popup.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/map-targets.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js",
        "functions/projections/map.js",
        "functions/repositories/admin.js"
      ]
    },
    {
      "path": "functions/map-views.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/map.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/media-card.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/model/autosave.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/model/business.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/collect.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/model/encounter.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/entity.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/hydrate.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/model/investigation.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/lead.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/link.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/location.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/media.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/model/officer.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/operation.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/person.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/schema.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/store.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js",
        "functions/domain/canonical-records.js",
        "functions/domain/encounter-subject-policy.js",
        "functions/projections/encounter-completion.js",
        "functions/domain/booking-projection.js"
      ]
    },
    {
      "path": "functions/model/ui.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/model/util.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/model/vehicle.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/names.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/narratives/build9/encounter-summary.js",
      "layer": "domain",
      "dependencies": [
        "functions/narratives/build9/narrative-coverage.js"
      ]
    },
    {
      "path": "functions/narratives/build9/index.js",
      "layer": "domain",
      "dependencies": [
        "functions/narratives/build9/encounter-summary.js"
      ]
    },
    {
      "path": "functions/narratives/build9/narrative-coverage.js",
      "layer": "domain",
      "dependencies": [
        "functions/narratives/build9/narrative-domain.js"
      ]
    },
    {
      "path": "functions/narratives/build9/narrative-domain.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/narratives/encounter-launcher.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/narratives/narrative-builder-engine.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/narrative-templates.js"
      ]
    },
    {
      "path": "functions/narratives/narrative-markup.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/narratives/narrative-page.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/narratives/narrative-workspace-ui.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/narratives/packet-builder.js",
      "layer": "projection",
      "dependencies": []
    },
    {
      "path": "functions/narratives/source-freshness.js",
      "layer": "projection",
      "dependencies": []
    },
    {
      "path": "functions/officer-roster.js",
      "layer": "compat",
      "dependencies": [
        "functions/application/admin.js"
      ]
    },
    {
      "path": "functions/operations.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/oracle.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/pdf/fill-warrant.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/pdf/i200-map.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/pdf/i205-map.js",
      "layer": "document",
      "dependencies": []
    },
    {
      "path": "functions/phone.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/photo-picker-modal.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/photo-picker.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/view-state.js"
      ]
    },
    {
      "path": "functions/plate-parse.js",
      "layer": "domain",
      "dependencies": []
    },
    {
      "path": "functions/projections/encounter-completion.js",
      "layer": "projection",
      "dependencies": []
    },
    {
      "path": "functions/projections/encounter-narrative.js",
      "layer": "projection",
      "dependencies": []
    },
    {
      "path": "functions/projections/map.js",
      "layer": "projection",
      "dependencies": []
    },
    {
      "path": "functions/rapsheet.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/repositories/admin.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/bookin.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/browser-storage.js",
      "layer": "repository",
      "dependencies": []
    },
    {
      "path": "functions/repositories/document-generations.js",
      "layer": "repository",
      "dependencies": []
    },
    {
      "path": "functions/repositories/narrative-templates.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/preferences.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/recovery.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/transfer.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/view-state.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/repositories/warrants.js",
      "layer": "repository",
      "dependencies": []
    },
    {
      "path": "functions/repositories/workspace.js",
      "layer": "repository",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/safety-backup.js",
      "layer": "infrastructure",
      "dependencies": [
        "functions/repositories/browser-storage.js"
      ]
    },
    {
      "path": "functions/ssn.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/transfer.js",
      "layer": "ui",
      "dependencies": [
        "functions/application/transfer.js",
        "functions/repositories/transfer.js"
      ],
      "dynamicDependencies": [
        "functions/model/store.js",
        "functions/model/media.js",
        "functions/baseball-card-contract.js"
      ]
    },
    {
      "path": "functions/ui/import-dialogs.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/vehicles.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/warrant-issue.js",
      "layer": "ui",
      "dependencies": [
        "functions/repositories/preferences.js",
        "functions/repositories/admin.js",
        "functions/repositories/warrants.js"
      ]
    },
    {
      "path": "functions/workflow.js",
      "layer": "ui",
      "dependencies": []
    },
    {
      "path": "functions/workspace-config.js",
      "layer": "infrastructure",
      "dependencies": []
    }
  ]
};
  manifest.modules.forEach(function (entry) { Object.freeze(entry.dependencies); if (entry.dynamicDependencies) Object.freeze(entry.dynamicDependencies); Object.freeze(entry); });
  Object.freeze(manifest.modules);
  root.moduleManifest = Object.freeze(manifest);
  if (typeof module !== "undefined" && module.exports) module.exports = root.moduleManifest;
})(typeof window !== "undefined" ? window : globalThis);
