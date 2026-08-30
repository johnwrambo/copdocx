/**
 * Lead — one case file (a "snapshot").
 *
 * Fed by: the whole Lead Entry form on Save.
 * Holds: the subject person, their vehicles, and explicit links.
 * Feeds: localStorage (store.js), Open, Download JSON, the map page.
 *
 * Empty is legal. Nothing is required to save.
 *
 * Shape you can read top to bottom:
 *   lead.person              the subject
 *   lead.person.locations[]  residence / work
 *   lead.vehicles[]          each car owns its own locations[]
 *   lead.links[]             explicit "this person ↔ that vehicle" facts
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  model.SCHEMA = "copdocx.lead.v1";
  model.STORE_SCHEMA = "copdocx.store.v1";
  model.CASE_ROLES = ["LEAD", "TARGET", "DETAINEE"];

  var nowIso = model.nowIso;
  var newId = model.newId;
  var assign = model.assign;

  function createSource(extra) {
    return assign(
      {
        leadSource: "",
        caseNumber: "",
        refAgency: "",
        refAgencyCode: "",
        probationCheck: false,
        leadInfo: ""
      },
      extra
    );
  }

  /** A new blank case. The subject person exists even when every field is empty. */
  function createLead(extra) {
    var person = model.createPerson
      ? model.createPerson({ caseRole: "LEAD" })
      : { personId: newId("p"), caseRole: "LEAD", locations: [] };
    var created = nowIso();
    return assign(
      {
        schema: model.SCHEMA,
        leadId: newId("lead"),
        subjectPersonId: person.personId,
        caseRole: "LEAD",
        source: createSource(),
        person: person,
        vehicles: [],
        links: [],
        followUps: [],
        meta: {
          createdAt: created,
          updatedAt: created,
          markedComplete: false,
          status: "draft",
          committedAt: ""
        }
      },
      extra
    );
  }

  function subjectOf(snapshot) {
    if (!snapshot) {
      return null;
    }
    if (snapshot.person && snapshot.person.personId) {
      return snapshot.person;
    }
    var people = snapshot.people || [];
    var i;
    for (i = 0; i < people.length; i++) {
      if (people[i].personId === snapshot.subjectPersonId) {
        return people[i];
      }
    }
    return people[0] || null;
  }

  model.createSource = createSource;
  model.createLead = createLead;
  model.createLeadSnapshot = createLead;
  model.subjectOf = subjectOf;
})(typeof window !== "undefined" ? window : globalThis);
