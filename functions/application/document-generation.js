/** Captured input -> verified artifact orchestration. The injected repository owns persistence. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var application = app.application = app.application || {};
  application.createDocumentGeneration = function (deps) {
    var api = deps.documents, repository = deps.repository;
    var mutate = repository.mutate, validSource = repository.validSource;
  var KEY = "copdocx.document-generations.v1";
  var LOCK = KEY + ":write";
  var MAX_RECORDS = 5000;
  var HASH = /^[a-f0-9]{64}$/;
  var ID = /^[A-Za-z0-9_.:-]{1,160}$/;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function object(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function canonical(v) {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number" && isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (object(v)) return "{" + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canonical(v[k]);
    }).join(",") + "}";
    throw fail("INVALID_INPUT", "Document inputs must contain only JSON values.");
  }
  async function bytes(value) {
    if (typeof value === "string") return deps.encodeText(value);
    if (value && typeof value.arrayBuffer === "function") return new Uint8Array(await value.arrayBuffer());
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return new Uint8Array(value).slice();
    throw fail("INVALID_ARTIFACT", "The document renderer returned an unsupported output.");
  }
  async function hash(value) {
    if (!deps.getCrypto() || !deps.getCrypto().subtle) throw fail("HASH_UNAVAILABLE", "Document verification requires Web Crypto in a secure browser context.");
    var digest = await deps.getCrypto().subtle.digest("SHA-256", await bytes(value));
    return Array.from(new Uint8Array(digest)).map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
  }
  function newId() {
    if (!deps.getCrypto() || !deps.getCrypto().getRandomValues) throw fail("HASH_UNAVAILABLE", "Secure document identifiers are unavailable.");
    var b = new Uint8Array(16); deps.getCrypto().getRandomValues(b);
    return "doc_" + Array.from(b).map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
  }
  function sourceRefs(context) {
    return (context.sources || []).map(function (s) {
      if (!validSource(s)) throw fail("INVALID_SOURCE", "Document source references require an identity and an explicit authority.");
      return { type: s.type, id: s.id, revision: s.revision == null ? null : String(s.revision).slice(0, 200), authority: s.authority };
    });
  }
  async function templateHash(entry, content) {
    var sources = api.templateFingerprints && api.templateFingerprints[entry.documentType || entry.id];
    if (!object(sources) || !entry.template.sourceFiles.every(function (file) { return own(sources, file) && HASH.test(sources[file]); })) throw fail("TEMPLATE_UNVERIFIED", "This document template has no complete verified source fingerprint. Reload COPDoc before generating it.");
    var material = { template: entry.template, sources: copy(sources) };
    if (content !== undefined) {
      var binary = typeof content === "string" || ArrayBuffer.isView(content) ||
        Object.prototype.toString.call(content) === "[object ArrayBuffer]" || (content && typeof content.arrayBuffer === "function");
      material.runtimeHash = await hash(binary ? content : canonical(content));
    }
    return hash(canonical(material));
  }
  async function generate(options) {
    var opts = options || {}, type = opts.documentType;
    var entry = api.registry && api.registry.get(type);
    if (!entry) throw fail("UNKNOWN_DOCUMENT", "This document type is not registered.");
    if (typeof opts.render !== "function" || !opts.context || opts.context.documentType !== type) throw fail("INVALID_CONTEXT", "The document context does not match the requested output.");
    if (opts.requestId != null && !ID.test(opts.requestId)) throw fail("INVALID_REQUEST", "The generation request identifier is invalid.");
    // Capture defensively even if a caller passed a mutable object rather than captureContext().
    if (!api.captureContext) throw fail("INVALID_CONTEXT", "The document context validator is unavailable.");
    var context;
    try { context = api.captureContext(Object.assign({}, opts.context.entities || {}, {
      documentType: type, input: opts.context.input, sources: opts.context.sources,
      capturedAt: opts.context.capturedAt, generatingOfficerId: opts.context.generatingOfficerId
    })); } catch (e) { throw fail("INVALID_CONTEXT", "The document context contains invalid values or conflicting source identities."); }
    // Copy mutable template inputs before the first hashing await, too.
    var content = opts.templateContent;
    if (ArrayBuffer.isView(content)) content = new Uint8Array(content.buffer, content.byteOffset, content.byteLength).slice();
    else if (Object.prototype.toString.call(content) === "[object ArrayBuffer]") content = new Uint8Array(content).slice();
    else if (content !== undefined && typeof content !== "string" && !(content && typeof content.arrayBuffer === "function")) content = copy(content);
    var sources = sourceRefs(context);
    var inputHash = await hash(canonical({ documentType: type, input: context.input, entities: context.entities || {} }));
    var fingerprint = await hash(canonical({ sources: sources, inputHash: inputHash }));
    var templHash = await templateHash(entry, content);
    var id = newId();
    var start = {
      generationId: id, documentType: type, status: "PENDING", startedAt: new Date().toISOString(),
      template: { id: entry.template.id, version: entry.template.version },
      inputHash: inputHash, sourceFingerprint: fingerprint, templateHash: templHash, hashAlgorithm: "SHA-256",
      sources: sources, generatingOfficerId: context.generatingOfficerId || null,
      capturedAt: context.capturedAt || null, deliveries: []
    };
    if (opts.requestId != null) start.requestId = opts.requestId;
    await mutate(function (ledger) {
      if (Object.keys(ledger.records).length >= MAX_RECORDS) throw fail("LEDGER_FULL", "Document history is full. Export a safety backup before archiving history.");
      if (own(ledger.records, id) || (opts.requestId != null && Object.keys(ledger.records).some(function (key) { return ledger.records[key].requestId === opts.requestId; }))) {
        throw fail("DUPLICATE_REQUEST", "This generation request already has a history record. Start a new generation to retry it.");
      }
      ledger.records[id] = start;
      return start;
    });
    var artifact;
    try {
      var rendered = await opts.render(context);
      if (!object(rendered) || typeof rendered.mimeType !== "string" || !rendered.mimeType || rendered.mimeType.length > 120) throw fail("INVALID_ARTIFACT", "The renderer must return data and its MIME type.");
      rendered = Object.assign({}, rendered);
      var output = await bytes(rendered.data);
      var outputHash = await hash(output);
      // Own the returned bytes so later mutation in a renderer cannot change the released artifact.
      artifact = Object.assign({}, rendered, { data: typeof rendered.data === "string" ? rendered.data : output });
      var record = await mutate(function (ledger) {
        var row = ledger.records[id];
        if (!row || row.status !== "PENDING") throw fail("GENERATION_CONFLICT", "The document generation record changed before completion.");
        row.status = "GENERATED"; row.generatedAt = new Date().toISOString();
        row.outputHash = outputHash; row.outputBytes = output.byteLength; row.mimeType = rendered.mimeType;
        if (rendered.mediaId) row.mediaId = String(rendered.mediaId);
        return row;
      });
      return { artifact: artifact, record: record };
    } catch (error) {
      // Never store error.message: parsers and renderers may include medical/prose input in it.
      try { await mutate(function (ledger) {
        var row = ledger.records[id];
        if (!row || row.status !== "PENDING") throw fail("GENERATION_CONFLICT", "The generation receipt changed.");
        row.status = "FAILED"; row.failedAt = new Date().toISOString();
        row.failureCode = error && error.code === "LEDGER_WRITE_FAILED" ? "LEDGER_WRITE_FAILED" : "RENDER_FAILED";
        return row;
      }); } catch (receiptError) { /* A durable PENDING receipt remains visible after interruption/quota failure. */ }
      throw error;
    }
  }
  async function recordDelivery(id, detail) {
    var d = detail || {};
    if (["clipboard", "download", "print", "save"].indexOf(d.method) < 0 || ["SUBMITTED", "SUCCEEDED", "FAILED"].indexOf(d.status) < 0) throw fail("INVALID_DELIVERY", "The document delivery status is invalid.");
    if (d.artifact && (typeof d.artifact.mimeType !== "string" || !d.artifact.mimeType || d.artifact.mimeType.length > 120)) throw fail("INVALID_ARTIFACT", "A delivered artifact requires its MIME type.");
    var alternate = d.artifact ? { outputHash: await hash(d.artifact.data), mimeType: d.artifact.mimeType } : null;
    return mutate(function (ledger) {
      var row = ledger.records[id];
      if (!row || row.status !== "GENERATED") throw fail("GENERATION_NOT_READY", "The document has no completed generation receipt.");
      if (row.deliveries.length >= 100) throw fail("DELIVERY_LIMIT", "This generation has too many delivery attempts. Generate a new document.");
      row.deliveries.push({ at: new Date().toISOString(), method: d.method, status: d.status,
        outputHash: alternate ? alternate.outputHash : row.outputHash, mimeType: alternate ? alternate.mimeType : row.mimeType });
      return row;
    });
  }
  async function attachMedia(id, mediaId) {
    if (typeof mediaId !== "string" || !mediaId || mediaId.length > 200) throw fail("INVALID_MEDIA", "The generated document Media reference is invalid.");
    return mutate(function (ledger) {
      var row = ledger.records[id];
      if (!row || row.status !== "GENERATED") throw fail("GENERATION_NOT_READY", "The document has no completed generation receipt.");
      if (row.mediaId && row.mediaId !== mediaId) throw fail("MEDIA_CONFLICT", "This document receipt already references a different Media object.");
      row.mediaId = mediaId; return row;
    });
  }
  return { generate: generate, recordDelivery: recordDelivery, attachMedia: attachMedia,
    list: repository.list, get: repository.get, validateLedger: repository.validate,
    storageKey: repository.storageKey, hashOutput: hash };
  };
})(typeof window !== "undefined" ? window : globalThis);
