/**
 * Persistence for lead snapshots.
 *
 * Browser: localStorage key copdocx.store.v1
 * Node tests: in-memory only (no window.localStorage).
 *
 * The store is a dictionary of snapshots plus a people registry. The
 * registry is how "another saved person" shows up in link-card search —
 * every subject you have ever saved is a person you can link to.
 * Incomplete people stay in the registry. Linking never rewrites names.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});
  var STORAGE_KEY = "copdocx.store.v1";

  function emptyState() {
    return {
      schema: model.STORE_SCHEMA || "copdocx.store.v1",
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {},
      investigations: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {}
    };
  }

  var state = emptyState();
  var diskError = "";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(next) {
    next = next || emptyState();
    next.schema = next.schema || model.STORE_SCHEMA || "copdocx.store.v1";
    next.people = next.people || {};
    next.leads = next.leads || {};
    next.encounters = next.encounters || {};
    next.investigations = next.investigations || {};
    next.vehicles = next.vehicles || {};
    next.locations = next.locations || {};
    next.businesses = next.businesses || {};
    next.entities = next.entities || {};
    next.associations = next.associations || {};
    next.currentLeadId = next.currentLeadId || "";
    Object.keys(next.leads).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.leads[id]);
      }
    });
    Object.keys(next.encounters).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.encounters[id]);
      }
    });
    Object.keys(next.investigations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.investigations[id]);
      }
    });
    Object.keys(next.vehicles).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.vehicles[id]);
      }
    });
    Object.keys(next.locations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.locations[id]);
      }
    });
    Object.keys(next.businesses).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.businesses[id]);
      }
    });
    Object.keys(next.entities).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.entities[id]);
      }
    });
    return next;
  }

  function readDisk() {
    if (typeof localStorage === "undefined") {
      return { ok: true, missing: true, data: null, error: "" };
    }
    var raw = "";
    try {
      raw = localStorage.getItem(STORAGE_KEY) || "";
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error: "Cannot read localStorage."
      };
    }
    if (!raw) {
      return { ok: true, missing: true, data: null, error: "" };
    }
    try {
      return { ok: true, missing: false, data: JSON.parse(raw), error: "" };
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error:
          "Lead storage is damaged. Do not Save. Copy the site data out if you have a backup."
      };
    }
  }

  function writeDisk() {
    if (diskError) {
      return false;
    }
    if (typeof localStorage === "undefined") {
      return true;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function adoptDisk() {
    var disk = readDisk();
    if (!disk.ok) {
      diskError = disk.error;
      return { ok: false, error: disk.error };
    }
    diskError = "";
    if (disk.data) {
      state = normalizeState(disk.data);
    }
    return { ok: true, error: "" };
  }

  function loadFromDisk() {
    adoptDisk();
    return state;
  }

  function rememberPeople(snapshot) {
    var subject = model.subjectOf ? model.subjectOf(snapshot) : snapshot.person;
    if (subject && subject.personId) {
      state.people[subject.personId] = clone(subject);
    }
    (snapshot.people || []).forEach(function (person) {
      if (person && person.personId) {
        state.people[person.personId] = clone(person);
      }
    });
  }

  /**
   * Save a snapshot. opts.mode: "draft" | "commit" (default commit).
   * Collect's meta does not win — previous committedAt is preserved on draft.
   * rememberPeople on every save so the subject exists in people{} immediately.
   */
  function saveLead(snapshot, opts) {
    if (!snapshot || !snapshot.leadId) {
      return { ok: false, leadId: "", error: "Snapshot is missing a leadId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: snapshot.leadId, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.leads[snapshot.leadId]
      ? clone(state.leads[snapshot.leadId])
      : null;
    var record = previous ? Object.assign({}, previous, snapshot) : snapshot;
    record.schema = snapshot.schema || model.SCHEMA;
    record.leadId = snapshot.leadId;
    if (typeof model.stampMeta === "function") {
      record.meta = model.stampMeta(previous, mode);
    } else {
      record.meta = snapshot.meta || {};
      record.meta.updatedAt = model.nowIso();
    }
    record.meta.markedComplete = false;
    syncNestedOccupancyToAssociations(record);
    applyAssociationNestingToLead(record);
    state.leads[record.leadId] = clone(record);
    state.currentLeadId = record.leadId;
    rememberPeople(record);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        leadId: record.leadId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, leadId: record.leadId, error: "" };
  }

  function getLead(leadId) {
    var snap = state.leads[leadId];
    return snap ? clone(snap) : null;
  }

  function nameFromLabel(label) {
    var text = String(label || "").trim();
    if (typeof global.parsePersonName === "function") {
      var parsed = global.parsePersonName(text);
      return {
        lastName: (parsed && parsed.last) || "",
        firstName: (parsed && parsed.first) || "",
        middleName: (parsed && parsed.middle) || ""
      };
    }
    var comma = text.indexOf(",");
    if (comma !== -1) {
      var rest = text.slice(comma + 1).trim().split(/\s+/);
      return {
        lastName: text.slice(0, comma).trim(),
        firstName: rest[0] || "",
        middleName: rest.slice(1).join(" ")
      };
    }
    var bits = text.split(/\s+/).filter(Boolean);
    if (bits.length <= 1) {
      return { lastName: bits[0] || "", firstName: "", middleName: "" };
    }
    return {
      firstName: bits[0],
      middleName: bits.slice(1, -1).join(" "),
      lastName: bits[bits.length - 1]
    };
  }

  function parsePlateLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { plate: "", state: "" };
    }
    if (root.plates && typeof root.plates.parse === "function") {
      var parsed = root.plates.parse(text);
      var row = parsed && parsed.rows && parsed.rows[0];
      if (row && (row.plate || row.state)) {
        return {
          plate: String(row.plate || "").toUpperCase(),
          state: String(row.state || "").toUpperCase()
        };
      }
    }
    var bits = text.toUpperCase().split(/\s+/).filter(Boolean);
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[0])) {
      return {
        state: bits[0],
        plate: bits.slice(1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[bits.length - 1])) {
      return {
        state: bits[bits.length - 1],
        plate: bits.slice(0, -1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    return {
      plate: text.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      state: ""
    };
  }

  function parseAddressLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { street: "", city: "", state: "", zip: "" };
    }
    var parts = text.split(",").map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var street = parts[0] || text;
    var city = "";
    var state = "";
    var zip = "";
    if (parts.length === 2) {
      var rest = parts[1].split(/\s+/).filter(Boolean);
      if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
        state = rest.pop().toUpperCase();
        city = rest.join(" ");
      } else if (rest.length && /^\d{5}(?:-\d{4})?$/.test(rest[rest.length - 1])) {
        zip = rest.pop();
        if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
          state = rest.pop().toUpperCase();
        }
        city = rest.join(" ");
      } else {
        city = parts[1];
      }
    } else if (parts.length >= 3) {
      city = parts[1];
      var tail = parts.slice(2).join(" ").split(/\s+/).filter(Boolean);
      if (tail.length && /^\d{5}(?:-\d{4})?$/.test(tail[tail.length - 1])) {
        zip = tail.pop();
      }
      if (tail.length && /^[A-Za-z]{2}$/.test(tail[tail.length - 1])) {
        state = tail.pop().toUpperCase();
      } else if (tail.length) {
        city = [city].concat(tail).join(" ");
      }
    }
    return { street: street, city: city, state: state, zip: zip };
  }

  function identityPerson(source, personId) {
    var name =
      source && source.name
        ? clone(source.name)
        : { lastName: "", firstName: "", middleName: "" };
    var extra = {
      caseRole: "LEAD",
      name: name,
      sex: (source && source.sex) || "",
      dateOfBirth: (source && source.dateOfBirth) || "",
      age: (source && source.age) || "",
      citizenship: (source && source.citizenship) || "",
      ssn: (source && source.ssn) || "",
      lexId: (source && source.lexId) || ""
    };
    if (personId) {
      extra.personId = personId;
    }
    return model.createPerson(extra);
  }

  function associationIsPerson(link) {
    if (!link) {
      return false;
    }
    var other = String(link.otherType || (link.to && link.to.type) || "").toUpperCase();
    var toType = String((link.to && link.to.type) || "").toUpperCase();
    if (other && other !== "PERSON") {
      return false;
    }
    if (toType && toType !== "PERSON") {
      return false;
    }
    return true;
  }

  function assignedOfficerStamp(snap) {
    var id = snap && snap.assignedOfficerId ? String(snap.assignedOfficerId) : "";
    if (!id) {
      return { officerId: "", officerAlias: "" };
    }
    var api = root.officers;
    var code =
      api && typeof api.aliasForId === "function" ? api.aliasForId(id) : "";
    return { officerId: id, officerAlias: code || "" };
  }

  function appendSystemNote(snap, text) {
    if (!snap) {
      return;
    }
    snap.history = Array.isArray(snap.history) ? snap.history : [];
    var stamp = assignedOfficerStamp(snap);
    var event = model.createHistoryEvent
      ? model.createHistoryEvent({
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        })
      : {
          eventId: model.newId("evt"),
          at: model.nowIso(),
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        };
    snap.history.push(event);
  }

  /**
   * Mint or reuse a committed lead for an associated person.
   * Stays in leads{} (All / Working / Filed). Does not copy RAP.
   */
  function promoteAssociateToCase(sourceLeadId, linkId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: "", existing: false, error: fresh.error };
    }
    var source = state.leads[sourceLeadId]
      ? clone(state.leads[sourceLeadId])
      : null;
    if (!source) {
      return { ok: false, leadId: "", existing: false, error: "Case not found." };
    }
    if (model.isCommitted && !model.isCommitted(source)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Open a filed case to promote an associate."
      };
    }
    var links = source.links || [];
    var link = null;
    var i;
    for (i = 0; i < links.length; i++) {
      if (links[i] && links[i].linkId === linkId) {
        link = links[i];
        break;
      }
    }
    if (!link) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Association not found."
      };
    }
    if (!associationIsPerson(link)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Only a person association can open as a new case."
      };
    }
    var subject = model.subjectOf ? model.subjectOf(source) : source.person;
    var personId = String((link.to && link.to.id) || "").trim();
    var label = String(link.label || "").trim();
    if (!label && personId && state.people[personId] && model.formatPersonLabel) {
      label = model.formatPersonLabel(state.people[personId]) || "";
    }
    if (!label && !personId) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Enter a name, or link an existing person."
      };
    }
    var existingLeadId = "";
    if (personId) {
      var related = relatedCommittedCases(personId, source.leadId);
      if (related.asSubject && related.asSubject.length) {
        existingLeadId = related.asSubject[0].leadId;
      } else {
        listLeads().some(function (row) {
          if (
            row &&
            row.leadId !== source.leadId &&
            row.subjectPersonId === personId
          ) {
            existingLeadId = row.leadId;
            return true;
          }
          return false;
        });
      }
    }
    var sourceLabel =
      (model.formatPersonLabel && model.formatPersonLabel(subject)) || "Case";
    function resolveSourceLink(id) {
      link.to = { type: "PERSON", id: id };
      link.otherType = "PERSON";
      if (label) {
        link.label = label;
      }
    }
    if (existingLeadId) {
      resolveSourceLink(personId);
      source.links = links;
      var savedExisting = saveLead(source, { mode: "commit" });
      if (!savedExisting || !savedExisting.ok) {
        return {
          ok: false,
          leadId: existingLeadId,
          existing: true,
          error: (savedExisting && savedExisting.error) || "Could not update the association."
        };
      }
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var person;
    if (personId && state.people[personId]) {
      person = identityPerson(state.people[personId], personId);
    } else {
      person = identityPerson({ name: nameFromLabel(label) }, "");
      personId = person.personId;
    }
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD"
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.links = [
      model.createLink({
        from: { type: "PERSON", id: person.personId },
        to: { type: "PERSON", id: subject && subject.personId },
        otherType: "PERSON",
        label: sourceLabel,
        reasons: (link.reasons || []).slice(),
        notes: link.notes || ""
      })
    ];
    appendSystemNote(
      next,
      "Opened from " + sourceLabel + "."
    );
    appendSystemNote(
      source,
      "Opened a case for " + (label || (model.formatPersonLabel && model.formatPersonLabel(person)) || "associate") + "."
    );
    resolveSourceLink(person.personId);
    source.links = links;
    upsertPerson(person);
    var savedNew = saveLead(next, { mode: "draft" });
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedSource = saveLead(source, { mode: "commit" });
    if (!savedSource || !savedSource.ok) {
      return {
        ok: true,
        leadId: next.leadId,
        existing: false,
        error: (savedSource && savedSource.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function investigationNodeForPromote(inv, nodeId) {
    var nodes = (inv && inv.nodes) || [];
    var wanted = String(nodeId || "").trim();
    var i;
    var row;
    if (wanted) {
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (row && row.nodeId === wanted) {
          return row;
        }
      }
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (
          row &&
          String(row.objectType || "").toUpperCase() === "PERSON" &&
          row.objectId === wanted
        ) {
          return row;
        }
      }
      return null;
    }
    for (i = 0; i < nodes.length; i++) {
      row = nodes[i];
      if (row && row.nodeId === inv.focusNodeId) {
        return row;
      }
    }
    return null;
  }

  /**
   * Mint or reuse a working lead for a PERSON on an investigation wall.
   * Same personId. Identity only (no RAP, no wall graph dump).
   */
  function promoteInvestigationPersonToCase(investigationId, nodeId) {
    var blank = { ok: false, leadId: "", existing: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = investigationNodeForPromote(inv, nodeId);
    if (!node) {
      blank.error = "Focus a person on the wall to open as a case.";
      return blank;
    }
    if (String(node.objectType || "").toUpperCase() !== "PERSON") {
      blank.error = "Only a person on the wall can open as a case.";
      return blank;
    }
    var personId = String(node.objectId || "").trim();
    if (!personId || !state.people[personId]) {
      blank.error = "Person not found.";
      return blank;
    }
    var existingLeadId = leadIdForPerson(personId);
    if (existingLeadId) {
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var previousPerson = state.people[personId]
      ? clone(state.people[personId])
      : null;
    var person = identityPerson(previousPerson || state.people[personId], personId);
    var label =
      (model.formatPersonLabel && model.formatPersonLabel(person)) || "Person";
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD",
      assignedOfficerId: inv.assignedOfficerId || ""
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.caseRole = "LEAD";
    next.links = [];
    next.vehicles = [];
    appendSystemNote(next, "Opened from investigation " + inv.investigationId + ".");
    appendSystemNote(inv, "Opened a case for " + label + ".");
    upsertPerson(person);
    var savedNew = saveLead(next, { mode: "draft" });
    if (savedNew && savedNew.ok && previousPerson) {
      restorePersonRegistry(previousPerson, person);
    }
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv || !savedInv.ok) {
      return {
        ok: true,
        leadId: next.leadId,
        existing: false,
        error: (savedInv && savedInv.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeSex(value) {
    var key = String(value || "").trim().toLowerCase();
    if (key === "male" || key === "m") {
      return "male";
    }
    if (key === "female" || key === "f") {
      return "female";
    }
    return "";
  }

  function leadIdForPerson(personId) {
    var found = "";
    if (!personId) {
      return found;
    }
    listLeads().some(function (row) {
      if (row && row.subjectPersonId === personId) {
        found = row.leadId;
        return true;
      }
      return false;
    });
    return found;
  }

  function personByAlienNumber(aNumber) {
    var digits = digitsOnly(aNumber);
    if (!digits) {
      return null;
    }
    var found = null;
    allPeople().some(function (person) {
      var imm = (person && person.immigration) || {};
      if (digitsOnly(imm.alienNumber) === digits) {
        found = person;
        return true;
      }
      return false;
    });
    if (found) {
      return found;
    }
    listLeads().some(function (row) {
      var snap = row && state.leads[row.leadId];
      var subject = snap
        ? model.subjectOf
          ? model.subjectOf(snap)
          : snap.person
        : null;
      var imm = (subject && subject.immigration) || {};
      if (subject && digitsOnly(imm.alienNumber) === digits) {
        found = subject;
        return true;
      }
      return false;
    });
    return found;
  }

  function overlayBookInPerson(person, input) {
    var next = person ? clone(person) : model.createPerson({ caseRole: "DETAINEE" });
    next.caseRole = "DETAINEE";
    next.name = next.name || { lastName: "", firstName: "", middleName: "" };
    if (input.lastName) {
      next.name.lastName = input.lastName;
    }
    if (input.firstName) {
      next.name.firstName = input.firstName;
    }
    if (input.sex) {
      next.sex = input.sex;
    }
    if (input.dateOfBirth) {
      next.dateOfBirth = input.dateOfBirth;
    }
    if (input.age !== undefined && input.age !== "") {
      next.age = input.age;
    }
    if (input.citizenship) {
      next.citizenship = input.citizenship;
    }
    next.immigration = next.immigration || {};
    if (input.alienNumber) {
      next.immigration.alienNumber = input.alienNumber;
    }
    if (input.disposition) {
      next.immigration.disposition = input.disposition;
    }
    if (input.status) {
      next.immigration.status = input.status;
    }
    return next;
  }

  /**
   * Book-in Save: mint or reuse a person and file a DETAINEE lead.
   * Packet store stays separate. Identity overlay does not copy RAP.
   */
  function promoteBookInToLead(input) {
    input = input || {};
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: fresh.error
      };
    }
    var lastName = String(input.lastName || "").trim();
    var firstName = String(input.firstName || "").trim();
    var aNumber = digitsOnly(input.alienNumber);
    var leadId = String(input.leadId || "").trim();
    var personId = String(input.personId || "").trim();
    if (!leadId && !personId && !lastName && !firstName && !aNumber) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: "Enter a name or A-Number to file a case."
      };
    }
    var snap = leadId ? getLead(leadId) : null;
    var person = null;
    var existing = false;
    if (snap) {
      person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      personId = (person && person.personId) || personId;
      existing = true;
    } else if (personId && state.people[personId]) {
      person = clone(state.people[personId]);
      leadId = leadIdForPerson(personId);
      snap = leadId ? getLead(leadId) : null;
      existing = !!snap;
    } else if (aNumber) {
      var match = personByAlienNumber(aNumber);
      if (match) {
        person = clone(match);
        personId = person.personId || "";
        leadId = leadIdForPerson(personId);
        snap = leadId ? getLead(leadId) : null;
        existing = !!snap;
      }
    }
    var overlay = {
      lastName: lastName,
      firstName: firstName,
      sex: normalizeSex(input.sex),
      dateOfBirth: String(input.dateOfBirth || "").trim(),
      age: input.age,
      citizenship: String(input.citizenship || "").trim(),
      alienNumber: aNumber,
      disposition: String(input.disposition || "").trim(),
      status: String(input.status || "").trim()
    };
    person = overlayBookInPerson(person, overlay);
    personId = person.personId;
    var wasDetainee =
      snap &&
      (snap.caseRole === "DETAINEE" ||
        (snap.person && snap.person.caseRole === "DETAINEE"));
    if (!snap) {
      snap = model.createLead({
        person: person,
        subjectPersonId: person.personId,
        caseRole: "DETAINEE"
      });
      leadId = snap.leadId;
      appendSystemNote(snap, "Booked in. Detainee / in custody.");
    } else {
      snap.person = person;
      snap.subjectPersonId = person.personId;
      snap.caseRole = "DETAINEE";
      if (!wasDetainee) {
        appendSystemNote(snap, "Booked in. Status set to Detainee / in custody.");
      }
    }
    snap.person = person;
    snap.subjectPersonId = person.personId;
    snap.caseRole = "DETAINEE";
    var saved = saveLead(snap, { mode: "commit" });
    if (!saved || !saved.ok) {
      return {
        ok: false,
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: (saved && saved.error) || "Could not file the case."
      };
    }
    return {
      ok: true,
      leadId: saved.leadId,
      personId: personId,
      existing: existing,
      error: ""
    };
  }

  function listLeads() {
    return Object.keys(state.leads)
      .map(function (id) {
        var snap = state.leads[id];
        var subject = model.subjectOf ? model.subjectOf(snap) : snap.person;
        var name = model.formatPersonLabel(subject) || "Untitled case";
        return {
          leadId: id,
          label: name,
          updatedAt: (snap.meta && snap.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(snap) : "committed",
          subjectPersonId: snap.subjectPersonId
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  /**
   * Other committed leads for a person: as the subject, or as a PERSON
   * endpoint on a person-to-person link. Case view uses this to jump.
   */
  function relatedCommittedCases(personId, excludeLeadId) {
    var id = String(personId || "");
    var skip = String(excludeLeadId || "");
    var asSubject = [];
    var asAssociate = [];
    if (!id) {
      return { asSubject: asSubject, asAssociate: asAssociate };
    }
    listLeads().forEach(function (row) {
      if (!row || row.leadId === skip || row.metaStatus !== "committed") {
        return;
      }
      if (row.subjectPersonId === id) {
        asSubject.push(row);
        return;
      }
      var snap = state.leads[row.leadId];
      var links = (snap && snap.links) || [];
      var i;
      for (i = 0; i < links.length; i++) {
        var link = links[i];
        if (!link) {
          continue;
        }
        var from = link.from || {};
        var to = link.to || {};
        if (
          from.type === "PERSON" &&
          to.type === "PERSON" &&
          (from.id === id || to.id === id)
        ) {
          asAssociate.push(row);
          return;
        }
      }
    });
    return { asSubject: asSubject, asAssociate: asAssociate };
  }

  function allPeople() {
    return Object.keys(state.people).map(function (id) {
      return clone(state.people[id]);
    });
  }

  function getPerson(personId) {
    var person = state.people[personId];
    return person ? clone(person) : null;
  }

  function upsertPerson(person) {
    if (!person || !person.personId) {
      return { ok: false, error: "Person is missing a personId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, error: fresh.error };
    }
    state.people[person.personId] = clone(person);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, error: "" };
  }

  function saveEncounter(record, opts) {
    if (!record || !record.encounterId) {
      return {
        ok: false,
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: record.encounterId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.encounters[record.encounterId]
      ? clone(state.encounters[record.encounterId])
      : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || "copdocx.encounter.v1";
    saved.encounterId = record.encounterId;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    if (!Array.isArray(saved.vehicles)) {
      saved.vehicles = [];
    }
    if (!Array.isArray(saved.locations)) {
      saved.locations = [];
    }
    if (!Array.isArray(saved.subjects)) {
      saved.subjects = [];
    }
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.narratives)) {
      saved.narratives = [];
    }
    if (!saved.supervisorSummary || typeof saved.supervisorSummary !== "object") {
      saved.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    state.encounters[saved.encounterId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: saved.encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: saved.encounterId, error: "" };
  }

  function getEncounter(encounterId) {
    var row = state.encounters[encounterId];
    return row ? clone(row) : null;
  }

  function dropOwnedMedia(encounter) {
    var media = root.media;
    if (!media || typeof media.removeByOwner !== "function" || !encounter) {
      return;
    }
    function forget(owner) {
      media.removeByOwner(owner).then(function () {}, function () {});
    }
    forget({ type: "ENCOUNTER", id: encounter.encounterId });
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (vehicle && vehicle.vehicleId) {
        forget({ type: "VEHICLE", id: vehicle.vehicleId });
      }
    });
    (encounter.locations || []).forEach(function (location) {
      if (location && location.locationId) {
        forget({ type: "LOCATION", id: location.locationId });
      }
    });
  }

  function deleteEncounter(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: fresh.error
      };
    }
    if (!encounterId || !state.encounters[encounterId]) {
      return { ok: false, encounterId: encounterId || "", error: "Encounter not found." };
    }
    var doomed = clone(state.encounters[encounterId]);
    delete state.encounters[encounterId];
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    dropOwnedMedia(doomed);
    return { ok: true, encounterId: encounterId, error: "" };
  }

  function saveInvestigation(record, opts) {
    if (!record || !record.investigationId) {
      return {
        ok: false,
        investigationId: "",
        error: "Investigation is missing an investigationId."
      };
    }
    var kind = String(record.kind || "");
    if (model.isInvestigationKind && !model.isInvestigationKind(kind)) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: "Pick a source for this investigation."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.investigations[record.investigationId]
      ? clone(state.investigations[record.investigationId])
      : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || model.INVESTIGATION_SCHEMA || "copdocx.investigation.v1";
    saved.investigationId = record.investigationId;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    if (!Array.isArray(saved.plates)) {
      saved.plates = [];
    }
    if (!Array.isArray(saved.nodes)) {
      saved.nodes = [];
    }
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.history)) {
      saved.history = [];
    }
    state.investigations[saved.investigationId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        investigationId: saved.investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: saved.investigationId, error: "" };
  }

  function getInvestigation(investigationId) {
    var row = state.investigations[investigationId];
    return row ? clone(row) : null;
  }

  function deleteInvestigation(investigationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, investigationId: investigationId || "", error: fresh.error };
    }
    if (!investigationId || !state.investigations[investigationId]) {
      return {
        ok: false,
        investigationId: investigationId || "",
        error: "Investigation not found."
      };
    }
    delete state.investigations[investigationId];
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        investigationId: investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: investigationId, error: "" };
  }

  function listInvestigations() {
    return Object.keys(state.investigations)
      .map(function (id) {
        var row = state.investigations[id];
        return {
          investigationId: id,
          kind: row.kind || "",
          title: row.title || "",
          parentInvestigationId: row.parentInvestigationId || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed"
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function normalizePlateKey(state, plate) {
    var st = String(state || "").toUpperCase();
    var pl = String(plate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (root.plates && typeof root.plates.plateKey === "function") {
      return root.plates.plateKey(st, pl);
    }
    return st + "|" + pl;
  }

  function saveVehicleRecord(record, opts) {
    if (!record) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing." };
    }
    var id = record.vehicleId || record.id || "";
    if (!id) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing a vehicleId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.vehicles[id] ? clone(state.vehicles[id]) : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.vehicleId = id;
    saved.id = saved.id || id;
    saved.governmentVehicle = false;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.vehicles[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        vehicleId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, vehicleId: id, error: "" };
  }

  function getVehicleRecord(vehicleId) {
    var row = state.vehicles[vehicleId];
    return row ? clone(row) : null;
  }

  function isJunked(record) {
    return !!(record && record.junked);
  }

  function restoreJunkedRecord(objectType, record) {
    if (!record || !isJunked(record)) {
      return record || null;
    }
    record.junked = false;
    record.junkedAt = "";
    var type = String(objectType || "").toUpperCase();
    var restoredId =
      record.personId ||
      record.vehicleId ||
      record.locationId ||
      record.businessId ||
      record.entityId ||
      record.id;
    if (restoredId) {
      setAssociationsJunkedForObject(type, restoredId, false);
    }
    if (type === "PERSON") {
      upsertPerson(record);
      record = getPerson(record.personId);
    } else if (type === "VEHICLE") {
      saveVehicleRecord(record, { mode: "commit" });
      record = getVehicleRecord(record.vehicleId || record.id);
    } else if (type === "LOCATION") {
      saveLocationRecord(record, { mode: "commit" });
      record = getLocationRecord(record.locationId || record.id);
    } else if (type === "BUSINESS") {
      saveBusinessRecord(record, { mode: "commit" });
      record = getBusinessRecord(record.businessId || record.id);
    } else if (type === "ENTITY") {
      saveEntityRecord(record, { mode: "commit" });
      record = getEntityRecord(record.entityId || record.id);
    }
    return record;
  }

  function findVehicleByPlate(stateCode, plate, exceptId, includeJunked) {
    var want = normalizePlateKey(stateCode, plate);
    if (want === "|") {
      return null;
    }
    var ids = Object.keys(state.vehicles);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.vehicles[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      var key = normalizePlateKey(
        row.plateState || "",
        row.licensePlate || row.plate || ""
      );
      if (key === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeNameKey(name) {
    var last = String((name && name.lastName) || "")
      .trim()
      .toUpperCase();
    var first = String((name && name.firstName) || "")
      .trim()
      .toUpperCase();
    if (!last && !first) {
      return "";
    }
    return last + "|" + first;
  }

  function findPersonByName(nameOrLabel, exceptId, includeJunked) {
    var label = "";
    var name = null;
    if (typeof nameOrLabel === "string") {
      label = String(nameOrLabel || "").trim();
      name = nameFromLabel(label);
    } else {
      name = nameOrLabel || {};
      label =
        (model.formatPersonLabel &&
          model.formatPersonLabel({ name: name })) ||
        "";
    }
    var want = normalizeNameKey(name);
    var labelWant = label.toUpperCase();
    if (!want && !labelWant) {
      return null;
    }
    var ids = Object.keys(state.people);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.people[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (want && normalizeNameKey(row.name) === want) {
        return clone(row);
      }
      if (
        labelWant &&
        model.formatPersonLabel &&
        String(model.formatPersonLabel(row) || "").toUpperCase() === labelWant
      ) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeLocationKey(loc) {
    var street = String((loc && loc.street) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var city = String((loc && loc.city) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var st = String((loc && loc.state) || "")
      .trim()
      .toUpperCase();
    var zip = String((loc && loc.zip) || "")
      .trim()
      .toUpperCase();
    if (!street && !city) {
      return "";
    }
    return [street, city, st, zip].join("|");
  }

  function saveLocationRecord(record, opts) {
    if (!record) {
      return { ok: false, locationId: "", error: "Location is missing." };
    }
    var id = record.locationId || record.id || "";
    if (!id) {
      return { ok: false, locationId: "", error: "Location is missing a locationId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, locationId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.locations[id] ? clone(state.locations[id]) : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.locationId = id;
    saved.id = saved.id || id;
    saved.entityType = "LOCATION";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.locations[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        locationId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, locationId: id, error: "" };
  }

  function getLocationRecord(locationId) {
    var row = state.locations[locationId];
    return row ? clone(row) : null;
  }

  function findLocationByAddress(loc, exceptId, includeJunked) {
    var want = normalizeLocationKey(loc);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.locations);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.locations[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeLocationKey(row) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeOrgName(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function saveBusinessRecord(record, opts) {
    if (!record) {
      return { ok: false, businessId: "", error: "Business is missing." };
    }
    var id = record.businessId || record.id || "";
    if (!id) {
      return { ok: false, businessId: "", error: "Business is missing a businessId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, businessId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.businesses[id] ? clone(state.businesses[id]) : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.businessId = id;
    saved.id = saved.id || id;
    saved.entityType = "BUSINESS";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.businesses[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        businessId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, businessId: id, error: "" };
  }

  function getBusinessRecord(businessId) {
    var row = state.businesses[businessId];
    return row ? clone(row) : null;
  }

  function findBusinessByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.businesses);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.businesses[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function saveEntityRecord(record, opts) {
    if (!record) {
      return { ok: false, entityId: "", error: "Entity is missing." };
    }
    var id = record.entityId || record.id || "";
    if (!id) {
      return { ok: false, entityId: "", error: "Entity is missing an entityId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, entityId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.entities[id] ? clone(state.entities[id]) : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.entityId = id;
    saved.id = saved.id || id;
    saved.entityType = "ENTITY";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.entities[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        entityId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, entityId: id, error: "" };
  }

  function getEntityRecord(entityId) {
    var row = state.entities[entityId];
    return row ? clone(row) : null;
  }

  function findEntityByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.entities);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.entities[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function ensureInvestigationNode(inv, objectType, objectId, pos) {
    inv.nodes = Array.isArray(inv.nodes) ? inv.nodes : [];
    var i;
    for (i = 0; i < inv.nodes.length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].objectType === objectType &&
        inv.nodes[i].objectId === objectId
      ) {
        if (pos && typeof pos.x === "number") {
          inv.nodes[i].x = pos.x;
        }
        if (pos && typeof pos.y === "number") {
          inv.nodes[i].y = pos.y;
        }
        return inv.nodes[i];
      }
    }
    var node = model.createInvestigationNode
      ? model.createInvestigationNode({
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        })
      : {
          nodeId: model.newId("node"),
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        };
    inv.nodes.push(node);
    return node;
  }

  function defaultInvestigationReason(fromType, toType) {
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    if (
      (a === "PERSON" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "PERSON")
    ) {
      return "REGISTERED_OWNER_OF";
    }
    if (
      (a === "PERSON" && b === "LOCATION") ||
      (a === "LOCATION" && b === "PERSON")
    ) {
      return "CURRENT_RESIDENCE";
    }
    if (
      (a === "VEHICLE" && b === "LOCATION") ||
      (a === "LOCATION" && b === "VEHICLE")
    ) {
      return "VEHICLE_PARKING";
    }
    if (a === "PERSON" && b === "PERSON") {
      return "ASSOCIATE_OF";
    }
    if (
      (a === "PERSON" && b === "BUSINESS") ||
      (a === "BUSINESS" && b === "PERSON")
    ) {
      return "EMPLOYED_BY";
    }
    if (
      (a === "BUSINESS" && b === "LOCATION") ||
      (a === "LOCATION" && b === "BUSINESS")
    ) {
      return "OPERATES_AT";
    }
    if (
      (a === "BUSINESS" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "BUSINESS")
    ) {
      return "FLEET_OF";
    }
    if (
      (a === "PERSON" && b === "ENTITY") ||
      (a === "ENTITY" && b === "PERSON")
    ) {
      return "MEMBER_OF";
    }
    if (
      (a === "ENTITY" && b === "LOCATION") ||
      (a === "LOCATION" && b === "ENTITY")
    ) {
      return "BASED_AT";
    }
    if (
      (a === "ENTITY" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "ENTITY")
    ) {
      return "USES_VEHICLE";
    }
    if (
      (a === "BUSINESS" && b === "ENTITY") ||
      (a === "ENTITY" && b === "BUSINESS")
    ) {
      return "AFFILIATED_WITH";
    }
    return "";
  }

  function canonicalLinkEnds(fromType, fromId, toType, toId, reason) {
    if (model.canonicalAssociationEnds) {
      return model.canonicalAssociationEnds(fromType, fromId, toType, toId, reason);
    }
    return {
      fromType: fromType,
      fromId: fromId,
      toType: toType,
      toId: toId,
      reason: reason || ""
    };
  }

  function investigationReasonPhrase(code) {
    var map = {
      REGISTERED_OWNER_OF: "registered owner",
      KNOWN_OPERATOR_OF: "known operator",
      CURRENT_RESIDENCE: "current residence",
      KNOWN_RESIDENCE: "known residence",
      LAST_KNOWN_ADDRESS: "last known address",
      EMPLOYMENT_ADDRESS: "employment address",
      BUSINESS_ADDRESS: "business address",
      FREQUENTED_LOCATION: "frequented location",
      REGISTERED_ADDRESS: "registered address",
      VEHICLE_PARKING: "parking",
      STORED_AT: "stored at",
      ASSOCIATE_OF: "associate",
      COHABITANT_OF: "cohabitant",
      SPOUSE_OF: "spouse",
      PARENT_OF: "parent",
      SIBLING_OF: "sibling",
      EMPLOYED_BY: "employed by",
      PRINCIPAL_OF: "principal of",
      CUSTOMER_OF: "customer of",
      OPERATES_AT: "operates at",
      FLEET_OF: "fleet of",
      MEMBER_OF: "member of",
      BASED_AT: "based at",
      USES_VEHICLE: "uses vehicle",
      AFFILIATED_WITH: "affiliated with"
    };
    return map[code] || "linked";
  }

  function investigationObjectLabel(objectType, objectId) {
    if (objectType === "PERSON") {
      var person = getPerson(objectId);
      return (
        (person && model.formatPersonLabel && model.formatPersonLabel(person)) ||
        objectId
      );
    }
    if (objectType === "VEHICLE") {
      var vehicle = getVehicleRecord(objectId);
      if (!vehicle) {
        return objectId;
      }
      return (
        [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
          .filter(Boolean)
          .join(" ") || objectId
      );
    }
    if (objectType === "LOCATION") {
      var loc = getLocationRecord(objectId);
      if (!loc) {
        return objectId;
      }
      return (
        [loc.street, loc.city, loc.state].filter(Boolean).join(", ") || objectId
      );
    }
    if (objectType === "BUSINESS") {
      var biz = getBusinessRecord(objectId);
      return (
        (biz && model.formatBusinessLabel && model.formatBusinessLabel(biz)) ||
        (biz && biz.name) ||
        objectId
      );
    }
    if (objectType === "ENTITY") {
      var ent = getEntityRecord(objectId);
      return (
        (ent && model.formatEntityLabel && model.formatEntityLabel(ent)) ||
        (ent && ent.name) ||
        objectId
      );
    }
    return objectId;
  }

  function resolveInvestigationAddObject(objectType, input) {
    input = input || {};
    var reused = false;
    var record = null;
    if (objectType === "PERSON") {
      if (input.objectId) {
        record = getPerson(input.objectId);
        reused = !!record;
      }
      var name = input.name;
      if (typeof name === "string") {
        name = nameFromLabel(name);
      }
      if (!name || (!name.lastName && !name.firstName)) {
        name = nameFromLabel(input.label || "");
      }
      if (!record && name && (name.lastName || name.firstName)) {
        record = findPersonByName(name);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("PERSON", findPersonByName(name, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        if (!name) {
          name = { lastName: "", firstName: "", middleName: "" };
        }
        record = model.createPerson
          ? model.createPerson({ name: name, caseRole: "" })
          : {
              personId: model.newId("p"),
              entityType: "PERSON",
              name: name,
              caseRole: ""
            };
        var savedPerson = upsertPerson(record);
        if (!savedPerson.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedPerson.error || "Could not save the person."
          };
        }
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.personId,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "VEHICLE") {
      var plate = String(input.licensePlate || input.plate || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      var plateState = String(input.plateState || input.state || "").toUpperCase();
      if (input.objectId) {
        record = getVehicleRecord(input.objectId);
        reused = !!record;
      }
      if (!record && plate) {
        record = findVehicleByPlate(plateState, plate);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord(
            "VEHICLE",
            findVehicleByPlate(plateState, plate, "", true)
          );
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createVehicle
          ? model.createVehicle({
              licensePlate: plate,
              plate: plate,
              plateState: plateState,
              governmentVehicle: false
            })
          : {
              vehicleId: model.newId("veh"),
              licensePlate: plate,
              plate: plate,
              plateState: plateState,
              governmentVehicle: false
            };
        var savedVeh = saveVehicleRecord(record, { mode: "commit" });
        if (!savedVeh.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedVeh.error || "Could not save the vehicle."
          };
        }
        record = getVehicleRecord(savedVeh.vehicleId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.vehicleId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "LOCATION") {
      var locInput = {
        street: String(input.street || "").trim(),
        city: String(input.city || "").trim(),
        state: String(input.state || "").trim().toUpperCase(),
        zip: String(input.zip || "").trim()
      };
      if (input.objectId) {
        record = getLocationRecord(input.objectId);
        reused = !!record;
      }
      if (!record && (locInput.street || locInput.city)) {
        record = findLocationByAddress(locInput);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord(
            "LOCATION",
            findLocationByAddress(locInput, "", true)
          );
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createLocation
          ? model.createLocation(locInput)
          : Object.assign(
              { locationId: model.newId("loc"), entityType: "LOCATION" },
              locInput
            );
        var savedLoc = saveLocationRecord(record, { mode: "commit" });
        if (!savedLoc.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedLoc.error || "Could not save the location."
          };
        }
        record = getLocationRecord(savedLoc.locationId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.locationId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "BUSINESS") {
      if (input.objectId) {
        record = getBusinessRecord(input.objectId);
        reused = !!record;
      }
      var bizName = String(input.name || "").trim();
      if (!record && bizName) {
        record = findBusinessByName(bizName);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("BUSINESS", findBusinessByName(bizName, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createBusiness
          ? model.createBusiness({
              name: bizName,
              phone: input.phone || ""
            })
          : {
              businessId: model.newId("biz"),
              entityType: "BUSINESS",
              name: bizName,
              phone: input.phone || ""
            };
        var savedBiz = saveBusinessRecord(record, { mode: "commit" });
        if (!savedBiz.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedBiz.error || "Could not save the business."
          };
        }
        record = getBusinessRecord(savedBiz.businessId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.businessId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "ENTITY") {
      if (input.objectId) {
        record = getEntityRecord(input.objectId);
        reused = !!record;
      }
      var entName = String(input.name || "").trim();
      if (!record && entName) {
        record = findEntityByName(entName);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("ENTITY", findEntityByName(entName, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createCustomEntity
          ? model.createCustomEntity({
              name: entName,
              kind: input.kind || ""
            })
          : {
              entityId: model.newId("ent"),
              entityType: "ENTITY",
              name: entName,
              kind: input.kind || ""
            };
        var savedEnt = saveEntityRecord(record, { mode: "commit" });
        if (!savedEnt.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedEnt.error || "Could not save the entity."
          };
        }
        record = getEntityRecord(savedEnt.entityId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.entityId || record.id,
        reused: reused,
        error: ""
      };
    }
    return {
      ok: false,
      record: null,
      objectId: "",
      reused: false,
      error: "Pick a person, vehicle, location, business, or entity."
    };
  }

  function addInvestigationObject(investigationId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      nodeId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    if (!state.investigations[investigationId]) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var objectType = String(input.objectType || "").toUpperCase();
    if (
      objectType !== "PERSON" &&
      objectType !== "VEHICLE" &&
      objectType !== "LOCATION" &&
      objectType !== "BUSINESS" &&
      objectType !== "ENTITY"
    ) {
      blank.error = "Pick a person, vehicle, location, business, or entity.";
      return blank;
    }
    var resolved = resolveInvestigationAddObject(objectType, input);
    if (!resolved.ok) {
      blank.objectType = objectType;
      blank.error = resolved.error;
      return blank;
    }
    fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = clone(state.investigations[investigationId]);
    var fromNode = null;
    var fromNodeId = Object.prototype.hasOwnProperty.call(input, "fromNodeId")
      ? input.fromNodeId || ""
      : inv.focusNodeId || "";
    var i;
    if (fromNodeId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
          fromNode = inv.nodes[i];
          break;
        }
      }
    }
    if (
      fromNode &&
      fromNode.objectType === objectType &&
      fromNode.objectId === resolved.objectId
    ) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: fromNode.nodeId,
        linkId: "",
        reused: resolved.reused,
        error: "Cannot link an object to itself."
      };
    }
    var node = ensureInvestigationNode(inv, objectType, resolved.objectId, {
      x: typeof input.x === "number" ? input.x : undefined,
      y: typeof input.y === "number" ? input.y : undefined
    });
    if (typeof input.x === "number") {
      node.x = input.x;
    }
    if (typeof input.y === "number") {
      node.y = input.y;
    }
    var linkId = "";
    var associationId = "";
    var reason = String(input.reason || "").trim();
    if (fromNode) {
      if (!reason) {
        reason = defaultInvestigationReason(fromNode.objectType, objectType);
      }
      if (!reason) {
        return {
          ok: false,
          objectType: objectType,
          objectId: resolved.objectId,
          nodeId: node.nodeId,
          linkId: "",
          reused: resolved.reused,
          error: "Pick a link type."
        };
      }
      var ends = canonicalLinkEnds(
        fromNode.objectType,
        fromNode.objectId,
        objectType,
        resolved.objectId,
        reason
      );
      inv.links = Array.isArray(inv.links) ? inv.links : [];
      var existingLink = null;
      for (i = 0; i < inv.links.length; i++) {
        var row = inv.links[i];
        if (!row || !row.from || !row.to) {
          continue;
        }
        var sameEnds =
          (row.from.type === ends.fromType &&
            row.from.id === ends.fromId &&
            row.to.type === ends.toType &&
            row.to.id === ends.toId) ||
          (row.from.type === ends.toType &&
            row.from.id === ends.toId &&
            row.to.type === ends.fromType &&
            row.to.id === ends.fromId);
        var reasons = row.reasons || [];
        if (sameEnds && reasons.indexOf(reason) !== -1) {
          existingLink = row;
          break;
        }
      }
      if (existingLink) {
        linkId = existingLink.linkId;
        citeWallAssociation(
          existingLink,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        associationId = existingLink.associationId || "";
      } else {
        var link = model.createLink
          ? model.createLink({
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              otherType: ends.toType,
              reasons: [reason],
              label: investigationObjectLabel(ends.toType, ends.toId)
            })
          : {
              linkId: model.newId("link"),
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              reasons: [reason],
              notes: "",
              label: "",
              otherType: ends.toType
            };
        citeWallAssociation(
          link,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        inv.links.push(link);
        linkId = link.linkId;
        associationId = link.associationId || "";
      }
    }
    if (input.focus !== false) {
      inv.focusNodeId = node.nodeId;
    }
    var addedLabel = investigationObjectLabel(objectType, resolved.objectId);
    var note = "Added " + objectType.toLowerCase() + " " + addedLabel;
    if (fromNode && reason) {
      note += " (" + investigationReasonPhrase(reason) + ")";
    }
    note += ".";
    appendSystemNote(inv, note);
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: node.nodeId,
        linkId: linkId,
        associationId: associationId,
        reused: resolved.reused,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: resolved.objectId,
      nodeId: node.nodeId,
      linkId: linkId,
      associationId: associationId,
      reused: resolved.reused,
      error: ""
    };
  }

  function connectInvestigationNodes(investigationId, fromNodeId, toNodeId, reason) {
    var blank = {
      ok: false,
      linkId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var fromNode = null;
    var toNode = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
        fromNode = inv.nodes[i];
      }
      if (inv.nodes[i] && inv.nodes[i].nodeId === toNodeId) {
        toNode = inv.nodes[i];
      }
    }
    if (!fromNode || !toNode) {
      blank.error = "Both objects must be on this investigation.";
      return blank;
    }
    if (fromNode.nodeId === toNode.nodeId) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      reason = defaultInvestigationReason(fromNode.objectType, toNode.objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var ends = canonicalLinkEnds(
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason
    );
    inv.links = Array.isArray(inv.links) ? inv.links : [];
    for (i = 0; i < inv.links.length; i++) {
      var row = inv.links[i];
      if (!row || !row.from || !row.to) {
        continue;
      }
      var sameEnds =
        (row.from.type === ends.fromType &&
          row.from.id === ends.fromId &&
          row.to.type === ends.toType &&
          row.to.id === ends.toId) ||
        (row.from.type === ends.toType &&
          row.from.id === ends.toId &&
          row.to.type === ends.fromType &&
          row.to.id === ends.fromId);
      if (sameEnds && (row.reasons || []).indexOf(reason) !== -1) {
        citeWallAssociation(
          row,
          fromNode.objectType,
          fromNode.objectId,
          toNode.objectType,
          toNode.objectId,
          reason,
          inv.investigationId
        );
        saveInvestigation(inv, {
          mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
        });
        return {
          ok: true,
          linkId: row.linkId,
          associationId: row.associationId || "",
          reused: true,
          error: ""
        };
      }
    }
    var link = model.createLink
      ? model.createLink({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          otherType: ends.toType,
          reasons: [reason],
          label: investigationObjectLabel(ends.toType, ends.toId)
        })
      : {
          linkId: model.newId("link"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reasons: [reason],
          notes: "",
          label: "",
          otherType: ends.toType
        };
    citeWallAssociation(
      link,
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason,
      inv.investigationId
    );
    inv.links.push(link);
    appendSystemNote(
      inv,
      "Linked " +
        investigationObjectLabel(fromNode.objectType, fromNode.objectId) +
        " to " +
        investigationObjectLabel(toNode.objectType, toNode.objectId) +
        " (" +
        investigationReasonPhrase(reason) +
        ")."
    );
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save the link.";
      return blank;
    }
    return {
      ok: true,
      linkId: link.linkId,
      associationId: link.associationId || "",
      reused: false,
      error: ""
    };
  }

  function associationTouches(row, objectType, objectId) {
    if (!row || !objectId) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    return (
      (row.from &&
        String(row.from.type || "").toUpperCase() === type &&
        String(row.from.id || "") === id) ||
      (row.to &&
        String(row.to.type || "").toUpperCase() === type &&
        String(row.to.id || "") === id)
    );
  }

  function associationEndsEqual(row, fromType, fromId, toType, toId, reason) {
    if (!row || !row.from || !row.to) {
      return false;
    }
    var rowReason = row.reason || (row.reasons && row.reasons[0]) || "";
    if (reason && rowReason !== reason && (row.reasons || []).indexOf(reason) === -1) {
      return false;
    }
    var fwd =
      row.from.type === fromType &&
      row.from.id === fromId &&
      row.to.type === toType &&
      row.to.id === toId;
    if (fwd) {
      return true;
    }
    var rev =
      row.from.type === toType &&
      row.from.id === toId &&
      row.to.type === fromType &&
      row.to.id === fromId;
    if (!rev) {
      return false;
    }
    return !reason || model.isSymmetricAssociation(reason) || rowReason === reason;
  }

  function findAssociationByEnds(fromType, fromId, toType, toId, reason, includeJunked) {
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (
        associationEndsEqual(
          row,
          ends.fromType,
          ends.fromId,
          ends.toType,
          ends.toId,
          ends.reason || reason
        )
      ) {
        return row;
      }
    }
    return null;
  }

  function putAssociation(record) {
    if (!record || !record.associationId) {
      return null;
    }
    state.associations = state.associations || {};
    state.associations[record.associationId] = clone(record);
    return state.associations[record.associationId];
  }

  function upsertAssociation(input, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      reused: false,
      associationId: "",
      error: ""
    };
    if (!opts.skipAdopt) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        blank.error = fresh.error;
        return blank;
      }
    }
    input = input || {};
    var fromType = (input.from && input.from.type) || input.fromEntityType || "";
    var fromId = (input.from && input.from.id) || input.fromEntityId || "";
    var toType = (input.to && input.to.type) || input.toEntityType || "";
    var toId = (input.to && input.to.id) || input.toEntityId || "";
    var reason =
      input.reason ||
      input.associationTypeCode ||
      (input.reasons && input.reasons[0]) ||
      "";
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (fromType && toType && model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(fromType, toType, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    if (
      ends.fromType &&
      ends.toType &&
      ends.fromType === ends.toType &&
      ends.fromId &&
      ends.fromId === ends.toId
    ) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    var existing = findAssociationByEnds(
      ends.fromType,
      ends.fromId,
      ends.toType,
      ends.toId,
      ends.reason || reason,
      true
    );
    if (existing) {
      if (isJunked(existing)) {
        existing.junked = false;
        existing.junkedAt = "";
      }
      if (input.notes && !existing.notes) {
        existing.notes = input.notes;
      }
      if (input.label) {
        existing.label = input.label;
      }
      if (input.occupancy) {
        existing.occupancy = input.occupancy;
      }
      if (input.validFrom || input.occupiedFrom) {
        existing.validFrom = input.validFrom || input.occupiedFrom;
      }
      if (input.validTo || input.occupiedTo) {
        existing.validTo = input.validTo || input.occupiedTo;
      }
      putAssociation(existing);
      if (!opts.skipLeadSync) {
        if (ends.fromType === "PERSON") {
          syncLeadsForPerson(ends.fromId);
        }
        if (ends.toType === "PERSON") {
          syncLeadsForPerson(ends.toId);
        }
      }
      if (opts.persist !== false) {
        writeDisk();
      }
      return {
        ok: true,
        reused: true,
        associationId: existing.associationId,
        error: ""
      };
    }
    var record = model.createAssociation
      ? model.createAssociation({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason],
          otherType: ends.toType,
          label: input.label || "",
          notes: input.notes || "",
          occupancy: input.occupancy || "",
          validFrom: input.validFrom || "",
          validTo: input.validTo || "",
          source: input.source || {
            investigationId: input.investigationId || "",
            leadId: input.leadId || "",
            encounterId: input.encounterId || "",
            officerId: input.officerId || ""
          },
          assertedAt: input.assertedAt || (model.nowIso ? model.nowIso() : "")
        })
      : {
          associationId: model.newId("asoc"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason]
        };
    putAssociation(record);
    if (!opts.skipLeadSync) {
      if (ends.fromType === "PERSON") {
        syncLeadsForPerson(ends.fromId);
      }
      if (ends.toType === "PERSON") {
        syncLeadsForPerson(ends.toId);
      }
    }
    if (opts.persist !== false) {
      writeDisk();
    }
    return {
      ok: true,
      reused: false,
      associationId: record.associationId,
      error: ""
    };
  }

  function citeWallAssociation(link, fromType, fromId, toType, toId, reason, investigationId) {
    var result = upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: reason,
        source: { investigationId: investigationId || "" }
      },
      { skipAdopt: true, persist: true }
    );
    if (result.ok && link) {
      link.associationId = result.associationId;
    }
    return result;
  }

  function getAssociation(associationId) {
    adoptDisk();
    var row = state.associations && state.associations[associationId];
    return row ? clone(row) : null;
  }

  function associationsFor(objectType, objectId, opts) {
    opts = opts || {};
    adoptDisk();
    var out = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (!opts.includeJunked && isJunked(row)) {
        return;
      }
      if (associationTouches(row, objectType, objectId)) {
        out.push(clone(row));
      }
    });
    return out;
  }

  function nestedLocationKind(reason) {
    var code = String(reason || "").toUpperCase();
    if (code === "EMPLOYMENT_ADDRESS" || code === "BUSINESS_ADDRESS") {
      return "work";
    }
    if (code === "REGISTERED_ADDRESS") {
      return "registration";
    }
    if (code === "VEHICLE_PARKING" || code === "STORED_AT") {
      return "known-parking";
    }
    return "residence";
  }

  function reasonFromNestedLocationKind(kind) {
    var key = String(kind || "").toLowerCase();
    if (key === "work") {
      return "EMPLOYMENT_ADDRESS";
    }
    if (key === "registration") {
      return "REGISTERED_ADDRESS";
    }
    if (key === "known-parking") {
      return "VEHICLE_PARKING";
    }
    return "CURRENT_RESIDENCE";
  }

  function associationOccupancyValue(row) {
    return String((row && row.occupancy) || "").toLowerCase() === "historical"
      ? "historical"
      : "current";
  }

  function occupancyPayload(row) {
    return {
      occupancy: associationOccupancyValue(row),
      validFrom: (row && (row.validFrom || row.occupiedFrom)) || "",
      validTo: (row && (row.validTo || row.occupiedTo)) || ""
    };
  }

  function applyAssociationOccupancy(target, asoc) {
    if (!target || !asoc) {
      return false;
    }
    var next = occupancyPayload(asoc);
    var changed = false;
    if (target.occupancy !== next.occupancy) {
      target.occupancy = next.occupancy;
      changed = true;
    }
    if (target.occupiedFrom !== next.validFrom) {
      target.occupiedFrom = next.validFrom;
      changed = true;
    }
    if (target.occupiedTo !== next.validTo) {
      target.occupiedTo = next.validTo;
      changed = true;
    }
    return changed;
  }

  function findAssociationByPair(typeA, idA, typeB, idB, includeJunked) {
    var aType = String(typeA || "").toUpperCase();
    var bType = String(typeB || "").toUpperCase();
    var aId = String(idA || "");
    var bId = String(idB || "");
    if (!aType || !aId || !bType || !bId) {
      return null;
    }
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (associationTouches(row, aType, aId) && associationTouches(row, bType, bId)) {
        return row;
      }
    }
    return null;
  }

  function occupancyFor(typeA, idA, typeB, idB) {
    adoptDisk();
    var row = findAssociationByPair(typeA, idA, typeB, idB);
    if (!row) {
      return null;
    }
    var occ = occupancyPayload(row);
    return {
      occupancy: occ.occupancy,
      occupiedFrom: occ.validFrom,
      occupiedTo: occ.validTo,
      associationId: row.associationId
    };
  }

  function putIdentityLocation(loc) {
    if (!loc || !loc.locationId) {
      return;
    }
    state.locations = state.locations || {};
    var prev = state.locations[loc.locationId];
    if (!prev) {
      var copy = clone(loc);
      copy.entityType = "LOCATION";
      copy.locationId = loc.locationId;
      copy.id = copy.id || loc.locationId;
      state.locations[loc.locationId] = copy;
      return;
    }
    prev.street = loc.street || prev.street;
    prev.street2 = loc.street2 || prev.street2;
    prev.city = loc.city || prev.city;
    prev.state = loc.state || prev.state;
    prev.zip = loc.zip || prev.zip;
    prev.latitude = loc.latitude || prev.latitude;
    prev.longitude = loc.longitude || prev.longitude;
  }

  function putIdentityVehicle(veh) {
    if (!veh) {
      return;
    }
    var id = veh.vehicleId || veh.id;
    if (!id) {
      return;
    }
    state.vehicles = state.vehicles || {};
    var prev = state.vehicles[id];
    if (!prev) {
      var copy = clone(veh);
      copy.entityType = "VEHICLE";
      copy.vehicleId = id;
      copy.id = copy.id || id;
      copy.governmentVehicle = false;
      state.vehicles[id] = copy;
      return;
    }
    prev.licensePlate = veh.licensePlate || veh.plate || prev.licensePlate;
    prev.plate = prev.licensePlate;
    prev.plateState = veh.plateState || prev.plateState;
    prev.vehicleYear = veh.vehicleYear || prev.vehicleYear;
    prev.vehicleMake = veh.vehicleMake || prev.vehicleMake;
    prev.vehicleModel = veh.vehicleModel || prev.vehicleModel;
    prev.vehicleColor = veh.vehicleColor || prev.vehicleColor;
    prev.vehicleBodyStyle = veh.vehicleBodyStyle || prev.vehicleBodyStyle;
    prev.vin = veh.vin || prev.vin;
    if (!prev.registeredOwnerName && veh.registeredOwnerName) {
      prev.registeredOwnerName = veh.registeredOwnerName;
    }
    prev.governmentVehicle = false;
  }

  function writePairOccupancy(fromType, fromId, toType, toId, row, defaultReason) {
    if (!fromId || !toId || !row) {
      return;
    }
    var occ = occupancyPayload(row);
    var existing = findAssociationByPair(fromType, fromId, toType, toId);
    if (existing) {
      existing.occupancy = occ.occupancy;
      existing.validFrom = occ.validFrom;
      existing.validTo = occ.validTo;
      putAssociation(existing);
      return;
    }
    upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: defaultReason,
        occupancy: occ.occupancy,
        validFrom: occ.validFrom,
        validTo: occ.validTo
      },
      { skipAdopt: true, persist: false, skipLeadSync: true }
    );
  }

  function syncNestedOccupancyToAssociations(lead) {
    if (!lead || !lead.person) {
      return;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return;
    }
    (lead.person.locations || []).forEach(function (loc) {
      if (!loc || !loc.locationId) {
        return;
      }
      putIdentityLocation(loc);
      writePairOccupancy(
        "PERSON",
        personId,
        "LOCATION",
        loc.locationId,
        loc,
        reasonFromNestedLocationKind(loc.association)
      );
    });
    (lead.vehicles || []).forEach(function (veh) {
      if (!veh) {
        return;
      }
      var vehicleId = veh.vehicleId || veh.id;
      if (!vehicleId) {
        return;
      }
      putIdentityVehicle(veh);
      writePairOccupancy(
        "PERSON",
        personId,
        "VEHICLE",
        vehicleId,
        veh,
        "REGISTERED_OWNER_OF"
      );
      (veh.locations || []).forEach(function (loc) {
        if (!loc || !loc.locationId) {
          return;
        }
        putIdentityLocation(loc);
        var reason = reasonFromNestedLocationKind(loc.association);
        if (reason === "CURRENT_RESIDENCE") {
          reason = "VEHICLE_PARKING";
        }
        writePairOccupancy("VEHICLE", vehicleId, "LOCATION", loc.locationId, loc, reason);
      });
    });
  }

  function otherEnd(row, type, id) {
    if (!row || !row.from || !row.to) {
      return null;
    }
    if (row.from.type === type && row.from.id === id) {
      return row.to;
    }
    if (row.to.type === type && row.to.id === id) {
      return row.from;
    }
    return null;
  }

  function ensureNestedLocation(list, locationId, reason, asoc) {
    var src = getLocationRecord(locationId);
    if (!src) {
      return false;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].locationId === locationId) {
        list[i].street = src.street || list[i].street;
        list[i].street2 = src.street2 || list[i].street2;
        list[i].city = src.city || list[i].city;
        list[i].state = src.state || list[i].state;
        list[i].zip = src.zip || list[i].zip;
        list[i].latitude = src.latitude || list[i].latitude;
        list[i].longitude = src.longitude || list[i].longitude;
        if (!list[i].association) {
          list[i].association = nestedLocationKind(reason);
        }
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return true;
      }
    }
    var copy = clone(src);
    copy.association = nestedLocationKind(reason);
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    } else if (!copy.occupancy) {
      copy.occupancy = "current";
    }
    list.push(copy);
    return true;
  }

  function ensureNestedVehicle(list, vehicleId, asoc) {
    var src = getVehicleRecord(vehicleId);
    if (!src) {
      return null;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && (list[i].vehicleId || list[i].id) === vehicleId) {
        list[i].licensePlate = src.licensePlate || src.plate || list[i].licensePlate;
        list[i].plate = list[i].licensePlate;
        list[i].plateState = src.plateState || list[i].plateState;
        list[i].vehicleYear = src.vehicleYear || list[i].vehicleYear;
        list[i].vehicleMake = src.vehicleMake || list[i].vehicleMake;
        list[i].vehicleModel = src.vehicleModel || list[i].vehicleModel;
        list[i].vehicleColor = src.vehicleColor || list[i].vehicleColor;
        list[i].vehicleBodyStyle = src.vehicleBodyStyle || list[i].vehicleBodyStyle;
        list[i].vin = src.vin || list[i].vin;
        if (!list[i].registeredOwnerName && src.registeredOwnerName) {
          list[i].registeredOwnerName = src.registeredOwnerName;
        }
        list[i].governmentVehicle = false;
        list[i].locations = list[i].locations || [];
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return list[i];
      }
    }
    var copy = clone(src);
    copy.governmentVehicle = false;
    copy.locations = Array.isArray(copy.locations) ? copy.locations : [];
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    }
    list.push(copy);
    return copy;
  }

  function applyAssociationNestingToLead(lead) {
    if (!lead || !lead.person) {
      return false;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return false;
    }
    var person = lead.person;
    person.locations = Array.isArray(person.locations) ? person.locations : [];
    lead.vehicles = Array.isArray(lead.vehicles) ? lead.vehicles : [];
    var changed = false;
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || isJunked(row)) {
        return;
      }
      var other = otherEnd(row, "PERSON", personId);
      if (!other || !other.type || !other.id) {
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (other.type === "LOCATION") {
        if (ensureNestedLocation(person.locations, other.id, reason, row)) {
          changed = true;
        }
      }
      if (other.type === "VEHICLE") {
        var nested = ensureNestedVehicle(lead.vehicles, other.id, row);
        if (nested) {
          changed = true;
        }
      }
    });
    lead.vehicles.forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id;
      if (!vehicleId) {
        return;
      }
      vehicle.locations = Array.isArray(vehicle.locations) ? vehicle.locations : [];
      Object.keys(state.associations || {}).forEach(function (id) {
        var row = state.associations[id];
        if (!row || isJunked(row)) {
          return;
        }
        var other = otherEnd(row, "VEHICLE", vehicleId);
        if (!other || other.type !== "LOCATION" || !other.id) {
          return;
        }
        var reason = row.reason || (row.reasons && row.reasons[0]) || "";
        if (ensureNestedLocation(vehicle.locations, other.id, reason, row)) {
          changed = true;
        }
      });
    });
    return changed;
  }

  function syncLeadsForPerson(personId) {
    var leadId = leadIdForPerson(personId);
    if (!leadId || !state.leads[leadId]) {
      return;
    }
    applyAssociationNestingToLead(state.leads[leadId]);
    rememberPeople(state.leads[leadId]);
  }

  function setAssociationReason(associationId, reason) {
    var blank = { ok: false, associationId: associationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var row = state.associations && state.associations[associationId];
    if (!row) {
      blank.error = "Association not found.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(
      row.from.type,
      row.from.id,
      row.to.type,
      row.to.id,
      reason
    );
    row.from = { type: ends.fromType, id: ends.fromId };
    row.to = { type: ends.toType, id: ends.toId };
    row.reason = ends.reason || reason;
    row.reasons = [row.reason];
    putAssociation(row);
    if (row.from.type === "PERSON") {
      syncLeadsForPerson(row.from.id);
    }
    if (row.to.type === "PERSON") {
      syncLeadsForPerson(row.to.id);
    }
    writeDisk();
    return { ok: true, associationId: row.associationId, error: "" };
  }

  function stripAssociationCitations(associationId) {
    if (!associationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv || !Array.isArray(inv.links)) {
        return;
      }
      inv.links = inv.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
    Object.keys(state.leads || {}).forEach(function (id) {
      var lead = state.leads[id];
      if (!lead || !Array.isArray(lead.links)) {
        return;
      }
      lead.links = lead.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
  }

  function dropAssociation(associationId) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    if (!associationId || !state.associations || !state.associations[associationId]) {
      return {
        ok: true,
        associationId: associationId || "",
        removed: false,
        error: ""
      };
    }
    delete state.associations[associationId];
    stripAssociationCitations(associationId);
    if (!writeDisk()) {
      adoptDisk();
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return {
      ok: true,
      associationId: associationId,
      removed: true,
      error: ""
    };
  }

  function dropAssociationsForObject(objectType, objectId) {
    Object.keys(state.associations || {}).forEach(function (id) {
      if (associationTouches(state.associations[id], objectType, objectId)) {
        delete state.associations[id];
      }
    });
  }

  function setAssociationsJunkedForObject(objectType, objectId, junked) {
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!associationTouches(row, objectType, objectId)) {
        return;
      }
      row.junked = !!junked;
      row.junkedAt = junked && model.nowIso ? model.nowIso() : "";
    });
  }

  function retargetAssociations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (row.from && row.from.type === objectType && row.from.id === fromId) {
        row.from.id = toId;
      }
      if (row.to && row.to.type === objectType && row.to.id === fromId) {
        row.to.id = toId;
      }
      if (
        row.from &&
        row.to &&
        row.from.type === row.to.type &&
        row.from.id === row.to.id
      ) {
        delete state.associations[id];
      }
    });
    var seen = {};
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        return;
      }
      var key =
        row.from.type +
        "|" +
        row.from.id +
        "|" +
        row.to.type +
        "|" +
        row.to.id +
        "|" +
        (row.reason || "");
      var symmetric =
        model.isSymmetricAssociation && model.isSymmetricAssociation(row.reason);
      if (symmetric) {
        var a = row.from.type + "|" + row.from.id;
        var b = row.to.type + "|" + row.to.id;
        key =
          (a < b ? a + "|" + b : b + "|" + a) + "|" + (row.reason || "");
      }
      if (seen[key] && seen[key] !== id) {
        retargetWallAssociationIds(id, seen[key]);
        delete state.associations[id];
        return;
      }
      seen[key] = id;
    });
  }

  function retargetWallAssociationIds(fromAssociationId, toAssociationId) {
    if (!fromAssociationId || !toAssociationId || fromAssociationId === toAssociationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      (inv.links || []).forEach(function (link) {
        if (link && link.associationId === fromAssociationId) {
          link.associationId = toAssociationId;
        }
      });
    });
  }

  function restorePersonRegistry(previous, identity) {
    if (!previous || !previous.personId) {
      return;
    }
    var kept = clone(previous);
    if (identity && identity.name) {
      kept.name = clone(identity.name);
    }
    if (identity) {
      if (identity.sex) {
        kept.sex = identity.sex;
      }
      if (identity.dateOfBirth) {
        kept.dateOfBirth = identity.dateOfBirth;
      }
      if (identity.age) {
        kept.age = identity.age;
      }
      if (identity.citizenship) {
        kept.citizenship = identity.citizenship;
      }
      if (identity.ssn) {
        kept.ssn = identity.ssn;
      }
      if (identity.lexId) {
        kept.lexId = identity.lexId;
      }
      if (identity.caseRole) {
        kept.caseRole = identity.caseRole;
      }
    }
    state.people[kept.personId] = kept;
    writeDisk();
  }

  function objectExists(objectType, objectId) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    if (type === "PERSON") {
      return !!state.people[id];
    }
    if (type === "VEHICLE") {
      return !!state.vehicles[id];
    }
    if (type === "LOCATION") {
      return !!state.locations[id];
    }
    if (type === "BUSINESS") {
      return !!state.businesses[id];
    }
    if (type === "ENTITY") {
      return !!state.entities[id];
    }
    return false;
  }

  function objectIsReferenced(objectType, objectId, skip) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    skip = skip || {};
    if (!id) {
      return false;
    }
    var skipInv = skip.investigationId || "";
    var skipNode = skip.nodeId || "";
    var invIds = Object.keys(state.investigations);
    var i;
    var j;
    for (i = 0; i < invIds.length; i++) {
      var inv = state.investigations[invIds[i]];
      var nodes = (inv && inv.nodes) || [];
      for (j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (
          skipInv &&
          invIds[i] === skipInv &&
          node &&
          node.nodeId === skipNode
        ) {
          continue;
        }
        if (node && node.objectType === type && node.objectId === id) {
          return true;
        }
      }
    }
    var leadIds = Object.keys(state.leads);
    for (i = 0; i < leadIds.length; i++) {
      var lead = state.leads[leadIds[i]];
      if (!lead) {
        continue;
      }
      if (type === "PERSON") {
        if (lead.subjectPersonId === id) {
          return true;
        }
        if (lead.person && lead.person.personId === id) {
          return true;
        }
        var links = lead.links || [];
        for (j = 0; j < links.length; j++) {
          var link = links[j];
          if (
            (link.from && link.from.type === "PERSON" && link.from.id === id) ||
            (link.to && link.to.type === "PERSON" && link.to.id === id)
          ) {
            return true;
          }
        }
      }
      if (type === "VEHICLE") {
        var vehs = lead.vehicles || [];
        for (j = 0; j < vehs.length; j++) {
          if (vehs[j] && (vehs[j].vehicleId || vehs[j].id) === id) {
            return true;
          }
        }
      }
      if (type === "LOCATION") {
        var subject = model.subjectOf ? model.subjectOf(lead) : lead.person;
        var locs = (subject && subject.locations) || [];
        for (j = 0; j < locs.length; j++) {
          if (locs[j] && (locs[j].locationId || locs[j].id) === id) {
            return true;
          }
        }
      }
    }
    var encIds = Object.keys(state.encounters);
    for (i = 0; i < encIds.length; i++) {
      var enc = state.encounters[encIds[i]];
      if (!enc) {
        continue;
      }
      if (type === "PERSON") {
        var subjects = enc.subjects || [];
        for (j = 0; j < subjects.length; j++) {
          if (subjects[j] && subjects[j].personId === id) {
            return true;
          }
        }
      }
      if (type === "VEHICLE") {
        var eVeh = enc.vehicles || [];
        for (j = 0; j < eVeh.length; j++) {
          if (eVeh[j] && (eVeh[j].vehicleId || eVeh[j].id) === id) {
            return true;
          }
        }
      }
      if (type === "LOCATION") {
        var eLoc = enc.locations || [];
        for (j = 0; j < eLoc.length; j++) {
          if (eLoc[j] && (eLoc[j].locationId || eLoc[j].id) === id) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function overlayIdentityOnto(objectType, fromId, toId) {
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      var fromP = state.people[fromId];
      var toP = state.people[toId];
      if (!fromP || !toP) {
        return;
      }
      toP.name = toP.name || {};
      fromP.name = fromP.name || {};
      if (fromP.name.lastName) {
        toP.name.lastName = fromP.name.lastName;
      }
      if (fromP.name.firstName) {
        toP.name.firstName = fromP.name.firstName;
      }
      if (fromP.name.middleName) {
        toP.name.middleName = fromP.name.middleName;
      }
      if (fromP.sex) {
        toP.sex = fromP.sex;
      }
      if (fromP.dateOfBirth) {
        toP.dateOfBirth = fromP.dateOfBirth;
      }
      return;
    }
    if (type === "VEHICLE") {
      var fromV = state.vehicles[fromId];
      var toV = state.vehicles[toId];
      if (!fromV || !toV) {
        return;
      }
      [
        "licensePlate",
        "plate",
        "plateState",
        "vehicleYear",
        "vehicleMake",
        "vehicleModel",
        "vehicleColor",
        "vehicleBodyStyle",
        "vin",
        "registeredOwnerName"
      ].forEach(function (key) {
        if (fromV[key]) {
          toV[key] = fromV[key];
        }
      });
      return;
    }
    if (type === "LOCATION") {
      var fromL = state.locations[fromId];
      var toL = state.locations[toId];
      if (!fromL || !toL) {
        return;
      }
      ["street", "street2", "city", "state", "zip"].forEach(function (key) {
        if (fromL[key]) {
          toL[key] = fromL[key];
        }
      });
      return;
    }
    if (type === "BUSINESS") {
      var fromB = state.businesses[fromId];
      var toB = state.businesses[toId];
      if (!fromB || !toB) {
        return;
      }
      if (fromB.name) {
        toB.name = fromB.name;
      }
      if (fromB.phone) {
        toB.phone = fromB.phone;
      }
      return;
    }
    if (type === "ENTITY") {
      var fromE = state.entities[fromId];
      var toE = state.entities[toId];
      if (!fromE || !toE) {
        return;
      }
      if (fromE.name) {
        toE.name = fromE.name;
      }
      if (fromE.kind) {
        toE.kind = fromE.kind;
      }
    }
  }

  function dropUnreferencedObject(objectType, objectId, skip) {
    if (objectIsReferenced(objectType, objectId, skip)) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (type === "PERSON") {
      delete state.people[id];
    } else if (type === "VEHICLE") {
      delete state.vehicles[id];
    } else if (type === "LOCATION") {
      delete state.locations[id];
    } else if (type === "BUSINESS") {
      delete state.businesses[id];
    } else if (type === "ENTITY") {
      delete state.entities[id];
    } else {
      return false;
    }
    dropAssociationsForObject(type, id);
    if (root.media && typeof root.media.removeByOwner === "function") {
      root.media.removeByOwner({ type: type, id: id }).then(
        function () {},
        function () {}
      );
    }
    return true;
  }

  function investigationIntegrity(investigationId) {
    var blank = { ok: false, issues: [], investigationId: investigationId || "" };
    adoptDisk();
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.issues.push({ code: "missing-investigation" });
      return blank;
    }
    var seen = {};
    var issues = [];
    ((inv.nodes || [])).forEach(function (node) {
      if (!node) {
        return;
      }
      var key = objectKey(node.objectType, node.objectId);
      if (seen[key]) {
        issues.push({
          code: "duplicate-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
      seen[key] = true;
      if (!objectExists(node.objectType, node.objectId)) {
        issues.push({
          code: "dangling-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
    });
    ((inv.links || [])).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        issues.push({ code: "broken-link", linkId: (link && link.linkId) || "" });
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      if (!seen[fromKey] || !seen[toKey]) {
        issues.push({
          code: "link-missing-node",
          linkId: link.linkId || ""
        });
      }
      if (link.associationId) {
        var asoc = state.associations && state.associations[link.associationId];
        if (!asoc) {
          issues.push({
            code: "dangling-association",
            linkId: link.linkId || "",
            associationId: link.associationId
          });
        }
      }
    });
    return {
      ok: issues.length === 0,
      issues: issues,
      investigationId: investigationId
    };
  }

  function associationIntegrity() {
    adoptDisk();
    var issues = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        issues.push({ code: "broken-association", associationId: id });
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (reason && model.validateAssociationEnds) {
        var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
        if (!valid || !valid.ok) {
          issues.push({
            code: "invalid-reason",
            associationId: id,
            reason: reason
          });
        }
      }
      if (row.from.id && !objectExists(row.from.type, row.from.id)) {
        issues.push({
          code: "dangling-from",
          associationId: id,
          objectType: row.from.type,
          objectId: row.from.id
        });
      }
      if (row.to.id && !objectExists(row.to.type, row.to.id)) {
        issues.push({
          code: "dangling-to",
          associationId: id,
          objectType: row.to.type,
          objectId: row.to.id
        });
      }
    });
    return { ok: issues.length === 0, issues: issues };
  }

  function dropSelfLinks(inv) {
    if (!inv) {
      return;
    }
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return !(link.from.type === link.to.type && link.from.id === link.to.id);
    });
  }

  function collapseDuplicateNodes(inv, objectType, objectId) {
    if (!inv) {
      return;
    }
    var kept = null;
    ((inv.nodes || [])).forEach(function (node) {
      if (
        node &&
        node.objectType === objectType &&
        node.objectId === objectId &&
        !kept
      ) {
        kept = node;
      }
    });
    if (!kept) {
      return;
    }
    inv.nodes = (inv.nodes || []).filter(function (node) {
      if (!node) {
        return false;
      }
      if (
        node.objectType === objectType &&
        node.objectId === objectId &&
        node.nodeId !== kept.nodeId
      ) {
        if (inv.focusNodeId === node.nodeId) {
          inv.focusNodeId = kept.nodeId;
        }
        return false;
      }
      return true;
    });
  }

  function retargetObjectAcrossInvestigations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.investigations).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      ((inv.nodes || [])).forEach(function (node) {
        if (
          node &&
          node.objectType === objectType &&
          node.objectId === fromId
        ) {
          node.objectId = toId;
        }
      });
      rewriteInvestigationObjectId(inv, objectType, fromId, toId);
      if (objectType === "VEHICLE") {
        ((inv.plates || [])).forEach(function (plate) {
          if (plate && plate.vehicleId === fromId) {
            plate.vehicleId = toId;
          }
        });
      }
      collapseDuplicateNodes(inv, objectType, toId);
      dropSelfLinks(inv);
    });
    retargetAssociations(objectType, fromId, toId);
  }

  function rewriteInvestigationObjectId(inv, objectType, fromId, toId) {
    (inv.links || []).forEach(function (link) {
      if (!link) {
        return;
      }
      if (link.from && link.from.type === objectType && link.from.id === fromId) {
        link.from.id = toId;
      }
      if (link.to && link.to.type === objectType && link.to.id === fromId) {
        link.to.id = toId;
      }
    });
  }

  function retargetInvestigationNode(inv, node, nextId) {
    var oldId = node.objectId;
    if (!nextId || nextId === oldId) {
      return node.nodeId;
    }
    var existing = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].nodeId !== node.nodeId &&
        inv.nodes[i].objectType === node.objectType &&
        inv.nodes[i].objectId === nextId
      ) {
        existing = inv.nodes[i];
        break;
      }
    }
    rewriteInvestigationObjectId(inv, node.objectType, oldId, nextId);
    if (existing) {
      inv.nodes = inv.nodes.filter(function (row) {
        return row && row.nodeId !== node.nodeId;
      });
      if (inv.focusNodeId === node.nodeId) {
        inv.focusNodeId = existing.nodeId;
      }
      return existing.nodeId;
    }
    node.objectId = nextId;
    return node.nodeId;
  }

  function reuseInvestigationIdentity(investigationId, nodeId) {
    var blank = { ok: false, reused: false, objectId: "", nodeId: nodeId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Object not found on this investigation.";
      return blank;
    }
    var other = null;
    if (node.objectType === "VEHICLE") {
      var vehicle = getVehicleRecord(node.objectId);
      other =
        vehicle &&
        findVehicleByPlate(
          vehicle.plateState || "",
          vehicle.licensePlate || vehicle.plate || "",
          node.objectId
        );
      if (!other && vehicle) {
        other = restoreJunkedRecord(
          "VEHICLE",
          findVehicleByPlate(
            vehicle.plateState || "",
            vehicle.licensePlate || vehicle.plate || "",
            node.objectId,
            true
          )
        );
      }
      if (other) {
        other = { id: other.vehicleId || other.id };
      }
    } else if (node.objectType === "PERSON") {
      var person = getPerson(node.objectId);
      var match = person && findPersonByName(person.name, node.objectId);
      if (!match && person) {
        match = restoreJunkedRecord(
          "PERSON",
          findPersonByName(person.name, node.objectId, true)
        );
      }
      if (match) {
        other = { id: match.personId };
      }
    } else if (node.objectType === "LOCATION") {
      var loc = getLocationRecord(node.objectId);
      var locMatch = loc && findLocationByAddress(loc, node.objectId);
      if (!locMatch && loc) {
        locMatch = restoreJunkedRecord(
          "LOCATION",
          findLocationByAddress(loc, node.objectId, true)
        );
      }
      if (locMatch) {
        other = { id: locMatch.locationId || locMatch.id };
      }
    } else if (node.objectType === "BUSINESS") {
      var biz = getBusinessRecord(node.objectId);
      var bizMatch = biz && findBusinessByName(biz.name, node.objectId);
      if (!bizMatch && biz) {
        bizMatch = restoreJunkedRecord(
          "BUSINESS",
          findBusinessByName(biz.name, node.objectId, true)
        );
      }
      if (bizMatch) {
        other = { id: bizMatch.businessId || bizMatch.id };
      }
    } else if (node.objectType === "ENTITY") {
      var ent = getEntityRecord(node.objectId);
      var entMatch = ent && findEntityByName(ent.name, node.objectId);
      if (!entMatch && ent) {
        entMatch = restoreJunkedRecord(
          "ENTITY",
          findEntityByName(ent.name, node.objectId, true)
        );
      }
      if (entMatch) {
        other = { id: entMatch.entityId || entMatch.id };
      }
    }
    if (!other || !other.id) {
      return {
        ok: true,
        reused: false,
        objectId: node.objectId,
        nodeId: node.nodeId,
        error: ""
      };
    }
    var abandonedId = node.objectId;
    var abandonedType = node.objectType;
    var keptId = retargetInvestigationNode(inv, node, other.id);
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not reuse that object.";
      return blank;
    }
    overlayIdentityOnto(abandonedType, abandonedId, other.id);
    retargetObjectAcrossInvestigations(abandonedType, abandonedId, other.id);
    dropUnreferencedObject(abandonedType, abandonedId);
    writeDisk();
    return {
      ok: true,
      reused: true,
      objectId: other.id,
      nodeId: keptId,
      error: ""
    };
  }

  function disconnectInvestigationLink(investigationId, linkId) {
    var blank = { ok: false, linkId: linkId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return row && row.linkId !== linkId;
    });
    if (inv.links.length === before) {
      blank.error = "Link not found.";
      return blank;
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return { ok: true, linkId: linkId, error: "" };
  }

  function associateInvestigationObject(investigationId, hostNodeId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      personId: "",
      nodeId: "",
      associationId: "",
      reused: false,
      placed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var host = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === hostNodeId) {
        host = inv.nodes[i];
        break;
      }
    }
    if (!host) {
      blank.error = "Focus an object first.";
      return blank;
    }
    var objectType = String(
      input.objectType || (input.personId ? "PERSON" : "") || "PERSON"
    ).toUpperCase();
    var objectId = input.objectId || input.personId || "";
    var label = String(input.label || input.name || "").trim();
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE") {
        var plateBits = parsePlateLabel(label);
        if (!plateBits.plate) {
          blank.error = "Type a plate.";
          return blank;
        }
      } else if (objectType === "LOCATION") {
        var addr = parseAddressLabel(label);
        if (!addr.street && !addr.city) {
          blank.error = "Type a street or city.";
          return blank;
        }
      } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
        if (!label) {
          blank.error = "Type a name.";
          return blank;
        }
      } else {
        blank.error = "Pick an object type.";
        return blank;
      }
    }
    var reason = String(input.reason || "").trim();
    if (!reason && objectType === "PERSON" && model.defaultPersonAssociationReason) {
      reason = model.defaultPersonAssociationReason(host.objectType);
    }
    if (
      !reason &&
      ((host.objectType === "PERSON" && objectType === "BUSINESS") ||
        (host.objectType === "BUSINESS" && objectType === "PERSON"))
    ) {
      reason = "CUSTOMER_OF";
    }
    if (!reason) {
      reason = defaultInvestigationReason(host.objectType, objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var already = null;
    if (objectId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (
          inv.nodes[i] &&
          inv.nodes[i].objectType === objectType &&
          inv.nodes[i].objectId === objectId
        ) {
          already = inv.nodes[i];
          break;
        }
      }
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      fromNodeId: host.nodeId,
      reason: reason,
      x: Number(host.x || 0) + 300,
      y: Number(host.y || 0),
      focus: false
    };
    if (objectType === "PERSON") {
      payload.name = input.name || label;
      payload.label = label;
    } else if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    } else if (objectType === "LOCATION") {
      var loc = parseAddressLabel(label);
      payload.street = loc.street;
      payload.city = loc.city;
      payload.state = loc.state;
      payload.zip = loc.zip;
    } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
      payload.name = label;
    }
    var result = addInvestigationObject(investigationId, payload);
    if (!result || !result.ok) {
      blank.error = (result && result.error) || "Could not add that object.";
      return blank;
    }
    if (
      ((host.objectType === "VEHICLE" && objectType === "PERSON") ||
        (host.objectType === "PERSON" && objectType === "VEHICLE")) &&
      reason === "REGISTERED_OWNER_OF"
    ) {
      var vehicleId = host.objectType === "VEHICLE" ? host.objectId : result.objectId;
      var personId = host.objectType === "PERSON" ? host.objectId : result.objectId;
      var vehicle = getVehicleRecord(vehicleId);
      if (vehicle && !String(vehicle.registeredOwnerName || "").trim()) {
        vehicle.registeredOwnerName = investigationObjectLabel("PERSON", personId);
        saveVehicleRecord(vehicle, { mode: "commit" });
      }
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: result.objectId,
      personId: objectType === "PERSON" ? result.objectId : "",
      nodeId: result.nodeId,
      associationId: result.associationId || "",
      reused: !!result.reused,
      placed: !already,
      error: ""
    };
  }

  function associateInvestigationPerson(investigationId, hostNodeId, input) {
    input = input || {};
    input.objectType = "PERSON";
    if (input.personId && !input.objectId) {
      input.objectId = input.personId;
    }
    return associateInvestigationObject(investigationId, hostNodeId, input);
  }

  function listObjects(objectType, includeJunked) {
    adoptDisk();
    var type = String(objectType || "").toUpperCase();
    var map = null;
    var idKey = "";
    if (type === "PERSON") {
      map = state.people;
      idKey = "personId";
    } else if (type === "VEHICLE") {
      map = state.vehicles;
      idKey = "vehicleId";
    } else if (type === "LOCATION") {
      map = state.locations;
      idKey = "locationId";
    } else if (type === "BUSINESS") {
      map = state.businesses;
      idKey = "businessId";
    } else if (type === "ENTITY") {
      map = state.entities;
      idKey = "entityId";
    }
    if (!map) {
      return [];
    }
    var out = [];
    Object.keys(map).forEach(function (id) {
      var row = map[id];
      if (!row) {
        return;
      }
      if (!includeJunked && isJunked(row)) {
        return;
      }
      var copy = clone(row);
      if (!copy[idKey]) {
        copy[idKey] = id;
      }
      out.push(copy);
    });
    return out;
  }

  function associateCaseObject(leadId, input) {
    input = input || {};
    var blank = {
      ok: false,
      leadId: leadId || "",
      objectType: "",
      objectId: "",
      associationId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var personId = (person && person.personId) || lead.subjectPersonId || "";
    if (!personId) {
      blank.error = "Case has no subject.";
      return blank;
    }
    var objectType = String(input.objectType || "PERSON").toUpperCase();
    var objectId = String(input.objectId || input.personId || "").trim();
    var label = String(input.label || input.name || "").trim();
    var notes = String(input.notes || "").trim();
    var reason = String(input.reason || "").trim();
    if (objectType === "OTHER") {
      if (!label) {
        blank.error = "Enter a name.";
        return blank;
      }
      lead.links = Array.isArray(lead.links) ? lead.links : [];
      var otherLink = model.createLink
        ? model.createLink({
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          })
        : {
            linkId: model.newId("link"),
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          };
      if (input.linkId) {
        otherLink.linkId = input.linkId;
      }
      var replaced = false;
      var i;
      for (i = 0; i < lead.links.length; i++) {
        if (lead.links[i] && lead.links[i].linkId === otherLink.linkId) {
          lead.links[i] = otherLink;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        lead.links.push(otherLink);
      }
      var savedOther = saveLead(lead, {
        mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
      });
      if (!savedOther.ok) {
        blank.error = savedOther.error || "Could not save.";
        return blank;
      }
      return {
        ok: true,
        leadId: lead.leadId,
        objectType: "OTHER",
        objectId: "",
        associationId: "",
        linkId: otherLink.linkId,
        reused: false,
        error: ""
      };
    }
    if (!reason) {
      if (objectType === "PERSON" && model.defaultPersonAssociationReason) {
        reason = model.defaultPersonAssociationReason("PERSON");
      }
      if (!reason && objectType === "BUSINESS") {
        reason = "CUSTOMER_OF";
      }
      if (!reason) {
        reason = defaultInvestigationReason("PERSON", objectType);
      }
    }
    if (!reason) {
      blank.error = "Pick a relationship.";
      return blank;
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      label: label,
      name: input.name || label
    };
    if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    }
    if (objectType === "LOCATION") {
      var addr = parseAddressLabel(label);
      payload.street = addr.street;
      payload.city = addr.city;
      payload.state = addr.state;
      payload.zip = addr.zip;
    }
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE" && !payload.licensePlate) {
        blank.error = "Type a plate.";
        return blank;
      } else if (objectType === "LOCATION" && !payload.street && !payload.city) {
        blank.error = "Type a street or city.";
        return blank;
      } else if (
        (objectType === "BUSINESS" || objectType === "ENTITY") &&
        !label
      ) {
        blank.error = "Type a name.";
        return blank;
      }
    }
    var resolved = resolveInvestigationAddObject(objectType, payload);
    if (!resolved || !resolved.ok) {
      blank.error = (resolved && resolved.error) || "Could not save that object.";
      return blank;
    }
    objectId = resolved.objectId;
    var asoc = upsertAssociation(
      {
        from: { type: "PERSON", id: personId },
        to: { type: objectType, id: objectId },
        reason: reason,
        notes: notes,
        label: investigationObjectLabel(objectType, objectId),
        source: { leadId: lead.leadId }
      },
      { skipAdopt: true, persist: true }
    );
    if (!asoc || !asoc.ok) {
      blank.error = (asoc && asoc.error) || "Could not save the association.";
      return blank;
    }
    lead = state.leads[leadId] ? clone(state.leads[leadId]) : lead;
    lead.links = Array.isArray(lead.links) ? lead.links : [];
    var link = null;
    for (i = 0; i < lead.links.length; i++) {
      var row = lead.links[i];
      if (!row) {
        continue;
      }
      if (input.linkId && row.linkId === input.linkId) {
        link = row;
        break;
      }
      if (row.associationId && row.associationId === asoc.associationId) {
        link = row;
        break;
      }
    }
    var display = investigationObjectLabel(objectType, objectId);
    if (!link) {
      link = model.createLink
        ? model.createLink({
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          })
        : {
            linkId: model.newId("link"),
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          };
      if (input.linkId) {
        link.linkId = input.linkId;
      }
      lead.links.push(link);
    } else {
      link.to = { type: objectType, id: objectId };
      link.otherType = objectType;
      link.reasons = [reason];
      link.notes = notes;
      link.label = display;
      link.associationId = asoc.associationId;
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      objectType: objectType,
      objectId: objectId,
      associationId: asoc.associationId,
      linkId: link.linkId,
      reused: !!resolved.reused,
      error: ""
    };
  }

  function removeCaseLink(leadId, linkId) {
    var blank = {
      ok: false,
      leadId: leadId || "",
      linkId: linkId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var before = (lead.links || []).length;
    lead.links = (lead.links || []).filter(function (row) {
      return !row || row.linkId !== linkId;
    });
    if (lead.links.length === before) {
      return {
        ok: true,
        leadId: lead.leadId,
        linkId: linkId || "",
        removed: false,
        error: ""
      };
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      linkId: linkId,
      removed: true,
      error: ""
    };
  }

  function setInvestigationAssociationReason(investigationId, associationId, reason) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      error: ""
    };
    var changed = setAssociationReason(associationId, reason);
    if (!changed.ok) {
      return changed;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return { ok: true, associationId: associationId, error: "" };
    }
    var asoc = state.associations[associationId];
    var nextReason = (asoc && asoc.reason) || reason;
    (inv.links || []).forEach(function (link) {
      if (!link || link.associationId !== associationId) {
        return;
      }
      link.reasons = [nextReason];
      if (asoc && asoc.from && asoc.to) {
        link.from = { type: asoc.from.type, id: asoc.from.id };
        link.to = { type: asoc.to.type, id: asoc.to.id };
      }
    });
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not update the link.";
      return blank;
    }
    return { ok: true, associationId: associationId, error: "" };
  }

  function disconnectInvestigationAssociation(investigationId, associationId) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return !row || row.associationId !== associationId;
    });
    if (inv.links.length === before) {
      return {
        ok: true,
        associationId: associationId,
        removed: false,
        error: ""
      };
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return {
      ok: true,
      associationId: associationId,
      removed: true,
      error: ""
    };
  }

  function stripObjectFromInvestigation(inv, objectType, objectId) {
    var key = objectKey(objectType, objectId);
    var dropped = {};
    inv.nodes = (inv.nodes || []).filter(function (row) {
      if (row && row.objectType === objectType && row.objectId === objectId) {
        dropped[row.nodeId] = true;
        return false;
      }
      return !!row;
    });
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return (
        objectKey(link.from.type, link.from.id) !== key &&
        objectKey(link.to.type, link.to.id) !== key
      );
    });
    if (String(objectType || "").toUpperCase() === "VEHICLE") {
      (inv.plates || []).forEach(function (plate) {
        if (
          plate &&
          plate.vehicleId === objectId &&
          plate.status === "promoted"
        ) {
          plate.status = "hit";
        }
      });
    }
    if (dropped[inv.focusNodeId]) {
      inv.focusNodeId = "";
    }
    return Object.keys(dropped).length;
  }

  function objectIsCaseSubject(objectId) {
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    var leadIds = Object.keys(state.leads);
    var i;
    for (i = 0; i < leadIds.length; i++) {
      var lead = state.leads[leadIds[i]];
      if (lead && (lead.subjectPersonId === id || (lead.person && lead.person.personId === id))) {
        return true;
      }
    }
    return false;
  }

  function setRecordJunked(objectType, objectId, junked) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    var rec = null;
    if (type === "PERSON") {
      rec = state.people[id];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[id];
    } else if (type === "LOCATION") {
      rec = state.locations[id];
    } else if (type === "BUSINESS") {
      rec = state.businesses[id];
    } else if (type === "ENTITY") {
      rec = state.entities[id];
    }
    if (!rec) {
      return false;
    }
    rec.junked = !!junked;
    rec.junkedAt = junked ? model.nowIso() : "";
    return true;
  }

  /**
   * Drop a node from this investigation wall. Keeps the shared
   * person/vehicle/location/business/entity. Drops links on this
   * investigation only. Promoted plates for a removed vehicle return to hit.
   */
  function removeInvestigationObject(investigationId, nodeId) {
    var blank = {
      ok: false,
      nodeId: nodeId || "",
      objectType: "",
      objectId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var wanted = String(nodeId || "").trim();
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === wanted) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to remove it from the wall.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Removed " + label + " from the wall.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove that object.";
      return blank;
    }
    return {
      ok: true,
      nodeId: node.nodeId,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  /**
   * Empty this investigation's wall and plate queue.
   * Does not delete people/vehicles/locations/businesses/entities.
   * Does not change child or parent investigations.
   */
  function clearInvestigationWorkspace(investigationId) {
    var blank = {
      ok: false,
      investigationId: investigationId || "",
      cleared: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var nodeCount = (inv.nodes || []).length;
    var linkCount = (inv.links || []).length;
    var plateCount = (inv.plates || []).length;
    if (!nodeCount && !linkCount && !plateCount && !inv.focusNodeId) {
      return {
        ok: true,
        investigationId: inv.investigationId,
        cleared: false,
        error: ""
      };
    }
    inv.nodes = [];
    inv.links = [];
    inv.plates = [];
    inv.focusNodeId = "";
    appendSystemNote(inv, "Cleared the workspace.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not clear the workspace.";
      return blank;
    }
    return {
      ok: true,
      investigationId: inv.investigationId,
      cleared: true,
      error: ""
    };
  }

  function objectDisposition(objectType, objectId, skip) {
    adoptDisk();
    var rec = null;
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      rec = state.people[objectId];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[objectId];
    } else if (type === "LOCATION") {
      rec = state.locations[objectId];
    } else if (type === "BUSINESS") {
      rec = state.businesses[objectId];
    } else if (type === "ENTITY") {
      rec = state.entities[objectId];
    }
    var caseSubject = type === "PERSON" && objectIsCaseSubject(objectId);
    var referenced = objectIsReferenced(objectType, objectId, skip);
    return {
      junked: isJunked(rec),
      caseSubject: caseSubject,
      referenced: referenced,
      canJunk: !!rec && !isJunked(rec) && !caseSubject,
      canDelete: !!rec && !caseSubject && !referenced
    };
  }

  function junkInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to junk it.";
      return blank;
    }
    if (node.objectType === "PERSON" && objectIsCaseSubject(node.objectId)) {
      blank.error = "Cannot junk a person who is a case subject.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    if (!setRecordJunked(node.objectType, node.objectId, true)) {
      blank.error = "Record not found.";
      return blank;
    }
    setAssociationsJunkedForObject(node.objectType, node.objectId, true);
    Object.keys(state.investigations).forEach(function (id) {
      var row = id === investigationId ? inv : clone(state.investigations[id]);
      stripObjectFromInvestigation(row, node.objectType, node.objectId);
      if (id === investigationId) {
        appendSystemNote(row, "Junked " + label + ".");
      }
      state.investigations[id] = row;
    });
    writeDisk();
    return {
      ok: true,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  function deleteInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to delete it.";
      return blank;
    }
    if (node.objectType === "PERSON" && objectIsCaseSubject(node.objectId)) {
      blank.error = "Cannot delete a person who is a case subject.";
      return blank;
    }
    if (
      objectIsReferenced(node.objectType, node.objectId, {
        investigationId: inv.investigationId,
        nodeId: node.nodeId
      })
    ) {
      blank.objectType = node.objectType;
      blank.objectId = node.objectId;
      blank.error = "Cannot delete: this record is still on another wall or a case. Junk it, or remove it from other walls first.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Deleted " + label + ".");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not update the investigation.";
      return blank;
    }
    dropUnreferencedObject(node.objectType, node.objectId);
    writeDisk();
    return {
      ok: true,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  function objectKey(type, id) {
    return String(type || "") + "|" + String(id || "");
  }

  function spawnInvestigation(parentId, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      investigationId: "",
      parentInvestigationId: parentId || "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var parent = state.investigations[parentId]
      ? clone(state.investigations[parentId])
      : null;
    if (!parent) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var focus = null;
    var i;
    for (i = 0; i < (parent.nodes || []).length; i++) {
      if (parent.nodes[i] && parent.nodes[i].nodeId === parent.focusNodeId) {
        focus = parent.nodes[i];
        break;
      }
    }
    if (!focus) {
      blank.error = "Focus an object to spawn a child investigation.";
      return blank;
    }
    var seed = {};
    seed[objectKey(focus.objectType, focus.objectId)] = true;
    (parent.links || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      var focusKey = objectKey(focus.objectType, focus.objectId);
      if (fromKey === focusKey) {
        seed[toKey] = true;
      }
      if (toKey === focusKey) {
        seed[fromKey] = true;
      }
    });
    var nodes = [];
    var focusNodeId = "";
    (parent.nodes || []).forEach(function (row) {
      if (!row || !seed[objectKey(row.objectType, row.objectId)]) {
        return;
      }
      var node = model.createInvestigationNode
        ? model.createInvestigationNode({
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          })
        : {
            nodeId: model.newId("node"),
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          };
      nodes.push(node);
      if (
        row.objectType === focus.objectType &&
        row.objectId === focus.objectId
      ) {
        focusNodeId = node.nodeId;
      }
    });
    var links = [];
    (parent.links || []).forEach(function (row) {
      if (!row || !row.from || !row.to) {
        return;
      }
      if (!seed[objectKey(row.from.type, row.from.id)]) {
        return;
      }
      if (!seed[objectKey(row.to.type, row.to.id)]) {
        return;
      }
      var link = model.createLink
        ? model.createLink({
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type,
            associationId: row.associationId || ""
          })
        : {
            linkId: model.newId("link"),
            associationId: row.associationId || "",
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type
          };
      if (!link.associationId) {
        citeWallAssociation(
          link,
          row.from.type,
          row.from.id,
          row.to.type,
          row.to.id,
          (row.reasons && row.reasons[0]) || row.reason || "",
          parent.investigationId
        );
      }
      links.push(link);
    });
    var kind = opts.kind || parent.kind || "tag";
    var child = model.createInvestigation
      ? model.createInvestigation({
          kind: kind,
          mode: opts.mode || (kind === "tag" ? parent.mode : "") || "",
          team: parent.team,
          parentInvestigationId: parent.investigationId,
          sourceLeadId: parent.sourceLeadId || "",
          assignedOfficerId: parent.assignedOfficerId || "",
          title:
            opts.title != null
              ? opts.title
              : investigationObjectLabel(focus.objectType, focus.objectId),
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          existingIds: Object.keys(state.investigations)
        })
      : {
          investigationId: model.newId("inv"),
          parentInvestigationId: parent.investigationId,
          kind: kind,
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          history: []
        };
    var label = investigationObjectLabel(focus.objectType, focus.objectId);
    appendSystemNote(
      child,
      "Spawned from " + parent.investigationId + " focusing " + label + "."
    );
    var savedChild = saveInvestigation(child, { mode: "draft" });
    if (!savedChild.ok) {
      blank.error = savedChild.error || "Could not save the child investigation.";
      return blank;
    }
    appendSystemNote(
      parent,
      "Spawned child " + child.investigationId + " focusing " + label + "."
    );
    saveInvestigation(parent, {
      mode: model.isCommitted && model.isCommitted(parent) ? "commit" : "draft"
    });
    return {
      ok: true,
      investigationId: child.investigationId,
      parentInvestigationId: parent.investigationId,
      nodeCount: nodes.length,
      error: ""
    };
  }

  function promoteInvestigationPlate(investigationId, plateId, opts) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: "", nodeId: "", error: fresh.error };
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Investigation not found."
      };
    }
    var plate = null;
    var i;
    for (i = 0; i < (inv.plates || []).length; i++) {
      if (inv.plates[i] && inv.plates[i].plateId === plateId) {
        plate = inv.plates[i];
        break;
      }
    }
    if (!plate) {
      return { ok: false, vehicleId: "", nodeId: "", error: "Plate not found." };
    }
    if (plate.status === "discarded") {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Discarded plates cannot be promoted."
      };
    }
    var vehicle = plate.vehicleId ? getVehicleRecord(plate.vehicleId) : null;
    if (!vehicle) {
      vehicle = findVehicleByPlate(plate.state, plate.plate);
    }
    if (!vehicle) {
      vehicle = model.createVehicle
        ? model.createVehicle({
            licensePlate: plate.plate,
            plate: plate.plate,
            plateState: plate.state || "",
            governmentVehicle: false
          })
        : {
            vehicleId: model.newId("veh"),
            licensePlate: plate.plate,
            plateState: plate.state || ""
          };
      var savedVeh = saveVehicleRecord(vehicle, { mode: "commit" });
      if (!savedVeh.ok) {
        return {
          ok: false,
          vehicleId: "",
          nodeId: "",
          error: savedVeh.error || "Could not save the vehicle."
        };
      }
      vehicle = getVehicleRecord(savedVeh.vehicleId);
    }
    var vehicleId = vehicle.vehicleId || vehicle.id;
    opts = opts || {};
    var node = ensureInvestigationNode(inv, "VEHICLE", vehicleId, {
      x: typeof opts.x === "number" ? opts.x : undefined,
      y: typeof opts.y === "number" ? opts.y : undefined
    });
    if (typeof opts.x === "number") {
      node.x = opts.x;
    } else if (typeof node.x !== "number") {
      node.x = 48;
    }
    if (typeof opts.y === "number") {
      node.y = opts.y;
    } else if (typeof node.y !== "number") {
      node.y = 48;
    }
    plate.status = "promoted";
    plate.vehicleId = vehicleId;
    inv.focusNodeId = node.nodeId;
    var plateLabel = [plate.state, plate.plate].filter(Boolean).join(" ");
    appendSystemNote(inv, "Promoted plate " + plateLabel + " to a vehicle.");
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        vehicleId: vehicleId,
        nodeId: node.nodeId,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      vehicleId: vehicleId,
      nodeId: node.nodeId,
      existing: Boolean(plate.vehicleId && plate.status === "promoted"),
      error: ""
    };
  }

  function listEncounters() {
    return Object.keys(state.encounters)
      .map(function (id) {
        var row = state.encounters[id];
        return {
          encounterId: id,
          startedAt: row.startedAt || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed",
          subjects: (row.subjects || []).slice(),
          vehicles: (row.vehicles || []).slice(),
          locations: (row.locations || []).slice()
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  model.store = {
    STORAGE_KEY: STORAGE_KEY,
    loadFromDisk: loadFromDisk,
    saveLead: saveLead,
    getLead: getLead,
    listLeads: listLeads,
    relatedCommittedCases: relatedCommittedCases,
    promoteAssociateToCase: promoteAssociateToCase,
    promoteInvestigationPersonToCase: promoteInvestigationPersonToCase,
    promoteBookInToLead: promoteBookInToLead,
    allPeople: allPeople,
    getPerson: getPerson,
    upsertPerson: upsertPerson,
    saveEncounter: saveEncounter,
    getEncounter: getEncounter,
    deleteEncounter: deleteEncounter,
    listEncounters: listEncounters,
    saveInvestigation: saveInvestigation,
    getInvestigation: getInvestigation,
    listInvestigations: listInvestigations,
    deleteInvestigation: deleteInvestigation,
    saveVehicleRecord: saveVehicleRecord,
    getVehicleRecord: getVehicleRecord,
    findVehicleByPlate: findVehicleByPlate,
    saveLocationRecord: saveLocationRecord,
    getLocationRecord: getLocationRecord,
    findLocationByAddress: findLocationByAddress,
    saveBusinessRecord: saveBusinessRecord,
    getBusinessRecord: getBusinessRecord,
    findBusinessByName: findBusinessByName,
    saveEntityRecord: saveEntityRecord,
    getEntityRecord: getEntityRecord,
    findEntityByName: findEntityByName,
    findPersonByName: findPersonByName,
    promoteInvestigationPlate: promoteInvestigationPlate,
    addInvestigationObject: addInvestigationObject,
    connectInvestigationNodes: connectInvestigationNodes,
    upsertAssociation: upsertAssociation,
    getAssociation: getAssociation,
    associationsFor: associationsFor,
    occupancyFor: occupancyFor,
    setAssociationReason: setAssociationReason,
    associationIntegrity: associationIntegrity,
    reuseInvestigationIdentity: reuseInvestigationIdentity,
    disconnectInvestigationLink: disconnectInvestigationLink,
    associateInvestigationPerson: associateInvestigationPerson,
    associateInvestigationObject: associateInvestigationObject,
    associateCaseObject: associateCaseObject,
    dropAssociation: dropAssociation,
    removeCaseLink: removeCaseLink,
    listObjects: listObjects,
    setInvestigationAssociationReason: setInvestigationAssociationReason,
    disconnectInvestigationAssociation: disconnectInvestigationAssociation,
    removeInvestigationObject: removeInvestigationObject,
    clearInvestigationWorkspace: clearInvestigationWorkspace,
    junkInvestigationObject: junkInvestigationObject,
    deleteInvestigationObject: deleteInvestigationObject,
    objectDisposition: objectDisposition,
    isJunked: isJunked,
    investigationIntegrity: investigationIntegrity,
    spawnInvestigation: spawnInvestigation,
    listRelatedInvestigations: function (investigationId) {
      adoptDisk();
      var inv = state.investigations[investigationId];
      if (!inv) {
        return [];
      }
      var out = [];
      if (
        inv.parentInvestigationId &&
        state.investigations[inv.parentInvestigationId]
      ) {
        out.push(clone(state.investigations[inv.parentInvestigationId]));
      }
      Object.keys(state.investigations).forEach(function (id) {
        var row = state.investigations[id];
        if (row && row.parentInvestigationId === investigationId) {
          out.push(clone(row));
        }
      });
      return out;
    },
    getCurrentLeadId: function () {
      return state.currentLeadId || "";
    },
    setCurrentLeadId: function (leadId) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        return;
      }
      state.currentLeadId = leadId || "";
      if (!writeDisk()) {
        adoptDisk();
      }
    },
    getState: function () {
      return clone(state);
    },
    diskError: function () {
      return diskError;
    }
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      adoptDisk();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
