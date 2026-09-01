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
        lexId: "",
        locations: [],
        aliases: [],
        documents: [],
        criminal: {
          isCriminal: false,
          hasCriminalRecord: false,
          hasCriminalWarrants: false,
          sexOffender: false,
          foreignFugitive: false,
          armed: false,
          threatLevel: "none",
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
          finalOrderDate: "",
          firstDeportationDate: "",
          lastDeportationDate: "",
          baseballCards: []
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
    extra = extra || {};
    var built = model.assign(
      {
        warrantId: model.newId("wnt"),
        charge: "",
        warrantNumber: "",
        warrantDate: "",
        warrantStatus: "",
        warrantIssuer: "",
        warrantIssuerCode: "",
        formType: "",
        fileNo: "",
        pdfFileName: "",
        office: "",
        officerName: "",
        officerTitle: "",
        basis: [],
        inaLaw: "",
        entryPlace: "",
        entryDate: "",
        issuedAt: ""
      },
      extra
    );
    if (!Array.isArray(built.basis)) {
      built.basis = [];
    }
    return built;
  }

  function createBaseballCard(extra) {
    extra = extra || {};
    return model.assign(
      {
        cardId: model.newId("bbc"),
        generatedAt: model.nowIso ? model.nowIso() : "",
        text: "",
        arrestDate: "",
        disposition: ""
      },
      extra
    );
  }

  function isIssuedWarrant(row) {
    var formType = row && row.formType;
    return formType === "I-200" || formType === "I-205";
  }

  var SEX_OFFENDER_NEEDLES = [
    "sexual",
    "rape",
    "indecency",
    "molest",
    "lewd",
    "child porn",
    "pornograph",
    "exploitation of a child",
    "exploitation of child",
    "sex offender"
  ];
  var FOREIGN_FUGITIVE_NEEDLES = [
    "fugitive",
    "interpol",
    "red notice",
    "extradition"
  ];
  var ARMED_NEEDLES = [
    "armed and dangerous",
    "currently armed",
    "armed with",
    "in possession of a firearm",
    "possessing a firearm"
  ];
  var THREAT_LEVEL_LABELS = {
    none: "None",
    low: "Low",
    moderate: "Moderate",
    high: "High",
    severe: "Severe"
  };

  function offenseBlob(row) {
    if (!row) {
      return "";
    }
    return [
      row.crime,
      row.charge,
      row.arrestCharge,
      row.convictionStatute,
      row.arrestStatute
    ]
      .filter(Boolean)
      .join(" ");
  }

  function hayHas(hay, needle) {
    var text = String(hay || "").toLowerCase();
    var bit = String(needle || "").toLowerCase();
    if (!text || !bit) {
      return false;
    }
    if (bit.indexOf(" ") !== -1) {
      return text.indexOf(bit) !== -1;
    }
    return new RegExp("\\b" + bit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(
      text
    );
  }

  function blobMatches(hay, needles) {
    var i;
    for (i = 0; i < needles.length; i++) {
      if (hayHas(hay, needles[i])) {
        return true;
      }
    }
    return false;
  }

  function hasConvictionOffense(row) {
    return !!(row && String(row.crime || row.charge || "").trim());
  }

  function isActiveCriminalWarrant(row) {
    if (!row || isIssuedWarrant(row)) {
      return false;
    }
    var status = String(row.warrantStatus || "").trim().toLowerCase();
    return status === "" || status === "active" || status === "unknown";
  }

  function threatLevelLabel(level) {
    return THREAT_LEVEL_LABELS[level] || THREAT_LEVEL_LABELS.none;
  }

  function deriveCriminalProfile(person) {
    person = person || {};
    var convictions = person.convictions || [];
    var arrests = person.arrests || [];
    var warrants = person.warrants || [];
    var hay = "";
    convictions.forEach(function (row) {
      hay += " " + offenseBlob(row);
    });
    arrests.forEach(function (row) {
      hay += " " + offenseBlob(row);
    });
    warrants.forEach(function (row) {
      if (!isIssuedWarrant(row)) {
        hay += " " + offenseBlob(row);
      }
    });
    var hasCriminalRecord = convictions.some(hasConvictionOffense);
    var hasCriminalWarrants = warrants.some(isActiveCriminalWarrant);
    var hasFelony = convictions.some(function (row) {
      return (
        hasConvictionOffense(row) &&
        String(row.convictionClass || "").toLowerCase() === "felony"
      );
    });
    var sexOffender =
      blobMatches(hay, SEX_OFFENDER_NEEDLES) ||
      (hayHas(hay, "sex offender") && hayHas(hay, "failure to register"));
    var foreignFugitive = blobMatches(hay, FOREIGN_FUGITIVE_NEEDLES);
    var armed = blobMatches(hay, ARMED_NEEDLES);
    var rank = 0;
    if (hasCriminalRecord || hasCriminalWarrants) {
      rank = 1;
    }
    if (hasFelony || hasCriminalWarrants) {
      rank = Math.max(rank, 2);
    }
    if (armed) {
      rank = Math.max(rank, 3);
    }
    if (sexOffender || foreignFugitive) {
      rank = Math.max(rank, 4);
    }
    var levels = ["none", "low", "moderate", "high", "severe"];
    var derived = {
      isCriminal: hasCriminalRecord,
      hasCriminalRecord: hasCriminalRecord,
      hasCriminalWarrants: hasCriminalWarrants,
      sexOffender: sexOffender,
      foreignFugitive: foreignFugitive,
      armed: armed,
      threatLevel: levels[rank] || "none"
    };
    person.criminal = model.assign(person.criminal || {}, derived);
    return person.criminal;
  }

  function issuedWarrants(person) {
    return ((person && person.warrants) || []).filter(isIssuedWarrant);
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
  model.createBaseballCard = createBaseballCard;
  model.isIssuedWarrant = isIssuedWarrant;
  model.issuedWarrants = issuedWarrants;
  model.deriveCriminalProfile = deriveCriminalProfile;
  model.threatLevelLabel = threatLevelLabel;
  model.formatPersonLabel = formatPersonLabel;
  model.isBlankPerson = isBlankPerson;
})(typeof window !== "undefined" ? window : globalThis);
