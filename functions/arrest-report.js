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
    var selected = {};
    (options.bookinRecordIds || []).forEach(function (id) {
      selected[text(id)] = true;
    });
    var selectedOnly = Object.keys(selected).length > 0;
    var records = bookInMap(bookinRecords);
    var rows = [];
    var seen = {};
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
      if (!person) {
        return;
      }
      var criminal = person.criminal || {};
      var immigration = person.immigration || {};
      var cards = Array.isArray(immigration.baseballCards)
        ? immigration.baseballCards
        : [];
      if (options.leadId && text(snap.leadId) !== text(options.leadId)) {
        return;
      }
      (person.arrests || []).forEach(function (arrest) {
        if (!arrest) {
          return;
        }
        var recordId = unambiguousBookingId(arrest, false);
        if (selectedOnly && !selected[recordId]) {
          return;
        }
        var dateKey = text(arrest.arrestDate) || text(arrest.arrestDateTime).slice(0, 10);
        if (options.from && dateKey && dateKey < options.from) {
          return;
        }
        if (options.to && dateKey && dateKey > options.to) {
          return;
        }
        if ((options.from || options.to) && !dateKey) {
          return;
        }
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
        if (options.encounterId) {
          var wantEncounter = text(options.encounterId);
          if (encounterId !== wantEncounter && encounterNumber !== wantEncounter) {
            return;
          }
        }
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
          card: cardForArrest(cards, arrest, {
            personId: text(person.personId),
            encounterId: encounterId
          })
        };
        if (options.q) {
          var hay = [
            row.name,
            row.aNumber,
            row.fbiNumber,
            row.iceEvent,
            row.encounterNumber,
            row.country,
            row.disposition
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(String(options.q).toLowerCase()) === -1) {
            return;
          }
        }
        rows.push(row);
      });
    });
    return rows.sort(function (left, right) {
      return text(right.arrestDateTime).localeCompare(text(left.arrestDateTime));
    });
  }

  function safePhotoDataUrl(value) {
    var candidate = text(value);
    return /^data:image\/(?:png|jpeg|webp);base64,/i.test(candidate)
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
    return Promise.all(
      (rows || []).map(function (row) {
        var copy = Object.assign({}, row);
        var card = row && row.card;
        var legacy = safePhotoDataUrl(card && card.photoDataUrl);
        var mediaId = text(card && card.photoMediaId);
        copy.photoDataUrl = legacy;
        if (!mediaId || !media || typeof media.blob !== "function") {
          return copy;
        }
        if (!cache[mediaId]) {
          cache[mediaId] = media.blob(mediaId, "display")
            .catch(function () {
              return media.blob(mediaId, "original");
            })
            .then(blobPartToDataUrl)
            .catch(function () {
              return "";
            });
        }
        return cache[mediaId].then(function (dataUrl) {
          copy.photoDataUrl = dataUrl || legacy;
          return copy;
        });
      })
    );
  }

  var DEFAULT_UNIT = "DAL-3";
  var INTERNAL_HEADING = "INTERNAL Background Required for Privacy Review:";
  var DEFAULT_COLUMNS = [
    { id: "name", label: "Subject" },
    { id: "age", label: "Age" },
    { id: "country", label: "Country" },
    { id: "aNumber", label: "A-Number" },
    { id: "fbiNumber", label: "FBI Number" },
    { id: "iceEvent", label: "ICE Event" },
    { id: "encounterNumber", label: "Encounter" },
    { id: "disposition", label: "Disposition" },
    { id: "arrestDateTime", label: "Arrest Date/Time" }
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
      var id = text(row && (row.encounterNumber || row.encounterId)).toUpperCase();
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
    if (!Array.isArray(requested) || !requested.length) {
      return DEFAULT_COLUMNS.slice();
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
          return found || { id: column, label: column };
        }
        var id = text(column.id);
        if (!id) {
          return null;
        }
        return { id: id, label: text(column.label) || id };
      })
      .filter(Boolean);
  }

  function columnValue(row, id) {
    if (id === "name" || id === "subject") {
      return text(row && row.name);
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
    var card = row && row.card;
    if (!card) {
      return "";
    }
    var content = parseCardContent(card);
    var photo = safePhotoDataUrl(row.photoDataUrl || card.photoDataUrl);
    var markup =
      typeof global.buildBaseballCardEmailMarkup === "function"
        ? global.buildBaseballCardEmailMarkup(content, photo)
        : fallbackCardEmailMarkup(content, photo);
    return '<div style="margin:20px 0 0;">' + markup + "</div>";
  }

  function build(rows, options) {
    options = options || {};
    rows = Array.isArray(rows) ? rows : [];
    var cardCount = 0;
    rows.forEach(function (row) {
      if (row && row.card) {
        cardCount += 1;
      }
    });
    var encounterCount = uniqueEncounterCount(rows);
    var unit = text(options.unit) || DEFAULT_UNIT;
    var mode = text(options.mode) || "selected";
    var title =
      text(options.title) ||
      reportTitle(unit, mode, rows.length, encounterCount);
    var summary = text(options.summary) || reportSummary(mode, rows);
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
    var cards = rows.map(cardHtml).filter(Boolean).join("");
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
    rows.forEach(function (row) {
      if (!row || !row.card) {
        return;
      }
      var cardText = cardPlainText(parseCardContent(row.card), row.card.text);
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
    columns: DEFAULT_COLUMNS
  };
})(typeof window !== "undefined" ? window : globalThis);
