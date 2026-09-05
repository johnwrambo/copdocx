/**
 * Booking-to-Arrest projection and exact Encounter subject join policies.
 * The caller supplies a detached Person to update and the current workspace.
 * No persistence, DOM access, or booking transaction execution occurs here.
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var domain = (root.domain = root.domain || {});

  domain.createBookingProjection = function (dependencies) {
    var model = dependencies.model;
    var clone = dependencies.clone;
    var getWorkspace = dependencies.getWorkspace;
    var subjectPolicy = dependencies.subjectPolicy;
    var normalizeBookInRole = dependencies.normalizeRole;
    var normalizeBookInVehiclePosition = dependencies.normalizeVehiclePosition;
    var normalizeBookInClock = dependencies.normalizeClock;
    var encounterPin = dependencies.encounterPin;
    var storeSubjectText = subjectPolicy.storeSubjectText;
    var storeSubjectOwn = subjectPolicy.storeSubjectOwn;
    var storeSubjectBookingId = subjectPolicy.storeSubjectBookingId;
    var storeSubjectId = subjectPolicy.storeSubjectId;
    var leadOwnerIdentity = subjectPolicy.leadOwnerIdentity;
    var encounterOwnershipRows = subjectPolicy.encounterOwnershipRows;

    function upsertBookInArrest(person, input) {
      var subjectId = storeSubjectText(input.subjectId);
      var recordId = storeSubjectOwn(input, "bookingId")
        ? storeSubjectText(input.bookingId)
        : storeSubjectText(input.bookinRecordId);
      var hasArrestData = !!(
        recordId ||
        input.arrestDate ||
        input.arrestDateTime ||
        input.bookInDateTime
      );
      if (!hasArrestData) {
        return { ok: true, arrestId: "", error: "" };
      }
      var canonicalPersonId = storeSubjectText(person && person.personId);
      person.arrests = Array.isArray(person.arrests) ? person.arrests : [];
      if (person.arrests.some(function (row) { return row && row.voidedAt && recordId && storeSubjectBookingId(row) === recordId; })) {
        return { ok: false, code: "BOOKING_VOIDED", arrestId: "", error: "This booking was voided. Create a new booking with a new ID." };
      }
      var externalClaim = null;
      var splitProjectionClaim = null;

      function localContainsProjection(row) {
        var rowArrestId = storeSubjectText(row && row.arrestId);
        var rowSubjectId = storeSubjectText(row && row.subjectId);
        var rowBookingId = storeSubjectBookingId(row);
        return person.arrests.some(function (local) {
          var localArrestId = storeSubjectText(local && local.arrestId);
          var localSubjectId = storeSubjectText(local && local.subjectId);
          var localBookingId = storeSubjectBookingId(local);
          if (rowArrestId && localArrestId === rowArrestId) {
            return true;
          }
          if (rowSubjectId && rowBookingId) {
            return (
              localSubjectId === rowSubjectId &&
              localBookingId === rowBookingId
            );
          }
          if (rowSubjectId) {
            return localSubjectId === rowSubjectId;
          }
          return !!rowBookingId && localBookingId === rowBookingId;
        });
      }

      function inspectOwnerArrests(ownerPersonId, rows) {
        return (Array.isArray(rows) ? rows : []).some(function (row) {
          var ownsSubject =
            subjectId && storeSubjectText(row && row.subjectId) === subjectId;
          var ownsBooking = recordId && storeSubjectBookingId(row) === recordId;
          if (!ownsSubject && !ownsBooking) {
            return false;
          }
          if (ownerPersonId !== canonicalPersonId) {
            externalClaim = {
              ownerPersonId: ownerPersonId,
              matchedBy: ownsSubject ? "subjectId" : "bookingId"
            };
            return true;
          }
          if (!localContainsProjection(row)) {
            splitProjectionClaim = {
              matchedBy: ownsSubject ? "subjectId" : "bookingId"
            };
            return true;
          }
          return false;
        });
      }

      Object.keys(getWorkspace().people || {}).some(function (ownerId) {
        var owner = getWorkspace().people[ownerId];
        var ownerPersonId = storeSubjectText(owner && owner.personId) || ownerId;
        return inspectOwnerArrests(ownerPersonId, owner && owner.arrests);
      });
      if (!externalClaim && !splitProjectionClaim) {
        Object.keys(getWorkspace().leads || {}).some(function (leadId) {
          var lead = getWorkspace().leads[leadId];
          var owner = leadOwnerIdentity(lead, leadId);
          var leadSubject = model.subjectOf ? model.subjectOf(lead) : lead.person;
          if (!owner.ok) {
            return (Array.isArray(leadSubject && leadSubject.arrests)
              ? leadSubject.arrests
              : []
            ).some(function (row) {
              var ownsSubject =
                subjectId && storeSubjectText(row && row.subjectId) === subjectId;
              var ownsBooking = recordId && storeSubjectBookingId(row) === recordId;
              if (!ownsSubject && !ownsBooking) {
                return false;
              }
              externalClaim = {
                ownerPersonId: "",
                matchedBy: ownsSubject ? "subjectId" : "bookingId",
                invalidLead: true
              };
              return true;
            });
          }
          return inspectOwnerArrests(
            owner.personId,
            leadSubject && leadSubject.arrests
          );
        });
      }
      if (externalClaim) {
        return {
          ok: false,
          arrestId: "",
          error: externalClaim.invalidLead
            ? "A Case with an invalid Person owner already claims this Book-In " +
              externalClaim.matchedBy +
              ". Run Integrity before saving."
            : "The Book-In " +
              externalClaim.matchedBy +
              " is already owned by another Person."
        };
      }
      if (splitProjectionClaim) {
        return {
          ok: false,
          arrestId: "",
          error:
            "The Person's canonical and Case Arrest projections disagree on this Book-In " +
            splitProjectionClaim.matchedBy +
            ". Run Integrity before saving."
        };
      }
      var index = -1;
      function matchingIndexes(predicate) {
        var matches = [];
        person.arrests.forEach(function (row, rowIndex) {
          if (row && predicate(row)) {
            matches.push(rowIndex);
          }
        });
        return matches;
      }
      function failed(error) {
        return { ok: false, arrestId: "", error: error };
      }
      var subjectMatches = subjectId
        ? matchingIndexes(function (row) {
            return storeSubjectText(row.subjectId) === subjectId && !(row.voidedAt && recordId && storeSubjectBookingId(row) !== recordId);
          })
        : [];
      var bookingMatches = recordId
        ? matchingIndexes(function (row) {
            return storeSubjectBookingId(row) === recordId;
          })
        : [];
      if (subjectId && recordId) {
        var exactPair = subjectMatches.filter(function (rowIndex) {
          return storeSubjectBookingId(person.arrests[rowIndex]) === recordId;
        });
        if (exactPair.length > 1) {
          return failed("Multiple Arrests already own this subject and booking identity.");
        }
        if (exactPair.length === 1) {
          index = exactPair[0];
        } else if (
          subjectMatches.length &&
          bookingMatches.length &&
          !subjectMatches.some(function (rowIndex) {
            return bookingMatches.indexOf(rowIndex) !== -1;
          })
        ) {
          return failed(
            "The subject and booking are already split across different Arrests."
          );
        } else if (subjectMatches.length) {
          var blankBooking = subjectMatches.filter(function (rowIndex) {
            return !storeSubjectBookingId(person.arrests[rowIndex]);
          });
          if (subjectMatches.length === 1 && blankBooking.length === 1) {
            index = blankBooking[0];
          } else {
            return failed("The subject is already linked to a different or ambiguous Arrest booking.");
          }
        } else if (bookingMatches.length) {
          var blankSubject = bookingMatches.filter(function (rowIndex) {
            return !storeSubjectId(person.arrests[rowIndex]);
          });
          if (bookingMatches.length === 1 && blankSubject.length === 1) {
            index = blankSubject[0];
          } else {
            return failed("The booking is already linked to a different or ambiguous Arrest subject.");
          }
        }
      } else if (subjectId) {
        if (subjectMatches.length > 1) {
          return failed("Multiple Arrests already use this Encounter subject identity.");
        }
        index = subjectMatches.length === 1 ? subjectMatches[0] : -1;
      } else if (recordId) {
        if (bookingMatches.length > 1) {
          return failed("Multiple Arrests already use this Book-In identity.");
        }
        index = bookingMatches.length === 1 ? bookingMatches[0] : -1;
      }
      var previous = index >= 0 ? person.arrests[index] : null;
      var preserveMissing = !!(
        previous && input.preserveMissingArrestFields === true
      );
      var fieldPresence = input.arrestFieldPresence || {};
      function arrestField(field, incoming, normalize) {
        if (preserveMissing && fieldPresence[field] !== true) {
          return previous && previous[field] !== undefined
            ? previous[field]
            : incoming;
        }
        return normalize ? normalize(incoming) : incoming;
      }
      var pin = encounterPin(
        input.encounterId && getWorkspace().encounters[input.encounterId]
      );
      var bookingValue = preserveMissing && fieldPresence.booking !== true
        ? clone((previous && previous.booking) || {})
        : Object.assign(
            {},
            (previous && previous.booking) || {},
            input.booking || {}
          );
      var arrestInput = Object.assign({}, previous || {}, {
          arrestDate: arrestField("arrestDate", input.arrestDate, function (value) {
            return String(value || "").trim();
          }),
          arrestTime: arrestField(
            "arrestTime",
            input.arrestTime,
            normalizeBookInClock
          ),
          arrestDateTime: arrestField(
            "arrestDateTime",
            input.arrestDateTime,
            function (value) {
              return String(value || "").trim();
            }
          ),
          arrestingOfficer: arrestField(
            "arrestingOfficer",
            input.arrestingOfficer,
            function (value) {
              return String(value || "").trim();
            }
          ),
          team: arrestField("team", input.team, function (value) {
            return String(value || "").trim();
          }),
          iceEventNumber: arrestField(
            "iceEventNumber",
            input.iceEventNumber,
            function (value) {
              return String(value || "").trim();
            }
          ),
          encounterNumber: arrestField(
            "encounterNumber",
            input.encounterNumber,
            function (value) {
              return String(value || "").trim();
            }
          ),
          encounterId: arrestField(
            "encounterId",
            input.encounterId,
            function (value) {
              return String(value || "").trim();
            }
          ),
          subjectId:
            subjectId || storeSubjectText(previous && previous.subjectId),
          subjectRole: arrestField(
            "subjectRole",
            input.subjectRole,
            normalizeBookInRole
          ),
          vehiclePosition: arrestField(
            "vehiclePosition",
            input.vehiclePosition,
            normalizeBookInVehiclePosition
          ),
          bookingId: recordId,
          bookinRecordId: recordId,
          bookInDateTime: arrestField(
            "bookInDateTime",
            input.bookInDateTime,
            function (value) {
              return String(value || "").trim();
            }
          ),
          arrestLocation:
            String(input.arrestLocation || "").trim() ||
            (previous && previous.arrestLocation) ||
            (pin && pin.arrestLocation) ||
            "",
          latitude:
            String(input.latitude || "").trim() ||
            (previous && previous.latitude) ||
            (pin && pin.latitude) ||
            "",
          longitude:
            String(input.longitude || "").trim() ||
            (previous && previous.longitude) ||
            (pin && pin.longitude) ||
            "",
          booking: bookingValue
        });
      var linkedArrestId =
        (previous && previous.arrestId) || String(input.arrestId || "");
      if (linkedArrestId) {
        arrestInput.arrestId = linkedArrestId;
      }
      var arrest = model.createArrest(arrestInput);
      if (index >= 0) {
        person.arrests[index] = arrest;
      } else {
        person.arrests.push(arrest);
      }
      return { ok: true, arrestId: arrest.arrestId, error: "" };
    }

    function validateBookInEncounterSubject(input, resolvedPersonId, resolvedLeadId) {
      input = input || {};
      var encounterId = storeSubjectText(input.encounterId);
      var subjectId = storeSubjectText(input.subjectId);
      if (!encounterId) {
        if (subjectId) {
          return {
            ok: false,
            subject: null,
            code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
            error: "A Book-In subjectId requires a linked Encounter."
          };
        }
        return { ok: true, subject: null, error: "" };
      }
      var encounter = getWorkspace().encounters[encounterId];
      if (!encounter) {
        return {
          ok: false,
          subject: null,
          code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
          error: "The linked Encounter does not exist."
        };
      }
      if (encounter.meta && encounter.meta.markedComplete) {
        return {
          ok: false,
          subject: null,
          code: "ENCOUNTER_LOCKED",
          error: "The linked Encounter is completed and locked."
        };
      }
      var subjects = Array.isArray(encounter && encounter.subjects)
        ? encounter.subjects
        : [];
      var bookingId = storeSubjectOwn(input, "bookingId")
        ? storeSubjectText(input.bookingId)
        : storeSubjectText(input.bookinRecordId);
      var personId = storeSubjectText(
        resolvedPersonId === undefined ? input.personId : resolvedPersonId
      );
      var leadId = storeSubjectText(
        resolvedLeadId === undefined ? input.leadId : resolvedLeadId
      );
      var subjectIndex = -1;

      function indexesMatching(predicate) {
        var indexes = [];
        subjects.forEach(function (row, index) {
          if (row && predicate(row)) {
            indexes.push(index);
          }
        });
        return indexes;
      }

      function failed(error) {
        return {
          ok: false,
          subject: null,
          code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
          error: error
        };
      }

      var claimedElsewhere = Object.keys(getWorkspace().encounters || {}).some(function (
        ownerEncounterId
      ) {
        if (ownerEncounterId === encounterId) {
          return false;
        }
        return encounterOwnershipRows(getWorkspace().encounters[ownerEncounterId]).some(
          function (row) {
            return (
              (subjectId && storeSubjectId(row) === subjectId) ||
              (bookingId && storeSubjectBookingId(row) === bookingId)
            );
          }
        );
      });
      if (claimedElsewhere) {
        return failed(
          "The Book-In subject or booking reference belongs to another Encounter."
        );
      }
      var historicalClaimWithoutActiveOwner = encounterOwnershipRows(
        encounter,
        false
      ).some(function (archived) {
        var matches =
          (subjectId && storeSubjectId(archived) === subjectId) ||
          (bookingId && storeSubjectBookingId(archived) === bookingId);
        if (!matches) {
          return false;
        }
        var archivedSubjectId = storeSubjectId(archived);
        return !subjects.some(function (active) {
          return (
            archivedSubjectId && storeSubjectId(active) === archivedSubjectId
          );
        });
      });
      if (historicalClaimWithoutActiveOwner) {
        return failed(
          "The Book-In subject or booking reference belongs to a historical Encounter association."
        );
      }
      var retiredBookingClaim = (Array.isArray(encounter.bookingIdentityHistory)
        ? encounter.bookingIdentityHistory
        : []
      ).some(function (row) {
        return bookingId && storeSubjectBookingId(row) === bookingId;
      });
      if (retiredBookingClaim) {
        return failed(
          "The Book-In booking reference was previously unlinked from this Encounter."
        );
      }

      if (subjectId) {
        var exactMatches = indexesMatching(function (subject) {
          return storeSubjectId(subject) === subjectId;
        });
        if (exactMatches.length !== 1) {
          return failed("The linked Encounter subject is missing or ambiguous.");
        }
        subjectIndex = exactMatches[0];
      } else {
        var exactClaimExists = false;
        var compatibleMatches = indexesMatching(function (candidate, index) {
          var candidateBookingId = storeSubjectBookingId(candidate);
          var candidatePersonId = storeSubjectText(candidate.personId);
          var candidateLeadId = storeSubjectText(candidate.leadId);
          var exactClaim = !!(
            (bookingId && candidateBookingId === bookingId) ||
            (personId && candidatePersonId === personId) ||
            (leadId && candidateLeadId === leadId)
          );
          exactClaimExists = exactClaimExists || exactClaim;
          if (!exactClaim) {
            return false;
          }
          if (
            (bookingId && candidateBookingId && candidateBookingId !== bookingId) ||
            (personId && candidatePersonId && candidatePersonId !== personId) ||
            (leadId && candidateLeadId && candidateLeadId !== leadId)
          ) {
            return false;
          }
          return !subjects.some(function (other, otherIndex) {
            if (!other || otherIndex === index) {
              return false;
            }
            return (
              (bookingId &&
                !candidateBookingId &&
                storeSubjectBookingId(other) === bookingId) ||
              (personId &&
                !candidatePersonId &&
                storeSubjectText(other.personId) === personId) ||
              (leadId &&
                !candidateLeadId &&
                storeSubjectText(other.leadId) === leadId)
            );
          });
        });
        if (compatibleMatches.length > 1) {
          return failed(
            "The Book-In identity matches multiple compatible Encounter subjects."
          );
        }
        if (compatibleMatches.length === 1) {
          subjectIndex = compatibleMatches[0];
        } else if (exactClaimExists) {
          return failed(
            "The Book-In identity conflicts with the linked Encounter subjects."
          );
        } else {
          return { ok: true, subject: null, error: "" };
        }
      }

      var subject = subjects[subjectIndex];
      subjectId = storeSubjectId(subject);
      var subjectBookingId = storeSubjectBookingId(subject);
      var subjectPersonId = storeSubjectText(subject.personId);
      var subjectLeadId = storeSubjectText(subject.leadId);
      var anotherOwnsBooking = bookingId && subjects.some(function (row, index) {
        return index !== subjectIndex && storeSubjectBookingId(row) === bookingId;
      });
      var anotherOwnsPerson =
        !subjectPersonId &&
        personId &&
        subjects.some(function (row, index) {
          return (
            index !== subjectIndex &&
            storeSubjectText(row && row.personId) === personId
          );
        });
      var anotherOwnsLead =
        !subjectLeadId &&
        leadId &&
        subjects.some(function (row, index) {
          return (
            index !== subjectIndex &&
            storeSubjectText(row && row.leadId) === leadId
          );
        });
      if (
        anotherOwnsBooking ||
        anotherOwnsPerson ||
        anotherOwnsLead ||
        (bookingId && subjectBookingId && bookingId !== subjectBookingId) ||
        (personId && subjectPersonId && personId !== subjectPersonId) ||
        (leadId && subjectLeadId && leadId !== subjectLeadId)
      ) {
        var mismatch = failed("Book-In identity conflicts with the linked Encounter subject.");
        mismatch.subject = subject;
        return mismatch;
      }
      return { ok: true, subject: subject, error: "" };
    }

    return {
      upsertBookInArrest: upsertBookInArrest,
      validateBookInEncounterSubject: validateBookInEncounterSubject
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
