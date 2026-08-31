
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
        '<div class="field"><label for="' + uid + '-county">County</label>' +
        '<input id="' + uid + '-county" type="text" data-field="county"></div>' +
        '<div class="field"><label for="' + uid + '-state">State</label>' +
        '<input id="' + uid + '-state" type="text" data-field="state"></div>' +
        '<div class="field"><label for="' + uid + '-court">Court</label>' +
        '<input id="' + uid + '-court" type="text" data-field="court"></div>';
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

function createBaseballText() {
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
        "photo from arrest in the field."
    ];

    const lead = document.createElement("p");
    lead.textContent = text;
    const heading = document.createElement("p");
    heading.textContent = internalHeading;
    const list = document.createElement("ul");
    list.className = "baseball-bullets";
    internalBullets.forEach(function (item) {
        if (!item) {
            return;
        }
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
    });
    if (baseballCardEditor) {
        baseballCardEditor.replaceChildren(lead, heading, list);
    }

    const fullText =
        text.trim() +
        "\n\n" +
        internalHeading +
        "\n" +
        internalBullets
            .filter(Boolean)
            .map(function (item) {
                return "• " + String(item).trim();
            })
            .join("\n");

    return fullText;
}

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
        var fullText = createBaseballText();
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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindGenerateButton);
} else {
    bindGenerateButton();
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
        arrestDateInput
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