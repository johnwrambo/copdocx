/** Staged imports with exact before images and restartable storage/Media recovery. */
(function (global) {
  "use strict";
  var root = global.COPDoc = global.COPDoc || {};
  var KEY = "copdocx.import-transactions.v1";
  var running = false;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message, code) { var e = new Error(message); e.code = code || "IMPORT_BLOCKED"; throw e; }
  function failure(e, id) { return { ok: false, code: e.code || "IMPORT_WRITE_FAILED", error: e.message || String(e), transactionId: id || "" }; }
  function storage(medium) {
    var target = global[medium || "localStorage"];
    if (!target || typeof target.getItem !== "function") fail("Browser storage is unavailable.");
    return target;
  }
  function registry(key, medium) {
    return root.config && root.config.storageEntries.some(function (row) { return row.key === key && row.medium === medium; });
  }
  function validateChanges(plan) {
    if (!plan || plan.ok !== true || !Array.isArray(plan.changes) || !Array.isArray(plan.mediaPlans || [])) fail("An approved, valid import plan is required.", "IMPORT_PLAN_INVALID");
    var seen = Object.create(null);
    plan.changes.forEach(function (row) {
      var medium = row && (row.medium || "localStorage"), tag = medium + ":" + (row && row.key);
      if (!row || row.key === KEY || !registry(row.key, medium) || ["localStorage", "sessionStorage"].indexOf(medium) < 0 || seen[tag]) fail("Import plan contains a duplicate or unregistered storage destination.", "IMPORT_PLAN_INVALID");
      if (!(row.before === null || typeof row.before === "string") || !(row.after === null || typeof row.after === "string")) fail("Import plans must preserve exact before and after storage bytes.", "IMPORT_PLAN_INVALID");
      seen[tag] = true;
    });
    (plan.guards || []).forEach(function (row) {
      if (!row || row.key === KEY || !registry(row.key, row.medium || "localStorage") || !(row.before === null || typeof row.before === "string")) fail("Import read guard is invalid.", "IMPORT_PLAN_INVALID");
    });
    var mediaIds = Object.create(null);
    (plan.mediaPlans || []).forEach(function (row) {
      var id = row && (row.mediaId || row.meta && row.meta.mediaId);
      if (!id || mediaIds[id]) fail("Import contains duplicate or missing Media IDs.", "IMPORT_PLAN_INVALID");
      mediaIds[id] = true;
    });
  }
  function load() {
    var raw = storage("localStorage").getItem(KEY);
    if (raw === null) return { schema: KEY, version: 1, transactions: {} };
    var journal;
    try { journal = JSON.parse(raw); } catch (e) { fail("The import recovery journal is unreadable. Preserve it and use your recovery archive.", "IMPORT_JOURNAL_INVALID"); }
    if (!journal || journal.schema !== KEY || journal.version !== 1 || !journal.transactions || Array.isArray(journal.transactions) || typeof journal.transactions !== "object") fail("The import recovery journal has an unsupported format.", "IMPORT_JOURNAL_INVALID");
    Object.keys(journal.transactions).forEach(function (id) {
      var row = journal.transactions[id];
      if (!row || row.transactionId !== id || ["PENDING", "APPLYING", "ROLLING_BACK", "COMPLETED", "ROLLED_BACK"].indexOf(row.status) < 0) fail("An import recovery entry is invalid.", "IMPORT_JOURNAL_INVALID");
      if (!Number.isInteger(row.revision) || row.revision < 0 || !Array.isArray(row.appliedKeys) || !Array.isArray(row.mediaCreated) || typeof row.mediaPrepared !== "boolean" || (row.media !== undefined && !Array.isArray(row.media))) fail("Import recovery checkpoints are invalid.", "IMPORT_JOURNAL_INVALID");
      [row.appliedKeys, row.mediaCreated].forEach(function (items) { if (items.some(function (item, index) { return typeof item !== "string" || !item || items.indexOf(item) !== index; })) fail("Import recovery checkpoint IDs are invalid.", "IMPORT_JOURNAL_INVALID"); });
      validateChanges(row.plan);
    });
    return journal;
  }
  function unfinished(row) { return row.status !== "COMPLETED" && row.status !== "ROLLED_BACK"; }
  function writeJournal(journal) {
    var bytes = JSON.stringify(journal);
    storage("localStorage").setItem(KEY, bytes);
    if (storage("localStorage").getItem(KEY) !== bytes) fail("The import checkpoint could not be verified.");
  }
  function checkpoint(row) {
    var journal = load(), current = journal.transactions[row.transactionId];
    if (!current || current.revision !== row.revision) fail("Import recovery changed in another window. Reload before continuing.", "IMPORT_CONFLICT");
    var next = clone(row); next.revision += 1; next.updatedAt = new Date().toISOString();
    journal.transactions[row.transactionId] = next;
    writeJournal(journal);
    row.revision = next.revision; row.updatedAt = next.updatedAt;
  }
  function raw(row) { return storage(row.medium).getItem(row.key); }
  function preflight(plan, recovery) {
    validateChanges(plan);
    var changed = Object.create(null);
    plan.changes.forEach(function (row) {
      changed[(row.medium || "localStorage") + ":" + row.key] = row;
      var current = raw(row);
      if (current !== row.before && (!recovery || current !== row.after)) fail("The saved data changed since preview: " + row.key + ". Preview again or resolve the pending import.", "IMPORT_CONFLICT");
    });
    (plan.guards || []).forEach(function (row) {
      if (!changed[(row.medium || "localStorage") + ":" + row.key] && raw(row) !== row.before) fail("An import dependency changed: " + row.key + ". Preview again before importing.", "IMPORT_CONFLICT");
    });
  }
  function ensureBookingIdle() {
    var bytes = storage("localStorage").getItem("copdocx.booking-transactions.v1");
    if (!bytes) return;
    var journal; try { journal = JSON.parse(bytes); } catch (e) { fail("Repair the unreadable booking journal before importing."); }
    if (!journal || !journal.transactions || Object.keys(journal.transactions).some(function (id) { return journal.transactions[id].status !== "COMPLETED"; })) fail("Finish pending bookings before importing.");
  }
  function begin(plan) {
    var journal = load();
    if (Object.keys(journal.transactions).some(function (id) { return unfinished(journal.transactions[id]); })) fail("Resume or roll back the pending import before starting another.", "IMPORT_PENDING");
    ensureBookingIdle(); preflight(plan, false);
    var id = "imp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
    var row = { transactionId: id, status: "PENDING", revision: 0, createdAt: new Date().toISOString(), plan: clone(plan), appliedKeys: [], mediaCreated: [], mediaPrepared: false };
    journal.transactions[id] = row;
    writeJournal(journal); // Exact before images must exist before the first data write.
    return clone(row);
  }
  function writeValue(row, value) {
    var target = storage(row.medium);
    if (value === null) target.removeItem(row.key); else target.setItem(row.key, value);
    if (target.getItem(row.key) !== value) fail("Could not verify imported data: " + row.key);
  }
  function commitStorage(row) {
    preflight(row.plan, true);
    row.status = "APPLYING"; checkpoint(row);
    row.plan.changes.forEach(function (change) {
      var current = raw(change);
      if (current !== change.after) {
        if (current !== change.before) fail("Another window changed " + change.key + ".", "IMPORT_CONFLICT");
        writeValue(change, change.after);
      }
      var tag = (change.medium || "localStorage") + ":" + change.key;
      if (row.appliedKeys.indexOf(tag) < 0) row.appliedKeys.push(tag);
      checkpoint(row);
    });
    row.plan.changes.forEach(function (change) { if (raw(change) !== change.after) fail("Import verification failed: " + change.key); });
    row.status = "COMPLETED"; checkpoint(row);
    refresh();
    return { ok: true, transactionId: row.transactionId, status: row.status, stats: clone(row.plan.stats || {}) };
  }
  function commitSync(plan) {
    var row;
    try {
      validateChanges(plan);
      if (running || (plan.mediaPlans || []).length) fail("Use the asynchronous import workflow for Media imports.");
      running = true; row = begin(plan); return commitStorage(row);
    } catch (e) { return failure(e, row && row.transactionId); }
    finally { running = false; refreshRecoveryUi(); }
  }
  function dataPart(dataUrl) {
    var match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl || "");
    if (!match) fail("Imported card photos must be PNG, JPEG, WebP or GIF data URLs.", "IMPORT_MEDIA_INVALID");
    var base64 = match[2].replace(/[\r\n]/g, ""), binary;
    try { binary = global.atob(base64); } catch (e) { fail("Imported photo bytes are invalid.", "IMPORT_MEDIA_INVALID"); }
    if (binary.length > 15 * 1024 * 1024) fail("An imported photo exceeds the 15 MB Media limit.");
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { mime: match[1].toLowerCase(), base64: base64, bytes: bytes };
  }
  async function hashBytes(bytes) {
    if (!global.crypto || !global.crypto.subtle) fail("Verified photo import requires browser SHA-256 support.");
    var digest = await global.crypto.subtle.digest("SHA-256", bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (n) { return n.toString(16).padStart(2, "0"); }).join("");
  }
  async function bundleFor(plan) {
    var bundle;
    if (plan.meta && Array.isArray(plan.blobs)) bundle = clone(plan);
    else {
      var part = dataPart(plan.dataUrl), sha = await hashBytes(part.bytes);
      bundle = { meta: { mediaId: plan.mediaId, owner: { type: plan.ownerType, id: plan.ownerId }, mediaClass: "photo", kind: "subject", mime: part.mime, bytes: part.bytes.length, sha256: sha, originalName: plan.filename || "imported-card-photo", roles: ["original"] }, blobs: [{ role: "original", mime: part.mime, bytes: part.bytes.length, base64: part.base64 }] };
    }
    var meta = bundle.meta, roles = [], original;
    if (!meta || typeof meta.mediaId !== "string" || !meta.mediaId.trim() || !meta.owner || ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY", "OFFICER", "ENCOUNTER", "LEAD", "BOOKIN"].indexOf(meta.owner.type) < 0 || typeof meta.owner.id !== "string" || !meta.owner.id.trim()) fail("Imported Media identity is invalid.", "IMPORT_MEDIA_INVALID");
    if (["photo", "file"].indexOf(meta.mediaClass) < 0 || !bundle.blobs.length || bundle.blobs.length > 10) fail("Imported Media classification is invalid.", "IMPORT_MEDIA_INVALID");
    var ownerKey = meta.owner.type + ":" + meta.owner.id;
    if (meta.ownerKey && meta.ownerKey !== ownerKey) fail("Imported Media owner key is inconsistent.", "IMPORT_MEDIA_INVALID");
    for (var i = 0; i < bundle.blobs.length; i += 1) {
      var blob = bundle.blobs[i];
      if (!blob || typeof blob.role !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(blob.role) || roles.indexOf(blob.role) >= 0 || typeof blob.base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(blob.base64)) fail("Imported Media roles or encoded bytes are invalid.", "IMPORT_MEDIA_INVALID");
      roles.push(blob.role);
      var binary = global.atob(blob.base64), bytes = new Uint8Array(binary.length);
      for (var n = 0; n < binary.length; n += 1) bytes[n] = binary.charCodeAt(n);
      if (blob.bytes !== bytes.length || bytes.length > (meta.mediaClass === "photo" ? 15 : 25) * 1024 * 1024 || typeof blob.mime !== "string" || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(blob.mime)) fail("Imported Media size or type is inconsistent.", "IMPORT_MEDIA_INVALID");
      if (meta.mediaClass === "photo" && !/^image\/(png|jpeg|webp|gif|bmp|tiff|avif|heic|heif)$/i.test(blob.mime)) fail("Imported photo type is unsupported.", "IMPORT_MEDIA_INVALID");
      if (blob.role === "original") original = { bytes: bytes, mime: blob.mime };
    }
    if (!original || meta.bytes !== original.bytes.length || meta.mime !== original.mime) fail("Imported original Media metadata is inconsistent.", "IMPORT_MEDIA_INVALID");
    var actualHash = await hashBytes(original.bytes);
    if (meta.sha256 && meta.sha256 !== actualHash) fail("Imported Media SHA-256 does not match its original bytes.", "IMPORT_MEDIA_INVALID");
    if (meta.ownerSha && meta.ownerSha !== ownerKey + ":" + actualHash) fail("Imported Media owner fingerprint is inconsistent.", "IMPORT_MEDIA_INVALID");
    if (meta.roles && (!Array.isArray(meta.roles) || JSON.stringify(meta.roles.slice().sort()) !== JSON.stringify(roles.slice().sort()))) fail("Imported Media role list is inconsistent.", "IMPORT_MEDIA_INVALID");
    meta.ownerKey = ownerKey; meta.sha256 = actualHash; meta.ownerSha = ownerKey + ":" + actualHash; meta.roles = roles;
    return bundle;
  }
  async function existingMedia(bundle) {
    if (!root.media || typeof root.media.get !== "function" || typeof root.media.blob !== "function") fail("Media storage is unavailable. No import has been completed.");
    var meta;
    try { meta = await root.media.get(bundle.meta.mediaId); } catch (error) { if (error.code === "NOT_FOUND") return false; throw error; }
    if (!meta) return false;
    if (!meta.owner || !bundle.meta.owner || meta.owner.type !== bundle.meta.owner.type || meta.owner.id !== bundle.meta.owner.id) fail("An imported Media ID belongs to a different object.", "IMPORT_MEDIA_CONFLICT");
    if (meta.mediaClass !== bundle.meta.mediaClass || meta.mime !== bundle.meta.mime || meta.bytes !== bundle.meta.bytes || meta.sha256 !== bundle.meta.sha256 || !Array.isArray(meta.roles)) fail("Existing Media metadata conflicts with the verified import.", "IMPORT_MEDIA_CONFLICT");
    for (var i = 0; i < bundle.blobs.length; i += 1) {
      var part = bundle.blobs[i], found = await root.media.blob(bundle.meta.mediaId, part.role || "original");
      if (meta.roles.indexOf(part.role) < 0 || found.mime !== part.mime || found.bytes !== part.bytes) fail("Existing Media role metadata conflicts with the verified import.", "IMPORT_MEDIA_CONFLICT");
      var binary = global.atob(part.base64), expected = new Uint8Array(binary.length), payload = found.blob;
      var actual = payload && typeof payload.arrayBuffer === "function" ? new Uint8Array(await payload.arrayBuffer()) : ArrayBuffer.isView(payload) ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) : new Uint8Array(payload);
      for (var j = 0; j < binary.length; j += 1) expected[j] = binary.charCodeAt(j);
      if (actual.length !== expected.length || actual.some(function (n, index) { return n !== expected[index]; })) fail("Imported Media ID conflicts with existing photo bytes.", "IMPORT_MEDIA_CONFLICT");
    }
    return true;
  }
  async function prepareMedia(plan) {
    var media = [];
    for (var i = 0; i < (plan.mediaPlans || []).length; i += 1) {
      var bundle = await bundleFor(plan.mediaPlans[i]);
      if (!bundle.meta || !bundle.meta.mediaId || !bundle.meta.owner || !bundle.blobs.length) fail("Imported Media is incomplete.", "IMPORT_MEDIA_INVALID");
      validateMediaOwner(bundle.meta.owner, plan);
      var existed = await existingMedia(bundle);
      media.push({ bundle: bundle, existed: existed });
    }
    return media;
  }
  function validateMediaOwner(owner, plan) {
    function nextValue(key, fallback) {
      var change = plan.changes.filter(function (row) { return row.key === key && (row.medium || "localStorage") === "localStorage"; })[0];
      var value = change ? change.after : storage("localStorage").getItem(key);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch (error) { fail("Media owner storage is unreadable.", "IMPORT_MEDIA_INVALID"); }
    }
    var workspace = nextValue("copdocx.store.v1", {}), admin = nextValue("copdoc.admin.v1", {}), packets = nextValue("alien-book-in.saved-records.v1", []);
    var collection = { PERSON: "people", VEHICLE: "vehicles", LOCATION: "locations", BUSINESS: "businesses", ENTITY: "entities", ENCOUNTER: "encounters", LEAD: "leads" }[owner.type];
    var exists = collection && workspace && workspace[collection] && workspace[collection][owner.id];
    if (owner.type === "OFFICER") exists = (admin.officers || []).some(function (row) { return row && (row.officerId === owner.id || row.id === owner.id); });
    if (owner.type === "BOOKIN") exists = Array.isArray(packets) && packets.some(function (row) { return row && row.id === owner.id; });
    if (!exists && owner.type === "VEHICLE") exists = (admin.vehicles || []).some(function (row) { return row && (row.vehicleId === owner.id || row.id === owner.id); });
    if (!exists) fail("Imported Media refers to an owner outside the selected data: " + owner.type + " " + owner.id + ". Include the required record before importing.", "IMPORT_MEDIA_OWNER_MISSING");
  }
  async function commitMedia(row) {
    var prepared = row.media || [];
    for (var i = 0; i < prepared.length; i += 1) {
      var part = prepared[i], id = part.bundle.meta.mediaId;
      if (!await existingMedia(part.bundle)) {
        // Intent checkpoint survives a crash after IndexedDB commits but before the next journal write.
        if (row.mediaCreated.indexOf(id) < 0) { row.mediaCreated.push(id); checkpoint(row); }
        if (!root.media.importExactBundle) fail("The verified Media import adapter is unavailable.");
        await root.media.importExactBundle(part.bundle);
        if (!await existingMedia(part.bundle)) fail("Media could not be saved and verified. Resume or roll back this import.", "IMPORT_MEDIA_WRITE_FAILED");
      }
      checkpoint(row);
    }
    row.mediaPrepared = true; checkpoint(row);
  }
  function locked(action) {
    if (global.navigator && global.navigator.locks && global.navigator.locks.request) {
      return global.navigator.locks.request("copdocx.booking-workflow.v1", function () { return global.navigator.locks.request(KEY, action); });
    }
    return Promise.resolve().then(action);
  }
  async function apply(plan) {
    return locked(async function () {
      var row;
      try {
        if (running) fail("An import is already running.");
        running = true; validateChanges(plan); preflight(plan, false);
        var media = await prepareMedia(plan);
        row = begin(plan); row.media = media; checkpoint(row);
        await commitMedia(row); return commitStorage(row);
      } catch (e) { return failure(e, row && row.transactionId); }
      finally { running = false; refreshRecoveryUi(); }
    });
  }
  async function resume(id) {
    return locked(async function () {
      var row;
      try {
        if (running) fail("An import is already running."); running = true;
        row = clone(load().transactions[id] || null);
        if (!row) fail("Import recovery entry was not found.");
        if (row.status === "COMPLETED") return { ok: true, transactionId: id, status: row.status, stats: row.plan.stats || {} };
        if (row.status === "ROLLED_BACK" || row.status === "ROLLING_BACK") fail("This import was rolled back or is being rolled back; finish rollback.");
        preflight(row.plan, true);
        if ((row.plan.mediaPlans || []).length) {
          if (!row.media) { row.media = await prepareMedia(row.plan); checkpoint(row); }
          await commitMedia(row);
        }
        return commitStorage(row);
      } catch (e) { return failure(e, id); }
      finally { running = false; refreshRecoveryUi(); }
    });
  }
  async function rollback(id) {
    return locked(async function () {
      var row;
      try {
        if (running) fail("An import is already running."); running = true;
        row = clone(load().transactions[id] || null);
        if (!row) fail("Import recovery entry was not found.");
        if (row.status === "ROLLED_BACK") return { ok: true, transactionId: id, status: row.status };
        if (row.status === "COMPLETED") fail("Completed imports cannot be rolled back over later edits. Use the retained backup for reviewed recovery.");
        preflight(row.plan, true);
        row.status = "ROLLING_BACK"; checkpoint(row);
        var changes = row.plan.changes.slice().reverse();
        for (var i = 0; i < changes.length; i += 1) {
          var change = changes[i], current = raw(change);
          if (current !== change.before) {
            if (current !== change.after) fail("A later edit prevents automatic rollback of " + change.key + ".", "IMPORT_CONFLICT");
            writeValue(change, change.before);
          }
          checkpoint(row);
        }
        refresh();
        for (var j = 0; j < (row.mediaCreated || []).length; j += 1) {
          var mediaId = row.mediaCreated[j], part = (row.media || []).filter(function (entry) { return entry.bundle.meta.mediaId === mediaId; })[0];
          if (part && !part.existed && await existingMedia(part.bundle)) {
            if (!root.media.removeImportCreated) fail("The verified Media rollback adapter is unavailable.");
            await root.media.removeImportCreated(mediaId, row.transactionId);
            if (await existingMedia(part.bundle)) fail("Imported Media removal could not be verified. Retry rollback.");
          }
          checkpoint(row);
        }
        changes.forEach(function (change) { if (raw(change) !== change.before) fail("Rollback verification failed: " + change.key); });
        row.status = "ROLLED_BACK"; checkpoint(row);
        refresh(); return { ok: true, transactionId: id, status: row.status };
      } catch (e) { return failure(e, id); }
      finally { running = false; refreshRecoveryUi(); }
    });
  }
  function listTransactions() { try { var journal = load(); return { ok: true, transactions: Object.keys(journal.transactions).map(function (id) { return clone(journal.transactions[id]); }) }; } catch (e) { return failure(e); } }
  function assertWritable() {
    try {
      var journal = load();
      if (Object.keys(journal.transactions).some(function (id) { return unfinished(journal.transactions[id]); })) fail("Resume or roll back the pending import before editing records.", "IMPORT_PENDING");
      return { ok: true };
    } catch (e) { return failure(e); }
  }
  function refresh() {
    try { var store = root.model && root.model.store; if (store && store.loadFromDisk) store.loadFromDisk(); } catch (e) {}
    try { if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new global.CustomEvent("copdocx-import-recovered")); } catch (e) {}
  }
  function refreshRecoveryUi() {
    if (!global.document || !global.document.body || !global.document.createElement) return;
    var guard = assertWritable(), old = global.document.getElementById("importRecoveryGuard");
    if (guard.ok) { if (old) old.remove(); return; }
    if (old) return;
    var panel = global.document.createElement("div"); panel.id = "importRecoveryGuard";
    panel.setAttribute("role", "alertdialog"); panel.setAttribute("aria-modal", "true");
    panel.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(10,20,30,.9);display:flex;align-items:center;justify-content:center;color:#17212b";
    var body = global.document.createElement("section"); body.style.cssText = "background:white;padding:24px;max-width:650px;border-radius:8px;font:16px Arial";
    var heading = global.document.createElement("h2"); heading.textContent = "Finish import recovery"; body.appendChild(heading);
    var status = global.document.createElement("p"); status.textContent = guard.error; body.appendChild(status);
    var result = listTransactions(), pending = result.ok && result.transactions.filter(unfinished)[0];
    if (pending) ["Resume import", "Roll back import"].forEach(function (label, index) {
      var button = global.document.createElement("button"); button.textContent = label; button.style.marginRight = "12px";
      button.addEventListener("click", async function () { button.disabled = true; var answer = await (index ? rollback(pending.transactionId) : resume(pending.transactionId)); if (answer.ok && global.location && global.location.reload) global.location.reload(); else { status.textContent = answer.error; button.disabled = false; } });
      body.appendChild(button);
    });
    panel.appendChild(body); global.document.body.appendChild(panel);
  }
  function dialog(title) {
    if (!global.document || !global.document.body) return null;
    var overlay = global.document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(10,20,30,.8);display:flex;align-items:center;justify-content:center";
    var body = global.document.createElement("section");
    body.setAttribute("role", "dialog"); body.setAttribute("aria-modal", "true"); body.setAttribute("aria-label", title);
    body.style.cssText = "background:white;color:#17212b;padding:24px;border-radius:8px;max-width:850px;width:90%;max-height:85vh;overflow:auto;font:16px Arial";
    var heading = global.document.createElement("h2"); heading.textContent = title; body.appendChild(heading);
    overlay.appendChild(body); global.document.body.appendChild(overlay);
    return { overlay: overlay, body: body };
  }
  function paragraph(body, value) { var p = global.document.createElement("p"); p.textContent = value; body.appendChild(p); return p; }
  function finishButtons(view, confirmLabel, resolve, accept) {
    var yes = global.document.createElement("button"), no = global.document.createElement("button"), prior = global.document.activeElement;
    yes.textContent = confirmLabel; no.textContent = "Cancel"; yes.style.marginRight = "12px";
    function finish(value) { view.overlay.remove(); if (prior && prior.focus) prior.focus(); resolve(value); }
    yes.addEventListener("click", function () { finish(accept()); }); no.addEventListener("click", function () { finish(null); });
    view.body.appendChild(yes); view.body.appendChild(no);
    view.overlay.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); } });
    no.focus();
  }
  async function reviewCustody(findings, initial) {
    var rows = (findings || []).filter(function (row) { return row.code === "CUSTODY_REVIEW"; }), view = dialog("Review booking outcomes");
    if (!view) return null;
    paragraph(view.body, "These records do not establish an arrested booking. Choose how each record should be imported. Existing linked records must keep their established identity.");
    var controls = [], decisions = clone(initial || {});
    rows.forEach(function (row) {
      var label = global.document.createElement("label"), select = global.document.createElement("select");
      label.textContent = row.recordId + " "; label.style.cssText = "display:block;margin:14px 0";
      [["draft", "Keep as an unfiled draft"], ["ARRESTED", "Confirm this is an arrested booking"]].forEach(function (choice) { var option = global.document.createElement("option"); option.value = choice[0]; option.textContent = choice[1]; select.appendChild(option); });
      label.appendChild(select); view.body.appendChild(label); controls.push({ id: row.recordId, select: select });
    });
    return new Promise(function (resolve) { finishButtons(view, "Review import", resolve, function () { controls.forEach(function (row) { decisions[row.id] = row.select.value === "ARRESTED" ? { outcome: "ARRESTED" } : { keepDraft: true }; }); return decisions; }); });
  }
  async function preview(plan) {
    if (!plan || !plan.ok) return false;
    var rows = plan.rows || [], counts = { create: 0, update: 0, skip: 0 };
    rows.forEach(function (row) { if (counts[row.action] !== undefined) counts[row.action] += 1; });
    var summary = counts.create + " create, " + counts.update + " update, " + counts.skip + " skip. " + plan.changes.length + " stores; " + (plan.mediaPlans || []).length + " Media items.";
    var view = dialog("Import preview");
    if (!view) return typeof global.confirm === "function" ? global.confirm(summary + " Apply this import?") : false;
    paragraph(view.body, summary);
    paragraph(view.body, "A recovery checkpoint preserves the existing values before any changes. Required related records are included below.");
    var table = global.document.createElement("table"); table.style.cssText = "width:100%;border-collapse:collapse;margin:18px 0;text-align:left";
    var head = global.document.createElement("tr");
    ["Type", "Record", "Action"].forEach(function (text) { var cell = global.document.createElement("th"); cell.textContent = text; cell.style.padding = "8px"; head.appendChild(cell); }); table.appendChild(head);
    rows.forEach(function (row) { var tr = global.document.createElement("tr"); [row.type || "record", row.label || row.recordId || "", row.action || "review"].forEach(function (text) { var cell = global.document.createElement("td"); cell.textContent = text; cell.style.cssText = "padding:8px;border-top:1px solid #d1d5db;overflow-wrap:anywhere"; tr.appendChild(cell); }); table.appendChild(tr); });
    view.body.appendChild(table);
    (plan.findings || []).forEach(function (finding) { paragraph(view.body, (finding.recordId ? finding.recordId + ": " : "") + (finding.message || finding.code)); });
    return new Promise(function (resolve) { finishButtons(view, "Apply import", resolve, function () { return true; }); });
  }
  root.importWorkflow = { JOURNAL_KEY: KEY, commitSync: commitSync, apply: apply, resume: resume, rollback: rollback, listTransactions: listTransactions, assertWritable: assertWritable, preview: preview, reviewCustody: reviewCustody, refreshRecoveryUi: refreshRecoveryUi };
  if (global.document && global.document.addEventListener) global.document.addEventListener("DOMContentLoaded", refreshRecoveryUi);
  if (global.addEventListener) global.addEventListener("storage", function (event) { if (event.key === KEY) refreshRecoveryUi(); });
})(typeof window !== "undefined" ? window : globalThis);
