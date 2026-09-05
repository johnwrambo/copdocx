/**
 * Baseball card page: hydrate from a canonical case + Book-In handoff,
 * then upsert one saved card snapshot for the arrest.
 */
(function (global) {
  "use strict";

  var HANDOFF_KEY = "copdocx.baseball.handoff.v1";
  var photoDataUrl = "";
  var loadedPhotoMediaId = "";
  var pendingPhotoName = "";
  var photoDirty = false;
  var photoRevision = 0;
  var savingCard = false;
  var loadedCardId = "";
  var currentBookInRecordId = "";
  var currentPersonId = "";
  var loadedCardFingerprint = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function model() {
    return global.COPDoc && global.COPDoc.model;
  }

  function mediaStore() {
    return global.COPDoc && global.COPDoc.media;
  }

  function readHandoff() {
    try {
      var raw = sessionStorage.getItem(HANDOFF_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function queryLeadId() {
    var fromUrl = "";
    try {
      fromUrl = new URLSearchParams(global.location.search).get("leadId") || "";
    } catch (error) {
      fromUrl = "";
    }
    if (fromUrl) {
      return fromUrl;
    }
    var handoff = readHandoff();
    return text(handoff && handoff.leadId);
  }

  function queryBookInRecordId() {
    try {
      return text(
        new URLSearchParams(global.location.search).get("recordId") || ""
      );
    } catch (error) {
      return "";
    }
  }

  function activeHandoff(leadId) {
    var handoff = readHandoff();
    if (!handoff) {
      return null;
    }
    if (leadId && handoff.leadId && text(handoff.leadId) !== text(leadId)) {
      return null;
    }
    return handoff;
  }

  function syncBookInBackLink(leadId) {
    var back = byId("appBarBack");
    if (!back) {
      return;
    }
    var params = new URLSearchParams();
    var encounterId = "";
    try {
      encounterId =
        new URLSearchParams(global.location.search).get("encounterId") || "";
    } catch (error) {
      encounterId = "";
    }
    if (encounterId) {
      params.set("encounterId", encounterId);
    }
    if (leadId) {
      params.set("leadId", leadId);
    }
    if (currentBookInRecordId) {
      params.set("recordId", currentBookInRecordId);
    }
    back.href = "bookin.html" + (params.toString() ? "?" + params.toString() : "");
  }

  function setStatus(message, level) {
    var local = byId("baseballCardStatus");
    if (local) {
      local.hidden = !message;
      local.textContent = message || "";
      local.classList.toggle("is-ok", level === "success");
    }
    if (global.COPDoc && global.COPDoc.setAppBarStatus) {
      global.COPDoc.setAppBarStatus(
        message,
        level === "success" ? { ok: true } : undefined
      );
    }
  }

  function catalogLabel(items, code) {
    var key = text(code);
    if (!key) {
      return "";
    }
    var normalized = key.toLowerCase();
    var list = items || [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (
        list[i] &&
        (text(list[i].code).toLowerCase() === normalized ||
          text(list[i].label).toLowerCase() === normalized ||
          text(list[i].official).toLowerCase() === normalized)
      ) {
        return text(list[i].label || list[i].official || key);
      }
    }
    return key;
  }

  function countryLabel(code) {
    return catalogLabel(global.COUNTRIES || [], code);
  }

  function dispositionLabel(code) {
    return catalogLabel(global.IMMIGRATION_DISPOSITIONS || [], code);
  }

  function fillIfEmpty(id, value) {
    var el = byId(id);
    var valueText = text(value);
    if (el && valueText && !text(el.value)) {
      el.value = valueText;
    }
  }

  function fillRow(row, data) {
    if (!row || !data) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var el = row.querySelector('[data-field="' + key + '"]');
      var valueText = text(data[key]);
      if (el && valueText) {
        el.value = valueText;
      }
    });
  }

  function arrestDateOf(arrest) {
    return text(arrest && (arrest.arrestDate || arrest.arrestDateTime)).slice(0, 10);
  }

  function arrestForContext(arrests) {
    if (currentBookInRecordId && (arrests || []).some(function (row) {
      return row && row.voidedAt &&
        [row.bookingId, row.bookinRecordId].map(text).indexOf(currentBookInRecordId) !== -1;
    })) return null;
    var rows = (Array.isArray(arrests) ? arrests : []).filter(function (row) {
      return row && !row.voidedAt;
    });
    var exact = rows.filter(function (row) {
      return (
        currentBookInRecordId &&
        [row && row.bookinRecordId, row && row.bookingId].map(text).indexOf(currentBookInRecordId) !== -1
      );
    })[0];
    if (currentBookInRecordId) return exact || null;
    return (
      rows.sort(function (left, right) {
        return text(
          right && (right.arrestDateTime || right.arrestDate || right.createdAt)
        ).localeCompare(
          text(left && (left.arrestDateTime || left.arrestDate || left.createdAt))
        );
      })[0] || null
    );
  }

  function bookingLifecycleError(subject, recordId) {
    var voided = (subject && subject.arrests || []).some(function (row) {
      return row && row.voidedAt && recordId &&
        [row.bookinRecordId, row.bookingId].map(text).indexOf(recordId) !== -1;
    });
    try {
      var packets = JSON.parse(localStorage.getItem("alien-book-in.saved-records.v1") || "[]");
      if (!Array.isArray(packets)) throw new Error("Book-In data is unavailable.");
      voided = voided || packets.some(function (row) {
        return row && row.voidedAt && recordId &&
          [row.id, row.bookinRecordId, row.bookingId].map(text).indexOf(recordId) !== -1;
      });
      var packet = packets.filter(function(row) { return row && text(row.id) === recordId; })[0];
      if (packet && packet.personId && text(packet.personId) !== text(subject && subject.personId)) {
        return "The booking now belongs to a different Person. Reload the card before saving.";
      }
    } catch (error) {
      return "Book-In data could not be verified. The baseball card was not saved.";
    }
    return voided ? "This booking was voided. Its saved baseball card remains historical and cannot be updated." : "";
  }

  function latestCard(cards) {
    return (
      (cards || []).slice().sort(function (left, right) {
        return text(right && right.generatedAt).localeCompare(
          text(left && left.generatedAt)
        );
      })[0] || null
    );
  }

  function cardForContext(cards, arrest) {
    var rows = Array.isArray(cards) ? cards : [];
    var recordId = currentBookInRecordId || text(arrest && arrest.bookinRecordId);
    var byRecord = rows.filter(function (card) {
      return recordId && text(card && card.bookinRecordId) === recordId;
    });
    if (byRecord.length) {
      return latestCard(byRecord);
    }
    var arrestDate = arrestDateOf(arrest) || text(byId("arrestDate") && byId("arrestDate").value);
    var byDate = rows.filter(function (card) {
      return (
        arrestDate &&
        !text(card && card.bookinRecordId) &&
        text(card && card.arrestDate) === arrestDate
      );
    });
    return byDate.length ? latestCard(byDate) : null;
  }

  function setForeignWarrants(value, country) {
    var select = byId("foreignWarrants");
    var countryInput = byId("foreignWarrantCountry");
    if (select) {
      select.value = value === true || value === "yes" ? "yes" : "no";
    }
    if (countryInput) {
      countryInput.value = select && select.value === "yes" ? text(country) : "";
    }
    updateForeignWarrantControls();
  }

  function updateForeignWarrantControls() {
    var select = byId("foreignWarrants");
    var countryInput = byId("foreignWarrantCountry");
    var yes = Boolean(select && select.value === "yes");
    if (!countryInput) {
      return;
    }
    countryInput.disabled = !yes;
    countryInput.required = yes;
    countryInput.setAttribute("aria-required", yes ? "true" : "false");
    if (!yes) {
      countryInput.value = "";
    }
  }

  function hydrateFromLead(snap) {
    var m = model();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    currentPersonId = text(subject.personId) || currentPersonId;
    var name = subject.name || {};
    var immigration = subject.immigration || {};
    var criminal = subject.criminal || {};
    var arrests = Array.isArray(subject.arrests) ? subject.arrests : [];
    var arrest = arrestForContext(arrests);
    if (!currentBookInRecordId && arrest) {
      currentBookInRecordId = text(arrest.bookinRecordId);
    }

    fillIfEmpty("lastName", name.lastName);
    fillIfEmpty("firstName", name.firstName);
    fillIfEmpty("age", subject.age);
    fillIfEmpty("country", countryLabel(subject.citizenship));
    fillIfEmpty(
      "alienNumber",
      typeof global.formatAlienNumber === "function"
        ? global.formatAlienNumber(immigration.alienNumber)
        : immigration.alienNumber
    );
    fillIfEmpty("disposition", dispositionLabel(immigration.disposition));
    fillIfEmpty("finalOrderDate", immigration.finalOrderDate);
    fillIfEmpty("firstDeportationDate", immigration.firstDeportationDate);
    fillIfEmpty("lastDeportationDate", immigration.lastDeportationDate);
    fillIfEmpty("arrestDate", arrestDateOf(arrest));
    var gender = text(subject.gender || subject.sex).toLowerCase();
    fillIfEmpty("baseballGender", gender === "f" || gender === "female" ? "Female" : gender === "m" || gender === "male" ? "Male" : "");

    var derived =
      m && typeof m.deriveCriminalProfile === "function"
        ? m.deriveCriminalProfile(subject)
        : criminal;
    var criminalBox = byId("isCriminal");
    if (criminalBox) {
      criminalBox.checked = Boolean(
        derived && (derived.isCriminal || derived.hasCriminalRecord)
      );
    }

    setForeignWarrants(
      criminal.hasForeignWarrants === true,
      countryLabel(criminal.foreignWarrantCountry)
    );

    var convictions = Array.isArray(subject.convictions)
      ? subject.convictions
      : [];
    var list = byId("criminalHistoryList");
    if (list && convictions.length && typeof global.addCriminalHistoryRow === "function") {
      convictions.forEach(function (row) {
        if (!row || !(row.crime || row.charge)) {
          return;
        }
        fillRow(global.addCriminalHistoryRow(), {
          charge: row.crime || row.charge || "",
          convictionDate: row.convictionDate || "",
          jurisdictionType: row.jurisdictionType || (row.city && !row.county ? "City" : "County"),
          jurisdiction: row.jurisdiction || row.county || row.city || "",
          state: row.state || "",
          court: row.court || ""
        });
      });
    }

    var card = cardForContext(immigration.baseballCards, arrest);
    return { subject: subject, arrest: arrest, card: card };
  }

  function hydrateFromHandoff(data) {
    if (!data) {
      return;
    }
    currentBookInRecordId = text(data.bookinRecordId) || currentBookInRecordId;
    fillIfEmpty("firstName", data.firstName);
    fillIfEmpty("lastName", data.lastName);
    fillIfEmpty("age", data.age);
    fillIfEmpty("country", data.country);
    fillIfEmpty(
      "alienNumber",
      typeof global.formatAlienNumber === "function"
        ? global.formatAlienNumber(data.alienNumber)
        : data.alienNumber
    );
    fillIfEmpty("disposition", data.disposition);
    fillIfEmpty("arrestDate", data.arrestDate);
    fillIfEmpty("finalOrderDate", data.finalOrderDate);
    fillIfEmpty("firstDeportationDate", data.firstDeportationDate);
    fillIfEmpty("lastDeportationDate", data.lastDeportationDate);
    fillIfEmpty("baseballGender", data.gender);
    if (data.foreignWarrants === "yes" || data.foreignWarrants === "no") {
      setForeignWarrants(
        data.foreignWarrants === "yes",
        data.foreignWarrantCountry
      );
    }
    var criminalBox = byId("isCriminal");
    if (criminalBox && data.isCriminal) {
      criminalBox.checked = true;
    }
  }

  function setPhoto(dataUrl, options) {
    options = options || {};
    photoDataUrl = /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,/i.test(text(dataUrl))
      ? text(dataUrl)
      : "";
    photoDirty = options.stored !== true;
    photoRevision += 1;
    var preview = byId("arrestPhotoPreview");
    var remove = byId("removeArrestPhoto");
    if (preview) {
      preview.hidden = !photoDataUrl;
      if (photoDataUrl) {
        preview.src = photoDataUrl;
      } else {
        preview.removeAttribute("src");
      }
    }
    if (remove) {
      remove.hidden = !photoDataUrl;
    }
    if (typeof global.refreshBaseballCardPhoto === "function") {
      global.refreshBaseballCardPhoto();
    }
  }

  function blobPartToDataUrl(part) {
    return new Promise(function (resolve, reject) {
      var payload = part && part.blob;
      if (!payload) {
        reject(new Error("The saved arrest photo is missing."));
        return;
      }
      var mime = text(part.mime) || text(payload.type) || "image/jpeg";
      var blob = payload instanceof Blob
        ? payload
        : new Blob([payload], { type: mime });
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("The saved arrest photo could not be read."));
      };
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.readAsDataURL(blob);
    });
  }

  function readPhotoMedia(mediaId) {
    var api = mediaStore();
    if (!api || typeof api.blob !== "function") {
      return Promise.reject(new Error("The media store is not available."));
    }
    return api.blob(mediaId, "original").catch(function () {
      return api.blob(mediaId, "display");
    }).then(blobPartToDataUrl);
  }

  function hydrateSavedCard(card) {
    if (!card) {
      return Promise.resolve(true);
    }
    loadedCardId = text(card.cardId);
    loadedCardFingerprint = JSON.stringify(card);
    currentBookInRecordId = text(card.bookinRecordId) || currentBookInRecordId;
    loadedPhotoMediaId = text(card.photoMediaId);
    pendingPhotoName = "";
    var contract = global.COPDoc && global.COPDoc.baseball;
    var state = contract && contract.fromCanonical(card);
    if (state && !card.state && !card.fields && typeof global.getBaseballCardState === "function") {
      var defaults = global.getBaseballCardState();
      state.fields = Object.assign({}, defaults.fields, {
        baseballArrestDate: card.arrestDate || defaults.fields.baseballArrestDate,
        baseballDisposition: card.disposition || defaults.fields.baseballDisposition
      });
      state.gender = defaults.gender;
      state.criminalHistory = defaults.criminalHistory;
    }
    setPhoto(state ? state.photoDataUrl : card.photoDataUrl, { stored: true });
    if (state && typeof global.hydrateBaseballCardState === "function") {
      global.hydrateBaseballCardState(state);
    }
    if (card.foreignWarrantsKnown || card.hasForeignWarrants) {
      setForeignWarrants(
        card.hasForeignWarrants === true,
        countryLabel(card.foreignWarrantCountry)
      );
    }
    var editor = byId("baseballCardEditor");
    if (!state && editor && (text(card.html) || text(card.text))) {
      editor.innerHTML = sanitizedCardMarkup(card.html, card.text);
      if (
        !editor.querySelector(".arrest-card") &&
        typeof global.renderBaseballCard === "function"
      ) {
        global.renderBaseballCard(
          typeof global.getRenderedBaseballCardContent === "function"
            ? global.getRenderedBaseballCardContent()
            : null
        );
      }
    }
    if (!loadedPhotoMediaId) {
      return Promise.resolve(true);
    }
    var revision = photoRevision;
    return readPhotoMedia(loadedPhotoMediaId).then(
      function (dataUrl) {
        if (revision === photoRevision) {
          setPhoto(dataUrl, { stored: true });
        }
        return true;
      },
      function () {
        return Boolean(photoDataUrl);
      }
    );
  }

  function editorTextForSave() {
    var editor = byId("baseballCardEditor");
    var value = "";
    if (editor) {
      var blocks = Array.prototype.map.call(editor.children || [], function (child) {
        var tag = String(child.tagName || "").toUpperCase();
        if (tag === "UL" || tag === "OL") {
          return Array.prototype.filter
            .call(child.children || [], function (item) {
              return String(item.tagName || "").toUpperCase() === "LI";
            })
            .map(function (item) {
              var itemText = text(item.innerText || item.textContent);
              return itemText ? "• " + itemText : "";
            })
            .filter(Boolean)
            .join("\n");
        }
        return text(child.innerText || child.textContent);
      }).filter(Boolean);
      value = blocks.length
        ? blocks.join("\n\n")
        : text(editor.innerText || editor.textContent);
    }
    if (!value && typeof global.createBaseballText === "function") {
      value = text(global.createBaseballText());
    }
    return value.replace(/\u00a0/g, " ");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizedCardMarkup(sourceHtml, fallbackText) {
    var fallback = "<div>" +
      escapeHtml(fallbackText).replace(/\r?\n/g, "<br>") +
      "</div>";
    if (
      !text(sourceHtml) ||
      typeof document === "undefined" ||
      typeof document.createElement !== "function"
    ) {
      return fallback;
    }
    var template = document.createElement("template");
    template.innerHTML = String(sourceHtml);
    var allowed = {
      B: true,
      BR: true,
      DIV: true,
      EM: true,
      H2: true,
      I: true,
      IMG: true,
      LI: true,
      OL: true,
      P: true,
      STRONG: true,
      TABLE: true,
      TBODY: true,
      TD: true,
      TH: true,
      TR: true,
      UL: true
    };
    var dropped = { IFRAME: true, OBJECT: true, SCRIPT: true, STYLE: true };
    function safeClass(value) {
      return String(value || "")
        .split(/\s+/)
        .filter(function (token) {
          return /^[A-Za-z][A-Za-z0-9_-]*$/.test(token);
        })
        .join(" ");
    }
    function safeSrc(value) {
      var src = String(value || "").trim();
      if (/^data:image\/(?:png|jpe?g|webp|svg\+xml)/i.test(src)) {
        return src;
      }
      if (/^https?:\/\//i.test(src) || /^blob:/i.test(src)) {
        return src;
      }
      return "";
    }
    function attrsFor(node, tag) {
      var out = "";
      var className = safeClass(node.getAttribute && node.getAttribute("class"));
      if (className) {
        out += ' class="' + escapeHtml(className) + '"';
      }
      if (tag === "TD" || tag === "TH") {
        var rowspan = String((node.getAttribute && node.getAttribute("rowspan")) || "");
        var scope = String((node.getAttribute && node.getAttribute("scope")) || "");
        if (/^[0-9]+$/.test(rowspan)) {
          out += ' rowspan="' + rowspan + '"';
        }
        if (scope === "row" || scope === "col") {
          out += ' scope="' + scope + '"';
        }
      }
      if (tag === "IMG") {
        var src = safeSrc(node.getAttribute && node.getAttribute("src"));
        var alt = String((node.getAttribute && node.getAttribute("alt")) || "");
        if (src) {
          out += ' src="' + escapeHtml(src) + '"';
        }
        if (alt) {
          out += ' alt="' + escapeHtml(alt) + '"';
        }
      }
      if (tag === "TABLE") {
        var label = String((node.getAttribute && node.getAttribute("aria-label")) || "");
        if (label) {
          out += ' aria-label="' + escapeHtml(label) + '"';
        }
      }
      return out;
    }
    function clean(node) {
      if (node.nodeType === 3) {
        return escapeHtml(node.nodeValue || "");
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
      if (tag === "IMG") {
        return "<img" + attrsFor(node, tag) + ">";
      }
      return (
        "<" +
        tag.toLowerCase() +
        attrsFor(node, tag) +
        ">" +
        children +
        "</" +
        tag.toLowerCase() +
        ">"
      );
    }
    var cleaned = Array.prototype.map.call(template.content.childNodes, clean).join("");
    return cleaned || fallback;
  }

  function safeCardHtml(cardText) {
    var editor = byId("baseballCardEditor");
    return sanitizedCardMarkup(editor && editor.innerHTML, cardText);
  }

  function foreignWarrantValues() {
    var has = Boolean(byId("foreignWarrants") && byId("foreignWarrants").value === "yes");
    return {
      known: true,
      has: has,
      country: has ? text(byId("foreignWarrantCountry") && byId("foreignWarrantCountry").value) : ""
    };
  }

  function validateCard() {
    var warrants = foreignWarrantValues();
    if (warrants.has && !warrants.country) {
      setStatus("Enter the country for the foreign warrant.", "error");
      if (byId("foreignWarrantCountry")) {
        byId("foreignWarrantCountry").focus();
      }
      return false;
    }
    return true;
  }

  function findExistingCard(cards, recordId, arrestDate) {
    var rows = Array.isArray(cards) ? cards : [];
    var byIdMatch = rows.filter(function (card) {
      return loadedCardId && text(card && card.cardId) === loadedCardId;
    })[0];
    if (byIdMatch) {
      return byIdMatch;
    }
    var byRecord = rows.filter(function (card) {
      return recordId && text(card && card.bookinRecordId) === recordId;
    });
    if (byRecord.length) {
      return latestCard(byRecord);
    }
    var byDate = rows.filter(function (card) {
      return (
        arrestDate &&
        !text(card && card.bookinRecordId) &&
        text(card && card.arrestDate) === arrestDate
      );
    });
    return byDate.length ? latestCard(byDate) : null;
  }

  function dataUrlToBlob(dataUrl) {
    var match = /^data:([^;,]+);base64,(.+)$/i.exec(text(dataUrl));
    if (!match || typeof global.atob !== "function") {
      throw new Error("The arrest photo could not be prepared for storage.");
    }
    var binary = global.atob(match[2]);
    var bytes = new Uint8Array(binary.length);
    var i;
    for (i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: match[1] || "image/jpeg" });
  }

  function arrestPhotoFilename(subject, arrestDate) {
    var name = subject && subject.name ? subject.name : {};
    var stem = [text(name.lastName), text(name.firstName), text(arrestDate)]
      .filter(Boolean)
      .join("-") || "arrest-photo";
    return stem.replace(/[^a-z0-9._-]+/gi, "-") + ".jpg";
  }

  function savePhotoToMedia(subject, arrestDate, recordId) {
    var api = mediaStore();
    if (!api || typeof api.save !== "function") {
      return Promise.reject(new Error("The media store is not available."));
    }
    var personId = text(subject && subject.personId) || currentPersonId;
    if (!personId) {
      return Promise.reject(new Error("The case subject is missing a Person ID."));
    }
    var blob;
    try {
      blob = dataUrlToBlob(photoDataUrl);
    } catch (error) {
      return Promise.reject(error);
    }
    return api.save({
      owner: { type: "PERSON", id: personId },
      mediaClass: "photo",
      original: blob,
      display: blob,
      mime: blob.type || "image/jpeg",
      originalName: pendingPhotoName || arrestPhotoFilename(subject, arrestDate),
      fields: {
        kind: "subject",
        documentType: "BASEBALL_CARD_ARREST_PHOTO",
        documentId: recordId,
        caption: "Photo from arrest in the field",
        captionCustom: true,
        takenAt: arrestDate,
        takenAtPrecision: arrestDate ? "day" : "",
        takenAtSource: arrestDate ? "operator" : "",
        place: "Arrest in the field",
        tags: ["baseball-card", "arrest-field", recordId].filter(Boolean)
      }
    }).then(
      function (saved) {
        return { mediaId: text(saved && saved.mediaId), created: true };
      },
      function (error) {
        if (error && error.code === "ALREADY_SAVED" && error.existing) {
          return {
            mediaId: text(error.existing.mediaId),
            created: false
          };
        }
        throw error;
      }
    );
  }

  function mediaReferencedByCards(cards, mediaId) {
    var id = text(mediaId);
    return Boolean(
      id &&
      (cards || []).some(function (card) {
        return text(card && card.photoMediaId) === id || text(card && card.finalizedSnapshot && card.finalizedSnapshot.photoMediaId) === id;
      })
    );
  }

  function removeMediaQuietly(mediaId) {
    var api = mediaStore();
    if (!mediaId || !api || typeof api.remove !== "function") {
      return Promise.resolve();
    }
    return api.remove(mediaId).catch(function (error) {
      if (global.console && typeof global.console.warn === "function") {
        global.console.warn("An obsolete Baseball Card photo could not be removed.", error);
      }
    });
  }

  function setSaveBusy(busy) {
    ["saveBaseballCardButton", "finalizeBaseballCardButton", "generatebaseballCard"].forEach(function (id) {
      var button = byId(id);
      if (button) {
        button.disabled = !!busy;
      }
    });
  }

  async function persistBaseballCard(options) {
    options = options && options.finalize === true ? { finalize: true } : {};
    if (savingCard) {
      return false;
    }
    if (!validateCard()) {
      return false;
    }
    var cardText = editorTextForSave();
    if (!cardText) {
      setStatus("Generate or enter the baseball card text before saving.", "error");
      return false;
    }
    var leadId = queryLeadId();
    if (!leadId) {
      setStatus("No case is attached. Open the card from Book-In so it can be saved.", "error");
      return false;
    }
    var m = model();
    if (!m || !m.store || typeof m.createBaseballCard !== "function") {
      setStatus("The case store is not available.", "error");
      return false;
    }
    m.store.loadFromDisk();
    var snap = m.store.getLead(leadId);
    if (!snap) {
      setStatus("Case not found. The baseball card was not saved.", "error");
      return false;
    }
    if (m.isCommitted && !m.isCommitted(snap)) {
      setStatus("File the case before saving a baseball card.", "error");
      return false;
    }
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
    if (!subject) {
      setStatus("The case has no subject.", "error");
      return false;
    }
    // A stale card tab must not write new output onto a voided booking.
    var lifecycleError = bookingLifecycleError(subject, currentBookInRecordId);
    if (lifecycleError) {
      setStatus(lifecycleError, "error");
      return false;
    }

    var warrants = foreignWarrantValues();
    subject.immigration = subject.immigration || {};
    if (!Array.isArray(subject.immigration.baseballCards)) {
      subject.immigration.baseballCards = [];
    }

    var arrestDate = text(byId("arrestDate") && byId("arrestDate").value);
    var recordId = currentBookInRecordId;
    var existing = findExistingCard(
      subject.immigration.baseballCards,
      recordId,
      arrestDate
    );
    if (existing && (!loadedCardFingerprint || JSON.stringify(existing) !== loadedCardFingerprint)) {
      setStatus("This card changed in another window. Reload it before saving.", "error");
      return false;
    }
    if (loadedCardId && !existing) {
      setStatus("The saved card was removed in another window. Reload before saving.", "error");
      return false;
    }
    var contract = global.COPDoc && global.COPDoc.baseball;
    var structured = contract && typeof global.getBaseballCardState === "function" ? global.getBaseballCardState() : null;
    var exactArrest = arrestForContext(subject.arrests || []);
    if (recordId && !exactArrest) {
      setStatus("This booking is no longer linked to this Person's active arrest. Reload before saving.", "error");
      return false;
    }
    if (options.finalize && (!structured || !exactArrest || !arrestDate || arrestDateOf(exactArrest) !== arrestDate)) {
      setStatus("Finalizing requires this booking's active arrest and its exact arrest date.", "error");
      return false;
    }
    var baseFingerprint = existing ? JSON.stringify(existing) : "";
    var previousMediaId = text(existing && existing.photoMediaId) || loadedPhotoMediaId;
    var nextMediaId = previousMediaId;
    var createdMediaId = "";

    savingCard = true;
    setSaveBusy(true);
    setStatus("Saving the baseball card…");
    try {
      if (photoDataUrl && (photoDirty || !nextMediaId)) {
        var photoResult = await savePhotoToMedia(subject, arrestDate, recordId);
        nextMediaId = photoResult.mediaId;
        if (!nextMediaId) {
          throw new Error("The arrest photo did not receive a Media ID.");
        }
        if (photoResult.created) {
          createdMediaId = nextMediaId;
        }
      } else if (!photoDataUrl && photoDirty) {
        nextMediaId = "";
      }

      var cardInput = {
        generatedAt: m.nowIso ? m.nowIso() : new Date().toISOString(),
        text: cardText,
        html: safeCardHtml(cardText),
        photoMediaId: nextMediaId,
        arrestDate: arrestDate,
        disposition: text(byId("disposition") && byId("disposition").value),
        bookinRecordId: recordId,
        foreignWarrantsKnown: true,
        hasForeignWarrants: warrants.has,
        foreignWarrantCountry: warrants.country
      };
      if (structured) {
        structured.savedAt = cardInput.generatedAt;
        structured.photoMediaId = nextMediaId;
        structured.photoDataUrl = nextMediaId ? "" : photoDataUrl;
        cardInput = Object.assign({}, cardInput, contract.toCanonical(structured, Object.assign({existing: existing || {}}, cardInput)));
        if (existing && existing.finalizedSnapshot) cardInput.finalizedSnapshot = existing.finalizedSnapshot;
        if (existing && existing.arrestOfDay) cardInput.arrestOfDay = existing.arrestOfDay;
      }
      if (existing && existing.cardId) {
        cardInput.cardId = existing.cardId;
      }
      var card = m.createBaseballCard(cardInput);
      if (options.finalize) {
        card.finalizedSnapshot = contract.finalize(structured, {
          cardId: card.cardId, personId: subject.personId, leadId: leadId,
          bookinRecordId: recordId, arrestId: exactArrest.arrestId,
          subjectId: exactArrest.subjectId || "", encounterId: exactArrest.encounterId || "",
          photoMediaId: nextMediaId, arrestDateKey: arrestDate, generatedAt: cardInput.generatedAt
        });
        card.arrestOfDay = {date: arrestDate, markedAt: cardInput.generatedAt};
      }
      m.store.loadFromDisk();
      var latest = m.store.getLead(leadId);
      var latestSubject = latest && (m.subjectOf ? m.subjectOf(latest) : latest.person);
      var lateLifecycleError = bookingLifecycleError(latestSubject, recordId);
      if (!latest || !latestSubject || (m.store.diskError && m.store.diskError()) || lateLifecycleError) {
        throw new Error(lateLifecycleError || "The case changed or became unavailable while saving. Reload it before saving the card.");
      }
      if (text(latestSubject.personId) !== text(subject.personId)) throw new Error("The case subject changed while saving. Reload the card.");
      latestSubject.immigration = latestSubject.immigration || {};
      var latestCards = latestSubject.immigration.baseballCards || [];
      var latestExisting = findExistingCard(latestCards, recordId, arrestDate);
      if ((latestExisting ? JSON.stringify(latestExisting) : "") !== baseFingerprint) {
        throw new Error("This card changed while its photo was saving. Reload it before saving.");
      }
      if (options.finalize) {
        var currentArrest = arrestForContext(latestSubject.arrests || []);
        if (!currentArrest || JSON.stringify(currentArrest) !== JSON.stringify(exactArrest)) throw new Error("The arrest changed while finalizing. Reload the card.");
      }
      latestSubject.immigration.baseballCards = latestCards.filter(function (item) { return text(item.cardId) !== card.cardId; }).concat([card]);
      latest.person = latestSubject;
      var saved = m.store.saveLead(latest, { mode: "commit" });
      if (!saved || !saved.ok) {
        throw new Error((saved && saved.error) || "Could not save the baseball card.");
      }

      loadedCardId = card.cardId;
      var savedLead = m.store.getLead(leadId);
      var savedSubject = savedLead && (m.subjectOf ? m.subjectOf(savedLead) : savedLead.person);
      var savedCard = savedSubject && (savedSubject.immigration.baseballCards || []).filter(function(item){return item.cardId===card.cardId;})[0];
      loadedCardFingerprint = JSON.stringify(savedCard || card);
      loadedPhotoMediaId = nextMediaId;
      photoDirty = false;
      pendingPhotoName = "";
      if (
        previousMediaId &&
        previousMediaId !== nextMediaId &&
        !mediaReferencedByCards(latestSubject.immigration.baseballCards, previousMediaId)
      ) {
        await removeMediaQuietly(previousMediaId);
      }
      setStatus(
        options.finalize ? "Finalized as arrest of the day. Reports use this snapshot until you finalize another card for this date." : existing
          ? "Updated the saved baseball card for this arrest."
          : "Saved the baseball card on this arrest's canonical case.",
        "success"
      );
      return true;
    } catch (error) {
      if (createdMediaId) {
        await removeMediaQuietly(createdMediaId);
      }
      setStatus(error.message || "Could not save the baseball card.", "error");
      return false;
    } finally {
      savingCard = false;
      setSaveBusy(false);
    }
  }

  function imageDataFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\/(?:png|jpe?g|webp|gif|bmp)$/i.test(file.type || "")) {
        reject(new Error("Choose a PNG, JPEG, WebP, GIF, or BMP image."));
        return;
      }
      if (file.size > 24 * 1024 * 1024) {
        reject(new Error("Choose an image smaller than 24 MB."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("The selected photo could not be read."));
      };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () {
          reject(new Error("The selected file is not a readable image."));
        };
        image.onload = function () {
          resolve(String(reader.result || ""));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function onPhotoSelected(event) {
    var input = event && event.target;
    var file = input && input.files && input.files[0];
    if (!file) {
      return;
    }
    setStatus("Preparing arrest photo…");
    imageDataFromFile(file)
      .then(function (dataUrl) {
        pendingPhotoName = text(file.name) || "arrest-photo";
        setPhoto(dataUrl);
        setStatus("Arrest photo is ready. Save the card to keep it.", "success");
      })
      .catch(function (error) {
        if (input) {
          input.value = "";
        }
        setStatus(error.message || "Could not prepare the arrest photo.", "error");
      });
  }

  function getRenderedCardContent() {
    if (typeof global.getRenderedBaseballCardContent === "function") {
      var structured = global.getRenderedBaseballCardContent();
      if (structured) return structured;
    }
    var editor = byId("baseballCardEditor");
    var narrative = "";
    var heading = "";
    var bullets = [];
    if (editor && typeof editor.querySelector === "function") {
      var narrativeEl =
        editor.querySelector(".narrative-cell p") || editor.querySelector("p");
      var headingEl =
        editor.querySelector(".narrative-cell h2") || editor.querySelector("h2");
      if (!headingEl) {
        var paragraphs = editor.querySelectorAll("p");
        if (paragraphs.length > 1) {
          headingEl = paragraphs[1];
        }
      }
      bullets = Array.prototype.map
        .call(editor.querySelectorAll("li"), function (item) {
          return text(item.textContent);
        })
        .filter(Boolean);
      narrative = text(narrativeEl && narrativeEl.textContent);
      heading = text(headingEl && headingEl.textContent);
    }
    if (!narrative || !heading) {
      var cardText = editorTextForSave();
      var lines = String(cardText || "").replace(/\r\n/g, "\n").split("\n");
      var narrativeLines = [];
      var i;
      bullets = [];
      heading = "";
      for (i = 0; i < lines.length; i += 1) {
        if (/^INTERNAL Background/i.test(lines[i])) {
          heading = text(lines[i]);
          continue;
        }
        if (/^\s*•/.test(lines[i])) {
          var bullet = text(lines[i].replace(/^\s*•\s*/, ""));
          if (bullet) {
            bullets.push(bullet);
          }
          continue;
        }
        if (!heading && text(lines[i])) {
          narrativeLines.push(text(lines[i]));
        }
      }
      narrative = narrative || narrativeLines.join(" ");
      heading = heading || "INTERNAL Background Required for Privacy Review:";
    }
    return {
      narrative: narrative,
      heading: heading,
      bullets: bullets
    };
  }

  function emailPhotoSource() {
    return (
      photoDataUrl ||
      (typeof global.baseballCardPhotoPlaceholder === "function"
        ? global.baseballCardPhotoPlaceholder()
        : "")
    );
  }

  function emailCardHtml(photoSource) {
    var content = getRenderedCardContent();
    if (typeof global.buildBaseballCardEmailMarkup === "function") {
      return global.buildBaseballCardEmailMarkup(
        content,
        photoSource || emailPhotoSource()
      );
    }
    return safeCardHtml(editorTextForSave());
  }

  async function preparedEmailCardHtml(input) {
    var api = global.COPDoc && global.COPDoc.baseball;
    if (!input) {
      var state = api && typeof global.getBaseballCardState === "function" ? global.getBaseballCardState() : null;
      if (state) state.content = getRenderedCardContent();
      input = { state: state, photoDataUrl: photoDataUrl, legacyHtml: state ? "" : emailCardHtml() };
    }
    if (!input.state) return input.legacyHtml;
    var photo = await api.renderPhoto(input.state, input.photoDataUrl);
    return api.renderEmail(input.state, photo);
  }

  function clipboardHtml(html) {
    if (typeof global.clipboardHtmlEnvelope === "function") {
      return global.clipboardHtmlEnvelope(html);
    }
    return html;
  }

  function copyHtmlWithSelection(html) {
    if (!document.body || typeof document.createElement !== "function") {
      return false;
    }
    if (
      typeof document.createRange !== "function" ||
      typeof global.getSelection !== "function" ||
      typeof document.execCommand !== "function"
    ) {
      return false;
    }
    var holder = document.createElement("div");
    holder.setAttribute("contenteditable", "true");
    holder.setAttribute("aria-hidden", "true");
    holder.setAttribute(
      "style",
      "position:fixed;left:0;top:0;width:1050px;height:1px;opacity:0.01;overflow:hidden;z-index:2147483646;background:#fff;color:#111;"
    );
    holder.innerHTML = String(html || "");
    document.body.appendChild(holder);
    holder.focus();
    try {
      var selection = global.getSelection();
      var range = document.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
      return Boolean(document.execCommand("copy"));
    } finally {
      if (global.getSelection) {
        global.getSelection().removeAllRanges();
      }
      holder.remove();
    }
  }

  async function writeHtmlClipboard(html, plainText) {
    var envelope = clipboardHtml(html);
    if (
      !global.isSecureContext ||
      !navigator.clipboard ||
      typeof navigator.clipboard.write !== "function" ||
      typeof global.ClipboardItem !== "function"
    ) {
      return false;
    }
    await navigator.clipboard.write([
      new global.ClipboardItem({
        "text/html": new Blob([envelope], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" })
      })
    ]);
    return true;
  }

  async function generateCardDocument(download) {
    var documents = global.COPDoc && global.COPDoc.documents;
    if (!documents || !documents.captureContext || !documents.generate || !documents.recordDelivery) {
      throw new Error("Document tracking is unavailable. Reload this page before exporting the card.");
    }
    // Capture every editor input before photo rendering yields to another event.
    var content = getRenderedCardContent();
    var api = global.COPDoc && global.COPDoc.baseball;
    var state = api && typeof global.getBaseballCardState === "function" ? global.getBaseballCardState() : null;
    if (state) state.content = content;
    var plain = typeof global.buildBaseballCardPlainText === "function"
      ? global.buildBaseballCardPlainText(content) : editorTextForSave();
    if (!plain) throw new Error("Generate or enter the baseball card text before exporting.");
    var title = [text(byId("lastName") && byId("lastName").value),
      text(byId("firstName") && byId("firstName").value), "Baseball Card"].filter(Boolean).join(" - ");
    var sources = [];
    [["Person", currentPersonId], ["Lead", queryLeadId()], ["Booking", currentBookInRecordId],
      ["BaseballCard", loadedCardId], ["Media", loadedPhotoMediaId]].forEach(function (pair) {
      if (pair[1]) sources.push({ type: pair[0], id: pair[1], authority: "draft" });
    });
    var context = documents.captureContext({ documentType: "baseball-card.html", sources: sources,
      input: { state: state, content: content, photoDataUrl: photoDataUrl, plainText: plain, title: title,
        legacyHtml: state ? "" : emailCardHtml(), download: !!download,
        placeholder: typeof global.baseballCardPhotoPlaceholder === "function" ? global.baseballCardPhotoPlaceholder() : "" }
    });
    var generation = await documents.generate({ documentType: "baseball-card.html", context: context,
      render: async function (snapshot) {
        var input = snapshot.input;
        var html = await preparedEmailCardHtml(input);
        if (!html || html.indexOf("<table") === -1) throw new Error("Generate or enter the baseball card before exporting.");
        if (input.download) {
          html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' +
            escapeHtml(input.title || "ICE Dallas Arrest Card") +
            '</title></head><body style="margin:0;padding:16px;background:#fff;">' + html + "</body></html>";
        }
        return { data: html, mimeType: "text/html;charset=utf-8",
          filename: input.title.replace(/[^a-z0-9._ -]+/gi, "").replace(/\s+/g, "_") + ".html" };
      }
    });
    return { generation: generation, context: context, documents: documents };
  }

  async function copyBaseballCard() {
    if (!validateCard()) return false;
    var prepared;
    try { prepared = await generateCardDocument(false); }
    catch (error) { setStatus(error.message || "The card could not be prepared.", "error"); return false; }
    var html = prepared.generation.artifact.data;
    var input = prepared.context.input;
    var plainText = input.plainText;
    var copied = false, actual = html, mimeType = "text/html", level = "success";
    var message = input.photoDataUrl ? "Baseball Card copied with its photo and formatting."
      : "Baseball Card copied with its formatting and photo placeholder.";
    try { copied = copyHtmlWithSelection(html); } catch (error) {}
    if (!copied) {
      try { copied = await writeHtmlClipboard(html, plainText); if (copied) actual = clipboardHtml(html); }
      catch (error) {}
    }
    if (!copied) {
      try {
        var lightHtml = input.state ? global.COPDoc.baseball.renderEmail(input.state, input.placeholder)
          : global.buildBaseballCardEmailMarkup(input.content, input.placeholder);
        copied = copyHtmlWithSelection(lightHtml);
        actual = lightHtml;
        if (!copied) { copied = await writeHtmlClipboard(lightHtml, plainText); if (copied) actual = clipboardHtml(lightHtml); }
        if (copied) {
          message = "Baseball Card copied with formatting. This browser blocked copying its arrest photo; Download HTML keeps the photo.";
          level = "warning";
        }
      } catch (error) {}
    }
    if (!copied) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(plainText); copied = true; actual = plainText; mimeType = "text/plain";
          message = "Copied plain text. This browser blocked the formatted card and photo; use Download HTML to keep them.";
          level = "warning";
        }
      } catch (error) {}
    }
    try {
      await prepared.documents.recordDelivery(prepared.generation.record.generationId, {
        method: "clipboard", status: copied ? "SUCCEEDED" : "FAILED", artifact: { data: actual, mimeType: mimeType }
      });
    } catch (error) {
      setStatus((copied ? "Card copied, but its delivery record could not be saved: " : "Copy failed; delivery record could not be saved: ") + error.message, "error");
      return false;
    }
    setStatus(copied ? message : "Copy was blocked. Use Download HTML and attach that file to the email.", copied ? level : "error");
    return copied;
  }

  async function downloadBaseballCardHtml() {
    if (!validateCard()) return false;
    var prepared;
    try { prepared = await generateCardDocument(true); }
    catch (error) { setStatus(error.message || "The card could not be prepared.", "error"); return false; }
    var artifact = prepared.generation.artifact;
    var url, link;
    try {
      url = URL.createObjectURL(new Blob([artifact.data], { type: artifact.mimeType }));
      link = document.createElement("a"); link.href = url; link.download = artifact.filename;
      document.body.appendChild(link); link.click();
    } catch (error) {
      try { await prepared.documents.recordDelivery(prepared.generation.record.generationId, {method:"download",status:"FAILED"}); } catch (recordError) {}
      setStatus("Download could not be started: " + error.message, "error"); return false;
    } finally { if (link) link.remove(); if (url) URL.revokeObjectURL(url); }
    try { await prepared.documents.recordDelivery(prepared.generation.record.generationId, {method:"download",status:"SUBMITTED"}); }
    catch (error) { setStatus("Download started, but its delivery record could not be saved: " + error.message, "error"); return false; }
    setStatus("Downloaded the baseball card as HTML.", "success");
    return true;
  }

  function bindControls() {
    var foreignSelect = byId("foreignWarrants");
    if (foreignSelect) {
      foreignSelect.addEventListener("change", updateForeignWarrantControls);
    }
    var photo = byId("arrestPhoto");
    if (photo) {
      photo.addEventListener("change", onPhotoSelected);
    }
    var removePhoto = byId("removeArrestPhoto");
    if (removePhoto) {
      removePhoto.addEventListener("click", function () {
        pendingPhotoName = "";
        setPhoto("");
        if (photo) {
          photo.value = "";
        }
        setStatus("Arrest photo removed. Save the card to keep this change.");
      });
    }
    var save = byId("saveBaseballCardButton");
    if (save) {
      save.addEventListener("click", persistBaseballCard);
    }
    var finalize = byId("finalizeBaseballCardButton");
    if (finalize) finalize.addEventListener("click", function () {
      persistBaseballCard({ finalize: true });
    });
    var copy = byId("copyBaseballCardButton");
    if (copy) {
      copy.addEventListener("click", copyBaseballCard);
    }
    var download = byId("downloadBaseballCardButton");
    if (download) {
      download.addEventListener("click", downloadBaseballCardHtml);
    }
  }

  function boot() {
    if (pageKey() !== "baseballcard") {
      return;
    }
    var leadId = queryLeadId();
    var handoff = activeHandoff(leadId);
    currentBookInRecordId =
      queryBookInRecordId() || text(handoff && handoff.bookinRecordId);
    syncBookInBackLink(leadId);
    var context = null;
    var m = model();
    if (leadId && m && m.store) {
      m.store.loadFromDisk();
      var snap = m.store.getLead(leadId);
      if (snap && (!m.isCommitted || m.isCommitted(snap))) {
        context = hydrateFromLead(snap);
      } else if (!snap) {
        setStatus("Case not found.", "error");
      }
    }
    hydrateFromHandoff(handoff);
    var list = byId("criminalHistoryList");
    if (
      list &&
      !list.querySelector(".criminal-history-row") &&
      typeof global.addCriminalHistoryRow === "function"
    ) {
      global.addCriminalHistoryRow();
    }
    if (typeof global.bindAlienNumberInput === "function" && byId("alienNumber")) {
      global.bindAlienNumberInput(byId("alienNumber"));
    }
    updateForeignWarrantControls();
    bindControls();
    if (typeof global.createBaseballText === "function") {
      global.createBaseballText();
    }
    if (context && context.card) {
      hydrateSavedCard(context.card).then(function (photoLoaded) {
        setStatus(
          photoLoaded
            ? "Loaded the saved baseball card for this arrest."
            : "Loaded the saved card, but its arrest photo is unavailable.",
          photoLoaded ? "success" : "error"
        );
      });
    }
  }

  global.persistBaseballCard = persistBaseballCard;
  global.hydrateSavedBaseballCard = hydrateSavedCard;
  global.copyBaseballCard = copyBaseballCard;
  global.downloadBaseballCardHtml = downloadBaseballCardHtml;
  global.getLiveBaseballCardPhoto = function () {
    return photoDataUrl || "";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
