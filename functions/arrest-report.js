/**
 * Unified arrest report.
 *
 * Reads canonical committed cases and their Person.arrests/BaseballCard objects.
 * Book-In rows are lookup/provenance only; they are never a second case model.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeMarkupText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizedCardMarkup(sourceHtml, fallbackText) {
    var fallback = "<div>" +
      escapeMarkupText(fallbackText).replace(/\r?\n/g, "<br>") +
      "</div>";
    if (
      !text(sourceHtml) ||
      !global.document ||
      typeof global.document.createElement !== "function"
    ) {
      return fallback;
    }
    var template = global.document.createElement("template");
    template.innerHTML = String(sourceHtml);
    var allowed = {
      B: true,
      BR: true,
      DIV: true,
      EM: true,
      I: true,
      LI: true,
      OL: true,
      P: true,
      STRONG: true,
      UL: true
    };
    var dropped = { IFRAME: true, OBJECT: true, SCRIPT: true, STYLE: true };
    function clean(node) {
      if (node.nodeType === 3) {
        return escapeMarkupText(node.nodeValue || "");
      }
      if (node.nodeType !== 1) {
        return "";
      }
      var tag = String(node.tagName || "").toUpperCase();
      if (dropped[tag]) {
        return "";
      }
      var children = Array.prototype.map.call(node.childNodes || [], clean).join("");
      if (!allowed[tag]) {
        return children;
      }
      if (tag === "BR") {
        return "<br>";
      }
      return "<" + tag.toLowerCase() + ">" + children + "</" + tag.toLowerCase() + ">";
    }
    var cleaned = Array.prototype.map.call(template.content.childNodes, clean).join("");
    return cleaned || fallback;
  }

  function digits(value) {
    return text(value).replace(/\D/g, "");
  }

  function formatAlienNumber(value) {
    var raw = digits(value);
    if (raw.length !== 9) {
      return text(value);
    }
    return "A" + raw.slice(0, 3) + " " + raw.slice(3, 6) + " " + raw.slice(6);
  }

  function personName(person) {
    var name = (person && person.name) || {};
    return [text(name.firstName), text(name.lastName)].filter(Boolean).join(" ") ||
      "Unnamed subject";
  }

  function catalogLabel(list, value) {
    var key = text(value);
    var normalized = key.toLowerCase();
    var found = (list || []).filter(function (row) {
      return (
        row &&
        (text(row.code).toLowerCase() === normalized ||
          text(row.label).toLowerCase() === normalized ||
          text(row.official).toLowerCase() === normalized)
      );
    })[0];
    return found ? text(found.label || found.official || found.code) : key;
  }

  function localDateTimeLabel(value, dateFallback, timeFallback) {
    var raw = text(value);
    var match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (match) {
      return match[1] + (match[2] ? " " + match[2] + ":" + match[3] : "");
    }
    var date = text(dateFallback);
    var time = text(timeFallback);
    return [date, time].filter(Boolean).join(" ");
  }

  function latestCard(cards) {
    return (cards || [])
      .slice()
      .sort(function (left, right) {
        return text(right && right.generatedAt).localeCompare(
          text(left && left.generatedAt)
        );
      })[0] || null;
  }

  function uniqueText(values) {
    var seen = Object.create(null);
    return (values || []).reduce(function (output, value) {
      var key = text(value);
      if (key && !seen[key]) {
        seen[key] = true;
        output.push(key);
      }
      return output;
    }, []);
  }

  function bookingClaims(record, includePacketId) {
    return uniqueText([
      includePacketId ? record && record.id : "",
      record && record.bookingId,
      record && record.bookinRecordId
    ]);
  }

  function unambiguousBookingId(record, includePacketId) {
    var claims = bookingClaims(record, includePacketId);
    return claims.length === 1 ? claims[0] : "";
  }

  function bookingCompatible(arrest, candidate, includePacketId) {
    var arrestClaims = bookingClaims(arrest, false);
    var candidateClaims = bookingClaims(candidate, includePacketId);
    if (candidateClaims.length > 1 || arrestClaims.length > 1) {
      return false;
    }
    return !(
      arrestClaims.length &&
      candidateClaims.length &&
      arrestClaims[0] !== candidateClaims[0]
    );
  }

  function cardForArrest(cards, arrest, owner) {
    owner = owner || {};
    var subjectId = text(arrest && arrest.subjectId);
    var recordId = unambiguousBookingId(arrest, false);
    var arrestDate = text(arrest && arrest.arrestDate);
    function compatibleOwner(card) {
      var personId = text(card && card.personId);
      var encounterId = text(card && card.encounterId);
      return !(
        (personId && owner.personId && personId !== owner.personId) ||
        (encounterId && owner.encounterId && encounterId !== owner.encounterId)
      );
    }
    var exactSubject = (cards || []).filter(function (card) {
      var cardRecordId = unambiguousBookingId(card, false);
      return (
        subjectId &&
        text(card && card.subjectId) === subjectId &&
        bookingCompatible(arrest, card, false) &&
        (!recordId || !cardRecordId || cardRecordId === recordId) &&
        compatibleOwner(card)
      );
    });
    if (exactSubject.length) {
      return latestCard(exactSubject);
    }
    var exactRecord = (cards || []).filter(function (card) {
      var cardSubjectId = text(card && card.subjectId);
      var cardRecordId = unambiguousBookingId(card, false);
      return (
        recordId &&
        cardRecordId === recordId &&
        bookingCompatible(arrest, card, false) &&
        (!subjectId || !cardSubjectId || cardSubjectId === subjectId) &&
        compatibleOwner(card)
      );
    });
    if (exactRecord.length) {
      return latestCard(exactRecord);
    }
    var exactDate = (cards || []).filter(function (card) {
      var cardSubjectId = text(card && card.subjectId);
      return (
        arrestDate &&
        !unambiguousBookingId(card, false) &&
        bookingClaims(card, false).length < 2 &&
        (!subjectId || !cardSubjectId || cardSubjectId === subjectId) &&
        compatibleOwner(card) &&
        text(card && card.arrestDate) === arrestDate
      );
    });
    return exactDate.length ? latestCard(exactDate) : null;
  }

  function bookInMap(records) {
    var map = {};
    (records || []).forEach(function (record) {
      var id = unambiguousBookingId(record, true);
      if (id) {
        map[id] = map[id] || [];
        map[id].push(record);
      }
    });
    return map;
  }

  function bookInForArrest(records, arrest, byRecordId, owner, resolveInput) {
    owner = owner || {};
    var subjectId = text(arrest && arrest.subjectId);
    var recordId = unambiguousBookingId(arrest, false);
    function compatibleOwner(record) {
      var input =
        typeof resolveInput === "function" ? resolveInput(record) || {} : {};
      var personId = text(record && record.personId);
      var encounterId = text(
        (record && record.encounterId) || input.encounterId
      );
      var encounterNumber = text(
        (record && record.encounterNumber) || input.encounterNumber
      );
      var leadId = text(record && record.leadId);
      return !(
        (personId && owner.personId && personId !== owner.personId) ||
        (encounterId && owner.encounterId && encounterId !== owner.encounterId) ||
        (encounterNumber &&
          owner.encounterNumber &&
          encounterNumber !== owner.encounterNumber) ||
        (leadId && owner.leadId && leadId !== owner.leadId)
      );
    }
    if (subjectId) {
      var subjectMatches = (records || []).filter(function (record) {
        var candidateRecordId = unambiguousBookingId(record, true);
        return (
          record &&
          text(record.subjectId) === subjectId &&
          bookingCompatible(arrest, record, true) &&
          (!recordId || !candidateRecordId || candidateRecordId === recordId) &&
          compatibleOwner(record)
        );
      });
      if (subjectMatches.length === 1) {
        return subjectMatches[0];
      }
      if (subjectMatches.length > 1) {
        return {};
      }
    }
    var legacyMatches = (recordId && byRecordId[recordId]) || [];
    if (legacyMatches.length !== 1) {
      return {};
    }
    var legacyMatch = legacyMatches[0];
    if (
      legacyMatch &&
      (!bookingCompatible(arrest, legacyMatch, true) ||
        !compatibleOwner(legacyMatch) ||
        (subjectId &&
          text(legacyMatch.subjectId) &&
          text(legacyMatch.subjectId) !== subjectId))
    ) {
      return {};
    }
    return legacyMatch || {};
  }

  function collect(store, bookinRecords, options) {
    options = options || {};
    var voidedBookings = Object.create(null);
    (bookinRecords || []).forEach(function (record) {
      if (record && record.voidedAt) {
        bookingClaims(record, true).forEach(function (id) { voidedBookings[id] = true; });
      }
    });
    bookinRecords = (bookinRecords || []).filter(function (record) {
      return record && !record.voidedAt;
    });
    var selected = {};
    (options.bookinRecordIds || []).forEach(function (id) {
      selected[text(id)] = true;
    });
    var selectedOnly = Object.keys(selected).length > 0;
    var records = bookInMap(bookinRecords);
    var rows = [];
    var seen = {};
    var dailyCandidates = [];
    if (!store || typeof store.listLeads !== "function") {
      return rows;
    }
    if (typeof store.loadFromDisk === "function") {
      store.loadFromDisk();
    }
    (store.listLeads() || []).forEach(function (summary) {
      var snap = store.getLead(summary.leadId);
      if (!snap) {
        return;
      }
      var model = root.model || {};
      if (model.isCommitted && !model.isCommitted(snap)) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      if (person && typeof store.getPerson === "function") {
        person = store.getPerson(person.personId) || person;
      }
      if (!person) {
        return;
      }
      var criminal = person.criminal || {};
      var immigration = person.immigration || {};
      var cards = Array.isArray(immigration.baseballCards)
        ? immigration.baseballCards
        : [];
      (person.arrests || []).forEach(function (arrest) {
        if (!arrest || arrest.voidedAt || bookingClaims(arrest, false).some(function (id) {
          return voidedBookings[id];
        })) {
          return;
        }
        var recordId = unambiguousBookingId(arrest, false);
        var dateKey = text(arrest.arrestDate) || text(arrest.arrestDateTime).slice(0, 10);
        var arrestEncounterId = text(arrest.encounterId);
        var sourceRecord = bookInForArrest(
          bookinRecords,
          arrest,
          records,
          {
            personId: text(person.personId),
            leadId: text(snap.leadId),
            encounterId: arrestEncounterId,
            encounterNumber: text(arrest.encounterNumber)
          },
          typeof store.bookInPromotionInput === "function"
            ? store.bookInPromotionInput.bind(store)
            : null
        );
        var sourceInput =
          typeof store.bookInPromotionInput === "function"
            ? store.bookInPromotionInput(sourceRecord)
            : {};
        var encounterId = text(arrest.encounterId || sourceInput.encounterId);
        var encounterNumber = text(
          arrest.encounterNumber ||
            sourceInput.encounterNumber ||
            encounterId
        );
        var key = text(person.personId) + "|" + text(arrest.arrestId || recordId || dateKey);
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        var row = {
          leadId: text(snap.leadId),
          personId: text(person.personId),
          subjectId: text(arrest.subjectId || sourceRecord.subjectId || sourceInput.subjectId),
          arrestId: text(arrest.arrestId),
          bookinRecordId: recordId,
          name: personName(person),
          age: text(person.age),
          country: catalogLabel(global.COUNTRIES, person.citizenship),
          aNumber: formatAlienNumber(immigration.alienNumber),
          fbiNumber: text(criminal.fbiNumber),
          iceEvent: text(arrest.iceEventNumber || sourceInput.iceEventNumber),
          encounterId: encounterId,
          encounterNumber: encounterNumber,
          encounterLinkValid: validEncounterLink(store, encounterId, arrest, person.personId),
          disposition: catalogLabel(
            global.IMMIGRATION_DISPOSITIONS,
            immigration.disposition
          ),
          arrestDate: dateKey,
          arrestDateTime: localDateTimeLabel(
            arrest.arrestDateTime,
            arrest.arrestDate,
            arrest.arrestTime
          ),
          officer: text(arrest.arrestingOfficer || sourceInput.arrestingOfficer),
          team: text(arrest.team || sourceInput.team),
          updatedAt: text(sourceRecord.updatedAt || arrest.updatedAt || (snap.meta && snap.meta.updatedAt)),
          reportCard: null,
          reportCardResolved: true,
          card: cardForArrest(cards, arrest, {
            personId: text(person.personId),
            encounterId: encounterId
          })
        };
        cards.forEach(function (card) {
          var candidate = finalizedCandidate(card, row);
          if (candidate) { dailyCandidates.push(candidate); }
        });
        rows.push(row);
      });
    });
    var winners = chooseDailyCards(dailyCandidates);
    rows.forEach(function (row) {
      var winner = winners[row.arrestDate];
      if (winner && winner.rowKey === rowIdentity(row)) {
        row.reportCard = winner.snapshot;
        row.reportCardName = winner.displayName;
      }
    });
    rows = rows.filter(function (row) {
      if (options.leadId && row.leadId !== text(options.leadId)) { return false; }
      if (selectedOnly && !selected[row.bookinRecordId]) { return false; }
      if ((options.from || options.to) && !row.arrestDate) { return false; }
      if (options.from && row.arrestDate < options.from) { return false; }
      if (options.to && row.arrestDate > options.to) { return false; }
      if (options.encounterId && row.encounterId !== text(options.encounterId) &&
          row.encounterNumber !== text(options.encounterId)) { return false; }
      if (options.q) {
        var hay = [row.name, row.aNumber, row.fbiNumber, row.iceEvent,
          row.encounterNumber, row.country, row.disposition].join(" ").toLowerCase();
        if (hay.indexOf(String(options.q).toLowerCase()) === -1) { return false; }
      }
      return true;
    });
    return sortRows(rows, "arrestDateTime", "desc");
  }

  function validEncounterLink(store, encounterId, arrest, personId) {
    if (!encounterId || typeof store.getEncounter !== "function") { return false; }
    var encounter = store.getEncounter(encounterId);
    if (!encounter || !Array.isArray(encounter.subjects)) { return false; }
    var matches = encounter.subjects.filter(function (subject) {
      if (!subject || text(subject.personId) !== text(personId)) { return false; }
      if (text(arrest.subjectId) && text(subject.subjectId) !== text(arrest.subjectId)) { return false; }
      if (!bookingCompatible(arrest, subject, false)) { return false; }
      return text(arrest.subjectId) ? true : Boolean(unambiguousBookingId(arrest, false) &&
        unambiguousBookingId(subject, false) === unambiguousBookingId(arrest, false));
    });
    return matches.length === 1;
  }

  function rowIdentity(row) {
    return text(row && row.personId) + "|" + text(row && (row.arrestId || row.bookinRecordId || row.subjectId));
  }

  function finalizedCandidate(card, row) {
    var snapshot = card && card.finalizedSnapshot;
    var marker = card && card.arrestOfDay;
    if (!snapshot || snapshot.status !== "FINALIZED" || !marker ||
        text(marker.date) !== row.arrestDate || text(snapshot.arrestDateKey) !== row.arrestDate ||
        !text(marker.markedAt) || !text(snapshot.generatedAt) || card.voidedAt || snapshot.voidedAt) {
      return null;
    }
    var matched = false;
    var fields = ["personId", "encounterId", "subjectId", "arrestId"];
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i];
      var claim = text(snapshot[field]);
      if (claim && claim !== text(row[field])) { return null; }
      if (claim && (field === "subjectId" || field === "arrestId")) { matched = true; }
      if (text(card[field]) && text(card[field]) !== text(row[field])) { return null; }
    }
    var ids = uniqueText([snapshot.recordId].concat(bookingClaims(snapshot, false)));
    if (ids.length > 1 || (ids.length && ids[0] !== text(row.bookinRecordId))) { return null; }
    if (!bookingCompatible(row, card, false)) { return null; }
    if (ids.length) { matched = true; }
    // A date/name match alone does not identify an arrest.
    if (!matched) { return null; }
    return {
      rowKey: rowIdentity(row), date: row.arrestDate, snapshot: snapshot,
      markedAt: text(marker.markedAt), cardId: text(snapshot.cardId || card.cardId),
      displayName: text(snapshot.displayName) || text(row.name)
    };
  }

  function chooseDailyCards(candidates) {
    var winners = Object.create(null);
    (candidates || []).forEach(function (candidate) {
      var previous = winners[candidate.date];
      var order = [candidate.markedAt, text(candidate.snapshot.generatedAt), candidate.cardId, candidate.rowKey].join("|");
      var old = previous && [previous.markedAt, text(previous.snapshot.generatedAt), previous.cardId, previous.rowKey].join("|");
      if (!previous || order > old) { winners[candidate.date] = candidate; }
    });
    return winners;
  }

  var naturalCollator = typeof Intl !== "undefined" && Intl.Collator
    ? new Intl.Collator("en-US", { numeric: true, sensitivity: "base" }) : null;
  function naturalCompare(a, b) {
    return naturalCollator ? naturalCollator.compare(a, b) : a.localeCompare(b);
  }
  function sortRows(rows, key, direction) {
    return (rows || []).map(function (row, index) { return { row: row, index: index }; })
      .sort(function (a, b) {
        var av = text(a.row[key]); var bv = text(b.row[key]);
        if (!av && bv) { return 1; }
        if (av && !bv) { return -1; }
        var cmp = av && bv ? naturalCompare(av, bv) : 0;
        if (cmp) { return direction === "desc" ? -cmp : cmp; }
        return naturalCompare(text(a.row.name), text(b.row.name)) ||
          naturalCompare(rowIdentity(a.row), rowIdentity(b.row)) || a.index - b.index;
      }).map(function (entry) { return entry.row; });
  }

  function safePhotoDataUrl(value) {
    var candidate = text(value);
    return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(candidate)
      ? candidate
      : "";
  }

  function blobPartToDataUrl(part) {
    if (part && safePhotoDataUrl(part.dataUrl)) {
      return Promise.resolve(safePhotoDataUrl(part.dataUrl));
    }
    if (
      !part ||
      !part.blob ||
      typeof global.Blob !== "function" ||
      typeof global.FileReader !== "function"
    ) {
      return Promise.resolve("");
    }
    return new Promise(function (resolve) {
      var payload = part.blob;
      var mime = text(part.mime) || text(payload.type) || "image/jpeg";
      var blob = payload instanceof global.Blob
        ? payload
        : new global.Blob([payload], { type: mime });
      var reader = new global.FileReader();
      reader.onerror = function () {
        resolve("");
      };
      reader.onload = function () {
        resolve(safePhotoDataUrl(reader.result));
      };
      reader.readAsDataURL(blob);
    });
  }

  function hydratePhotos(rows, media) {
    var cache = {};
    return Promise.all((rows || []).map(function (row) {
      var copy = Object.assign({}, row);
      var card = row && (row.reportCard || row.card);
      var legacy = safePhotoDataUrl(card && card.photoDataUrl);
      var mediaId = text(card && card.photoMediaId);
      function finish(dataUrl) {
        copy.photoDataUrl = dataUrl || legacy;
        if (row && row.reportCard && copy.photoDataUrl) {
          var api = root.baseball;
          if (!api || typeof api.renderPhoto !== "function") {
            throw new Error("The finalized card photo renderer is unavailable.");
          }
          var state = api.fromCanonical(row.reportCard);
          return Promise.resolve(api.renderPhoto(state, copy.photoDataUrl)).then(function (baked) {
            if (!safePhotoDataUrl(baked)) { throw new Error("The finalized card photo could not be prepared."); }
            copy.photoDataUrl = baked;
            copy.reportPhotoBaked = true;
            return copy;
          });
        }
        if (row && row.reportCard && !copy.photoDataUrl) {
          throw new Error("A finalized card photo is unavailable. Restore the photo before generating this report.");
        }
        return copy;
      }
      if (!mediaId || !media || typeof media.blob !== "function") { return Promise.resolve().then(function () { return finish(legacy); }); }
      if (!cache[mediaId]) {
        cache[mediaId] = Promise.resolve().then(function () { return media.blob(mediaId, "original"); })
          .catch(function () { return media.blob(mediaId, "display"); })
          .then(blobPartToDataUrl).catch(function () { return ""; });
      }
      return cache[mediaId].then(finish);
    }));
  }

  var DEFAULT_UNIT = "DAL-3";
  var INTERNAL_HEADING = "INTERNAL Background Required for Privacy Review:";
  var DEFAULT_COLUMNS = [
    { id: "name", label: "Subject", reportLabel: "Name" },
    { id: "age", label: "Age" },
    { id: "country", label: "Country" },
    { id: "aNumber", label: "A-Number" },
    { id: "fbiNumber", label: "FBI Number" },
    { id: "iceEvent", label: "ICE Event" },
    { id: "encounterNumber", label: "Encounter", reportLabel: "Encounter Number" },
    { id: "disposition", label: "Disposition" },
    { id: "arrestDateTime", label: "Arrest Date/Time" },
    { id: "updatedAt", label: "Last Saved" }
  ];

  function countWord(count, one, many) {
    return count === 1 ? one : many;
  }

  function formatLongReportDate(dateKey) {
    var match = text(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return text(dateKey);
    }
    var months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    var month = months[Number(match[2]) - 1];
    if (!month) {
      return text(dateKey);
    }
    return month + " " + Number(match[3]) + ", " + match[1];
  }

  function uniqueEncounterCount(rows) {
    var seen = {};
    (rows || []).forEach(function (row) {
      var id = row && row.encounterLinkValid === true ? text(row.encounterId) : "";
      if (id) {
        seen[id] = true;
      }
    });
    return Object.keys(seen).length;
  }

  function reportTitle(unit, mode, alienCount, encounterCount) {
    var aliens = alienCount + " " + countWord(alienCount, "alien", "aliens");
    var encounters =
      encounterCount + " " + countWord(encounterCount, "encounter", "encounters");
    if (mode === "today") {
      return unit + " Arrested " + aliens + " today in " + encounters + ".";
    }
    if (mode === "encounter") {
      return unit + " Encounter Arrest Report: " + aliens + " in " + encounters + ".";
    }
    return unit + " Selected Arrest Report: " + aliens + " in " + encounters + ".";
  }

  function reportSummary(mode, rows) {
    if (mode === "today") {
      return "";
    }
    if (mode === "encounter") {
      return "Arrests from this encounter.";
    }
    var dates = [];
    var seen = {};
    (rows || []).forEach(function (row) {
      var key = text(row && row.arrestDate);
      if (key && !seen[key]) {
        seen[key] = true;
        dates.push(key);
      }
    });
    dates.sort();
    if (dates.length === 1) {
      return "Selected arrests from " + formatLongReportDate(dates[0]) + ".";
    }
    if (dates.length > 1) {
      return (
        "Selected arrests from " +
        formatLongReportDate(dates[0]) +
        " through " +
        formatLongReportDate(dates[dates.length - 1]) +
        "."
      );
    }
    return "Selected saved arrest records.";
  }

  function resolveColumns(options) {
    var requested = options && options.columns;
    if (!Array.isArray(requested)) {
      return DEFAULT_COLUMNS.map(function (column) { return { id: column.id, label: column.reportLabel || column.label }; });
    }
    return requested
      .map(function (column) {
        if (!column) {
          return null;
        }
        if (typeof column === "string") {
          var found = DEFAULT_COLUMNS.filter(function (row) {
            return row.id === column;
          })[0];
          return found ? { id: found.id, label: found.reportLabel || found.label } : null;
        }
        var id = text(column.id);
        if (!id) {
          return null;
        }
        var known = DEFAULT_COLUMNS.some(function (entry) { return entry.id === id; });
        return known ? { id: id, label: text(column.reportLabel || column.label) || id } : null;
      })
      .filter(Boolean);
  }

  function columnValue(row, id) {
    if (id === "name" || id === "subject") {
      return text(row && row.name);
    }
    if (id === "arrestDateTime" || id === "updatedAt") {
      var raw = text(row && row[id]);
      if (!raw) { return id === "updatedAt" ? "Unknown" : ""; }
      var date = new Date(raw.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"));
      if (Number.isNaN(date.getTime())) { return id === "updatedAt" ? "Unknown" : raw; }
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      }).format(date);
    }
    return text(row && row[id]);
  }

  function parseCardHtml(html) {
    if (
      !text(html) ||
      !global.document ||
      typeof global.document.createElement !== "function"
    ) {
      return null;
    }
    var host = global.document.createElement("div");
    host.innerHTML = String(html);
    if (typeof host.querySelector !== "function") {
      return null;
    }
    var narrativeEl = host.querySelector(".narrative-cell p") || host.querySelector("p");
    var headingEl = host.querySelector(".narrative-cell h2") || host.querySelector("h2");
    var bulletRoot = host.querySelector(".narrative-cell") || host;
    var bulletNodes =
      typeof bulletRoot.querySelectorAll === "function"
        ? bulletRoot.querySelectorAll("li")
        : [];
    if (!narrativeEl && !text(host.textContent)) {
      return null;
    }
    return {
      narrative: text(narrativeEl && narrativeEl.textContent),
      heading: text(headingEl && headingEl.textContent) || INTERNAL_HEADING,
      bullets: Array.prototype.map
        .call(bulletNodes, function (item) {
          return text(item.textContent);
        })
        .filter(Boolean)
    };
  }

  function parseCardText(source) {
    var raw = text(source).replace(/\u00a0/g, " ");
    var heading = INTERNAL_HEADING;
    var narrative = raw;
    var rest = "";
    var idx = raw.indexOf(INTERNAL_HEADING);
    if (idx !== -1) {
      narrative = raw.slice(0, idx).trim();
      rest = raw.slice(idx + INTERNAL_HEADING.length).trim();
    } else {
      var lines = raw.split(/\r?\n/);
      var bulletsStart = -1;
      var i;
      for (i = 0; i < lines.length; i += 1) {
        if (/^\s*[•\-\*]\s+/.test(lines[i])) {
          bulletsStart = i;
          break;
        }
      }
      if (bulletsStart >= 0) {
        narrative = lines.slice(0, bulletsStart).join("\n").trim();
        rest = lines.slice(bulletsStart).join("\n");
      }
    }
    narrative = narrative.replace(/^Dallas\s*/i, "").trim();
    var bullets = [];
    rest.split(/\r?\n/).forEach(function (line) {
      var item = line.replace(/^\s*[•\-\*]\s*/, "").trim();
      if (item) {
        bullets.push(item);
      }
    });
    return { narrative: narrative, heading: heading, bullets: bullets };
  }

  function parseCardContent(card) {
    if (!card) {
      return null;
    }
    if (card.content && typeof card.content === "object") {
      return { narrative: String(card.content.narrative || ""), heading: String(card.content.heading || ""),
        bullets: Array.isArray(card.content.bullets) ? card.content.bullets.map(String) : [] };
    }
    var fromHtml = parseCardHtml(card.html);
    if (fromHtml && (fromHtml.narrative || fromHtml.bullets.length)) {
      return fromHtml;
    }
    return parseCardText(card.text);
  }

  function fallbackCardEmailMarkup(content, photo) {
    content = content || {};
    var bullets = Array.isArray(content.bullets) ? content.bullets : [];
    var photoSrc = safePhotoDataUrl(photo);
    var photoAlt = photoSrc
      ? "Photo from arrest in the field"
      : "No arrest photo selected";
    var listItems = bullets
      .map(function (item, index) {
        return (
          '<li style="margin:' +
          (index === 0 ? "0" : "9px") +
          ' 0 0;padding:0;">' +
          escapeHtml(item) +
          "</li>"
        );
      })
      .join("");
    var photoCell = photoSrc
      ? '<img src="' +
        photoSrc +
        '" alt="' +
        escapeHtml(photoAlt) +
        '" width="357" style="display:block;width:100%;max-width:357px;height:auto;min-height:570px;object-fit:cover;object-position:center top;border:0;">'
      : "";
    return (
      '<table class="arrest-card" role="presentation" aria-label="ICE Dallas arrest information card" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:1050px;margin:0;border-collapse:collapse;table-layout:fixed;background:#ffffff;font-family:Arial,sans-serif;color:#171717;line-height:1.45;">' +
      "<tbody><tr>" +
      '<td rowspan="2" width="34%" style="width:34%;padding:0;border:1px solid #8a8a8a;vertical-align:top;background:#ffffff;">' +
      photoCell +
      "</td>" +
      '<th scope="row" style="height:44px;padding:9px 16px;border:1px solid #8a8a8a;text-align:left;vertical-align:middle;font-size:20px;line-height:1.2;font-weight:700;font-family:Arial,sans-serif;background:#ffffff;">Dallas</th>' +
      "</tr><tr>" +
      '<td style="padding:18px 20px 22px;border:1px solid #8a8a8a;vertical-align:top;font-size:16px;font-family:Arial,sans-serif;background:#ffffff;">' +
      '<p style="margin:0 0 20px;padding:0;color:#171717;">' +
      escapeHtml(content.narrative || "") +
      "</p>" +
      '<h2 style="margin:4px 0 12px;padding:0;font-size:16px;line-height:1.35;font-weight:700;font-family:Arial,sans-serif;">' +
      escapeHtml(content.heading || INTERNAL_HEADING) +
      "</h2>" +
      '<ul style="margin:0;padding:0 0 0 24px;max-height:none;overflow:visible;">' +
      listItems +
      "</ul></td></tr></tbody></table>"
    );
  }

  function cardPlainText(content, fallbackText) {
    if (typeof global.buildBaseballCardPlainText === "function" && content) {
      return text(global.buildBaseballCardPlainText(content));
    }
    if (content && (content.narrative || (content.bullets && content.bullets.length))) {
      return [
        "Dallas",
        "",
        text(content.narrative),
        "",
        text(content.heading) || INTERNAL_HEADING
      ]
        .concat(
          (content.bullets || []).map(function (item) {
            return "• " + text(item);
          })
        )
        .join("\n")
        .trim();
    }
    return text(fallbackText);
  }

  function cardHtml(row) {
    var card = row && row.reportCard;
    if (!card) { return ""; }
    var content = parseCardContent(card);
    var photo = safePhotoDataUrl(row.photoDataUrl || card.photoDataUrl);
    var api = root.baseball;
    var markup;
    if (!photo) { throw new Error("The finalized card photo is unavailable. Prepare the photo before generating this report."); }
    if (api && typeof api.renderEmail === "function") {
      if (photo && !row.reportPhotoBaked) {
        throw new Error("Prepare the finalized card photo before building this report.");
      }
      markup = api.renderEmail(api.fromCanonical(card), photo);
    } else if (photo || card.layout || card.photoAdjustments) {
      throw new Error("The finalized card renderer is unavailable.");
    } else {
      markup = fallbackCardEmailMarkup(content, photo);
    }
    return '<div style="margin:20px 0 0;">' + markup + "</div>";
  }

  function reportCards(rows) {
    var candidates = [];
    (rows || []).forEach(function (row) {
      if (row.reportCardResolved) {
        if (row.reportCard) { candidates.push(Object.assign({}, row)); }
      } else {
        var candidate = finalizedCandidate(row.card, row);
        if (candidate) {
          candidates.push(Object.assign({}, row, {
            reportCard: candidate.snapshot, reportCardName: candidate.displayName,
            reportMarkedAt: candidate.markedAt
          }));
        }
      }
    });
    var byDate = Object.create(null);
    candidates.forEach(function (row) {
      var old = byDate[row.arrestDate];
      if (!old || [row.reportMarkedAt || "", row.reportCard.generatedAt, row.reportCard.cardId].join("|") >
          [old.reportMarkedAt || "", old.reportCard.generatedAt, old.reportCard.cardId].join("|")) {
        byDate[row.arrestDate] = row;
      }
    });
    return Object.keys(byDate).sort().map(function (date) { return byDate[date]; });
  }

  function build(rows, options) {
    options = options || {};
    rows = Array.isArray(rows) ? rows : [];
    rows = rows.filter(function (row) { return row && !row.voidedAt; });
    var eligibleCards = reportCards(rows);
    var cardCount = eligibleCards.length;
    var missingEncounterCount = rows.filter(function (row) { return row.encounterLinkValid !== true; }).length;
    var encounterCount = uniqueEncounterCount(rows);
    var unit = text(options.unit) || DEFAULT_UNIT;
    var mode = text(options.mode) || "selected";
    var title =
      text(options.title) ||
      reportTitle(unit, mode, rows.length, encounterCount);
    var dailyCard = eligibleCards.length === 1 ? eligibleCards[0] : null;
    var dailySummary = dailyCard ? "The arrest of the day is " + text(dailyCard.reportCardName || dailyCard.name) + "." :
      "The arrest of the day has not been selected.";
    var summary = text(options.summary) || (mode === "today" ? dailySummary : reportSummary(mode, rows));
    var columns = resolveColumns(options);
    var header = columns
      .map(function (column) {
        return (
          '<th style="padding:7px;border:1px solid #6b7280;background:#e5e7eb;text-align:left;vertical-align:top;">' +
          escapeHtml(column.label) +
          "</th>"
        );
      })
      .join("");
    var body = rows
      .map(function (row) {
        return (
          "<tr>" +
          columns
            .map(function (column) {
              return (
                '<td style="padding:7px;border:1px solid #9ca3af;text-align:left;vertical-align:top;">' +
                escapeHtml(columnValue(row, column.id)).replace(/\r?\n/g, "<br>") +
                "</td>"
              );
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    var cards = eligibleCards.map(cardHtml).filter(Boolean).join("");
    var html =
      '<div style="font-family:Arial,sans-serif;color:#111827;">' +
      '<h2 style="margin:0 0 6px;font-size:20px;">' +
      escapeHtml(title) +
      "</h2>" +
      (summary
        ? '<p style="margin:0 0 14px;font-size:13px;color:#374151;">' +
          escapeHtml(summary) +
          "</p>"
        : "") +
      '<table border="1" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">' +
      "<thead><tr>" +
      header +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table>" +
      cards +
      "</div>";
    var plain = [title];
    if (summary) {
      plain.push(summary);
    }
    plain.push("", columns.map(function (column) { return column.label; }).join("\t"));
    rows.forEach(function (row) {
      plain.push(
        columns
          .map(function (column) {
            return columnValue(row, column.id).replace(/[\t\r\n]+/g, " ");
          })
          .join("\t")
      );
    });
    eligibleCards.forEach(function (row) {
      if (!row || !row.reportCard) {
        return;
      }
      var cardText = cardPlainText(parseCardContent(row.reportCard), row.reportCard.text);
      if (cardText) {
        plain.push("", cardText);
      }
    });
    return {
      title: title,
      summary: summary,
      html: html,
      plainText: plain.join("\n"),
      arrestCount: rows.length,
      cardCount: cardCount,
      missingCardCount: rows.length - cardCount,
      encounterCount: encounterCount,
      missingEncounterCount: missingEncounterCount,
      visibleColumns: columns.map(function (column) { return column.id; }),
      warnings: missingEncounterCount ? [missingEncounterCount + " arrest" + (missingEncounterCount === 1 ? " is" : "s are") +
        " missing a valid Encounter link and excluded from the encounter count."] : [],
      mode: mode
    };
  }

  root.arrestReport = {
    collect: collect,
    hydratePhotos: hydratePhotos,
    build: build,
    cardForArrest: cardForArrest,
    parseCardContent: parseCardContent,
    escapeHtml: escapeHtml,
    sanitizedCardMarkup: sanitizedCardMarkup,
    columns: DEFAULT_COLUMNS,
    sortRows: sortRows,
    uniqueEncounterCount: uniqueEncounterCount,
    columnValue: columnValue,
    reportCards: reportCards
  };
})(typeof window !== "undefined" ? window : globalThis);
