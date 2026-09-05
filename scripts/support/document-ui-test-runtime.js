"use strict";
// Shared production document service for the isolated UI regression suites.
const fs = require("fs");
const path = require("path");
const { createHash, webcrypto } = require("crypto");
const { TextEncoder, TextDecoder } = require("util");
const { ROOT, createMemoryStorage, loadScript } = require("./copdoc-vm-harness");
function installDocumentRuntime(context) {
  Object.assign(context, { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer });
  context.navigator = context.navigator || {};
  const queues = new Map();
  context.navigator.locks = { request(name, options, callback) {
    const pending = (queues.get(name) || Promise.resolve()).then(() => callback({ name }));
    queues.set(name, pending.catch(() => {}));
    return pending;
  } };
  if (!context.localStorage) context.localStorage = createMemoryStorage().storage;
  ["functions/document-context.js", "functions/document-registry.js", "functions/document-generation.js"].forEach(file => loadScript(context, file));
  // Production shipping pins are verified by the Stage 7 package gate. These UI
  // suites can run while a renderer is edited, using its actual bytes as input.
  const api = context.COPDoc.documents;
  api.templateFingerprints = {};
  api.registry.all().forEach(entry => {
    api.templateFingerprints[entry.documentType] = Object.fromEntries(entry.template.sourceFiles.map(file => [
      file, createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")
    ]));
  });
  return api;
}
module.exports = { installDocumentRuntime };
