/**
 * Person — a human in the case.
 *
 * Fed by: Lead Information card, plus alias / document / crime / immigration
 *         cards that belong to the subject.
 * Owns: locations[] (residence, work). Not plate-check — that belongs to a vehicle.
 * Feeds: Save snapshot.person, the people registry (so you can link later),
 *        baseball card name/age, map pin labels.
 *
 * "Lead", "target", and "detainee" are caseRole on the SAME personId.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function blankName() {
    return { lastName: "", firstName: "", middleName: "" };
  }

  function createPerson(extra) {
    return model.assign(
      {
        personId: model.newId("p"),
        entityType: "PERSON",
        caseRole: "",
        name: blankName(),
        sex: "",
        dateOfBirth: "",
        age: "",
        citizenship: "",
        ssn: "",
        locations: [],
        aliases: [],
        documents: [],
        criminal: {
          isCriminal: false,
          fbiNumber: "",
          ncicNumber: "",
          stateId: "",
          rapSheet: ""
        },
        encounters: [],
        arrests: [],
        convictions: [],
        warrants: [],
        immigration: {
          alienNumber: "",
          finNumber: "",
          disposition: "",
          status: "",
          finalOrder: false,
          finalOrderDate: ""
        }
      },
      extra
    );
  }

  function createAlias(extra) {
    return model.assign(
      {
        aliasId: model.newId("als"),
        lastName: "",
        firstName: "",
        middleName: ""
      },
      extra
    );
  }

  function createDocument(extra) {
    return model.assign(
      {
        documentId: model.newId("doc"),
        documentType: "",
        documentNumber: "",
        issuingState: "",
        issuingCountry: "",
        documentIssueDate: "",
        documentExpiration: ""
      },
      extra
    );
  }

  function createEncounter(extra) {
    return model.assign(
      {
        encounterId: model.newId("enc"),
        encounterDate: "",
        encounterRole: "",
        encounterType: "",
        encounterDisposition: "",
        encounterAgency: "",
        encounterAgencyCode: "",
        encounterReportNumber: "",
        encounterLocation: "",
        encounterNarrative: ""
      },
      extra
    );
  }

  function createArrest(extra) {
    return model.assign(
      {
        arrestId: model.newId("arr"),
        arrestDate: "",
        arrestCharge: "",
        arrestStatute: "",
        arrestClass: "",
        arrestAgency: "",
        arrestAgencyCode: "",
        arrestLocation: ""
      },
      extra
    );
  }

  function createConviction(extra) {
    return model.assign(
      {
        convictionId: model.newId("cnv"),
        crime: "",
        convictionStatute: "",
        convictionClass: "",
        disposition: "",
        convictionDate: "",
        dispositionDate: "",
        court: "",
        docketNumber: "",
        sentence: ""
      },
      extra
    );
  }

  function createWarrant(extra) {
    return model.assign(
      {
        warrantId: model.newId("wnt"),
        charge: "",
        warrantNumber: "",
        warrantDate: "",
        warrantStatus: "",
        warrantIssuer: "",
        warrantIssuerCode: ""
      },
      extra
    );
  }

  function formatPersonLabel(person) {
    if (!person) {
      return "";
    }
    var name = person.name || person;
    var last = String(name.lastName || "").trim();
    var first = String(name.firstName || "").trim();
    var middle = String(name.middleName || "").trim();
    if (last && first) {
      return last + ", " + first + (middle ? " " + middle : "");
    }
    return [first, middle, last].filter(Boolean).join(" ");
  }

  function isBlankPerson(person) {
    if (!person) {
      return true;
    }
    return !formatPersonLabel(person) && !person.dateOfBirth && !person.sex;
  }

  model.createPerson = createPerson;
  model.createAlias = createAlias;
  model.createDocument = createDocument;
  model.createEncounter = createEncounter;
  model.createArrest = createArrest;
  model.createConviction = createConviction;
  model.createWarrant = createWarrant;
  model.formatPersonLabel = formatPersonLabel;
  model.isBlankPerson = isBlankPerson;
})(typeof window !== "undefined" ? window : globalThis);
