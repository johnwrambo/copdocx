
const baseballbutton = document.getElementById("generatebaseballCard")
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const ageInput = document.getElementById("age");
const countryInput = document.getElementById("country");
const baseballCardEditor = document.getElementById("baseballCardEditor");
const alienNumberInput = document.getElementById("alienNumber");
const finalOrderDateInput = document.getElementById("finalOrderDate");
const firstDeportationDateInput = document.getElementById("firstDeportationDate");
const lastDeportationDateInput = document.getElementById("lastDeportationDate");
const dispositionInput = document.getElementById("disposition");
const arrestDateInput = document.getElementById("arrestDate");
const foreignWarrantsInput = document.getElementById("foreignWarrants");
const foreignWarrantCountryInput = document.getElementById("foreignWarrantCountry");
const criminalHistoryList = document.getElementById("criminalHistoryList");
const addCriminalHistoryButton = document.getElementById("addCriminalHistory");
let criminalHistorySerial = 0;

function fieldValue(root, name) {
    const el = root.querySelector('[data-field="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
}

function firstLiveField(name) {
    var nodes = document.querySelectorAll('[data-field="' + name + '"]');
    var i;
    for (i = 0; i < nodes.length; i++) {
        if (nodes[i].closest("template")) {
            continue;
        }
        return String(nodes[i].value || "").trim();
    }
    return "";
}

function selectedText(el) {
    if (!el) {
        return "";
    }
    if (el.tagName === "SELECT" && el.options && el.selectedIndex >= 0) {
        return String(el.options[el.selectedIndex].textContent || "").trim();
    }
    return val(el).trim();
}

function criminalHistoryRows() {
    if (criminalHistoryList) {
        return criminalHistoryList.querySelectorAll(".criminal-history-row");
    }
    return document.querySelectorAll("#convictionList > fieldset");
}

function addCriminalHistoryRow() {
    criminalHistorySerial += 1;
    const uid = "ch-" + criminalHistorySerial;
    const row = document.createElement("div");
    row.className = "criminal-history-row";
    row.innerHTML =
        '<div class="field"><label for="' + uid + '-charge">Charge</label>' +
        '<input id="' + uid + '-charge" type="text" data-field="charge"></div>' +
        '<div class="field"><label for="' + uid + '-convictionDate">Conviction date</label>' +
        '<input id="' + uid + '-convictionDate" type="date" data-field="convictionDate"></div>' +
        '<div class="field"><label for="' + uid + '-jurisdictionType">Jurisdiction type</label>' +
        '<select id="' + uid + '-jurisdictionType" data-field="jurisdictionType"><option>County</option><option>City</option></select></div>' +
        '<div class="field"><label for="' + uid + '-jurisdiction">Jurisdiction</label>' +
        '<input id="' + uid + '-jurisdiction" type="text" data-field="jurisdiction"></div>' +
        '<div class="field"><label for="' + uid + '-state">State</label>' +
        '<input id="' + uid + '-state" type="text" data-field="state"></div>' +
        '<div class="field"><label for="' + uid + '-court">Court</label>' +
        '<input id="' + uid + '-court" type="text" data-field="court"></div>' +
        '<div class="baseball-card-actions"><button type="button" data-history-action="up">Move up</button><button type="button" data-history-action="down">Move down</button><button type="button" data-history-action="remove">Remove</button></div>';
    criminalHistoryList.appendChild(row);
    return row;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// type=date is YYYY-MM-DD. Split it so timezone does not roll the day back.
function formatCardDate(iso) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return String(iso || "").trim();
    }
    const month = MONTH_NAMES[Number(match[2]) - 1];
    if (!month) {
        return String(iso).trim();
    }
    return month + " " + Number(match[3]) + ", " + match[1];
}

function titleCase(value) {
    return String(value || "")
        .split(/(\s+|-)/)
        .map(function (token, index) {
            if (!token || /^[\s-]+$/.test(token)) {
                return token;
            }
            const lower = token.toLowerCase();
            if (
                index > 0 &&
                (lower === "of" ||
                    lower === "and" ||
                    lower === "the" ||
                    lower === "de" ||
                    lower === "la" ||
                    lower === "del" ||
                    lower === "van" ||
                    lower === "von")
            ) {
                return lower;
            }
            if (/^mc/i.test(token) && token.length > 2) {
                return "Mc" + titleCase(token.slice(2));
            }
            if (/^o'/i.test(token) && token.length > 2) {
                return "O'" + titleCase(token.slice(2));
            }
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        })
        .join("");
}

function formatState(value) {
    const raw = String(value || "").trim();
    if (/^[A-Za-z]{2}$/.test(raw)) {
        return raw.toUpperCase();
    }
    return titleCase(raw);
}

// formatAlienNumber lives in functions/alien-number.js (shared with book-in).

function val(el) {
    return el && el.value != null ? String(el.value) : "";
}

function countryLabel() {
    var el = countryInput || document.getElementById("citizenship");
    if (!el) {
        return "";
    }
    if (el.tagName === "SELECT" && el.options && el.selectedIndex >= 0) {
        return String(el.options[el.selectedIndex].textContent || "").trim();
    }
    return val(el).trim();
}

function baseballForeignWarrantBullet(value, country) {
    const hasForeignWarrants = String(value || "").trim().toLowerCase() === "yes";
    if (!hasForeignWarrants) {
        return "No foreign warrants.";
    }
    const countryName = titleCase(String(country || "").trim());
    return countryName
        ? `Foreign warrants: Yes — ${countryName}.`
        : "Foreign warrants: Yes.";
}

window.baseballForeignWarrantBullet = baseballForeignWarrantBullet;

function createBaseballText() {
    if (window.COPDoc && window.COPDoc.baseball && baseballCardEditor) {
        return generateStructuredBaseballCard(false);
    }
    const firstName = titleCase(val(firstNameInput)).trim();
    const lastNameRaw = val(lastNameInput);
    const lastNameTrailingSpace = /\s$/.test(lastNameRaw);
    let lastName = lastNameRaw.trim();
    const age = val(ageInput);
    const country = titleCase(countryLabel()).trim();
    const alienNumber = formatAlienNumber(val(alienNumberInput));
    if (alienNumber && alienNumberInput) {
        alienNumberInput.value = alienNumber;
    }
    const finalOrderDate = formatCardDate(val(finalOrderDateInput).trim());
    const firstDeportationDate = formatCardDate(
        val(firstDeportationDateInput).trim()
    );
    const lastDeportationDate = formatCardDate(
        val(lastDeportationDateInput).trim()
    );
    const disposition = titleCase(
        val(dispositionInput) ||
            selectedText(document.getElementById("immigrationDisposition"))
    ).trim();
    const arrestDate = formatCardDate(
        val(arrestDateInput).trim() || firstLiveField("arrestDate")
    );
    const foreignWarrantText = baseballForeignWarrantBullet(
        val(foreignWarrantsInput),
        val(foreignWarrantCountryInput)
    );

    let paternalName = lastName.toUpperCase();
    let lastNameFormat = paternalName;

    // Dual surname: first space becomes a hyphen, then
    // paternal ALL CAPS + hyphen + maternal Title Case.
    // garcia lopez / garcia-lopez → GARCIA-Lopez
    // A trailing space with no second name yet is kept so you can type it.
    if (!lastName.includes("-") && lastName.includes(" ")) {
        lastName = lastName.replace(/\s+/, "-");
    }

    if (lastName.includes("-")) {
        const hyphenPosition = lastName.indexOf("-");
        paternalName = lastName
            .slice(0, hyphenPosition)
            .trim()
            .toUpperCase();
        const maternalRaw = lastName.slice(hyphenPosition + 1).trim();
        if (maternalRaw) {
            lastNameFormat = paternalName + "-" + titleCase(maternalRaw);
        } else {
            lastNameFormat = paternalName;
        }
    }

    // Playground only: don't rewrite Lead Entry last name (names.js owns that field).
    if (lastNameInput && baseballCardEditor) {
        lastNameInput.value =
            lastNameFormat +
            (lastNameTrailingSpace && lastNameFormat.indexOf("-") === -1
                ? " "
                : "");
    }
    const lastNameCaps = String(paternalName || lastName).toUpperCase();

    let immHistory = "";
    if (finalOrderDate) {
        immHistory = `${lastNameCaps} was ordered removed by an IJ on ${finalOrderDate}. `;
    }

    let deportationText = "";
    if (firstDeportationDate && lastDeportationDate) {
        deportationText = `${lastNameCaps} was initially deported on ${firstDeportationDate}, and more recently deported on ${lastDeportationDate}. `;
    } else if (firstDeportationDate) {
        deportationText = `${lastNameCaps} was initially deported on ${firstDeportationDate}. `;
    }

    let criminalHistoryText = "";
    const historyRows = criminalHistoryRows();
    historyRows.forEach(function (row) {
        const charge = fieldValue(row, "charge") || fieldValue(row, "crime");
        if (!charge) {
            return;
        }
        const convictionDate = formatCardDate(
            fieldValue(row, "convictionDate")
        );
        const county = titleCase(fieldValue(row, "county")).trim();
        const state = formatState(fieldValue(row, "state"));
        let place = "";
        if (county && state) {
            place = ` in ${county} county, ${state}`;
        } else if (county) {
            place = ` in ${county} county`;
        } else if (state) {
            place = ` in ${state}`;
        } else {
            var court = fieldValue(row, "court");
            if (court) {
                place = ` in ${court}`;
            }
        }
        let convicted = "";
        if (convictionDate) {
            convicted = `, for which he was convicted on ${convictionDate}`;
        }
        criminalHistoryText += `${lastNameCaps} has a criminal history of ${charge}${place}${convicted}. `;
    });

    let dispositionText = "";
    if (disposition) {
        dispositionText = `${lastNameCaps} is now being processed as a ${disposition}.`;
    }

    const text =
        `ICE Dallas arrested ${firstName} ${lastNameFormat}, ${alienNumber}, ` +
        `a ${age}-year-old citizen and national of ${country}. ` +
        `${immHistory}` +
        `${deportationText}` +
        `${criminalHistoryText}` +
        `${dispositionText}`;

    const internalHeading = `INTERNAL Background Required for Privacy Review:`;
    const internalBullets = [
        `${lastNameCaps} has no T/U/WAWA visa applications.`,
        `${lastNameFormat}, ${alienNumber}, a ${age}-year-old citizen and national of ${country}.`,
        criminalHistoryText.trim(),
        dispositionText.trim(),
        arrestDate ? `Arrested on ${arrestDate}` : "",
        foreignWarrantText,
        "photo from arrest in the field."
    ];

    const content = {
        narrative: text.trim(),
        heading: internalHeading,
        bullets: internalBullets.filter(Boolean)
    };
    renderBaseballCard(content);
    return buildBaseballCardPlainText(content);
}

function escapeBaseballCardHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function baseballCardPhotoPlaceholder() {
    var placeholder = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="900" viewBox="0 0 680 900">',
        '<rect width="680" height="900" fill="#f3f4f6"/>',
        '<rect x="28" y="28" width="624" height="844" fill="none" stroke="#8a8a8a" stroke-width="2" stroke-dasharray="12 10"/>',
        '<text x="340" y="430" text-anchor="middle" fill="#4b5563" font-family="Arial, Helvetica, sans-serif" font-size="28">Photo from arrest</text>',
        '<text x="340" y="470" text-anchor="middle" fill="#4b5563" font-family="Arial, Helvetica, sans-serif" font-size="28">in the field</text>',
        "</svg>"
    ].join("");
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(placeholder);
}

function buildBaseballCardPlainText(content) {
    content = content || {};
    var bullets = Array.isArray(content.bullets) ? content.bullets : [];
    return [
        "Dallas",
        "",
        String(content.narrative || "").trim(),
        "",
        String(content.heading || "").trim()
    ]
        .concat(
            bullets.map(function (item) {
                return "• " + String(item || "").trim();
            })
        )
        .join("\n")
        .trim();
}


var BASEBALL_CARD_STYLE_DEFAULTS = {
    cardWidth: 1050,
    photoPercent: 34,
    photoMinHeight: 570,
    lineWidth: 1,
    lineColor: "#8a8a8a",
    fontFamily: "Arial, Helvetica, sans-serif",
    bodySize: 16,
    headingSize: 20,
    lineHeight: 1.45
};

var BASEBALL_CARD_FONTS = [
    { value: "Arial, Helvetica, sans-serif", label: "Arial" },
    { value: "Calibri, Carlito, sans-serif", label: "Calibri" },
    { value: '"Times New Roman", Times, serif', label: "Times New Roman" },
    { value: "Georgia, serif", label: "Georgia" },
    { value: '"Segoe UI", Tahoma, sans-serif', label: "Segoe UI" }
];

function clampStyleNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) {
        return fallback;
    }
    if (n < min) {
        return min;
    }
    if (n > max) {
        return max;
    }
    return n;
}

function normalizeLineColor(value) {
    var raw = String(value || "").trim();
    var six = raw.match(/^#?([0-9a-f]{6})$/i);
    if (six) {
        return "#" + six[1].toLowerCase();
    }
    var three = raw.match(/^#?([0-9a-f]{3})$/i);
    if (three) {
        var s = three[1];
        return (
            "#" +
            s.charAt(0) +
            s.charAt(0) +
            s.charAt(1) +
            s.charAt(1) +
            s.charAt(2) +
            s.charAt(2)
        ).toLowerCase();
    }
    return BASEBALL_CARD_STYLE_DEFAULTS.lineColor;
}

function normalizeBaseballCardStyle(raw) {
    raw = raw || {};
    var font = String(raw.fontFamily || BASEBALL_CARD_STYLE_DEFAULTS.fontFamily);
    var allowed = BASEBALL_CARD_FONTS.some(function (row) {
        return row.value === font;
    });
    return {
        cardWidth: clampStyleNumber(raw.cardWidth, 480, 1400, BASEBALL_CARD_STYLE_DEFAULTS.cardWidth),
        photoPercent: clampStyleNumber(raw.photoPercent, 20, 50, BASEBALL_CARD_STYLE_DEFAULTS.photoPercent),
        photoMinHeight: clampStyleNumber(
            raw.photoMinHeight,
            240,
            900,
            BASEBALL_CARD_STYLE_DEFAULTS.photoMinHeight
        ),
        lineWidth: clampStyleNumber(raw.lineWidth, 1, 8, BASEBALL_CARD_STYLE_DEFAULTS.lineWidth),
        lineColor: normalizeLineColor(raw.lineColor),
        fontFamily: allowed ? font : BASEBALL_CARD_STYLE_DEFAULTS.fontFamily,
        bodySize: clampStyleNumber(raw.bodySize, 10, 28, BASEBALL_CARD_STYLE_DEFAULTS.bodySize),
        headingSize: clampStyleNumber(
            raw.headingSize,
            12,
            36,
            BASEBALL_CARD_STYLE_DEFAULTS.headingSize
        ),
        lineHeight: clampStyleNumber(raw.lineHeight, 1.2, 1.8, BASEBALL_CARD_STYLE_DEFAULTS.lineHeight)
    };
}

function loadBaseballCardStyle() {
    try {
        var raw = window.COPDoc.repositories.preferences.readBaseballStyle();
        if (!raw) {
            return normalizeBaseballCardStyle(BASEBALL_CARD_STYLE_DEFAULTS);
        }
        return normalizeBaseballCardStyle(raw);
    } catch (error) {
        return normalizeBaseballCardStyle(BASEBALL_CARD_STYLE_DEFAULTS);
    }
}

function saveBaseballCardStyle(style) {
    var next = normalizeBaseballCardStyle(style);
    try {
        window.COPDoc.repositories.preferences.saveBaseballStyle(next);
    } catch (error) {
        return { ok: false, style: next, error: "The default could not be stored." };
    }
    return { ok: true, style: next, error: "" };
}

function getBaseballCardStyle() {
    return readStyleForm() || loadBaseballCardStyle();
}

function applyBaseballCardStyle(style) {
    style = normalizeBaseballCardStyle(style);
    var editor =
        baseballCardEditor || document.getElementById("baseballCardEditor");
    if (!editor || !editor.style || typeof editor.style.setProperty !== "function") {
        return style;
    }
    editor.style.setProperty("--bb-card-width", style.cardWidth + "px");
    editor.style.setProperty("--bb-photo-percent", style.photoPercent + "%");
    editor.style.setProperty("--bb-photo-min-height", style.photoMinHeight + "px");
    editor.style.setProperty("--bb-line-width", style.lineWidth + "px");
    editor.style.setProperty("--bb-line-color", style.lineColor);
    editor.style.setProperty("--bb-font", style.fontFamily);
    editor.style.setProperty("--bb-body-size", style.bodySize + "px");
    editor.style.setProperty("--bb-heading-size", style.headingSize + "px");
    editor.style.setProperty("--bb-line-height", String(style.lineHeight));
    return style;
}

function readStyleForm() {
    var width = document.getElementById("bbStyleWidth");
    if (!width) {
        return null;
    }
    return normalizeBaseballCardStyle({
        cardWidth: width.value,
        photoPercent: document.getElementById("bbStylePhoto") &&
            document.getElementById("bbStylePhoto").value,
        photoMinHeight: document.getElementById("bbStylePhotoHeight") &&
            document.getElementById("bbStylePhotoHeight").value,
        lineWidth: document.getElementById("bbStyleLine") &&
            document.getElementById("bbStyleLine").value,
        lineColor: document.getElementById("bbStyleLineColor") &&
            document.getElementById("bbStyleLineColor").value,
        fontFamily: document.getElementById("bbStyleFont") &&
            document.getElementById("bbStyleFont").value,
        bodySize: document.getElementById("bbStyleBody") &&
            document.getElementById("bbStyleBody").value,
        headingSize: document.getElementById("bbStyleHeading") &&
            document.getElementById("bbStyleHeading").value
    });
}

function fillStyleForm(style) {
    style = normalizeBaseballCardStyle(style);
    function setVal(id, value) {
        var el = document.getElementById(id);
        if (el) {
            el.value = value;
        }
    }
    setVal("bbStyleWidth", style.cardWidth);
    setVal("bbStylePhoto", style.photoPercent);
    setVal("bbStylePhotoHeight", style.photoMinHeight);
    setVal("bbStyleLine", style.lineWidth);
    setVal("bbStyleLineColor", style.lineColor);
    setVal("bbStyleFont", style.fontFamily);
    setVal("bbStyleBody", style.bodySize);
    setVal("bbStyleHeading", style.headingSize);
}

function setStyleStatus(message, ok) {
    var el = document.getElementById("bbStyleStatus");
    if (!el) {
        return;
    }
    el.textContent = message || "";
    el.hidden = !message;
    el.classList.toggle("is-ok", !!ok);
}

function bindCardStyleControls() {
    var font = document.getElementById("bbStyleFont");
    if (font && !font.options.length) {
        BASEBALL_CARD_FONTS.forEach(function (row) {
            var option = document.createElement("option");
            option.value = row.value;
            option.textContent = row.label;
            font.appendChild(option);
        });
    }
    // Structured cards keep every layout setting per card; the old defaults
    // adapter remains available to legacy generators that have no card editor.
    if (window.COPDoc && window.COPDoc.baseball && baseballCardEditor) return;
    var saved = loadBaseballCardStyle();
    fillStyleForm(saved);
    applyBaseballCardStyle(saved);
    var ids = [
        "bbStyleWidth",
        "bbStylePhoto",
        "bbStylePhotoHeight",
        "bbStyleLine",
        "bbStyleLineColor",
        "bbStyleFont",
        "bbStyleBody",
        "bbStyleHeading"
    ];
    ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.dataset.styleBound === "true") {
            return;
        }
        el.dataset.styleBound = "true";
        el.addEventListener("input", function () {
            applyBaseballCardStyle(readStyleForm());
        });
        el.addEventListener("change", function () {
            applyBaseballCardStyle(readStyleForm());
        });
    });
    var save = document.getElementById("bbStyleSaveDefault");
    if (save && save.dataset.styleBound !== "true") {
        save.dataset.styleBound = "true";
        save.addEventListener("click", function () {
            var result = saveBaseballCardStyle(readStyleForm());
            applyBaseballCardStyle(result.style);
            fillStyleForm(result.style);
            setStyleStatus(
                result.ok
                    ? "Saved as the default for generated cards."
                    : result.error,
                result.ok
            );
        });
    }
    var restore = document.getElementById("bbStyleRestore");
    if (restore && restore.dataset.styleBound !== "true") {
        restore.dataset.styleBound = "true";
        restore.addEventListener("click", function () {
            fillStyleForm(BASEBALL_CARD_STYLE_DEFAULTS);
            applyBaseballCardStyle(BASEBALL_CARD_STYLE_DEFAULTS);
            setStyleStatus("Factory appearance restored. Save as default to keep it.");
        });
    }
}

function getBaseballCardPhotoSource() {
    if (typeof window.getLiveBaseballCardPhoto === "function") {
        var live = window.getLiveBaseballCardPhoto();
        if (live) {
            return live;
        }
    }
    var preview = document.getElementById("arrestPhotoPreview");
    if (preview && preview.getAttribute && preview.getAttribute("src")) {
        return String(preview.getAttribute("src") || "");
    }
    return baseballCardPhotoPlaceholder();
}

function buildBaseballCardTableMarkup(content, photoSource) {
    if (window.COPDoc && window.COPDoc.baseball) {
        var state = getBaseballCardState();
        state.content = content || state.content;
        state.photoDataUrl = photoSource || (typeof window.getLiveBaseballCardPhoto === "function" ? window.getLiveBaseballCardPhoto() : "");
        return window.COPDoc.baseball.renderEmail(state);
    }
    content = content || {};
    var bullets = Array.isArray(content.bullets) ? content.bullets : [];
    var photo = String(photoSource || getBaseballCardPhotoSource());
    var photoAlt = /^data:image\/svg\+xml/i.test(photo)
        ? "No arrest photo selected"
        : "Photo from arrest in the field";
    var listItems = bullets
        .map(function (item) {
            return "            <li>" + escapeBaseballCardHtml(item) + "</li>";
        })
        .join("\n");
    return (
        '<table class="arrest-card" aria-label="ICE Dallas arrest information card">' +
        "<tbody><tr>" +
        '<td class="photo-cell" rowspan="2">' +
        '<img src="' +
        escapeBaseballCardHtml(photo) +
        '" alt="' +
        escapeBaseballCardHtml(photoAlt) +
        '">' +
        "</td>" +
        '<th class="city-row" scope="row">Dallas</th>' +
        "</tr><tr>" +
        '<td class="narrative-cell">' +
        "<p>" +
        escapeBaseballCardHtml(content.narrative || "") +
        "</p>" +
        "<h2>" +
        escapeBaseballCardHtml(content.heading || "") +
        "</h2>" +
        "<ul>\n" +
        listItems +
        "\n          </ul></td></tr></tbody></table>"
    );
}

function getRenderedBaseballCardContent() {
    var editor =
        baseballCardEditor || document.getElementById("baseballCardEditor");
    if (!editor || typeof editor.querySelector !== "function") {
        return null;
    }
    var narrativeEl = editor.querySelector(".narrative-cell p");
    var headingEl = editor.querySelector(".narrative-cell h2");
    var bulletNodes = editor.querySelectorAll(".narrative-cell li");
    if (narrativeEl && headingEl) {
        return {
            narrative: String(narrativeEl.textContent || "").trim(),
            heading: String(headingEl.textContent || "").trim(),
            bullets: Array.prototype.map
                .call(bulletNodes, function (item) {
                    return String(item.textContent || "").trim();
                })
                .filter(Boolean)
        };
    }
    var paragraphs = editor.querySelectorAll("p");
    if (!paragraphs.length) {
        var pastedText = String(editor.innerText || editor.textContent || "").trim();
        return pastedText ? { narrative: pastedText, heading: "", bullets: [] } : null;
    }
    return {
        narrative: String(paragraphs[0].textContent || "").trim(),
        heading: String(
            (paragraphs[1] && paragraphs[1].textContent) ||
                "INTERNAL Background Required for Privacy Review:"
        ).trim(),
        bullets: Array.prototype.map
            .call(editor.querySelectorAll("li"), function (item) {
                return String(item.textContent || "").trim();
            })
            .filter(Boolean)
    };
}

function renderBaseballCard(contentOverride) {
    var editor =
        baseballCardEditor || document.getElementById("baseballCardEditor");
    if (!editor) {
        return "";
    }
    var content = contentOverride || getRenderedBaseballCardContent();
    if (!content) {
        return "";
    }
    editor.innerHTML = buildBaseballCardTableMarkup(content);
    applyLivePhotoAdjustments();
    return buildBaseballCardPlainText(content);
}

function refreshBaseballCardPhoto() {
    var editor =
        baseballCardEditor || document.getElementById("baseballCardEditor");
    if (!editor || typeof editor.querySelector !== "function") {
        return;
    }
    if (!editor.querySelector(".arrest-card")) {
        return;
    }
    renderBaseballCard(getRenderedBaseballCardContent());
}

function buildBaseballCardEmailMarkup(content, photoSource, layout, adjustments) {
    if (window.COPDoc && window.COPDoc.baseball) {
        return window.COPDoc.baseball.renderEmail({
            content: content || {}, photoDataUrl: /^data:image\/svg/i.test(photoSource || "") ? "" : (photoSource || ""),
            layout: layout || getBaseballCardState().layout,
            photoAdjustments: adjustments || getBaseballCardState().photoAdjustments
        });
    }
    content = content || {};
    var style = getBaseballCardStyle();
    var bullets = Array.isArray(content.bullets) ? content.bullets : [];
    var photo = String(photoSource || baseballCardPhotoPlaceholder());
    var photoAlt = /^data:image\/svg\+xml/i.test(photo)
        ? "No arrest photo selected"
        : "Photo from arrest in the field";
    var line = style.lineWidth + "px solid " + style.lineColor;
    var photoPx = Math.round(style.cardWidth * (style.photoPercent / 100));
    var listItems = bullets
        .map(function (item, index) {
            return (
                '<li style="margin:' +
                (index === 0 ? "0" : "9px") +
                ' 0 0;padding:0;">' +
                escapeBaseballCardHtml(item) +
                "</li>"
            );
        })
        .join("");
    return (
        '<table class="arrest-card" role="presentation" aria-label="ICE Dallas arrest information card" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:' +
        style.cardWidth +
        "px;margin:0;border-collapse:collapse;table-layout:fixed;background:#ffffff;font-family:" +
        style.fontFamily +
        ";color:#171717;line-height:" +
        style.lineHeight +
        ';">' +
        "<tbody><tr>" +
        '<td rowspan="2" width="' +
        style.photoPercent +
        '%" style="width:' +
        style.photoPercent +
        "%;padding:0;border:" +
        line +
        ';vertical-align:top;background:#ffffff;">' +
        '<img src="' +
        escapeBaseballCardHtml(photo) +
        '" alt="' +
        escapeBaseballCardHtml(photoAlt) +
        '" width="' +
        photoPx +
        '" style="display:block;width:100%;max-width:' +
        photoPx +
        "px;height:auto;min-height:" +
        style.photoMinHeight +
        'px;object-fit:cover;object-position:center top;border:0;">' +
        "</td>" +
        '<th scope="row" style="height:44px;padding:9px 16px;border:' +
        line +
        ";text-align:left;vertical-align:middle;font-size:" +
        style.headingSize +
        "px;line-height:1.2;font-weight:700;font-family:" +
        style.fontFamily +
        ';background:#ffffff;">Dallas</th>' +
        "</tr><tr>" +
        '<td style="padding:18px 20px 22px;border:' +
        line +
        ";vertical-align:top;font-size:" +
        style.bodySize +
        "px;font-family:" +
        style.fontFamily +
        ';background:#ffffff;">' +
        '<p style="margin:0 0 20px;padding:0;color:#171717;">' +
        escapeBaseballCardHtml(content.narrative || "") +
        "</p>" +
        '<h2 style="margin:4px 0 12px;padding:0;font-size:' +
        style.bodySize +
        "px;line-height:1.35;font-weight:700;font-family:" +
        style.fontFamily +
        ';">' +
        escapeBaseballCardHtml(content.heading || "") +
        "</h2>" +
        '<ul style="margin:0;padding:0 0 0 24px;max-height:none;overflow:visible;">' +
        listItems +
        "</ul></td></tr></tbody></table>"
    );
}

function clipboardHtmlEnvelope(innerHtml) {
    return (
        "<html><head><meta http-equiv=\"Content-Type\" content=\"text/html;charset=utf-8\"></head>" +
        "<body><!--StartFragment-->" +
        String(innerHtml || "") +
        "<!--EndFragment--></body></html>"
    );
}

window.escapeBaseballCardHtml = escapeBaseballCardHtml;
window.baseballCardPhotoPlaceholder = baseballCardPhotoPlaceholder;
window.buildBaseballCardPlainText = buildBaseballCardPlainText;
window.buildBaseballCardTableMarkup = buildBaseballCardTableMarkup;
window.buildBaseballCardEmailMarkup = buildBaseballCardEmailMarkup;
window.getRenderedBaseballCardContent = getRenderedBaseballCardContent;
window.renderBaseballCard = renderBaseballCard;
window.refreshBaseballCardPhoto = refreshBaseballCardPhoto;
window.clipboardHtmlEnvelope = clipboardHtmlEnvelope;
window.getBaseballCardStyle = getBaseballCardStyle;
window.saveBaseballCardStyle = saveBaseballCardStyle;
window.applyBaseballCardStyle = applyBaseballCardStyle;
window.loadBaseballCardStyle = loadBaseballCardStyle;
window.BASEBALL_CARD_STYLE_DEFAULTS = BASEBALL_CARD_STYLE_DEFAULTS;

function showBaseballCardOnPage(fullText) {
    var out = document.getElementById("baseballCardOutput");
    var label = document.querySelector(".baseball-output-label");
    var panel = document.getElementById("baseballOutputPanel");
    if (panel) {
        panel.hidden = false;
    }
    if (!out) {
        return false;
    }
    out.hidden = false;
    if (label) {
        label.hidden = false;
    }
    out.value = fullText || "";
    if (typeof out.scrollIntoView === "function") {
        out.scrollIntoView({ block: "nearest" });
    }
    out.focus();
    return true;
}

function onGenerateBaseballCard(event) {
    if (event) {
        event.preventDefault();
        if (event.stopPropagation) {
            event.stopPropagation();
        }
    }
    try {
        var fullText = window.COPDoc && window.COPDoc.baseball && baseballCardEditor
            ? generateStructuredBaseballCard(true) : createBaseballText();
        if (baseballCardEditor) return;
        if (!showBaseballCardOnPage(fullText)) {
            window.alert("Baseball card textarea is missing from the page.");
        }
    } catch (err) {
        console.error(err);
        window.alert(
            "Baseball card failed: " +
                (err && err.message ? err.message : String(err))
        );
    }
}

window.onGenerateBaseballCard = onGenerateBaseballCard;

function bindGenerateButton() {
    var btn = document.getElementById("generatebaseballCard") || baseballbutton;
    if (!btn || btn.dataset.baseballBound === "true" || btn.dataset.chromeCall === "true") {
        return;
    }
    btn.dataset.baseballBound = "true";
    btn.addEventListener("click", onGenerateBaseballCard);
}

function bindBaseballCardPage() {
    bindGenerateButton();
    bindCardStyleControls();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindBaseballCardPage);
} else {
    bindBaseballCardPage();
}

// Live rewrite belongs on baseballcard.html only. Lead Entry generates on click.
if (baseballCardEditor) {
    const watched = [
        firstNameInput,
        lastNameInput,
        ageInput,
        countryInput,
        alienNumberInput,
        finalOrderDateInput,
        firstDeportationDateInput,
        lastDeportationDateInput,
        dispositionInput,
        arrestDateInput,
        foreignWarrantsInput,
        foreignWarrantCountryInput
    ];
    watched.forEach(function (el) {
        if (!el) {
            return;
        }
        el.addEventListener("input", createBaseballText);
        el.addEventListener("change", createBaseballText);
    });
    if (criminalHistoryList) {
        criminalHistoryList.addEventListener("input", createBaseballText);
        criminalHistoryList.addEventListener("change", createBaseballText);
    }
    if (addCriminalHistoryButton) {
        addCriminalHistoryButton.addEventListener("click", function () {
            addCriminalHistoryRow();
            createBaseballText();
        });
    }
}

// The v1.12 editor uses one serializable card state. Canonical Person facts are
// source defaults; presentation edits stay here and never write back to Person.
var baseballStructuredState = null;
var baseballContentEdited = false;
var baseballStateFields = {
    baseballFirstName: "firstName", baseballLastName: "lastName", baseballAge: "age",
    baseballCountry: "country", baseballAlienNumber: "alienNumber", baseballArrestDate: "arrestDate",
    baseballDisposition: "disposition", baseballFinalOrderDate: "finalOrderDate",
    baseballFirstDeportationDate: "firstDeportationDate", baseballLastDeportationDate: "lastDeportationDate"
};
var baseballLayoutControls = {
    cardWidthPx: "bbStyleWidth", photoWidthPercent: "bbStylePhoto", photoHeightPx: "bbStylePhotoHeight",
    lineWidthPx: "bbStyleLine", lineColor: "bbStyleLineColor", lineStyle: "bbStyleLineStyle",
    headerHeightPx: "bbStyleHeaderHeight", headerFontSizePx: "bbStyleHeading",
    contentFontSizePx: "bbStyleBody", contentPaddingPx: "bbStylePadding",
    fontFamily: "bbStyleFont", lineHeight: "bbStyleLineHeight"
};
var baseballPhotoControls = {
    zoom: "bbPhotoZoom", positionX: "bbPhotoX", positionY: "bbPhotoY", rotation: "bbPhotoRotation",
    brightness: "bbPhotoBrightness", contrast: "bbPhotoContrast", flipX: "bbPhotoFlip"
};

function baseballContract() { return window.COPDoc && window.COPDoc.baseball; }
function baseStructuredState() {
    var api = baseballContract();
    if (!api) return null;
    if (!baseballStructuredState) {
        var layout;
        try { layout = window.COPDoc.repositories.preferences.readBaseballStyle(); } catch(error) { layout = null; }
        baseballStructuredState = api.normalizeState({layout: layout || loadBaseballCardStyle()});
    }
    return baseballStructuredState;
}
function getBaseballCardState() {
    var api = baseballContract();
    if (!api) return {};
    var state = JSON.parse(JSON.stringify(baseStructuredState()));
    state.fields = state.fields || {};
    Object.keys(baseballStateFields).forEach(function (key) {
        var input = document.getElementById(baseballStateFields[key]);
        if (input) state.fields[key] = String(input.value == null ? "" : input.value);
    });
    var gender = document.getElementById("baseballGender");
    if (gender) state.gender = gender.value;
    state.criminalHistory = Array.prototype.map.call(criminalHistoryRows(), function (row) {
        return Object.assign({}, row._baseballSourceRow || {}, {charge: fieldValue(row,"charge") || fieldValue(row,"crime"), convictionDate: fieldValue(row,"convictionDate"),
            jurisdictionType: fieldValue(row,"jurisdictionType") || "County",
            jurisdiction: fieldValue(row,"jurisdiction") || fieldValue(row,"county") || fieldValue(row,"city"),
            state: fieldValue(row,"state"), court: fieldValue(row,"court")});
    });
    state.layout = state.layout || {};
    Object.keys(baseballLayoutControls).forEach(function (key) {
        var input = document.getElementById(baseballLayoutControls[key]);
        if (input && input.value !== "") state.layout[key] = input.value;
    });
    state.photoAdjustments = state.photoAdjustments || {};
    Object.keys(baseballPhotoControls).forEach(function (key) {
        var input = document.getElementById(baseballPhotoControls[key]);
        if (input) state.photoAdjustments[key] = key === "flipX" ? input.checked : input.value;
    });
    var content = getRenderedBaseballCardContent();
    if (content) state.content = content;
    state.contentEdited = baseballContentEdited;
    if (typeof window.getLiveBaseballCardPhoto === "function") state.photoDataUrl = window.getLiveBaseballCardPhoto();
    state.foreignWarrantsKnown = true;
    state.hasForeignWarrants = val(foreignWarrantsInput) === "yes";
    state.foreignWarrantCountry = state.hasForeignWarrants ? val(foreignWarrantCountryInput) : "";
    return api.normalizeState(state);
}
function setStructuredControls(state) {
    Object.keys(baseballLayoutControls).forEach(function (key) {
        var el = document.getElementById(baseballLayoutControls[key]);
        if (el && state.layout[key] != null) el.value = state.layout[key];
    });
    Object.keys(baseballPhotoControls).forEach(function (key) {
        var el = document.getElementById(baseballPhotoControls[key]);
        if (el && state.photoAdjustments[key] != null) {
            if (key === "flipX") el.checked = state.photoAdjustments[key]; else el.value = state.photoAdjustments[key];
        }
    });
}
function hydrateBaseballCardState(raw) {
    var api = baseballContract();
    if (!api) return;
    baseballStructuredState = api.normalizeState(raw);
    var state = baseballStructuredState;
    baseballContentEdited = Boolean(state.contentEdited || (state.content && (state.content.narrative || state.content.heading || state.content.bullets.length)));
    Object.keys(baseballStateFields).forEach(function (key) {
        var input = document.getElementById(baseballStateFields[key]);
        if (input) input.value = state.fields[key] || "";
    });
    var gender = document.getElementById("baseballGender");
    if (gender) gender.value = state.gender || "";
    if (criminalHistoryList) {
        criminalHistoryList.innerHTML = "";
        state.criminalHistory.forEach(function (data) {
            var row = addCriminalHistoryRow();
            row._baseballSourceRow = JSON.parse(JSON.stringify(data));
            Object.keys(data).forEach(function (key) { var el = row.querySelector('[data-field="'+key+'"]'); if (el) el.value = data[key]; });
        });
    }
    setStructuredControls(state);
    if (state.content && (state.content.narrative || state.content.heading || state.content.bullets.length)) renderBaseballCard(state.content);
    else generateStructuredBaseballCard(false);
    updateStructuredOutputs(state);
}
function generateStructuredBaseballCard(force) {
    var api = baseballContract();
    var state = getBaseballCardState();
    if (baseballContentEdited && !force) {
        var message = document.getElementById("bbContentStatus");
        if (message) message.textContent = "Source fields changed. Your edited text is preserved; use Regenerate text to replace it.";
        return api.plainText(state);
    }
    if (force && baseballContentEdited && typeof window.confirm === "function" && !window.confirm("Replace your edited narrative, heading, and bullets with text generated from the fields?")) return api.plainText(state);
    state.content = api.generateContent(state);
    // Foreign warrant data is an existing COPDoc extension, kept in the same
    // saved presentation state even when the imported source has no such field.
    var warrant = baseballForeignWarrantBullet(val(foreignWarrantsInput), val(foreignWarrantCountryInput));
    var bullets = state.content.bullets || [];
    var index = bullets.findIndex(function(item) { return /photo.*arrest/i.test(item); });
    bullets.splice(index === -1 ? bullets.length : index, 0, warrant);
    state.content.bullets = bullets;
    baseballContentEdited = false;
    state.contentEdited = false;
    baseballStructuredState = api.normalizeState(state);
    renderBaseballCard(state.content);
    var message = document.getElementById("bbContentStatus");
    if (message) message.textContent = "Text generated from the card fields.";
    return api.plainText(state);
}
function updateStructuredOutputs(state) {
    state = state || getBaseballCardState();
    Object.keys(baseballPhotoControls).forEach(function(key) {
        var out = document.getElementById(baseballPhotoControls[key]+"Value");
        if (out) out.textContent = key === "zoom" ? state.photoAdjustments[key]+"×" : String(state.photoAdjustments[key]);
    });
    applyLivePhotoAdjustments();
}
function applyLivePhotoAdjustments() {
    var api = baseballContract();
    if (!api || !baseStructuredState()) return;
    var state = getBaseballCardState();
    var img = document.getElementById("arrestPhotoPreview");
    var frame = document.getElementById("bbPhotoFrame");
    var styles = api.photoStyle(state.photoAdjustments);
    function stylePhoto(el) {
        if (!el || !el.style) return;
        if (typeof styles === "string") el.style.cssText = "width:100%;height:100%;object-fit:cover;"+styles;
        else Object.keys(styles || {}).forEach(function(key) { el.style[key] = styles[key]; });
    }
    stylePhoto(img);
    if (frame && frame.style) frame.style.aspectRatio = String((state.layout.cardWidthPx * state.layout.photoWidthPercent / 100) / state.layout.photoHeightPx);
    var photo = baseballCardEditor && baseballCardEditor.querySelector(".photo-cell img");
    stylePhoto(photo);
}
function refreshStructuredCard() {
    var state = getBaseballCardState();
    baseballStructuredState = state;
    renderBaseballCard(state.content);
    updateStructuredOutputs(state);
}
function sortBaseballCriminalHistory(direction) {
    var api = baseballContract();
    if (!api) return;
    var state = getBaseballCardState();
    var wasEdited = baseballContentEdited;
    state.criminalHistory = api.sortCriminalHistory(state.criminalHistory, direction === "desc" ? "descending" : "ascending");
    hydrateBaseballCardState(state);
    baseballContentEdited = wasEdited;
    if (!wasEdited) generateStructuredBaseballCard(false);
    // Ordering is deliberate; retain manual prose until explicit regeneration.
}
function bindStructuredBaseballControls() {
    var api = baseballContract();
    if (!api || !baseballCardEditor) return;
    setStructuredControls(baseStructuredState());
    Object.keys(baseballLayoutControls).concat(Object.keys(baseballPhotoControls)).forEach(function(key) {
        var id = baseballLayoutControls[key] || baseballPhotoControls[key];
        var el = document.getElementById(id);
        if (el) el.addEventListener("input", refreshStructuredCard);
    });
    baseballCardEditor.addEventListener("input", function () {
        baseballContentEdited = true;
        baseballStructuredState = getBaseballCardState();
        var message = document.getElementById("bbContentStatus");
        if (message) message.textContent = "Your edited text will be kept when photos or layout change.";
    });
    function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click",fn); }
    on("bbRegenerateText",function () { generateStructuredBaseballCard(true); });
    on("bbHistoryAscending",function () { sortBaseballCriminalHistory("asc"); });
    on("bbHistoryDescending",function () { sortBaseballCriminalHistory("desc"); });
    on("bbPhotoReset",function () {
        var state = getBaseballCardState(); state.photoAdjustments = api.normalizePhotoAdjustments({});
        setStructuredControls(state); refreshStructuredCard();
    });
    on("bbStyleSaveDefault",function () {
        try { window.COPDoc.repositories.preferences.saveBaseballStyle(getBaseballCardState().layout); setStyleStatus("Saved the appearance default. Save card to keep this card's settings.",true); }
        catch(error) { setStyleStatus("The appearance default could not be saved.",false); }
    });
    on("bbStyleRestore",function () { var state = getBaseballCardState(); state.layout=api.normalizeLayout({}); setStructuredControls(state); refreshStructuredCard(); });
    var preset = document.getElementById("bbStylePreset");
    if (preset) {
        Object.keys(api.layoutPresets || {}).forEach(function(key) {
            var option=document.createElement("option"); option.value=key; option.textContent=key; preset.appendChild(option);
        });
        preset.addEventListener("change",function () {
            if (!api.layoutPresets[preset.value]) return;
            var state=getBaseballCardState(); state.layout=api.normalizeLayout(api.layoutPresets[preset.value]);
            setStructuredControls(state); refreshStructuredCard();
        });
    }
    var gender=document.getElementById("baseballGender");
    if (gender) gender.addEventListener("change",createBaseballText);
    if (criminalHistoryList) criminalHistoryList.addEventListener("click",function(event) {
        var button=event.target.closest && event.target.closest("[data-history-action]");
        if (!button) return;
        var row=button.closest(".criminal-history-row"), action=button.getAttribute("data-history-action");
        if (!row) return;
        if(action==="remove") row.remove();
        else if(action==="up" && row.previousElementSibling) row.parentNode.insertBefore(row,row.previousElementSibling);
        else if(action==="down" && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling,row);
        createBaseballText();
    });
    var frame=document.getElementById("bbPhotoFrame");
    if(frame) {
        var drag=null;
        frame.addEventListener("pointerdown",function(event) {
            if (!getBaseballCardState().photoDataUrl) return;
            var state=getBaseballCardState(); drag={x:event.clientX,y:event.clientY,px:state.photoAdjustments.positionX,py:state.photoAdjustments.positionY};
            frame.setPointerCapture && frame.setPointerCapture(event.pointerId); event.preventDefault();
        });
        frame.addEventListener("pointermove",function(event) {
            if(!drag) return;
            var bounds=frame.getBoundingClientRect(), state=getBaseballCardState();
            state.photoAdjustments.positionX=Math.max(0,Math.min(100,drag.px-(event.clientX-drag.x)/Math.max(1,bounds.width)*100));
            state.photoAdjustments.positionY=Math.max(0,Math.min(100,drag.py-(event.clientY-drag.y)/Math.max(1,bounds.height)*100));
            setStructuredControls(state); refreshStructuredCard();
        });
        ["pointerup","pointercancel","lostpointercapture"].forEach(function(name){frame.addEventListener(name,function(){drag=null;});});
        frame.addEventListener("keydown",function(event) {
            var steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}, step=steps[event.key];
            if(!step) return; event.preventDefault();
            var state=getBaseballCardState(),mult=event.shiftKey?10:1;
            state.photoAdjustments.positionX=Math.max(0,Math.min(100,state.photoAdjustments.positionX+step[0]*mult));
            state.photoAdjustments.positionY=Math.max(0,Math.min(100,state.photoAdjustments.positionY+step[1]*mult));
            setStructuredControls(state); refreshStructuredCard();
        });
    }
}
window.getBaseballCardState=getBaseballCardState;
window.hydrateBaseballCardState=hydrateBaseballCardState;
window.sortBaseballCriminalHistory=sortBaseballCriminalHistory;
window.generateStructuredBaseballCard=generateStructuredBaseballCard;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",bindStructuredBaseballControls);
else bindStructuredBaseballControls();
