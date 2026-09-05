/**
 * Alien Book-In Documents — PDF generate, records, medical questionnaire.
 * Shared catalogs/validators load first (countries, immigration, names, age,
 * alien-number). Do not put a second case-type or country list here.
 */




    const DEFAULT_TEAM = "DAL - 3 / Street";

    const BOOKIN_FORMAT = Object.freeze({
      name: "Alien Book-In Documents",
      backupVersion: "1.12.0",
      releaseDate: "2026-09-04",
      recordsSchemaVersion: 5,
      minimumRecordsSchemaVersion: 1,
      recordsBackupFormat: "alien-book-in-records"
    });

    function productVersion() {
      const config = window.COPDoc && window.COPDoc.config;
      const badge = document.getElementById("appVersion");
      return (
        (config && config.productVersion) ||
        (badge && badge.getAttribute("data-version")) ||
        "0.69.2"
      );
    }

    const MAX_RECORDS_BACKUP_BYTES = 32 * 1024 * 1024;
    const MAX_IMPORTED_RECORDS = 5000;
    const MAX_IMPORTED_FIELD_VALUE_LENGTH = 100000;



    const SAVED_RECORDS_STORAGE_KEY =
      (window.COPDoc &&
        window.COPDoc.config &&
        window.COPDoc.config.storageKey("bookin")) ||
      "alien-book-in.saved-records.v1";
    const SAVED_RECORD_COLUMN_KEYS = Object.freeze([
      "subject",
      "age",
      "country",
      "aNumber",
      "fbiNumber",
      "iceEvent",
      "encounterNumber",
      "caseType",
      "arrestDateTime",
      "updatedAt"
    ]);

    const MEDICAL_QUESTION_GROUPS = Object.freeze(
      Array.from(
        { length: 13 },
        (_, index) => `q${index + 1}_answer`
      )
    );

    const FEMALE_ONLY_MEDICAL_QUESTION_GROUPS =
      Object.freeze(["q5_answer", "q6_answer"]);

    const MEDICAL_DETAIL_FIELD_MAP = Object.freeze([
      ["medicalIssues", "q1_answer"],
      ["medicine", "q2_answer"],
      ...Array.from(
        { length: 11 },
        (_, index) => {
          const questionNumber = index + 3;

          return [
            `q${questionNumber}_details`,
            `q${questionNumber}_answer`
          ];
        }
      )
    ]);

    let activeRecordId = null;
    let activeRecordBaseUpdatedAt = null;
    let bookingSaveInProgress = false;
    let pendingLeadId = "";
    let pendingRecordsImportMode = "merge";
    let suppressAutoSave = false;
    let lastSavedSignature = "";
    let autoSaveBound = false;
    const visibleSavedRecordColumnKeys = new Set(SAVED_RECORD_COLUMN_KEYS);
    let savedRecordsSortKey = "updatedAt";
    let savedRecordsSortDirection = "desc";
    let inlineRecordEditState = null;

    function getValue(id) {
      const element = document.getElementById(id);

      if (!element) {
        console.warn(`Missing HTML element: ${id}`);
        return "";
      }

      return String(element.value || "").trim();
    }

    const LEGACY_FORM_IDS = Object.freeze({
      first_name: "firstName",
      last_name: "lastName",
      a_number: "alienNumber",
      fbi_number: "fbiNumber",
      ice_event: "iceEvent",
      encounter_number: "encounterNumber",
      subject_role_target: "encounterRoleTarget",
      subject_role_collateral: "encounterRoleCollateral",
      vehicle_position: "vehiclePosition",
      officers_name: "officersName",
      date_time: "dateTime",
      arrest_time: "arrestTime",
      arrest_time_manual: "arrestTimeManual",
      foreign_warrants: "foreignWarrants",
      foreign_warrant_country: "foreignWarrantCountry",
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

    function citizenshipLabel(value) {
      const cleaned = String(value || "").trim();
      const code = resolveCitizenshipCode(cleaned);
      const match = (window.COUNTRIES || []).find(
        country => String(country && country.code) === code
      );
      return match ? String(match.label || match.code) : cleaned;
    }

    function formatCaseTypeOption(entry) {
      return `${entry.code} - ${entry.description}`;
    }

    function getCaseTypeCode(value) {
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



    function getRadioValue(groupName) {
      const selected = document.querySelector(
        `input[type="radio"][name="${groupName}"]:checked`
      );

      return selected ? selected.value : "";
    }

    function clearRadioGroup(groupName) {
      document
        .querySelectorAll(
          `input[type="radio"][name="${groupName}"]`
        )
        .forEach(input => {
          input.checked = false;
        });
    }

    function getMedicalQuestionNoInput(groupName) {
      return document.querySelector(
        `input[type="radio"][name="${groupName}"][value="no"]`
      );
    }

    function getApplicableMedicalQuestionGroups() {
      if (getSexLabel() !== "Male") {
        return MEDICAL_QUESTION_GROUPS;
      }

      return MEDICAL_QUESTION_GROUPS.filter(
        groupName =>
          !FEMALE_ONLY_MEDICAL_QUESTION_GROUPS.includes(
            groupName
          )
      );
    }

    function syncNoMedicalIssuesCheckbox() {
      const checkbox =
        document.getElementById("noMedicalIssues");

      if (!checkbox) {
        return;
      }

      const applicableGroups =
        getApplicableMedicalQuestionGroups();

      const noInputs = applicableGroups
        .map(getMedicalQuestionNoInput)
        .filter(Boolean);

      checkbox.checked =
        noInputs.length === applicableGroups.length &&
        noInputs.every(input => input.checked);
    }

    function setAllMedicalQuestionsToNo() {
      if (getSexLabel() === "Male") {
        FEMALE_ONLY_MEDICAL_QUESTION_GROUPS.forEach(
          clearRadioGroup
        );
      }

      getApplicableMedicalQuestionGroups()
        .map(getMedicalQuestionNoInput)
        .filter(Boolean)
        .forEach(input => {
          input.checked = true;
        });

      syncNoMedicalIssuesCheckbox();
    }

    function clearMedicalQuestionNoSelections() {
      MEDICAL_QUESTION_GROUPS
        .map(getMedicalQuestionNoInput)
        .filter(Boolean)
        .forEach(input => {
          if (input.checked) {
            input.checked = false;
          }
        });

      syncNoMedicalIssuesCheckbox();
    }

    function selectMedicalQuestionYes(groupName) {
      const yesInput = document.querySelector(
        `input[type="radio"][name="${groupName}"][value="yes"]`
      );

      if (!yesInput || yesInput.disabled || yesInput.checked) {
        return;
      }

      yesInput.checked = true;
      yesInput.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    }

    function normalizeANumberInput() {
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

    function normalizeIceEventValue(value) {
      return String(value ?? "").toUpperCase();
    }

    function normalizeFbiNumberValue(value) {
      return String(value ?? "").trim().toUpperCase();
    }

    function normalizeFbiNumberInput() {
      const input = document.getElementById("fbiNumber");
      if (!input) {
        return "";
      }
      input.value = normalizeFbiNumberValue(input.value);
      return input.value;
    }

    function normalizeIceEventInput() {
      const input = document.getElementById("iceEvent");

      if (!input) {
        return "";
      }

      input.value = normalizeIceEventValue(input.value);
      return input.value.trim();
    }

    function padDateTimePart(value) {
      return String(value).padStart(2, "0");
    }

    function normalizeArrestTimeValue(value) {
      const match = String(value || "")
        .trim()
        .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
        return "";
      }
      return `${padDateTimePart(Number(match[1]))}:${match[2]}`;
    }

    function parseLocalDateTimeInput(value) {
      const match = String(value || "").match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
      );
      if (!match) {
        return null;
      }
      const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5])
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatLocalTimeInput(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
      }
      return `${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`;
    }

    function getDefaultArrestTime(bookInDateTime) {
      const date = parseLocalDateTimeInput(bookInDateTime);
      if (!date) {
        return "";
      }
      date.setMinutes(date.getMinutes() - 60);
      return formatLocalTimeInput(date);
    }

    function setArrestTimeManualState(manual) {
      const input = document.getElementById("arrestTimeManual");
      if (input) {
        input.value = manual ? "true" : "false";
      }
    }

    function setDefaultArrestTime(force = false) {
      const input = document.getElementById("arrestTime");
      const manual = getValue("arrestTimeManual") === "true";
      if (!input || (manual && !force)) {
        return;
      }
      input.value = getDefaultArrestTime(getValue("dateTime"));
      if (force) {
        setArrestTimeManualState(false);
      }
    }

    function applyLastNameFormatting() {
      const input = document.getElementById("lastName");
      if (!input) {
        return "";
      }
      if (typeof hyphenateLastName === "function") {
        input.value = hyphenateLastName(input.value);
      }
      return input.value;
    }

    function setFemaleOnlyQuestionState(questionId, disabled) {
      const question = document.getElementById(questionId);

      if (!question) {
        return;
      }

      question.classList.toggle("is-disabled", disabled);

      question
        .querySelectorAll("input, textarea, select")
        .forEach(element => {
          element.disabled = disabled;

          if (disabled) {
            if (element.matches('input[type="radio"], input[type="checkbox"]')) {
              element.checked = false;
            } else {
              element.value = "";
            }
          }
        });
    }

    function updateGenderLogic() {
      const gender = getSexLabel();
      const male = gender === "Male";
      const masterCheckbox =
        document.getElementById("noMedicalIssues");
      const masterWasChecked =
        Boolean(masterCheckbox?.checked);

      setFemaleOnlyQuestionState("q5_question", male);
      setFemaleOnlyQuestionState("q6_question", male);

      if (male) {
        clearRadioGroup("q5_answer");
        clearRadioGroup("q6_answer");
      }

      if (masterWasChecked) {
        setAllMedicalQuestionsToNo();
      } else {
        syncNoMedicalIssuesCheckbox();
      }
    }

    function validateRequiredData(data) {
      const errors = [];
      const aNumberInput = document.getElementById("alienNumber");
      // const genderInput = document.getElementById("gender");

      aNumberInput.classList.remove("invalid-field");
      // genderInput.classList.remove("invalid-field");

      if (data.aNumber && !/^\d{9}$/.test(data.aNumber)) {
        errors.push("If entered, A-Number must contain exactly 9 digits.");
        aNumberInput.classList.add("invalid-field");
      }

      // if (data.gender !== "Male" && data.gender !== "Female") {
      //   errors.push("Select Male or Female for gender.");
      //   genderInput.classList.add("invalid-field");
      // }

      if (errors.length > 0) {
        const firstInvalid = document.querySelector(".invalid-field");

        if (firstInvalid) {
          firstInvalid.focus();
          firstInvalid.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }

        throw new Error(errors.join("\n"));
      }
    }

    function setStatus(message, type = "") {
      const status = document.getElementById("status");

      if (!status) {
        console.warn("Status element is missing:", message);
        return;
      }

      status.textContent = message;
      status.className = "app-bar-status" + (type ? " " + type : "");
    }

    function loadExternalScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          reject(new Error(`Could not load ${src}`));
        };
        document.head.appendChild(script);
      });
    }

    async function ensurePdfLib() {
      if (window.PDFLib) {
        return;
      }

      const fallbacks = [
        "js/pdf.js",
        "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
        "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"
      ];

      for (const src of fallbacks) {
        try {
          await loadExternalScript(src);

          if (window.PDFLib) {
            return;
          }
        } catch (error) {
          console.warn(error);
        }
      }

      throw new Error(
        "The PDF engine could not load on this browser. Keep this HTML file together with the js folder, or open it while connected to the internet and try again."
      );
    }

    function updateAge() {
      const card = document.querySelector("[data-name-card]");
      if (typeof updateAgeDisplay === "function") {
        updateAgeDisplay(card);
      }
      const ageInput = document.getElementById("age");
      return ageInput ? String(ageInput.value || "").trim() : "";
    }

    function formatCashInput() {
      const input = document.getElementById("cash");

      if (!input) {
        return;
      }

      input.value = formatCash(input.value);
    }

    function formatCash(value) {
      return COPDoc.bookInPdf.formatCash(value);
    }

    function formatAlienName(firstName, lastName) {
      return COPDoc.bookInPdf.formatAlienName(firstName, lastName,
        typeof hyphenateLastName === "function" ? hyphenateLastName : undefined);
    }

    async function writeClipboardText(value) {
      const text = String(value || "");

      if (
        window.isSecureContext &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch (error) {
          console.warn(
            "Clipboard API unavailable; using local fallback.",
            error
          );
        }
      }

      const copyBuffer = document.createElement("textarea");
      copyBuffer.value = text;
      copyBuffer.setAttribute("readonly", "");
      copyBuffer.setAttribute("aria-hidden", "true");
      copyBuffer.style.position = "fixed";
      copyBuffer.style.left = "-9999px";
      copyBuffer.style.top = "0";
      copyBuffer.style.opacity = "0";
      document.body.appendChild(copyBuffer);
      copyBuffer.focus();
      copyBuffer.select();
      copyBuffer.setSelectionRange(0, copyBuffer.value.length);

      let copied = false;

      try {
        copied = Boolean(
          document.execCommand &&
          document.execCommand("copy")
        );
      } finally {
        copyBuffer.remove();
      }

      if (!copied) {
        throw new Error("The browser blocked clipboard access.");
      }
    }

    function showCopyButtonFeedback(buttonId) {
      const button = document.getElementById(buttonId);

      if (!button) {
        return;
      }

      if (!button.dataset.defaultCopyLabel) {
        button.dataset.defaultCopyLabel =
          button.textContent.trim();
      }

      window.clearTimeout(button.copyFeedbackTimer);
      button.textContent = "Copied";
      button.copyFeedbackTimer = window.setTimeout(
        () => {
          button.textContent = button.dataset.defaultCopyLabel;
        },
        1400
      );
    }

    async function copyAlienName() {
      const firstName = getValue("firstName");
      const lastName = applyLastNameFormatting();
      const alienName = formatAlienName(firstName, lastName);

      if (!alienName) {
        setStatus("Enter the alien's name before copying.", "warning");
        document.getElementById("firstName")?.focus();
        return;
      }

      try {
        await writeClipboardText(alienName);
        showCopyButtonFeedback("copyNameButton");
        setStatus(`Name copied: ${alienName}`, "success");
      } catch (error) {
        console.error(error);
        setStatus(
          "Copy was blocked by the browser. Select the name and copy it manually.",
          "error"
        );
      }
    }

    async function copyANumber() {
      const aNumber = normalizeANumberInput();
      const input = document.getElementById("alienNumber");

      if (aNumber.length !== 9) {
        setStatus(
          "Enter a complete 9-digit A-Number before copying.",
          "warning"
        );
        input?.focus();
        return;
      }

      try {
        await writeClipboardText(aNumber);
        showCopyButtonFeedback("copyANumberButton");
        setStatus("A-Number copied.", "success");
      } catch (error) {
        console.error(error);
        input?.focus();
        input?.select();
        setStatus(
          "Copy was blocked by the browser. The A-Number is selected for manual copying.",
          "error"
        );
      }
    }

    function collectFormData() {
      const age = updateAge();
      normalizeANumberInput();
      normalizeFbiNumberInput();
      normalizeIceEventInput();
      applyLastNameFormatting();
      updateGenderLogic();

      const gender = getSexLabel();

      return {
        firstName: getValue("firstName"),
        lastName: getValue("lastName"),
        aNumber: typeof alienNumberDigits === "function"
          ? alienNumberDigits(getValue("alienNumber"))
          : getValue("alienNumber").replace(/\D/g, ""),
        fbiNumber: getValue("fbiNumber"),
        iceEvent: getValue("iceEvent"),
        encounterNumber: getValue("encounterNumber"),
        subjectRole: currentEncounterRole(),
        vehiclePosition: getValue("vehiclePosition"),
        officersName: getValue("officersName"),
        dateTime: getValue("dateTime"),
        arrestTime:
          normalizeArrestTimeValue(getValue("arrestTime")) ||
          getDefaultArrestTime(getValue("dateTime")),
        foreignWarrants: getValue("foreignWarrants") || "no",
        foreignWarrantCountry:
          getValue("foreignWarrants") === "yes"
            ? getValue("foreignWarrantCountry")
            : "",
        dateOfBirth: getValue("dateOfBirth"),
        age,
        gender,
        countryOfCitizenship:
          selectedOptionText("citizenship"),

        caseType: getCaseTypeCode(getValue("immigrationDisposition")),
        team: getValue("team"),
        cash: getValue("cash"),
        travelDocs: getValue("travelDocs"),
        propertyTag: getValue("propertyTag"),
        cellNum: getValue("cellNum"),
        children: getValue("children"),

        medicalIssues: getValue("medicalIssues"),
        medicine: getValue("medicine"),

        communicationAnswer:
          getRadioValue("communication_answer"),

        q1Answer: getRadioValue("q1_answer"),
        q2Answer: getRadioValue("q2_answer"),
        q3Answer: getRadioValue("q3_answer"),
        q3Details: getValue("q3_details"),
        q4Answer: getRadioValue("q4_answer"),
        q4Details: getValue("q4_details"),
        q5Answer:
          gender === "Male"
            ? ""
            : getRadioValue("q5_answer"),
        q5Details: gender === "Male" ? "" : getValue("q5_details"),
        q6Answer:
          gender === "Male"
            ? ""
            : getRadioValue("q6_answer"),
        q6Details: gender === "Male" ? "" : getValue("q6_details"),
        q7Answer: getRadioValue("q7_answer"),
        q7Details: getValue("q7_details"),
        q8Answer: getRadioValue("q8_answer"),
        q8Details: getValue("q8_details"),
        q9Answer: getRadioValue("q9_answer"),
        q9Details: getValue("q9_details"),
        q10Answer: getRadioValue("q10_answer"),
        q10Details: getValue("q10_details"),
        q11Answer: getRadioValue("q11_answer"),
        q11Details: getValue("q11_details"),
        q12Answer: getRadioValue("q12_answer"),
        q12Details: getValue("q12_details"),
        q13Answer: getRadioValue("q13_answer"),
        q13Details: getValue("q13_details"),

        additionalObservations:
          getValue("additionalObservations"),

        referralAnswer:
          getRadioValue("referral_answer")
      };
    }

    function updateBookInForeignWarrantControls() {
      const select = document.getElementById("foreignWarrants");
      const country = document.getElementById("foreignWarrantCountry");
      if (!select || !country) {
        return;
      }
      if (select.value !== "yes" && select.value !== "no") {
        select.value = "no";
      }
      const yes = select.value === "yes";
      country.disabled = !yes;
      country.required = yes;
      country.setAttribute("aria-required", yes ? "true" : "false");
      if (!yes) {
        country.value = "";
      }
    }

    const GENERATE_WARNING_FIELDS = Object.freeze([
      { key: "firstName", label: "First name", elementId: "firstName" },
      { key: "lastName", label: "Last name", elementId: "lastName" },
      { key: "iceEvent", label: "ICE Event Number", elementId: "iceEvent" },
      { key: "officersName", label: "Officer's name", elementId: "officersName" },
      { key: "dateTime", label: "Date and time", elementId: "dateTime" },
      { key: "dateOfBirth", label: "Date of birth", elementId: "dateOfBirth" },
      { key: "gender", label: "Gender", elementId: "sexMale" },
      {
        key: "countryOfCitizenship",
        label: "Country of citizenship",
        elementId: "citizenship"
      },
      { key: "caseType", label: "Case type", elementId: "immigrationDisposition" },
      {
        key: "communicationAnswer",
        label: "Able to communicate",
        elementId: "communication_yes"
      },
      {
        key: "q1Answer",
        label: "Question 1 (medical or mental-health)",
        elementId: "q1_yes"
      },
      {
        key: "q2Answer",
        label: "Question 2 (prescription medications)",
        elementId: "q2_yes"
      },
      {
        key: "q3Answer",
        label: "Question 3 (allergies)",
        elementId: "q3_yes"
      },
      {
        key: "q4Answer",
        label: "Question 4 (drug use)",
        elementId: "q4_yes"
      },
      {
        key: "q5Answer",
        label: "Question 5 (pregnant)",
        elementId: "q5_yes",
        skipWhenMale: true
      },
      {
        key: "q6Answer",
        label: "Question 6 (nursing)",
        elementId: "q6_yes",
        skipWhenMale: true
      },
      {
        key: "q7Answer",
        label: "Question 7 (ill, injured, or pain)",
        elementId: "q7_yes"
      },
      {
        key: "q8Answer",
        label: "Question 8 (skin rash)",
        elementId: "q8_yes"
      },
      {
        key: "q9Answer",
        label: "Question 9 (contagious disease)",
        elementId: "q9_yes"
      },
      {
        key: "q10Answer",
        label: "Question 10 (hurting self or others)",
        elementId: "q10_yes"
      },
      {
        key: "q11Answer",
        label: "Question 11 (fever)",
        elementId: "q11_yes"
      },
      {
        key: "q12Answer",
        label: "Question 12 (cough or breathing)",
        elementId: "q12_yes"
      },
      {
        key: "q13Answer",
        label: "Question 13 (nausea, vomiting, or diarrhea)",
        elementId: "q13_yes"
      },
      {
        key: "referralAnswer",
        label: "Medical assessment referral",
        elementId: "referral_yes"
      }
    ]);

    function getMissingGenerateFields(data) {
      const male = data.gender === "Male";

      return GENERATE_WARNING_FIELDS.filter(field => {
        if (field.skipWhenMale && male) {
          return false;
        }

        return !String(data[field.key] || "").trim();
      });
    }

    function confirmMissingGenerateFields(missing) {
      if (missing.length === 0) {
        return Promise.resolve(true);
      }

      return new Promise(resolve => {
        const dialog = document.getElementById("missingFieldsDialog");
        const list = document.getElementById("missingFieldsList");
        const ok = document.getElementById("missingFieldsContinue");
        const cancel = document.getElementById("missingFieldsCancel");

        list.replaceChildren(
          ...missing.map(field => {
            const item = document.createElement("li");
            item.textContent = field.label;
            return item;
          })
        );

        dialog.hidden = false;
        cancel.focus();

        function finish(shouldGenerate) {
          dialog.hidden = true;
          ok.removeEventListener("click", onOk);
          cancel.removeEventListener("click", onCancel);
          dialog.removeEventListener("click", onBackdrop);
          document.removeEventListener("keydown", onKeyDown);
          resolve(shouldGenerate);
        }

        function onOk() {
          finish(true);
        }

        function onCancel() {
          finish(false);
        }

        function onBackdrop(event) {
          if (event.target === dialog) {
            finish(false);
          }
        }

        function onKeyDown(event) {
          if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }

        ok.addEventListener("click", onOk);
        cancel.addEventListener("click", onCancel);
        dialog.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKeyDown);
      });
    }

    function createRecordId() {
      if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
      ) {
        return window.crypto.randomUUID();
      }

      return `record-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
    }

    function captureFormState() {
      const state = {};

      document
        .querySelectorAll("input, textarea, select")
        .forEach(element => {
          if (
            !element.id ||
            element.dataset.recordIgnore === "true"
          ) {
            return;
          }

          if (element.tagName === "SELECT") {
            element
              .querySelectorAll(
                'option[data-legacy-value="true"]'
              )
              .forEach(option => option.remove());
          }

          if (
            element.matches(
              'input[type="button"], input[type="submit"]'
            )
          ) {
            return;
          }

          state[element.id] = {
            checked: Boolean(element.checked),
            type: element.type || element.tagName.toLowerCase(),
            value: String(element.value ?? "")
          };
        });

      return state;
    }

    function normalizeRestoredSelectValue(element, value) {
      const restoredValue = String(value ?? "").trim();

      if (element.id === "immigrationDisposition") {
        return getCaseTypeCode(restoredValue);
      }

      if (element.id === "citizenship") {
        return resolveCitizenshipCode(restoredValue);
      }

      return restoredValue;
    }

    function restoreElementValue(element, value) {
      const restoredValue =
        element.tagName === "SELECT"
          ? normalizeRestoredSelectValue(element, value)
          : String(value ?? "");

      if (element.tagName === "SELECT") {
        element
          .querySelectorAll('option[data-legacy-value="true"]')
          .forEach(option => option.remove());
      }

      if (
        element.tagName === "SELECT" &&
        restoredValue &&
        !Array.from(element.options).some(
          option => option.value === restoredValue
        )
      ) {
        const legacyOption = document.createElement("option");
        legacyOption.value = restoredValue;
        legacyOption.textContent = restoredValue;
        legacyOption.dataset.legacyValue = "true";
        element.appendChild(legacyOption);
      }

      element.value = restoredValue;
    }

    function restoreFormState(state) {
      document
        .querySelectorAll("input, textarea, select")
        .forEach(element => {
          if (
            !element.id ||
            element.dataset.recordIgnore === "true"
          ) {
            return;
          }

          if (
            element.matches(
              'input[type="radio"], input[type="checkbox"]'
            )
          ) {
            element.checked = false;
          } else if (!element.readOnly) {
            element.value = "";
          }

          element.classList.remove("invalid-field");
        });

      Object.entries(state || {}).forEach(
        ([elementId, savedValue]) => {
          const mappedId =
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

          if (!element || !savedValue) {
            return;
          }

          if (
            element.matches(
              'input[type="radio"], input[type="checkbox"]'
            )
          ) {
            element.checked = Boolean(savedValue.checked);
          } else {
            restoreElementValue(element, savedValue.value);
          }
        }
      );

      updateAge();
      normalizeANumberInput();
      normalizeFbiNumberInput();
      normalizeIceEventInput();
      updateBookInForeignWarrantControls();
      const restoredArrestTime = normalizeArrestTimeValue(getValue("arrestTime"));
      const hasManualState = Boolean(
        state?.arrestTimeManual || state?.arrest_time_manual
      );
      if (restoredArrestTime) {
        document.getElementById("arrestTime").value = restoredArrestTime;
        if (!hasManualState) {
          setArrestTimeManualState(true);
        }
      } else {
        setDefaultArrestTime(true);
      }
      applyLastNameFormatting();
      updateGenderLogic();
      formatCashInput();
    }

    function readSavedRecords() {
      try {
        const records = COPDoc.repositories.bookin.readAll();

        if (!Array.isArray(records)) {
          return [];
        }

        return records.filter(record => {
          const usable =
            isPlainRecordObject(record) &&
            typeof record.id === "string" &&
            record.id.trim() &&
            isPlainRecordObject(record.formState);

          if (!usable) {
            console.warn(
              "Ignored an invalid locally saved record.",
              record
            );
          }

          return usable;
        });
      } catch (error) {
        console.error("Could not read saved records.", error);
        setStatus(
          "Saved records could not be read from this browser.",
          "error"
        );
        return [];
      }
    }

    function readSavedRecordsForWrite() {
      let records;
      try {
        records = COPDoc.repositories.bookin.readAll();
      } catch (error) {
        throw new Error("Saved packets could not be read. No Book-In changes were made.");
      }
      if (!Array.isArray(records) || records.some(record =>
        !isPlainRecordObject(record) ||
        typeof record.id !== "string" || !record.id.trim() ||
        !isPlainRecordObject(record.formState)
      )) {
        throw new Error("Saved packets need an integrity review. No Book-In changes were made.");
      }
      const ids = records.map(record => record.id.trim());
      if (new Set(ids).size !== ids.length) {
        throw new Error("Saved packets contain duplicate IDs. No Book-In changes were made.");
      }
      return records;
    }

    function writeSavedRecords(records) {
      try {
        const workflow = window.COPDoc && COPDoc.importWorkflow;
        const writable = workflow && workflow.assertWritable();
        if (writable && !writable.ok) throw new Error(writable.error);
        COPDoc.repositories.bookin.saveAll(records);
      } catch (error) {
        console.error("Could not save records.", error);
        throw new Error(
          "This browser could not save the record locally."
        );
      }
    }

    function isPlainRecordObject(value) {
      return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      );
    }

    function getKnownRecordFieldIds() {
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

    function normalizeImportedTimestamp(
      value,
      fallback,
      label
    ) {
      if (value === undefined || value === null || value === "") {
        return fallback;
      }

      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} is not a valid date.`);
      }

      return parsed.toISOString();
    }

    function normalizeImportedMetadataValue(value, label) {
      const normalized = String(value ?? "");

      if (normalized.length > MAX_IMPORTED_FIELD_VALUE_LENGTH) {
        throw new Error(`${label} is too long.`);
      }

      return normalized;
    }

    function normalizeImportedIdentifier(value, label) {
      const normalized = normalizeImportedMetadataValue(value, label).trim();
      if (normalized.length > 200) {
        throw new Error(`${label} is too long.`);
      }
      return normalized;
    }

    function importedArrestFieldPresence(record) {
      const formState = isPlainRecordObject(record?.formState)
        ? record.formState
        : {};
      const hasAny = (directKeys, formKeys) =>
        directKeys.some(key => Object.prototype.hasOwnProperty.call(record, key)) ||
        formKeys.some(key => Object.prototype.hasOwnProperty.call(formState, key));
      const hasDate = hasAny(
        ["arrestDate", "arrestDateTime", "bookInDateTime", "dateTime"],
        ["dateTime", "date_time"]
      );
      return {
        arrestDate: hasDate,
        arrestTime: hasAny(
          ["arrestTime"],
          ["arrestTime", "arrest_time", "arrestTimeManual", "arrest_time_manual"]
        ),
        arrestDateTime:
          hasDate || hasAny(["arrestTime"], ["arrestTime", "arrest_time"]),
        arrestingOfficer: hasAny(
          ["arrestingOfficer", "officersName"],
          ["arrestingOfficer", "officersName", "officers_name"]
        ),
        team: hasAny(["team"], ["team"]),
        iceEventNumber: hasAny(
          ["iceEventNumber", "iceEvent"],
          ["iceEventNumber", "iceEvent", "ice_event"]
        ),
        encounterNumber: hasAny(
          ["encounterNumber"],
          ["encounterNumber", "encounter_number"]
        ),
        encounterId: hasAny(["encounterId"], []),
        subjectRole: hasAny(
          ["subjectRole", "encounterRole"],
          [
            "subject_role_target",
            "subject_role_collateral",
            "encounterRoleTarget",
            "encounterRoleCollateral"
          ]
        ),
        vehiclePosition: hasAny(
          ["vehiclePosition"],
          ["vehiclePosition", "vehicle_position"]
        ),
        bookInDateTime: hasDate,
        booking: hasAny(
          ["booking", "cash", "travelDocs", "propertyTag", "cellNum", "children"],
          [
            "cash",
            "travelDocs",
            "travel_docs",
            "propertyTag",
            "property_tag",
            "cellNum",
            "cell_num",
            "children",
            "medicalIssues",
            "medical_issues",
            "medicine",
            "additionalObservations",
            "additional_observations"
          ]
        )
      };
    }

    function normalizeImportedFormState(
      formState,
      recordNumber,
      knownFieldIds
    ) {
      if (!isPlainRecordObject(formState)) {
        throw new Error(
          `Imported record ${recordNumber} is missing valid form data.`
        );
      }

      const sanitizedEntries = [];

      Object.entries(formState).forEach(
        ([elementId, savedValue]) => {
          if (!knownFieldIds.has(elementId)) {
            return;
          }

          if (!isPlainRecordObject(savedValue)) {
            throw new Error(
              `Imported record ${recordNumber} has invalid data for ${elementId}.`
            );
          }

          const value = String(savedValue.value ?? "");

          if (value.length > MAX_IMPORTED_FIELD_VALUE_LENGTH) {
            throw new Error(
              `Imported record ${recordNumber} contains an oversized field.`
            );
          }

          sanitizedEntries.push([
            elementId,
            {
              checked: Boolean(savedValue.checked),
              type: String(savedValue.type ?? "").slice(0, 40),
              value
            }
          ]);
        }
      );

      return Object.fromEntries(sanitizedEntries);
    }

    function getImportedStateValue(formState, id, fallback) {
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

    function normalizeImportedRecord(
      record,
      index,
      knownFieldIds
    ) {
      const recordNumber = index + 1;

      if (!isPlainRecordObject(record)) {
        throw new Error(
          `Imported record ${recordNumber} is not a valid record.`
        );
      }

      const id = String(record.id ?? "").trim();

      if (!id || id.length > 200) {
        throw new Error(
          `Imported record ${recordNumber} has an invalid record ID.`
        );
      }

      const bookingClaims = [
        id,
        normalizeImportedIdentifier(
          record.bookingId,
          `Imported record ${recordNumber} booking`
        ),
        normalizeImportedIdentifier(
          record.bookinRecordId,
          `Imported record ${recordNumber} Book-In reference`
        )
      ].filter((value, claimIndex, values) =>
        value && values.indexOf(value) === claimIndex
      );
      if (bookingClaims.length !== 1) {
        throw new Error(
          `Imported record ${recordNumber} has contradictory booking identifiers.`
        );
      }

      const arrestFieldPresence = importedArrestFieldPresence(record);

      const formState = normalizeImportedFormState(
        record.formState,
        recordNumber,
        knownFieldIds
      );

      if (record.voidedAt || record.voidReason || record.voidTransactionId) {
        if (!record.voidedAt || !String(record.voidReason || "").trim() ||
            !normalizeImportedIdentifier(record.voidTransactionId, `Imported record ${recordNumber} void command`)) {
          throw new Error(`Imported record ${recordNumber} has incomplete void history.`);
        }
        normalizeImportedTimestamp(record.voidedAt, "", `Imported record ${recordNumber} void date`);
        // Historical packets must retain their exact content. Normalizing them
        // into an active form-shaped record would drop the void lifecycle.
        return JSON.parse(JSON.stringify(record));
      }

      const iceState = formState.iceEvent || formState.ice_event;
      if (iceState) {
        iceState.value = normalizeIceEventValue(iceState.value);
      }
      const fbiState = formState.fbiNumber || formState.fbi_number;
      if (fbiState) {
        fbiState.value = normalizeFbiNumberValue(fbiState.value);
      }
      const arrestTimeState = formState.arrestTime || formState.arrest_time;
      if (arrestTimeState) {
        arrestTimeState.value = normalizeArrestTimeValue(arrestTimeState.value);
      }

      const now = new Date().toISOString();
      const createdAt = normalizeImportedTimestamp(
        record.createdAt,
        now,
        `Imported record ${recordNumber} creation date`
      );
      const updatedAt = normalizeImportedTimestamp(
        record.updatedAt,
        createdAt,
        `Imported record ${recordNumber} update date`
      );

      const encounterRole = String(record.encounterRole || "")
        .trim()
        .toUpperCase();
      const targetRole =
        formState.encounterRoleTarget?.checked ||
        formState.subject_role_target?.checked;
      const collateralRole =
        formState.encounterRoleCollateral?.checked ||
        formState.subject_role_collateral?.checked;
      const importedRole = targetRole
        ? "TARGET"
        : collateralRole
          ? "COLLATERAL"
          : String(record.subjectRole || encounterRole).trim().toUpperCase();

      return {
        id,
        revision: Number.isSafeInteger(Number(record.revision))
          ? Math.max(0, Number(record.revision))
          : 0,
        createdAt,
        updatedAt,
        createdWithVersion: normalizeImportedMetadataValue(
          record.createdWithVersion,
          `Imported record ${recordNumber} creation version`
        ),
        updatedWithVersion: normalizeImportedMetadataValue(
          record.updatedWithVersion,
          `Imported record ${recordNumber} update version`
        ),
        firstName: getImportedStateValue(
          formState,
          "first_name",
          record.firstName
        ),
        lastName: getImportedStateValue(
          formState,
          "last_name",
          record.lastName
        ),
        aNumber: getImportedStateValue(
          formState,
          "a_number",
          record.aNumber
        ),
        fbiNumber: normalizeFbiNumberValue(
          getImportedStateValue(
            formState,
            "fbi_number",
            record.fbiNumber
          )
        ),
        iceEvent: normalizeIceEventValue(
          getImportedStateValue(
            formState,
            "ice_event",
            record.iceEvent
          )
        ),
        encounterNumber: getImportedStateValue(
          formState,
          "encounter_number",
          record.encounterNumber
        ),
        subjectRole:
          importedRole === "TARGET" || importedRole === "COLLATERAL"
            ? importedRole
            : "",
        vehiclePosition: getImportedStateValue(
          formState,
          "vehicle_position",
          record.vehiclePosition
        ),
        dateTime: getImportedStateValue(
          formState,
          "date_time",
          record.dateTime
        ),
        arrestTime: normalizeArrestTimeValue(
          getImportedStateValue(
            formState,
            "arrest_time",
            record.arrestTime
          )
        ),
        foreignWarrants: getImportedStateValue(
          formState,
          "foreign_warrants",
          record.foreignWarrants || "no"
        ).toLowerCase() === "yes" ? "yes" : "no",
        foreignWarrantCountry: getImportedStateValue(
          formState,
          "foreign_warrant_country",
          record.foreignWarrantCountry
        ),
        dateOfBirth: getImportedStateValue(
          formState,
          "date_of_birth",
          record.dateOfBirth
        ),
        countryOfCitizenship: getImportedStateValue(
          formState,
          "country_of_citizenship",
          record.countryOfCitizenship
        ),
        caseType: getCaseTypeCode(
          getImportedStateValue(formState, "case_type", record.caseType)
        ),
        team: getImportedStateValue(formState, "team", record.team),
        encounterId: normalizeImportedIdentifier(
          record.encounterId,
          `Imported record ${recordNumber} encounter`
        ),
        subjectId: normalizeImportedIdentifier(
          record.subjectId,
          `Imported record ${recordNumber} encounter subject`
        ),
        encounterRole:
          importedRole === "TARGET" || importedRole === "COLLATERAL"
            ? importedRole
            : "",
        leadId: normalizeImportedIdentifier(
          record.leadId,
          `Imported record ${recordNumber} lead`
        ),
        personId: normalizeImportedIdentifier(
          record.personId,
          `Imported record ${recordNumber} person`
        ),
        arrestId: normalizeImportedIdentifier(
          record.arrestId,
          `Imported record ${recordNumber} arrest`
        ),
        encounterProjectionFiledAt: normalizeImportedTimestamp(
          record.encounterProjectionFiledAt,
          "",
          `Imported record ${recordNumber} Encounter projection date`
        ),
        encounterProjectionDraft: record.encounterProjectionDraft === true,
        __copdocImportArrestFieldPresence: arrestFieldPresence,
        formState
      };
    }

    function parseRecordsBackup(text) {
      const decoder = window.COPDoc && COPDoc.importSchema;
      if (!decoder) throw new Error("The shared Book-In import decoder is unavailable.");
      const decoded = decoder.decode(text);
      if (!decoded.ok) throw new Error(decoded.error);
      return JSON.parse(text);
    }

    function buildRecordsBackupFilename() {
      const date = new Date().toISOString().slice(0, 10);

      return `Alien_Book_In_Records_${date}_v${BOOKIN_FORMAT.backupVersion}.json`;
    }

    function downloadJson(payload, filename) {
      const blob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json;charset=utf-8" }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);
    }

    async function exportSavedRecords() {
      try {
        const writable = window.COPDoc && COPDoc.importWorkflow && COPDoc.importWorkflow.assertWritable();
        if (writable && !writable.ok) throw new Error(writable.error);
        const exportSources = COPDoc.repositories.bookin.captureExportSources();
        const records = JSON.parse(JSON.stringify(readSavedRecordsForWrite()));
        const root = window.COPDoc || {};
        const store = root.model && root.model.store;
        if (store && store.loadFromDisk) store.loadFromDisk();
        for (const packet of records) {
          const person = packet.personId && store && store.getPerson(packet.personId);
          const cards = person && person.immigration && person.immigration.baseballCards || [];
          const matches = cards.filter(card => card.bookinRecordId === packet.id && (!packet.baseballCardId || card.cardId === packet.baseballCardId));
          if (matches.length > 1) throw new Error("Multiple cards claim Book-In " + packet.id + ". Review its card identity before export.");
          if (matches.length && root.baseball) {
            const card = matches[0];
            packet.baseballCard = root.baseball.fromCanonical(card);
            packet.baseballCardId = card.cardId;
            if (card.finalizedSnapshot) packet.baseballCardFinalizedSnapshot = JSON.parse(JSON.stringify(card.finalizedSnapshot));
            if (card.arrestOfDay) packet.baseballCardArrestOfDay = JSON.parse(JSON.stringify(card.arrestOfDay));
            const mediaId = packet.baseballCard.photoMediaId || card.photoMediaId;
            if (mediaId) {
              if (!root.media) throw new Error("Photo storage is unavailable. Export cancelled.");
              const part = await root.media.blob(mediaId, "original");
              const value = part.blob;
              const bytes = value && typeof value.arrayBuffer === "function" ? new Uint8Array(await value.arrayBuffer()) : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
              let binary = "";
              for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
              packet.baseballCard.photoDataUrl = "data:" + part.mime + ";base64," + btoa(binary);
            }
          }
        }
        const payload = {
          format: BOOKIN_FORMAT.recordsBackupFormat,
          schemaVersion: BOOKIN_FORMAT.recordsSchemaVersion,
          appVersion: productVersion(),
          backupFormatVersion: BOOKIN_FORMAT.backupVersion,
          exportedAt: new Date().toISOString(),
          recordCount: records.length,
          records
        };
        if (root.transfer && root.transfer.collectBookInContext) payload.canonicalContext = root.transfer.collectBookInContext(records);
        const photoIds = new Set();
        function collectMediaReferences(value) {
          if (!value || typeof value !== "object") return;
          Object.keys(value).forEach(key => {
            if (["importSource", "importDataBaseline"].includes(key)) return;
            if (/(?:mediaId|photoId|sourceMediaId|derivedFromMediaId|originalMediaId)$/i.test(key) && typeof value[key] === "string" && value[key]) photoIds.add(value[key]);
            collectMediaReferences(value[key]);
          });
        }
        collectMediaReferences(payload);
        if (photoIds.size) {
          if (!root.media || !root.media.exportBundle) throw new Error("Required photo storage is unavailable. Export cancelled.");
          const media = await root.media.exportBundle();
          payload.media = media.filter(item => item && item.meta && photoIds.has(item.meta.mediaId));
          for (const id of photoIds) {
            const item = payload.media.find(entry => entry.meta.mediaId === id);
            if (!item || !(item.meta.roles || ["original"]).every(role => (item.blobs || []).some(part => part.role === role && typeof part.base64 === "string" && part.base64.length))) throw new Error("A required photo or file could not be exported: " + id);
          }
        }
        const filename = buildRecordsBackupFilename();
        if (!COPDoc.repositories.bookin.exportSourcesMatch(exportSources)) throw new Error("Saved data changed while preparing this export. Export again to capture one consistent revision.");
        downloadJson(payload, filename);
        setStatus(`Exported ${records.length} saved record${records.length === 1 ? "" : "s"}:\n${filename}`, "success");
      } catch (error) {
        console.error(error);
        setStatus(`Error: ${error.message}`, "error");
      }
    }

    function chooseRecordsBackupFile(mode = "merge") {
      if (mode !== "merge" && mode !== "replace") {
        setStatus("Error: Invalid records import mode.", "error");
        return;
      }

      const fileInput =
        document.getElementById("recordsImportFile");

      pendingRecordsImportMode = mode;
      fileInput.value = "";
      fileInput.click();
    }

    function recordsAreEquivalent(left, right) {
      if ((left && left.voidedAt) || (right && right.voidedAt)) {
        const stable = value => {
          if (Array.isArray(value)) return value.map(stable);
          if (!value || typeof value !== "object") return value;
          return Object.fromEntries(Object.keys(value).sort()
            .filter(key => key !== "__copdocImportArrestFieldPresence")
            .map(key => [key, stable(value[key])]));
        };
        return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
      }
      const comparable = record => {
        const copy = { ...(record || {}) };
        delete copy.leadId;
        delete copy.personId;
        delete copy.arrestId;
        delete copy.canonicalizedAt;
        delete copy.__copdocImportArrestFieldPresence;
        if (!String(copy.subjectId || "").trim()) {
          delete copy.subjectId;
        }
        if (!String(copy.encounterProjectionFiledAt || "").trim()) {
          delete copy.encounterProjectionFiledAt;
        }
        if (copy.encounterProjectionDraft !== true) {
          delete copy.encounterProjectionDraft;
        }
        return copy;
      };
      return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
    }

    function createUniqueImportedRecordId(usedIds) {
      let id = createRecordId();

      while (usedIds.has(id)) {
        id = createRecordId();
      }

      return id;
    }

    function detachImportedCanonicalLinks(record, replacementId) {
      const copy = { ...(record || {}) };
      delete copy.__copdocImportArrestFieldPresence;
      if (replacementId) {
        copy.id = replacementId;
      }
      delete copy.bookingId;
      delete copy.bookinRecordId;
      copy.encounterId = "";
      copy.encounterRole = "";
      copy.subjectRole = "";
      copy.vehiclePosition = "";
      copy.subjectId = "";
      copy.personId = "";
      copy.leadId = "";
      copy.arrestId = "";
      delete copy.encounterProjectionFiledAt;
      copy.encounterProjectionDraft = true;
      return copy;
    }

    function stripImportedControlFields(record) {
      const copy = { ...(record || {}) };
      delete copy.__copdocImportArrestFieldPresence;
      return copy;
    }

    function alignImportedPacketProjection(record) {
      if (!record || !isPlainRecordObject(record.formState)) {
        return record;
      }
      const role = String(record.encounterRole || record.subjectRole || "")
        .trim()
        .toUpperCase();
      if (role === "TARGET" || role === "COLLATERAL") {
        record.encounterRole = role;
        record.subjectRole = role;
        [
          ["encounterRoleTarget", "TARGET"],
          ["encounterRoleCollateral", "COLLATERAL"],
          ["subject_role_target", "TARGET"],
          ["subject_role_collateral", "COLLATERAL"]
        ].forEach(([id, value]) => {
          if (id.startsWith("encounterRole") || record.formState[id]) {
            record.formState[id] = {
              checked: role === value,
              type: "radio",
              value
            };
          }
        });
      }
      const occupant = String(record.vehiclePosition || "").trim();
      if (occupant) {
        setRecordFormStateValue(
          record,
          "vehiclePosition",
          "vehicle_position",
          occupant,
          "select-one"
        );
      }
      return record;
    }

    function mergeImportedRecords(existingRecords, importedRecords) {
      const merged = [...existingRecords];
      const existingById = new Map(
        existingRecords.map(record => [record.id, record])
      );
      const usedIds = new Set(existingById.keys());
      let importedCount = 0;
      let duplicateCount = 0;
      let conflictCount = 0;
      const promotionRecordIds = [];

      importedRecords.forEach(record => {
        const existing = existingById.get(record.id);

        if (!existing) {
          if (record.voidedAt) {
            throw new Error(`Import blocked: Book-In ${record.id} contains void history without an existing canonical booking. Review the complete recovery data before restoring this history.`);
          }
          merged.push(record);
          existingById.set(record.id, record);
          usedIds.add(record.id);
          importedCount += 1;
          promotionRecordIds.push(record.id);
          return;
        }

        if (recordsAreEquivalent(existing, record)) {
          duplicateCount += 1;
          return;
        }

        if (existing.voidedAt || record.voidedAt) {
          throw new Error(`Import blocked: Book-In ${record.id} has retained void history. A conflicting copy cannot replace or reactivate it.`);
        }

        const conflictCopy = detachImportedCanonicalLinks(
          record,
          createUniqueImportedRecordId(usedIds)
        );

        merged.push(conflictCopy);
        existingById.set(conflictCopy.id, conflictCopy);
        usedIds.add(conflictCopy.id);
        importedCount += 1;
        conflictCount += 1;
        promotionRecordIds.push(conflictCopy.id);
      });

      return {
        records: merged,
        importedCount,
        duplicateCount,
        conflictCount,
        promotionRecordIds
      };
    }

    function promoteRecordsToCases(records, options) {
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (!store || typeof store.promoteBookInRecords !== "function") {
        return {
          ok: false,
          rows: records,
          promoted: 0,
          created: 0,
          reused: 0,
          failed: records.length,
          errors: [{ error: "The canonical case store is not available." }]
        };
      }
      store.loadFromDisk();
      return store.promoteBookInRecords(records, options || {});
    }

    function promoteImportRecords(records, requestedRecordIds) {
      const source = Array.isArray(records) ? records : [];
      const requested = Array.isArray(requestedRecordIds)
        ? new Set(requestedRecordIds)
        : null;
      const eligible = source.filter(record => {
        const quietDraft = Boolean(
          record &&
          record.encounterProjectionDraft === true &&
          !String(record.encounterProjectionFiledAt || "").trim() &&
          !String(record.arrestId || "").trim()
        );
        return (
          record &&
          !record.voidedAt &&
          (!requested || requested.has(record.id)) &&
          !quietDraft
        );
      });
      if (!eligible.length) {
        return {
          ok: true,
          rows: source.map(stripImportedControlFields),
          promoted: 0,
          created: 0,
          reused: 0,
          failed: 0,
          errors: []
        };
      }
      const promoted = promoteRecordsToCases(eligible, {
        preserveMissingArrestFields: true
      });
      const promotedById = new Map(
        (promoted.rows || []).map(record => [record.id, record])
      );
      const failedIds = new Set(
        (promoted.errors || [])
          .map(error => String((error && error.recordId) || "").trim())
          .filter(Boolean)
      );
      const unidentifiedFailures = Boolean(
        promoted.failed && !failedIds.size
      );
      return {
        ...promoted,
        rows: source.map(record => {
          if (
            record &&
            !record.voidedAt &&
            (!requested || requested.has(record.id)) &&
            !(
              record.encounterProjectionDraft === true &&
              !String(record.encounterProjectionFiledAt || "").trim() &&
              !String(record.arrestId || "").trim()
            ) &&
            (failedIds.has(record.id) || unidentifiedFailures)
          ) {
            return detachImportedCanonicalLinks(record);
          }
          const promotedRecord = promotedById.get(record.id);
          return stripImportedControlFields(
            promotedRecord
              ? alignImportedPacketProjection(promotedRecord)
              : record
          );
        })
      };
    }

    function promotionStatusText(summary) {
      if (!summary) {
        return "";
      }
      const pieces = [];
      if (summary.created) {
        pieces.push(
          `${summary.created} case${summary.created === 1 ? "" : "s"} created`
        );
      }
      if (summary.reused) {
        pieces.push(
          `${summary.reused} existing case${summary.reused === 1 ? "" : "s"} updated`
        );
      }
      if (summary.failed) {
        pieces.push(
          `${summary.failed} record${summary.failed === 1 ? "" : "s"} need identity data before a case can be created`
        );
      }
      return pieces.length ? ` ${pieces.join("; ")}.` : "";
    }

    function omittedCanonicalRecordsForReplace(existingRecords, importedRecords) {
      const incomingIds = new Set(
        (Array.isArray(importedRecords) ? importedRecords : [])
          .map(record => String((record && record.id) || "").trim())
          .filter(Boolean)
      );
      const modelApi = window.COPDoc && COPDoc.model;
      const store = modelApi && modelApi.store;
      if (store && typeof store.loadFromDisk === "function") {
        store.loadFromDisk();
      }
      const workspace =
        store && typeof store.getState === "function" ? store.getState() : {};
      const activelyOwnedBookings = new Set();
      Object.values((workspace && workspace.encounters) || {}).forEach(encounter => {
        (Array.isArray(encounter && encounter.subjects)
          ? encounter.subjects
          : []
        ).forEach(subject => {
          const claims = [subject && subject.bookingId, subject && subject.bookinRecordId]
            .map(value => String(value || "").trim())
            .filter((value, index, values) =>
              value && values.indexOf(value) === index
            );
          if (claims.length === 1) {
            activelyOwnedBookings.add(claims[0]);
          }
        });
      });
      return (Array.isArray(existingRecords) ? existingRecords : []).filter(record => {
        const id = String((record && record.id) || "").trim();
        if (!id || incomingIds.has(id)) {
          return false;
        }
        return Boolean(
          record.voidedAt ||
          String(record.encounterProjectionFiledAt || "").trim() ||
          String(record.arrestId || "").trim() ||
          activelyOwnedBookings.has(id) ||
          (
            String(record.encounterId || "").trim() &&
            String(record.subjectId || "").trim()
          )
        );
      });
    }

    function prepareCanonicalReplaceRecords(existingRecords, importedRecords) {
      const existingById = new Map(
        (Array.isArray(existingRecords) ? existingRecords : []).map(record => [
          String((record && record.id) || "").trim(),
          record
        ])
      );
      const immutableFields = [
        "encounterId",
        "subjectId",
        "leadId",
        "personId",
        "arrestId"
      ];
      return (Array.isArray(importedRecords) ? importedRecords : []).map(record => {
        const next = { ...(record || {}) };
        const id = String(next.id || "").trim();
        const current = existingById.get(id);
        if (!current) {
          if (next.voidedAt) {
            throw new Error(`Restore blocked: Book-In ${id} contains void history without an existing canonical booking. Review the complete recovery data before restoring this history.`);
          }
          return next;
        }
        if (current.voidedAt) {
          if (!recordsAreEquivalent(current, next)) {
            throw new Error(`Restore blocked: Book-In ${id} is voided and its historical packet must remain unchanged.`);
          }
          return { ...current };
        }
        if (next.voidedAt) {
          throw new Error(`Restore blocked: Book-In ${id} must be voided through the booking workflow so its linked records are reconciled.`);
        }
        immutableFields.forEach(field => {
          const currentValue = String(current[field] || "").trim();
          const incomingValue = String(next[field] || "").trim();
          if (currentValue && incomingValue && currentValue !== incomingValue) {
            throw new Error(
              `Restore blocked: Book-In ${id} conflicts with its existing ${field}.`
            );
          }
          if (currentValue && !incomingValue) {
            next[field] = currentValue;
          }
        });
        const currentRole = String(
          current.encounterRole || current.subjectRole || ""
        ).trim().toUpperCase();
        if (currentRole === "TARGET" || currentRole === "COLLATERAL") {
          next.encounterRole = currentRole;
          next.subjectRole = currentRole;
        }
        if (String(current.vehiclePosition || "").trim()) {
          next.vehiclePosition = String(current.vehiclePosition).trim();
        }
        if (String(current.encounterProjectionFiledAt || "").trim()) {
          next.encounterProjectionFiledAt = current.encounterProjectionFiledAt;
          delete next.encounterProjectionDraft;
        }
        return next;
      });
    }

    function reconcileUnlinkedBookInRecords() {
      const records = readSavedRecords();
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (!store || typeof store.bookInPromotionInput !== "function") {
        return null;
      }
      const recoveryApi = window.COPDoc && COPDoc.booking;
      const recovery = recoveryApi && typeof recoveryApi.listTransactions === "function"
        ? recoveryApi.listTransactions() : { ok: true, transactions: [] };
      if (!recovery || !recovery.ok) return null;
      const reserved = new Set((recovery.transactions || [])
        .filter(transaction => transaction && transaction.status !== "COMPLETED")
        .map(transaction => transaction.bookingId));
      const pending = records.filter(record => {
        if (record.voidedAt || reserved.has(record.id) || record.encounterProjectionDraft === true) {
          return false;
        }
        if (record.leadId && record.personId && record.arrestId) {
          return false;
        }
        const input = store.bookInPromotionInput(record);
        return Boolean(
          input.lastName || input.firstName || input.alienNumber || input.fbiNumber
        );
      });
      if (!pending.length) {
        return null;
      }
      const promoted = promoteRecordsToCases(pending);
      const promotedById = new Map(
        (promoted.rows || []).map(record => [record.id, record])
      );
      const next = records.map(record => promotedById.get(record.id) || record);
      writeSavedRecords(next);
      return promoted;
    }

    async function importRecordsBackupFile(event) {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save before importing packets.", "warning");
        return;
      }
      const fileInput = event.currentTarget;
      const file = fileInput.files?.[0];
      if (!file) return;
      const previousSuppression = suppressAutoSave;
      suppressAutoSave = true;
      try {
        if (file.size > MAX_RECORDS_BACKUP_BYTES) throw new Error("The selected backup exceeds the 32 MiB import limit.");
        const api = window.COPDoc && COPDoc.transfer;
        const workflow = window.COPDoc && COPDoc.importWorkflow;
        if (!api || !api.buildImportPlan || !workflow) throw new Error("The shared import workflow is unavailable.");
        const backup = parseRecordsBackup(await file.text());
        const parsed = api.parseTransfer(backup);
        const options = { mode: pendingRecordsImportMode };
        let plan = api.buildImportPlan(parsed, ["bookin"], options);
        if (!plan.ok && (plan.findings || []).some(finding => finding.code === "CUSTODY_REVIEW")) {
          options.recordDecisions = await workflow.reviewCustody(plan.findings);
          if (!options.recordDecisions) { setStatus("Import cancelled.", "warning"); return; }
          plan = api.buildImportPlan(parsed, ["bookin"], options);
        }
        if (!plan.ok) throw new Error(plan.error);
        if (!await workflow.preview(plan)) { setStatus("Import cancelled.", "warning"); return; }
        const result = await workflow.apply(plan);
        if (!result.ok) throw new Error(result.error);
        renderSavedRecords();
        const stats = result.stats || plan.stats || {};
        setStatus(`Import complete: ${stats.added || 0} added; ${stats.updated || 0} updated; ${stats.skipped || 0} skipped. Recovery checkpoint ${result.transactionId}.${activeRecordId ? " Your open form was kept. Reopen its saved row to load imported changes." : ""}`, "success");
      } catch (error) {
        console.error(error);
        setStatus(`Error: ${error.message}`, "error");
      } finally { suppressAutoSave = previousSuppression; fileInput.value = ""; }
    }

    function getRecordSubjectLabel(record) {
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      const input =
        store && typeof store.bookInPromotionInput === "function"
          ? store.bookInPromotionInput(record)
          : {};
      return (
        formatAlienName(
          record.firstName || input.firstName,
          record.lastName || input.lastName
        ) ||
        "Unnamed subject"
      );
    }

    function savedRecordView(record) {
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      const input =
        store && typeof store.bookInPromotionInput === "function"
          ? store.bookInPromotionInput(record)
          : {};
      const country =
        record.countryOfCitizenship ||
        input.citizenship ||
        "";
      const disposition = record.caseType || input.disposition || "";
      return {
        record,
        id: record.id,
        subject: getRecordSubjectLabel(record),
        age: record.age || input.age || "",
        country: citizenshipLabel(country),
        aNumber: record.aNumber || input.alienNumber || "",
        fbiNumber: record.fbiNumber || input.fbiNumber || "",
        iceEvent: record.iceEvent || input.iceEventNumber || "",
        encounterNumber:
          record.encounterNumber || input.encounterNumber || record.encounterId || "",
        caseType: disposition,
        arrestDateTime:
          input.arrestDateTime || record.dateTime || input.bookInDateTime || "",
        arrestDateKey: String(
          input.arrestDate || input.arrestDateTime || record.dateTime || ""
        ).slice(0, 10),
        updatedAt: record.updatedAt || ""
      };
    }

    function loadSavedRecordColumnPreferences() {
      try {
        const saved = COPDoc.repositories.bookin.readColumns();
        if (!Array.isArray(saved) || !saved.length) {
          return;
        }
        visibleSavedRecordColumnKeys.clear();
        saved.forEach(key => {
          if (SAVED_RECORD_COLUMN_KEYS.includes(key)) {
            visibleSavedRecordColumnKeys.add(key);
          }
        });
        if (!visibleSavedRecordColumnKeys.size) {
          SAVED_RECORD_COLUMN_KEYS.forEach(key =>
            visibleSavedRecordColumnKeys.add(key)
          );
        }
      } catch (error) {
        console.warn("Saved-record column preferences could not be loaded.", error);
      }
    }

    function saveSavedRecordColumnPreferences() {
      try {
        COPDoc.repositories.bookin.saveColumns([...visibleSavedRecordColumnKeys]);
      } catch (error) {
        console.warn("Saved-record column preferences could not be stored.", error);
      }
    }

    function syncSavedRecordColumns() {
      document.querySelectorAll("[data-record-column]").forEach(element => {
        element.hidden = !visibleSavedRecordColumnKeys.has(
          element.dataset.recordColumn
        );
      });
      document
        .querySelectorAll("input[data-record-column-toggle]")
        .forEach(input => {
          input.checked = visibleSavedRecordColumnKeys.has(
            input.dataset.recordColumnToggle
          );
        });
      const summary = document.getElementById("recordsColumnsSummary");
      if (summary) {
        summary.textContent = `Columns: ${visibleSavedRecordColumnKeys.size} shown`;
      }
    }

    function showAllSavedRecordColumns() {
      SAVED_RECORD_COLUMN_KEYS.forEach(key => visibleSavedRecordColumnKeys.add(key));
      saveSavedRecordColumnPreferences();
      renderSavedRecords();
    }

    function closeSavedRecordColumnsMenu() {
      const menu = document.getElementById("recordsColumnsMenu");
      if (menu) {
        menu.open = false;
      }
      document.getElementById("recordsColumnsSummary")?.focus();
    }

    function toggleSavedRecordColumn(columnKey, visible) {
      if (!SAVED_RECORD_COLUMN_KEYS.includes(columnKey)) {
        return;
      }
      if (visible) {
        visibleSavedRecordColumnKeys.add(columnKey);
      } else if (visibleSavedRecordColumnKeys.size > 1) {
        visibleSavedRecordColumnKeys.delete(columnKey);
      } else {
        const input = document.querySelector(
          `input[data-record-column-toggle="${columnKey}"]`
        );
        if (input) {
          input.checked = true;
        }
        setStatus("At least one Saved Records column must remain visible.", "warning");
        return;
      }
      saveSavedRecordColumnPreferences();
      renderSavedRecords();
    }

    function compareSavedRecordViews(left, right) {
      const key = savedRecordsSortKey;
      let leftValue = left[key] ?? "";
      let rightValue = right[key] ?? "";
      let compared;
      if (key === "age") {
        compared = Number(leftValue || 0) - Number(rightValue || 0);
      } else {
        compared = String(leftValue).localeCompare(String(rightValue), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      }
      if (compared) {
        return savedRecordsSortDirection === "asc" ? compared : -compared;
      }
      return String(right.updatedAt || "").localeCompare(
        String(left.updatedAt || "")
      );
    }

    function syncSavedRecordsSortHeaders() {
      document
        .querySelectorAll("th[data-record-sort-key]")
        .forEach(header => {
          const active = header.dataset.recordSortKey === savedRecordsSortKey;
          header.setAttribute(
            "aria-sort",
            active
              ? savedRecordsSortDirection === "asc"
                ? "ascending"
                : "descending"
              : "none"
          );
          const indicator = header.querySelector(".records-sort-indicator");
          if (indicator) {
            indicator.textContent = active
              ? savedRecordsSortDirection === "asc"
                ? "▲"
                : "▼"
              : "";
          }
        });
    }

    function setSavedRecordsSort(sortKey) {
      if (!SAVED_RECORD_COLUMN_KEYS.includes(sortKey)) {
        return;
      }
      if (savedRecordsSortKey === sortKey) {
        savedRecordsSortDirection =
          savedRecordsSortDirection === "asc" ? "desc" : "asc";
      } else {
        savedRecordsSortKey = sortKey;
        savedRecordsSortDirection =
          sortKey === "updatedAt" || sortKey === "arrestDateTime"
            ? "desc"
            : "asc";
      }
      renderSavedRecords();
    }

    function savedRecordFiltersActive() {
      return Boolean(
        getValue("recordsSearch") ||
        getValue("recordsDateFrom") ||
        getValue("recordsDateTo")
      );
    }

    function filteredSavedRecordViews(records = listedSavedRecords()) {
      const search = getValue("recordsSearch").toLowerCase();
      const from = getValue("recordsDateFrom");
      const to = getValue("recordsDateTo");
      return records
        .map(savedRecordView)
        .filter(view => {
          if (from && view.arrestDateKey && view.arrestDateKey < from) {
            return false;
          }
          if (to && view.arrestDateKey && view.arrestDateKey > to) {
            return false;
          }
          if (!search) {
            return true;
          }
          return [
            view.subject,
            view.age,
            view.country,
            view.aNumber,
            view.fbiNumber,
            view.iceEvent,
            view.encounterNumber,
            view.caseType,
            view.arrestDateTime
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);
        })
        .sort(compareSavedRecordViews);
    }

    function clearSavedRecordFilters() {
      ["recordsSearch", "recordsDateFrom", "recordsDateTo"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.value = "";
        }
      });
      renderSavedRecords();
    }

    function formatSavedTimestamp(value) {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "Unknown";
      }

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }

    function appendRecordCell(row, text, className = "", columnKey = "") {
      const cell = document.createElement("td");
      cell.textContent = text;

      if (className) {
        cell.className = className;
      }
      if (columnKey) {
        cell.dataset.recordColumn = columnKey;
        cell.hidden = !visibleSavedRecordColumnKeys.has(columnKey);
      }

      row.appendChild(cell);
      return cell;
    }

    function updateActiveRecordUi() {
      const label = document.getElementById("activeRecordLabel");
      const saveButton =
        document.getElementById("saveRecordButton") ||
        document.querySelector('#appBarPrimaryAction[data-chrome-action="save"]');

      if (!label || !saveButton) {
        return;
      }

      const onEncounter = Boolean(currentEncounterId());
      if (!activeRecordId) {
        label.textContent = onEncounter
          ? "New subject for this encounter"
          : "No saved record loaded";
        saveButton.textContent = onEncounter ? "Save to encounter" : "Save Current Record";
        return;
      }

      const record = readSavedRecords().find(
        item => item.id === activeRecordId
      );

      label.textContent = record
        ? `Editing: ${getRecordSubjectLabel(record)}`
        : "No saved record loaded";

      saveButton.textContent = onEncounter
        ? "Save to encounter"
        : record
          ? "Update Saved Record"
          : "Save Current Record";
    }

    function currentEncounterId() {
      try {
        return new URLSearchParams(window.location.search).get("encounterId") || "";
      } catch (error) {
        return "";
      }
    }

    function currentEncounterSubjectId() {
      try {
        return new URLSearchParams(window.location.search).get("subjectId") || "";
      } catch (error) {
        return "";
      }
    }

    function encounterSubjectForLink(encounterId, subjectId) {
      const modelApi = window.COPDoc && COPDoc.model;
      const store = modelApi && modelApi.store;
      if (!encounterId || !subjectId || !store || typeof store.getEncounter !== "function") {
        return null;
      }
      store.loadFromDisk();
      const encounter = store.getEncounter(encounterId);
      if (!encounter) {
        return null;
      }
      const subjects = encounter && Array.isArray(encounter.subjects)
        ? encounter.subjects
        : [];
      const matches = subjects.filter(subject => {
        const id = modelApi && typeof modelApi.encounterSubjectId === "function"
          ? modelApi.encounterSubjectId(subject)
          : String((subject && subject.subjectId) || "").trim();
        return id === subjectId;
      });
      return matches.length === 1 ? matches[0] : null;
    }

    function validateEncounterSubjectLink(encounterId, subjectId, packet) {
      if (!encounterId) {
        if (String(subjectId || "").trim()) {
          return {
            ok: false,
            subject: null,
            error: "A Book-In subject requires a linked Encounter. No changes were saved."
          };
        }
        return { ok: true, subject: null, error: "" };
      }
      const modelApi = window.COPDoc && COPDoc.model;
      const store = modelApi && modelApi.store;
      if (!store || typeof store.getEncounter !== "function") {
        return {
          ok: false,
          subject: null,
          error: "The linked Encounter subject is missing or ambiguous. Reload the Encounter and try again."
        };
      }
      store.loadFromDisk();
      const encounter = store.getEncounter(encounterId);
      if (!encounter) {
        return {
          ok: false,
          subject: null,
          error: "The linked Encounter no longer exists. Reload the Encounter and try again."
        };
      }
      const subjects = encounter && Array.isArray(encounter.subjects)
        ? encounter.subjects
        : [];
      const subjectIdOf = row =>
        modelApi && typeof modelApi.encounterSubjectId === "function"
          ? modelApi.encounterSubjectId(row)
          : String((row && row.subjectId) || "").trim();
      const bookingIdOf = row =>
        modelApi && typeof modelApi.encounterSubjectBookingId === "function"
          ? modelApi.encounterSubjectBookingId(row)
          : String((row && (row.bookingId || row.bookinRecordId)) || "").trim();
      const packetId = String((packet && packet.id) || "").trim();
      const packetPersonId = String((packet && packet.personId) || "").trim();
      const packetLeadId = String((packet && packet.leadId) || "").trim();
      const requestedSubjectId = String(subjectId || "").trim();
      const indexesMatching = predicate => {
        const matches = [];
        subjects.forEach((row, index) => {
          if (predicate(row)) {
            matches.push(index);
          }
        });
        return matches;
      };
      const conflict = subject => ({
        ok: false,
        subject: subject || null,
        error: "This Book-In record conflicts with another Encounter subject. No changes were saved."
      });
      let subjectIndex = -1;
      if (requestedSubjectId) {
        const exactMatches = indexesMatching(row => subjectIdOf(row) === requestedSubjectId);
        if (exactMatches.length !== 1) {
          return {
            ok: false,
            subject: null,
            error: "The linked Encounter subject is missing or ambiguous. Reload the Encounter and try again."
          };
        }
        subjectIndex = exactMatches[0];
      } else {
        let exactClaimExists = false;
        const compatible = indexesMatching((candidate, index) => {
          const candidateBookingId = bookingIdOf(candidate);
          const candidatePersonId = String((candidate && candidate.personId) || "").trim();
          const candidateLeadId = String((candidate && candidate.leadId) || "").trim();
          const exactClaim = !!(
            (packetId && candidateBookingId === packetId) ||
            (packetPersonId && candidatePersonId === packetPersonId) ||
            (packetLeadId && candidateLeadId === packetLeadId)
          );
          exactClaimExists = exactClaimExists || exactClaim;
          if (!exactClaim) {
            return false;
          }
          if (
            (packetId && candidateBookingId && candidateBookingId !== packetId) ||
            (packetPersonId && candidatePersonId && candidatePersonId !== packetPersonId) ||
            (packetLeadId && candidateLeadId && candidateLeadId !== packetLeadId)
          ) {
            return false;
          }
          return !subjects.some((other, otherIndex) => {
            if (!other || otherIndex === index) {
              return false;
            }
            return (
              (packetId &&
                !candidateBookingId &&
                bookingIdOf(other) === packetId) ||
              (packetPersonId &&
                !candidatePersonId &&
                String(other.personId || "").trim() === packetPersonId) ||
              (packetLeadId &&
                !candidateLeadId &&
                String(other.leadId || "").trim() === packetLeadId)
            );
          });
        });
        if (compatible.length > 1 || (compatible.length === 0 && exactClaimExists)) {
          return conflict(null);
        }
        if (compatible.length === 1) {
          subjectIndex = compatible[0];
        } else {
          return { ok: true, subject: null, error: "" };
        }
      }
      const subject = subjects[subjectIndex];
      const subjectBookingId = bookingIdOf(subject);
      const anotherSubjectOwnsPacket = packetId && subjects.some((row, index) => {
        return index !== subjectIndex && bookingIdOf(row) === packetId;
      });
      const anotherSubjectOwnsPerson =
        !subject.personId &&
        packetPersonId &&
        subjects.some((row, index) => {
          return index !== subjectIndex && row.personId === packetPersonId;
        });
      const anotherSubjectOwnsLead =
        !subject.leadId &&
        packetLeadId &&
        subjects.some((row, index) => {
          return index !== subjectIndex && row.leadId === packetLeadId;
        });
      if (
        anotherSubjectOwnsPacket ||
        anotherSubjectOwnsPerson ||
        anotherSubjectOwnsLead ||
        (packetId && subjectBookingId && packetId !== subjectBookingId) ||
        (packetPersonId && subject.personId && packetPersonId !== subject.personId) ||
        (packetLeadId && subject.leadId && packetLeadId !== subject.leadId)
      ) {
        return conflict(subject);
      }
      return { ok: true, subject, error: "" };
    }

    function currentEncounterRole() {
      const target = document.getElementById("encounterRoleTarget");
      const collateral = document.getElementById("encounterRoleCollateral");
      if (target && target.checked) {
        return "TARGET";
      }
      if (collateral && collateral.checked) {
        return "COLLATERAL";
      }
      return "";
    }

    function setEncounterRole(role) {
      const target = document.getElementById("encounterRoleTarget");
      const collateral = document.getElementById("encounterRoleCollateral");
      const value = String(role || "").toUpperCase();
      if (target) {
        target.checked = value === "TARGET";
      }
      if (collateral) {
        collateral.checked = value === "COLLATERAL";
      }
    }

    function recordsForEncounter(encounterId) {
      const all = readSavedRecords();
      if (
        window.COPDoc &&
        COPDoc.model &&
        typeof COPDoc.model.recordsForEncounter === "function"
      ) {
        return COPDoc.model.recordsForEncounter(all, encounterId);
      }
      if (!encounterId) {
        return [];
      }
      return all.filter(record => record && record.encounterId === encounterId);
    }

    function listedSavedRecords() {
      const encounterId = currentEncounterId();
      if (!encounterId) {
        return readSavedRecords();
      }
      return recordsForEncounter(encounterId);
    }

    function syncEncounterSubjects(record) {
      const encounterId = currentEncounterId() || (record && record.encounterId) || "";
      const modelApi = window.COPDoc && COPDoc.model;
      const store = modelApi && modelApi.store;
      if (!encounterId || !store || typeof store.getEncounter !== "function") {
        return;
      }
      store.loadFromDisk();
      const encounter = store.getEncounter(encounterId);
      if (!encounter) {
        return;
      }
      const allPackets = readSavedRecords();
      const linkedPackets =
        modelApi && typeof modelApi.recordsForEncounter === "function"
          ? modelApi.recordsForEncounter(allPackets, encounterId)
          : allPackets.filter(row => row && row.encounterId === encounterId);
      const recordId = String((record && record.id) || "").trim();
      // A save projects only that packet. Encounter-wide reconciliation remains
      // available to explicit callers that do not supply a Book-In record ID.
      const packets = recordId
        ? linkedPackets.filter(row => {
            return (
              String((row && row.id) || "").trim() === recordId &&
              Boolean(String((row && row.encounterProjectionFiledAt) || "").trim())
            );
          })
        : linkedPackets;
      let existing = Array.isArray(encounter.subjects)
        ? encounter.subjects.slice()
        : [];
      if (modelApi && typeof modelApi.normalizeEncounterSubjects === "function") {
        existing = modelApi.normalizeEncounterSubjects(existing, { encounterId });
      } else if (modelApi && typeof modelApi.createEncounterSubject === "function") {
        existing = existing.map(row => modelApi.createEncounterSubject(row));
      }
      let packetsChanged = false;
      const subjectMatches = (subject, refs) => {
        if (modelApi && typeof modelApi.encounterSubjectMatches === "function") {
          return modelApi.encounterSubjectMatches(subject, refs);
        }
        if (refs.subjectId) {
          return Boolean(subject && subject.subjectId === refs.subjectId);
        }
        if (refs.bookingId) {
          return Boolean(
            subject &&
              (subject.bookingId === refs.bookingId ||
                subject.bookinRecordId === refs.bookingId)
          );
        }
        if (refs.personId) {
          return Boolean(subject && subject.personId === refs.personId);
        }
        return Boolean(refs.leadId && subject && subject.leadId === refs.leadId);
      };
      const subjectIdOf = subject =>
        modelApi && typeof modelApi.encounterSubjectId === "function"
          ? modelApi.encounterSubjectId(subject)
          : String((subject && subject.subjectId) || "");
      const subjectBookingIdOf = subject =>
        modelApi && typeof modelApi.encounterSubjectBookingId === "function"
          ? modelApi.encounterSubjectBookingId(subject)
          : String((subject && (subject.bookingId || subject.bookinRecordId)) || "");
      const subjectRoleOf = subject =>
        modelApi && typeof modelApi.encounterSubjectRole === "function"
          ? modelApi.encounterSubjectRole(subject)
          : String((subject && (subject.role || subject.encounterRole)) || "")
              .trim()
              .toUpperCase();
      const subjectOccupantRoleOf = subject =>
        modelApi && typeof modelApi.encounterSubjectOccupantRole === "function"
          ? modelApi.encounterSubjectOccupantRole(subject)
          : String((subject && (subject.occupantRole || subject.vehicleRole)) || "")
              .trim()
              .toUpperCase();
      const matchingSubjectIndexes = refs => {
        const matches = [];
        existing.forEach((item, index) => {
          if (subjectMatches(item, refs)) {
            matches.push(index);
          }
        });
        return matches;
      };
      const occupantRoleFromPacket = value => {
        const normalized = String(value || "").trim().toUpperCase();
        return normalized === "DRIVER" ||
          normalized === "PASSENGER" ||
          normalized === "OTHER"
          ? normalized
          : "";
      };
      const subjectConflicts = [];
      packets.forEach((row, packetIndex) => {
        if (!row) {
          return;
        }
        const packetSubjectId = String(row.subjectId || "").trim();
        const role = String(row.encounterRole || row.subjectRole || "").toUpperCase();
        if (role !== "TARGET" && role !== "COLLATERAL") {
          return;
        }
        let idx = -1;
        if (packetSubjectId) {
          const idMatches = matchingSubjectIndexes({ subjectId: packetSubjectId });
          if (idMatches.length === 1) {
            idx = idMatches[0];
          } else {
            subjectConflicts.push({
              bookinRecordId: row.id || "",
              subjectId: packetSubjectId,
              reason: idMatches.length > 1 ? "duplicate-subject-id" : "missing-subject-id"
            });
            return;
          }
        } else {
          let exactClaimExists = false;
          const compatibleMatches = [];
          existing.forEach((candidate, candidateIndex) => {
            const candidateBookingId = subjectBookingIdOf(candidate);
            const candidatePersonId = String((candidate && candidate.personId) || "").trim();
            const candidateLeadId = String((candidate && candidate.leadId) || "").trim();
            const packetPersonId = String(row.personId || "").trim();
            const packetLeadId = String(row.leadId || "").trim();
            const exactClaim = !!(
              (row.id && candidateBookingId === row.id) ||
              (packetPersonId && candidatePersonId === packetPersonId) ||
              (packetLeadId && candidateLeadId === packetLeadId)
            );
            exactClaimExists = exactClaimExists || exactClaim;
            if (
              !exactClaim ||
              (row.id && candidateBookingId && candidateBookingId !== row.id) ||
              (packetPersonId && candidatePersonId && candidatePersonId !== packetPersonId) ||
              (packetLeadId && candidateLeadId && candidateLeadId !== packetLeadId)
            ) {
              return;
            }
            const blankClaimOwnedElsewhere = existing.some((other, otherIndex) => {
              if (!other || otherIndex === candidateIndex) {
                return false;
              }
              return (
                (row.id &&
                  !candidateBookingId &&
                  subjectBookingIdOf(other) === row.id) ||
                (packetPersonId &&
                  !candidatePersonId &&
                  String(other.personId || "").trim() === packetPersonId) ||
                (packetLeadId &&
                  !candidateLeadId &&
                  String(other.leadId || "").trim() === packetLeadId)
              );
            });
            if (!blankClaimOwnedElsewhere) {
              compatibleMatches.push(candidateIndex);
            }
          });
          if (compatibleMatches.length > 1 || (compatibleMatches.length === 0 && exactClaimExists)) {
            subjectConflicts.push({
              bookinRecordId: row.id || "",
              subjectId: "",
              reason: "ambiguous-or-conflicting-legacy-identity"
            });
            return;
          }
          idx = compatibleMatches.length === 1 ? compatibleMatches[0] : -1;
        }
        const prior = idx >= 0 ? existing[idx] : null;
        const priorBookingId = subjectBookingIdOf(prior);
        const anotherSubjectOwnsBooking = row.id && existing.some((subject, index) => {
          return index !== idx && subjectBookingIdOf(subject) === row.id;
        });
        const anotherSubjectOwnsPerson =
          prior &&
          !prior.personId &&
          row.personId &&
          existing.some((subject, index) => {
            return index !== idx && subject && subject.personId === row.personId;
          });
        const anotherSubjectOwnsLead =
          prior &&
          !prior.leadId &&
          row.leadId &&
          existing.some((subject, index) => {
            return index !== idx && subject && subject.leadId === row.leadId;
          });
        let conflictReason = "";
        if (anotherSubjectOwnsBooking) {
          conflictReason = "booking-id-owned-by-another-subject";
        } else if (anotherSubjectOwnsPerson) {
          conflictReason = "person-id-owned-by-another-subject";
        } else if (anotherSubjectOwnsLead) {
          conflictReason = "lead-id-owned-by-another-subject";
        } else if (priorBookingId && row.id && priorBookingId !== row.id) {
          conflictReason = "booking-id-mismatch";
        } else if (prior && prior.personId && row.personId && prior.personId !== row.personId) {
          conflictReason = "person-id-mismatch";
        } else if (prior && prior.leadId && row.leadId && prior.leadId !== row.leadId) {
          conflictReason = "lead-id-mismatch";
        }
        if (
          prior &&
          conflictReason
        ) {
          subjectConflicts.push({
            bookinRecordId: row.id || "",
            subjectId: row.subjectId || subjectIdOf(prior),
            reason: conflictReason
          });
          return;
        }
        const canonicalRole = subjectRoleOf(prior) || role;
        const packetOccupantRole = occupantRoleFromPacket(row.vehiclePosition);
        const canonicalOccupantRole = subjectOccupantRoleOf(prior) || packetOccupantRole;
        const patch = {
          subjectId: packetSubjectId,
          encounterId,
          bookingId: row.id,
          bookinRecordId: row.id,
          role: canonicalRole,
          encounterRole: canonicalRole,
          outcome: "ARRESTED",
          custody: "IN_CUSTODY"
        };
        [
          ["personId", row.personId],
          ["leadId", row.leadId],
          ["lastName", row.lastName],
          ["firstName", row.firstName],
          ["alienNumber", row.aNumber],
          ["packetFiledAt", row.updatedAt || row.createdAt]
        ].forEach(([key, value]) => {
          if (
            String(value || "").trim() &&
            (!prior || !String(prior[key] || "").trim() || key === "packetFiledAt")
          ) {
            patch[key] = value;
          }
        });
        if (canonicalOccupantRole) {
          patch.occupantRole = canonicalOccupantRole;
          patch.vehicleRole = canonicalOccupantRole;
        }
        if (idx >= 0) {
          patch.subjectId = subjectIdOf(existing[idx]) || patch.subjectId;
          existing[idx] = Object.assign({}, existing[idx], patch);
          if (modelApi && typeof modelApi.normalizeEncounterSubject === "function") {
            existing[idx] = modelApi.normalizeEncounterSubject(existing[idx], {
              encounterId,
              index: idx
            });
          }
        } else if (modelApi && typeof modelApi.normalizeEncounterSubject === "function") {
          existing.push(
            modelApi.normalizeEncounterSubject(patch, {
              encounterId,
              index: existing.length + packetIndex
            })
          );
        } else if (modelApi && typeof modelApi.createEncounterSubject === "function") {
          existing.push(modelApi.createEncounterSubject(patch));
        } else {
          existing.push(patch);
        }
        const canonicalSubjectId = subjectIdOf(existing[idx >= 0 ? idx : existing.length - 1]);
        if (canonicalSubjectId && row.subjectId !== canonicalSubjectId) {
          row.subjectId = canonicalSubjectId;
          packetsChanged = true;
        }
        if (record && record.id === row.id && canonicalSubjectId) {
          record.subjectId = canonicalSubjectId;
        }
      });
      encounter.subjects = existing;
      const committed =
        modelApi.isCommitted && modelApi.isCommitted(encounter);
      const saved = store.saveEncounter(encounter, {
        mode: committed ? "commit" : "draft"
      });
      if (saved && !saved.ok) {
        setStatus(saved.error || "Could not update the encounter.", "error");
        return saved;
      }
      if (packetsChanged) {
        writeSavedRecords(allPackets);
      }
      if (subjectConflicts.length) {
        const warning =
          "Skipped " +
          subjectConflicts.length +
          " Book-In packet" +
          (subjectConflicts.length === 1 ? "" : "s") +
          " because the subject identity conflicts with this Encounter.";
        setStatus(warning, "warning");
        return {
          ok: true,
          warning,
          conflicts: subjectConflicts
        };
      }
      return { ok: true, warning: "", conflicts: [] };
    }

    function inlineAge(dateOfBirth) {
      const match = String(dateOfBirth || "").match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );
      if (!match) {
        return "";
      }
      const today = new Date();
      let age = today.getFullYear() - Number(match[1]);
      const month = today.getMonth() + 1;
      const day = today.getDate();
      if (month < Number(match[2]) || (month === Number(match[2]) && day < Number(match[3]))) {
        age -= 1;
      }
      return age >= 0 && age < 130 ? String(age) : "";
    }

    function localDateKey(date = new Date()) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function setRecordFormStateValue(record, currentId, legacyId, value, type = "text") {
      record.formState = isPlainRecordObject(record.formState)
        ? record.formState
        : {};
      const next = {
        checked: false,
        type,
        value: String(value ?? "")
      };
      record.formState[currentId] = { ...next };
      if (record.formState[legacyId]) {
        record.formState[legacyId] = { ...next };
      }
    }

    function beginInlineRecordEdit(recordId) {
      if (inlineRecordEditState) {
        setStatus("Save or cancel the current table edit first.", "warning");
        return;
      }
      const record = readSavedRecords().find(row => row.id === recordId);
      if (!record) {
        setStatus("The selected saved record was not found.", "error");
        renderSavedRecords();
        return;
      }
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      const input =
        store && typeof store.bookInPromotionInput === "function"
          ? store.bookInPromotionInput(record)
          : {};
      inlineRecordEditState = {
        recordId,
        baseUpdatedAt: record.updatedAt || "",
        draft: {
          firstName: record.firstName || input.firstName || "",
          lastName: record.lastName || input.lastName || "",
          dateOfBirth: record.dateOfBirth || input.dateOfBirth || "",
          countryOfCitizenship: resolveCitizenshipCode(
            record.countryOfCitizenship || input.citizenship || ""
          ),
          aNumber: record.aNumber || input.alienNumber || "",
          fbiNumber: record.fbiNumber || input.fbiNumber || "",
          iceEvent: record.iceEvent || input.iceEventNumber || "",
          encounterNumber:
            record.encounterNumber || input.encounterNumber || "",
          caseType: getCaseTypeCode(
            record.caseType || input.disposition || ""
          ),
          dateTime: record.dateTime || input.bookInDateTime || "",
          arrestTime: record.arrestTime || input.arrestTime || ""
        }
      };
      renderSavedRecords();
      const editRow = Array.from(
        document.querySelectorAll("tr[data-record-id]")
      ).find(row => row.dataset.recordId === recordId);
      editRow?.querySelector("input, select")?.focus();
    }

    function cancelInlineRecordEdit() {
      if (bookingSaveInProgress) return;
      if (!inlineRecordEditState) {
        return;
      }
      inlineRecordEditState = null;
      renderSavedRecords();
      setStatus("Table edit cancelled.");
    }

    async function saveInlineRecordEdit() {
      if (bookingSaveInProgress) {
        setStatus("A Book-In save is already in progress.", "warning");
        return false;
      }
      if (!inlineRecordEditState) {
        return;
      }
      const state = inlineRecordEditState;
      let records;
      try { records = readSavedRecordsForWrite(); }
      catch (error) { setStatus(error.message, "error"); return false; }
      const index = records.findIndex(row => row.id === state.recordId);
      if (index < 0) {
        inlineRecordEditState = null;
        renderSavedRecords();
        setStatus("That record was deleted in another window.", "error");
        return;
      }
      if ((records[index].updatedAt || "") !== state.baseUpdatedAt) {
        setStatus(
          "That record changed in another window. Cancel and reopen the row before saving.",
          "warning"
        );
        return;
      }
      const draft = state.draft;
      if (!String(draft.firstName || "").trim() && !String(draft.lastName || "").trim() && !String(draft.aNumber || "").trim()) {
        setStatus("Enter a name or A-Number before saving the row.", "error");
        return;
      }
      const record = { ...records[index] };
      record.firstName = String(draft.firstName || "").trim();
      record.lastName = String(draft.lastName || "").trim();
      record.dateOfBirth = String(draft.dateOfBirth || "").trim();
      record.age = inlineAge(record.dateOfBirth);
      record.countryOfCitizenship = resolveCitizenshipCode(
        draft.countryOfCitizenship
      );
      record.aNumber = String(draft.aNumber || "").trim();
      record.fbiNumber = normalizeFbiNumberValue(draft.fbiNumber);
      record.iceEvent = normalizeIceEventValue(draft.iceEvent);
      record.encounterNumber = String(draft.encounterNumber || "").trim();
      record.caseType = getCaseTypeCode(draft.caseType);
      record.dateTime = String(draft.dateTime || "").trim();
      record.arrestTime = normalizeArrestTimeValue(draft.arrestTime);
      record.updatedAt = new Date().toISOString();
      record.updatedWithVersion = productVersion();
      record.revision = Number(record.revision || 0) + 1;

      setRecordFormStateValue(record, "firstName", "first_name", record.firstName);
      setRecordFormStateValue(record, "lastName", "last_name", record.lastName);
      setRecordFormStateValue(record, "dateOfBirth", "date_of_birth", record.dateOfBirth, "date");
      setRecordFormStateValue(record, "age", "age", record.age, "number");
      setRecordFormStateValue(record, "citizenship", "country_of_citizenship", record.countryOfCitizenship, "select-one");
      setRecordFormStateValue(record, "alienNumber", "a_number", record.aNumber);
      setRecordFormStateValue(record, "fbiNumber", "fbi_number", record.fbiNumber);
      setRecordFormStateValue(record, "iceEvent", "ice_event", record.iceEvent);
      setRecordFormStateValue(record, "encounterNumber", "encounter_number", record.encounterNumber);
      setRecordFormStateValue(record, "immigrationDisposition", "case_type", record.caseType, "select-one");
      setRecordFormStateValue(record, "dateTime", "date_time", record.dateTime, "datetime-local");
      setRecordFormStateValue(record, "arrestTime", "arrest_time", record.arrestTime, "time");
      setRecordFormStateValue(record, "arrestTimeManual", "arrest_time_manual", record.arrestTime ? "true" : "", "hidden");

      const bookingApi = window.COPDoc && COPDoc.booking;
      if (!bookingApi || typeof bookingApi.bookSubject !== "function") {
        setStatus("The booking workflow is unavailable. No table edits were filed.", "error");
        return false;
      }
      bookingSaveInProgress = true;
      const submittedDraft = JSON.stringify(state.draft);
      try {
        const result = await bookingApi.bookSubject(record, {
          expectedUpdatedAt: String(records[index].updatedAt || "")
        });
        if (!result || !result.ok) {
          setStatus((result && result.error) ||
            "Table edits did not finish. Use Resume booking below.", "error");
          renderBookingRecovery();
          return false;
        }
        const linked = result.record || record;
        if (activeRecordId === linked.id) {
          activeRecordBaseUpdatedAt = String(linked.updatedAt || "");
          pendingLeadId = linked.leadId || pendingLeadId;
          // A form being edited alongside the table must retain its new input.
          if (currentFormSignature() === lastSavedSignature) {
            suppressAutoSave = true;
            restoreFormState(linked.formState);
            rememberFormSignature();
            suppressAutoSave = false;
          }
        }
        const newerEdits = JSON.stringify(state.draft) !== submittedDraft;
        if (newerEdits) state.baseUpdatedAt = String(linked.updatedAt || "");
        else inlineRecordEditState = null;
        renderSavedRecords();
        renderBookingRecovery();
        setStatus(newerEdits
          ? "Saved table edits. Newer edits are still waiting to save."
          : "Saved table edits and verified the booking links.", newerEdits ? "warning" : "success");
        return true;
      } catch (error) {
        setStatus(error.message || "Table edits did not finish.", "error");
        renderBookingRecovery();
        return false;
      } finally {
        bookingSaveInProgress = false;
      }
    }

    function appendInlineField(container, labelText, field, type = "text", sourceSelectId = "") {
      const label = document.createElement("label");
      label.appendChild(document.createTextNode(labelText));
      let input;
      if (sourceSelectId) {
        const source = document.getElementById(sourceSelectId);
        input = document.createElement("select");
        if (source) {
          Array.from(source.options).forEach(sourceOption => {
            const option = document.createElement("option");
            option.value = sourceOption.value;
            option.textContent = sourceOption.textContent;
            input.appendChild(option);
          });
        }
      } else {
        input = document.createElement("input");
        input.type = type;
      }
      input.value = inlineRecordEditState.draft[field] || "";
      input.addEventListener("input", () => {
        inlineRecordEditState.draft[field] = input.value;
      });
      input.addEventListener("change", () => {
        inlineRecordEditState.draft[field] = input.value;
      });
      label.appendChild(input);
      container.appendChild(label);
      return input;
    }

    function renderInlineRecordCell(cell, columnKey) {
      const editor = document.createElement("div");
      editor.className = "record-inline-editor";
      if (columnKey === "subject") {
        appendInlineField(editor, "First", "firstName");
        appendInlineField(editor, "Last", "lastName");
      } else if (columnKey === "age") {
        appendInlineField(editor, "Date of birth", "dateOfBirth", "date");
      } else if (columnKey === "country") {
        appendInlineField(editor, "Country", "countryOfCitizenship", "text", "citizenship");
      } else if (columnKey === "aNumber") {
        appendInlineField(editor, "A-Number", "aNumber");
      } else if (columnKey === "fbiNumber") {
        appendInlineField(editor, "FBI Number", "fbiNumber");
      } else if (columnKey === "iceEvent") {
        appendInlineField(editor, "ICE Event", "iceEvent");
      } else if (columnKey === "encounterNumber") {
        appendInlineField(editor, "Encounter", "encounterNumber");
      } else if (columnKey === "caseType") {
        appendInlineField(editor, "Disposition", "caseType", "text", "immigrationDisposition");
      } else if (columnKey === "arrestDateTime") {
        appendInlineField(editor, "Book-In", "dateTime", "datetime-local");
        appendInlineField(editor, "Arrest time", "arrestTime", "time");
      } else if (columnKey === "updatedAt") {
        editor.textContent = formatSavedTimestamp(
          inlineRecordEditState.baseUpdatedAt
        );
      }
      cell.replaceChildren(editor);
    }

    function renderBookingRecovery() {
      const host = document.querySelector(".records-panel");
      const api = window.COPDoc && COPDoc.booking;
      if (!host || !api || typeof api.listTransactions !== "function") return;
      let panel = document.getElementById("bookingRecoveryPanel");
      if (!panel) {
        panel = document.createElement("section");
        panel.id = "bookingRecoveryPanel";
        panel.className = "records-empty";
        panel.setAttribute("aria-live", "polite");
        host.appendChild(panel);
      }
      panel.replaceChildren();
      let result;
      try { result = api.listTransactions(); }
      catch (error) { result = { ok: false }; }
      if (!result || !result.ok) {
        panel.hidden = false;
        panel.textContent = "Booking recovery records could not be read. Run Integrity before filing another booking.";
        return;
      }
      const rows = Array.isArray(result.transactions) ? result.transactions : [];
      const pending = rows.filter(row => row && String(row.status || "").toUpperCase() !== "COMPLETED");
      const completed = rows.length - pending.length;
      panel.hidden = rows.length === 0;
      if (!rows.length) return;
      const title = document.createElement("strong");
      title.textContent = pending.length ? "Bookings needing attention" : "Booking recovery";
      panel.appendChild(title);
      if (completed) {
        const summary = document.createElement("p");
        summary.textContent = completed + " completed booking receipt" + (completed === 1 ? "" : "s") + ".";
        panel.appendChild(summary);
      }
      pending.forEach(transaction => {
        const row = document.createElement("div");
        row.className = "records-toolbar";
        const label = document.createElement("span");
        label.textContent = (transaction.kind === "VOID" ? "Void booking " : "Booking ") + String(transaction.bookingId || transaction.transactionId || "") +
          " · " + String(transaction.status || "PENDING");
        const resumeButton = document.createElement("button");
        resumeButton.type = "button";
        resumeButton.className = "action-button-secondary compact";
        resumeButton.dataset.recordIgnore = "true";
        resumeButton.textContent = transaction.kind === "VOID" ? "Resume void" : "Resume booking";
        resumeButton.addEventListener("click", async function () {
          if (bookingSaveInProgress) {
            setStatus("A Book-In save is already in progress.", "warning");
            return;
          }
          bookingSaveInProgress = true;
          resumeButton.disabled = true;
          try {
            const resumed = await api.resume(transaction.transactionId);
            if (!resumed || !resumed.ok) {
              setStatus((resumed && resumed.error) || "Booking still needs attention. Your saved recovery record is retained.", "error");
            } else {
              const packet = resumed.record;
              if (packet && activeRecordId === packet.id) {
                activeRecordBaseUpdatedAt = String(packet.updatedAt || "");
                pendingLeadId = packet.leadId || pendingLeadId;
              }
              setStatus(transaction.kind === "VOID" ? "Booking void completed; history was retained." : "Booking completed and its links were verified. Form edits have been preserved.", "success");
            }
            renderSavedRecords();
          } catch (error) {
            setStatus(error.message || "Booking could not resume.", "error");
          } finally {
            bookingSaveInProgress = false;
            renderBookingRecovery();
          }
        });
        row.append(label, resumeButton);
        panel.appendChild(row);
      });
    }

    function renderSavedRecords() {
      renderBookingRecovery();
      const records = listedSavedRecords()
        .slice()
        .sort(function (left, right) {
          return String(right.updatedAt || "").localeCompare(
            String(left.updatedAt || "")
          );
        });

      const body = document.getElementById("savedRecordsBody");
      const empty = document.getElementById("recordsEmpty");
      const tableWrap = document.getElementById("recordsTableWrap");

      if (!body || !empty || !tableWrap) {
        return;
      }

      body.replaceChildren();
      empty.hidden = records.length > 0;
      tableWrap.hidden = records.length === 0;
      if (!records.length) {
        empty.textContent = currentEncounterId()
          ? "No packets on this encounter yet."
          : "No saved packets yet.";
      }

      records.forEach(function (record) {
        const row = document.createElement("tr");
        row.dataset.recordId = record.id;
        const subjectCell = appendRecordCell(
          row,
          getRecordSubjectLabel(record),
          "record-subject"
        );
        if (record.id === activeRecordId) {
          const editing = document.createElement("div");
          editing.className = "record-secondary";
          editing.textContent = "Currently loaded";
          subjectCell.appendChild(editing);
        }
        appendRecordCell(row, formatSavedTimestamp(record.updatedAt));
        const actionsCell = appendRecordCell(row, "");
        const actions = document.createElement("div");
        actions.className = "record-actions";
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "action-button-secondary compact";
        openButton.textContent = "Open form";
        openButton.addEventListener("click", function () {
          loadSavedRecord(record.id);
        });
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "action-button-danger compact";
        deleteButton.textContent = record.voidedAt ? "Voided" : (record.arrestId || record.encounterProjectionFiledAt ? "Void booking" : (record.encounterProjectionDraft === true ? "Delete draft" : "Review removal"));
        deleteButton.disabled = Boolean(record.voidedAt);
        deleteButton.addEventListener("click", function () {
          deleteSavedRecord(record.id);
        });
        actions.append(openButton, deleteButton);
        actionsCell.appendChild(actions);
        body.appendChild(row);
      });

      updateActiveRecordUi();
    }

    function currentFormSignature() {
      try {
        return JSON.stringify(captureFormState());
      } catch (error) {
        return "";
      }
    }

    function rememberFormSignature() {
      lastSavedSignature = currentFormSignature();
    }

    function bookInPromotionFormData(record, data) {
      return {
        ...data,
        sex: getRadioValue("sex") || data.gender || "",
        citizenship: resolveCitizenshipCode(
          getValue("citizenship") || data.countryOfCitizenship
        ),
        disposition: data.caseType || "",
        status: getValue("immigrationStatus"),
        iceEventNumber: data.iceEvent || "",
        encounterId: record.encounterId || "",
        subjectId: record.subjectId || currentEncounterSubjectId(),
        encounterNumber: data.encounterNumber || record.encounterId || "",
        subjectRole: record.encounterRole || data.subjectRole || "",
        bookInDateTime: data.dateTime || "",
        arrestTime: data.arrestTime || "",
        arrestingOfficer: data.officersName || "",
        foreignWarrantsKnown: true,
        hasForeignWarrants: data.foreignWarrants === "yes",
        foreignWarrantCountry: data.foreignWarrantCountry || ""
      };
    }

    async function saveCurrentRecord(options) {
      const quiet = Boolean(options && options.quiet);
      if (bookingSaveInProgress) {
        if (!quiet) setStatus("A Book-In save is already in progress.", "warning");
        return false;
      }
      bookingSaveInProgress = true;
      let savedWithNewerEdits = false;
      try {
        let shouldPromote = !quiet || Boolean(options && options.promote);
        const data = collectFormData();
        if (
          shouldPromote &&
          data.foreignWarrants === "yes" &&
          !data.foreignWarrantCountry
        ) {
          setStatus("Enter the country for the foreign warrant.", "error");
          document.getElementById("foreignWarrantCountry")?.focus();
          return false;
        }
        const records = readSavedRecordsForWrite();
        const now = new Date().toISOString();
        const existingIndex = records.findIndex(
          record => record.id === activeRecordId
        );

        const existing = existingIndex >= 0
          ? records[existingIndex]
          : null;
        if (existing && existing.voidedAt) {
          if (!quiet) setStatus("This booking is voided. Its historical packet cannot be edited; start a new booking.", "warning");
          return false;
        }
        if (activeRecordBaseUpdatedAt !== null &&
            (!existing || String(existing.updatedAt || "") !== activeRecordBaseUpdatedAt)) {
          setStatus("That packet changed in another window. Reopen it before saving.", "warning");
          return false;
        }
        shouldPromote = shouldPromote || Boolean(existing &&
          (existing.encounterProjectionFiledAt || existing.arrestId));

        const encounterId =
          currentEncounterId() || (existing && existing.encounterId) || "";
        const urlSubjectId = currentEncounterSubjectId();
        const existingSubjectId = String(
          (existing && existing.subjectId) || ""
        ).trim();
        if (
          urlSubjectId &&
          existingSubjectId &&
          urlSubjectId !== existingSubjectId
        ) {
          setStatus(
            "That Book-In record is linked to a different Encounter subject. No changes were saved.",
            "error"
          );
          return false;
        }
        const requestedSubjectId =
          urlSubjectId || existingSubjectId;
        const linkedSubject = encounterSubjectForLink(encounterId, requestedSubjectId);
        const linkedRole = linkedSubject
          ? String(linkedSubject.role || linkedSubject.encounterRole || "")
              .trim()
              .toUpperCase()
          : "";
        const encounterRole = linkedRole || currentEncounterRole();
        if (encounterId && !encounterRole && !quiet) {
          setStatus("Select Target or Collateral for this encounter.", "error");
          return false;
        }

        const bookingApi = window.COPDoc && COPDoc.booking;
        const pendingPacketId = encounterId && requestedSubjectId && bookingApi &&
          typeof bookingApi.pendingBookingId === "function"
          ? bookingApi.pendingBookingId(encounterId, requestedSubjectId)
          : "";
        let record = {
          ...(existing || {}),
          id: existing ? existing.id : activeRecordId || pendingPacketId || createRecordId(),
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
          createdWithVersion: existing
            ? existing.createdWithVersion || productVersion()
            : productVersion(),
          updatedWithVersion: productVersion(),
          firstName: data.firstName,
          lastName: data.lastName,
          aNumber: data.aNumber,
          fbiNumber: data.fbiNumber,
          iceEvent: data.iceEvent,
          encounterNumber: data.encounterNumber,
          subjectRole: data.subjectRole,
          vehiclePosition: data.vehiclePosition,
          dateTime: data.dateTime,
          arrestTime: data.arrestTime,
          foreignWarrants: data.foreignWarrants,
          foreignWarrantCountry: data.foreignWarrantCountry,
          dateOfBirth: data.dateOfBirth,
          countryOfCitizenship: data.countryOfCitizenship,
          caseType: data.caseType,
          team: data.team,
          encounterId: encounterId,
          subjectId: requestedSubjectId,
          encounterRole: encounterRole || (existing && existing.encounterRole) || "",
          leadId:
            (linkedSubject && linkedSubject.leadId) ||
            pendingLeadId ||
            (existing && existing.leadId) ||
            "",
          personId:
            (linkedSubject && linkedSubject.personId) ||
            (existing && existing.personId) ||
            "",
          formState: { ...((existing && existing.formState) || {}), ...captureFormState() }
        };

        const subjectLink = validateEncounterSubjectLink(
          encounterId,
          requestedSubjectId,
          existing || record
        );
        if (!subjectLink.ok) {
          setStatus(subjectLink.error, "error");
          return false;
        }
        let subjectAlreadyOwnsBooking = false;
        if (subjectLink.subject) {
          const canonicalSubject = subjectLink.subject;
          const canonicalSubjectId =
            window.COPDoc &&
            COPDoc.model &&
            typeof COPDoc.model.encounterSubjectId === "function"
              ? COPDoc.model.encounterSubjectId(canonicalSubject)
              : String(canonicalSubject.subjectId || "").trim();
          const canonicalRole = String(
            canonicalSubject.role || canonicalSubject.encounterRole || ""
          )
            .trim()
            .toUpperCase();
          const canonicalBookingId =
            window.COPDoc &&
            COPDoc.model &&
            typeof COPDoc.model.encounterSubjectBookingId === "function"
              ? COPDoc.model.encounterSubjectBookingId(canonicalSubject)
              : String(
                  canonicalSubject.bookingId ||
                    canonicalSubject.bookinRecordId ||
                    ""
                ).trim();
          subjectAlreadyOwnsBooking =
            Boolean(canonicalBookingId) && canonicalBookingId === record.id;
          record.subjectId = canonicalSubjectId || record.subjectId;
          record.personId = canonicalSubject.personId || record.personId;
          record.leadId = canonicalSubject.leadId || record.leadId;
          record.encounterRole = canonicalRole || record.encounterRole;
        }
        if (
          quiet &&
          !record.encounterProjectionFiledAt &&
          !record.arrestId &&
          !subjectAlreadyOwnsBooking
        ) {
          record.encounterProjectionDraft = true;
        }

        if (bookingApi && typeof bookingApi.listTransactions === "function") {
          const recovery = bookingApi.listTransactions();
          if (!recovery || !recovery.ok) {
            setStatus("Booking recovery records could not be read. No changes were saved.", "error");
            renderBookingRecovery();
            return false;
          }
          const unfinished = (recovery.transactions || []).some(transaction =>
            transaction && transaction.bookingId === record.id && transaction.status !== "COMPLETED");
          if (unfinished && quiet) {
            setStatus("Resume the pending booking below before saving newer form edits.", "warning");
            renderBookingRecovery();
            return false;
          }
          shouldPromote = shouldPromote || unfinished;
        }
        // A linked filed subject also makes a legacy packet a filed save.
        shouldPromote = shouldPromote || Boolean(subjectAlreadyOwnsBooking &&
          subjectLink.subject && String(subjectLink.subject.outcome || "").toUpperCase() === "ARRESTED");
        const submittedSignature = currentFormSignature();
        activeRecordId = record.id;
        if (shouldPromote) {
          if (!bookingApi || typeof bookingApi.bookSubject !== "function") {
            setStatus("The booking workflow is unavailable. No booking was filed.", "error");
            return false;
          }
          setStatus(quiet ? "Saving Book-In changes…" : "Filing Book-In…");
          const result = await bookingApi.bookSubject(record, {
            formData: bookInPromotionFormData(record, data),
            expectedUpdatedAt: existing ? String(existing.updatedAt || "") : null
          });
          if (!result || !result.ok) {
            activeRecordId = (result && result.bookingId) || record.id;
            renderBookingRecovery();
            setStatus((result && result.error) ||
              "Booking did not finish. Your form is still here; use Resume booking below.", "error");
            return false;
          }
          record = result.record || record;
          pendingLeadId = record.leadId || pendingLeadId;
        } else {
          // Unfiled drafts remain local packets, without canonical side effects.
          if (existingIndex >= 0) records[existingIndex] = record;
          else records.push(record);
          writeSavedRecords(records);
        }
        activeRecordId = record.id;
        activeRecordBaseUpdatedAt = String(record.updatedAt || "");
        lastSavedSignature = submittedSignature;
        savedWithNewerEdits = currentFormSignature() !== submittedSignature;
        renderSavedRecords();
        renderBookingRecovery();
        if (shouldPromote && record.leadId) rememberLeadInUrl(record.leadId);
        if (savedWithNewerEdits) {
          setStatus("Saved. Newer form edits are waiting to save.", "warning");
        } else if (quiet) {
          setStatus("Auto-saved.", "success");
        } else if (record.leadId && record.encounterId) {
          setStatus(`Saved ${getRecordSubjectLabel(record)} to this encounter.`, "success");
        } else if (record.leadId) {
          setStatus(`Filed as detainee: ${getRecordSubjectLabel(record)}`, "success");
        } else {
          setStatus(`Record saved: ${getRecordSubjectLabel(record)}`, "success");
        }
        if (!quiet && !savedWithNewerEdits && currentEncounterId() &&
            !(options && options.stay)) {
          window.location.href = "encounter-form.html?id=" +
            encodeURIComponent(currentEncounterId());
        }
        return true;
      } catch (error) {
        console.error(error);
        setStatus(`Error: ${error.message}`, "error");
        renderBookingRecovery();
        return false;
      } finally {
        bookingSaveInProgress = false;
        if (savedWithNewerEdits) requestAutoSave();
      }
    }

    function loadSavedRecord(recordId) {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      const record = readSavedRecords().find(
        item => item.id === recordId
      );

      if (!record) {
        setStatus("The selected saved record was not found.", "error");
        renderSavedRecords();
        return;
      }

      suppressAutoSave = true;
      restoreFormState(record.formState);
      if (!currentEncounterRole() && record.encounterRole) {
        setEncounterRole(record.encounterRole);
      }
      activeRecordId = record.id;
      activeRecordBaseUpdatedAt = String(record.updatedAt || "");
      pendingLeadId = record.leadId || "";
      renderSavedRecords();
      rememberFormSignature();
      suppressAutoSave = false;
      setStatus(
        record.voidedAt
          ? `Voided booking loaded for historical review: ${getRecordSubjectLabel(record)}. Saving and new document generation are disabled.`
          : `Record loaded for editing: ${getRecordSubjectLabel(record)}`,
        record.voidedAt ? "warning" : "success"
      );

      document.querySelector("main header")?.scrollIntoView?.({
        behavior: "smooth",
        block: "start"
      });
    }

    function unlinkDeletedBookInFromEncounter(record, options) {
      options = options || {};
      let encounterId = String((record && record.encounterId) || "").trim();
      const packetId = String((record && record.id) || "").trim();
      if (!packetId) {
        return { ok: true, changed: false, previous: null, error: "" };
      }
      const packetBookingClaims = [
        packetId,
        String((record && record.bookingId) || "").trim(),
        String((record && record.bookinRecordId) || "").trim()
      ].filter((value, index, values) => value && values.indexOf(value) === index);
      if (packetBookingClaims.length > 1) {
        return {
          ok: false,
          changed: false,
          previous: null,
          error: "This Book-In record has contradictory booking identifiers. Run Integrity before deleting it."
        };
      }
      const modelApi = window.COPDoc && COPDoc.model;
      const store = modelApi && modelApi.store;
      if (!store || typeof store.getEncounter !== "function") {
        return {
          ok: false,
          changed: false,
          previous: null,
          error: "The Encounter store is not available. No record was deleted."
        };
      }
      if (typeof store.loadFromDisk === "function") {
        store.loadFromDisk();
      }
      if (typeof store.diskError === "function" && store.diskError()) {
        return {
          ok: false,
          changed: false,
          previous: null,
          error: store.diskError() || "Could not reload the Encounter store."
        };
      }
      const workspace =
        typeof store.getState === "function" ? store.getState() : {};
      const subjectId = String((record && record.subjectId) || "").trim();
      const bookingClaimsOf = subject =>
        [subject && subject.bookingId, subject && subject.bookinRecordId]
          .map(value => String(value || "").trim())
          .filter((value, index, values) =>
            value && values.indexOf(value) === index
          );
      const subjectIdOf = subject =>
        modelApi && typeof modelApi.encounterSubjectId === "function"
          ? String(modelApi.encounterSubjectId(subject) || "").trim()
          : String((subject && subject.subjectId) || "").trim();
      const globalBookingOwners = [];
      const globalSubjectOwners = [];
      let contradictoryOwner = false;
      Object.entries((workspace && workspace.encounters) || {}).forEach(
        ([ownerEncounterId, ownerEncounter]) => {
          (Array.isArray(ownerEncounter && ownerEncounter.subjects)
            ? ownerEncounter.subjects
            : []
          ).forEach(subject => {
            const claims = bookingClaimsOf(subject);
            if (claims.length > 1 && claims.includes(packetId)) {
              contradictoryOwner = true;
            }
            if (claims.length === 1 && claims[0] === packetId) {
              globalBookingOwners.push({
                encounterId: ownerEncounterId,
                subject
              });
            }
            if (subjectId && subjectIdOf(subject) === subjectId) {
              globalSubjectOwners.push({
                encounterId: ownerEncounterId,
                subject
              });
            }
          });
        }
      );
      if (
        contradictoryOwner ||
        globalBookingOwners.length > 1 ||
        globalSubjectOwners.length > 1
      ) {
        return {
          ok: false,
          changed: false,
          previous: null,
          error: "The Book-In identity has ambiguous Encounter ownership. Run Integrity before deleting it."
        };
      }
      if (globalBookingOwners.length === 1) {
        const ownerEncounterId = globalBookingOwners[0].encounterId;
        if (encounterId && encounterId !== ownerEncounterId) {
          return {
            ok: false,
            changed: false,
            previous: null,
            error: "The Book-In record points to a different Encounter than its booking owner. Run Integrity before deleting it."
          };
        }
        encounterId = ownerEncounterId;
      } else if (!encounterId) {
        if (globalSubjectOwners.length === 1) {
          const claims = bookingClaimsOf(globalSubjectOwners[0].subject);
          if (claims.length) {
            return {
              ok: false,
              changed: false,
              previous: null,
              error: "The Book-In subject belongs to a different booking. Run Integrity before deleting it."
            };
          }
        }
        return { ok: true, changed: false, previous: null, error: "" };
      }
      const encounter = store.getEncounter(encounterId);
      if (!encounter) {
        return { ok: true, changed: false, previous: null, error: "" };
      }
      const previous = JSON.parse(JSON.stringify(encounter));
      let subjects = Array.isArray(encounter.subjects)
        ? encounter.subjects.slice()
        : [];
      if (modelApi && typeof modelApi.normalizeEncounterSubjects === "function") {
        subjects = modelApi.normalizeEncounterSubjects(subjects, { encounterId });
      }
      const bookingIdOf = subject =>
        bookingClaimsOf(subject).length === 1
          ? bookingClaimsOf(subject)[0]
          : "";
      const matches = subjects
        .map((subject, index) => ({ subject, index }))
        .filter(entry =>
          subjectId
            ? subjectIdOf(entry.subject) === subjectId
            : bookingIdOf(entry.subject) === packetId
        );
      const bookingOwners = subjects.filter(subject => bookingIdOf(subject) === packetId);
      if (!matches.length && !bookingOwners.length) {
        return { ok: true, changed: false, previous, error: "" };
      }
      if (matches.length === 1 && !bookingOwners.length) {
        return { ok: true, changed: false, previous, error: "" };
      }
      if (
        matches.length !== 1 ||
        bookingOwners.length !== 1 ||
        matches[0].subject !== bookingOwners[0]
      ) {
        return {
          ok: false,
          changed: false,
          previous,
          error: "The Book-In record does not have one exact Encounter subject and booking owner. Run Integrity before deleting it."
        };
      }
      if (options.validateOnly) {
        return {
          ok: true,
          changed: true,
          previous,
          subjectId: subjectIdOf(matches[0].subject),
          bookingId: packetId,
          error: ""
        };
      }
      if (typeof store.unlinkEncounterSubjectBooking !== "function") {
        return {
          ok: false,
          changed: false,
          previous,
          error: "The Encounter booking unlink service is not available."
        };
      }
      const saved = store.unlinkEncounterSubjectBooking(
        encounterId,
        subjectIdOf(matches[0].subject),
        packetId
      );
      if (!saved || !saved.ok) {
        return {
          ok: false,
          changed: false,
          previous,
          error: (saved && saved.error) || "Could not clear the Encounter booking link."
        };
      }
      return {
        ok: true,
        changed: true,
        previous,
        error: ""
      };
    }

    async function deleteSavedRecord(recordId) {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      const api = window.COPDoc && COPDoc.booking;
      if (!api || typeof api.planRemoval !== "function") { setStatus("Booking lifecycle controls are unavailable.", "error"); return false; }
      const plan = api.planRemoval(recordId);
      if (!plan.ok || plan.action === "RETAIN") {
        const dependencies = (plan.dependencies || []).map(d => `${d.recordType || d.store} ${d.recordId || ""}`).join(", ");
        setStatus((plan.error || "The booking cannot be removed.") + (dependencies ? " References: " + dependencies : ""), "warning");
        return false;
      }
      const record = plan.record;
      let reason = "";
      if (plan.action === "VOID") {
        const entered = window.prompt(`Void the booking for ${getRecordSubjectLabel(record)}? Its history and previously generated documents will be retained. Enter the reason:`);
        if (entered === null) return false;
        reason = String(entered || "").trim();
        if (!reason) { setStatus("A void reason is required.", "error"); return false; }
      } else if (!window.confirm(`Delete the unused draft for ${getRecordSubjectLabel(record)}?`)) return false;
      bookingSaveInProgress = true;
      try {
        const result = plan.action === "VOID"
          ? await api.voidBooking(recordId, { reason, expectedUpdatedAt: record.updatedAt || "" })
          : await api.deleteDraftBooking(recordId, { expectedUpdatedAt: record.updatedAt || "" });
        if (!result || !result.ok) {
          setStatus((result && result.error) || "The booking lifecycle action did not finish.", "error");
          renderSavedRecords();
          return false;
        }
        if (activeRecordId === recordId && plan.action === "DELETE") {
          activeRecordId = null; activeRecordBaseUpdatedAt = null;
        } else if (activeRecordId === recordId && result.record) {
          activeRecordBaseUpdatedAt = result.record.updatedAt || "";
        }
        renderSavedRecords();
        setStatus(plan.action === "VOID" ? "Booking voided. History retained and active booking statistics reconciled." : "Unused draft deleted.", "success");
        return true;
      } catch (error) {
        setStatus(error.message || "No record was removed.", "error"); return false;
      } finally { bookingSaveInProgress = false; }
    }

    function startNewRecord() {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      pendingLeadId = "";
      activeRecordId = null;
      activeRecordBaseUpdatedAt = null;
      clearForm();
      rememberLeadInUrl("");
      setStatus("New blank record ready.");
    }

    async function addAnotherEncounterSubject() {
      const last = getValue("lastName");
      const first = getValue("firstName");
      const aNumber = getValue("alienNumber");
      const digits =
        typeof alienNumberDigits === "function"
          ? alienNumberDigits(aNumber)
          : String(aNumber || "").replace(/\D/g, "");
      if (last || first || digits) {
        if (!(await saveCurrentRecord({ stay: true }))) {
          return;
        }
      }
      startNewRecord();
      applyEncounterStopToForm();
      if (currentEncounterId()) {
        setEncounterRole("TARGET");
        setStatus("Saved. New book-in for this encounter.", true);
      }
    }

    function cancelEncounterBookIn() {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      const encounterId = currentEncounterId();
      suppressAutoSave = true;
      if (activeRecordId) {
        const records = readSavedRecords();
        const rec = records.find(item => item && item.id === activeRecordId);
        if (
          rec &&
          encounterId &&
          rec.encounterId === encounterId &&
          (rec.encounterProjectionDraft === true ||
            (!rec.encounterProjectionFiledAt &&
              !rec.arrestId &&
              !rec.leadId &&
              !rec.personId))
        ) {
          rec.encounterId = "";
          rec.encounterRole = "";
          rec.subjectId = "";
          delete rec.encounterProjectionFiledAt;
          rec.encounterProjectionDraft = true;
          writeSavedRecords(records);
        }
      }
      if (encounterId) {
        window.location.href =
          "encounter-form.html?id=" + encodeURIComponent(encounterId);
        return;
      }
      window.location.href = "encounter.html";
    }

    function addEncounterSubject() {
      addAnotherEncounterSubject();
    }

    function fillBookInFromLead(snap) {
      const model = window.COPDoc && COPDoc.model;
      const person = model && model.subjectOf ? model.subjectOf(snap) : snap.person || {};
      const name = person.name || {};
      const immigration = person.immigration || {};
      const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = value == null ? "" : String(value);
        }
      };
      setVal("lastName", name.lastName || "");
      setVal("firstName", name.firstName || "");
      setVal("dateOfBirth", person.dateOfBirth || "");
      if (typeof updateAge === "function") {
        updateAge();
      }
      const sex = String(person.sex || "").toLowerCase();
      const male = document.getElementById("sexMale");
      const female = document.getElementById("sexFemale");
      if (male) {
        male.checked = sex === "male" || sex === "m";
      }
      if (female) {
        female.checked = sex === "female" || sex === "f";
      }
      const citizen = document.getElementById("citizenship");
      if (citizen) {
        const code =
          typeof resolveCitizenshipCode === "function"
            ? resolveCitizenshipCode(person.citizenship)
            : person.citizenship || "";
        citizen.value = code;
      }
      setVal("alienNumber", immigration.alienNumber || "");
      if (typeof normalizeANumberInput === "function") {
        normalizeANumberInput();
      }
      const criminal =
        model && typeof model.deriveCriminalProfile === "function"
          ? model.deriveCriminalProfile(person)
          : person.criminal || {};
      const criminalBox = document.getElementById("isCriminal");
      if (criminalBox) {
        criminalBox.checked = !!(
          criminal.isCriminal || criminal.hasCriminalRecord
        );
      }
      setVal("fbiNumber", criminal.fbiNumber || "");
      setVal(
        "foreignWarrants",
        criminal.hasForeignWarrants === true ? "yes" : "no"
      );
      setVal(
        "foreignWarrantCountry",
        criminal.hasForeignWarrants === true
          ? criminal.foreignWarrantCountry || ""
          : ""
      );
      updateBookInForeignWarrantControls();
      const arrests = Array.isArray(person.arrests) ? person.arrests : [];
      const latestArrest = arrests
        .filter(arrest => arrest && !arrest.voidedAt)
        .slice()
        .sort((left, right) =>
          String(right.arrestDateTime || right.arrestDate || "").localeCompare(
            String(left.arrestDateTime || left.arrestDate || "")
          )
        )[0];
      if (latestArrest) {
        if (latestArrest.bookInDateTime) {
          setVal("dateTime", latestArrest.bookInDateTime);
        }
        setVal("arrestTime", latestArrest.arrestTime || "");
        setVal("iceEvent", latestArrest.iceEventNumber || "");
        setVal("encounterNumber", latestArrest.encounterNumber || "");
        setVal("vehiclePosition", latestArrest.vehiclePosition || "");
        setVal("officersName", latestArrest.arrestingOfficer || "");
        setVal("team", latestArrest.team || DEFAULT_TEAM);
        setArrestTimeManualState(Boolean(latestArrest.arrestTime));
      }
      setEncounterRole("TARGET");
      pendingLeadId = snap.leadId || "";
      rememberFormSignature();
    }

    function rememberLeadInUrl(leadId) {
      const params = new URLSearchParams();
      const encounterId = currentEncounterId();
      if (encounterId) {
        params.set("encounterId", encounterId);
      }
      if (leadId) {
        params.set("leadId", leadId);
      }
      const next = params.toString()
        ? "bookin.html?" + params.toString()
        : "bookin.html";
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", next);
      }
      if (
        window.COPDoc &&
        COPDoc.chrome &&
        typeof COPDoc.chrome.mount === "function"
      ) {
        COPDoc.chrome.mount();
      }
    }

    function applyLeadToForm(snap, message) {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      suppressAutoSave = true;
      pendingLeadId = "";
      clearForm({ quiet: true });
      fillBookInFromLead(snap);
      rememberLeadInUrl(snap.leadId || "");
      suppressAutoSave = false;
      setStatus(
        message || "Case loaded. Save to keep this Book-in record.",
        true
      );
    }

    function openLoadLeadForEncounter() {
      const dialog = document.getElementById("loadLeadDialog");
      const select = document.getElementById("loadLeadSelect");
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (!dialog || !select || !store) {
        setStatus("Lead store is not available.");
        return;
      }
      store.loadFromDisk();
      const rows = (store.listLeads() || []).filter(row => {
        if (!COPDoc.model.isCommitted) {
          return true;
        }
        const snap = store.getLead(row.leadId);
        return snap && COPDoc.model.isCommitted(snap);
      });
      select.replaceChildren();
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = rows.length ? "Select a case" : "No filed cases";
      select.appendChild(blank);
      rows.forEach(row => {
        const opt = document.createElement("option");
        opt.value = row.leadId;
        opt.textContent = row.label || row.leadId;
        select.appendChild(opt);
      });
      dialog.hidden = false;
    }

    function confirmLoadLead() {
      const select = document.getElementById("loadLeadSelect");
      const dialog = document.getElementById("loadLeadDialog");
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      const id = select && select.value;
      if (!id || !store) {
        setStatus("Pick a lead.");
        return;
      }
      store.loadFromDisk();
      const snap = store.getLead(id);
      if (!snap) {
        setStatus("Case not found.");
        return;
      }
      if (COPDoc.model.isCommitted && !COPDoc.model.isCommitted(snap)) {
        setStatus("That case is still working. Save it first.");
        return;
      }
      if (dialog) {
        dialog.hidden = true;
      }
      applyLeadToForm(
        snap,
        currentEncounterId()
          ? "Case loaded. Save to attach it to this encounter."
          : "Case loaded. Save to keep this Book-in record."
      );
    }

    function prefillFromLeadQuery() {
      const id = bookInLeadId();
      if (!id) {
        return;
      }
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (!store) {
        setStatus("Lead store is not available.");
        return;
      }
      store.loadFromDisk();
      const snap = store.getLead(id);
      if (!snap || (COPDoc.model.isCommitted && !COPDoc.model.isCommitted(snap))) {
        setStatus("Case not found or not saved.", "error");
        return;
      }
      applyLeadToForm(
        snap,
        currentEncounterId()
          ? "Case loaded. Save to attach it to this encounter."
          : "Case loaded. Save to keep this Book-in record."
      );
    }

    function captureBookInDocumentContext(data, currentPacket) {
      const documents = window.COPDoc && COPDoc.documents;
      if (!documents || typeof documents.captureContext !== "function" ||
          typeof documents.generate !== "function" ||
          typeof documents.recordDelivery !== "function") {
        throw new Error("Document generation is not available. Reload Book-In and try again.");
      }
      const urlEncounterId = currentEncounterId();
      const urlSubjectId = currentEncounterSubjectId();
      if (currentPacket && (
        (urlEncounterId && currentPacket.encounterId && urlEncounterId !== currentPacket.encounterId) ||
        (urlSubjectId && currentPacket.subjectId && urlSubjectId !== currentPacket.subjectId)
      )) {
        throw new Error("This Book-In record is linked to a different Encounter subject. Reopen the correct packet before generating documents.");
      }
      const encounterId = urlEncounterId || (currentPacket && currentPacket.encounterId) || "";
      const subjectId = urlSubjectId || (currentPacket && currentPacket.subjectId) || "";
      const link = validateEncounterSubjectLink(encounterId, subjectId, currentPacket);
      if (!link.ok) throw new Error(link.error);
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (store && typeof store.loadFromDisk === "function") store.loadFromDisk();
      const encounter = encounterId && store && typeof store.getEncounter === "function"
        ? store.getEncounter(encounterId) : null;
      const personId = (link.subject && link.subject.personId) || (currentPacket && currentPacket.personId) || "";
      const person = personId && store && typeof store.getPerson === "function"
        ? store.getPerson(personId) : null;
      const arrestId = (currentPacket && currentPacket.arrestId) || "";
      const arrest = person && Array.isArray(person.arrests)
        ? person.arrests.find(row => row && row.arrestId === arrestId) || null : null;
      const sources = [{
        type: "BOOKIN_FORM",
        id: (currentPacket && currentPacket.id) || "unsaved",
        revision: activeRecordBaseUpdatedAt || "",
        authority: "draft"
      }];
      const addSource = (type, id, record) => {
        if (id) sources.push({ type, id, revision: (record && (record.updatedAt || record.modifiedAt)) || "", authority: "canonical" });
      };
      addSource("BOOKING", currentPacket && currentPacket.id, currentPacket);
      addSource("PERSON", person && person.personId, person);
      addSource("ENCOUNTER", encounter && encounter.encounterId, encounter);
      addSource("ENCOUNTER_SUBJECT", link.subject && link.subject.subjectId, encounter);
      addSource("ARREST", arrest && arrest.arrestId, arrest);
      // The visible form remains the output authority, including unsaved medical
      // answers. Canonical objects explain its identity; they never replace it.
      return documents.captureContext({
        documentType: "bookin.combined-pdf", input: data,
        person, encounter, encounterSubject: link.subject,
        booking: currentPacket || null, arrest, sources,
        generatingOfficerId: null
      });
    }

    async function renderBookInPacket(context) {
      await ensurePdfLib();
      return COPDoc.bookInPdf.render(context, {
        PDFLib: window.PDFLib,
        hyphenateLastName: typeof hyphenateLastName === "function" ? hyphenateLastName : undefined
      });
    }

    async function generateCombinedPacket() {
      const generateButton =
        document.getElementById("generateButton");

      generateButton.disabled = true;

      try {
        const currentPacket = activeRecordId && readSavedRecordsForWrite().find(record => record.id === activeRecordId);
        if (activeRecordId && !currentPacket) throw new Error("That saved packet no longer exists. Reopen Book-In before generating documents.");
        if (currentPacket && currentPacket.voidedAt) throw new Error("This booking is voided. Previously generated documents remain historical; start a new booking to generate a new packet.");
        if (currentPacket && activeRecordBaseUpdatedAt !== null && String(currentPacket.updatedAt || "") !== activeRecordBaseUpdatedAt) {
          throw new Error("That packet changed in another window. Reopen it before generating documents.");
        }
        const data = collectFormData();
        validateRequiredData(data);
        const context = captureBookInDocumentContext(data, currentPacket);

        const missingFormFields = getMissingGenerateFields(data);

        if (!(await confirmMissingGenerateFields(missingFormFields))) {
          const first = document.getElementById(
            missingFormFields[0].elementId
          );

          if (first) {
            first.focus();
            first.scrollIntoView({
              behavior: "smooth",
              block: "center"
            });
          }

          setStatus(
            "Generate cancelled. Edit the missing fields and try again.",
            "warning"
          );
          return;
        }

        setStatus("Generating the editable two-page packet...");

        let missingFields = [];
        const documents = COPDoc.documents;
        const generated = await documents.generate({
          documentType: "bookin.combined-pdf", context,
          templateContent: COPDoc.bookInPdf.templateBytes(),
          render: async captured => {
            const artifact = await renderBookInPacket(captured);
            missingFields = artifact.warnings;
            return artifact;
          }
        });
        const filename = generated.artifact.filename;
        try {
          downloadPdf(generated.artifact.data, filename);
        } catch (error) {
          try {
            await documents.recordDelivery(generated.record.generationId, { method: "download", status: "FAILED" });
          } catch (receiptError) {
            throw new Error(`The PDF was generated, but its download failed: ${error.message}. The failed delivery receipt could not be saved.`);
          }
          throw error;
        }
        // Browser download/open APIs acknowledge submission, not disk delivery.
        try {
          await documents.recordDelivery(generated.record.generationId, { method: "download", status: "SUBMITTED" });
        } catch (receiptError) {
          setStatus(
            `The packet was generated and its download was submitted: ${filename}. The delivery receipt could not be saved.` +
              (missingFields.length ? `\n\nThese PDF fields could not be found:\n${missingFields.join("\n")}` : ""),
            "warning"
          );
          return;
        }

        if (missingFields.length > 0) {
          setStatus(
            `The packet was generated, but these PDF fields could not be found:\n\n${missingFields.join("\n")}`,
            "warning"
          );
        } else {
          setStatus(
           `For the Republic. \nDocuments generated successfully:${filename}`,
  "success"
          );
        }

      } catch (error) {
        console.error(error);

        setStatus(
          `Error: ${error.message}`,
          "error"
        );

      } finally {
        generateButton.disabled = false;
      }
    }

    function isMobileBrowser() {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (
          navigator.platform === "MacIntel" &&
          navigator.maxTouchPoints > 1
        );
    }

    function downloadPdf(pdfBytes, filename) {
      const blob = new Blob(
        [pdfBytes],
        {
          type: "application/pdf"
        }
      );

      const url = URL.createObjectURL(blob);

      if (isMobileBrowser()) {
        const opened = window.open(url, "_blank");

        if (!opened) {
          window.location.assign(url);
        }

        return;
      }

      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);
    }

    function setDefaultDateTime() {
      const input =
        document.getElementById("dateTime");

      const now = new Date();

      const timezoneOffset =
        now.getTimezoneOffset() * 60000;

      const localDate =
        new Date(now.getTime() - timezoneOffset);

      input.value =
        localDate.toISOString().slice(0, 16);
      setDefaultArrestTime(true);
    }

    function encounterStopDateTime() {
      const encounterId = currentEncounterId();
      if (!encounterId) {
        return "";
      }
      const store = window.COPDoc && COPDoc.model && COPDoc.model.store;
      if (!store || typeof store.getEncounter !== "function") {
        return "";
      }
      if (typeof store.loadFromDisk === "function") {
        store.loadFromDisk();
      }
      const encounter = store.getEncounter(encounterId);
      return String((encounter && encounter.startedAt) || "").trim();
    }

    function applyEncounterStopToForm() {
      const started = encounterStopDateTime();
      if (!started) {
        setDefaultDateTime();
        if (currentEncounterId() && !currentEncounterRole()) {
          setEncounterRole("TARGET");
        }
        return;
      }
      const slice = started.length >= 16 ? started.slice(0, 16) : started;
      const dateInput = document.getElementById("dateTime");
      if (dateInput) {
        dateInput.value = slice;
      }
      const timeMatch = started.match(/T(\d{2}:\d{2})/);
      const arrestInput = document.getElementById("arrestTime");
      if (arrestInput && timeMatch) {
        arrestInput.value = timeMatch[1];
        setArrestTimeManualState(true);
      } else {
        setDefaultArrestTime(true);
      }
      if (currentEncounterId() && !currentEncounterRole()) {
        setEncounterRole("TARGET");
      }
    }

    function setDefaultTeam() {
      const input = document.getElementById("team");

      if (input && !String(input.value || "").trim()) {
        input.value = DEFAULT_TEAM;
      }
    }

    function confirmClearForm() {
      const dialog = document.getElementById("clearConfirmDialog");
      const ok = document.getElementById("clearConfirmOk");
      const cancel = document.getElementById("clearConfirmCancel");

      if (!dialog || !ok || !cancel) {
        if (
          window.confirm(
            "Clear the form? Saved records are not deleted."
          )
        ) {
          clearForm();
        }
        return;
      }

      dialog.hidden = false;
      cancel.focus();

      function finish(shouldClear) {
        dialog.hidden = true;
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        dialog.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeyDown);
        if (shouldClear) {
          clearForm();
        }
      }

      function onOk() {
        finish(true);
      }

      function onCancel() {
        finish(false);
      }

      function onBackdrop(event) {
        if (event.target === dialog) {
          finish(false);
        }
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }

      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      dialog.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeyDown);
    }

    function isAutoSaveField(element) {
      if (!element || !element.matches) {
        return false;
      }
      if (element.dataset.recordIgnore === "true") {
        return false;
      }
      if (
        element.matches(
          'input[type="button"], input[type="submit"], input[type="file"], button'
        )
      ) {
        return false;
      }
      return element.matches("input, select, textarea");
    }

    function requestAutoSave() {
      if (suppressAutoSave || bookingSaveInProgress) {
        return;
      }
      window.setTimeout(function () {
        if (suppressAutoSave || bookingSaveInProgress) {
          return;
        }
        if (currentFormSignature() === lastSavedSignature) {
          return;
        }
        saveCurrentRecord({ quiet: true });
      }, 0);
    }

    function bindBookInAutoSave() {
      if (autoSaveBound) {
        return;
      }
      autoSaveBound = true;
      document.addEventListener(
        "focusout",
        function (event) {
          if (isAutoSaveField(event.target)) {
            requestAutoSave();
          }
        },
        true
      );
      document.addEventListener("change", function (event) {
        if (isAutoSaveField(event.target)) {
          requestAutoSave();
        }
      });
    }

    function clearForm(options) {
      if (bookingSaveInProgress) {
        setStatus("Wait for the current Book-In save to finish.", "warning");
        return;
      }
      const quiet = Boolean(options && options.quiet);
      suppressAutoSave = true;
      document
        .querySelectorAll(
          'select option[data-legacy-value="true"]'
        )
        .forEach(option => option.remove());

      document
        .querySelectorAll(
          "input:not([readonly]), textarea, select"
        )
        .forEach(element => {
          if (element.dataset.recordIgnore === "true") {
            return;
          }

          if (element.matches('input[type="radio"], input[type="checkbox"]')) {
            element.checked = false;
          } else {
            element.value = "";
          }

          element.classList.remove("invalid-field");
        });

      updateAge();

      activeRecordId = null;
      activeRecordBaseUpdatedAt = null;

      applyEncounterStopToForm();
      setDefaultTeam();
      updateBookInForeignWarrantControls();
      updateGenderLogic();
      renderSavedRecords();
      rememberFormSignature();
      if (!quiet) {
        suppressAutoSave = false;
        setStatus("All form fields cleared.");
      }
    }

    window.addEventListener(
      "DOMContentLoaded",
      () => {
        const pageParams = new URLSearchParams(window.location.search);
        if (pageParams.get("view") === "table") {
          window.location.replace("cases.html");
          return;
        }
        applyEncounterStopToForm();
        setDefaultTeam();
        updateBookInForeignWarrantControls();
        loadSavedRecordColumnPreferences();

        document
          .getElementById("recordsImportFile")
          .addEventListener(
            "change",
            importRecordsBackupFile
          );

        document
          .getElementById("dateOfBirth")
          .addEventListener(
            "change",
            updateAge
          );

        document
          .getElementById("alienNumber")
          .addEventListener(
            "input",
            normalizeANumberInput
          );

        const iceEventInput =
          document.getElementById("iceEvent");

        iceEventInput.addEventListener(
          "input",
          () => {
            const cursorPosition =
              iceEventInput.selectionStart;

            normalizeIceEventInput();

            if (cursorPosition !== null) {
              iceEventInput.setSelectionRange(
                cursorPosition,
                cursorPosition
              );
            }
          }
        );

        const fbiNumberInput = document.getElementById("fbiNumber");
        fbiNumberInput?.addEventListener("input", normalizeFbiNumberInput);

        const bookInDateTimeInput = document.getElementById("dateTime");
        bookInDateTimeInput?.addEventListener("change", () => {
          setDefaultArrestTime(false);
        });

        const arrestTimeInput = document.getElementById("arrestTime");
        arrestTimeInput?.addEventListener("input", () => {
          arrestTimeInput.value = normalizeArrestTimeValue(arrestTimeInput.value);
          setArrestTimeManualState(Boolean(arrestTimeInput.value));
        });

        const foreignWarrantsInput = document.getElementById("foreignWarrants");
        foreignWarrantsInput?.addEventListener(
          "change",
          updateBookInForeignWarrantControls
        );

        const lastNameInput =
          document.getElementById("lastName");

        lastNameInput.addEventListener(
          "blur",
          applyLastNameFormatting
        );

        document
          .querySelectorAll('input[name="sex"]')
          .forEach((input) => {
            input.addEventListener("change", updateGenderLogic);
          });

        document
          .getElementById("cash")
          .addEventListener(
            "blur",
            formatCashInput
          );

        const noMedicalIssuesCheckbox =
          document.getElementById("noMedicalIssues");

        noMedicalIssuesCheckbox.addEventListener(
          "change",
          () => {
            if (noMedicalIssuesCheckbox.checked) {
              setAllMedicalQuestionsToNo();
            } else {
              clearMedicalQuestionNoSelections();
            }
          }
        );

        MEDICAL_DETAIL_FIELD_MAP.forEach(
          ([detailsFieldId, groupName]) => {
            const detailsField =
              document.getElementById(detailsFieldId);

            if (!detailsField) {
              return;
            }

            detailsField.addEventListener(
              "input",
              () => {
                if (String(detailsField.value || "").trim()) {
                  selectMedicalQuestionYes(groupName);
                }
              }
            );
          }
        );

        MEDICAL_QUESTION_GROUPS.forEach(groupName => {
          document
            .querySelectorAll(
              `input[type="radio"][name="${groupName}"]`
            )
            .forEach(input => {
              input.addEventListener(
                "change",
                syncNoMedicalIssuesCheckbox
              );
            });
        });

        updateGenderLogic();
        const encounterBanner = document.getElementById("encounterBanner");
        const encounterIdLabel = document.getElementById("encounterBannerId");
        const encounterId = currentEncounterId();
        if (encounterBanner && encounterId) {
          encounterBanner.hidden = false;
          if (encounterIdLabel) {
            encounterIdLabel.textContent = encounterId;
          }
        }
        const loadLeadCancel = document.getElementById("loadLeadCancel");
        const loadLeadConfirm = document.getElementById("loadLeadConfirm");
        const loadLeadDialog = document.getElementById("loadLeadDialog");
        if (loadLeadCancel && loadLeadDialog) {
          loadLeadCancel.addEventListener("click", () => {
            loadLeadDialog.hidden = true;
          });
        }
        if (loadLeadConfirm) {
          loadLeadConfirm.addEventListener("click", confirmLoadLead);
        }
        reconcileUnlinkedBookInRecords();
        renderSavedRecords();
        rememberFormSignature();
        bindBookInAutoSave();
        const recordId = (function () {
          try {
            return new URLSearchParams(window.location.search).get("recordId") || "";
          } catch (error) {
            return "";
          }
        })();
        if (recordId) {
          const match = readSavedRecords().find(item => item && item.id === recordId);
          const requestedSubjectId = currentEncounterSubjectId();
          const packetSubjectId = String((match && match.subjectId) || "").trim();
          if (!match) {
            setStatus("The selected Book-in record was not found.", "error");
          } else if (
            encounterId &&
            match.encounterId &&
            match.encounterId !== encounterId
          ) {
            setStatus("That Book-in record is not on this encounter.", "error");
          } else if (
            requestedSubjectId &&
            packetSubjectId &&
            requestedSubjectId !== packetSubjectId
          ) {
            setStatus(
              "That Book-in record is linked to a different Encounter subject.",
              "error"
            );
          } else {
            const subjectLink = validateEncounterSubjectLink(
              encounterId || match.encounterId || "",
              requestedSubjectId || packetSubjectId,
              match
            );
            if (!subjectLink.ok) {
              setStatus(subjectLink.error, "error");
            } else {
              loadSavedRecord(recordId);
            }
          }
        } else {
          prefillFromLeadQuery();
        }

        window.addEventListener("storage", event => {
          if (event.key === SAVED_RECORDS_STORAGE_KEY) renderSavedRecords();
          renderBookingRecovery();
        });
      }
    );

    const notPrimaryCaregiverCheckbox =
      document.getElementById("notPrimaryCaregiver");
    const childrenTextarea = document.getElementById("children");
    const notPrimaryCaregiverText =
      "The subject is not the primary caregiver of any children in the United States.";

    function baseballDatePart(value) {
      const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : "";
    }

    function bookInLeadId() {
      try {
        return new URLSearchParams(window.location.search).get("leadId") || "";
      } catch (error) {
        return "";
      }
    }

    async function openBaseballCard() {
      if (!(await saveCurrentRecord({ quiet: true, promote: true }))) {
        return;
      }
      const leadId = bookInLeadId();
      const payload = {
        from: "bookin",
        leadId: leadId,
        bookinRecordId: activeRecordId || "",
        firstName: getValue("firstName"),
        lastName: getValue("lastName"),
        age: getValue("age"),
        country: selectedOptionText("citizenship"),
        alienNumber: getValue("alienNumber"),
        disposition: selectedOptionText("immigrationDisposition"),
        arrestDate: baseballDatePart(getValue("dateTime")),
        foreignWarrants: getValue("foreignWarrants") || "no",
        foreignWarrantCountry:
          getValue("foreignWarrants") === "yes"
            ? getValue("foreignWarrantCountry")
            : "",
        isCriminal: Boolean(
          (document.getElementById("isCriminal") || {}).checked
        )
      };
      try {
        COPDoc.repositories.bookin.saveHandoff(payload);
      } catch (error) {
        console.warn(error);
      }
      const baseballParams = [];
      const encounterId = currentEncounterId();
      if (encounterId) {
        baseballParams.push(
          "encounterId=" + encodeURIComponent(encounterId)
        );
      }
      if (leadId) {
        baseballParams.push("leadId=" + encodeURIComponent(leadId));
      }
      if (activeRecordId) {
        baseballParams.push("recordId=" + encodeURIComponent(activeRecordId));
      }
      window.location.href = baseballParams.length
        ? "baseballcard.html?" + baseballParams.join("&")
        : "baseballcard.html";
    }

    window.confirmClearForm = confirmClearForm;
    window.addEncounterSubject = addEncounterSubject;
    window.addAnotherEncounterSubject = addAnotherEncounterSubject;
    window.cancelEncounterBookIn = cancelEncounterBookIn;
    window.openLoadLeadForEncounter = openLoadLeadForEncounter;
    window.openBaseballCard = openBaseballCard;
    window.saveCurrentRecord = saveCurrentRecord;
    window.startNewRecord = startNewRecord;
    window.generateCombinedPacket = generateCombinedPacket;

    function focusBookInRecords() {
      const panel = document.querySelector(".records-panel");
      if (panel && typeof panel.scrollIntoView === "function") {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.focusBookInRecords = focusBookInRecords;

    if (notPrimaryCaregiverCheckbox && childrenTextarea) {
      notPrimaryCaregiverCheckbox.addEventListener("change", function () {
        if (this.checked) {
          childrenTextarea.value = notPrimaryCaregiverText;
        } else if (childrenTextarea.value === notPrimaryCaregiverText) {
          childrenTextarea.value = "";
        }
        childrenTextarea.dispatchEvent(
          new Event("input", { bubbles: true })
        );
      });
    }
