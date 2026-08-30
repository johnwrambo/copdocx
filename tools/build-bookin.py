# One-shot: restyle Alien_Book_In_Docs into bookin.html + functions/book-in.js
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
src = (root / "Alien_Book_In_Docs_v1_0_4.html").read_text(encoding="utf-8")

scripts = re.findall(r"<script>(.*?)</script>", src, flags=re.S)
if len(scripts) < 1:
    raise SystemExit("no inline scripts found")

main_js = scripts[0]
extra_js = scripts[1] if len(scripts) > 1 else ""

# Drop the duplicate country/case-type fill; shared catalogs load those selects.
main_js = re.sub(
    r"\n    function populateSelectOptions\(\) \{.*?\n    \}\n",
    "\n",
    main_js,
    count=1,
    flags=re.S,
)

main_js = re.sub(
    r"\n    const CASE_TYPE_LIBRARY = Object\.freeze\(\[.*?\n    \]\);\n",
    "\n",
    main_js,
    count=1,
    flags=re.S,
)

main_js = re.sub(
    r"\n    const COUNTRY_LIBRARY = Object\.freeze\(\[.*?\n    \]\);\n",
    "\n",
    main_js,
    count=1,
    flags=re.S,
)

main_js = main_js.replace('version: "1.0.4"', 'version: "0.5.0"')
main_js = main_js.replace("populateSelectOptions();\n", "")

ID_MAP = {
    "first_name": "firstName",
    "last_name": "lastName",
    "a_number": "alienNumber",
    "ice_event": "iceEvent",
    "officers_name": "officersName",
    "date_time": "dateTime",
    "date_of_birth": "dateOfBirth",
    "country_of_citizenship": "citizenship",
    "case_type": "immigrationDisposition",
    "travel_docs": "travelDocs",
    "property_tag": "propertyTag",
    "cell_num": "cellNum",
    "additional_observations": "additionalObservations",
    "medical_issues": "medicalIssues",
    "no_medical_issues": "noMedicalIssues",
}

for old, new in ID_MAP.items():
    main_js = main_js.replace(f'getElementById("{old}")', f'getElementById("{new}")')
    main_js = main_js.replace(f"getElementById('{old}')", f"getElementById('{new}')")
    main_js = main_js.replace(f'getValue("{old}")', f'getValue("{new}")')
    main_js = main_js.replace(f"getValue('{old}')", f"getValue('{new}')")
    main_js = main_js.replace(f'elementId: "{old}"', f'elementId: "{new}"')
    extra_js = extra_js.replace(f'getElementById("{old}")', f'getElementById("{new}")')

main_js = main_js.replace('getValue("gender")', "getSexLabel()")
main_js = main_js.replace('elementId: "gender"', 'elementId: "sexMale"')

HELPERS = r'''
    const LEGACY_FORM_IDS = Object.freeze({
      first_name: "firstName",
      last_name: "lastName",
      a_number: "alienNumber",
      ice_event: "iceEvent",
      officers_name: "officersName",
      date_time: "dateTime",
      date_of_birth: "dateOfBirth",
      country_of_citizenship: "citizenship",
      case_type: "immigrationDisposition",
      travel_docs: "travelDocs",
      property_tag: "propertyTag",
      cell_num: "cellNum",
      additional_observations: "additionalObservations",
      medical_issues: "medicalIssues",
      no_medical_issues: "noMedicalIssues"
    });

    function getSexLabel() {
      const value = getRadioValue("sex");
      if (value === "male") {
        return "Male";
      }
      if (value === "female") {
        return "Female";
      }
      return "";
    }

    function selectedOptionText(id) {
      const element = document.getElementById(id);
      if (!element || element.tagName !== "SELECT" || element.selectedIndex < 0) {
        return "";
      }
      if (!element.value) {
        return "";
      }
      return String(element.options[element.selectedIndex].textContent || "").trim();
    }

    function resolveCitizenshipCode(value) {
      const cleaned = String(value || "").trim();
      if (!cleaned) {
        return "";
      }
      const normalized = cleaned.toLowerCase();
      const list = window.COUNTRIES || [];
      const match = list.find((country) => {
        if (!country) {
          return false;
        }
        if (String(country.code || "").toLowerCase() === normalized) {
          return true;
        }
        if (String(country.label || "").toLowerCase() === normalized) {
          return true;
        }
        if (String(country.official || "").toLowerCase() === normalized) {
          return true;
        }
        return (country.aliases || []).some(
          (alias) => String(alias).toLowerCase() === normalized
        );
      });
      return match ? match.code : cleaned;
    }
'''

main_js = re.sub(
    r"(    function getValue\(id\) \{.*?\n    \}\n)",
    lambda m: m.group(1) + HELPERS,
    main_js,
    count=1,
    flags=re.S,
)

GET_CASE = r'''    function getCaseTypeCode(value) {
      const cleaned = String(value || "").trim();
      if (!cleaned) {
        return "";
      }
      const normalized = cleaned.toLowerCase();
      if (normalized === "b&b" || normalized === "b and b") {
        return "B";
      }
      const list = window.IMMIGRATION_DISPOSITIONS || [];
      const match = list.find((entry) =>
        entry.code.toLowerCase() === normalized ||
        String(entry.label || "").toLowerCase() === normalized ||
        `${entry.code} - ${entry.label}`.toLowerCase() === normalized
      );
      return match ? match.code : cleaned;
    }
'''

main_js = re.sub(
    r"    function getCaseTypeCode\(value\) \{.*?\n    \}\n",
    lambda _m: GET_CASE,
    main_js,
    count=1,
    flags=re.S,
)

RESTORE_SELECT = r'''    function normalizeRestoredSelectValue(element, value) {
      const restoredValue = String(value ?? "").trim();

      if (element.id === "immigrationDisposition") {
        return getCaseTypeCode(restoredValue);
      }

      if (element.id === "citizenship") {
        return resolveCitizenshipCode(restoredValue);
      }

      return restoredValue;
    }
'''

main_js = re.sub(
    r"    function normalizeRestoredSelectValue\(element, value\) \{.*?\n    \}\n",
    lambda _m: RESTORE_SELECT,
    main_js,
    count=1,
    flags=re.S,
)

UPDATE_AGE = r'''    function updateAge() {
      const card = document.querySelector("[data-name-card]");
      if (typeof updateAgeDisplay === "function") {
        updateAgeDisplay(card);
      }
      const ageInput = document.getElementById("age");
      return ageInput ? String(ageInput.value || "").trim() : "";
    }
'''

main_js = re.sub(
    r"    function calculateAge\(dateOfBirth\) \{.*?\n    \}\n\n    function updateAge\(\) \{.*?\n    \}\n",
    lambda _m: UPDATE_AGE,
    main_js,
    count=1,
    flags=re.S,
)

NORMALIZE_A = r'''    function normalizeANumberInput() {
      const input = document.getElementById("alienNumber");
      if (!input) {
        return "";
      }
      const digits = typeof alienNumberDigits === "function"
        ? alienNumberDigits(input.value)
        : String(input.value || "").replace(/\D/g, "").slice(0, 9);
      input.value = typeof formatAlienNumber === "function"
        ? formatAlienNumber(digits)
        : digits;
      input.classList.toggle(
        "invalid-field",
        digits.length > 0 && digits.length !== 9
      );
      return digits;
    }
'''

main_js = re.sub(
    r"    function normalizeANumberInput\(\) \{.*?\n    \}\n",
    lambda _m: NORMALIZE_A,
    main_js,
    count=1,
    flags=re.S,
)

APPLY_LAST = r'''    function applyLastNameFormatting() {
      const input = document.getElementById("lastName");
      if (!input) {
        return "";
      }
      if (typeof hyphenateLastName === "function") {
        input.value = hyphenateLastName(input.value);
      }
      return input.value;
    }
'''

main_js = re.sub(
    r"    function toNormalNameCase\(value\) \{.*?\n    \}\n\n    function normalizeLastName\(value\) \{.*?\n    \}\n\n    function applyLastNameFormatting\(\) \{.*?\n    \}\n",
    lambda _m: APPLY_LAST,
    main_js,
    count=1,
    flags=re.S,
)

# formatAlienName still calls normalizeLastName
main_js = main_js.replace(
    "const last = normalizeLastName(lastName);",
    "const last = typeof hyphenateLastName === \"function\"\n        ? hyphenateLastName(lastName)\n        : String(lastName || \"\").trim();",
)

main_js = main_js.replace(
    '["medical_issues", "q1_answer"]',
    '["medicalIssues", "q1_answer"]',
)

# collectFormData: a-number digits + citizenship label
main_js = main_js.replace(
    "        aNumber: getValue(\"alienNumber\"),",
    "        aNumber: typeof alienNumberDigits === \"function\"\n          ? alienNumberDigits(getValue(\"alienNumber\"))\n          : getValue(\"alienNumber\").replace(/\\D/g, \"\"),",
)
main_js = main_js.replace(
    "        countryOfCitizenship:\n          getValue(\"citizenship\"),",
    "        countryOfCitizenship:\n          selectedOptionText(\"citizenship\"),",
)

KNOWN_IDS = r'''    function getKnownRecordFieldIds() {
      const live = Array.from(
        document.querySelectorAll(
          "input, textarea, select"
        )
      )
        .filter(
          element =>
            element.id &&
            element.dataset.recordIgnore !== "true" &&
            !element.matches(
              'input[type="button"], input[type="submit"], input[type="file"]'
            )
        )
        .map(element => element.id);

      return new Set([
        ...live,
        ...Object.keys(LEGACY_FORM_IDS),
        ...Object.values(LEGACY_FORM_IDS),
        "gender",
        "sexMale",
        "sexFemale"
      ]);
    }
'''

main_js = re.sub(
    r"    function getKnownRecordFieldIds\(\) \{.*?\n    \}\n",
    lambda _m: KNOWN_IDS,
    main_js,
    count=1,
    flags=re.S,
)

# Remap legacy keys while restoring a saved record.
RESTORE_PATCH = r'''          const mappedId =
            elementId === "gender"
              ? "gender"
              : (LEGACY_FORM_IDS[elementId] || elementId);

          if (mappedId === "gender") {
            const raw = String(savedValue.value || "");
            const male = document.getElementById("sexMale");
            const female = document.getElementById("sexFemale");
            if (male) {
              male.checked = raw === "Male" || raw === "male";
            }
            if (female) {
              female.checked = raw === "Female" || raw === "female";
            }
            return;
          }

          const element = document.getElementById(mappedId);
'''

main_js = main_js.replace(
    """          const element = document.getElementById(elementId);

          if (!element || !savedValue) {
            return;
          }""",
    RESTORE_PATCH
    + """
          if (!element || !savedValue) {
            return;
          }""",
)

# Import ice_event or iceEvent
main_js = main_js.replace(
    """      if (formState.ice_event) {
        formState.ice_event.value = normalizeIceEventValue(
          formState.ice_event.value
        );
      }""",
    """      const iceState = formState.iceEvent || formState.ice_event;
      if (iceState) {
        iceState.value = normalizeIceEventValue(iceState.value);
      }""",
)

GET_IMPORTED = r'''    function getImportedStateValue(formState, id, fallback) {
      const mappedId = LEGACY_FORM_IDS[id] || id;
      const stateValue =
        formState[mappedId]?.value !== undefined
          ? formState[mappedId].value
          : formState[id]?.value;

      return normalizeImportedMetadataValue(
        stateValue === undefined ? fallback : stateValue,
        id
      );
    }
'''

main_js = re.sub(
    r"    function getImportedStateValue\(formState, id, fallback\) \{.*?\n    \}\n",
    lambda _m: GET_IMPORTED,
    main_js,
    count=1,
    flags=re.S,
)

# Sex radio listeners instead of #gender select
GENDER_LISTENER = r'''        document
          .querySelectorAll('input[name="sex"]')
          .forEach((input) => {
            input.addEventListener("change", updateGenderLogic);
          });
'''

main_js = re.sub(
    r"""        document
          \.getElementById\("gender"\)
          \.addEventListener\(
            "change",
            updateGenderLogic
          \);
""",
    GENDER_LISTENER,
    main_js,
    count=1,
)

# Keep last-name blur as a safety net; names.js already formats on input.
# Version badge: leave APP_RELEASE overwrite (now 0.5.0).

# Append children-checkbox helper, without wrapping <script>
extra_js = extra_js.strip()
if extra_js:
    main_js = main_js.rstrip() + "\n\n    " + extra_js + "\n"

out_js = root / "functions" / "book-in.js"
header = """/**
 * Alien Book-In Documents — PDF generate, records, medical questionnaire.
 * Shared catalogs/validators load first (countries, immigration, names, age,
 * alien-number). Do not put a second case-type or country list here.
 */
"""
out_js.write_text(header + main_js, encoding="utf-8")
print("wrote", out_js, "bytes", out_js.stat().st_size)

# --- HTML -----------------------------------------------------------------


def radio_yes_no(name, yes_id, no_id):
    return f"""            <div class="radio-row" role="radiogroup" aria-label="Answer">
              <label class="radio-field" for="{yes_id}">
                <input
                  id="{yes_id}"
                  type="radio"
                  name="{name}"
                  value="yes"
                />
                Yes
              </label>
              <label class="radio-field" for="{no_id}">
                <input
                  id="{no_id}"
                  type="radio"
                  name="{name}"
                  value="no"
                />
                No
              </label>
            </div>"""


def medical_q(number, text, details_id, details_label, wrapper_id=None, female=False):
    classes = "medical-question"
    if female:
        classes += " female-only-question"
    id_attr = f' id="{wrapper_id}"' if wrapper_id else ""
    placeholder = ""
    if number == 5:
        placeholder = '\n              placeholder="Example: Approximately 5 months"'
    return f"""        <div{id_attr} class="{classes}">
          <div class="question-text">
            {text}
          </div>
          <div class="field answer-field">
{radio_yes_no(f"q{number}_answer", f"q{number}_yes", f"q{number}_no")}
          </div>
          <div class="field details">
            <label for="{details_id}">{details_label}</label>
            <textarea id="{details_id}"{placeholder}></textarea>
          </div>
        </div>"""


questions = [
    medical_q(
        1,
        "1. History of or current medical or mental-health issues?",
        "medicalIssues",
        "Medical or mental-health details",
    ),
    medical_q(
        2,
        "2. Taking prescription medications? Include whether the medication is currently in the subject's possession.",
        "medicine",
        "Medication details",
    ),
    medical_q(3, "3. Does the alien have any allergies, including food or medicine allergies?", "q3_details", "Additional details"),
    medical_q(4, "4. Is the alien a drug user?", "q4_details", "Additional details"),
    medical_q(
        5,
        "5. Is the alien pregnant? If yes, how many months?",
        "q5_details",
        "Additional details",
        wrapper_id="q5_question",
        female=True,
    ),
    medical_q(
        6,
        "6. Is the alien nursing?",
        "q6_details",
        "Additional details",
        wrapper_id="q6_question",
        female=True,
    ),
    medical_q(7, "7. Is the alien currently ill, injured, or experiencing significant pain?", "q7_details", "Additional details"),
    medical_q(8, "8. Does the alien have a skin rash?", "q8_details", "Additional details"),
    medical_q(9, "9. Does the alien have a contagious disease?", "q9_details", "Additional details"),
    medical_q(10, "10. Is the alien thinking about hurting themselves or others?", "q10_details", "Additional details"),
    medical_q(11, "11. Does the alien feel feverish or believe they have a fever?", "q11_details", "Additional details"),
    medical_q(12, "12. Does the alien have a cough or difficulty breathing?", "q12_details", "Additional details"),
    medical_q(13, "13. Does the alien have nausea, vomiting, or diarrhea?", "q13_details", "Additional details"),
]

html = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Book-in</title>
    <link rel="stylesheet" href="style/style.css" />
  </head>
  <body>
    <header class="app-bar">
      <!--
        VERSIONING (keep data-version and the visible text the same)
        Shared with Lead Entry. Book-in records still use APP_RELEASE
        inside functions/book-in.js for backup format / schema.
      -->
      <div class="app-bar-brand">
        <span>Book-in</span>
        <span
          id="appVersion"
          class="app-version"
          data-version="0.5.0"
        >
          Version 0.5.0
        </span>
        <span id="currentDate" class="app-bar-date"></span>
      </div>
      <nav class="app-bar-nav" aria-label="Pages">
        <a href="index.html">Lead</a>
        <a href="bookin.html" aria-current="page">Book-in</a>
        <a href="map.html">Map</a>
      </nav>
      <div class="app-bar-file">
        <button
          type="button"
          id="generateButton"
          class="action-button"
          onclick="generateCombinedPacket()"
        >
          Generate
        </button>
        <button
          type="button"
          class="action-button-secondary"
          onclick="clearForm()"
        >
          Clear
        </button>
      </div>
    </header>

    <div class="page">
      <p class="section-note">
        Enter the information to generate both the CAP Tear Sheet and the
        Medical Questionnaire.
      </p>

      <fieldset class="card-static" data-name-card data-card="lead">
        <legend>Biographics</legend>
        <div class="row">
          <div class="field">
            <div class="field-label-row">
              <label for="lastName">Last Name</label>
              <button
                type="button"
                id="copyNameButton"
                class="action-button-secondary field-copy-button"
                onclick="copyAlienName()"
              >
                Copy Name
              </button>
            </div>
            <input
              type="text"
              id="lastName"
              name="lastName"
              data-field="lastName"
              autocomplete="off"
              autocapitalize="words"
              spellcheck="false"
              title="Paste a full name to fill first and last"
            />
            <p class="field-caption">
              One last name uses all caps. Two format as FATHERSURNAME-Mothersurname.
            </p>
          </div>
          <div class="field">
            <label for="firstName">First Name</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              data-field="firstName"
              autocomplete="off"
              title="Paste a full name to fill first and last"
            />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <div class="field-label-row">
              <label for="alienNumber">Alien Number</label>
              <button
                type="button"
                id="copyANumberButton"
                class="action-button-secondary field-copy-button"
                onclick="copyANumber()"
              >
                Copy A-Number
              </button>
            </div>
            <input
              type="text"
              id="alienNumber"
              name="alienNumber"
              data-field="alienNumber"
              inputmode="numeric"
              autocomplete="off"
              placeholder="A000 000 000"
            />
            <p class="field-caption">Optional. If entered, exactly 9 digits.</p>
          </div>
          <div class="field">
            <label for="iceEvent">ICE Event Number</label>
            <input
              type="text"
              id="iceEvent"
              name="iceEvent"
              autocapitalize="characters"
              spellcheck="false"
            />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="officersName">Officer's name</label>
            <input type="text" id="officersName" name="officersName" />
          </div>
          <div class="field">
            <label for="dateTime">Date and time</label>
            <input type="datetime-local" id="dateTime" name="dateTime" />
          </div>
        </div>
        <div class="row row-3">
          <div class="field">
            <span class="field-caption">Sex</span>
            <div class="radio-row">
              <label class="radio-field" for="sexMale">
                <input
                  type="radio"
                  id="sexMale"
                  name="sex"
                  data-field="sex"
                  value="male"
                />
                Male
              </label>
              <label class="radio-field" for="sexFemale">
                <input
                  type="radio"
                  id="sexFemale"
                  name="sex"
                  data-field="sex"
                  value="female"
                />
                Female
              </label>
            </div>
          </div>
          <div class="field">
            <label for="dateOfBirth">
              Date of Birth
              <input type="hidden" id="age" name="age" data-field="age" />
              <span
                id="ageDisplay"
                class="age-display"
                data-field="ageDisplay"
              ></span>
            </label>
            <input
              type="date"
              id="dateOfBirth"
              name="dateOfBirth"
              data-field="dateOfBirth"
            />
          </div>
          <div class="field">
            <label for="citizenship">Country of Citizenship</label>
            <select
              id="citizenship"
              name="citizenship"
              data-field="citizenship"
            ></select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="immigrationDisposition">Case type</label>
            <select
              id="immigrationDisposition"
              name="immigrationDisposition"
            ></select>
          </div>
          <select
            id="immigrationStatus"
            name="immigrationStatus"
            hidden
            data-record-ignore="true"
          ></select>
        </div>
        <div class="row">
          <div class="field">
            <label for="team">Team</label>
            <input type="text" id="team" name="team" value="DAL - 3 / Street" />
          </div>
          <div class="field">
            <label for="cash">Cash</label>
            <input
              type="text"
              id="cash"
              name="cash"
              inputmode="decimal"
              placeholder="$0.00"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="travelDocs">Travel documents</label>
            <input type="text" id="travelDocs" name="travelDocs" />
          </div>
          <div class="field">
            <label for="propertyTag">Property Tag (I-77)</label>
            <input type="text" id="propertyTag" name="propertyTag" autocomplete="off" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="cellNum">Holding cell number</label>
            <input type="tel" id="cellNum" name="cellNum" />
          </div>
        </div>
        <div class="row">
          <div class="field field-span-2">
            <label for="children">Children</label>
            <label class="checkbox-field" for="notPrimaryCaregiver">
              <input id="notPrimaryCaregiver" type="checkbox" />
              <span>Not the primary caregiver of children in the United States</span>
            </label>
            <textarea id="children"></textarea>
          </div>
        </div>
      </fieldset>

      <fieldset class="card-static">
        <legend>Medical Questionnaire</legend>
        <p class="section-note">
          These answers populate both the CAP tear sheet and the corresponding
          medical-questionnaire fields. Entering details automatically marks
          that question Yes.
        </p>

        <div class="medical-question">
          <div class="question-text">
            Agent/Officer: Are you able to communicate with the alien?
          </div>
          <div class="field answer-field">
{radio_yes_no("communication_answer", "communication_yes", "communication_no")}
          </div>
        </div>

        <div class="medical-bulk-option">
          <label class="checkbox-field" for="noMedicalIssues">
            <input
              id="noMedicalIssues"
              type="checkbox"
              aria-describedby="noMedicalIssuesHint"
            />
            <span>No medical issues</span>
          </label>
        </div>

{"".join(questions)}

        <div class="row">
          <div class="field field-span-2">
            <label for="additionalObservations">
              Additional agent/officer observations
            </label>
            <textarea
              id="additionalObservations"
              placeholder="Document other observations or concerns."
            ></textarea>
          </div>
        </div>

        <div class="medical-question">
          <div class="question-text">
            Was the alien referred for a medical assessment?
          </div>
          <div class="field answer-field">
{radio_yes_no("referral_answer", "referral_yes", "referral_no")}
          </div>
        </div>
      </fieldset>

      <div class="form-actions">
        <button
          type="button"
          class="action-button"
          onclick="generateCombinedPacket()"
        >
          Generate Book-In Documents
        </button>
        <button
          type="button"
          class="action-button-secondary"
          onclick="clearForm()"
        >
          Clear All
        </button>
      </div>

      <fieldset class="card-static records-panel">
        <legend>Saved Records</legend>
        <p class="records-note">
          Records are saved locally in this browser. Saving a record does not
          generate a PDF. Export a backup before replacing or moving this file
          or clearing browser data. Exported backups are unencrypted and may
          contain biographic and medical information; store them securely.
        </p>
        <div class="records-toolbar">
          <button
            id="saveRecordButton"
            type="button"
            class="action-button"
            onclick="saveCurrentRecord()"
          >
            Save Current Record
          </button>
          <button
            type="button"
            class="action-button-secondary"
            onclick="startNewRecord()"
          >
            New Blank Record
          </button>
          <button
            id="exportRecordsButton"
            type="button"
            class="action-button-secondary"
            onclick="exportSavedRecords()"
          >
            Export Records
          </button>
          <button
            id="importRecordsButton"
            type="button"
            class="action-button-secondary"
            onclick="chooseRecordsBackupFile('merge')"
          >
            Import / Merge
          </button>
          <button
            id="restoreRecordsButton"
            type="button"
            class="action-button-danger"
            onclick="chooseRecordsBackupFile('replace')"
            title="Replace every saved record with the selected backup"
          >
            Restore Backup
          </button>
          <input
            id="recordsImportFile"
            type="file"
            accept=".json,application/json"
            data-record-ignore="true"
            hidden
          />
          <span id="activeRecordLabel" class="active-record-label">
            No saved record loaded
          </span>
        </div>
        <div id="recordsEmpty" class="records-empty">
          No saved records yet.
        </div>
        <div id="recordsTableWrap" class="records-table-wrap" hidden>
          <table class="records-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>A-Number</th>
                <th>ICE Event</th>
                <th>Last Saved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="savedRecordsBody"></tbody>
          </table>
        </div>
      </fieldset>

      <div id="status" role="status" aria-live="polite">Ready.</div>
    </div>

    <div id="missingFieldsDialog" class="dialog-backdrop" hidden>
      <div
        class="dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="missingFieldsTitle"
      >
        <h2 id="missingFieldsTitle">Missing fields</h2>
        <p>
          These fields are empty. Generate anyway, or go back and edit.
        </p>
        <ul id="missingFieldsList"></ul>
        <div class="dialog-actions">
          <button
            id="missingFieldsContinue"
            type="button"
            class="action-button"
          >
            OK, generate anyway
          </button>
          <button
            id="missingFieldsCancel"
            type="button"
            class="action-button-secondary"
          >
            Cancel, keep editing
          </button>
        </div>
      </div>
    </div>

    <script src="functions/date.js"></script>
    <script src="functions/age.js"></script>
    <script src="functions/names.js"></script>
    <script src="functions/alien-number.js"></script>
    <script src="data/countries.js"></script>
    <script src="data/immigration.js"></script>
    <script src="functions/cards.js"></script>
    <script src="functions/book-in.js"></script>
  </body>
</html>
"""

out_html = root / "bookin.html"
out_html.write_text(html, encoding="utf-8")
print("wrote", out_html, "bytes", out_html.stat().st_size)
