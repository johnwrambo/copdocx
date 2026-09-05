/* Recoverable booking. The journal is a write-ahead command log, not a database transaction. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var SCHEMA = "copdocx.booking-transactions.v1";
  var STEPS = ["subject-reservation", "canonical", "packet", "subject", "location", "associations", "officer", "verified", "void-canonical", "void-packet", "void-officers", "void-verified"];
  var queue = Promise.resolve();
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function plain(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function text(v) { return v == null ? "" : String(v).trim(); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (!plain(v)) return v;
    var out = Object.create(null);
    Object.keys(v).sort().forEach(function (k) { if (v[k] !== undefined) out[k] = stable(v[k]); });
    return out;
  }
  function signature(v) { return JSON.stringify(stable(v)); }
  function hash(v) {
    var s = signature(v), a = 2166136261, b = 2654435769;
    for (var i = 0; i < s.length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 16777619);
      b = Math.imul(b ^ s.charCodeAt(s.length - i - 1), 16777619);
    }
    return (a >>> 0).toString(16) + ":" + (b >>> 0).toString(16) + ":" + s.length;
  }
  function key(id, fallback) { return root.config && root.config.storageKey(id) || fallback; }
  function journalKey() { return key("bookingTransactions", SCHEMA); }
  function packetKey() { return key("bookin", "alien-book-in.saved-records.v1"); }
  function workspaceKey() { return key("workspace", "copdocx.store.v1"); }
  function adminKey() { return key("admin", "copdoc.admin.v1"); }
  function fail(message) { throw new Error(message); }
  function read(k, fallback, predicate) {
    var raw = global.localStorage.getItem(k);
    var value;
    try { value = raw === null ? clone(fallback) : JSON.parse(raw); }
    catch (e) { fail("Cannot read " + k + ". Existing data was preserved."); }
    if (!predicate(value)) fail("Invalid " + k + " data. Run Integrity before booking.");
    return { raw: raw, value: value };
  }
  function write(k, previous, value) {
    var writable = root.importWorkflow && root.importWorkflow.assertWritable();
    if (writable && !writable.ok) fail(writable.error);
    if (global.localStorage.getItem(k) !== previous) fail("Booking data changed in another window. Resume after reviewing the change.");
    var next = JSON.stringify(value);
    global.localStorage.setItem(k, next);
    if (global.localStorage.getItem(k) !== next) fail("The booking write could not be verified.");
    return next;
  }
  function journal() {
    var loaded = read(journalKey(), { schema: SCHEMA, transactions: {} }, function (v) {
      return plain(v) && v.schema === SCHEMA && plain(v.transactions);
    });
    Object.keys(loaded.value.transactions).forEach(function (id) {
      var t = loaded.value.transactions[id];
      if (!plain(t) || t.transactionId !== id || !text(t.bookingId) ||
          (own(t, "kind") && ["BOOK", "VOID"].indexOf(t.kind) < 0) ||
          ["PENDING", "FAILED", "COMPLETED"].indexOf(t.status) < 0 || !Array.isArray(t.completedSteps) ||
          t.completedSteps.some(function (s) { return STEPS.indexOf(s) < 0; }) ||
          (t.status !== "COMPLETED" && (!plain(t.request) || !plain(t.request.packet)))) {
        fail("The booking recovery journal is invalid. Run Integrity before booking.");
      }
      ["transactionId", "bookingId", "encounterId", "subjectId", "personId", "leadId", "arrestId"].forEach(function (k) {
        if (typeof t[k] !== "string" || t[k] !== text(t[k])) fail("The booking recovery journal contains an invalid identity.");
      });
      if (t.request) {
        if (t.request.packet.id !== t.bookingId || !plain(t.request.options || {})) fail("The booking recovery request has conflicting identity.");
        assertCompatible(t, t.request.packet);
      }
      if (t.kind === "VOID" && (!text(t.voidReason) || !text(t.voidedAt) || !text(t.basePacketHash) || !text(t.baseArrestHash) ||
          (t.request && text(t.request.options.reason) !== t.voidReason))) {
        fail("The booking void recovery command is invalid. Run Integrity before resuming.");
      }
    });
    return loaded;
  }
  function saveTransaction(t) {
    var loaded = journal(), old = loaded.value.transactions[t.transactionId];
    if (old && (old.bookingId !== t.bookingId || Number(old.revision || 0) !== Number(t.persistedRevision || 0))) {
      fail("This booking recovery command changed in another window.");
    }
    t.updatedAt = new Date().toISOString();
    t.revision = Number(old && old.revision || 0) + 1;
    var saved = clone(t); delete saved.persistedAt; delete saved.persistedRevision;
    loaded.value.transactions[t.transactionId] = saved;
    write(journalKey(), loaded.raw, loaded.value);
    t.persistedAt = t.updatedAt;
    t.persistedRevision = t.revision;
  }
  function packets() {
    var p = read(packetKey(), [], Array.isArray), seen = Object.create(null);
    p.value.forEach(function (row) {
      if (!plain(row) || typeof row.id !== "string" || row.id !== text(row.id) || !text(row.id) || seen[text(row.id)]) fail("Book-In packet identities are missing, noncanonical or duplicated. Run Integrity.");
      seen[text(row.id)] = true;
      bookingId(row);
    });
    return p;
  }
  function bookingId(row) {
    var ids = [row.id, row.bookingId, row.bookinRecordId].map(text).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    if (ids.length > 1) fail("The Book-In packet contains conflicting booking IDs.");
    return ids[0] || "";
  }
  function subjectId(row) { return text(root.model.encounterSubjectId(row)); }
  function subjectBooking(row) { return text(root.model.encounterSubjectBookingId(row)); }
  function store() {
    if (!root.model || !root.model.store || !root.model.store.resolveBookInBooking) fail("The booking store is unavailable.");
    return root.model.store;
  }
  function sources() {
    var ws = read(workspaceKey(), {}, plain);
    ["people", "leads", "encounters", "associations", "vehicles", "locations"].forEach(function (k) {
      if (own(ws.value, k) && !plain(ws.value[k])) fail("The workspace " + k + " store is invalid.");
    });
    var adm = read(adminKey(), {}, plain);
    if (own(adm.value, "officers") && !Array.isArray(adm.value.officers)) fail("The officer store is invalid.");
    var pk = packets(), api = store();
    api.loadFromDisk();
    if (api.diskError && api.diskError()) fail("The workspace could not be loaded for booking.");
    return { workspace: ws.value, admin: adm.value, packets: pk, store: api };
  }
  function assertCompatible(row, other) {
    ["encounterId", "subjectId", "personId", "leadId", "arrestId"].forEach(function (k) {
      if (text(row[k]) && text(other[k]) && text(row[k]) !== text(other[k])) fail("Conflicting booking " + k + ". Run Integrity before retrying.");
    });
  }
  function withoutBookkeeping(value) {
    if (Array.isArray(value)) return value.map(withoutBookkeeping);
    if (!plain(value)) return value;
    var out = {};
    Object.keys(value).forEach(function (k) { if (["meta", "createdAt", "updatedAt"].indexOf(k) < 0) out[k] = withoutBookkeeping(value[k]); });
    return out;
  }
  function context(packet, src, allowLocked, reservation) {
    var encId = text(packet.encounterId), sid = text(packet.subjectId);
    if (!encId) {
      if (sid) fail("A subject ID requires an Encounter.");
      return { encounter: null, subject: null, fingerprint: "standalone" };
    }
    var enc = src.store.getEncounter(encId);
    if (!enc || !Array.isArray(enc.subjects)) fail("The linked Encounter is missing or its roster is invalid.");
    if (!allowLocked && enc.meta && enc.meta.markedComplete) fail("The linked Encounter is completed and locked.");
    var matches = enc.subjects.filter(function (s) {
      if (!s) return false;
      if (sid) return subjectId(s) === sid;
      return (subjectBooking(s) === packet.id ||
        (text(packet.personId) && text(s.personId) === text(packet.personId)) ||
        (text(packet.leadId) && text(s.leadId) === text(packet.leadId))) &&
        (!subjectBooking(s) || subjectBooking(s) === packet.id) &&
        (!packet.personId || !s.personId || packet.personId === s.personId) &&
        (!packet.leadId || !s.leadId || packet.leadId === s.leadId);
    });
    var reserved = null;
    if (!matches.length && reservation) {
      if (reservation === true && !sid) {
        var role = text(packet.encounterRole || packet.subjectRole).toUpperCase();
        if (["TARGET", "COLLATERAL"].indexOf(role) < 0) fail("Select Target or Collateral before adding the booking subject.");
        reserved = root.model.createEncounterSubject({ subjectId: newId("sub_"), encounterId: encId,
          personId: text(packet.personId), leadId: text(packet.leadId), role: role, encounterRole: role,
          occupantRole: text(packet.vehiclePosition), outcome: "ARRESTED", custody: "IN_CUSTODY",
          firstName: text(packet.firstName), lastName: text(packet.lastName), alienNumber: text(packet.aNumber) });
      } else if (plain(reservation) && sid === subjectId(reservation)) reserved = clone(reservation);
      if (reserved) { matches = [reserved]; enc.subjects.push(reserved); }
    }
    if (matches.length !== 1) fail("Add or select one exact Encounter subject before booking.");
    var subject = matches[0]; sid = subjectId(subject);
    if (!sid) fail("The Encounter subject has no permanent identity.");
    assertCompatible(packet, { encounterId: encId, subjectId: sid, personId: subject.personId, leadId: subject.leadId });
    if (subjectBooking(subject) && subjectBooking(subject) !== packet.id) fail("This subject already belongs to another booking.");
    if (text(subject.outcome).toUpperCase() !== "ARRESTED") fail("Book-In is only available for an arrested subject.");
    var otherOwner = src.packets.value.some(function (p) {
      return !p.voidedAt && p.id !== packet.id && text(p.encounterId) === encId && text(p.subjectId) === sid;
    });
    if (otherOwner) fail("Another Book-In packet already claims this subject.");
    packet.subjectId = sid;
    packet.personId = text(subject.personId) || text(packet.personId);
    packet.leadId = text(subject.leadId) || text(packet.leadId);
    packet.subjectRole = root.model.encounterSubjectRole(subject);
    packet.encounterRole = packet.subjectRole;
    packet.vehiclePosition = root.model.encounterSubjectOccupantRole(subject);
    var subFacts = clone(subject);
    ["personId", "leadId", "bookingId", "bookinRecordId", "packetFiledAt", "docsGeneratedAt", "firstName", "lastName", "alienNumber", "shared", "custody", "legacyEncounterParticipantIds"].forEach(function (k) { delete subFacts[k]; });
    var fingerprint = hash(withoutBookkeeping({ subject: subFacts, encounterId: encId, startedAt: enc.startedAt,
      eventType: enc.eventType, team: enc.team, officeCode: enc.officeCode, operationId: enc.operationId,
      centerLocationId: enc.centerLocationId, locations: enc.locations, vehicles: enc.vehicles, officerIds: enc.officerIds }));
    return { encounter: enc, subject: subject, fingerprint: fingerprint, reservedSubject: reserved };
  }
  function requestHash(packet, options) {
    var p = clone(packet), o = clone(options || {});
    ["createdAt", "updatedAt", "revision", "createdWithVersion", "updatedWithVersion", "encounterProjectionFiledAt", "encounterProjectionDraft", "bookingTransactionId", "personId", "leadId", "arrestId"].forEach(function (k) { delete p[k]; });
    delete o.expectedUpdatedAt;
    return hash({ packet: p, options: o });
  }
  function promotionSourceHash(packet, src) {
    var people = src.workspace.people || {}, leads = src.workspace.leads || {};
    var pid = text(packet.personId), lid = text(packet.leadId), selectedPeople = {}, selectedLeads = {};
    if (!pid && lid && leads[lid]) pid = text(leads[lid].subjectPersonId || leads[lid].person && leads[lid].person.personId);
    // Without an explicit owner the legacy promotion resolver may match identity
    // against any Person. Conservatively block replay if that candidate set changed.
    Object.keys(people).forEach(function (id) { if (!pid || id === pid) selectedPeople[id] = clone(people[id]); });
    Object.keys(leads).forEach(function (id) {
      var lead = leads[id], owner = text(lead && (lead.subjectPersonId || lead.person && lead.person.personId));
      if ((!pid && !lid) || id === lid || (pid && owner === pid)) selectedLeads[id] = clone(lead);
    });
    // The reserved-subject write may add only an Encounter history projection.
    Object.keys(selectedPeople).forEach(function (id) { delete selectedPeople[id].encounters; });
    Object.keys(selectedLeads).forEach(function (id) { if (selectedLeads[id].person) delete selectedLeads[id].person.encounters; });
    return hash(withoutBookkeeping({ people: selectedPeople, leads: selectedLeads }));
  }
  function resolve(packet) {
    var result = store().resolveBookInBooking(packet.id);
    if (!result || !result.ok) fail(result && result.error || "Cannot resolve the booking identity.");
    if (result.found) assertCompatible(packet, result);
    return result;
  }
  function applyIds(packet, result) {
    ["personId", "leadId", "arrestId", "subjectId"].forEach(function (k) { if (result[k]) packet[k] = result[k]; });
  }
  function checkpoint(t, step) {
    if (t.completedSteps.indexOf(step) < 0) t.completedSteps.push(step);
    t.status = "PENDING"; t.lastError = "";
    saveTransaction(t);
  }
  function checked(result, message) { if (!result || !result.ok) fail(result && result.error || message); return result; }
  function currentPacket(id, src) { return (src || sources()).packets.value.filter(function (p) { return p.id === id; })[0] || null; }
  function samePacket(a, b) { return signature(a) === signature(b); }
  function putPacket(t, packet) {
    var src = sources(), old = currentPacket(packet.id, src);
    if (samePacket(old, packet)) return;
    if (hash(old) !== t.basePacketHash) fail("The saved packet changed after this booking began. Review it before resuming.");
    var rows = src.packets.value, index = rows.findIndex(function (p) { return p.id === packet.id; });
    if (index < 0) rows.push(clone(packet)); else rows[index] = clone(packet);
    write(packetKey(), src.packets.raw, rows);
  }
  function linkSubject(t, packet) {
    if (!packet.encounterId) return;
    var src = sources(), ctx = context(packet, src);
    if (ctx.fingerprint !== t.contextHash) fail("Encounter facts changed during booking. Review them before resuming.");
    var s = ctx.subject;
    if (subjectBooking(s) === packet.id && s.personId === packet.personId && s.leadId === packet.leadId && s.packetFiledAt) return;
    checked(src.store.updateEncounter(packet.encounterId, function (enc) {
      var local = context(packet, sources());
      if (local.fingerprint !== t.contextHash) fail("The Encounter changed before its booking link was saved.");
      var rows = enc.subjects.filter(function (row) { return subjectId(row) === packet.subjectId; });
      if (rows.length !== 1) fail("The booking subject disappeared.");
      var subject = rows[0];
      assertCompatible(packet, subject);
      subject.bookingId = packet.id; subject.bookinRecordId = packet.id;
      subject.personId = packet.personId; subject.leadId = packet.leadId;
      subject.packetFiledAt = packet.encounterProjectionFiledAt;
      subject.custody = "IN_CUSTODY";
      [["firstName", packet.firstName], ["lastName", packet.lastName], ["alienNumber", packet.aNumber]].forEach(function (pair) {
        if (!text(subject[pair[0]]) && text(pair[1])) subject[pair[0]] = pair[1];
      });
      return enc;
    }, { mode: root.model.isCommitted(ctx.encounter) ? "commit" : "draft" }), "Could not link the Encounter subject.");
  }
  function associationIds(packet, src, ctx) {
    var out = [];
    if (!ctx.encounter) return out;
    (ctx.encounter.vehicles || []).forEach(function (v) {
      var id = text(v.vehicleId || v.id); if (!id) return;
      var rows = Object.keys(src.workspace.associations || {}).map(function (k) { return src.workspace.associations[k]; }).filter(function (a) {
        if (!a || a.junked || a.active === false) return false;
        return a.from && a.to && a.from.type === "PERSON" && a.from.id === packet.personId &&
          a.to.type === "VEHICLE" && a.to.id === id &&
          (a.reason === "LE_ENCOUNTER_IN_VEHICLE" || (a.reasons || []).indexOf("LE_ENCOUNTER_IN_VEHICLE") >= 0);
      });
      if (rows.length !== 1) fail("An Encounter vehicle association is missing or ambiguous.");
      out.push(rows[0].associationId);
    });
    return out;
  }
  function verify(packet, t) {
    var src = sources(), ctx = context(packet, src, t.status === "COMPLETED"), canonical = resolve(packet);
    if (!canonical.found || !canonical.personId || !canonical.leadId || !canonical.arrestId) fail("The canonical booking records are incomplete.");
    if (canonical.bookingTransactionId !== t.transactionId || canonical.transactionUnchanged === false) fail("Canonical booking facts changed. Review the saved records before resuming.");
    if (!samePacket(currentPacket(packet.id, src), packet)) fail("The saved Book-In packet does not match this booking command.");
    if (ctx.fingerprint !== t.contextHash) fail("Encounter facts changed during booking.");
    if (ctx.subject && (subjectBooking(ctx.subject) !== packet.id || ctx.subject.personId !== packet.personId || ctx.subject.leadId !== packet.leadId)) fail("The Encounter subject booking link is incomplete.");
    associationIds(packet, src, ctx);
    if (ctx.subject && text(ctx.subject.arrestingOfficerId)) {
      var officers = (src.admin.officers || []).filter(function (o) { return o && text(o.id || o.officerId) === text(ctx.subject.arrestingOfficerId); });
      if (officers.length !== 1) fail("The arresting officer is missing or ambiguous.");
      var arrests = (officers[0].fieldArrests || []).filter(function (a) { return a && text(a.arrestId) === packet.arrestId; });
      if (arrests.length !== 1 || arrests[0].subjectId !== packet.subjectId || arrests[0].personId !== packet.personId || arrests[0].encounterId !== packet.encounterId || arrests[0].bookingId !== packet.id) fail("The officer arrest projection is incomplete.");
    }
    return packet;
  }
  function runTransaction(t) {
    if (t.kind === "VOID") return runVoid(t);
    t.persistedAt = t.updatedAt;
    t.persistedRevision = Number(t.revision || 0);
    var packet = clone(t.request.packet), opts = clone(t.request.options || {});
    try {
      var src = sources(), ctx = context(packet, src, false,
        t.completedSteps.indexOf("subject-reservation") < 0 ? t.reservedSubject : null);
      if (ctx.fingerprint !== t.contextHash) fail("Encounter facts changed after this booking began. Review them before resuming.");
      var priorPacket = currentPacket(packet.id, src);
      if (hash(priorPacket) !== t.basePacketHash && !(priorPacket && priorPacket.bookingTransactionId === t.transactionId && (!t.packetHash || hash(priorPacket) === t.packetHash))) fail("The packet changed after booking began. Review it before resuming.");
      if (ctx.reservedSubject) {
        checked(src.store.updateEncounter(packet.encounterId, function (enc) {
          if (enc.subjects.some(function (s) { return subjectId(s) === packet.subjectId; })) fail("The reserved subject identity is already present.");
          enc.subjects.push(clone(t.reservedSubject)); return enc;
        }, { mode: root.model.isCommitted(ctx.encounter) ? "commit" : "draft" }), "Could not create the reserved Encounter subject.");
      }
      if (t.reservedSubject) checkpoint(t, "subject-reservation");
      var recovered = resolve(packet);
      if (recovered.found && recovered.bookingTransactionId === t.transactionId) {
        if (recovered.transactionUnchanged === false) fail("Canonical booking facts changed after the interrupted save. Review them before resuming.");
        applyIds(packet, recovered);
      } else {
        if (t.completedSteps.indexOf("canonical") >= 0) fail("The canonical booking was removed or replaced. Automatic replay is blocked.");
        if (hash(recovered) !== t.baseCanonicalHash) fail("Canonical booking identity changed before filing. Review it before resuming.");
        if (promotionSourceHash(packet, sources()) !== t.baseSourceHash) fail("Person or Case data changed before this booking was filed. Review it before resuming.");
        if (recovered.found) applyIds(packet, recovered);
        var promotionOptions = { recoverBooking: true, bookingTransactionId: t.transactionId };
        if (opts.formData) promotionOptions.formData = opts.formData;
        // Encounter quick-book's structured input includes booking facts absent
        // from its compact formState. The store still validates all identities.
        if (opts.promotionInput) promotionOptions.formData = Object.assign({}, opts.promotionInput, opts.formData || {});
        var promoted = checked(src.store.promoteBookInRecord(packet, promotionOptions), "Could not file the canonical booking.");
        applyIds(packet, promoted);
        packet.subjectRole = promoted.subjectRole || packet.subjectRole || "";
        packet.encounterRole = packet.subjectRole;
        packet.vehiclePosition = promoted.vehiclePosition || packet.vehiclePosition || "";
      }
      ["personId", "leadId", "arrestId", "subjectId"].forEach(function (k) { t[k] = text(packet[k]); });
      context(packet, sources());
      packet.encounterProjectionFiledAt = t.createdAt;
      packet.bookingTransactionId = t.transactionId;
      delete packet.encounterProjectionDraft;
      t.request.packet = clone(packet);
      t.packetHash = hash(packet);
      checkpoint(t, "canonical");
      putPacket(t, packet); checkpoint(t, "packet");
      linkSubject(t, packet); checkpoint(t, "subject");
      if (packet.encounterId) checked(store().applyEncounterLocationToArrests(packet.encounterId), "Could not project the arrest location.");
      checkpoint(t, "location");
      if (packet.encounterId) checked(store().linkEncounterVehiclesToPerson({ encounterId: packet.encounterId, subjectId: packet.subjectId, personId: packet.personId, leadId: packet.leadId, bookinRecordId: packet.id }), "Could not save the vehicle associations.");
      checkpoint(t, "associations");
      src = sources(); ctx = context(packet, src);
      if (ctx.subject && text(ctx.subject.arrestingOfficerId)) {
        if (!root.officers || !root.officers.recordFieldArrest) fail("The officer booking projection is unavailable.");
        checked(root.officers.recordFieldArrest(ctx.subject.arrestingOfficerId, { arrestId: packet.arrestId, encounterId: packet.encounterId, subjectId: packet.subjectId, personId: packet.personId, bookingId: packet.id, bookedAt: t.createdAt }), "Could not update the officer arrest projection.");
      }
      checkpoint(t, "officer");
      verify(packet, t); checkpoint(t, "verified");
      t.status = "COMPLETED"; t.lastError = "";
      delete t.request;
      saveTransaction(t);
      return { ok: true, record: packet, bookingId: packet.id, transactionId: t.transactionId, status: t.status, error: "" };
    } catch (error) {
      t.status = "FAILED"; t.lastError = text(error.message) || "Booking did not finish.";
      // Retain the frozen request even if only the final receipt write failed.
      if (!t.request) t.request = { packet: clone(packet), options: opts };
      try { saveTransaction(t); } catch (journalError) { /* Last durable checkpoint remains recoverable. */ }
      return { ok: false, record: packet, bookingId: packet.id, transactionId: t.transactionId, status: "FAILED", error: t.lastError + " Resume this booking from Pending bookings." };
    }
  }
  function newId(prefix) {
    return prefix + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  }
  function begin(record, options) {
    var packet = clone(record || {}), opts = clone(options || {});
    try {
      var loaded = journal(), src = sources();
      packet.id = bookingId(packet) || newId("bk_");
      var storedPacket = currentPacket(packet.id, src);
      if (packet.voidedAt || (storedPacket && storedPacket.voidedAt)) fail("This booking was voided. Start a new booking if one is required.");
      packet.encounterId = text(packet.encounterId); packet.subjectId = text(packet.subjectId);
      // Resolve an interrupted Add Another command before allocating a new subject.
      var pendingByBooking = Object.keys(loaded.value.transactions).map(function (id) { return loaded.value.transactions[id]; }).filter(function (t) { return t.status !== "COMPLETED" && t.bookingId === packet.id; });
      if (!packet.subjectId && pendingByBooking.length === 1) packet.subjectId = pendingByBooking[0].subjectId;
      var ctx = context(packet, src, false, pendingByBooking.length === 1 ? pendingByBooking[0].reservedSubject : true), requestedHash = requestHash(packet, opts);
      var unfinished = Object.keys(loaded.value.transactions).map(function (id) { return loaded.value.transactions[id]; }).filter(function (t) {
        return t.status !== "COMPLETED" && (t.bookingId === packet.id || (packet.encounterId && packet.subjectId && t.encounterId === packet.encounterId && t.subjectId === packet.subjectId));
      });
      if (unfinished.length > 1) fail("Multiple unfinished commands claim this booking. Run Integrity.");
      if (unfinished.length) {
        var pending = unfinished[0];
        if (pending.bookingId !== packet.id || pending.requestHash !== requestedHash) return { ok: false, bookingId: pending.bookingId, transactionId: pending.transactionId, status: pending.status, error: "An unfinished booking already exists. Resume it from Pending bookings before making further edits." };
        return runTransaction(clone(pending));
      }
      var old = currentPacket(packet.id, src), canonical = resolve(packet);
      if (own(opts, "expectedUpdatedAt") && text(old && old.updatedAt) !== text(opts.expectedUpdatedAt)) fail("This packet changed in another window. Reload it before saving.");
      if (old) assertCompatible(packet, old);
      var completed = Object.keys(loaded.value.transactions).map(function (id) { return loaded.value.transactions[id]; }).filter(function (t) { return t.status === "COMPLETED" && t.bookingId === packet.id && t.requestHash === requestedHash; }).pop();
      if (completed && old && old.bookingTransactionId === completed.transactionId && hash(old) === completed.packetHash) {
        verify(old, completed);
        return { ok: true, record: old, bookingId: old.id, transactionId: completed.transactionId, status: "COMPLETED", error: "" };
      }
      var now = new Date().toISOString();
      var t = { transactionId: newId("booktx_"), bookingId: packet.id, encounterId: packet.encounterId, subjectId: packet.subjectId,
        personId: text(packet.personId), leadId: text(packet.leadId), arrestId: text(packet.arrestId), status: "PENDING", completedSteps: [],
        createdAt: now, updatedAt: now, lastError: "", requestHash: requestedHash, contextHash: ctx.fingerprint,
        basePacketHash: hash(old), baseCanonicalHash: hash(canonical), baseSourceHash: promotionSourceHash(packet, src), request: { packet: packet, options: opts } };
      if (ctx.reservedSubject) t.reservedSubject = clone(ctx.reservedSubject);
      saveTransaction(t); return runTransaction(t);
    } catch (error) { return { ok: false, bookingId: text(packet.id), transactionId: "", status: "FAILED", error: text(error.message) }; }
  }
  function serialized(action) {
    var run = function () {
      if (global.navigator && global.navigator.locks && typeof global.navigator.locks.request === "function") {
        return global.navigator.locks.request("copdocx.booking-workflow.v1", { mode: "exclusive" }, action);
      }
      return action();
    };
    var result = queue.then(run, run); queue = result.catch(function () {});
    return result.catch(function (error) { return { ok: false, status: "FAILED", error: text(error.message) }; });
  }
  function canonicalArrest(packet, src) {
    var resolved = checked(src.store.resolveBookInBooking(packet.id), "Could not resolve the saved booking.");
    if (!resolved.found) fail("The filed booking has no canonical Arrest. Run Integrity.");
    assertCompatible(packet, resolved);
    var person = (src.workspace.people || {})[resolved.personId];
    var arrests = ((person && person.arrests) || []).filter(function (a) { return a && a.arrestId === resolved.arrestId; });
    if (arrests.length !== 1) fail("The booking Arrest is missing or ambiguous.");
    return { resolved: resolved, arrest: arrests[0] };
  }
  function voidInput(t) {
    return { bookingId: t.bookingId, subjectId: t.subjectId, encounterId: t.encounterId,
      personId: t.personId, leadId: t.leadId, arrestId: t.arrestId,
      reason: t.voidReason, voidedAt: t.voidedAt, transactionId: t.transactionId };
  }
  function verifyVoid(t) {
    var src = sources(), packet = currentPacket(t.bookingId, src);
    if (!packet || !packet.voidedAt || packet.voidTransactionId !== t.transactionId || packet.voidReason !== t.voidReason) fail("The voided packet could not be verified.");
    var saved = canonicalArrest(packet, src);
    if (!saved.arrest.voidedAt || saved.arrest.voidTransactionId !== t.transactionId || saved.arrest.voidReason !== t.voidReason) fail("The canonical void acknowledgement is missing.");
    var lead = (src.workspace.leads || {})[t.leadId];
    var projected = ((lead && lead.person && lead.person.arrests) || []).filter(function (a) { return a && a.arrestId === t.arrestId; });
    if (projected.length !== 1 || projected[0].voidTransactionId !== t.transactionId) fail("The Case void projection is incomplete.");
    if (t.encounterId) {
      var enc = src.store.getEncounter(t.encounterId);
      if (enc && (enc.subjects || []).some(function (s) { return subjectBooking(s) === t.bookingId; })) fail("The voided packet is still actively linked to an Encounter subject.");
    }
    (src.admin.officers || []).forEach(function (o) {
      (o.fieldArrests || []).forEach(function (a) {
        if (a && (text(a.arrestId) === t.arrestId || text(a.bookingId || a.bookinRecordId) === t.bookingId) && !a.voidedAt) fail("An active officer statistic still references the voided booking.");
      });
    });
    return packet;
  }
  function runVoid(t) {
    t.persistedRevision = Number(t.revision || 0); t.persistedAt = t.updatedAt;
    var request = clone(t.request);
    try {
      var src = sources(), packet = currentPacket(t.bookingId, src);
      if (!packet) fail("The packet was removed after the void began.");
      assertCompatible(t, packet);
      if (hash(packet) !== t.basePacketHash && !(packet.voidTransactionId === t.transactionId && packet.voidReason === t.voidReason)) fail("The packet changed after the void began. Review it before resuming.");
      var saved = canonicalArrest(packet, src);
      if (saved.arrest.voidTransactionId !== t.transactionId && hash(saved.arrest) !== t.baseArrestHash) fail("The Arrest changed after the void began. Review it before resuming.");
      if (!src.store.voidBookingProjection) fail("The booking void store is unavailable.");
      checked(src.store.voidBookingProjection(voidInput(t)), "Could not void the canonical booking.");
      checkpoint(t, "void-canonical");
      src = sources(); packet = currentPacket(t.bookingId, src);
      if (!packet) fail("The packet disappeared during the void.");
      if (!packet.voidedAt) {
        if (hash(packet) !== t.basePacketHash) fail("The packet changed during the void.");
        packet.voidedAt = t.voidedAt; packet.voidReason = t.voidReason; packet.voidTransactionId = t.transactionId;
        packet.updatedAt = t.voidedAt; packet.revision = Number(packet.revision || 0) + 1;
        var index = src.packets.value.findIndex(function (p) { return p.id === t.bookingId; });
        src.packets.value[index] = packet;
        write(packetKey(), src.packets.raw, src.packets.value);
      } else if (packet.voidTransactionId !== t.transactionId) fail("Another void command owns this packet.");
      checkpoint(t, "void-packet");
      src = sources();
      (src.admin.officers || []).forEach(function (officer) {
        var claims = (officer.fieldArrests || []).filter(function (a) { return a && (text(a.arrestId) === t.arrestId || text(a.bookingId || a.bookinRecordId) === t.bookingId); });
        if (!claims.length) return;
        if (!root.officers || !root.officers.voidFieldArrest) fail("The officer void projection is unavailable.");
        checked(root.officers.voidFieldArrest(text(officer.id || officer.officerId), voidInput(t)), "Could not void the officer statistic.");
      });
      checkpoint(t, "void-officers");
      packet = verifyVoid(t); checkpoint(t, "void-verified");
      t.status = "COMPLETED"; t.lastError = ""; t.packetHash = hash(packet); delete t.request;
      saveTransaction(t);
      return { ok: true, record: packet, bookingId: t.bookingId, transactionId: t.transactionId, status: t.status };
    } catch (error) {
      t.status = "FAILED"; t.lastError = text(error.message); t.request = request;
      try { saveTransaction(t); } catch (e) { /* Previous durable command remains. */ }
      return { ok: false, bookingId: t.bookingId, transactionId: t.transactionId, status: t.status, error: t.lastError + " Resume the void from Bookings needing attention." };
    }
  }
  function beginVoid(id, options) {
    options = options || {};
    try {
      var src = sources(), packet = currentPacket(text(id), src);
      if (!packet) fail("The saved packet was not found.");
      var map = journal().value.transactions, unfinished = Object.keys(map).map(function (k) { return map[k]; }).filter(function (t) { return t.bookingId === packet.id && t.status !== "COMPLETED"; });
      if (unfinished.length) {
        if (unfinished.length === 1 && unfinished[0].kind === "VOID") return runVoid(clone(unfinished[0]));
        fail("Finish the pending booking before voiding it.");
      }
      if (packet.voidedAt) {
        var receipt = map[packet.voidTransactionId];
        if (!receipt || receipt.kind !== "VOID") fail("The existing void has no verifiable receipt. Run Integrity.");
        return { ok: true, record: verifyVoid(receipt), bookingId: packet.id, transactionId: receipt.transactionId, status: "COMPLETED" };
      }
      var reason = text(options.reason); if (!reason) fail("Voiding a booking requires a reason.");
      if (own(options, "expectedUpdatedAt") && text(options.expectedUpdatedAt) !== text(packet.updatedAt)) fail("This packet changed. Reload it before voiding.");
      var canonical = canonicalArrest(packet, src), now = new Date().toISOString();
      var t = { kind: "VOID", transactionId: newId("voidtx_"), bookingId: packet.id,
        encounterId: text(canonical.resolved.encounterId), subjectId: text(canonical.resolved.subjectId),
        personId: text(canonical.resolved.personId), leadId: text(canonical.resolved.leadId), arrestId: text(canonical.resolved.arrestId),
        status: "PENDING", completedSteps: [], createdAt: now, updatedAt: now, voidedAt: now, voidReason: reason,
        basePacketHash: hash(packet), baseArrestHash: hash(canonical.arrest), request: { packet: clone(packet), options: { reason: reason } } };
      if (!src.store.voidBookingProjection) fail("The booking void store is unavailable.");
      checked(src.store.voidBookingProjection(Object.assign(voidInput(t), { validateOnly: true })), "This booking cannot be voided.");
      saveTransaction(t); return runVoid(t);
    } catch (error) { return { ok: false, bookingId: text(id), status: "FAILED", error: text(error.message) }; }
  }
  function removalPlan(id) {
    try {
      var src = sources(), packet = currentPacket(text(id), src);
      if (!packet) fail("The packet was not found.");
      if (packet.voidedAt) return { ok: true, action: "RETAIN", record: packet, error: "Voided records are retained as history." };
      var transactions = journal().value.transactions;
      if (Object.keys(transactions).some(function (k) { return transactions[k].bookingId === packet.id && transactions[k].status !== "COMPLETED"; })) fail("This booking has a pending recovery command. Resume it before removing the packet.");
      var canonical = checked(src.store.resolveBookInBooking(packet.id), "Could not inspect booking ownership.");
      if (canonical.found || packet.arrestId || packet.encounterProjectionFiledAt) return { ok: true, action: "VOID", record: packet };
      if (packet.encounterProjectionDraft !== true) fail("This legacy packet is not identified as an unfiled draft. Its history must be reviewed before removal.");
      if (!src.store.dependenciesFor) fail("The dependency scanner is unavailable.");
      var deps = checked(src.store.dependenciesFor("BOOKING", packet.id), "Could not inspect packet dependencies.");
      var blockers = (deps.dependencies || []).filter(function (d) {
        return !(d.store === "bookin" && text(d.recordId) === packet.id);
      });
      if (blockers.length) return { ok: false, action: "BLOCK", dependencies: blockers, error: "This draft is referenced by other records and cannot be deleted." };
      return { ok: true, action: "DELETE", record: packet };
    } catch (e) { return { ok: false, action: "BLOCK", error: text(e.message) }; }
  }
  root.booking = Object.freeze({
    schema: SCHEMA,
    bookSubject: function (record, options) { var p = clone(record || {}), o = clone(options || {}); return serialized(function () { return begin(p, o); }); },
    planRemoval: removalPlan,
    voidBooking: function (id, options) { return serialized(function () { return beginVoid(id, options); }); },
    deleteDraftBooking: function (id, options) { return serialized(function () {
      var plan = removalPlan(id); if (!plan.ok || plan.action !== "DELETE") return { ok: false, dependencies: plan.dependencies, error: plan.error || "Only an unused draft can be deleted." };
      if (options && own(options, "expectedUpdatedAt") && text(options.expectedUpdatedAt) !== text(plan.record.updatedAt)) return { ok: false, error: "The packet changed before deletion." };
      var p = packets();
      if (!samePacket(p.value.filter(function (row) { return row.id === text(id); })[0], plan.record)) return { ok: false, error: "The packet changed before deletion." };
      write(packetKey(), p.raw, p.value.filter(function (row) { return row.id !== text(id); }));
      return { ok: true, bookingId: text(id), deleted: true };
    }); },
    resume: function (id) { return serialized(function () {
      var t = journal().value.transactions[text(id)];
      if (!t) return { ok: false, error: "The booking recovery command was not found." };
      if (t.status === "COMPLETED") {
        if (t.kind === "VOID") return { ok: true, record: verifyVoid(t), bookingId: t.bookingId, transactionId: t.transactionId, status: t.status };
        var p = currentPacket(t.bookingId); if (!p || hash(p) !== t.packetHash) return { ok: false, error: "The completed booking has since changed." };
        verify(p, t); return { ok: true, record: p, bookingId: t.bookingId, transactionId: t.transactionId, status: t.status };
      }
      return runTransaction(clone(t));
    }); },
    pendingBookingId: function (encId, sid) {
      try {
        if (!text(encId) || !text(sid)) return "";
        var map = journal().value.transactions;
        var rows = Object.keys(map).map(function (id) { return map[id]; }).filter(function (t) { return t.status !== "COMPLETED" && t.encounterId === text(encId) && t.subjectId === text(sid); });
        return rows.length === 1 ? rows[0].bookingId : "";
      } catch (e) { return ""; }
    },
    listTransactions: function () {
      try { var map = journal().value.transactions; return { ok: true, transactions: Object.keys(map).map(function (id) {
        var t = map[id]; return { transactionId: id, kind: t.kind || "BOOK", bookingId: t.bookingId, encounterId: t.encounterId, subjectId: t.subjectId, status: t.status, completedSteps: t.completedSteps.slice(), updatedAt: t.updatedAt, lastError: t.lastError || "" };
      }) }; } catch (e) { return { ok: false, transactions: [], error: text(e.message) }; }
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
