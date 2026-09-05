(function attachNarrativeBuilderEngine(global) {
    "use strict";

        /*
      MASTER LANGUAGE SCHEMA (external libraries)
      ===========================================
      Canned dropdown labels and sentence text live in:
        data/narratives/narrative-shared-options.js
        data/narratives/sections/*.js
        data/narratives/narrative-master.js

      Option shape: { id, label, text }
      valueText supplies a bound value without generating its own sentence.
      incidentReason links qualifying conduct/flight to force and window language.
    */

    
    /* ------------------------------------------------------------------
       MASTER LANGUAGE — loaded from COPDoc.narratives data libraries
       Edit wording in: data/narratives/
         narrative-shared-options.js
         sections/01-*.js … 10-*.js
         narrative-master.js
       Do not put canned prose back into this engine file.
       ------------------------------------------------------------------ */
    const __narLib = (window.COPDoc && window.COPDoc.narratives) || {};
    if (!__narLib.MASTER_NARRATIVE_SECTIONS || !__narLib.MASTER_NARRATIVE_SECTIONS.length) {
      throw new Error(
        "Narrative Master libraries not loaded. Include narrative-shared-options.js, sections/*, and narrative-master.js before the engine."
      );
    }
    const NOT_INCLUDED = __narLib.NOT_INCLUDED;
    const CORROBORATION_OPTIONS = __narLib.CORROBORATION_OPTIONS || [];
    const SYSTEM_SECTION_DEFINITIONS = deepFreeze(__narLib.SYSTEM_SECTION_DEFINITIONS || {});
    const GENERATED_LANGUAGE = deepFreeze(__narLib.GENERATED_LANGUAGE || {});
    const MASTER_NARRATIVE_SECTIONS = deepFreeze(__narLib.MASTER_NARRATIVE_SECTIONS);
const MASTER_SECTION_BY_ID = new Map(
      MASTER_NARRATIVE_SECTIONS.map((section) => [section.id, section])
    );
    const MASTER_FIELD_BY_ID = new Map(
      MASTER_NARRATIVE_SECTIONS.flatMap((section) => section.fields.map((field) => [
        field.id,
        { section, field }
      ]))
    );
    const MASTER_SCHEMA_HASH = hashText(JSON.stringify(MASTER_NARRATIVE_SECTIONS));

    /** JSON-safe clone used only for module-owned, serializable state. */
    function cloneTemplateData(value) {
      return JSON.parse(JSON.stringify(value));
    }

    /** Recursively freezes the product schema and public constant objects. */
    function deepFreeze(value) {
      if (!value || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
      }

      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
      return value;
    }

    /** Stable short hash for master schema fingerprint (must stay outside deferred boot). */
    function hashText(value) {
      let hash = 0x811c9dc5;
      const text = String(value || "");
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return "fnv1a-" + (hash >>> 0).toString(16).padStart(8, "0");
    }

    /** Creates the mutable template layer without carrying encounter state. */
    function createWorkingTemplateFromMaster() {
      return cloneTemplateData(MASTER_NARRATIVE_SECTIONS).map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          baseFieldId: field.id,
          instanceId: field.id,
          instanceNumber: 1,
          defaultValue: "",
          tokenRules: {}
        }))
      }));
    }

    let NARRATIVE_SECTIONS = createWorkingTemplateFromMaster();

    /* Synthetic packet used only by the built-in demonstration button. */
    const TEST_DATA_PACKET = {
      schema_version: "opdoc.narrative-data.v2",
      packet_id: "demo_packet_001",
      packet_name: "COPDoc Dynamic Placeholder Test Packet",
      is_test_data: true,
      objects: [
        {
          id: "operation_001",
          type: "operation",
          role: "current_operation",
          label: "Operation Northstar (fictional test operation)",
          fields: {
            operation_name: "Operation Northstar",
            field_office: "Dallas Field Office",
            ice_office: "Dallas Field Office",
            case_number: "DAL-DEMO-2026-001",
            date: "August 1, 2026"
          }
        },
        {
          id: "encounter_001",
          type: "encounter",
          role: "current_encounter",
          label: "Primary encounter",
          fields: {
            date: "August 1, 2026",
            time: "0642",
            stop_time: "0658",
            language: "Spanish",
            event: "the attempted vehicle departure",
            action: "additional immigration processing",
            disposition: "an order of supervision"
          }
        },
        {
          id: "subject_001",
          type: "subject",
          role: "primary_target",
          label: "JUAN CARLOS MENDEZ-GARCIA (fictional)",
          fields: {
            full_name: "JUAN CARLOS MENDEZ-GARCIA",
            first_name: "JUAN",
            last_name: "MENDEZ-GARCIA",
            date_of_birth: "March 14, 1988",
            a_number: "123456789",
            country: "Mexico",
            nationality: "Mexico",
            nationality_adjective: "MEXICAN",
            immigration_status_or_disposition: "subject to a final administrative order of removal",
            health: "good",
            medications: "no medications",
            currency_usd: "146.00"
          }
        },
        {
          id: "subject_002",
          type: "subject",
          role: "collateral_subject",
          label: "CARLOS REYES (fictional collateral subject)",
          fields: {
            full_name: "CARLOS REYES",
            first_name: "CARLOS",
            last_name: "REYES",
            date_of_birth: "November 2, 1991",
            a_number: "987654321",
            country: "Mexico",
            nationality: "Mexico",
            nationality_adjective: "MEXICAN"
          }
        },
        {
          id: "officer_001",
          type: "officer",
          role: "identifying_officer",
          label: "Officer A. Rivera (fictional)",
          fields: {
            full_name: "Officer A. Rivera",
            display_name: "Officer Rivera",
            badge_number: "0001",
            team: "DAL-1"
          }
        },
        {
          id: "vehicle_001",
          type: "vehicle",
          role: "encountered_vehicle",
          label: "2020 Toyota Camry — TX DEMO123",
          fields: {
            display_name: "a gray 2020 Toyota Camry",
            description: "a gray 2020 Toyota Camry",
            plate: "TX DEMO123",
            year_make_model: "2020 Toyota Camry"
          }
        },
        {
          id: "vehicle_002",
          type: "vehicle",
          role: "government_vehicle",
          label: "ICE government vehicle 12 (fictional)",
          fields: {
            display_name: "ICE government vehicle 12",
            description: "an ICE government sport-utility vehicle",
            plate: "GOV 0012"
          }
        },
        {
          id: "location_001",
          type: "location",
          role: "target_address",
          label: "Target residence (fictional)",
          fields: {
            address: "1234 Example Road, Dallas, Texas",
            full_address: "1234 Example Road, Dallas, Texas",
            location: "1234 Example Road, Dallas, Texas",
            starting_location: "1234 Example Road, Dallas, Texas",
            specific_location: "the center console"
          }
        },
        {
          id: "location_002",
          type: "location",
          role: "contact_location",
          label: "Vehicle-stop location (fictional)",
          fields: {
            address: "the intersection of Example Road and Sample Avenue, Dallas, Texas",
            location: "the intersection of Example Road and Sample Avenue, Dallas, Texas",
            contact_location: "the intersection of Example Road and Sample Avenue, Dallas, Texas",
            stop_location: "the intersection of Example Road and Sample Avenue, Dallas, Texas",
            destination: "the secured lot at the Dallas Field Office"
          }
        },
        {
          id: "agency_001",
          type: "agency",
          role: "referring_agency",
          label: "Dallas Police Department (fictional referral)",
          fields: {
            name: "the Dallas Police Department",
            display_name: "the Dallas Police Department",
            ice_component: "ERO Dallas"
          }
        },
        {
          id: "document_001",
          type: "document",
          role: "identity_document",
          label: "Mexican identity document (fictional)",
          fields: {
            description: "a Mexican voter identification card",
            document: "a Mexican voter identification card",
            issuing_country: "Mexico"
          }
        },
        {
          id: "facility_001",
          type: "facility",
          role: "receiving_facility",
          label: "North Texas Processing Center (fictional)",
          fields: {
            name: "the North Texas Processing Center",
            facility: "the North Texas Processing Center",
            medical_facility: "Example Medical Center"
          }
        },
        {
          id: "person_001",
          type: "person",
          role: "authorized_person",
          label: "MARIA MENDEZ (fictional)",
          fields: {
            full_name: "MARIA MENDEZ",
            relationship: "the registered owner"
          }
        },
        {
          id: "detail_001",
          type: "narrative_detail",
          role: "case_facts",
          label: "Fictional test facts",
          fields: {
            database: "EARM",
            referral_information: "an active final order of removal",
            origin_details: "information developed during a case review",
            specific_articulable_facts: "the photograph, biographical information, associated address, and associated vehicle matched the target packet",
            arrest_facts: "the confirmed identity and immigration records",
            authority_and_basis: "the previously issued administrative arrest warrant",
            command: "show both hands",
            conduct: "pulling both arms away and attempting to turn toward Officers",
            facts_supporting_arrest: "the confirmed identity, alienage, and immigration record",
            force_result: "No injury was reported or observed.",
            injury_details: "minor redness to the right wrist",
            medical_evaluation_or_treatment: "an on-scene medical evaluation",
            restraint_type: "flex cuffs",
            reason: "the subject repeatedly pulled away from Officers",
            property: "the vehicle keys and cellular telephone",
            item: "the identity document",
            evidence_location: "the Dallas Field Office evidence room",
            tow_company: "Example Towing",
            destination: "the secured lot at the Dallas Field Office",
            reason_for_release: "the subject was not amenable to removal",
            window: "the driver-side rear quarter window",
            tool: "a window punch",
            damage_or_injury_result: "minor damage to both vehicles and no reported injury"
          }
        }
      ]
    };

    /*
      The limits protect the browser from accidentally ingesting photos, blobs,
      complete case exports, or otherwise unbounded JSON. The narrative module
      receives a deliberately small projection of canonical OpDoc objects.
    */
    const INPUT_LIMITS = deepFreeze({
      maxObjects: 500,
      maxFieldsPerObject: 100,
      maxScalarLength: 12000,
      maxLabelLength: 240,
      maxPacketNameLength: 240,
      maxMetadataBytes: 100000
    });

    /* Human-readable labels do not control binding behavior; rules below do. */
    const OBJECT_TYPE_LABELS = {
      operation: "Operation",
      encounter: "Encounter",
      event: "Narrative event",
      subject: "Subject",
      officer: "Officer",
      vehicle: "Vehicle",
      location: "Location",
      agency: "Agency",
      document: "Document",
      country: "Country",
      facility: "Facility",
      person: "Person",
      narrative_detail: "Narrative detail"
    };

    const PLACEHOLDER_RULES = {
      "SUBJECT": { types: ["subject", "person"], fields: ["full_name"], roles: ["narrative_subject", "primary_target"] },
      "INCIDENT SUBJECT": { types: ["subject", "person"], fields: ["full_name"], roles: ["narrative_subject", "target", "collateral"] },
      "OTHER SUBJECT": { types: ["subject", "person"], fields: ["full_name"], roles: ["target", "collateral"] },
      "TARGET": { types: ["subject", "person"], fields: ["full_name"], roles: ["narrative_subject", "target", "primary_target"] },
      "NAME": { types: ["subject", "person"], fields: ["full_name"], roles: ["narrative_subject", "primary_target"] },
      "DOB": { types: ["subject", "person"], fields: ["date_of_birth"], roles: ["narrative_subject", "primary_target"] },
      "A-NUMBER": { types: ["subject", "person"], fields: ["a_number"], roles: ["narrative_subject", "primary_target"] },
      "COUNTRY": { types: ["subject", "person", "country", "document"], fields: ["country", "nationality", "name", "issuing_country"], roles: ["narrative_subject", "primary_target", "citizenship_country", "issuing_country"] },
      "DOCUMENT NATIONALITY": { types: ["subject", "person", "country"], fields: ["nationality_adjective", "nationality", "demonym", "name"] },
      "IMMIGRATION STATUS OR DISPOSITION": { types: ["subject", "person"], fields: ["immigration_status_or_disposition"], roles: ["narrative_subject", "primary_target"] },
      "OTHER ARRESTED LIST": { types: ["narrative_detail"], fields: ["other_arrested_list"], roles: ["other_arrested_summary"] },
      "VEHICLE": { types: ["vehicle"], fields: ["display_name", "description"], roles: ["encountered_vehicle"] },
      "ENCOUNTERED VEHICLE": { types: ["vehicle"], fields: ["display_name", "description"], roles: ["encountered_vehicle"] },
      "VEHICLE 1": { types: ["vehicle"], fields: ["display_name", "description"], roles: ["encountered_vehicle"] },
      "VEHICLE 2": { types: ["vehicle"], fields: ["display_name", "description"], roles: ["government_vehicle"] },
      "PLATE": { types: ["vehicle"], fields: ["plate"], roles: ["encountered_vehicle"] },
      "ADDRESS": { types: ["location"], fields: ["full_address", "address"], roles: ["target_address"] },
      "LOCATION": { types: ["location"], fields: ["location", "full_address", "address"], roles: ["contact_location", "target_address"] },
      "STARTING LOCATION": { types: ["location"], fields: ["starting_location", "location", "address"], roles: ["target_address"] },
      "CONTACT LOCATION": { types: ["location"], fields: ["contact_location", "location"], roles: ["contact_location"] },
      "STOP LOCATION": { types: ["location"], fields: ["stop_location", "location"], roles: ["contact_location"] },
      "SPECIFIC LOCATION": { types: ["location"], fields: ["specific_location", "location"] },
      "DATE": { types: ["encounter", "operation"], fields: ["date"] },
      "TIME": { types: ["event", "encounter"], fields: ["time"] },
      "STOP TIME": { types: ["event", "encounter"], fields: ["time", "stop_time"] },
      "FIELD OFFICE": { types: ["operation"], fields: ["field_office"] },
      "ICE OFFICE": { types: ["operation"], fields: ["ice_office", "field_office"] },
      "AGENCY": { types: ["agency"], fields: ["display_name", "name"] },
      "ICE COMPONENT": { types: ["agency"], fields: ["ice_component", "display_name"] },
      "OFFICER": { types: ["officer", "person"], fields: ["full_name", "display_name"], roles: ["officer", "arresting_officer", "identifying_officer"] },
      "IDENTIFYING OFFICER OR AGENCY": { types: ["officer", "person", "agency"], fields: ["full_name", "display_name", "name"], roles: ["identifying_officer", "identifying_agency"] },
      "DOCUMENT": { types: ["document"], fields: ["document", "description"] },
      "FACILITY": { types: ["facility"], fields: ["facility", "name"] },
      "MEDICAL FACILITY": { types: ["facility"], fields: ["medical_facility", "name"] },
      "PERSON": { types: ["person"], fields: ["full_name"] },
      "LANGUAGE": { types: ["encounter"], fields: ["language"] },
      "EVENT": { types: ["encounter"], fields: ["event"] },
      "ACTION": { types: ["encounter"], fields: ["action"] },
      "DISPOSITION": { types: ["encounter"], fields: ["disposition"] },
      "DATABASE": { types: ["narrative_detail"], fields: ["database"] },
      "REFERRAL INFORMATION": { types: ["narrative_detail"], fields: ["referral_information"] },
      "ORIGIN DETAILS": { types: ["narrative_detail"], fields: ["origin_details"] },
      "SPECIFIC ARTICULABLE FACTS": { types: ["narrative_detail"], fields: ["specific_articulable_facts"] },
      "ARREST FACTS": { types: ["narrative_detail"], fields: ["arrest_facts"] },
      "AUTHORITY AND BASIS": { types: ["narrative_detail"], fields: ["authority_and_basis"] },
      "COMMAND": { types: ["narrative_detail"], fields: ["command"] },
      "CONDUCT": { types: ["narrative_detail"], fields: ["conduct"] },
      "FACTS SUPPORTING ARREST": { types: ["narrative_detail"], fields: ["facts_supporting_arrest"] },
      "FORCE RESULT": { types: ["narrative_detail"], fields: ["force_result"] },
      "INJURY DETAILS": { types: ["narrative_detail"], fields: ["injury_details"] },
      "MEDICAL EVALUATION OR TREATMENT": { types: ["narrative_detail"], fields: ["medical_evaluation_or_treatment"] },
      "RESTRAINT TYPE": { types: ["narrative_detail"], fields: ["restraint_type"] },
      "REASON": { types: ["narrative_detail"], fields: ["reason"] },
      "PROPERTY": { types: ["narrative_detail"], fields: ["property"] },
      "ITEM": { types: ["narrative_detail"], fields: ["item"] },
      "EVIDENCE LOCATION": { types: ["narrative_detail"], fields: ["evidence_location"] },
      "TOW COMPANY": { types: ["narrative_detail"], fields: ["tow_company"] },
      "DESTINATION": { types: ["location", "narrative_detail"], fields: ["destination"] },
      "REASON FOR RELEASE": { types: ["narrative_detail"], fields: ["reason_for_release"] },
      "WINDOW": { types: ["narrative_detail"], fields: ["window"] },
      "TOOL": { types: ["narrative_detail"], fields: ["tool"] },
      "WINDOW BREAK TOOL": { types: ["narrative_detail"], fields: ["tool"] },
      "DAMAGE OR INJURY RESULT": { types: ["narrative_detail"], fields: ["damage_or_injury_result"] },
      "MEDICATIONS": { types: ["subject", "person"], fields: ["medications"], roles: ["narrative_subject", "primary_target"] },
      "AMOUNT": { types: ["subject", "person"], fields: ["currency_usd"], roles: ["narrative_subject", "primary_target"] },
      "BUSINESS OR WORKPLACE": { types: ["location"], fields: ["business_or_workplace", "business_name", "location", "full_address", "address"] },
      "CORROBORATING FACTS": { types: ["narrative_detail"], fields: ["corroborating_facts"] },
      "OFFENSE OR WARRANT": { types: ["narrative_detail"], fields: ["offense_or_warrant"] },
      "SUBJECT CONDUCT": { types: ["narrative_detail"], fields: ["subject_conduct", "conduct"] },
      "TECHNIQUE OR TOOL": { types: ["narrative_detail"], fields: ["technique_or_tool", "tool"] }
    };

    const VARIABLE_TYPE_CONFIG = {
      subject: { label: "Subject / person", tokenLabel: "SUBJECT / PERSON", className: "variable-type-subject" },
      officer: { label: "Officer / agency", tokenLabel: "OFFICER / AGENCY", className: "variable-type-officer" },
      event: { label: "Date / time / event", tokenLabel: "DATE / TIME / EVENT", className: "variable-type-event" },
      location: { label: "Location", tokenLabel: "LOCATION", className: "variable-type-location" },
      vehicle: { label: "Vehicle", tokenLabel: "VEHICLE", className: "variable-type-vehicle" },
      document: { label: "Document / evidence", tokenLabel: "DOCUMENT / EVIDENCE", className: "variable-type-document" },
      action: { label: "Action / disposition", tokenLabel: "ACTION / DISPOSITION", className: "variable-type-action" },
      custom: { label: "Custom", tokenLabel: "CUSTOM", className: "variable-type-custom" },
      other: { label: "Other", tokenLabel: "OTHER", className: "variable-type-other" }
    };

    const VARIABLE_CATEGORY_RULES = {
      subject: { types: ["subject", "person"], fields: null },
      officer: { types: ["officer", "agency"], fields: null },
      event: { types: ["operation", "encounter", "event"], fields: null },
      location: { types: ["location", "facility"], fields: null },
      vehicle: { types: ["vehicle"], fields: null },
      document: { types: ["document"], fields: null },
      action: { types: ["narrative_detail"], fields: null },
      custom: { types: [], fields: null },
      other: { types: [], fields: null }
    };

    const VARIABLE_TYPE_CLASSES = Object.values(VARIABLE_TYPE_CONFIG).map((config) => config.className);

    const EXTRA_CANONICAL_FIELDS = deepFreeze({
      subject: ["first_name", "middle_name", "last_name", "country_of_birth"],
      person: [
        "first_name", "middle_name", "last_name", "relationship", "date_of_birth", "a_number",
        "country", "nationality", "nationality_adjective", "immigration_status_or_disposition",
        "health", "medications", "currency_usd", "ice_event", "encounter_participant_id", "encounter_role",
        "outcome_code", "arrest_time", "final_order_status", "immigration_disposition_code"
      ],
      officer: ["first_name", "last_name", "badge_number", "team"],
      vehicle: ["year", "make", "model", "color", "year_make_model"],
      location: ["city", "state", "postal_code", "latitude", "longitude", "map_link"],
      operation: ["operation_name", "case_number"],
      encounter: ["encounter_number"],
      event: ["event", "action", "disposition", "description"],
      document: ["document_type", "document_number"],
      country: ["country", "nationality", "nationality_adjective", "demonym", "alpha2", "alpha3"]
    });
    const CANONICAL_FIELDS_BY_TYPE = deepFreeze(Object.fromEntries(
      Object.keys(OBJECT_TYPE_LABELS).map((type) => {
        const fields = new Set(["display_name", "name", "description", ...(EXTRA_CANONICAL_FIELDS[type] || [])]);
        Object.values(PLACEHOLDER_RULES).forEach((rule) => {
          if (rule.types?.includes(type)) {
            (rule.fields || []).forEach((fieldKey) => fields.add(fieldKey));
          }
        });
        return [type, [...fields]];
      })
    ));

    /* COPDoc native: all DOM wiring + public API deferred until host boots. */
    function __opdocNarrativeBootstrap() {
      if (window.OpDocNarrative && window.OpDocNarrative.version) {
        return window.OpDocNarrative;
      }
      if (!document.getElementById("narrativeForm")) {
        throw new Error("Narrative engine markup missing (#narrativeForm). Inject ENGINE_MARKUP first.");
      }

      /*
        Contract versions + defaults MUST be declared at the top of this function.
        Deferred boot previously left MODULE_BUILD / DEFAULT_MODULE_CONFIG outside
        or below first use, which throws TDZ: "Cannot access 'X' before initialization".
      */
      const MODULE_VERSION = "9.0.0-integration-candidate";
      const MODULE_BUILD = 9;
      const DATA_SCHEMA = "copdoc.narrative-data.v3";
      const STATE_SCHEMA = "copdoc.narrative-state.v3";
      const OUTPUT_SCHEMA = "copdoc.narrative-output.v3";
      const TEMPLATE_SCHEMA = "copdoc.narrative-template.v3";
      const LEGACY_SCHEMAS = deepFreeze({
        data: ["opdoc.narrative-data.v1", "opdoc.narrative-data.v2"],
        state: ["opdoc.narrative-state.v1", "opdoc.narrative-state.v2"],
        output: ["opdoc.narrative-output.v1", "opdoc.narrative-output.v2"],
        template: ["opdoc.narrative-template.v1", "opdoc.narrative-template.v2"]
      });

      const DEFAULT_MODULE_CONFIG = deepFreeze({
        mode: "standalone",
        enableDemo: true,
        enableTestPacket: true,
        enableJsonImport: true,
        enableLocalStorage: true,
        canEditTemplates: true,
        canComposeNarrative: true,
        canEditSourceValues: true,
        requireResolvedBeforeCopy: false,
        allowUnknownFields: false,
        allowedMessageOrigins: []
      });

      const form = document.getElementById("narrativeForm");
    const draft = document.getElementById("narrativeDraft");
    const resolvedDraft = document.getElementById("resolvedDraft");
    const draftStatus = document.getElementById("draftStatus");
    const editorModeLabel = document.getElementById("editorModeLabel");
    const rebuildButton = document.getElementById("rebuildButton");
    const copyButton = document.getElementById("copyButton");
    const clearButton = document.getElementById("clearButton");
    const typesViewButton = document.getElementById("typesViewButton");
    const rolesViewButton = document.getElementById("rolesViewButton");
    const valuesViewButton = document.getElementById("valuesViewButton");
    const plainTextViewButton = document.getElementById("plainTextViewButton");
    const bindingsViewButton = document.getElementById("bindingsViewButton");
    const variablesView = document.getElementById("variablesView");
    const variablesSummary = document.getElementById("variablesSummary");
    const variablesFilters = document.getElementById("variablesFilters");
    const subjectDirectory = document.getElementById("subjectDirectory");
    const variablesList = document.getElementById("variablesList");
    const autoBindButton = document.getElementById("autoBindButton");
    const detectTokensButton = document.getElementById("detectTokensButton");
    const runTokenDemoButton = document.getElementById("runTokenDemoButton");
    const loadTestDataButton = document.getElementById("loadTestDataButton");
    const importDataButton = document.getElementById("importDataButton");
    const clearDataButton = document.getElementById("clearDataButton");
    const dataPacketInput = document.getElementById("dataPacketInput");
    const dataPacketStatus = document.getElementById("dataPacketStatus");
    const activeTemplateStatus = document.getElementById("activeTemplateStatus");
    const templateManagerButton = document.getElementById("templateManagerButton");
    const saveTemplateButton = document.getElementById("saveTemplateButton");
    const templateModal = document.getElementById("templateModal");
    const templateDialogClose = document.getElementById("templateDialogClose");
    const templateNameInput = document.getElementById("templateNameInput");
    const templateDescriptionInput = document.getElementById("templateDescriptionInput");
    const templateDefaultsCheckbox = document.getElementById("templateDefaultsCheckbox");
    const saveTemplateAsButton = document.getElementById("saveTemplateAsButton");
    const updateTemplateButton = document.getElementById("updateTemplateButton");
    const templateLibrarySelect = document.getElementById("templateLibrarySelect");
    const loadTemplateButton = document.getElementById("loadTemplateButton");
    const deleteTemplateButton = document.getElementById("deleteTemplateButton");
    const exportTemplateButton = document.getElementById("exportTemplateButton");
    const importTemplateButton = document.getElementById("importTemplateButton");
    const templateImportInput = document.getElementById("templateImportInput");
    const masterElementSelect = document.getElementById("masterElementSelect");
    const addMasterElementButton = document.getElementById("addMasterElementButton");
    const restoreMasterLayoutButton = document.getElementById("restoreMasterLayoutButton");
    const templateModalStatus = document.getElementById("templateModalStatus");
    const elementEditorModal = document.getElementById("elementEditorModal");
    const elementEditorTitle = document.getElementById("elementEditorTitle");
    const elementEditorContext = document.getElementById("elementEditorContext");
    const elementEditorClose = document.getElementById("elementEditorClose");
    const elementLabelInput = document.getElementById("elementLabelInput");
    const elementOptionSelect = document.getElementById("elementOptionSelect");
    const elementOptionLabelInput = document.getElementById("elementOptionLabelInput");
    const elementHasEventTimeCheckbox = document.getElementById("elementHasEventTimeCheckbox");
    const elementSentenceInput = document.getElementById("elementSentenceInput");
    const elementValueTextInput = document.getElementById("elementValueTextInput");
    const elementIncidentReasonInput = document.getElementById("elementIncidentReasonInput");
    const elementVariableSelect = document.getElementById("elementVariableSelect");
    const elementVariableSlotInput = document.getElementById("elementVariableSlotInput");
    const insertElementVariableButton = document.getElementById("insertElementVariableButton");
    const elementSentencePreview = document.getElementById("elementSentencePreview");
    const resetElementOptionButton = document.getElementById("resetElementOptionButton");
    const revertElementSavedButton = document.getElementById("revertElementSavedButton");
    const resetElementMasterButton = document.getElementById("resetElementMasterButton");
    const removeElementLayoutButton = document.getElementById("removeElementLayoutButton");
    const elementEditorStatus = document.getElementById("elementEditorStatus");
    const applyElementChangesButton = document.getElementById("applyElementChangesButton");
    const cancelElementChangesButton = document.getElementById("cancelElementChangesButton");
    const helpButton = document.getElementById("helpButton");
    const helpModal = document.getElementById("helpModal");
    const helpDialogClose = document.getElementById("helpDialogClose");
    const tokenModal = document.getElementById("tokenModal");
    const tokenDialogTitle = document.getElementById("tokenDialogTitle");
    const tokenDialogContext = document.getElementById("tokenDialogContext");
    const tokenDialogClose = document.getElementById("tokenDialogClose");
    const tokenSuggestions = document.getElementById("tokenSuggestions");
    const tokenSuggestionsSection = document.getElementById("tokenSuggestionsSection");
    const tokenRoleSelectorControl = document.getElementById("tokenRoleSelectorControl");
    const tokenRoleSelectorSelect = document.getElementById("tokenRoleSelectorSelect");
    const tokenTypeRestriction = document.getElementById("tokenTypeRestriction");
    const tokenCategorySection = document.getElementById("tokenCategorySection");
    const tokenCategorySelect = document.getElementById("tokenCategorySelect");
    const setTokenCategoryButton = document.getElementById("setTokenCategoryButton");
    const tokenObjectControl = document.getElementById("tokenObjectControl");
    const tokenObjectLabel = document.getElementById("tokenObjectLabel");
    const tokenObjectSelect = document.getElementById("tokenObjectSelect");
    const tokenFieldControl = document.getElementById("tokenFieldControl");
    const tokenFieldSelect = document.getElementById("tokenFieldSelect");
    const tokenBindingPreview = document.getElementById("tokenBindingPreview");
    const tokenCustomControl = document.getElementById("tokenCustomControl");
    const tokenCustomValue = document.getElementById("tokenCustomValue");
    const tokenDialogActions = document.getElementById("tokenDialogActions");
    const bindTokenButton = document.getElementById("bindTokenButton");
    const customTokenButton = document.getElementById("customTokenButton");
    const unbindTokenButton = document.getElementById("unbindTokenButton");

    const tokenBindings = new Map();
    const tokenTypeOverrides = new Map();
    const repeatInstanceCounters = new Map();
    /* Host-registered object adapters are runtime-only and are never serialized. */
    const objectAdapters = new Map();
    let moduleConfig = { ...DEFAULT_MODULE_CONFIG };
    let sourceEditHandler = null;
    let savedTemplates = [];
    let templateStorageAvailable = true;
    let activeTemplateId = "master";
    let activeTemplateName = "Master";
    let activeTemplateSourceMasterBuild = MODULE_BUILD;
    let activeTemplateSnapshot = cloneTemplateData(NARRATIVE_SECTIONS);
    let workingTemplateDirty = false;
    let elementEditorState = null;
    let templateDialogReturnFocus = null;
    let elementDialogReturnFocus = null;
    let copyOutputHandler = null;
    let dataPacket = null;
    let dataObjectById = new Map();
    let viewMode = "types";
    let variableFilter = "all";
    let activeTokenKey = "";
    let activeTokenElement = null;
    let activeDialogReturnFocus = null;
    let manualEdits = false;
    let selectionsPending = false;
    let templateRevision = 0;
    let resolvedFromRevision = -1;
    let resolvedManualEdits = false;
    let resolvedPending = false;
    let dragState = null;
    let pointerSortState = null;
    let moduleReady = false;
    let integrationEventSuppression = 0;

    /*
      Integration events deliberately carry only counts, identifiers, and state
      flags. This prevents sensitive narrative text or source object data from
      being copied into unrelated host listeners or diagnostic telemetry.
    */
    function emitIntegrationEvent(eventName, detail = {}) {
      if ((!moduleReady && eventName !== "opdoc:narrative-ready") || integrationEventSuppression > 0) {
        return;
      }

      window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          moduleVersion: MODULE_VERSION,
          build: MODULE_BUILD,
          ...detail
        }
      }));
    }

    function getActiveTemplateSummary() {
      const savedTemplate = getSavedTemplate(activeTemplateId);
      return {
        id: savedTemplate?.id || activeTemplateId || "master",
        name: savedTemplate?.name || activeTemplateName || "Master",
        dirty: workingTemplateDirty,
        sourceMasterBuild: savedTemplate?.sourceMasterBuild || activeTemplateSourceMasterBuild || MODULE_BUILD,
        masterBuild: MODULE_BUILD,
        updatedAt: savedTemplate?.updatedAt || null
      };
    }

    function getNarrativeEventSummary(reason = "state-change") {
      const status = getTokenStatus();
      return {
        reason,
        view: viewMode,
        selections: countSelections(),
        words: countWords(getPlainNarrative("resolved")),
        variables: {
          total: status.total,
          filled: status.filled,
          unresolved: status.unresolved,
          custom: status.custom
        }
      };
    }

    function emitNarrativeChange(reason) {
      emitIntegrationEvent("opdoc:narrative-change", getNarrativeEventSummary(reason));
    }

    function emitTemplateChange(reason) {
      emitIntegrationEvent("opdoc:narrative-template-change", {
        reason,
        template: getActiveTemplateSummary(),
        sectionCount: NARRATIVE_SECTIONS.length,
        fieldCount: NARRATIVE_SECTIONS.reduce((count, section) => count + section.fields.length, 0)
      });
    }

    function emitDataChange(reason) {
      const typeCounts = {};
      (dataPacket?.objects || []).forEach((object) => {
        typeCounts[object.type] = (typeCounts[object.type] || 0) + 1;
      });
      emitIntegrationEvent("opdoc:narrative-data-change", {
        reason,
        packetId: dataPacket?.packet_id || null,
        objectCount: dataPacket?.objects?.length || 0,
        typeCounts
      });
    }

    function sectionName(title) {
      return title.replace(/^\d+\.\s*/, "");
    }

    function getMasterSection(sectionId) {
      return MASTER_SECTION_BY_ID.get(sectionId) || null;
    }

    function getMasterField(baseFieldId) {
      return MASTER_FIELD_BY_ID.get(baseFieldId) || null;
    }

    function getWorkingSection(sectionId) {
      return NARRATIVE_SECTIONS.find((section) => section.id === sectionId) || null;
    }

    function getWorkingField(instanceId) {
      for (const section of NARRATIVE_SECTIONS) {
        const field = section.fields.find((candidate) => candidate.instanceId === instanceId);

        if (field) {
          return { section, field };
        }
      }

      return null;
    }

    function getFieldDisplayLabel(field) {
      return field.instanceNumber > 1 ? `${field.label} ${field.instanceNumber}` : field.label;
    }

    function syncWorkingTemplateOrderFromDom() {
      const sectionById = new Map(NARRATIVE_SECTIONS.map((section) => [section.id, section]));
      const orderedSections = sortableChildren(form, "section")
        .map((fieldset) => sectionById.get(fieldset.dataset.sectionId))
        .filter(Boolean);

      orderedSections.forEach((section) => {
        const fieldset = Array.from(form.querySelectorAll("fieldset[data-section-id]")).find(
          (candidate) => candidate.dataset.sectionId === section.id
        );

        if (!fieldset) {
          return;
        }

        const fieldById = new Map(section.fields.map((field) => [field.instanceId, field]));
        section.fields = sortableChildren(fieldset, "field")
          .map((wrapper) => fieldById.get(wrapper.dataset.fieldId))
          .filter(Boolean);
      });

      NARRATIVE_SECTIONS = orderedSections;
    }

    function markWorkingTemplateDirty(message = "") {
      workingTemplateDirty = true;
      updateActiveTemplateStatus();
      emitTemplateChange("working-template-edited");

      if (message) {
        updateStatus(message);
      }
    }

    function sortableChildren(parent, type) {
      return Array.from(parent.children).filter((child) => {
        if (type === "section") {
          return child.matches("fieldset[data-section-id]");
        }

        return child.matches(".field[data-field-id]");
      });
    }

    function updateSectionNumbers() {
      sortableChildren(form, "section").forEach((fieldset, index) => {
        const title = fieldset.querySelector(".section-title");

        if (title) {
          title.textContent = `${index + 1}. ${fieldset.dataset.sectionTitle}`;
        }
      });
    }

    function beginSort(type, item, handle) {
      const siblings = sortableChildren(item.parentElement, type);

      dragState = {
        type,
        item,
        handle,
        startParent: item.parentElement,
        startIndex: siblings.indexOf(item)
      };

      item.classList.add("dragging");
      handle.setAttribute("aria-grabbed", "true");
    }

    function reorderDraggedItem(target, clientY) {
      if (!dragState || !target || target === dragState.item) {
        return false;
      }

      const { type, item } = dragState;

      if (target.parentElement !== item.parentElement) {
        return false;
      }

      if (type === "section" && !target.matches("fieldset[data-section-id]")) {
        return false;
      }

      if (type === "field" && !target.matches(".field[data-field-id]")) {
        return false;
      }

      const targetRect = target.getBoundingClientRect();
      const placeBefore = clientY < targetRect.top + targetRect.height / 2;
      target.parentElement.insertBefore(item, placeBefore ? target : target.nextSibling);

      if (type === "section") {
        updateSectionNumbers();
      }

      return true;
    }

    function finishSort() {
      if (!dragState) {
        return;
      }

      const { type, item, handle, startParent, startIndex } = dragState;
      const endSiblings = sortableChildren(item.parentElement, type);
      const orderChanged = item.parentElement !== startParent || endSiblings.indexOf(item) !== startIndex;

      item.classList.remove("dragging");
      handle.setAttribute("aria-grabbed", "false");
      dragState = null;
      pointerSortState = null;
      updateSectionNumbers();

      if (orderChanged) {
        syncWorkingTemplateOrderFromDom();
        markWorkingTemplateDirty();
        synchronizeChronologicalEventTimes();
        handleSelectionChange();
      }
    }

    function moveSortableWithKeyboard(event, item, type) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      event.preventDefault();
      const parent = item.parentElement;
      const siblings = sortableChildren(parent, type);
      const currentIndex = siblings.indexOf(item);
      const destinationIndex = event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;

      if (destinationIndex < 0 || destinationIndex >= siblings.length) {
        return;
      }

      if (event.key === "ArrowUp") {
        parent.insertBefore(item, siblings[destinationIndex]);
      } else {
        parent.insertBefore(item, siblings[destinationIndex].nextSibling);
      }

      updateSectionNumbers();
      syncWorkingTemplateOrderFromDom();
      markWorkingTemplateDirty();
      synchronizeChronologicalEventTimes();
      handleSelectionChange();
    }

    function setupSortableHandle(handle, item, type) {
      handle.draggable = true;
      handle.setAttribute("aria-grabbed", "false");
      handle.title = type === "section"
        ? "Drag to reorder this category. Arrow Up/Down also works."
        : "Drag to reorder this event within the category. Arrow Up/Down also works.";

      handle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        beginSort(type, item, handle);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${type}:${item.dataset.sectionId || item.dataset.fieldId}`);
      });

      handle.addEventListener("dragend", (event) => {
        event.stopPropagation();
        finishSort();
      });

      handle.addEventListener("keydown", (event) => {
        moveSortableWithKeyboard(event, item, type);
      });

      handle.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") {
          return;
        }

        event.preventDefault();
        beginSort(type, item, handle);
        pointerSortState = {
          handle,
          pointerId: event.pointerId,
          type
        };
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener("pointermove", (event) => {
        if (
          !pointerSortState ||
          pointerSortState.handle !== handle ||
          pointerSortState.pointerId !== event.pointerId
        ) {
          return;
        }

        event.preventDefault();
        const elementAtPointer = document.elementFromPoint(event.clientX, event.clientY);
        const selector = type === "section"
          ? "fieldset[data-section-id]"
          : ".field[data-field-id]";
        const target = elementAtPointer ? elementAtPointer.closest(selector) : null;
        reorderDraggedItem(target, event.clientY);
      });

      const finishPointerSort = (event) => {
        if (
          pointerSortState &&
          pointerSortState.handle === handle &&
          pointerSortState.pointerId === event.pointerId
        ) {
          finishSort();
        }
      };

      handle.addEventListener("pointerup", finishPointerSort);
      handle.addEventListener("pointercancel", finishPointerSort);
    }

    form.addEventListener("dragover", (event) => {
      if (!dragState) {
        return;
      }

      const selector = dragState.type === "section"
        ? "fieldset[data-section-id]"
        : ".field[data-field-id]";
      const target = event.target.closest(selector);

      if (target && target.parentElement === dragState.item.parentElement) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        reorderDraggedItem(target, event.clientY);
      }
    });

    form.addEventListener("drop", (event) => {
      if (dragState) {
        event.preventDefault();
      }
    });

    function getRepeatCounterKey(sectionId, baseFieldId) {
      return `${sectionId}::${baseFieldId}`;
    }

    function getNextRepeatInstance(sectionId, baseFieldId) {
      const key = getRepeatCounterKey(sectionId, baseFieldId);
      const nextInstance = (repeatInstanceCounters.get(key) || 1) + 1;
      repeatInstanceCounters.set(key, nextInstance);
      return nextInstance;
    }

    /*
      CHRONOLOGICAL TIME ENGINE
      -------------------------
      DOM order is the narrative order. The earliest selected timed event starts
      at 00:00. Automatic times inherit the nearest preceding value; a user edit
      creates a manual anchor that survives field and section reordering.
    */
    function getChronologicalFieldRows() {
      return sortableChildren(form, "section")
        .flatMap((fieldset) => sortableChildren(fieldset, "field"));
    }

    function updateEventTimeHint(timeInput) {
      const modeBadge = timeInput.closest(".event-time-control")?.querySelector(".event-time-mode");

      if (timeInput.disabled) {
        timeInput.title = "Select an event to enable its chronological time.";
      } else if (timeInput.dataset.timeMode === "manual") {
        timeInput.title = timeInput.value
          ? "Manual time anchor. Later inherited event times begin here."
          : "Time intentionally left blank. Later inherited events use the last available time.";
      } else {
        timeInput.title = "Inherited from the preceding chronological event. Edit it to create a manual time anchor.";
      }

      if (modeBadge) {
        const mode = timeInput.disabled ? "off" : timeInput.dataset.timeMode || "auto";
        modeBadge.dataset.mode = mode;
        modeBadge.textContent = mode === "manual" ? "MANUAL" : mode === "auto" ? "AUTO" : "—";
      }
    }

    function synchronizeChronologicalEventTimes() {
      let inheritedTime = "00:00";

      getChronologicalFieldRows().forEach((wrapper) => {
        const timeInput = wrapper.querySelector(".event-time");

        if (!timeInput) {
          return;
        }

        const select = wrapper.querySelector("select");
        const isSelectedEvent = Boolean(select && select.value && !select.disabled);
        timeInput.disabled = !isSelectedEvent;

        if (!isSelectedEvent) {
          timeInput.value = "";
          delete timeInput.dataset.timeMode;
          delete timeInput.dataset.lastManualValue;
          updateEventTimeHint(timeInput);
          return;
        }

        if (timeInput.dataset.timeMode === "manual") {
          if (timeInput.value) {
            inheritedTime = timeInput.value;
          }
        } else {
          timeInput.dataset.timeMode = "auto";
          timeInput.value = inheritedTime;
        }

        updateEventTimeHint(timeInput);
      });
    }

    function markRepeatedFieldDirty(wrapper) {
      if (wrapper.dataset.repeatInstance === "true") {
        wrapper.dataset.repeatDirty = "true";
      }
    }

    function removeRepeatedField(wrapper) {
      if (wrapper.dataset.repeatInstance !== "true") {
        return;
      }

      if (wrapper.dataset.repeatGroup) {
        removeRepeatedFieldGroup(wrapper);
        return;
      }

      const fieldLabel = wrapper.querySelector(":scope > label")?.textContent || "input";
      const isDirty = wrapper.dataset.repeatDirty === "true";

      if (isDirty && !window.confirm(`Remove ${fieldLabel}? This input has been edited.`)) {
        return;
      }

      const hadContent = Boolean(
        wrapper.querySelector("select")?.value || wrapper.querySelector(".event-time")?.value
      );
      const workingRecord = getWorkingField(wrapper.dataset.fieldId);

      if (workingRecord) {
        workingRecord.section.fields = workingRecord.section.fields.filter(
          (field) => field.instanceId !== wrapper.dataset.fieldId
        );
      }

      wrapper.remove();
      markWorkingTemplateDirty();
      const logicMessage = updateConditionalLogic();

      if (hadContent || logicMessage) {
        handleSelectionChange(logicMessage);
      } else {
        updateStatus(`${fieldLabel} removed.`);
      }
    }

    function removeRepeatedFieldGroup(wrapper) {
      const fieldset = wrapper.closest("fieldset[data-section-id]");
      const section = getWorkingSection(fieldset?.dataset.sectionId);
      const repeatGroup = wrapper.dataset.repeatGroup;
      const instanceNumber = Number.parseInt(wrapper.dataset.instanceNumber, 10) || 1;
      const groupWrappers = Array.from(fieldset?.querySelectorAll(`.field[data-repeat-group="${repeatGroup}"]`) || [])
        .filter((candidate) => Number.parseInt(candidate.dataset.instanceNumber, 10) === instanceNumber);
      const groupIsDirty = groupWrappers.some((candidate) => candidate.dataset.repeatDirty === "true");

      if (!section || instanceNumber <= 1 || groupWrappers.length === 0) {
        return;
      }

      if (groupIsDirty && !window.confirm(`Remove Force Incident ${instanceNumber}? One or more linked fields have been edited.`)) {
        return;
      }

      const removedIds = new Set(groupWrappers.map((candidate) => candidate.dataset.fieldId));
      const hadContent = groupWrappers.some(
        (candidate) => candidate.querySelector("select")?.value || candidate.querySelector(".event-time")?.value
      );
      section.fields = section.fields.filter((field) => !removedIds.has(field.instanceId));
      groupWrappers.forEach((candidate) => candidate.remove());
      markWorkingTemplateDirty();
      const logicMessage = updateConditionalLogic();

      if (hadContent || logicMessage) {
        handleSelectionChange(logicMessage);
      } else {
        updateStatus(`Force Incident ${instanceNumber} removed.`);
      }
    }

    /*
      FORM RENDERING
      --------------
      Rows are created with DOM methods (not innerHTML) so template labels and
      sentence data remain text. Every row owns its listeners, repeat controls,
      optional time control, and stable instance ID used by state restoration.
    */
    function createFieldRow(section, field) {
      const fieldId = field.instanceId;
      const baseFieldId = field.baseFieldId;
      const repeated = field.instanceNumber > 1 || fieldId !== baseFieldId;
      const displayLabel = getFieldDisplayLabel(field);
      const wrapper = document.createElement("div");
      wrapper.className = "field";
      wrapper.dataset.fieldId = fieldId;
      wrapper.dataset.baseFieldId = baseFieldId;
      wrapper.dataset.instanceNumber = String(field.instanceNumber || 1);
      wrapper.dataset.repeatGroup = field.repeatGroup || "";
      wrapper.dataset.repeatInstance = repeated ? "true" : "false";
      wrapper.dataset.repeatDirty = "false";

      const fieldHandle = document.createElement("button");
      fieldHandle.type = "button";
      fieldHandle.className = "drag-handle field-drag-handle";
      fieldHandle.setAttribute("aria-label", `Reorder ${displayLabel} event`);
      fieldHandle.textContent = "⠿";
      fieldHandle.hidden = !moduleConfig.canComposeNarrative;

      const label = document.createElement("label");
      label.htmlFor = fieldId;
      label.textContent = displayLabel;

      const select = document.createElement("select");
      select.id = fieldId;
      select.name = fieldId;
      select.dataset.sectionId = section.id;
      select.dataset.baseFieldId = baseFieldId;

      field.options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.id;
        optionElement.textContent = option.label;
        optionElement.dataset.text = option.text || "";
        optionElement.dataset.valueText = option.valueText || "";
        optionElement.dataset.incidentReason = option.incidentReason || "";
        select.appendChild(optionElement);
      });

      if (field.defaultValue && Array.from(select.options).some((option) => option.value === field.defaultValue)) {
        select.value = field.defaultValue;
      }

      const usesEventTime = field.hasEventTime === true ||
        (field.hasEventTime !== false && section.hasEventTimes === true);
      let timeInput = null;
      wrapper.append(fieldHandle, label, select);

      if (usesEventTime) {
        wrapper.classList.add("has-time");

        const timeControl = document.createElement("div");
        timeControl.className = "event-time-control";

        const timeLabel = document.createElement("label");
        timeLabel.htmlFor = `${fieldId}_time`;
        timeLabel.textContent = "Event time";

        const timeMode = document.createElement("span");
        timeMode.className = "event-time-mode";
        timeMode.dataset.mode = "off";
        timeMode.textContent = "—";

        const timeHeading = document.createElement("div");
        timeHeading.className = "event-time-heading";
        timeHeading.append(timeLabel, timeMode);

        timeInput = document.createElement("input");
        timeInput.id = `${fieldId}_time`;
        timeInput.name = `${fieldId}_time`;
        timeInput.type = "time";
        timeInput.step = "60";
        timeInput.className = "event-time";
        timeInput.disabled = true;
        updateEventTimeHint(timeInput);
        timeInput.setAttribute("aria-label", `${displayLabel} time`);
        const handleTimeEdit = () => {
          if (
            timeInput.dataset.timeMode === "manual" &&
            timeInput.dataset.lastManualValue === timeInput.value
          ) {
            return;
          }

          markRepeatedFieldDirty(wrapper);
          timeInput.dataset.timeMode = "manual";
          timeInput.dataset.lastManualValue = timeInput.value;
          synchronizeChronologicalEventTimes();
          handleSelectionChange();
          refreshTokenDisplays({ autoBind: true });
        };

        timeInput.addEventListener("input", handleTimeEdit);
        timeInput.addEventListener("change", handleTimeEdit);

        timeControl.append(timeHeading, timeInput);
        wrapper.appendChild(timeControl);
      }

      const repeatActions = document.createElement("div");
      repeatActions.className = "field-repeat-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "field-repeat-button field-edit-button";
      editButton.textContent = "✎";
      editButton.title = `Edit ${displayLabel} wording and variables`;
      editButton.setAttribute("aria-label", `Edit ${displayLabel} wording and variables`);
      editButton.hidden = !moduleConfig.canEditTemplates;
      editButton.addEventListener("click", () => openElementEditor(wrapper));
      repeatActions.appendChild(editButton);

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "field-repeat-button field-add-button";
      addButton.textContent = "+";
      addButton.title = `Add another ${field.label} input`;
      addButton.setAttribute("aria-label", `Add another ${field.label} input`);
      addButton.hidden = !moduleConfig.canComposeNarrative;
      addButton.addEventListener("click", () => duplicateFieldRow(wrapper));
      repeatActions.appendChild(addButton);

      if (repeated) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "field-repeat-button field-remove-button";
        removeButton.textContent = "−";
        removeButton.title = `Remove ${displayLabel}`;
        removeButton.setAttribute("aria-label", `Remove ${displayLabel}`);
        removeButton.hidden = !moduleConfig.canComposeNarrative;
        removeButton.addEventListener("click", () => removeRepeatedField(wrapper));
        repeatActions.appendChild(removeButton);
      }

      wrapper.appendChild(repeatActions);
      repeatActions.hidden = !Array.from(repeatActions.querySelectorAll("button"))
        .some((button) => !button.hidden);
      select.addEventListener("change", () => {
        markRepeatedFieldDirty(wrapper);

        if (timeInput) {
          if (select.value === "") {
            timeInput.value = "";
            delete timeInput.dataset.timeMode;
            delete timeInput.dataset.lastManualValue;
          }
        }

        const logicMessage = updateConditionalLogic();
        handleSelectionChange(logicMessage);
      });

      setupSortableHandle(fieldHandle, wrapper, "field");
      return wrapper;
    }

    function duplicateFieldRow(sourceWrapper) {
      const fieldset = sourceWrapper.closest("fieldset[data-section-id]");
      const section = getWorkingSection(fieldset?.dataset.sectionId);
      const sourceField = section?.fields.find(
        (candidate) => candidate.instanceId === sourceWrapper.dataset.fieldId
      );

      if (!fieldset || !section || !sourceField) {
        updateStatus("This input could not be duplicated.");
        return;
      }

      if (sourceField.repeatGroup) {
        duplicateFieldGroup(fieldset, section, sourceField);
        return;
      }

      const instanceNumber = getNextRepeatInstance(section.id, sourceField.baseFieldId);
      const duplicateField = {
        ...cloneTemplateData(sourceField),
        instanceId: `${sourceField.baseFieldId}__repeat_${instanceNumber}`,
        instanceNumber,
        defaultValue: ""
      };
      const sourceIndex = section.fields.indexOf(sourceField);
      section.fields.splice(sourceIndex + 1, 0, duplicateField);
      const duplicate = createFieldRow(section, duplicateField);
      sourceWrapper.insertAdjacentElement("afterend", duplicate);
      markWorkingTemplateDirty();
      updateConditionalLogic();
      duplicate.querySelector("select")?.focus();
      updateStatus(`${duplicateField.label} ${instanceNumber} added.`);
    }

    function duplicateFieldGroup(fieldset, section, sourceField) {
      const repeatGroup = sourceField.repeatGroup;
      const sourceInstance = sourceField.instanceNumber || 1;
      const sourceFields = section.fields.filter(
        (field) => field.repeatGroup === repeatGroup && (field.instanceNumber || 1) === sourceInstance
      );

      if (sourceFields.length === 0) {
        updateStatus("This linked incident group could not be duplicated.");
        return;
      }

      const nextInstance = Math.max(
        1,
        ...section.fields
          .filter((field) => field.repeatGroup === repeatGroup)
          .map((field) => field.instanceNumber || 1)
      ) + 1;
      const duplicates = sourceFields.map((field) => ({
        ...cloneTemplateData(field),
        instanceId: `${field.baseFieldId}__group_${repeatGroup}_${nextInstance}`,
        instanceNumber: nextInstance,
        defaultValue: ""
      }));
      const sourceIndexes = sourceFields.map((field) => section.fields.indexOf(field));
      const insertionIndex = Math.max(...sourceIndexes) + 1;
      section.fields.splice(insertionIndex, 0, ...duplicates);
      const nextField = section.fields[insertionIndex + duplicates.length];
      const nextWrapper = nextField
        ? Array.from(fieldset.querySelectorAll(".field[data-field-id]")).find(
          (candidate) => candidate.dataset.fieldId === nextField.instanceId
        )
        : null;

      duplicates.forEach((field) => {
        fieldset.insertBefore(createFieldRow(section, field), nextWrapper);
      });
      markWorkingTemplateDirty();
      updateConditionalLogic();
      const firstDuplicate = fieldset.querySelector(`[data-field-id="${duplicates[0].instanceId}"] select`);
      firstDuplicate?.focus();
      updateStatus(`Force Incident ${nextInstance} added as a linked subject/conduct/result group.`);
    }

    function renderForm() {
      form.replaceChildren();
      repeatInstanceCounters.clear();

      NARRATIVE_SECTIONS.forEach((section) => {
        const fieldset = document.createElement("fieldset");
        fieldset.dataset.sectionId = section.id;
        fieldset.dataset.sectionTitle = sectionName(section.title);

        const legend = document.createElement("legend");
        const sectionHandle = document.createElement("button");
        sectionHandle.type = "button";
        sectionHandle.className = "drag-handle section-drag-handle";
        sectionHandle.setAttribute("aria-label", `Reorder ${sectionName(section.title)} category`);
        sectionHandle.textContent = "⠿";

        const legendTitle = document.createElement("span");
        legendTitle.className = "section-title";
        legendTitle.textContent = section.title;

        legend.append(sectionHandle, legendTitle);
        fieldset.appendChild(legend);
        setupSortableHandle(sectionHandle, fieldset, "section");

        const description = document.createElement("p");
        description.className = "section-description";
        description.textContent = section.description;
        fieldset.appendChild(description);

        section.fields.forEach((field) => {
          const counterKey = getRepeatCounterKey(section.id, field.baseFieldId);
          repeatInstanceCounters.set(
            counterKey,
            Math.max(repeatInstanceCounters.get(counterKey) || 1, field.instanceNumber || 1)
          );
          fieldset.appendChild(createFieldRow(section, field));
        });

        form.appendChild(fieldset);
      });

      updateSectionNumbers();
      applyModuleConfigurationToUi();
    }

    function createLocalId(prefix = "template") {
      if (window.crypto?.randomUUID) {
        return `${prefix}_${window.crypto.randomUUID()}`;
      }

      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function findFieldInSections(sections, instanceId) {
      for (const section of sections || []) {
        const field = section.fields?.find((candidate) => candidate.instanceId === instanceId);

        if (field) {
          return { section, field };
        }
      }

      return null;
    }

    function normalizeTokenSlotId(value) {
      return String(value || "")
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
        .slice(0, 80);
    }

    function normalizeRoleSelector(rawSelector) {
      if (!rawSelector || typeof rawSelector !== "object") {
        return null;
      }

      const rawRoles = Array.isArray(rawSelector.roles)
        ? rawSelector.roles
        : [rawSelector.role];
      const roles = [...new Set(rawRoles.map(toCanonicalFieldKey).filter(Boolean))].slice(0, 12);
      const rawTypes = Array.isArray(rawSelector.types)
        ? rawSelector.types
        : rawSelector.type
          ? [rawSelector.type]
          : [];
      const types = [...new Set(rawTypes.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
      const requestedOrdinal = Number.parseInt(rawSelector.ordinal, 10);
      const ordinal = Number.isFinite(requestedOrdinal) && requestedOrdinal > 0
        ? Math.min(requestedOrdinal, 999)
        : null;

      return roles.length || types.length || ordinal
        ? { roles, types, ordinal }
        : null;
    }

    function normalizeTemplateTokenRules(rawRules) {
      if (!rawRules || typeof rawRules !== "object" || Array.isArray(rawRules)) {
        return {};
      }

      const normalized = {};
      Object.entries(rawRules).slice(0, 200).forEach(([rawSlotId, rawRule]) => {
        const slotId = normalizeTokenSlotId(rawSlotId);

        if (!slotId || !rawRule || typeof rawRule !== "object") {
          return;
        }

        const category = VARIABLE_TYPE_CONFIG[rawRule.category] ? rawRule.category : "";
        const selector = normalizeRoleSelector(rawRule.selector || rawRule.roleSelector);
        const fieldKey = toCanonicalFieldKey(rawRule.fieldKey || rawRule.field);

        if (category || selector || fieldKey) {
          normalized[slotId] = {
            ...(category ? { category } : {}),
            ...(selector ? { selector } : {}),
            ...(fieldKey ? { fieldKey } : {})
          };
        }
      });
      return normalized;
    }

    function getTemplateTokenRule(meta) {
      const record = getWorkingField(meta?.sourceFieldId);
      return record?.field?.tokenRules?.[meta?.slotId] || null;
    }

    function setTemplateTokenRule(meta, rulePatch) {
      const record = getWorkingField(meta?.sourceFieldId);

      if (!record || !meta?.slotId) {
        return false;
      }

      const targetFields = record.field.repeatGroup
        ? record.section.fields.filter((field) =>
          field.repeatGroup === record.field.repeatGroup &&
          (field.instanceNumber || 1) === (record.field.instanceNumber || 1)
        )
        : [record.field];

      targetFields.forEach((targetField) => {
        targetField.tokenRules ||= {};
        const mergedRule = {
          ...(targetField.tokenRules[meta.slotId] || {}),
          ...rulePatch
        };
        Object.keys(mergedRule).forEach((key) => {
          if (mergedRule[key] === null || mergedRule[key] === undefined || mergedRule[key] === "") {
            delete mergedRule[key];
          }
        });
        const nextRule = normalizeTemplateTokenRules({ [meta.slotId]: mergedRule })[meta.slotId];

        if (nextRule) {
          targetField.tokenRules[meta.slotId] = nextRule;
        } else {
          delete targetField.tokenRules[meta.slotId];
        }
      });

      markWorkingTemplateDirty();
      return true;
    }

    /*
      TEMPLATE TRUST BOUNDARY
      -----------------------
      Imported or host-provided templates are projected onto the Master schema.
      Unknown sections, fields, and option IDs are discarded; editable strings
      are length-limited. This keeps template JSON declarative and non-executable.
    */
    function normalizeWorkingTemplateSections(rawSections) {
      if (!Array.isArray(rawSections)) {
        throw new Error("Template sections are missing or invalid.");
      }

      const usedSectionIds = new Set();
      const usedInstanceIds = new Set();
      const normalizedSections = [];

      rawSections.forEach((rawSection) => {
        const masterSection = getMasterSection(String(rawSection?.id || ""));

        if (!masterSection || usedSectionIds.has(masterSection.id)) {
          return;
        }

        usedSectionIds.add(masterSection.id);
        const normalizedSection = {
          ...cloneTemplateData(masterSection),
          fields: []
        };

        (Array.isArray(rawSection.fields) ? rawSection.fields : []).forEach((rawField) => {
          const baseFieldId = String(rawField?.baseFieldId || rawField?.id || "");
          const masterField = masterSection.fields.find((field) => field.id === baseFieldId);

          if (!masterField) {
            return;
          }

          const requestedNumber = Number.parseInt(rawField?.instanceNumber, 10);
          const instanceNumber = Number.isFinite(requestedNumber) && requestedNumber > 0
            ? requestedNumber
            : 1;
          let instanceId = String(rawField.instanceId || (instanceNumber > 1
            ? `${baseFieldId}__repeat_${instanceNumber}`
            : baseFieldId));

          if (!instanceId || usedInstanceIds.has(instanceId)) {
            instanceId = `${baseFieldId}__instance_${createLocalId("field")}`;
          }

          usedInstanceIds.add(instanceId);
          const rawOptions = Array.isArray(rawField?.options) ? rawField.options : [];
          const options = masterField.options.map((masterOption) => {
            const override = rawOptions.find((option) => String(option?.id ?? "") === masterOption.id);
            return {
              ...cloneTemplateData(masterOption),
              label: typeof override?.label === "string" ? override.label.slice(0, 160) : masterOption.label,
              text: typeof override?.text === "string" ? override.text.slice(0, 4000) : masterOption.text || "",
              valueText: typeof override?.valueText === "string"
                ? override.valueText.slice(0, 4000)
                : masterOption.valueText || "",
              incidentReason: typeof override?.incidentReason === "string"
                ? override.incidentReason.slice(0, 4000)
                : masterOption.incidentReason || ""
            };
          });
          const defaultValue = typeof rawField?.defaultValue === "string" &&
            options.some((option) => option.id === rawField.defaultValue)
            ? rawField.defaultValue
            : "";

          normalizedSection.fields.push({
            ...cloneTemplateData(masterField),
            label: typeof rawField?.label === "string" && rawField.label.trim()
              ? rawField.label.trim().slice(0, 120)
              : masterField.label,
            options,
            baseFieldId,
            instanceId,
            instanceNumber,
            defaultValue,
            hasEventTime: typeof rawField?.hasEventTime === "boolean"
              ? rawField.hasEventTime
              : typeof masterField.hasEventTime === "boolean"
                ? masterField.hasEventTime
                : null,
            tokenRules: normalizeTemplateTokenRules(rawField?.tokenRules)
          });
        });

        normalizedSections.push(normalizedSection);
      });

      MASTER_NARRATIVE_SECTIONS.forEach((masterSection) => {
        if (!usedSectionIds.has(masterSection.id)) {
          normalizedSections.push({
            ...cloneTemplateData(masterSection),
            fields: []
          });
        }
      });

      return normalizedSections;
    }

    function normalizeSavedTemplate(record) {
      if (!record || typeof record !== "object") {
        throw new Error("Template record is invalid.");
      }

      if (record.schema && record.schema !== TEMPLATE_SCHEMA && !LEGACY_SCHEMAS.template.includes(record.schema)) {
        throw new Error(`Unsupported narrative template schema: ${record.schema}`);
      }

      const name = String(record.name || "").trim();

      if (!name) {
        throw new Error("Template name is required.");
      }

      const sections = normalizeWorkingTemplateSections(record.sections);

      for (const section of sections) {
        for (const field of section.fields) {
          const validationMessage = validateElementField(field);

          if (validationMessage) {
            throw new Error(`${getFieldDisplayLabel(field)}: ${validationMessage}`);
          }
        }
      }

      return {
        schema: TEMPLATE_SCHEMA,
        id: String(record.id || createLocalId()),
        name: name.slice(0, 80),
        description: String(record.description || "").trim().slice(0, 180),
        includeDefaults: Boolean(record.includeDefaults),
        sourceMasterBuild: Number.parseInt(record.sourceMasterBuild ?? record.masterBuild, 10) || MODULE_BUILD,
        masterBuild: MODULE_BUILD,
        migratedAt: Number.parseInt(record.sourceMasterBuild ?? record.masterBuild, 10) &&
          Number.parseInt(record.sourceMasterBuild ?? record.masterBuild, 10) !== MODULE_BUILD
          ? new Date().toISOString()
          : String(record.migratedAt || ""),
        createdAt: String(record.createdAt || new Date().toISOString()),
        updatedAt: String(record.updatedAt || new Date().toISOString()),
        sections
      };
    }

    /* The engine owns editing and normalization; the repository owns durable templates. */
    function templateRepository() {
      const repositories = window.COPDoc && window.COPDoc.repositories;
      if (!repositories || typeof repositories.createNarrativeTemplates !== "function") return null;
      return repositories.templateLibrary(normalizeSavedTemplate);
    }

    function loadSavedTemplatesFromStorage() {
      const repository = moduleConfig.enableLocalStorage && templateRepository();
      const result = repository ? repository.load() : { ok: false, records: [] };
      savedTemplates = result.records;
      templateStorageAvailable = result.ok;
    }

    function persistSavedTemplates() {
      const repository = moduleConfig.enableLocalStorage && templateRepository();
      const result = repository ? repository.save(savedTemplates) : { ok: false };
      templateStorageAvailable = result.ok;
      return result.ok;
    }

    function getSavedTemplate(templateId) {
      return savedTemplates.find((template) => template.id === templateId) || null;
    }

    function updateActiveTemplateStatus() {
      const activeTemplate = getSavedTemplate(activeTemplateId);
      const displayName = activeTemplate?.name || activeTemplateName || "Master";
      activeTemplateStatus.textContent = displayName;
      activeTemplateStatus.classList.toggle("dirty", workingTemplateDirty);
      activeTemplateStatus.title = workingTemplateDirty
        ? `${displayName} has unsaved template changes.`
        : `Active template: ${displayName}`;
    }

    function setTemplateModalStatus(message = "", type = "") {
      templateModalStatus.textContent = message;
      templateModalStatus.className = `modal-status${type ? ` ${type}` : ""}`;
    }

    function setElementEditorStatus(message = "", type = "") {
      elementEditorStatus.textContent = message;
      elementEditorStatus.className = `modal-status${type ? ` ${type}` : ""}`;
    }

    function captureWorkingTemplateSections(includeDefaults = false, useCurrentSelections = true) {
      syncWorkingTemplateOrderFromDom();
      const sections = cloneTemplateData(NARRATIVE_SECTIONS);

      sections.forEach((section) => {
        section.fields.forEach((field) => {
          const select = document.getElementById(field.instanceId);
          field.defaultValue = includeDefaults
            ? useCurrentSelections && select
              ? select.value
              : field.defaultValue || ""
            : "";
        });
      });

      return sections;
    }

    function clearEncounterStateForTemplateChange() {
      tokenBindings.clear();
      tokenTypeOverrides.clear();
      draft.replaceChildren();
      resolvedDraft.value = "";
      manualEdits = false;
      selectionsPending = false;
      templateRevision += 1;
      resolvedFromRevision = -1;
      resolvedManualEdits = false;
      resolvedPending = false;
    }

    function applyWorkingTemplate(sections, options = {}) {
      const {
        templateId = "master",
        savedSnapshot = sections,
        statusMessage = "Template loaded."
      } = options;

      NARRATIVE_SECTIONS = normalizeWorkingTemplateSections(sections);
      activeTemplateId = templateId;
      activeTemplateName = String(
        options.templateName || getSavedTemplate(templateId)?.name || (templateId === "master" ? "Master" : "Working template")
      );
      activeTemplateSourceMasterBuild = Number.parseInt(
        options.sourceMasterBuild ?? getSavedTemplate(templateId)?.sourceMasterBuild,
        10
      ) || MODULE_BUILD;
      activeTemplateSnapshot = cloneTemplateData(savedSnapshot);
      workingTemplateDirty = false;
      clearEncounterStateForTemplateChange();
      renderForm();
      updateConditionalLogic();
      replaceDraftWithSelections();
      setViewMode(viewMode);
      updateActiveTemplateStatus();
      populateMasterElementSelect();
      updateStatus(statusMessage);
      emitTemplateChange("template-loaded");
    }

    function shouldConfirmTemplateReplacement() {
      return workingTemplateDirty || countSelections() > 0 || getPlainNarrative("template") !== "";
    }

    function confirmTemplateReplacement(actionLabel) {
      return !shouldConfirmTemplateReplacement() || window.confirm(
        `${actionLabel} will replace the working layout and clear current encounter selections and narrative text. Continue?`
      );
    }

    function populateTemplateLibrary(selectedId = "") {
      templateLibrarySelect.replaceChildren();

      if (savedTemplates.length === 0) {
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "No saved templates";
        emptyOption.disabled = true;
        templateLibrarySelect.appendChild(emptyOption);
      } else {
        savedTemplates
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((template) => {
            const option = document.createElement("option");
            option.value = template.id;
            option.textContent = `${template.name}${template.includeDefaults ? " · defaults" : ""}`;
            templateLibrarySelect.appendChild(option);
          });
      }

      const preferredId = selectedId || (getSavedTemplate(activeTemplateId) ? activeTemplateId : savedTemplates[0]?.id || "");
      templateLibrarySelect.value = preferredId;
      populateTemplateFormFromSelection();
    }

    function populateTemplateFormFromSelection() {
      const selected = getSavedTemplate(templateLibrarySelect.value);

      if (selected) {
        templateNameInput.value = selected.name;
        templateDescriptionInput.value = selected.description;
        templateDefaultsCheckbox.checked = selected.includeDefaults;
      } else if (!templateNameInput.value) {
        templateNameInput.value = "";
        templateDescriptionInput.value = "";
        templateDefaultsCheckbox.checked = false;
      }

      const hasSelection = Boolean(selected);
      updateTemplateButton.disabled = !hasSelection;
      loadTemplateButton.disabled = !hasSelection;
      deleteTemplateButton.disabled = !hasSelection;
      exportTemplateButton.disabled = !hasSelection;
    }

    function populateMasterElementSelect() {
      const currentValue = masterElementSelect.value;
      masterElementSelect.replaceChildren();

      MASTER_NARRATIVE_SECTIONS.forEach((section) => {
        const group = document.createElement("optgroup");
        group.label = sectionName(section.title);

        section.fields.forEach((field) => {
          const option = document.createElement("option");
          option.value = `${section.id}::${field.id}`;
          const existingCount = getWorkingSection(section.id)?.fields.filter(
            (candidate) => candidate.baseFieldId === field.id
          ).length || 0;
          option.textContent = `${field.label}${existingCount ? ` · ${existingCount} present` : " · missing"}`;
          group.appendChild(option);
        });

        masterElementSelect.appendChild(group);
      });

      if (Array.from(masterElementSelect.options).some((option) => option.value === currentValue)) {
        masterElementSelect.value = currentValue;
      }
    }

    function openTemplateManager(returnFocus = templateManagerButton) {
      templateDialogReturnFocus = returnFocus;
      populateTemplateLibrary();
      populateMasterElementSelect();
      setTemplateModalStatus(templateStorageAvailable
        ? "Saved templates are available in this browser. Export JSON for backup."
        : "Browser storage is unavailable in this file context. Templates remain available until this page closes; export JSON to keep them.");
      templateModal.hidden = false;
      window.setTimeout(() => templateNameInput.focus(), 0);
    }

    function closeTemplateManager() {
      templateModal.hidden = true;
      templateDialogReturnFocus?.focus?.();
      templateDialogReturnFocus = null;
    }

    function buildTemplateRecord(id, existingCreatedAt = "") {
      const name = templateNameInput.value.trim();

      if (!name) {
        throw new Error("Enter a template name.");
      }

      const includeDefaults = templateDefaultsCheckbox.checked;
      return normalizeSavedTemplate({
        id,
        name,
        description: templateDescriptionInput.value,
        includeDefaults,
        sourceMasterBuild: getSavedTemplate(id)?.sourceMasterBuild || activeTemplateSourceMasterBuild || MODULE_BUILD,
        masterBuild: MODULE_BUILD,
        createdAt: existingCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: captureWorkingTemplateSections(includeDefaults)
      });
    }

    function finishTemplateSave(template, message) {
      activeTemplateId = template.id;
      activeTemplateName = template.name;
      activeTemplateSourceMasterBuild = template.sourceMasterBuild || MODULE_BUILD;
      activeTemplateSnapshot = cloneTemplateData(template.sections);
      workingTemplateDirty = false;
      persistSavedTemplates();
      populateTemplateLibrary(template.id);
      updateActiveTemplateStatus();
      setTemplateModalStatus(
        templateStorageAvailable ? message : `${message} Browser storage is unavailable; export JSON before closing this page.`,
        "success"
      );
      updateStatus(message);
      emitTemplateChange("template-saved");
    }

    function saveTemplateAsNew() {
      try {
        const requestedName = templateNameInput.value.trim().toLocaleLowerCase();

        if (savedTemplates.some((template) => template.name.toLocaleLowerCase() === requestedName)) {
          throw new Error("A template with that name already exists. Rename it or update the existing template.");
        }

        const template = buildTemplateRecord(createLocalId());
        savedTemplates.push(template);
        finishTemplateSave(template, `Template “${template.name}” saved.`);
      } catch (error) {
        setTemplateModalStatus(error.message, "error");
      }
    }

    function updateSelectedTemplate() {
      const existing = getSavedTemplate(templateLibrarySelect.value);

      if (!existing) {
        setTemplateModalStatus("Select a saved template to update.", "error");
        return;
      }

      try {
        const template = buildTemplateRecord(existing.id, existing.createdAt);
        const duplicateName = savedTemplates.find(
          (candidate) => candidate.id !== existing.id && candidate.name.toLocaleLowerCase() === template.name.toLocaleLowerCase()
        );

        if (duplicateName) {
          throw new Error("Another template already uses that name.");
        }

        savedTemplates = savedTemplates.map((candidate) => candidate.id === existing.id ? template : candidate);
        finishTemplateSave(template, `Template “${template.name}” updated.`);
      } catch (error) {
        setTemplateModalStatus(error.message, "error");
      }
    }

    function saveActiveTemplate() {
      const active = getSavedTemplate(activeTemplateId);

      if (!active) {
        openTemplateManager(saveTemplateButton);
        templateLibrarySelect.value = "";
        templateNameInput.value = "";
        templateDescriptionInput.value = "";
        templateDefaultsCheckbox.checked = false;
        updateTemplateButton.disabled = true;
        loadTemplateButton.disabled = true;
        deleteTemplateButton.disabled = true;
        exportTemplateButton.disabled = true;
        setTemplateModalStatus("Name the working layout to save it as a reusable template.");
        return;
      }

      const includeDefaults = active.includeDefaults;
      const updated = normalizeSavedTemplate({
        ...active,
        updatedAt: new Date().toISOString(),
        sections: captureWorkingTemplateSections(includeDefaults)
      });
      savedTemplates = savedTemplates.map((candidate) => candidate.id === active.id ? updated : candidate);
      activeTemplateSnapshot = cloneTemplateData(updated.sections);
      workingTemplateDirty = false;
      persistSavedTemplates();
      updateActiveTemplateStatus();
      updateStatus(templateStorageAvailable
        ? `Template “${updated.name}” updated.`
        : `Template “${updated.name}” updated in memory. Export JSON before closing this page.`);
      emitTemplateChange("template-saved");
    }

    function loadSelectedTemplate() {
      const selected = getSavedTemplate(templateLibrarySelect.value);

      if (!selected) {
        setTemplateModalStatus("Select a saved template to load.", "error");
        return;
      }

      if (!confirmTemplateReplacement(`Load “${selected.name}”`)) {
        return;
      }

      applyWorkingTemplate(selected.sections, {
        templateId: selected.id,
        sourceMasterBuild: selected.sourceMasterBuild,
        savedSnapshot: selected.sections,
        statusMessage: `Template “${selected.name}” loaded.`
      });
      closeTemplateManager();
    }

    function deleteSelectedTemplate() {
      const selected = getSavedTemplate(templateLibrarySelect.value);

      if (!selected || !window.confirm(`Delete saved template “${selected.name}”?`)) {
        return;
      }

      savedTemplates = savedTemplates.filter((template) => template.id !== selected.id);

      if (activeTemplateId === selected.id) {
        activeTemplateId = "master";
        activeTemplateName = "Master";
        activeTemplateSourceMasterBuild = MODULE_BUILD;
        activeTemplateSnapshot = cloneTemplateData(createWorkingTemplateFromMaster());
        workingTemplateDirty = true;
      }

      persistSavedTemplates();
      populateTemplateLibrary();
      updateActiveTemplateStatus();
      setTemplateModalStatus(`Template “${selected.name}” deleted.`, "success");
      emitTemplateChange("template-deleted");
    }

    function downloadJsonFile(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function exportSelectedTemplate() {
      const selected = getSavedTemplate(templateLibrarySelect.value);

      if (!selected) {
        setTemplateModalStatus("Select a saved template to export.", "error");
        return;
      }

      const safeName = selected.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "Narrative_Template";
      downloadJsonFile(`${safeName}.opdoc-template.json`, {
        schema: "opdoc.narrative-template-export.v1",
        exportedAt: new Date().toISOString(),
        template: selected
      });
      setTemplateModalStatus(`Template “${selected.name}” exported.`, "success");
    }

    async function importTemplateFile(file) {
      try {
        const payload = JSON.parse(await file.text());
        const imported = normalizeSavedTemplate(payload.template || payload);
        const existingIndex = savedTemplates.findIndex((template) => template.id === imported.id);

        if (existingIndex >= 0) {
          if (!window.confirm(`Replace saved template “${savedTemplates[existingIndex].name}” with the imported copy?`)) {
            return;
          }

          savedTemplates[existingIndex] = imported;
        } else {
          const nameExists = savedTemplates.some(
            (template) => template.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase()
          );
          imported.id = createLocalId();
          imported.name = nameExists ? `${imported.name} (Imported)` : imported.name;
          savedTemplates.push(imported);
        }

        persistSavedTemplates();
        populateTemplateLibrary(imported.id);
        setTemplateModalStatus(`Template “${imported.name}” imported.`, "success");
        emitTemplateChange("template-imported");
      } catch (error) {
        setTemplateModalStatus(`Template not imported: ${error.message}`, "error");
      }
    }

    function addSelectedMasterElement() {
      const [sectionId, baseFieldId] = masterElementSelect.value.split("::");
      const section = getWorkingSection(sectionId);
      const masterRecord = getMasterField(baseFieldId);
      const fieldset = Array.from(form.querySelectorAll("fieldset[data-section-id]")).find(
        (candidate) => candidate.dataset.sectionId === sectionId
      );

      if (!section || !masterRecord || !fieldset) {
        setTemplateModalStatus("That master element could not be added.", "error");
        return;
      }

      const existingFields = section.fields.filter((field) => field.baseFieldId === baseFieldId);
      const originalPresent = existingFields.some(
        (field) => field.instanceId === baseFieldId || field.instanceNumber === 1
      );
      const instanceNumber = originalPresent ? getNextRepeatInstance(sectionId, baseFieldId) : 1;
      const field = {
        ...cloneTemplateData(masterRecord.field),
        baseFieldId,
        instanceId: instanceNumber > 1 ? `${baseFieldId}__repeat_${instanceNumber}` : baseFieldId,
        instanceNumber,
        defaultValue: "",
        tokenRules: {}
      };
      const masterOrder = masterRecord.section.fields.findIndex((candidate) => candidate.id === baseFieldId);
      let insertIndex = section.fields.length;

      if (!originalPresent && existingFields.length) {
        insertIndex = section.fields.indexOf(existingFields[0]);
      } else if (existingFields.length) {
        insertIndex = section.fields.lastIndexOf(existingFields.at(-1)) + 1;
      } else {
        const nextExistingIndex = section.fields.findIndex((candidate) => {
          const candidateOrder = masterRecord.section.fields.findIndex(
            (masterField) => masterField.id === candidate.baseFieldId
          );
          return candidateOrder > masterOrder;
        });
        insertIndex = nextExistingIndex >= 0 ? nextExistingIndex : section.fields.length;
      }

      section.fields.splice(insertIndex, 0, field);
      const wrapper = createFieldRow(section, field);
      const nextField = section.fields[insertIndex + 1];
      const nextWrapper = nextField
        ? Array.from(fieldset.querySelectorAll(".field[data-field-id]")).find(
          (candidate) => candidate.dataset.fieldId === nextField.instanceId
        )
        : null;
      fieldset.insertBefore(wrapper, nextWrapper);
      markWorkingTemplateDirty();
      updateConditionalLogic();
      populateMasterElementSelect();
      setTemplateModalStatus(`${getFieldDisplayLabel(field)} added to the working layout.`, "success");
    }

    function restoreMasterLayout() {
      if (!confirmTemplateReplacement("Restore the entire Master layout")) {
        return;
      }

      const masterWorking = createWorkingTemplateFromMaster();
      applyWorkingTemplate(masterWorking, {
        templateId: "master",
        savedSnapshot: masterWorking,
        statusMessage: "Entire narrative layout restored to Master."
      });
      closeTemplateManager();
    }

    function rebuildSelectOptions(select, field, selectedValue = "") {
      select.replaceChildren();

      field.options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.id;
        optionElement.textContent = option.label;
        optionElement.dataset.text = option.text || "";
        optionElement.dataset.valueText = option.valueText || "";
        optionElement.dataset.incidentReason = option.incidentReason || "";
        select.appendChild(optionElement);
      });

      select.value = Array.from(select.options).some((option) => option.value === selectedValue)
        ? selectedValue
        : "";
    }

    function refreshRenderedFieldFromModel(wrapper, field) {
      const displayLabel = getFieldDisplayLabel(field);
      const label = wrapper.querySelector(":scope > label");
      const select = wrapper.querySelector("select");
      const previousValue = select.value;

      if (label) {
        label.textContent = displayLabel;
      }

      rebuildSelectOptions(select, field, previousValue);
      wrapper.querySelector(".field-drag-handle")?.setAttribute("aria-label", `Reorder ${displayLabel} event`);
      wrapper.querySelector(".field-edit-button")?.setAttribute("aria-label", `Edit ${displayLabel} wording and variables`);
      wrapper.querySelector(".field-edit-button")?.setAttribute("title", `Edit ${displayLabel} wording and variables`);
      wrapper.querySelector(".field-add-button")?.setAttribute("aria-label", `Add another ${field.label} input`);
      wrapper.querySelector(".field-add-button")?.setAttribute("title", `Add another ${field.label} input`);

      const timeInput = wrapper.querySelector(".event-time");

      if (timeInput) {
        timeInput.setAttribute("aria-label", `${displayLabel} time`);

        if (!select.value) {
          timeInput.value = "";
          delete timeInput.dataset.timeMode;
          delete timeInput.dataset.lastManualValue;
        }
      }

      const logicMessage = updateConditionalLogic();
      handleSelectionChange(logicMessage);
    }

    function getElementStagingOption(optionId = elementEditorState?.activeOptionId) {
      return elementEditorState?.field.options.find((option) => option.id === optionId) || null;
    }

    function commitElementEditorInputs() {
      if (!elementEditorState) {
        return;
      }

      elementEditorState.field.label = elementLabelInput.value.trim();
      elementEditorState.field.hasEventTime = elementHasEventTimeCheckbox.checked;
      const option = getElementStagingOption();

      if (option) {
        option.label = elementOptionLabelInput.value.trim();
        option.text = option.id === "" ? "" : elementSentenceInput.value;
        option.valueText = option.id === "" ? "" : elementValueTextInput.value;
        option.incidentReason = option.id === "" ? "" : elementIncidentReasonInput.value;
        const visibleOption = Array.from(elementOptionSelect.options).find(
          (candidate) => candidate.value === option.id
        );

        if (visibleOption && option.label) {
          visibleOption.textContent = option.label;
        }
      }
    }

    function renderElementSentencePreview() {
      elementSentencePreview.replaceChildren();
      const text = elementSentenceInput.value;
      const tokenPattern = /\[([^\[\]\r\n]+)\]/g;
      let lastIndex = 0;
      let match;

      while ((match = tokenPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          elementSentencePreview.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const parsed = parsePlaceholderSpec(match[1]);
        const placeholder = parsed.placeholder;
        const category = inferVariableTypeCategory({ placeholder }, null, null);
        const chip = document.createElement("span");
        chip.className = `editor-variable-chip ${getVariableTypeConfig(category).className}`;
        chip.textContent = `[${placeholder}]`;
        chip.title = `Stable slot: ${parsed.slotId}`;
        elementSentencePreview.appendChild(chip);
        lastIndex = tokenPattern.lastIndex;
      }

      if (lastIndex < text.length) {
        elementSentencePreview.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      if (!text) {
        elementSentencePreview.textContent = "This option does not generate a sentence.";
      }
    }

    function loadElementEditorOption(optionId) {
      const option = getElementStagingOption(optionId);

      if (!option) {
        return;
      }

      elementEditorState.activeOptionId = option.id;
      elementOptionSelect.value = option.id;
      elementOptionLabelInput.value = option.label;
      elementSentenceInput.value = option.text || "";
      elementValueTextInput.value = option.valueText || "";
      elementIncidentReasonInput.value = option.incidentReason || "";
      const isEmptyOption = option.id === "";
      elementSentenceInput.disabled = isEmptyOption;
      elementValueTextInput.disabled = isEmptyOption;
      elementIncidentReasonInput.disabled = isEmptyOption;
      elementVariableSelect.disabled = isEmptyOption;
      insertElementVariableButton.disabled = isEmptyOption;
      renderElementSentencePreview();
    }

    function populateElementEditorOptions(preferredOptionId = "") {
      elementOptionSelect.replaceChildren();
      elementEditorState.field.options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.id;
        optionElement.textContent = option.label || (option.id ? humanizeKey(option.id) : "Not included");
        elementOptionSelect.appendChild(optionElement);
      });

      const optionId = elementEditorState.field.options.some((option) => option.id === preferredOptionId)
        ? preferredOptionId
        : elementEditorState.field.options[0]?.id || "";
      loadElementEditorOption(optionId);
    }

    function populateElementVariablePalette() {
      const placeholders = new Set(Object.keys(PLACEHOLDER_RULES));
      MASTER_NARRATIVE_SECTIONS.forEach((section) => {
        section.fields.forEach((field) => {
          field.options.forEach((option) => {
            [option.text, option.valueText, option.incidentReason].forEach((fragment) => {
              String(fragment || "").match(/\[([^\[\]\r\n]+)\]/g)?.forEach((token) => {
                placeholders.add(parsePlaceholderSpec(token.slice(1, -1)).placeholder);
              });
            });
          });
        });
      });

      elementVariableSelect.replaceChildren();
      Array.from(placeholders).sort().forEach((placeholder) => {
        const option = document.createElement("option");
        const category = inferVariableTypeCategory({ placeholder }, null, null);
        option.value = placeholder;
        option.textContent = `${placeholder} · ${getVariableTypeConfig(category).label}`;
        elementVariableSelect.appendChild(option);
      });
    }

    function validateElementField(field) {
      if (!field.label.trim()) {
        return "Input label cannot be blank.";
      }

      for (const option of field.options) {
        if (!option.label.trim()) {
          return "Dropdown option labels cannot be blank.";
        }

        if (option.id === "") {
          option.text = "";
          continue;
        }

        const slotLabels = new Map();
        const languageFragments = [option.text, option.valueText, option.incidentReason].map((value) => String(value || ""));
        const malformedFragment = languageFragments.find((fragment) => {
          const withoutValidTokens = fragment.replace(/\[[^\[\]\r\n]+\]/g, "");
          return withoutValidTokens.includes("[") || withoutValidTokens.includes("]");
        });

        if (malformedFragment !== undefined) {
          return `Option “${option.label}” contains an unmatched or malformed variable bracket.`;
        }

        const tokenMatches = languageFragments.flatMap((fragment) => [...fragment.matchAll(/\[([^\[\]\r\n]+)\]/g)]);

        if (tokenMatches.length > 100) {
          return `Option “${option.label}” contains too many variables.`;
        }

        for (const tokenMatch of tokenMatches) {
          const rawToken = tokenMatch[1];
          const separatorCount = (rawToken.match(/::/g) || []).length;
          const parsed = parsePlaceholderSpec(rawToken);

          if (!parsed.placeholder || !parsed.slotId || separatorCount > 1 ||
            (separatorCount === 1 && !normalizeTokenSlotId(rawToken.split("::")[1]))) {
            return `Option “${option.label}” contains an invalid variable slot.`;
          }

          const existingLabel = slotLabels.get(parsed.slotId);

          if (existingLabel && existingLabel !== parsed.placeholder) {
            return `Option “${option.label}” assigns slot “${parsed.slotId}” to more than one variable type.`;
          }

          slotLabels.set(parsed.slotId, parsed.placeholder);
        }
      }

      return "";
    }

    /*
      ELEMENT EDITOR
      --------------
      Editing happens against a detached staging clone. Apply validates every
      option and commits atomically; Cancel leaves the working template intact.
      Master reset and saved-template revert use separate reference layers.
    */
    function openElementEditor(wrapper) {
      const workingRecord = getWorkingField(wrapper.dataset.fieldId);

      if (!workingRecord) {
        updateStatus("That narrative element could not be opened.");
        return;
      }

      elementDialogReturnFocus = wrapper.querySelector(".field-edit-button");
      const stagingField = cloneTemplateData(workingRecord.field);
      elementEditorState = {
        instanceId: workingRecord.field.instanceId,
        sectionId: workingRecord.section.id,
        field: stagingField,
        activeOptionId: stagingField.options[0]?.id || "",
        originalSignature: JSON.stringify(stagingField)
      };
      elementEditorTitle.textContent = `Edit ${getFieldDisplayLabel(workingRecord.field)}`;
      elementEditorContext.textContent = `${sectionName(workingRecord.section.title)} · Master type: ${workingRecord.field.baseFieldId}`;
      elementLabelInput.value = stagingField.label;
      const stagingSection = getWorkingSection(workingRecord.section.id);
      elementHasEventTimeCheckbox.checked = stagingField.hasEventTime === true ||
        (stagingField.hasEventTime !== false && stagingSection?.hasEventTimes === true);
      elementVariableSlotInput.value = "";
      populateElementVariablePalette();
      populateElementEditorOptions(stagingField.options[0]?.id || "");
      revertElementSavedButton.disabled = !findFieldInSections(activeTemplateSnapshot, stagingField.instanceId);
      setElementEditorStatus("Changes remain staged until Apply Element Changes is selected.");
      elementEditorModal.hidden = false;
      window.setTimeout(() => elementLabelInput.focus(), 0);
    }

    function elementEditorHasChanges() {
      if (!elementEditorState) {
        return false;
      }

      commitElementEditorInputs();
      return JSON.stringify(elementEditorState.field) !== elementEditorState.originalSignature;
    }

    function closeElementEditor(force = false) {
      if (!force && elementEditorHasChanges() && !window.confirm("Discard unsaved element-editor changes?")) {
        return;
      }

      elementEditorModal.hidden = true;
      elementEditorState = null;
      elementDialogReturnFocus?.focus?.();
      elementDialogReturnFocus = null;
    }

    function insertElementVariable() {
      const placeholder = normalizePlaceholderLabel(elementVariableSelect.value);

      if (!placeholder) {
        return;
      }

      const requestedSlot = normalizeTokenSlotId(elementVariableSlotInput.value);
      const token = requestedSlot ? `[${placeholder}::${requestedSlot}]` : `[${placeholder}]`;
      const start = elementSentenceInput.selectionStart ?? elementSentenceInput.value.length;
      const end = elementSentenceInput.selectionEnd ?? start;
      const prefix = start > 0 && !/\s/.test(elementSentenceInput.value.charAt(start - 1)) ? " " : "";
      const suffix = end < elementSentenceInput.value.length && !/[\s.,;:!?]/.test(elementSentenceInput.value.charAt(end)) ? " " : "";
      const inserted = `${prefix}${token}${suffix}`;
      elementSentenceInput.setRangeText(inserted, start, end, "end");
      elementSentenceInput.dispatchEvent(new Event("input", { bubbles: true }));
      elementVariableSlotInput.value = "";
      elementSentenceInput.focus();
    }

    function resetCurrentElementOption() {
      commitElementEditorInputs();
      const masterRecord = getMasterField(elementEditorState.field.baseFieldId);
      const masterOption = masterRecord?.field.options.find(
        (option) => option.id === elementEditorState.activeOptionId
      );

      if (!masterOption) {
        setElementEditorStatus("The Master version of this option was not found.", "error");
        return;
      }

      const optionIndex = elementEditorState.field.options.findIndex(
        (option) => option.id === elementEditorState.activeOptionId
      );
      elementEditorState.field.options[optionIndex] = cloneTemplateData(masterOption);
      populateElementEditorOptions(masterOption.id);
      setElementEditorStatus("Current option restored to Master wording and variables.", "success");
    }

    function resetCurrentElementToMaster() {
      const masterRecord = getMasterField(elementEditorState.field.baseFieldId);

      if (!masterRecord) {
        setElementEditorStatus("The Master version of this element was not found.", "error");
        return;
      }

      const current = elementEditorState.field;
      elementEditorState.field = {
        ...cloneTemplateData(masterRecord.field),
        baseFieldId: current.baseFieldId,
        instanceId: current.instanceId,
        instanceNumber: current.instanceNumber,
        defaultValue: current.defaultValue || "",
        tokenRules: {}
      };
      elementLabelInput.value = elementEditorState.field.label;
      elementHasEventTimeCheckbox.checked = elementEditorState.field.hasEventTime === true ||
        (elementEditorState.field.hasEventTime !== false && getWorkingSection(elementEditorState.sectionId)?.hasEventTimes === true);
      populateElementEditorOptions(elementEditorState.field.options[0]?.id || "");
      setElementEditorStatus("Entire element restored to Master wording and variables. Select Apply to commit it.", "success");
    }

    function revertCurrentElementToSavedTemplate() {
      const savedRecord = findFieldInSections(activeTemplateSnapshot, elementEditorState.field.instanceId);

      if (!savedRecord) {
        setElementEditorStatus("This element does not exist in the active saved template.", "error");
        return;
      }

      elementEditorState.field = cloneTemplateData(savedRecord.field);
      elementLabelInput.value = elementEditorState.field.label;
      elementHasEventTimeCheckbox.checked = elementEditorState.field.hasEventTime === true ||
        (elementEditorState.field.hasEventTime !== false && getWorkingSection(elementEditorState.sectionId)?.hasEventTimes === true);
      populateElementEditorOptions(elementEditorState.field.options[0]?.id || "");
      setElementEditorStatus("Element reverted to the active saved-template version. Select Apply to commit it.", "success");
    }

    function applyElementEditorChanges() {
      commitElementEditorInputs();
      const validationMessage = validateElementField(elementEditorState.field);

      if (validationMessage) {
        setElementEditorStatus(validationMessage, "error");
        return;
      }

      const workingRecord = getWorkingField(elementEditorState.instanceId);
      const wrapper = Array.from(form.querySelectorAll(".field[data-field-id]")).find(
        (candidate) => candidate.dataset.fieldId === elementEditorState.instanceId
      );

      if (!workingRecord || !wrapper) {
        setElementEditorStatus("The working element is no longer available.", "error");
        return;
      }

      const previousValue = wrapper.querySelector("select")?.value || "";
      const previousTimeInput = wrapper.querySelector(".event-time");
      const previousTime = previousTimeInput?.value || "";
      const previousTimeMode = previousTimeInput?.dataset.timeMode || "";
      const previouslyTimed = Boolean(previousTimeInput);
      workingRecord.field.label = elementEditorState.field.label.trim();
      workingRecord.field.options = cloneTemplateData(elementEditorState.field.options);
      workingRecord.field.hasEventTime = Boolean(elementEditorState.field.hasEventTime);
      workingRecord.field.tokenRules = normalizeTemplateTokenRules(elementEditorState.field.tokenRules);
      const shouldBeTimed = workingRecord.field.hasEventTime === true ||
        (workingRecord.field.hasEventTime !== false && workingRecord.section.hasEventTimes === true);

      if (previouslyTimed !== shouldBeTimed) {
        const replacement = createFieldRow(workingRecord.section, workingRecord.field);
        wrapper.replaceWith(replacement);
        const replacementSelect = replacement.querySelector("select");

        if (replacementSelect && Array.from(replacementSelect.options).some((option) => option.value === previousValue)) {
          replacementSelect.value = previousValue;
        }

        const replacementTime = replacement.querySelector(".event-time");

        if (replacementTime && previousTime) {
          replacementTime.value = previousTime;
          replacementTime.dataset.timeMode = previousTimeMode === "manual" ? "manual" : "auto";
        }
      } else {
        refreshRenderedFieldFromModel(wrapper, workingRecord.field);
      }

      updateConditionalLogic();
      handleSelectionChange();
      markWorkingTemplateDirty(`${getFieldDisplayLabel(workingRecord.field)} wording and variables updated.`);
      closeElementEditor(true);
    }

    function removeCurrentElementFromLayout() {
      const workingRecord = getWorkingField(elementEditorState.instanceId);
      const wrapper = Array.from(form.querySelectorAll(".field[data-field-id]")).find(
        (candidate) => candidate.dataset.fieldId === elementEditorState.instanceId
      );

      if (!workingRecord || !wrapper) {
        setElementEditorStatus("The working element is no longer available.", "error");
        return;
      }

      const displayLabel = getFieldDisplayLabel(workingRecord.field);

      if (!window.confirm(`Remove ${displayLabel} from the working template layout?`)) {
        return;
      }

      const hadContent = Boolean(
        wrapper.querySelector("select")?.value || wrapper.querySelector(".event-time")?.value
      );
      workingRecord.section.fields = workingRecord.section.fields.filter(
        (field) => field.instanceId !== workingRecord.field.instanceId
      );
      wrapper.remove();
      closeElementEditor(true);
      markWorkingTemplateDirty(`${displayLabel} removed from the working layout.`);
      const logicMessage = updateConditionalLogic();

      if (hadContent || logicMessage) {
        handleSelectionChange(logicMessage);
      }

      populateMasterElementSelect();
    }

    function getSelectedText(select) {
      const option = select.options[select.selectedIndex];
      return option ? option.dataset.text.trim() : "";
    }

    function getSelect(fieldId) {
      return document.getElementById(fieldId);
    }

    function getSelectsByBaseFieldId(fieldId, contextWrapper = null) {
      const contextGroup = contextWrapper?.dataset.repeatGroup || "";
      const contextInstance = contextWrapper?.dataset.instanceNumber || "";
      return Array.from(form.querySelectorAll("select[data-base-field-id]"))
        .filter((select) => select.dataset.baseFieldId === fieldId)
        .filter((select) => {
          if (!contextGroup) {
            return true;
          }

          const wrapper = select.closest(".field");
          return wrapper?.dataset.repeatGroup === contextGroup &&
            wrapper?.dataset.instanceNumber === contextInstance;
        });
    }

    function getSelectedOption(fieldId, contextWrapper = null) {
      const matchingSelects = getSelectsByBaseFieldId(fieldId, contextWrapper);
      const select = matchingSelects.find((candidate) => Boolean(candidate.value)) || matchingSelects[0] || getSelect(fieldId);

      if (!select || select.selectedIndex < 0) {
        return null;
      }

      return select.options[select.selectedIndex];
    }

    function getSelectedValueText(fieldId, fallback = "", contextWrapper = null) {
      const option = getSelectedOption(fieldId, contextWrapper);
      return option && option.dataset.valueText
        ? option.dataset.valueText.trim()
        : fallback;
    }

    function joinIncidentReasons(reasons) {
      if (reasons.length < 2) {
        return reasons[0] || "";
      }

      if (reasons.length === 2) {
        return `${reasons[0]} and ${reasons[1]}`;
      }

      return `${reasons.slice(0, -1).join(", ")}, and ${reasons.at(-1)}`;
    }

    function getIncidentReason(contextWrapper = null) {
      const reasons = ["subject_conduct", "flight"]
        .flatMap((fieldId) => getSelectsByBaseFieldId(fieldId, contextWrapper))
        .filter((select) => select.selectedIndex >= 0)
        .map((select) => select.options[select.selectedIndex])
        .map((option) => option.dataset.incidentReason.trim())
        .filter(Boolean);

      return joinIncidentReasons(Array.from(new Set(reasons)));
    }

    function setLogicFieldState(fieldId, enabled, disabledLabel, contextWrapper = null) {
      let selectionCleared = false;

      getSelectsByBaseFieldId(fieldId, contextWrapper).forEach((select) => {
        const wrapper = select.closest(".field");
        const emptyOption = select.options[0];

        if (!select.dataset.emptyOptionLabel && emptyOption) {
          select.dataset.emptyOptionLabel = emptyOption.textContent;
        }

        if (!enabled && select.value) {
          select.value = "";
          selectionCleared = true;
        }

        select.disabled = !enabled;
        wrapper.classList.toggle("logic-disabled", !enabled);
        wrapper.title = enabled ? "" : disabledLabel;

        if (emptyOption) {
          emptyOption.textContent = enabled
            ? select.dataset.emptyOptionLabel
            : disabledLabel;
        }
      });

      return selectionCleared;
    }

    function updateConditionalLogic() {
      let selectionCleared = false;
      const incidentAnchors = getSelectsByBaseFieldId("incident_subject")
        .map((select) => select.closest(".field"));

      incidentAnchors.forEach((contextWrapper) => {
        const hasIncidentSubject = getSelectsByBaseFieldId("incident_subject", contextWrapper)
          .some((select) => Boolean(select.value));
        const hasTriggeringConduct = Boolean(getIncidentReason(contextWrapper));
        const incidentReady = hasIncidentSubject && hasTriggeringConduct;

        selectionCleared = setLogicFieldState(
          "force_type",
          incidentReady,
          "Select subject + qualifying conduct in this incident first",
          contextWrapper
        ) || selectionCleared;

        const hasForceType = getSelectsByBaseFieldId("force_type", contextWrapper)
          .some((select) => Boolean(select.value));
        selectionCleared = setLogicFieldState(
          "force_result",
          incidentReady && hasForceType,
          "Select a force type in this incident first",
          contextWrapper
        ) || selectionCleared;

        selectionCleared = setLogicFieldState(
          "window_break",
          incidentReady,
          "Select subject + qualifying conduct in this incident first",
          contextWrapper
        ) || selectionCleared;

        const hasWindowBreak = getSelectsByBaseFieldId("window_break", contextWrapper)
          .some((select) => Boolean(select.value));
        selectionCleared = setLogicFieldState(
          "window_break_tool",
          incidentReady && hasWindowBreak,
          "Select a broken window in this incident first",
          contextWrapper
        ) || selectionCleared;
      });

      synchronizeChronologicalEventTimes();

      return selectionCleared
        ? "Dependent force or window-break selections were cleared because the linked subject or conduct changed."
        : "";
    }

    function resolveNarrativeLogic(text, contextWrapper = null) {
      if (!text) {
        return text;
      }

      const incidentSubjectBase = getSelectedValueText("incident_subject", "[SUBJECT]", contextWrapper);
      const incidentSlot = contextWrapper?.dataset.repeatGroup
        ? `${contextWrapper.dataset.repeatGroup}_${contextWrapper.dataset.instanceNumber || "1"}_actor`
        : "incident_actor";
      const incidentSubject = incidentSubjectBase.replace(
        /\[([^\[\]\r\n]+)\]/g,
        (_match, placeholder) => `[${parsePlaceholderSpec(placeholder).placeholder}::${incidentSlot}]`
      );
      const incidentReason = getIncidentReason(contextWrapper);
      const subjectConduct = incidentReason
        ? `${incidentSubject} ${incidentReason}`
        : "[SUBJECT CONDUCT]";
      const forceResult = getSelectedValueText("force_result", "[FORCE RESULT]", contextWrapper);
      const windowBreakTool = getSelectedValueText("window_break_tool", "[WINDOW BREAK TOOL]", contextWrapper);
      const documentNationality = getSelectedValueText("subject_nationality", "[COUNTRY]");

      return text
        .replaceAll("[SUBJECT CONDUCT]", subjectConduct)
        .replaceAll("[FORCE RESULT]", forceResult)
        .replaceAll("[WINDOW BREAK TOOL]", windowBreakTool)
        .replaceAll("[DOCUMENT NATIONALITY]", documentNationality)
        .replaceAll("[INCIDENT SUBJECT]", incidentSubject);
    }

    function formatEventTime(value) {
      return value ? value.replace(":", "") : "";
    }

    function applyEventTime(text, wrapper) {
      const timeInput = wrapper.querySelector(".event-time");

      if (!text || !timeInput) {
        return text;
      }

      if (/\[(?:STOP )?TIME\]/.test(text)) {
        return text;
      }

      const firstCharacter = text.charAt(0).toLowerCase();
      const sentence = `${firstCharacter}${text.slice(1)}`;
      return String(GENERATED_LANGUAGE.eventTimePrefix || "{sentence}")
        .replace("{sentence}", sentence);
    }

    function appendSystemNarrativeSections(paragraphs) {
      const definition = SYSTEM_SECTION_DEFINITIONS.otherArrested;
      const selections = typeof captureEncounterSelections === "function"
        ? captureEncounterSelections()
        : {};
      const includeAll = Object.keys(selections || {}).some(function (key) {
        return selections[key] === "include_all_other_arrested";
      });
      if (
        !definition ||
        !definition.text ||
        !includeAll ||
        getOtherArrestedObjects().length === 0
      ) {
        return paragraphs;
      }

      const systemParagraph = {
        sectionId: definition.id,
        sectionTitle: definition.title,
        systemGenerated: true,
        sentences: [{
          text: definition.text,
          sectionId: definition.id,
          sectionTitle: definition.title,
          fieldId: "system_other_arrested",
          bindingScope: "system_other_arrested",
          fieldLabel: definition.title
        }]
      };
      const anchorIndex = paragraphs.findIndex((paragraph) => paragraph.sectionId === definition.sequenceAfter);

      if (anchorIndex >= 0) {
        paragraphs.splice(anchorIndex + 1, 0, systemParagraph);
        return paragraphs;
      }

      const masterAnchorIndex = MASTER_NARRATIVE_SECTIONS.findIndex((section) => section.id === definition.sequenceAfter);
      const nextLaterIndex = paragraphs.findIndex((paragraph) => {
        const masterIndex = MASTER_NARRATIVE_SECTIONS.findIndex((section) => section.id === paragraph.sectionId);
        return masterIndex > masterAnchorIndex;
      });
      paragraphs.splice(nextLaterIndex >= 0 ? nextLaterIndex : paragraphs.length, 0, systemParagraph);
      return paragraphs;
    }

    /*
      NARRATIVE COMPILER
      ------------------
      Compiles the visible ordered form into paragraphs and sentence records.
      Token replacement is intentionally deferred: this stage preserves source
      field identity so repeated elements maintain independent binding keys.
    */
    function compileNarrativeModel() {
      const paragraphs = [];

      sortableChildren(form, "section").forEach((fieldset) => {
        const sentences = [];

        sortableChildren(fieldset, "field").forEach((wrapper) => {
          const select = wrapper.querySelector("select");
          const text = resolveNarrativeLogic(
            applyEventTime(getSelectedText(select), wrapper),
            wrapper
          );

          if (!text) {
            return;
          }

          sentences.push({
            text,
            sectionId: fieldset.dataset.sectionId,
            sectionTitle: fieldset.dataset.sectionTitle,
            fieldId: wrapper.dataset.fieldId,
            bindingScope: wrapper.dataset.repeatGroup
              ? `${wrapper.dataset.repeatGroup}:${wrapper.dataset.instanceNumber || "1"}`
              : wrapper.dataset.fieldId,
            fieldLabel: wrapper.querySelector("label")?.textContent || wrapper.dataset.fieldId
          });
        });

        if (sentences.length > 0) {
          paragraphs.push({
            sectionId: fieldset.dataset.sectionId,
            sentences
          });
        }
      });

      return appendSystemNarrativeSections(paragraphs);
    }

    function normalizePlaceholderLabel(value) {
      return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
    }

    /*
      Build 8 token syntax optionally names a stable slot:
        [SUBJECT]                 -> default slot "subject"
        [SUBJECT::actor]          -> slot "actor"
        [SUBJECT::other_actor]    -> a different subject slot

      The suffix never appears in resolved prose. It lets identical-looking
      placeholders represent different objects without breaking older templates.
    */
    function parsePlaceholderSpec(value) {
      const raw = String(value || "").trim();
      const separatorIndex = raw.indexOf("::");
      const rawLabel = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
      const rawSlot = separatorIndex >= 0 ? raw.slice(separatorIndex + 2) : "";
      const placeholder = normalizePlaceholderLabel(rawLabel);
      const slotId = normalizeTokenSlotId(rawSlot) || normalizeTokenSlotId(placeholder);
      return {
        placeholder,
        slotId,
        explicitSlot: Boolean(normalizeTokenSlotId(rawSlot)),
        tokenSpec: rawSlot ? `${placeholder}::${slotId}` : placeholder
      };
    }

    function humanizeKey(value) {
      return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function hasUsableValue(value) {
      return value !== null && value !== undefined && String(value).trim() !== "";
    }

    /* ======================================================================
       INPUT DATA ADAPTERS

       The binding engine consumes one small canonical shape:
         { id, type, role, label, fields }

       OpDoc domain objects do not need to be reshaped before they reach this
       module. The helpers below copy safe scalar properties, flatten shallow
       nested scalar properties, and derive the canonical field aliases used by
       PLACEHOLDER_RULES. Explicit `object.fields` values always win. Registered
       adapters run between built-in derivation and explicit fields, allowing a
       host model to override aliases without forking this file.
       ====================================================================== */
    const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
    const RESERVED_OBJECT_KEYS = new Set([
      "id", "object_id", "objectId", "uuid", "type", "object_type", "objectType",
      "role", "narrative_role", "narrativeRole", "label", "fields", "metadata",
      "relationships"
    ]);

    function toCanonicalFieldKey(value) {
      return String(value || "")
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
    }

    function normalizeScalarValue(value) {
      if (["string", "number", "boolean"].includes(typeof value)) {
        const scalar = String(value).trim();
        return scalar.length <= INPUT_LIMITS.maxScalarLength ? scalar : null;
      }

      if (Array.isArray(value)) {
        const values = value
          .map((item) => (["string", "number", "boolean"].includes(typeof item) ? String(item).trim() : ""))
          .filter(Boolean);
        const joined = values.length ? values.join(", ") : "";
        return joined && joined.length <= INPUT_LIMITS.maxScalarLength ? joined : null;
      }

      return null;
    }

    function sanitizeSerializableValue(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        return undefined;
      }
    }

    function getValueAtPath(source, path) {
      return String(path).split(".").reduce((value, key) => value?.[key], source);
    }

    function firstScalarValue(source, paths) {
      for (const path of paths) {
        const value = normalizeScalarValue(getValueAtPath(source, path));

        if (hasUsableValue(value)) {
          return value;
        }
      }

      return "";
    }

    function joinUsableValues(values, separator = " ") {
      return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
    }

    function copyScalarFields(source, target, prefix = "", depth = 0) {
      if (!source || typeof source !== "object" || Array.isArray(source) || depth > 2) {
        return;
      }

      Object.entries(source).forEach(([rawKey, rawValue]) => {
        if (UNSAFE_OBJECT_KEYS.has(rawKey) || (depth === 0 && RESERVED_OBJECT_KEYS.has(rawKey))) {
          return;
        }

        const keyPart = toCanonicalFieldKey(rawKey);

        if (!keyPart) {
          return;
        }

        const fieldKey = prefix ? `${prefix}_${keyPart}` : keyPart;
        const scalar = normalizeScalarValue(rawValue);

        if (scalar !== null) {
          target[fieldKey] = scalar;
        } else if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
          copyScalarFields(rawValue, target, fieldKey, depth + 1);
        }
      });
    }

    function setDerivedField(fields, fieldKey, value) {
      if (hasUsableValue(value)) {
        fields[fieldKey] = String(value).trim();
      }
    }

    function buildFullName(source) {
      const explicit = firstScalarValue(source, [
        "full_name", "fullName", "legal_name", "legalName", "display_name", "displayName",
        "name.full", "name.display", "identity.full_name", "identity.fullName"
      ]);

      if (explicit) {
        return explicit;
      }

      const simpleName = normalizeScalarValue(source?.name);

      if (simpleName) {
        return simpleName;
      }

      return joinUsableValues([
        firstScalarValue(source, ["first_name", "firstName", "name.first", "identity.first_name"]),
        firstScalarValue(source, ["middle_name", "middleName", "name.middle", "identity.middle_name"]),
        firstScalarValue(source, ["last_name", "lastName", "surname", "name.last", "identity.last_name"])
      ]);
    }

    function buildFullAddress(source) {
      const explicit = firstScalarValue(source, [
        "full_address", "fullAddress", "formatted_address", "formattedAddress",
        "address.full", "address.formatted", "location.address"
      ]);

      if (explicit) {
        return explicit;
      }

      const simpleAddress = normalizeScalarValue(source?.address);

      if (simpleAddress) {
        return simpleAddress;
      }

      const street = joinUsableValues([
        firstScalarValue(source, ["address.street_number", "address.streetNumber"]),
        firstScalarValue(source, ["street", "street_address", "streetAddress", "address.street", "address.line1"])
      ]);
      const locality = joinUsableValues([
        firstScalarValue(source, ["city", "address.city"]),
        firstScalarValue(source, ["state", "province", "address.state", "address.province"]),
        firstScalarValue(source, ["postal_code", "postalCode", "zip", "address.postal_code", "address.postalCode"])
      ], ", ");
      return joinUsableValues([street, locality], ", ");
    }

    function deriveCanonicalObjectFields(source, type) {
      const fields = {};
      copyScalarFields(source, fields);

      const fullName = buildFullName(source);
      const fullAddress = buildFullAddress(source);
      const year = firstScalarValue(source, ["year", "vehicle.year"]);
      const make = firstScalarValue(source, ["make", "vehicle.make"]);
      const model = firstScalarValue(source, ["model", "vehicle.model"]);
      const color = firstScalarValue(source, ["color", "vehicle.color"]);
      const yearMakeModel = firstScalarValue(source, ["year_make_model", "yearMakeModel"]) ||
        joinUsableValues([year, make, model]);
      const vehicleDescription = firstScalarValue(source, ["description", "display_name", "displayName"]) ||
        joinUsableValues([color, yearMakeModel]);

      if (["subject", "person", "officer"].includes(type)) {
        setDerivedField(fields, "full_name", fullName);
        setDerivedField(fields, "display_name", firstScalarValue(source, ["display_name", "displayName"]) || fullName);
        setDerivedField(fields, "first_name", firstScalarValue(source, ["first_name", "firstName", "name.first"]));
        setDerivedField(fields, "last_name", firstScalarValue(source, ["last_name", "lastName", "surname", "name.last"]));
      }

      if (["subject", "person"].includes(type)) {
        setDerivedField(fields, "date_of_birth", firstScalarValue(source, ["date_of_birth", "dateOfBirth", "dob", "identity.date_of_birth"]));
        setDerivedField(fields, "a_number", firstScalarValue(source, ["a_number", "aNumber", "alien_number", "alienNumber", "identifiers.a_number"]));
        setDerivedField(fields, "country", firstScalarValue(source, ["country", "country_of_birth", "countryOfBirth", "nationality.country"]));
        setDerivedField(fields, "nationality", firstScalarValue(source, ["nationality", "citizenship", "nationality.country"]));
        setDerivedField(fields, "nationality_adjective", firstScalarValue(source, ["nationality_adjective", "nationalityAdjective"]));
      }

      if (type === "vehicle") {
        setDerivedField(fields, "year_make_model", yearMakeModel);
        setDerivedField(fields, "description", vehicleDescription);
        setDerivedField(fields, "display_name", firstScalarValue(source, ["display_name", "displayName"]) || vehicleDescription);
        setDerivedField(fields, "plate", firstScalarValue(source, ["plate", "license_plate", "licensePlate", "registration.plate", "registration.number"]));
      }

      if (type === "location") {
        setDerivedField(fields, "full_address", fullAddress);
        setDerivedField(fields, "address", fullAddress);
        setDerivedField(fields, "location", firstScalarValue(source, ["location", "name", "display_name", "displayName"]) || fullAddress);
      }

      if (type === "agency") {
        const name = firstScalarValue(source, ["display_name", "displayName", "name", "agency_name", "agencyName"]);
        setDerivedField(fields, "name", name);
        setDerivedField(fields, "display_name", name);
      }

      if (type === "facility") {
        const name = firstScalarValue(source, ["facility", "name", "display_name", "displayName"]);
        setDerivedField(fields, "name", name);
        setDerivedField(fields, "facility", name);
      }

      if (type === "document") {
        const description = firstScalarValue(source, ["document", "description", "display_name", "displayName", "name"]);
        setDerivedField(fields, "description", description);
        setDerivedField(fields, "document", description);
        setDerivedField(fields, "issuing_country", firstScalarValue(source, ["issuing_country", "issuingCountry", "issuer.country"]));
      }

      if (type === "country") {
        const countryName = firstScalarValue(source, ["name", "country", "display_name", "displayName"]);
        setDerivedField(fields, "name", countryName);
        setDerivedField(fields, "country", countryName);
        setDerivedField(fields, "nationality", firstScalarValue(source, ["nationality", "citizenship_label"]));
        setDerivedField(fields, "nationality_adjective", firstScalarValue(source, ["nationality_adjective", "nationalityAdjective", "demonym"]));
      }

      return fields;
    }

    function normalizeFieldObject(source, options = {}) {
      const fields = {};
      const entries = Object.entries(source || {});

      if (entries.length > INPUT_LIMITS.maxFieldsPerObject) {
        throw new Error(`Narrative objects may contain at most ${INPUT_LIMITS.maxFieldsPerObject} fields.`);
      }

      entries.forEach(([rawKey, rawValue]) => {
        if (UNSAFE_OBJECT_KEYS.has(rawKey)) {
          return;
        }

        const fieldKey = toCanonicalFieldKey(rawKey);
        const value = normalizeScalarValue(rawValue);
        const looksLikeBinary = /(?:photo|image|blob|base64|attachment|file_data)/i.test(fieldKey);
        const allowedFields = CANONICAL_FIELDS_BY_TYPE[options.type] || [];
        const fieldAllowed = options.allowUnknown === true || allowedFields.includes(fieldKey);

        if (fieldKey && fieldAllowed && !looksLikeBinary && value === null &&
          (["string", "number", "boolean"].includes(typeof rawValue) || Array.isArray(rawValue))) {
          throw new Error(`Narrative field “${fieldKey}” is too large or is not a supported scalar list.`);
        }

        if (fieldKey && fieldAllowed && !looksLikeBinary && value !== null) {
          fields[fieldKey] = value;
        }
      });

      return fields;
    }

    function adaptInputObject(rawObject, type) {
      const builtInFields = normalizeFieldObject(deriveCanonicalObjectFields(rawObject, type), { type });
      const registeredAdapter = objectAdapters.get(type);
      const adapted = registeredAdapter ? registeredAdapter(rawObject, { type, normalizeScalarValue }) : null;

      if (adapted !== null && adapted !== undefined && typeof adapted !== "object") {
        throw new Error(`The ${type} adapter must return an object.`);
      }

      const adapterRecord = adapted?.fields && typeof adapted.fields === "object" ? adapted : { fields: adapted || {} };
      const explicitFields = normalizeFieldObject(rawObject.fields, {
        type,
        allowUnknown: moduleConfig.allowUnknownFields
      });
      const adapterFields = normalizeFieldObject(adapterRecord.fields, {
        type,
        allowUnknown: true
      });

      return {
        fields: { ...builtInFields, ...adapterFields, ...explicitFields },
        label: String(adapterRecord.label || "").trim(),
        role: String(adapterRecord.role || "").trim(),
        roles: adapterRecord.roles
      };
    }

    function normalizeObjectRoles(rawObject, adaptedRoles) {
      const rawRoleOrder = rawObject.role_order || rawObject.roleOrder || {};
      const candidates = [];
      const addCandidate = (value) => {
        if (typeof value === "string") {
          candidates.push({ role: value });
        } else if (value && typeof value === "object") {
          candidates.push(value);
        }
      };

      (Array.isArray(rawObject.roles) ? rawObject.roles : []).forEach(addCandidate);
      (Array.isArray(adaptedRoles) ? adaptedRoles : []).forEach(addCandidate);
      [rawObject.role, rawObject.narrative_role, rawObject.narrativeRole].forEach(addCandidate);
      const roles = [];
      const seen = new Set();

      candidates.forEach((candidate) => {
        const role = toCanonicalFieldKey(candidate.role || candidate.name || candidate.type);

        if (!role || seen.has(role)) {
          return;
        }

        const requestedOrdinal = Number.parseInt(
          candidate.ordinal ?? candidate.order ?? rawRoleOrder?.[role],
          10
        );
        roles.push({
          role,
          ...(Number.isFinite(requestedOrdinal) && requestedOrdinal > 0
            ? { ordinal: Math.min(requestedOrdinal, 999) }
            : {})
        });
        seen.add(role);
      });
      return roles.slice(0, 20);
    }

    function getObjectRoles(object) {
      if (Array.isArray(object?.roles) && object.roles.length) {
        return object.roles;
      }

      return object?.role ? [{ role: toCanonicalFieldKey(object.role) }] : [];
    }

    function objectHasRole(object, role) {
      const normalizedRole = toCanonicalFieldKey(role);
      return getObjectRoles(object).some((record) => record.role === normalizedRole);
    }

    function getObjectRoleOrdinal(object, role) {
      const normalizedRole = toCanonicalFieldKey(role);
      const explicitOrdinal = getObjectRoles(object).find((record) => record.role === normalizedRole)?.ordinal;

      if (explicitOrdinal) {
        return explicitOrdinal;
      }

      const peers = (dataPacket?.objects || []).filter((candidate) => objectHasRole(candidate, normalizedRole));
      const index = peers.findIndex((candidate) => candidate.id === object?.id);
      return index >= 0 ? index + 1 : null;
    }

    function assertSmallSerializable(value, label) {
      if (value === undefined) {
        return;
      }

      let serialized = "";
      try {
        serialized = JSON.stringify(value);
      } catch (error) {
        throw new Error(`${label} must be serializable JSON.`);
      }

      if (serialized.length > INPUT_LIMITS.maxMetadataBytes) {
        throw new Error(`${label} exceeds the narrative packet size limit.`);
      }
    }

    /** Validates and canonicalizes a packet without mutating the caller's data. */
    function normalizeDataPacket(packet) {
      if (!packet || typeof packet !== "object" || !Array.isArray(packet.objects)) {
        throw new Error("The JSON must contain an objects array.");
      }

      const requestedSchema = String(packet.schema_version || packet.schemaVersion || DATA_SCHEMA);

      if (requestedSchema !== DATA_SCHEMA && !LEGACY_SCHEMAS.data.includes(requestedSchema)) {
        throw new Error(`Unsupported narrative data schema: ${requestedSchema}`);
      }

      if (packet.objects.length > INPUT_LIMITS.maxObjects) {
        throw new Error(`A narrative packet may contain at most ${INPUT_LIMITS.maxObjects} objects.`);
      }

      const seenIds = new Set();
      const objects = packet.objects.map((object, index) => {
        if (!object || typeof object !== "object") {
          throw new Error(`Object ${index + 1} is not valid.`);
        }

        const id = String(object.id || object.object_id || object.objectId || object.uuid || "").trim();
        const type = String(object.type || object.object_type || object.objectType || "").trim().toLowerCase();

        if (!id || !type) {
          throw new Error(`Object ${index + 1} needs both id and type.`);
        }

        if (seenIds.has(id)) {
          throw new Error(`Duplicate object id: ${id}`);
        }

        if (id.length > 160 || type.length > 80) {
          throw new Error(`Object ${index + 1} has an overlong id or type.`);
        }

        if (!OBJECT_TYPE_LABELS[type] && !objectAdapters.has(type)) {
          throw new Error(`Unsupported narrative object type: ${type}`);
        }

        seenIds.add(id);
        const adapted = adaptInputObject(object, type);
        const roles = normalizeObjectRoles(object, [adapted.role, ...(Array.isArray(adapted.roles) ? adapted.roles : [])]);
        const label = String(
          object.label || adapted.label || adapted.fields.display_name || adapted.fields.full_name ||
          adapted.fields.name || adapted.fields.description || id
        ).trim().slice(0, INPUT_LIMITS.maxLabelLength);
        const metadata = sanitizeSerializableValue(object.metadata);
        const relationships = sanitizeSerializableValue(object.relationships);
        assertSmallSerializable(metadata, `Object ${id} metadata`);
        assertSmallSerializable(relationships, `Object ${id} relationships`);

        return {
          id,
          entity_id: String(object.entity_id || object.entityId || id).trim().slice(0, 160),
          type,
          role: roles[0]?.role || String(adapted.role || "").trim(),
          roles,
          label,
          fields: adapted.fields,
          ...(metadata !== undefined ? { metadata } : {}),
          ...(relationships !== undefined ? { relationships } : {})
        };
      });

      if (requestedSchema === DATA_SCHEMA) {
        const encounterSubjects = objects.filter((object) =>
          ["person", "subject"].includes(object.type) &&
          ["target", "collateral", "primary_target", "collateral_subject"].some((role) => objectHasRole(object, role))
        );
        const focalSubjects = encounterSubjects.filter((object) => objectHasRole(object, "narrative_subject"));

        if (encounterSubjects.length > 1 && focalSubjects.length !== 1) {
          const error = new Error("FOCAL_PARTICIPANT_REQUIRED: packets with multiple subjects must identify exactly one narrative_subject.");
          error.code = "FOCAL_PARTICIPANT_REQUIRED";
          throw error;
        }
      }

      const metadata = sanitizeSerializableValue(packet.metadata);
      assertSmallSerializable(metadata, "Packet metadata");

      return {
        schema_version: DATA_SCHEMA,
        source_schema_version: requestedSchema,
        packet_id: String(packet.packet_id || packet.packetId || "imported_packet").slice(0, 160),
        packet_name: String(packet.packet_name || packet.packetName || "Imported COPDoc data packet").slice(0, INPUT_LIMITS.maxPacketNameLength),
        is_test_data: Boolean(packet.is_test_data),
        objects,
        ...(metadata !== undefined ? { metadata } : {})
      };
    }

    function getEventObjects() {
      return Array.from(form.querySelectorAll(".field.has-time")).map((wrapper) => {
        const fieldId = wrapper.dataset.fieldId;
        const label = wrapper.querySelector("label")?.textContent || humanizeKey(fieldId);
        const timeInput = wrapper.querySelector(".event-time");

        return {
          id: `event:${fieldId}`,
          type: "event",
          role: "source_event",
          label: `${label} event`,
          fields: {
            time: formatEventTime(timeInput?.value || "")
          }
        };
      });
    }

    function getExplicitEncounterParticipantKey(object) {
      return String(
        object?.fields?.encounter_participant_id ||
        object?.metadata?.encounter_participant_id ||
        ""
      ).trim();
    }

    function getEncounterParticipantKey(object) {
      return getExplicitEncounterParticipantKey(object) || String(object?.id || "").trim();
    }

    function isEncounterParticipantObject(object) {
      const type = String(object?.type || "").toLowerCase();
      if (!["person", "subject"].includes(type)) {
        return false;
      }

      if (getExplicitEncounterParticipantKey(object)) {
        return true;
      }

      return [
        "narrative_subject", "primary_target", "target", "collateral_subject",
        "collateral", "encounter_subject", "subject"
      ].some((role) => objectHasRole(object, role));
    }

    function getFocusEncounterParticipantId() {
      const metadata = dataPacket?.metadata || {};
      return String(
        metadata.focus_participant_id ||
        metadata.focus_encounter_participant_id ||
        metadata.focusParticipantId ||
        metadata.focusEncounterParticipantId ||
        ""
      ).trim() || null;
    }

    function getOutcomeCode(object) {
      return String(
        object?.fields?.outcome_code ||
        object?.metadata?.outcome_code ||
        object?.metadata?.disposition ||
        ""
      ).trim().toUpperCase();
    }

    /** Deterministic membership for the one grouped Other Persons Arrested section. */
    function getOtherArrestedObjects() {
      const seenParticipants = new Set();
      return (dataPacket?.objects || [])
        .filter((object) => ["person", "subject"].includes(object.type))
        .filter((object) => getOutcomeCode(object) === "ARRESTED")
        .filter((object) => !objectHasRole(object, "narrative_subject"))
        .filter((object) => {
          const participantKey = getEncounterParticipantKey(object);
          if (!participantKey || seenParticipants.has(participantKey)) {
            return false;
          }
          seenParticipants.add(participantKey);
          return true;
        })
        .sort((left, right) => {
          const timeOrder = String(left.fields?.arrest_time || left.metadata?.arrest_time || "")
            .localeCompare(String(right.fields?.arrest_time || right.metadata?.arrest_time || ""));
          if (timeOrder) return timeOrder;
          const leftTarget = getObjectRoleOrdinal(left, "target") || 999;
          const rightTarget = getObjectRoleOrdinal(right, "target") || 999;
          const leftCollateral = getObjectRoleOrdinal(left, "collateral") || 999;
          const rightCollateral = getObjectRoleOrdinal(right, "collateral") || 999;
          return leftTarget - rightTarget || leftCollateral - rightCollateral || left.label.localeCompare(right.label);
        });
    }

    function joinNarrativeNames(names) {
      const clean = names.map((name) => String(name || "").trim()).filter(Boolean);
      if (clean.length < 2) return clean[0] || "";
      if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
      return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
    }

    function formatOtherArrestedEntry(object) {
      const fields = (object && object.fields) || {};
      const name = String(fields.full_name || object.label || "").trim();
      const digits = String(fields.a_number || "").replace(/\D/g, "");
      const aNumber = digits
        ? "A" + digits.padStart(9, "0")
        : "";
      const head = [name, aNumber ? "(" + aNumber + ")" : ""].filter(Boolean).join(" ");
      const bits = [];
      const disposition = String(
        fields.immigration_status_or_disposition ||
          fields.immigration_disposition_code ||
          ""
      ).trim();
      if (disposition && disposition.toUpperCase() !== "UNKNOWN") {
        bits.push(disposition);
      }
      const health = String(fields.health || "").trim();
      if (health && health.toUpperCase() !== "UNKNOWN") {
        bits.push("health " + health);
      }
      const meds = String(fields.medications || "").trim();
      if (meds && meds.toUpperCase() !== "UNKNOWN") {
        bits.push("medications " + meds);
      }
      const minors = String(fields.minors || fields.minor_children || "").trim();
      if (minors && minors.toUpperCase() !== "UNKNOWN") {
        bits.push("minor children " + minors);
      }
      const cash = fields.currency_usd;
      if (cash !== "" && cash != null && String(cash).toUpperCase() !== "UNKNOWN") {
        bits.push("$" + String(cash).replace(/^\$/, "") + " USD");
      }
      return bits.length ? head + " — " + bits.join("; ") : head;
    }

    function getSystemNarrativeObjects() {
      const arrested = getOtherArrestedObjects();
      if (!arrested.length) return [];
      return [{
        id: `system:other-arrested:${dataPacket?.packet_id || "packet"}`,
        entity_id: `system:other-arrested:${dataPacket?.packet_id || "packet"}`,
        type: "narrative_detail",
        role: "other_arrested_summary",
        roles: [{ role: "other_arrested_summary", ordinal: 1 }],
        label: "Other persons arrested",
        fields: {
          other_arrested_list: joinNarrativeNames(arrested.map(formatOtherArrestedEntry))
        },
        metadata: {
          source_encounter_participant_ids: arrested.map(getEncounterParticipantKey)
        }
      }];
    }

    function getObjectCatalog() {
      return [
        ...(dataPacket?.objects || []),
        ...getSystemNarrativeObjects(),
        ...getEventObjects()
      ];
    }

    function getObjectById(objectId) {
      if (String(objectId || "").startsWith("event:")) {
        return getEventObjects().find((object) => object.id === objectId) || null;
      }

      if (String(objectId || "").startsWith("system:")) {
        return getSystemNarrativeObjects().find((object) => object.id === objectId) || null;
      }

      return dataObjectById.get(objectId) || null;
    }

    function isSubjectParticipant(object) {
      if (object?.type === "subject") {
        return true;
      }

      if (object?.type !== "person") {
        return false;
      }

      return getObjectRoles(object).some((record) => [
        "primary_target", "target", "collateral_subject", "collateral", "subject", "encounter_subject"
      ].includes(record.role));
    }

    function getSubjectIdentityMap() {
      const subjects = (dataPacket?.objects || []).filter(isSubjectParticipant);
      const groupRecords = subjects.map((subject) => {
        const roles = getObjectRoles(subject);
        const targetRole = roles.find((record) => ["primary_target", "target"].includes(record.role));
        const collateralRole = roles.find((record) => ["collateral_subject", "collateral"].includes(record.role));

        if (targetRole) {
          return { group: "target", role: targetRole };
        }

        if (collateralRole) {
          return { group: "collateral", role: collateralRole };
        }

        const genericRole = roles.find((record) => ["subject", "encounter_subject"].includes(record.role));
        return { group: "subject", role: genericRole || roles[0] || null };
      });
      const groups = groupRecords.map((record) => record.group);
      const totals = groups.reduce((counts, group) => {
        counts[group] = (counts[group] || 0) + 1;
        return counts;
      }, {});
      const counters = { target: 0, collateral: 0, subject: 0 };
      const identities = new Map();

      subjects.forEach((subject, index) => {
        const group = groups[index];
        counters[group] += 1;
        const number = groupRecords[index].role?.ordinal || counters[group];
        const codePrefix = group === "target" ? "T" : group === "collateral" ? "C" : "S";
        const baseRole = group === "target" ? "Target" : group === "collateral" ? "Collateral" : "Subject";
        const roleLabel = totals[group] > 1 || group === "subject" || groupRecords[index].role?.ordinal
          ? `${baseRole} ${number}`
          : baseRole;
        const name = String(subject.fields?.full_name || subject.label || subject.id).trim();

        identities.set(subject.id, {
          code: `${codePrefix}${number}`,
          group,
          number,
          roleLabel,
          name,
          displayLabel: `${codePrefix}${number} · ${roleLabel} — ${name}`
        });
      });

      return identities;
    }

    function getSubjectIdentity(objectOrId) {
      const objectId = typeof objectOrId === "string" ? objectOrId : objectOrId?.id;
      return objectId ? getSubjectIdentityMap().get(objectId) || null : null;
    }

    function getObjectRoleIdentity(object) {
      if (!object) {
        return null;
      }

      const subjectIdentity = isSubjectParticipant(object) ? getSubjectIdentity(object) : null;

      if (subjectIdentity) {
        return {
          code: subjectIdentity.code,
          roleLabel: subjectIdentity.roleLabel,
          displayLabel: `${subjectIdentity.code} · ${subjectIdentity.roleLabel}`
        };
      }

      const prefixByType = {
        person: "P",
        location: "L",
        facility: "F",
        vehicle: "V",
        officer: "O",
        agency: "A",
        document: "D",
        country: "CTY",
        operation: "OP",
        encounter: "EN",
        event: "E",
        narrative_detail: "N"
      };
      const sameTypeObjects = getObjectCatalog().filter((candidate) => candidate.type === object.type);
      const primaryRole = getObjectRoles(object)[0] || null;
      const number = primaryRole
        ? getObjectRoleOrdinal(object, primaryRole.role) || 1
        : Math.max(1, sameTypeObjects.findIndex((candidate) => candidate.id === object.id) + 1);
      const code = `${prefixByType[object.type] || "X"}${number}`;
      const roleLabel = object.type === "event" && object.role === "source_event"
        ? String(object.label || "Narrative event").replace(/\s+event$/i, "")
        : primaryRole?.role || object.role
          ? humanizeKey(primaryRole?.role || object.role)
          : OBJECT_TYPE_LABELS[object.type] || humanizeKey(object.type);

      return {
        code,
        roleLabel,
        displayLabel: `${code} · ${roleLabel}`
      };
    }

    function getTemplateRoleIdentity(meta) {
      const selector = getTemplateTokenRule(meta)?.selector;
      const role = selector?.roles?.[0] || "";

      if (!role) {
        return null;
      }

      const ordinal = selector.ordinal || 1;
      const roleMap = {
        primary_target: { prefix: "T", label: "Target" },
        target: { prefix: "T", label: "Target" },
        collateral_subject: { prefix: "C", label: "Collateral" },
        collateral: { prefix: "C", label: "Collateral" },
        encounter_subject: { prefix: "S", label: "Subject" },
        subject: { prefix: "S", label: "Subject" },
        target_address: { prefix: "L", label: "Target Address" },
        contact_location: { prefix: "L", label: "Contact Location" },
        encountered_vehicle: { prefix: "V", label: "Encountered Vehicle" },
        government_vehicle: { prefix: "V", label: "Government Vehicle" }
      };
      const mapped = roleMap[role] || {
        prefix: (selector.types?.[0] || "X").slice(0, 1).toUpperCase(),
        label: humanizeKey(role)
      };
      const code = `${mapped.prefix}${ordinal}`;
      const showOrdinal = Boolean(selector.ordinal) || ["subject", "target", "collateral"].some((value) => role.includes(value));
      const roleLabel = `${mapped.label}${showOrdinal ? ` ${ordinal}` : ""}`;
      return { code, roleLabel, displayLabel: `${code} · ${roleLabel}` };
    }

    function getObjectValueLabel(object) {
      if (!object) {
        return "Unavailable object";
      }

      if (object.type === "subject") {
        return String(object.fields?.full_name || object.label || object.id).trim();
      }

      return object.label || object.id;
    }

    function getObjectDisplayLabel(object) {
      if (!object) {
        return "Unavailable object";
      }

      const roleIdentity = getObjectRoleIdentity(object);
      return roleIdentity
        ? `${roleIdentity.displayLabel} — ${getObjectValueLabel(object)}`
        : getObjectValueLabel(object);
    }

    function mapSemanticTypeToCategory(semanticType) {
      if (["subject", "person"].includes(semanticType)) {
        return "subject";
      }

      if (["officer", "agency"].includes(semanticType)) {
        return "officer";
      }

      if (["operation", "encounter", "event"].includes(semanticType)) {
        return "event";
      }

      if (["location", "facility"].includes(semanticType)) {
        return "location";
      }

      if (semanticType === "vehicle") {
        return "vehicle";
      }

      if (semanticType === "document") {
        return "document";
      }

      if (semanticType === "narrative_detail") {
        return "action";
      }

      return semanticType === "custom" ? "custom" : "other";
    }

    function inferVariableTypeCategory(meta, binding, resolution) {
      const originalRuleType = PLACEHOLDER_RULES[normalizePlaceholderLabel(meta.placeholder)]?.types?.[0];
      const semanticType = originalRuleType || resolution?.object?.type || (binding?.mode === "custom" ? "custom" : "");
      return mapSemanticTypeToCategory(semanticType);
    }

    function getVariableTypeCategory(meta, binding, resolution) {
      const override = getTemplateTokenRule(meta)?.category || tokenTypeOverrides.get(meta.key);
      return override && VARIABLE_TYPE_CONFIG[override]
        ? override
        : inferVariableTypeCategory(meta, binding, resolution);
    }

    function getVariableTypeConfig(category) {
      return VARIABLE_TYPE_CONFIG[category] || VARIABLE_TYPE_CONFIG.other;
    }

    function getTokenMeta(token) {
      return {
        key: token.dataset.tokenKey,
        placeholder: token.dataset.placeholder,
        slotId: token.dataset.slotId || normalizeTokenSlotId(token.dataset.placeholder),
        tokenSpec: token.dataset.tokenSpec || token.dataset.placeholder,
        sourceFieldId: token.dataset.sourceFieldId || "manual",
        sourceSectionId: token.dataset.sourceSectionId || "manual",
        sourceFieldLabel: token.dataset.sourceFieldLabel || "Manually entered text"
      };
    }

    function getPlaceholderRule(meta) {
      const templateRule = getTemplateTokenRule(meta);
      const categoryOverride = templateRule?.category || tokenTypeOverrides.get(meta.key);

      if (categoryOverride && VARIABLE_CATEGORY_RULES[categoryOverride]) {
        const categoryRule = VARIABLE_CATEGORY_RULES[categoryOverride];
        return {
          ...categoryRule,
          ...(templateRule?.selector?.types?.length ? { types: templateRule.selector.types } : {}),
          ...(templateRule?.selector?.roles?.length ? { roles: templateRule.selector.roles } : {}),
          ...(templateRule?.fieldKey ? { fields: [templateRule.fieldKey] } : {})
        };
      }

      const placeholderRule = PLACEHOLDER_RULES[normalizePlaceholderLabel(meta.placeholder)] || null;

      if (!placeholderRule || !templateRule) {
        return placeholderRule;
      }

      return {
        ...placeholderRule,
        ...(templateRule.selector?.types?.length ? { types: templateRule.selector.types } : {}),
        ...(templateRule.selector?.roles?.length ? { roles: templateRule.selector.roles } : {}),
        ...(templateRule.fieldKey ? { fields: [templateRule.fieldKey] } : {})
      };
    }

    function getCompatibleObjectTypes(meta) {
      return getPlaceholderRule(meta)?.types || [];
    }

    function getCompatibleObjects(meta) {
      const allowedTypes = getCompatibleObjectTypes(meta);
      const objects = getObjectCatalog();
      let compatible = allowedTypes.length === 0
        ? objects
        : objects.filter((object) => allowedTypes.includes(object.type));
      const selector = getTemplateTokenRule(meta)?.selector;

      /*
       * Build 9 invariant: a saved semantic role selector is a constraint,
       * not a scoring hint.  Target 2 may never borrow Target 1's value when
       * the requested field is blank or absent.
       */
      if (selector?.roles?.length) {
        compatible = compatible.filter((object) => selector.roles.some((role) => {
          if (!objectHasRole(object, role)) {
            return false;
          }
          return !selector.ordinal || getObjectRoleOrdinal(object, role) === selector.ordinal;
        }));
      }

      return compatible;
    }

    function getCompatibleFieldKeys(meta, object) {
      if (!object) {
        return [];
      }

      const rule = getPlaceholderRule(meta);
      const fieldKeys = Object.keys(object.fields);

      if (!rule) {
        return fieldKeys;
      }

      if (!rule.types.includes(object.type)) {
        return [];
      }

      if (!Array.isArray(rule.fields)) {
        return fieldKeys;
      }

      return fieldKeys.filter((fieldKey) => rule.fields.includes(fieldKey));
    }

    function isCompatibleBinding(meta, object, fieldKey) {
      return Boolean(
        object &&
        fieldKey &&
        getCompatibleObjects(meta).some((candidate) => candidate.id === object.id) &&
        getCompatibleFieldKeys(meta, object).includes(fieldKey)
      );
    }

    function describeTokenRestriction(meta) {
      const allowedTypes = getCompatibleObjectTypes(meta);

      if (allowedTypes.length === 0) {
        return {
          label: "Data object",
          message: "This custom placeholder has no assigned semantic type. Any data object may be selected."
        };
      }

      const labels = allowedTypes.map((type) => OBJECT_TYPE_LABELS[type] || humanizeKey(type));
      const readableTypes = labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;

      return {
        label: labels.length === 1 ? labels[0] : "Compatible object",
        message: `Only ${readableTypes.toLowerCase()} records and compatible fields can be selected for this placeholder.`
      };
    }

    function preferredIncidentRole(meta) {
      if (meta.sourceSectionId !== "conduct") {
        return "";
      }

      const contextWrapper = Array.from(form.querySelectorAll(".field[data-field-id]")).find(
        (wrapper) => wrapper.dataset.fieldId === meta.sourceFieldId
      );
      const subjectChoice = getSelectsByBaseFieldId("incident_subject", contextWrapper)[0]?.value;

      if (subjectChoice === "other_subject") {
        return "collateral_subject";
      }

      if (subjectChoice === "primary_subject") {
        return "primary_target";
      }

      return "";
    }

    function buildRoleSelectorForObject(meta, object) {
      const preferredRoles = getPlaceholderRule(meta)?.roles || [];
      const roles = getObjectRoles(object);
      const selectedRole = roles.find((record) => preferredRoles.includes(record.role)) || roles[0] || null;
      return {
        types: [object.type],
        roles: selectedRole ? [selectedRole.role] : [],
        ordinal: selectedRole?.ordinal || null
      };
    }

    function relationshipReferencesObject(relationships, objectId, preferredRoles = []) {
      if (!relationships) {
        return false;
      }

      if (Array.isArray(relationships)) {
        return relationships.some((record) => {
          if (!record || typeof record !== "object") {
            return false;
          }

          const targetId = String(record.target_id || record.targetId || record.object_id || record.objectId || "");
          const relation = toCanonicalFieldKey(record.type || record.role || record.relationship);
          return targetId === objectId && (preferredRoles.length === 0 || preferredRoles.includes(relation));
        });
      }

      if (typeof relationships === "object") {
        return Object.entries(relationships).some(([rawRelation, rawTargets]) => {
          const relation = toCanonicalFieldKey(rawRelation);
          const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];
          return (preferredRoles.length === 0 || preferredRoles.includes(relation)) && targets.some((target) => {
            const targetId = typeof target === "object"
              ? target?.id || target?.object_id || target?.objectId
              : target;
            return String(targetId || "") === objectId;
          });
        });
      }

      return false;
    }

    function scoreBindingCandidate(meta, object, fieldKey) {
      if (!isCompatibleBinding(meta, object, fieldKey)) {
        return -1;
      }

      const value = object.fields[fieldKey];

      if (!hasUsableValue(value)) {
        return -1;
      }

      const placeholder = normalizePlaceholderLabel(meta.placeholder);
      const rule = getPlaceholderRule(meta);
      let score = 0;

      if (
        ["TIME", "STOP TIME"].includes(placeholder) &&
        object.id === `event:${meta.sourceFieldId}` &&
        fieldKey === "time"
      ) {
        score += 5000;
      }

      if (rule) {
        const typeIndex = rule.types.indexOf(object.type);
        const fieldIndex = Array.isArray(rule.fields) ? rule.fields.indexOf(fieldKey) : -1;
        const roleIndex = (rule.roles || []).findIndex((role) => objectHasRole(object, role));

        if (typeIndex >= 0) {
          score += 500 - typeIndex * 20;
        }

        if (fieldIndex >= 0) {
          score += 800 - fieldIndex * 30;
        } else if (!Array.isArray(rule.fields)) {
          score += 200;
        }

        if (roleIndex >= 0) {
          score += 500 - roleIndex * 20;
        }
      }

      const incidentRole = preferredIncidentRole(meta);

      if (incidentRole && object.type === "subject" && objectHasRole(object, incidentRole)) {
        score += 1600;
      }

      const templateSelector = getTemplateTokenRule(meta)?.selector;

      if (templateSelector) {
        if (templateSelector.roles?.some((role) => objectHasRole(object, role))) {
          score += 2400;
        }

        if (templateSelector.ordinal) {
          const matchingRole = templateSelector.roles?.find((role) => objectHasRole(object, role));
          const ordinal = matchingRole ? getObjectRoleOrdinal(object, matchingRole) : null;
          score += ordinal === templateSelector.ordinal ? 1800 : -600;
        }
      }

      const preferredRelationshipRoles = [...new Set([
        ...(rule?.roles || []),
        normalizeTokenSlotId(meta.slotId)
      ].filter(Boolean))];
      const relationshipMatch = (dataPacket?.objects || []).some((sourceObject) =>
        relationshipReferencesObject(sourceObject.relationships, object.id, preferredRelationshipRoles)
      );

      if (relationshipMatch) {
        score += 1400;
      }

      const placeholderKey = placeholder.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const normalizedFieldKey = fieldKey.toLowerCase();

      if (placeholderKey === normalizedFieldKey) {
        score += 650;
      } else if (
        placeholderKey.includes(normalizedFieldKey) ||
        normalizedFieldKey.includes(placeholderKey)
      ) {
        score += 180;
      }

      return score;
    }

    function getSuggestedBindings(meta, limit = 8) {
      const candidates = [];

      getCompatibleObjects(meta).forEach((object) => {
        getCompatibleFieldKeys(meta, object).forEach((fieldKey) => {
          const score = scoreBindingCandidate(meta, object, fieldKey);

          if (score > 0) {
            candidates.push({
              objectId: object.id,
              objectType: object.type,
              objectLabel: getObjectDisplayLabel(object),
              fieldKey,
              fieldLabel: humanizeKey(fieldKey),
              value: object.fields[fieldKey],
              score
            });
          }
        });
      });

      return candidates
        .sort((a, b) => b.score - a.score || a.objectLabel.localeCompare(b.objectLabel))
        .slice(0, limit);
    }

    /*
      BINDING ENGINE
      --------------
      A binding is either `{ mode: "object", objectId, fieldKey }` or a one-off
      `{ mode: "custom", customValue }`. Resolution is performed at read time,
      so editing one source field updates every token bound to that field.
    */
    function resolveBinding(binding) {
      if (!binding) {
        return { value: "", state: "unresolved" };
      }

      if (binding.mode === "custom") {
        return {
          value: String(binding.customValue || "").trim(),
          state: hasUsableValue(binding.customValue) ? "custom" : "unresolved"
        };
      }

      const object = getObjectById(binding.objectId);
      const value = object?.fields?.[binding.fieldKey];

      return {
        value: hasUsableValue(value) ? String(value) : "",
        state: object && Object.prototype.hasOwnProperty.call(object.fields, binding.fieldKey)
          ? "unresolved"
          : "stale",
        object
      };
    }

    function sourceHasEventTime(meta) {
      if (!meta.sourceFieldId) {
        return false;
      }

      const sourceField = Array.from(form.querySelectorAll(".field[data-field-id]")).find(
        (wrapper) => wrapper.dataset.fieldId === meta.sourceFieldId
      );
      return Boolean(sourceField?.querySelector(".event-time"));
    }

    function ensureAutoBinding(meta, replaceStale = false) {
      const existing = tokenBindings.get(meta.key);
      const existingResolution = resolveBinding(existing);

      if (existing && existingResolution.value) {
        return false;
      }

      if (existing?.mode === "custom") {
        return false;
      }

      if (existing && !replaceStale) {
        return false;
      }

      const placeholder = normalizePlaceholderLabel(meta.placeholder);
      let suggestions = getSuggestedBindings(meta, 20);

      if (["TIME", "STOP TIME"].includes(placeholder) && sourceHasEventTime(meta)) {
        suggestions = suggestions.filter((candidate) => candidate.objectId === `event:${meta.sourceFieldId}`);
      }

      const best = suggestions[0];

      if (!best || best.score < 500) {
        return false;
      }

      tokenBindings.set(meta.key, {
        mode: "object",
        objectId: best.objectId,
        fieldKey: best.fieldKey
      });
      return true;
    }

    function makeTokenKey(sourceFieldId, slotId) {
      return `${sourceFieldId || "manual"}::slot:${normalizeTokenSlotId(slotId)}`;
    }

    function createTokenElement(placeholderSpec, source = {}) {
      const parsed = parsePlaceholderSpec(placeholderSpec);
      const normalizedPlaceholder = parsed.placeholder;
      const token = document.createElement("span");
      const sourceFieldId = source.fieldId || "manual";
      const bindingScope = source.bindingScope || sourceFieldId;

      token.className = "binding-token unresolved";
      token.contentEditable = "false";
      token.tabIndex = 0;
      token.setAttribute("role", "button");
      token.dataset.placeholder = normalizedPlaceholder;
      token.dataset.slotId = parsed.slotId;
      token.dataset.tokenSpec = parsed.tokenSpec;
      token.dataset.tokenKey = makeTokenKey(bindingScope, parsed.slotId);
      token.dataset.sourceFieldId = sourceFieldId;
      token.dataset.sourceSectionId = source.sectionId || "manual";
      token.dataset.sourceFieldLabel = source.fieldLabel || "Manually entered text";
      token.textContent = `[${normalizedPlaceholder}]`;
      return token;
    }

    function appendTokenizedText(parent, text, source) {
      const tokenPattern = /\[([^\[\]\r\n]+)\]/g;
      let lastIndex = 0;
      let match;

      while ((match = tokenPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        parent.appendChild(createTokenElement(match[1], source));
        lastIndex = tokenPattern.lastIndex;
      }

      if (lastIndex < text.length) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
    }

    function renderToken(token, autoBind = false, replaceStale = false) {
      const meta = getTokenMeta(token);

      if (autoBind) {
        ensureAutoBinding(meta, replaceStale);
      }

      const binding = tokenBindings.get(meta.key);
      const resolution = resolveBinding(binding);
      const fallback = `[${meta.placeholder}]`;
      const displayValue = resolution.value || fallback;
      const typeCategory = getVariableTypeCategory(meta, binding, resolution);
      const typeConfig = getVariableTypeConfig(typeCategory);
      const roleIdentity = resolution.object ? getObjectRoleIdentity(resolution.object) : null;
      const templateRoleIdentity = roleIdentity || getTemplateRoleIdentity(meta);
      const dynamicMode = ["types", "roles", "values"].includes(viewMode) ? viewMode : "values";

      if (dynamicMode === "types") {
        token.textContent = `[${typeConfig.tokenLabel}]`;
      } else if (dynamicMode === "roles") {
        token.textContent = templateRoleIdentity
          ? `[${templateRoleIdentity.code} · ${templateRoleIdentity.roleLabel.toUpperCase()}]`
          : binding?.mode === "custom" && resolution.value
            ? `[${typeConfig.tokenLabel} · CUSTOM OVERRIDE]`
            : `[${typeConfig.tokenLabel} · UNBOUND]`;
      } else {
        token.textContent = resolution.value
          ? roleIdentity
            ? `${roleIdentity.code} · ${roleIdentity.roleLabel.toUpperCase()} = ${displayValue}`
            : `${typeConfig.tokenLabel} = ${displayValue}`
          : fallback;
      }
      token.classList.remove(...VARIABLE_TYPE_CLASSES);
      token.classList.add(typeConfig.className);
      token.classList.toggle("unresolved", !resolution.value && resolution.state !== "stale");
      token.classList.toggle("custom-bound", resolution.state === "custom");
      token.classList.toggle("stale-bound", resolution.state === "stale");
      token.dataset.bindingState = resolution.state;
      token.dataset.variableType = typeCategory;
      token.dataset.objectCode = roleIdentity?.code || "";
      token.dataset.actionLabel = dynamicMode === "types" ? "TYPE" : dynamicMode === "roles" ? "ROLE" : "VALUE";

      if (dynamicMode === "types") {
        token.title = `${fallback} · ${typeConfig.label}\nClick to change the variable category.`;
        token.setAttribute("aria-label", `${meta.placeholder}, category ${typeConfig.label}. Activate to change category.`);
      } else if (dynamicMode === "roles") {
        token.title = templateRoleIdentity
          ? `${fallback} → ${templateRoleIdentity.displayLabel}\nClick to change the semantic role selector.`
          : `${fallback} has no object role binding. Click to choose one.`;
        token.setAttribute("aria-label", `${meta.placeholder}, ${templateRoleIdentity ? `mapped to ${templateRoleIdentity.displayLabel}` : "role unbound"}. Activate to change role.`);
      } else if (resolution.value) {
        const sourceLabel = binding.mode === "custom"
          ? "Custom text"
          : `${getObjectDisplayLabel(resolution.object) || binding.objectId} → ${humanizeKey(binding.fieldKey)}`;
        token.title = `${fallback} = ${resolution.value}\n${sourceLabel}\nClick to change binding.`;
        token.setAttribute("aria-label", `${meta.placeholder}, ${roleIdentity ? `${roleIdentity.code}, ` : ""}bound to ${resolution.value}. Activate to change.`);
      } else {
        token.title = resolution.state === "stale"
          ? `${fallback} has a binding whose object or field is no longer available. Click to repair.`
          : `${fallback} is unresolved. Click to bind it.`;
        token.setAttribute("aria-label", `${meta.placeholder}, unresolved. Activate to bind.`);
      }
    }

    function refreshTokenDisplays(options = {}) {
      const { autoBind = false, replaceStale = false } = options;

      draft.querySelectorAll(".binding-token").forEach((token) => {
        renderToken(token, autoBind, replaceStale);
      });

      updateStatus();
      refreshVariablesView();
    }

    /*
      RENDER / SERIALIZE BOUNDARY
      ---------------------------
      The editable dynamic view is tokenized DOM for interaction and audit.
      getPlainNarrative() serializes that DOM into either placeholders or
      resolved values; the final plain-text textarea is a separate edit layer.
    */
    function renderNarrativeModel(model) {
      const fragment = document.createDocumentFragment();

      model.forEach((paragraphData) => {
        const paragraph = document.createElement("p");
        paragraph.dataset.sectionId = paragraphData.sectionId;
        paragraph.dataset.sectionTitle = paragraphData.sectionTitle || paragraphData.sentences[0]?.sectionTitle || paragraphData.sectionId;
        paragraph.dataset.systemGenerated = String(Boolean(paragraphData.systemGenerated));
        paragraph.dataset.sourceFieldIds = JSON.stringify(paragraphData.sentences.map((sentence) => sentence.fieldId));

        paragraphData.sentences.forEach((sentence, index) => {
          if (index > 0) {
            paragraph.appendChild(document.createTextNode(" "));
          }

          appendTokenizedText(paragraph, sentence.text, sentence);
        });

        fragment.appendChild(paragraph);
      });

      draft.replaceChildren(fragment);
      manualEdits = false;
      selectionsPending = false;
      refreshTokenDisplays({ autoBind: true, replaceStale: true });
      markTemplateChanged();
      updateStatus();
    }

    function serializeNarrativeNode(node, mode) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || "";
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      if (node.classList.contains("binding-token")) {
        const meta = getTokenMeta(node);
        const resolution = resolveBinding(tokenBindings.get(meta.key));
        return mode === "resolved" && resolution.value
          ? resolution.value
          : `[${node.dataset.tokenSpec || meta.placeholder}]`;
      }

      if (node.tagName === "BR") {
        return "\n";
      }

      const childText = Array.from(node.childNodes)
        .map((child) => serializeNarrativeNode(child, mode))
        .join("");

      if (node.tagName === "P") {
        return `${childText}\n\n`;
      }

      if (["DIV", "LI"].includes(node.tagName)) {
        return `${childText}\n`;
      }

      return childText;
    }

    function getPlainNarrative(mode = "resolved") {
      return Array.from(draft.childNodes)
        .map((node) => serializeNarrativeNode(node, mode))
        .join("")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    function getStructuredNarrativeSections() {
      return Array.from(draft.children)
        .filter((node) => node.tagName === "P" && node.dataset.sectionId)
        .map((paragraph, index) => {
          let sourceFieldInstanceIds = [];
          try {
            sourceFieldInstanceIds = JSON.parse(paragraph.dataset.sourceFieldIds || "[]");
          } catch (error) {
            sourceFieldInstanceIds = [];
          }
          const systemGenerated = paragraph.dataset.systemGenerated === "true";
          return {
            sectionId: paragraph.dataset.sectionId,
            sequence: index + 1,
            title: paragraph.dataset.sectionTitle || paragraph.dataset.sectionId,
            sectionType: systemGenerated ? "SYSTEM" : "MASTER",
            templateText: serializeNarrativeNode(paragraph, "template").trim(),
            resolvedText: serializeNarrativeNode(paragraph, "resolved").trim(),
            manualTextOverride: null,
            sourceFieldInstanceIds: [...new Set(sourceFieldInstanceIds)],
            sourceEncounterParticipantIds: systemGenerated && paragraph.dataset.sectionId === "other_arrested"
              ? getOtherArrestedObjects().map(getEncounterParticipantKey)
              : []
          };
        });
    }

    function getFactsManifest() {
      const bindings = getBindingManifest();
      const sourceObjectIds = [...new Set(bindings
        .map((record) => record.binding?.objectId)
        .filter(Boolean))];
      const sourceEncounterParticipantIds = [...new Set((dataPacket?.objects || [])
        .filter(isEncounterParticipantObject)
        .map(getEncounterParticipantKey)
        .filter(Boolean))];
      return {
        schema: "copdoc.narrative-facts-manifest.v1",
        focusEncounterParticipantId: getFocusEncounterParticipantId(),
        sourceObjectIds,
        sourceEncounterParticipantIds,
        otherArrestedEncounterParticipantIds: getOtherArrestedObjects().map(getEncounterParticipantKey)
      };
    }

    function syncResolvedDraft(options = {}) {
      const { force = false } = options;
      const sourceChanged = resolvedFromRevision !== templateRevision;

      if (!force && resolvedManualEdits && sourceChanged) {
        resolvedPending = true;
        return false;
      }

      if (force || sourceChanged || resolvedFromRevision < 0) {
        resolvedDraft.value = getPlainNarrative("resolved");
        resolvedFromRevision = templateRevision;
        resolvedManualEdits = false;
      }

      resolvedPending = false;
      return true;
    }

    function markTemplateChanged() {
      templateRevision += 1;
      resolvedPending = resolvedFromRevision !== templateRevision;

      if (viewMode === "plain" && !resolvedManualEdits) {
        syncResolvedDraft({ force: true });
      }

      emitNarrativeChange("narrative-updated");
    }

    function getCurrentNarrativeText() {
      return viewMode === "plain"
        ? resolvedDraft.value.trim()
        : getPlainNarrative("resolved");
    }

    function draftHasManualEdits() {
      return manualEdits;
    }

    function countWords(text) {
      const words = text.trim().match(/\S+/g);
      return words ? words.length : 0;
    }

    function countSelections() {
      return Array.from(form.querySelectorAll("select")).filter((select) => select.value).length;
    }

    function getVariableStatus(binding, resolution) {
      if (resolution.state === "stale") {
        return "stale";
      }

      if (!resolution.value) {
        return "unresolved";
      }

      return binding?.mode === "custom" ? "custom" : "filled";
    }

    function getVariableUsageLabel(meta, occurrences = 1) {
      const fieldset = Array.from(form.querySelectorAll("fieldset[data-section-id]")).find(
        (candidate) => candidate.dataset.sectionId === meta.sourceSectionId
      );
      const sectionTitle = fieldset?.dataset.sectionTitle || (meta.sourceSectionId === "manual"
        ? "Manual text"
        : humanizeKey(meta.sourceSectionId));
      const occurrenceText = occurrences > 1 ? ` · ${occurrences} occurrences` : "";
      return `${sectionTitle} · ${meta.sourceFieldLabel}${occurrenceText}`;
    }

    function collectVariableRecords() {
      const recordsByKey = new Map();

      Array.from(draft.querySelectorAll(".binding-token")).forEach((token, index) => {
        const meta = getTokenMeta(token);
        const existing = recordsByKey.get(meta.key);

        if (existing) {
          existing.occurrences += 1;
          existing.usageLabel = getVariableUsageLabel(existing.meta, existing.occurrences);
          return;
        }

        const binding = tokenBindings.get(meta.key);
        const resolution = resolveBinding(binding);
        const typeCategory = getVariableTypeCategory(meta, binding, resolution);
        const subjectIdentity = isSubjectParticipant(resolution.object)
          ? getSubjectIdentity(resolution.object)
          : null;

        recordsByKey.set(meta.key, {
          key: meta.key,
          token,
          meta,
          binding,
          resolution,
          status: getVariableStatus(binding, resolution),
          typeCategory,
          subjectIdentity,
          occurrences: 1,
          usageLabel: getVariableUsageLabel(meta, 1),
          originalIndex: index
        });
      });

      const attentionRank = { stale: 0, unresolved: 1, custom: 2, filled: 3 };
      return Array.from(recordsByKey.values()).sort((a, b) => {
        return attentionRank[a.status] - attentionRank[b.status] || a.originalIndex - b.originalIndex;
      });
    }

    function getTokenStatus() {
      const records = collectVariableRecords();
      const missing = records.filter((record) => ["unresolved", "stale"].includes(record.status));

      return {
        total: records.length,
        occurrences: draft.querySelectorAll(".binding-token").length,
        unresolved: missing.length,
        custom: records.filter((record) => record.status === "custom").length,
        filled: records.filter((record) => ["filled", "custom"].includes(record.status)).length,
        unresolvedLabels: [...new Set(missing.map((record) => `[${record.meta.placeholder}]`))]
      };
    }

    function normalizeEventTimeInput(value) {
      const rawValue = String(value || "").trim();

      if (!rawValue) {
        return "";
      }

      const digits = rawValue.replace(/\D/g, "");

      if (digits.length < 3 || digits.length > 4) {
        return null;
      }

      const padded = digits.padStart(4, "0");
      const hours = Number(padded.slice(0, 2));
      const minutes = Number(padded.slice(2));

      if (hours > 23 || minutes > 59) {
        return null;
      }

      return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }

    async function setBoundObjectValue(binding, value) {
      if (!binding || binding.mode !== "object") {
        return { ok: false, message: "That variable is not bound to a source object." };
      }

      if (String(binding.objectId).startsWith("event:")) {
        const fieldId = String(binding.objectId).slice("event:".length);
        const wrapper = Array.from(form.querySelectorAll(".field[data-field-id]")).find(
          (candidate) => candidate.dataset.fieldId === fieldId
        );
        const timeInput = wrapper?.querySelector(".event-time");
        const normalizedTime = normalizeEventTimeInput(value);

        if (!timeInput || normalizedTime === null) {
          return { ok: false, message: "Enter event time as HH:MM or four-digit military time." };
        }

        timeInput.value = normalizedTime;
        timeInput.dataset.timeMode = "manual";
        timeInput.dataset.lastManualValue = normalizedTime;
        markRepeatedFieldDirty(wrapper);
        synchronizeChronologicalEventTimes();
        return { ok: true };
      }

      const object = dataPacket?.objects?.find((candidate) => candidate.id === binding.objectId);

      if (!object) {
        return { ok: false, message: "The bound source object is no longer available." };
      }

      const editRequest = {
        objectId: object.id,
        entityId: object.entity_id || object.id,
        objectType: object.type,
        fieldKey: binding.fieldKey,
        currentValue: object.fields[binding.fieldKey] || "",
        proposedValue: String(value || "").trim()
      };

      if (sourceEditHandler) {
        let response;
        try {
          response = await sourceEditHandler(cloneTemplateData(editRequest));
        } catch (error) {
          return {
            ok: false,
            message: `The source edit failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }

        if (!response || response.accepted !== true) {
          return { ok: false, message: response?.message || "The source edit was not accepted by COPDoc." };
        }

        if (Object.prototype.hasOwnProperty.call(response, "value")) {
          object.fields[binding.fieldKey] = String(response.value ?? "").trim();
        }

        emitDataChange("source-field-edited");
        return { ok: true, delegated: true };
      }

      if (!moduleConfig.canEditSourceValues || moduleConfig.mode === "embedded") {
        emitIntegrationEvent("opdoc:narrative-source-edit-request", {
          objectId: editRequest.objectId,
          entityId: editRequest.entityId,
          objectType: editRequest.objectType,
          fieldKey: editRequest.fieldKey
        });
        return {
          ok: false,
          message: "Edit this value in the owning COPDoc record, then refresh the narrative data."
        };
      }

      object.fields[binding.fieldKey] = String(value || "").trim();
      emitDataChange("source-field-edited");
      return { ok: true };
    }

    async function applyVariableValue(record, value) {
      const nextValue = String(value || "").trim();
      const currentBinding = tokenBindings.get(record.key);

      if (currentBinding?.mode === "object") {
        const result = await setBoundObjectValue(currentBinding, nextValue);

        if (!result.ok) {
          updateStatus(result.message);
          return;
        }
      } else if (nextValue) {
        tokenBindings.set(record.key, {
          mode: "custom",
          customValue: nextValue
        });
      } else {
        tokenBindings.delete(record.key);
      }

      markTemplateChanged();
      refreshTokenDisplays();
      updateStatus(currentBinding?.mode === "object"
        ? `[${record.meta.placeholder}] source value updated everywhere it is used.`
        : `[${record.meta.placeholder}] saved as a one-time custom override.`);
    }

    function clearVariableBinding(record) {
      tokenBindings.delete(record.key);
      markTemplateChanged();
      refreshTokenDisplays();
      updateStatus(`[${record.meta.placeholder}] binding cleared.`);
    }

    function jumpToVariable(record) {
      setViewMode("values");
      const token = Array.from(draft.querySelectorAll(".binding-token")).find(
        (candidate) => candidate.dataset.tokenKey === record.key
      );

      if (!token) {
        return;
      }

      token.classList.add("audit-highlight");
      token.scrollIntoView({ block: "center", behavior: "smooth" });
      token.focus({ preventScroll: true });
      window.setTimeout(() => token.classList.remove("audit-highlight"), 2800);
    }

    function renderVariablesFilters(records) {
      const missingCount = records.filter((record) => ["unresolved", "stale"].includes(record.status)).length;
      const subjectCount = records.filter((record) => record.typeCategory === "subject").length;
      const customCount = records.filter((record) => record.status === "custom").length;
      const filters = [
        { id: "all", label: `All ${records.length}` },
        { id: "missing", label: `Missing ${missingCount}` },
        { id: "subject", label: `Subjects ${subjectCount}` },
        { id: "custom", label: `Overrides ${customCount}` }
      ];

      variablesFilters.replaceChildren();
      filters.forEach((filter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = filter.label;
        button.setAttribute("aria-pressed", String(variableFilter === filter.id));
        button.addEventListener("click", () => {
          variableFilter = filter.id;
          refreshVariablesView();
        });
        variablesFilters.appendChild(button);
      });
    }

    function renderSubjectDirectory() {
      subjectDirectory.replaceChildren();
      const subjects = (dataPacket?.objects || []).filter(isSubjectParticipant);

      subjects.forEach((subject) => {
        const identity = getSubjectIdentity(subject);

        if (!identity) {
          return;
        }

        const button = document.createElement("button");
        const code = document.createElement("span");
        const label = document.createElement("span");
        const filterId = `subject:${subject.id}`;

        button.type = "button";
        button.className = "subject-chip";
        button.setAttribute("aria-pressed", String(variableFilter === filterId));
        button.title = `Show variables bound to ${identity.displayLabel}`;
        code.className = "subject-code";
        code.textContent = identity.code;
        label.textContent = `${identity.roleLabel} — ${identity.name}`;
        button.append(code, label);
        button.addEventListener("click", () => {
          variableFilter = variableFilter === filterId ? "all" : filterId;
          refreshVariablesView();
        });
        subjectDirectory.appendChild(button);
      });
    }

    function filterVariableRecords(records) {
      if (variableFilter === "missing") {
        return records.filter((record) => ["unresolved", "stale"].includes(record.status));
      }

      if (variableFilter === "subject") {
        return records.filter((record) => record.typeCategory === "subject");
      }

      if (variableFilter === "custom") {
        return records.filter((record) => record.status === "custom");
      }

      if (variableFilter.startsWith("subject:")) {
        const objectId = variableFilter.slice("subject:".length);
        return records.filter((record) => record.binding?.mode === "object" && record.binding.objectId === objectId);
      }

      return records;
    }

    function renderVariableCard(record) {
      const card = document.createElement("article");
      const identityBlock = document.createElement("div");
      const titleRow = document.createElement("div");
      const placeholder = document.createElement("strong");
      const typeBadge = document.createElement("span");
      const statusBadge = document.createElement("span");
      const usage = document.createElement("div");
      const sourceBlock = document.createElement("div");
      const sourceLabel = document.createElement("div");
      const fieldLabel = document.createElement("div");
      const editorBlock = document.createElement("div");
      const editor = document.createElement("div");
      const valueInput = document.createElement("input");
      const applyButton = document.createElement("button");
      const editNote = document.createElement("div");
      const actions = document.createElement("div");
      const changeButton = document.createElement("button");
      const jumpButton = document.createElement("button");
      const clearButton = document.createElement("button");
      const typeConfig = getVariableTypeConfig(record.typeCategory);
      const statusLabels = {
        filled: "Filled",
        custom: "Override",
        unresolved: "Missing",
        stale: "Stale"
      };
      const bindingObject = record.binding?.mode === "object"
        ? getObjectById(record.binding.objectId)
        : null;

      card.className = `variable-card ${typeConfig.className} status-${record.status}`;
      card.dataset.tokenKey = record.key;
      identityBlock.className = "variable-identity";
      titleRow.className = "variable-title-row";
      placeholder.className = "variable-placeholder";
      placeholder.textContent = `[${record.meta.placeholder}]`;
      typeBadge.className = "variable-type-badge";
      typeBadge.textContent = typeConfig.label;
      statusBadge.className = "variable-status-badge";
      statusBadge.textContent = statusLabels[record.status];
      usage.className = "variable-usage";
      usage.textContent = record.usageLabel;
      titleRow.append(placeholder, typeBadge, statusBadge);
      identityBlock.append(titleRow, usage);

      sourceBlock.className = "variable-source";
      sourceLabel.className = "variable-source-label";
      fieldLabel.className = "variable-field-label";

      if (bindingObject) {
        sourceLabel.textContent = getObjectDisplayLabel(bindingObject);
        fieldLabel.textContent = `Field: ${humanizeKey(record.binding.fieldKey)}`;
      } else if (record.binding?.mode === "custom") {
        sourceLabel.textContent = "One-time custom text";
        fieldLabel.textContent = "This value overrides only this narrative variable.";
      } else if (record.status === "stale") {
        sourceLabel.textContent = "Unavailable source";
        fieldLabel.textContent = `${record.binding?.objectId || "Unknown object"} → ${humanizeKey(record.binding?.fieldKey || "unknown field")}`;
      } else {
        sourceLabel.textContent = "Not bound";
        fieldLabel.textContent = "Choose a source object or enter a one-time value.";
      }

      sourceBlock.append(sourceLabel, fieldLabel);

      editorBlock.className = "variable-editor-block";
      editor.className = "variable-value-editor";
      valueInput.type = "text";
      valueInput.value = record.resolution.value || "";
      valueInput.placeholder = record.status === "unresolved" ? "Enter a value or change the binding" : "Current value";
      valueInput.setAttribute("aria-label", `Value for ${record.meta.placeholder}`);
      applyButton.type = "button";
      const delegatedSourceEdit = Boolean(bindingObject && (moduleConfig.mode === "embedded" || !moduleConfig.canEditSourceValues));
      valueInput.readOnly = delegatedSourceEdit && !sourceEditHandler;
      applyButton.textContent = delegatedSourceEdit && !sourceEditHandler ? "Edit in COPDoc" : "Apply";
      applyButton.addEventListener("click", () => void applyVariableValue(record, valueInput.value));
      valueInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void applyVariableValue(record, valueInput.value);
        }
      });
      editNote.className = "variable-edit-note";
      editNote.textContent = bindingObject
        ? moduleConfig.mode === "embedded" || !moduleConfig.canEditSourceValues
          ? `Requests an edit to ${getObjectDisplayLabel(bindingObject)} → ${humanizeKey(record.binding.fieldKey)} through the owning OpDoc record.`
          : `Edits the standalone packet copy for ${getObjectDisplayLabel(bindingObject)} → ${humanizeKey(record.binding.fieldKey)}.`
        : record.binding?.mode === "custom"
          ? "Edits this one-time override."
          : "Applying text here creates a one-time custom override.";
      editor.append(valueInput, applyButton, editNote);
      editorBlock.appendChild(editor);

      actions.className = "variable-actions";
      changeButton.type = "button";
      changeButton.textContent = "Change binding";
      changeButton.addEventListener("click", () => openTokenDialog(record.token, changeButton));
      jumpButton.type = "button";
      jumpButton.textContent = "Show in Values";
      jumpButton.addEventListener("click", () => jumpToVariable(record));
      clearButton.type = "button";
      clearButton.className = "danger-light";
      clearButton.textContent = "Clear binding";
      clearButton.disabled = !record.binding;
      clearButton.addEventListener("click", () => clearVariableBinding(record));
      actions.append(changeButton, jumpButton, clearButton);

      card.append(identityBlock, sourceBlock, editorBlock, actions);
      return card;
    }

    function refreshVariablesView() {
      if (!variablesView || !variablesList) {
        return;
      }

      const records = collectVariableRecords();
      const missingCount = records.filter((record) => ["unresolved", "stale"].includes(record.status)).length;
      const customCount = records.filter((record) => record.status === "custom").length;
      const filledCount = records.length - missingCount;

      variablesSummary.textContent = records.length
        ? `${records.length} variable${records.length === 1 ? "" : "s"} · ${filledCount} filled · ${missingCount} missing${customCount ? ` · ${customCount} custom override${customCount === 1 ? "" : "s"}` : ""}`
        : "No dynamic variables are currently in the narrative.";
      renderVariablesFilters(records);
      renderSubjectDirectory();
      variablesList.replaceChildren();

      const filteredRecords = filterVariableRecords(records);

      if (filteredRecords.length === 0) {
        const empty = document.createElement("p");
        empty.className = "variables-empty";
        empty.textContent = records.length === 0
          ? "Build a narrative in Types, Roles, or Values to create auditable bindings."
          : "No variables match this filter.";
        variablesList.appendChild(empty);
        return;
      }

      filteredRecords.forEach((record) => variablesList.appendChild(renderVariableCard(record)));
    }

    function updateStatus(message = "") {
      const selectionCount = countSelections();
      const narrativeText = getCurrentNarrativeText();
      const wordCount = countWords(narrativeText);
      const tokenStatus = getTokenStatus();
      const unresolvedSummary = tokenStatus.unresolved > 0
        ? ` · ${tokenStatus.unresolved} unresolved`
        : tokenStatus.total > 0
          ? " · all tokens resolved"
          : "";
      const summary = viewMode === "plain"
        ? `${wordCount} word${wordCount === 1 ? "" : "s"} · plain text${unresolvedSummary}`
        : viewMode === "bindings"
          ? `${tokenStatus.total} variable${tokenStatus.total === 1 ? "" : "s"} · ${tokenStatus.filled} filled · ${tokenStatus.unresolved} missing${tokenStatus.custom ? ` · ${tokenStatus.custom} override${tokenStatus.custom === 1 ? "" : "s"}` : ""}`
          : `${selectionCount} selection${selectionCount === 1 ? "" : "s"} · ${wordCount} word${wordCount === 1 ? "" : "s"} · ${tokenStatus.total} dynamic variable${tokenStatus.total === 1 ? "" : "s"}${unresolvedSummary}`;
      const staleResolvedText = viewMode === "plain" && resolvedPending;

      draftStatus.classList.toggle("pending", selectionsPending || staleResolvedText);
      draftStatus.textContent = staleResolvedText
        ? "Dynamic narrative changed. Plain-text edits are preserved; select Refresh Text to regenerate."
        : message || summary;
      copyButton.disabled = narrativeText === "";
    }

    function replaceDraftWithSelections() {
      renderNarrativeModel(compileNarrativeModel());
    }

    function handleSelectionChange(logicMessage = "") {
      if (draftHasManualEdits()) {
        selectionsPending = true;
        updateStatus(viewMode === "plain"
          ? "Selections changed. Refresh Text when you are ready to rebuild the edited dynamic narrative and final text."
          : "Selections changed. Rebuild Draft when you are ready to replace the manually edited prose.");
        return;
      }

      replaceDraftWithSelections();

      if (logicMessage) {
        updateStatus(logicMessage);
      }
    }

    function rebuildDraft() {
      if (viewMode === "plain") {
        const replacesTemplateEdits = selectionsPending && draftHasManualEdits();
        const replacesResolvedEdits = resolvedManualEdits && resolvedDraft.value.trim() !== "";

        if (replacesTemplateEdits || replacesResolvedEdits) {
          const replacedWork = replacesTemplateEdits && replacesResolvedEdits
            ? "the manually edited template and plain-text narrative"
            : replacesTemplateEdits
              ? "the manually edited template"
              : "the manually edited plain-text narrative";

          if (!window.confirm(`Refreshing will replace ${replacedWork} with the current selections and bindings. Continue?`)) {
            return;
          }
        }

        if (selectionsPending) {
          replaceDraftWithSelections();
        }

        syncResolvedDraft({ force: true });
        updateStatus("Resolved plain text refreshed from the current template.");
        resolvedDraft.focus();
        return;
      }

      if (
        draftHasManualEdits() &&
        getPlainNarrative("template") !== "" &&
        !window.confirm("Rebuilding will replace the manually edited prose. Token bindings with matching event IDs will be preserved. Continue?")
      ) {
        return;
      }

      replaceDraftWithSelections();

      if (viewMode === "bindings") {
        refreshVariablesView();
      } else {
        draft.focus();
      }
    }

    async function copyNarrative() {
      const narrativeText = getCurrentNarrativeText();

      if (!narrativeText) {
        return;
      }

      const validation = validateNarrative({ stage: "copy" });

      if (moduleConfig.requireResolvedBeforeCopy && !validation.valid) {
        updateStatus(`Narrative not copied: ${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} must be resolved first.`);
        return false;
      }

      if (copyOutputHandler) {
        try { return await copyOutputHandler(narrativeText); }
        catch (error) { updateStatus("Narrative not copied: " + error.message); return false; }
      }
      // The native host installs a tracked delivery handler. Standalone training
      // hosts must also provide that boundary before exporting case prose.
      updateStatus("Document tracking is unavailable. Reload this page before copying the narrative.");
      return false;
    }

    function resetEncounterState(options = {}) {
      form.reset();
      NARRATIVE_SECTIONS.forEach((section) => {
        section.fields.forEach((field) => {
          const select = document.getElementById(field.instanceId);

          if (select && field.defaultValue && Array.from(select.options).some((option) => option.value === field.defaultValue)) {
            select.value = field.defaultValue;
          }
        });
      });
      form.querySelectorAll('.field[data-repeat-instance="true"]').forEach((wrapper) => {
        wrapper.dataset.repeatDirty = "false";
      });
      form.querySelectorAll(".event-time").forEach((timeInput) => {
        timeInput.disabled = true;
        timeInput.value = "";
        delete timeInput.dataset.timeMode;
        delete timeInput.dataset.lastManualValue;
        updateEventTimeHint(timeInput);
      });
      updateConditionalLogic();
      tokenBindings.clear();
      tokenTypeOverrides.clear();
      draft.replaceChildren();
      resolvedDraft.value = "";
      manualEdits = false;
      selectionsPending = false;
      templateRevision += 1;
      resolvedFromRevision = templateRevision;
      resolvedManualEdits = false;
      resolvedPending = false;

      if (options.clearData === true) {
        dataPacket = null;
        dataObjectById = new Map();
        updateDataPacketStatus();
      }

      if (countSelections() > 0) {
        replaceDraftWithSelections();
      } else {
        updateStatus();
        refreshVariablesView();
      }
      emitNarrativeChange("encounter-cleared");

      if (options.clearData === true) {
        emitDataChange("encounter-cleared");
      }

      return getModuleStatus();
    }

    function clearAll() {
      const hasSelections = countSelections() > 0;
      const hasDraft = getPlainNarrative("template") !== "" || resolvedDraft.value.trim() !== "";

      if (
        (hasSelections || hasDraft) &&
        !window.confirm("Clear all selections, token bindings, and the narrative draft?")
      ) {
        return;
      }

      resetEncounterState();
    }

    /*
      VIEW PROJECTION
      ---------------
      Types, Roles, and Values are projections of the same binding records.
      Plain Text is the final editable output; Bindings is the audit/editor view.
      Switching views never creates a second narrative data model.
    */
    function setViewMode(mode) {
      const nextMode = ["types", "roles", "values", "plain", "bindings"].includes(mode) ? mode : "types";

      if (nextMode === "plain") {
        syncResolvedDraft();
      }

      viewMode = nextMode;
      const plainMode = viewMode === "plain";
      const bindingsMode = viewMode === "bindings";
      const dynamicMode = ["types", "roles", "values"].includes(viewMode);
      typesViewButton.setAttribute("aria-pressed", String(viewMode === "types"));
      rolesViewButton.setAttribute("aria-pressed", String(viewMode === "roles"));
      valuesViewButton.setAttribute("aria-pressed", String(viewMode === "values"));
      plainTextViewButton.setAttribute("aria-pressed", String(plainMode));
      bindingsViewButton.setAttribute("aria-pressed", String(bindingsMode));
      draft.hidden = !dynamicMode;
      resolvedDraft.hidden = !plainMode;
      variablesView.hidden = !bindingsMode;
      autoBindButton.disabled = plainMode;
      detectTokensButton.disabled = !dynamicMode;
      editorModeLabel.textContent = viewMode === "types"
        ? "Layer 1 · variable types"
        : viewMode === "roles"
          ? "Layer 2 · object roles"
          : viewMode === "values"
            ? "Layer 3 · mapped values"
            : plainMode
              ? "Final editable text"
              : "Master binding audit";
      rebuildButton.textContent = plainMode ? "Refresh Text" : "Rebuild";
      rebuildButton.title = plainMode
        ? "Replace the plain-text draft with the current dynamic narrative."
        : bindingsMode
          ? "Rebuild the dynamic narrative, then refresh this binding audit."
          : "Rebuild the dynamic narrative from the selected narrative options.";

      if (plainMode) {
        updateStatus();
      } else if (bindingsMode) {
        refreshTokenDisplays();
        refreshVariablesView();
      } else {
        refreshTokenDisplays();
      }
    }

    function tokenizeLoosePlaceholders() {
      const walker = document.createTreeWalker(draft, NodeFilter.SHOW_TEXT);
      const textNodes = [];

      while (walker.nextNode()) {
        const textNode = walker.currentNode;

        if (!textNode.parentElement?.closest(".binding-token") && /\[[^\[\]\r\n]+\]/.test(textNode.nodeValue || "")) {
          textNodes.push(textNode);
        }
      }

      let tokenCount = 0;

      textNodes.forEach((textNode) => {
        const fragment = document.createDocumentFragment();
        const beforeCount = tokenCount;
        const tokenPattern = /\[([^\[\]\r\n]+)\]/g;
        const text = textNode.nodeValue || "";
        let lastIndex = 0;
        let match;

        while ((match = tokenPattern.exec(text)) !== null) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          fragment.appendChild(createTokenElement(match[1]));
          tokenCount += 1;
          lastIndex = tokenPattern.lastIndex;
        }

        if (tokenCount > beforeCount) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
          textNode.replaceWith(fragment);
        }
      });

      if (tokenCount > 0) {
        manualEdits = true;
        markTemplateChanged();
        refreshTokenDisplays({ autoBind: true, replaceStale: true });
        updateStatus(`${tokenCount} manually typed placeholder${tokenCount === 1 ? " was" : "s were"} converted to dynamic tokens.`);
      } else {
        updateStatus("No unconverted [PLACEHOLDERS] were found.");
      }
    }

    function populateCategoryOptions(meta, binding, resolution) {
      tokenCategorySelect.replaceChildren();
      const inferredCategory = inferVariableTypeCategory(meta, binding, resolution);
      const automaticOption = document.createElement("option");
      automaticOption.value = "__auto__";
      automaticOption.textContent = `Automatic — ${getVariableTypeConfig(inferredCategory).label}`;
      tokenCategorySelect.appendChild(automaticOption);

      ["subject", "officer", "event", "location", "vehicle", "document", "action", "other"].forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = getVariableTypeConfig(category).label;
        tokenCategorySelect.appendChild(option);
      });

      tokenCategorySelect.value = getTemplateTokenRule(meta)?.category || tokenTypeOverrides.get(meta.key) || "__auto__";
    }

    function setActiveTokenCategory() {
      if (!activeTokenKey || !activeTokenElement) {
        return;
      }

      const meta = getTokenMeta(activeTokenElement);
      const selectedCategory = tokenCategorySelect.value;

      if (selectedCategory === "__auto__") {
        tokenTypeOverrides.delete(activeTokenKey);
        setTemplateTokenRule(meta, { category: null });
      } else if (VARIABLE_CATEGORY_RULES[selectedCategory]) {
        tokenTypeOverrides.delete(activeTokenKey);
        setTemplateTokenRule(meta, { category: selectedCategory });
      }

      const binding = tokenBindings.get(activeTokenKey);
      const boundObject = binding?.mode === "object" ? getObjectById(binding.objectId) : null;

      if (binding?.mode === "object" && !isCompatibleBinding(meta, boundObject, binding.fieldKey)) {
        tokenBindings.delete(activeTokenKey);
      }

      const effectiveCategory = getVariableTypeCategory(meta, tokenBindings.get(activeTokenKey), resolveBinding(tokenBindings.get(activeTokenKey)));
      closeTokenDialog();
      markTemplateChanged();
      refreshTokenDisplays();
      updateStatus(`[${meta.placeholder}] category set to ${getVariableTypeConfig(effectiveCategory).label}.`);
    }

    function populateRoleSelectorOptions(meta) {
      tokenRoleSelectorSelect.replaceChildren();
      const rule = getPlaceholderRule(meta);
      const templateSelector = getTemplateTokenRule(meta)?.selector;
      const roles = [...new Set(rule?.roles || [])];
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = roles.length ? "Choose semantic role" : "No predefined roles for this variable";
      tokenRoleSelectorSelect.appendChild(blank);

      roles.forEach((role) => {
        const numbered = [
          "primary_target", "target", "collateral_subject", "collateral",
          "subject", "encounter_subject", "target_address", "contact_location",
          "encountered_vehicle", "government_vehicle"
        ].includes(role);
        const maximumPacketOrdinal = (dataPacket?.objects || []).reduce((maximum, object) => {
          return objectHasRole(object, role)
            ? Math.max(maximum, getObjectRoleOrdinal(object, role) || 1)
            : maximum;
        }, 1);
        const ordinals = numbered
          ? Array.from({ length: maximumPacketOrdinal }, (_value, index) => index + 1)
          : [1];

        ordinals.forEach((ordinal) => {
          const option = document.createElement("option");
          option.value = `${role}|${ordinal}`;
          option.textContent = `${humanizeKey(role)}${numbered ? ` ${ordinal}` : ""}`;
          tokenRoleSelectorSelect.appendChild(option);
        });
      });

      if (templateSelector?.roles?.[0]) {
        const requestedValue = `${templateSelector.roles[0]}|${templateSelector.ordinal || 1}`;

        if (Array.from(tokenRoleSelectorSelect.options).some((option) => option.value === requestedValue)) {
          tokenRoleSelectorSelect.value = requestedValue;
        }
      }
      tokenRoleSelectorSelect.disabled = roles.length === 0;
    }

    function bindActiveTokenToRoleSelector(meta) {
      const [role, rawOrdinal] = String(tokenRoleSelectorSelect.value || "").split("|");

      if (!role) {
        return false;
      }

      const placeholderRule = PLACEHOLDER_RULES[normalizePlaceholderLabel(meta.placeholder)] || getPlaceholderRule(meta);
      const fieldKey = getTemplateTokenRule(meta)?.fieldKey || placeholderRule?.fields?.[0] || "";
      setTemplateTokenRule(meta, {
        selector: {
          types: getCompatibleObjectTypes(meta),
          roles: [role],
          ordinal: Number.parseInt(rawOrdinal, 10) || 1
        },
        fieldKey
      });
      tokenBindings.delete(meta.key);
      ensureAutoBinding(meta, true);
      return true;
    }

    function populateObjectOptions(meta, selectedObjectId = "") {
      tokenObjectSelect.replaceChildren();
      const restriction = describeTokenRestriction(meta);
      const roleOnly = viewMode === "roles";
      const blankOption = document.createElement("option");
      blankOption.value = "";
      blankOption.textContent = `Choose ${restriction.label.toLowerCase()}`;
      tokenObjectSelect.appendChild(blankOption);

      const suggestions = getSuggestedBindings(meta, 100);
      const suggestionScoreByObject = new Map();

      suggestions.forEach((suggestion) => {
        const currentScore = suggestionScoreByObject.get(suggestion.objectId) || 0;
        suggestionScoreByObject.set(suggestion.objectId, Math.max(currentScore, suggestion.score));
      });

      const objects = getCompatibleObjects(meta).sort((a, b) => {
        const scoreDifference = (suggestionScoreByObject.get(b.id) || 0) - (suggestionScoreByObject.get(a.id) || 0);
        const aLabel = roleOnly ? getObjectRoleIdentity(a)?.displayLabel || a.label : getObjectDisplayLabel(a);
        const bLabel = roleOnly ? getObjectRoleIdentity(b)?.displayLabel || b.label : getObjectDisplayLabel(b);
        return scoreDifference || a.type.localeCompare(b.type) || aLabel.localeCompare(bLabel);
      });

      objects.forEach((object) => {
        const option = document.createElement("option");
        option.value = object.id;
        option.textContent = roleOnly
          ? getObjectRoleIdentity(object)?.displayLabel || getObjectDisplayLabel(object)
          : `${OBJECT_TYPE_LABELS[object.type] || humanizeKey(object.type)} — ${getObjectDisplayLabel(object)}`;
        tokenObjectSelect.appendChild(option);
      });

      if (objects.length === 0) {
        blankOption.textContent = `No ${restriction.label.toLowerCase()} records available`;
      }

      if (selectedObjectId && objects.some((object) => object.id === selectedObjectId)) {
        tokenObjectSelect.value = selectedObjectId;
      }
    }

    function populateFieldOptions(meta, objectId, selectedFieldKey = "") {
      tokenFieldSelect.replaceChildren();
      const object = getObjectById(objectId);

      if (!object) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Choose an object first";
        tokenFieldSelect.appendChild(option);
        tokenFieldSelect.disabled = true;
        return;
      }

      tokenFieldSelect.disabled = false;
      const fieldKeys = getCompatibleFieldKeys(meta, object).sort((a, b) => {
        return scoreBindingCandidate(meta, object, b) - scoreBindingCandidate(meta, object, a) || a.localeCompare(b);
      });

      if (fieldKeys.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No compatible fields on this object";
        tokenFieldSelect.appendChild(option);
        tokenFieldSelect.disabled = true;
        return;
      }

      fieldKeys.forEach((fieldKey) => {
        const option = document.createElement("option");
        option.value = fieldKey;
        const value = object.fields[fieldKey];
        option.textContent = `${humanizeKey(fieldKey)} — ${hasUsableValue(value) ? value : "(blank)"}`;
        tokenFieldSelect.appendChild(option);
      });

      if (selectedFieldKey && fieldKeys.includes(selectedFieldKey)) {
        tokenFieldSelect.value = selectedFieldKey;
      }
    }

    function updateBindingPreview() {
      const object = getObjectById(tokenObjectSelect.value);
      const fieldKey = tokenFieldSelect.value;
      const value = object?.fields?.[fieldKey];
      const meta = activeTokenElement ? getTokenMeta(activeTokenElement) : null;
      const roleOnly = viewMode === "roles";

      if (!object) {
        tokenBindingPreview.textContent = roleOnly
          ? "Choose the specific operational object this token represents."
          : "Choose an object and field, select a suggestion, or enter custom text.";
        bindTokenButton.disabled = true;
        return;
      }

      if (roleOnly) {
        const roleIdentity = getObjectRoleIdentity(object);
        tokenBindingPreview.textContent = roleIdentity
          ? `Role binding: ${roleIdentity.displayLabel}`
          : "Choose an operational object.";
        bindTokenButton.disabled = !meta || !fieldKey || !isCompatibleBinding(meta, object, fieldKey);
        return;
      }

      if (!fieldKey) {
        tokenBindingPreview.textContent = "Choose an object field, select a suggestion, or enter custom text.";
        bindTokenButton.disabled = true;
        return;
      }

      if (!meta || !isCompatibleBinding(meta, object, fieldKey)) {
        tokenBindingPreview.textContent = "That object or field is not compatible with this placeholder.";
        bindTokenButton.disabled = true;
        return;
      }

      bindTokenButton.disabled = !hasUsableValue(value);
      tokenBindingPreview.textContent = hasUsableValue(value)
        ? `Resolved value: ${value}`
        : "That field is currently blank. Populate it before binding.";
    }

    function renderTokenSuggestions(meta) {
      tokenSuggestions.replaceChildren();

      getSuggestedBindings(meta, 6).forEach((suggestion) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion-button";
        button.dataset.objectId = suggestion.objectId;
        button.dataset.fieldKey = suggestion.fieldKey;
        button.textContent = `${suggestion.objectLabel} → ${suggestion.fieldLabel}: ${suggestion.value}`;
        button.addEventListener("click", () => {
          tokenObjectSelect.value = suggestion.objectId;
          populateFieldOptions(meta, suggestion.objectId, suggestion.fieldKey);
          updateBindingPreview();
        });
        tokenSuggestions.appendChild(button);
      });
    }

    function openTokenDialog(token, returnFocus = token) {
      activeTokenElement = token;
      activeTokenKey = token.dataset.tokenKey;
      activeDialogReturnFocus = returnFocus;
      const meta = getTokenMeta(token);
      const binding = tokenBindings.get(activeTokenKey);
      const resolution = resolveBinding(binding);
      const typeMode = viewMode === "types";
      const roleMode = viewMode === "roles";
      const bindingsMode = viewMode === "bindings";
      const fullBindingMode = viewMode === "values" || bindingsMode;
      const dialogVerb = typeMode ? "Set type for" : roleMode ? "Set role for" : bindingsMode ? "Audit" : "Set value for";

      tokenDialogTitle.textContent = `${dialogVerb} [${meta.placeholder}]`;
      tokenDialogContext.textContent = `${meta.sourceFieldLabel} · ${meta.sourceSectionId === "manual" ? "manually entered token" : `source event: ${meta.sourceFieldId}`}`;
      const restriction = describeTokenRestriction(meta);
      tokenTypeRestriction.textContent = typeMode
        ? "Choose the broad semantic category. Changing it clears any object binding that no longer belongs to that category."
        : roleMode
          ? `Choose which specific ${restriction.label.toLowerCase()} record this token represents. Values remain hidden in this layer.`
          : restriction.message;
      tokenObjectLabel.textContent = roleMode ? "Operational object / role" : restriction.label;
      tokenCategorySection.hidden = !(typeMode || bindingsMode);
      tokenSuggestionsSection.hidden = !fullBindingMode;
      tokenRoleSelectorControl.hidden = !roleMode;
      tokenObjectControl.hidden = typeMode || roleMode;
      tokenFieldControl.hidden = typeMode || roleMode;
      tokenBindingPreview.hidden = typeMode;
      tokenCustomControl.hidden = typeMode || roleMode;
      tokenDialogActions.hidden = typeMode;
      customTokenButton.hidden = roleMode;
      bindTokenButton.textContent = roleMode ? "Save Semantic Role" : "Bind Object Field";
      populateCategoryOptions(meta, binding, resolution);

      if (roleMode) {
        populateRoleSelectorOptions(meta);
      }

      if (fullBindingMode) {
        renderTokenSuggestions(meta);
      } else {
        tokenSuggestions.replaceChildren();
      }

      const boundObject = binding?.mode === "object" ? getObjectById(binding.objectId) : null;
      const bindingIsCompatible = Boolean(
        boundObject && isCompatibleBinding(meta, boundObject, binding.fieldKey)
      );
      populateObjectOptions(meta, bindingIsCompatible ? binding.objectId : "");

      const firstSuggestion = getSuggestedBindings(meta, 1)[0];
      const initialObjectId = bindingIsCompatible
        ? binding.objectId
        : firstSuggestion?.objectId || "";
      const initialFieldKey = bindingIsCompatible
        ? binding.fieldKey
        : firstSuggestion?.fieldKey || "";

      if (initialObjectId) {
        tokenObjectSelect.value = initialObjectId;
      }

      populateFieldOptions(meta, initialObjectId, initialFieldKey);
      tokenCustomValue.value = binding?.mode === "custom" ? binding.customValue : "";
      customTokenButton.disabled = tokenCustomValue.value.trim() === "";
      updateBindingPreview();
      if (roleMode) {
        bindTokenButton.disabled = !tokenRoleSelectorSelect.value;
        tokenBindingPreview.textContent = tokenRoleSelectorSelect.value
          ? "This role selector is saved with the reusable template; the actual person or object is resolved per encounter."
          : "Choose the reusable operational role represented by this token.";
      }
      tokenModal.hidden = false;
      requestAnimationFrame(() => {
        if (typeMode) {
          tokenCategorySelect.focus();
        } else {
          tokenObjectSelect.focus();
        }
      });
    }

    function closeTokenDialog() {
      tokenModal.hidden = true;
      const returnFocus = activeDialogReturnFocus || activeTokenElement;
      activeTokenElement = null;
      activeTokenKey = "";
      activeDialogReturnFocus = null;

      if (returnFocus?.isConnected) {
        returnFocus.focus();
      }
    }

    function openHelpDialog() {
      helpModal.hidden = false;
      requestAnimationFrame(() => helpDialogClose.focus());
    }

    function closeHelpDialog() {
      helpModal.hidden = true;
      helpButton.focus();
    }

    function bindActiveTokenToObject() {
      const meta = activeTokenElement ? getTokenMeta(activeTokenElement) : null;
      const roleOnly = viewMode === "roles";

      if (roleOnly && meta) {
        if (bindActiveTokenToRoleSelector(meta)) {
          closeTokenDialog();
          markTemplateChanged();
          refreshTokenDisplays({ autoBind: true, replaceStale: true });
        }
        return;
      }

      if (!activeTokenKey || !tokenObjectSelect.value || !tokenFieldSelect.value) {
        return;
      }

      const object = getObjectById(tokenObjectSelect.value);
      const value = object?.fields?.[tokenFieldSelect.value];

      if (
        !meta ||
        !isCompatibleBinding(meta, object, tokenFieldSelect.value) ||
        (!roleOnly && !hasUsableValue(value))
      ) {
        return;
      }

      tokenBindings.set(activeTokenKey, {
        mode: "object",
        objectId: tokenObjectSelect.value,
        fieldKey: tokenFieldSelect.value
      });

      closeTokenDialog();
      markTemplateChanged();
      refreshTokenDisplays();
    }

    function bindActiveTokenToCustomText() {
      const customValue = tokenCustomValue.value.trim();

      if (!activeTokenKey || !customValue) {
        return;
      }

      tokenBindings.set(activeTokenKey, {
        mode: "custom",
        customValue
      });
      closeTokenDialog();
      markTemplateChanged();
      refreshTokenDisplays();
    }

    function unbindActiveToken() {
      if (activeTokenKey) {
        tokenBindings.delete(activeTokenKey);
      }

      if (viewMode === "roles" && activeTokenElement) {
        setTemplateTokenRule(getTokenMeta(activeTokenElement), {
          selector: null,
          fieldKey: null
        });
      }

      closeTokenDialog();
      markTemplateChanged();
      refreshTokenDisplays();
    }

    function autoBindAllTokens() {
      const seenKeys = new Set();
      let boundCount = 0;

      draft.querySelectorAll(".binding-token").forEach((token) => {
        const meta = getTokenMeta(token);

        if (seenKeys.has(meta.key)) {
          return;
        }

        seenKeys.add(meta.key);

        if (ensureAutoBinding(meta, true)) {
          boundCount += 1;
        }
      });

      if (boundCount > 0) {
        markTemplateChanged();
      }

      refreshTokenDisplays();
      return boundCount;
    }

    function updateDataPacketStatus() {
      if (!dataPacket) {
        dataPacketStatus.classList.remove("loaded");
        dataPacketStatus.textContent = "Data: none";
        dataPacketStatus.title = "No data packet loaded. Event-time bindings and custom text are still available.";
        return;
      }

      dataPacketStatus.classList.add("loaded");
      dataPacketStatus.textContent = `Data: ${dataPacket.packet_name} · ${dataPacket.objects.length} objects`;
      dataPacketStatus.title = `${dataPacket.packet_name} · ${dataPacket.objects.length} objects${dataPacket.is_test_data ? " · synthetic test data" : ""}`;
    }

    function loadDataPacket(packet) {
      dataPacket = normalizeDataPacket(packet);
      dataObjectById = new Map(dataPacket.objects.map((object) => [object.id, object]));

      const validObjectIds = new Set(getObjectCatalog().map((object) => object.id));
      tokenBindings.forEach((binding, key) => {
        if (binding.mode === "object" && !validObjectIds.has(binding.objectId)) {
          tokenBindings.delete(key);
        }
      });

      updateDataPacketStatus();
      markTemplateChanged();
      const boundCount = autoBindAllTokens();
      // Always refresh Bindings subject directory (even when draft has zero tokens yet)
      refreshVariablesView();
      const subjectCount = (dataPacket.objects || []).filter(isSubjectParticipant).length;
      updateStatus(
        `${dataPacket.packet_name} loaded · ${dataPacket.objects.length} objects` +
          (subjectCount ? ` · ${subjectCount} subject${subjectCount === 1 ? "" : "s"}` : "") +
          `. ${boundCount} token binding${boundCount === 1 ? "" : "s"} added automatically.`
      );
      emitDataChange("data-loaded");
      return cloneTemplateData(dataPacket);
    }

    function clearDataPacket() {
      dataPacket = null;
      dataObjectById = new Map();
      tokenBindings.forEach((binding, key) => {
        if (binding.mode === "object" && !String(binding.objectId).startsWith("event:")) {
          tokenBindings.delete(key);
        }
      });
      updateDataPacketStatus();
      refreshTokenDisplays({ autoBind: true, replaceStale: true });
      markTemplateChanged();
      updateStatus("Data packet cleared. Custom text and populated event-time bindings were preserved.");
      emitDataChange("data-cleared");
    }

    /* ======================================================================
       PUBLIC INTEGRATION API IMPLEMENTATION

       Functions in this region are the supported bridge to the larger OpDoc
       application. They return detached JSON-safe values so a host cannot
       accidentally mutate internal Maps, DOM nodes, or template records.
       ====================================================================== */

    function applyModuleConfigurationToUi() {
      runTokenDemoButton.hidden = !moduleConfig.enableDemo;
      loadTestDataButton.hidden = !moduleConfig.enableTestPacket;
      importDataButton.hidden = !moduleConfig.enableJsonImport;
      clearDataButton.hidden = moduleConfig.mode === "embedded";
      templateManagerButton.hidden = !moduleConfig.canEditTemplates;
      saveTemplateButton.hidden = !moduleConfig.canEditTemplates;
      if (activeTemplateStatus) {
        activeTemplateStatus.hidden = !moduleConfig.canEditTemplates;
      }
      detectTokensButton.hidden = moduleConfig.mode === "embedded";
      form.querySelectorAll(".field-edit-button, .section-drag-handle")
        .forEach((control) => {
          control.hidden = !moduleConfig.canEditTemplates;
        });
      form.querySelectorAll(".field-add-button, .field-remove-button, .field-drag-handle")
        .forEach((control) => {
          control.hidden = !moduleConfig.canComposeNarrative;
        });
      form.querySelectorAll(".field-repeat-actions").forEach((group) => {
        const buttons = Array.from(group.querySelectorAll("button"));
        group.hidden = !buttons.some((button) => !button.hidden);
      });
      const hostRoot = form.closest(".narrative-engine-host") || form;
      hostRoot.classList.toggle("narrative-authoring", moduleConfig.canEditTemplates);
      hostRoot.classList.toggle("narrative-composition", moduleConfig.canComposeNarrative);
      const toolbar = document.querySelector(".editor-toolbar");
      if (toolbar) {
        toolbar.querySelectorAll(".toolbar-group").forEach((group) => {
          const controls = Array.from(
            group.querySelectorAll("button, input, select, .template-status")
          );
          if (!controls.length) {
            return;
          }
          group.hidden = !controls.some((control) => !control.hidden);
        });
      }
    }

    function configureModule(options = {}) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError("configure(options) requires a configuration object.");
      }

      const nextMode = options.mode === "embedded" ? "embedded" : options.mode === "standalone" ? "standalone" : moduleConfig.mode;
      const embeddedDefaults = nextMode === "embedded" ? {
        enableDemo: false,
        enableTestPacket: false,
        enableJsonImport: false,
        enableLocalStorage: false,
        canEditTemplates: false,
        canComposeNarrative: false,
        canEditSourceValues: false,
        requireResolvedBeforeCopy: true
      } : {};
      const booleanKeys = [
        "enableDemo", "enableTestPacket", "enableJsonImport", "enableLocalStorage",
        "canEditTemplates", "canComposeNarrative", "canEditSourceValues",
        "requireResolvedBeforeCopy", "allowUnknownFields"
      ];
      /*
        An explicit mode transition starts from that mode's defaults. Without
        this reset, switching embedded -> standalone would leave authoring and
        storage controls disabled from the prior production configuration.
      */
      const modeChanged = options.mode && nextMode !== moduleConfig.mode;
      const configurationBase = modeChanged
        ? { ...DEFAULT_MODULE_CONFIG, allowedMessageOrigins: moduleConfig.allowedMessageOrigins }
        : moduleConfig;
      const normalized = { ...configurationBase, ...embeddedDefaults, mode: nextMode };

      booleanKeys.forEach((key) => {
        if (typeof options[key] === "boolean") {
          normalized[key] = options[key];
        }
      });
      normalized.allowedMessageOrigins = Array.isArray(options.allowedMessageOrigins)
        ? [...new Set(options.allowedMessageOrigins.map((origin) => String(origin || "").trim()).filter(Boolean))].slice(0, 20)
        : moduleConfig.allowedMessageOrigins;
      moduleConfig = normalized;

      if (!moduleConfig.enableLocalStorage) {
        savedTemplates = [];
        templateStorageAvailable = false;
      } else if (savedTemplates.length === 0) {
        loadSavedTemplatesFromStorage();
      }

      applyModuleConfigurationToUi();
      emitIntegrationEvent("opdoc:narrative-configuration-change", {
        mode: moduleConfig.mode,
        canEditTemplates: moduleConfig.canEditTemplates,
        canComposeNarrative: moduleConfig.canComposeNarrative,
        canEditSourceValues: moduleConfig.canEditSourceValues
      });
      return cloneTemplateData(moduleConfig);
    }

    function setSourceEditHandler(handler) {
      if (handler !== null && typeof handler !== "function") {
        throw new TypeError("setSourceEditHandler(handler) requires a function or null.");
      }

      sourceEditHandler = handler;
      refreshVariablesView();
      return Boolean(sourceEditHandler);
    }

    /**
     * Registers a host-specific adapter for one object type.
     *
     * The adapter receives the original object and may return either a fields
     * object or `{ fields, label, role }`. Built-in aliases run first; explicit
     * `rawObject.fields` values run last and therefore remain authoritative.
     */
    function registerObjectAdapter(type, adapter) {
      const normalizedType = String(type || "").trim().toLowerCase();

      if (!normalizedType || typeof adapter !== "function") {
        throw new TypeError("registerObjectAdapter(type, adapter) requires a type and function.");
      }

      objectAdapters.set(normalizedType, adapter);
      return true;
    }

    function unregisterObjectAdapter(type) {
      return objectAdapters.delete(String(type || "").trim().toLowerCase());
    }

    /** Wraps an ordinary OpDoc object array in the canonical packet envelope. */
    function setObjects(objects, metadata = {}) {
      if (!Array.isArray(objects)) {
        throw new TypeError("setObjects(objects) requires an array.");
      }

      return loadDataPacket({
        schema_version: metadata.schema_version || metadata.schemaVersion || DATA_SCHEMA,
        packet_id: metadata.packet_id || metadata.packetId || createLocalId("packet"),
        packet_name: metadata.packet_name || metadata.packetName || metadata.name || "COPDoc narrative objects",
        is_test_data: Boolean(metadata.is_test_data || metadata.isTestData),
        metadata: metadata.metadata,
        objects
      });
    }

    function getDataPacketSnapshot() {
      return dataPacket ? cloneTemplateData(dataPacket) : null;
    }

    function getNarrativeText(options = {}) {
      const requestedMode = typeof options === "string" ? options : options.mode || "resolved";

      if (requestedMode === "template") {
        return getPlainNarrative("template");
      }

      if (requestedMode === "plain") {
        syncResolvedDraft();
        return resolvedDraft.value.trim();
      }

      if (requestedMode !== "resolved") {
        throw new Error('Narrative mode must be "template", "resolved", or "plain".');
      }

      return getPlainNarrative("resolved");
    }

    function getBindingManifest() {
      return collectVariableRecords().map((record) => ({
        slotKey: record.key,
        slotId: record.meta.slotId,
        placeholder: record.meta.placeholder,
        sourceFieldId: record.meta.sourceFieldId,
        sourceSectionId: record.meta.sourceSectionId,
        category: record.typeCategory,
        status: record.status,
        occurrences: record.occurrences,
        roleSelector: cloneTemplateData(getTemplateTokenRule(record.meta)?.selector || null),
        binding: record.binding?.mode === "object"
          ? {
            mode: "object",
            objectId: record.binding.objectId,
            entityId: record.resolution.object?.entity_id || record.binding.objectId,
            fieldKey: record.binding.fieldKey
          }
          : record.binding?.mode === "custom"
            ? { mode: "custom" }
            : null,
        resolvedValue: record.resolution.value || ""
      }));
    }

    function validateNarrative(options = {}) {
      const stage = String(options.stage || "edit").toLowerCase();
      const errors = [];
      const warnings = [];
      const tokenStatus = getTokenStatus();

      collectVariableRecords().forEach((record) => {
        if (["unresolved", "stale"].includes(record.status)) {
          errors.push({
            code: record.status === "stale" ? "STALE_BINDING" : "UNRESOLVED_VARIABLE",
            slotKey: record.key,
            message: `[${record.meta.placeholder}] is ${record.status}.`
          });
        }
      });

      let precedingMinutes = null;
      getChronologicalFieldRows().forEach((wrapper) => {
        const input = wrapper.querySelector(".event-time");

        if (!input || input.disabled || !input.value) {
          return;
        }

        const [hours, minutes] = input.value.split(":").map(Number);
        const currentMinutes = hours * 60 + minutes;

        if (precedingMinutes !== null && currentMinutes < precedingMinutes) {
          warnings.push({
            code: "TIME_ORDER_REVERSED",
            fieldId: wrapper.dataset.fieldId,
            message: `${wrapper.querySelector("label")?.textContent || wrapper.dataset.fieldId} occurs earlier than the preceding narrative event.`
          });
        }

        precedingMinutes = currentMinutes;
      });

      const incidentGroups = new Map();
      form.querySelectorAll('.field[data-repeat-group="force_incident"]').forEach((wrapper) => {
        const instance = wrapper.dataset.instanceNumber || "1";
        incidentGroups.set(instance, wrapper);
      });
      incidentGroups.forEach((contextWrapper, instance) => {
        const hasForce = getSelectsByBaseFieldId("force_type", contextWrapper).some((select) => Boolean(select.value));
        const hasWindow = getSelectsByBaseFieldId("window_break", contextWrapper).some((select) => Boolean(select.value));

        if ((hasForce || hasWindow) && !getSelectsByBaseFieldId("incident_subject", contextWrapper).some((select) => Boolean(select.value))) {
          errors.push({ code: "INCIDENT_SUBJECT_REQUIRED", incident: instance, message: `Force Incident ${instance} has no subject.` });
        }

        if ((hasForce || hasWindow) && !getIncidentReason(contextWrapper)) {
          errors.push({ code: "INCIDENT_CONDUCT_REQUIRED", incident: instance, message: `Force Incident ${instance} has no qualifying conduct.` });
        }
      });

      return {
        schema: "opdoc.narrative-validation.v1",
        stage,
        valid: errors.length === 0,
        errors,
        warnings,
        tokenStatus: cloneTemplateData(tokenStatus)
      };
    }

    /** Returns the complete host-facing result without exposing DOM nodes. */
    function getNarrativeOutput() {
      const tokenStatus = getTokenStatus();
      syncResolvedDraft();
      const validation = validateNarrative({ stage: "review" });
      const sections = getStructuredNarrativeSections();
      const generatedResolvedText = sections.map((section) => section.resolvedText).filter(Boolean).join("\n\n");

      return {
        schema: OUTPUT_SCHEMA,
        moduleVersion: MODULE_VERSION,
        build: MODULE_BUILD,
        masterHash: MASTER_SCHEMA_HASH,
        generatedAt: new Date().toISOString(),
        template: getPlainNarrative("template"),
        resolved: generatedResolvedText,
        generatedResolvedText,
        plainText: resolvedDraft.value.trim(),
        plainTextIsManual: resolvedManualEdits,
        dynamicDraftIsManual: manualEdits,
        view: viewMode,
        activeTemplate: getActiveTemplateSummary(),
        tokenStatus: cloneTemplateData(tokenStatus),
        bindings: getBindingManifest(),
        sections,
        factsManifest: getFactsManifest(),
        provenance: {
          masterSource: __narLib.masterSource || null,
          masterHash: MASTER_SCHEMA_HASH,
          sourceMasterBuild: activeTemplateSourceMasterBuild || MODULE_BUILD,
          packetId: dataPacket?.packet_id || null,
          packetSourceSchema: dataPacket?.source_schema_version || null
        },
        validation
      };
    }

    function getModuleStatus() {
      const tokenStatus = getTokenStatus();
      return {
        ready: moduleReady,
        moduleVersion: MODULE_VERSION,
        build: MODULE_BUILD,
        view: viewMode,
        template: getActiveTemplateSummary(),
        data: {
          loaded: Boolean(dataPacket),
          packetId: dataPacket?.packet_id || null,
          packetName: dataPacket?.packet_name || null,
          objectCount: dataPacket?.objects?.length || 0
        },
        selections: countSelections(),
        tokenStatus: cloneTemplateData(tokenStatus),
        hasManualDynamicEdits: manualEdits,
        hasManualPlainTextEdits: resolvedManualEdits,
        hasPendingRebuild: selectionsPending || resolvedPending
      };
    }

    function captureEncounterSelections() {
      return Object.fromEntries(
        Array.from(form.querySelectorAll("select[id]"))
          .filter((select) => Boolean(select.value))
          .map((select) => [select.id, select.value])
      );
    }

    function captureEncounterTimes() {
      return Object.fromEntries(
        Array.from(form.querySelectorAll(".event-time[id]"))
          .filter((input) => !input.disabled && Boolean(input.value))
          .map((input) => [input.id.replace(/_time$/, ""), {
            value: input.value,
            mode: input.dataset.timeMode === "manual" ? "manual" : "auto"
          }])
      );
    }

    function serializeMap(map) {
      return Array.from(map.entries()).map(([key, value]) => [key, cloneTemplateData(value)]);
    }

    function stateEntries(value) {
      if (Array.isArray(value)) {
        return value;
      }

      return value && typeof value === "object" ? Object.entries(value) : [];
    }

    function migrateTokenKey(rawKey) {
      const key = String(rawKey || "");

      if (key.includes("::slot:")) {
        return key;
      }

      const separatorIndex = key.indexOf("::");

      if (separatorIndex < 0) {
        return key;
      }

      return makeTokenKey(key.slice(0, separatorIndex), key.slice(separatorIndex + 2));
    }

    function migrateTokenKeyAgainstDraft(rawKey) {
      const key = String(rawKey || "");

      if (key.includes("::slot:")) {
        return key;
      }

      const separatorIndex = key.indexOf("::");
      const sourceFieldId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : "";
      const placeholder = separatorIndex >= 0 ? normalizePlaceholderLabel(key.slice(separatorIndex + 2)) : "";
      const matchingToken = Array.from(draft.querySelectorAll(".binding-token")).find((token) =>
        token.dataset.sourceFieldId === sourceFieldId && token.dataset.placeholder === placeholder
      ) || Array.from(draft.querySelectorAll(".binding-token")).find((token) =>
        token.dataset.sourceFieldId === sourceFieldId
      );
      return matchingToken?.dataset.tokenKey || migrateTokenKey(key);
    }

    function captureTemplateState(options = {}) {
      const activeSavedTemplate = getSavedTemplate(activeTemplateId);
      const includeDefaults = options.includeDefaults ?? activeSavedTemplate?.includeDefaults ?? false;
      const useCurrentSelections = options.includeCurrentSelections === true;
      return {
        schema: TEMPLATE_SCHEMA,
        id: activeSavedTemplate?.id || activeTemplateId || "master",
        name: activeSavedTemplate?.name || activeTemplateName || "Master",
        description: activeSavedTemplate?.description || "",
        includeDefaults: Boolean(includeDefaults),
        sourceMasterBuild: activeSavedTemplate?.sourceMasterBuild || activeTemplateSourceMasterBuild || MODULE_BUILD,
        masterBuild: MODULE_BUILD,
        activeTemplate: getActiveTemplateSummary(),
        sections: captureWorkingTemplateSections(Boolean(includeDefaults), useCurrentSelections)
      };
    }

    /**
     * Produces a resumable JSON-safe state object.
     *
     * Source data and the browser template library are opt-in because they may
     * contain sensitive data or be stored separately by the host application.
     */
    function getIntegrationState(options = {}) {
      const includeData = Boolean(options.includeData);
      const includeTemplates = Boolean(options.includeTemplates);
      const output = getNarrativeOutput();
      const state = {
        schema: STATE_SCHEMA,
        moduleVersion: MODULE_VERSION,
        build: MODULE_BUILD,
        capturedAt: new Date().toISOString(),
        template: captureTemplateState({ includeDefaults: true, includeCurrentSelections: false }),
        encounter: {
          selections: captureEncounterSelections(),
          times: captureEncounterTimes(),
          tokenBindings: serializeMap(tokenBindings),
          tokenTypeOverrides: serializeMap(tokenTypeOverrides),
          view: viewMode
        },
        narrative: {
          template: output.template,
          resolved: output.resolved,
          sections: output.sections,
          factsManifest: output.factsManifest,
          plainText: output.plainText,
          plainTextIsManual: output.plainTextIsManual,
          dynamicDraftIsManual: output.dynamicDraftIsManual
        }
      };

      if (includeData) {
        state.dataPacket = getDataPacketSnapshot();
      }

      if (includeTemplates) {
        state.savedTemplates = cloneTemplateData(savedTemplates);
      }

      return state;
    }

    function normalizeRestoredBinding(rawBinding) {
      if (!rawBinding || typeof rawBinding !== "object") {
        return null;
      }

      if (rawBinding.mode === "custom" && hasUsableValue(rawBinding.customValue)) {
        return { mode: "custom", customValue: String(rawBinding.customValue).trim() };
      }

      if (rawBinding.mode === "object" && hasUsableValue(rawBinding.objectId) && hasUsableValue(rawBinding.fieldKey)) {
        return {
          mode: "object",
          objectId: String(rawBinding.objectId),
          fieldKey: toCanonicalFieldKey(rawBinding.fieldKey)
        };
      }

      return null;
    }

    function restoreSavedTemplates(records) {
      if (!Array.isArray(records)) {
        throw new Error("savedTemplates must be an array when loadTemplates is enabled.");
      }

      savedTemplates = records.map(normalizeSavedTemplate);
      persistSavedTemplates();
    }

    /**
     * Restores a state captured by getState(). Validation happens before the
     * working template is replaced. Unknown selection IDs and obsolete option
     * IDs are ignored so older encounter states can survive Master additions.
     */
    function loadIntegrationState(state, options = {}) {
      if (!state || typeof state !== "object") {
        throw new TypeError("loadState(state) requires a state object.");
      }

      if (state.schema && state.schema !== STATE_SCHEMA && !LEGACY_SCHEMAS.state.includes(state.schema)) {
        throw new Error(`Unsupported narrative state schema: ${state.schema}`);
      }

      const rawSections = state.template?.sections;
      const normalizedSections = normalizeWorkingTemplateSections(rawSections);
      const normalizedPacket = options.loadData === false || !state.dataPacket
        ? null
        : normalizeDataPacket(state.dataPacket);
      const normalizedSavedTemplates = options.loadTemplates === true
        ? (Array.isArray(state.savedTemplates) ? state.savedTemplates.map(normalizeSavedTemplate) : [])
        : null;
      const activeTemplateIdFromState = String(state.template?.activeTemplate?.id || "master");

      integrationEventSuppression += 1;
      try {
        if (normalizedSavedTemplates) {
          savedTemplates = normalizedSavedTemplates;
          persistSavedTemplates();
        }

        applyWorkingTemplate(normalizedSections, {
          templateId: activeTemplateIdFromState,
          templateName: state.template?.activeTemplate?.name,
          sourceMasterBuild: state.template?.sourceMasterBuild ?? state.template?.activeTemplate?.sourceMasterBuild ??
            state.template?.masterBuild ?? (LEGACY_SCHEMAS.state.includes(state.schema) ? 7 : MODULE_BUILD),
          savedSnapshot: normalizedSections,
          statusMessage: "Narrative state restored."
        });

        if (options.loadData !== false) {
          dataPacket = normalizedPacket;
          dataObjectById = new Map((dataPacket?.objects || []).map((object) => [object.id, object]));
          updateDataPacketStatus();
        }

        form.querySelectorAll("select[id]").forEach((select) => {
          select.value = "";
        });

        Object.entries(state.encounter?.selections || {}).forEach(([fieldId, optionId]) => {
          const select = document.getElementById(fieldId);

          if (select && Array.from(select.options).some((option) => option.value === optionId)) {
            select.value = optionId;
          }
        });

        updateConditionalLogic();
        Object.entries(state.encounter?.times || {}).forEach(([fieldId, timeState]) => {
          const timeInput = document.getElementById(`${fieldId}_time`);
          const normalizedTime = normalizeEventTimeInput(timeState?.value);

          if (!timeInput || timeInput.disabled || normalizedTime === null) {
            return;
          }

          timeInput.value = normalizedTime;
          timeInput.dataset.timeMode = timeState?.mode === "manual" ? "manual" : "auto";

          if (timeInput.dataset.timeMode === "manual") {
            timeInput.dataset.lastManualValue = normalizedTime;
          }
        });
        synchronizeChronologicalEventTimes();

        tokenBindings.clear();
        tokenTypeOverrides.clear();
        replaceDraftWithSelections();
        tokenBindings.clear();
        tokenTypeOverrides.clear();

        stateEntries(state.encounter?.tokenBindings).forEach(([key, rawBinding]) => {
          const binding = normalizeRestoredBinding(rawBinding);

          if (hasUsableValue(key) && binding) {
            tokenBindings.set(migrateTokenKeyAgainstDraft(key), binding);
          }
        });
        stateEntries(state.encounter?.tokenTypeOverrides).forEach(([key, category]) => {
          if (hasUsableValue(key) && VARIABLE_TYPE_CONFIG[category]) {
            tokenTypeOverrides.set(migrateTokenKeyAgainstDraft(key), String(category));
          }
        });
        refreshTokenDisplays({ autoBind: options.autoBind === true });

        workingTemplateDirty = Boolean(state.template?.activeTemplate?.dirty);
        updateActiveTemplateStatus();

        if (
          options.restorePlainText !== false &&
          (state.narrative?.plainTextIsManual || state.narrative?.dynamicDraftIsManual) &&
          typeof state.narrative.plainText === "string"
        ) {
          resolvedDraft.value = state.narrative.plainText;
          resolvedManualEdits = true;
          resolvedFromRevision = templateRevision;
          resolvedPending = false;
        } else {
          syncResolvedDraft({ force: true });
        }

        setViewMode(state.encounter?.view || options.view || "types");
        updateStatus("Narrative state restored.");
      } finally {
        integrationEventSuppression -= 1;
      }

      emitTemplateChange("state-restored");
      emitDataChange("state-restored");
      emitNarrativeChange("state-restored");
      return getNarrativeOutput();
    }

    /** Loads a reusable template record or `{ sections }` without UI prompts. */
    function loadTemplateFromApi(template, options = {}) {
      if (template?.schema && template.schema !== TEMPLATE_SCHEMA && !LEGACY_SCHEMAS.template.includes(template.schema)) {
        throw new Error(`Unsupported narrative template schema: ${template.schema}`);
      }

      const sections = Array.isArray(template) ? template : template?.sections;
      const normalizedSections = normalizeWorkingTemplateSections(sections);
      applyWorkingTemplate(normalizedSections, {
        templateId: String(template?.id || options.templateId || "master"),
        templateName: String(template?.name || options.templateName || ""),
        sourceMasterBuild: template?.sourceMasterBuild ?? template?.masterBuild ??
          (LEGACY_SCHEMAS.template.includes(template?.schema) ? 7 : MODULE_BUILD),
        savedSnapshot: normalizedSections,
        statusMessage: options.statusMessage || "Template loaded by COPDoc."
      });
      return captureTemplateState({ includeDefaults: Boolean(template?.includeDefaults) });
    }

    function rebuildFromApi() {
      replaceDraftWithSelections();
      syncResolvedDraft({ force: true });
      updateStatus("Narrative rebuilt by COPDoc.");
      return getNarrativeOutput();
    }

    function setViewFromApi(mode) {
      setViewMode(mode);
      return viewMode;
    }

    /** Applies host-owned field selections without synthesizing DOM clicks. */
    function setSelectionsFromApi(selections, options = {}) {
      if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
        throw new TypeError("setSelections(selections) requires an object keyed by field instance ID.");
      }
      const rejected = [];
      Object.entries(selections).forEach(([fieldId, optionId]) => {
        const select = document.getElementById(fieldId);
        const normalizedOptionId = String(optionId ?? "");
        if (!select || !Array.from(select.options).some((option) => option.value === normalizedOptionId)) {
          rejected.push({ fieldId, optionId: normalizedOptionId });
          return;
        }
        select.value = normalizedOptionId;
      });
      updateConditionalLogic();
      if (options.rebuild !== false) {
        replaceDraftWithSelections();
        syncResolvedDraft({ force: true });
      }
      return { rejected, output: getNarrativeOutput() };
    }

    /**
     * Returns the small, non-case-specific contract a host can use to validate
     * projections before calling setObjects() or setDataPacket(). The canonical
     * OpDoc records remain outside this module; only whitelisted scalar fields
     * should cross the narrative boundary.
     */
    function getDataContract() {
      return {
        schemas: {
          data: DATA_SCHEMA,
          state: STATE_SCHEMA,
          output: OUTPUT_SCHEMA,
          template: TEMPLATE_SCHEMA,
          legacy: cloneTemplateData(LEGACY_SCHEMAS)
        },
        limits: cloneTemplateData(INPUT_LIMITS),
        objectTypes: Object.keys(OBJECT_TYPE_LABELS).map((type) => ({
          type,
          label: OBJECT_TYPE_LABELS[type],
          fields: cloneTemplateData(CANONICAL_FIELDS_BY_TYPE[type] || [])
        })),
        roleShape: {
          role: "stable_semantic_role",
          ordinal: "positive_integer"
        },
        tokenSlotSyntax: "[PLACEHOLDER::stable_slot_id]"
      };
    }

    function isAllowedBridgeOrigin(origin) {
      return origin === window.location.origin || moduleConfig.allowedMessageOrigins.includes(origin);
    }

    async function executeBridgeCommand(command, payload = {}) {
      const api = window.OpDocNarrative;
      const commands = {
        configure: () => api.configure(payload),
        getContract: () => api.getContract(),
        getStatus: () => api.getStatus(),
        setDataPacket: () => api.setDataPacket(payload.packet || payload),
        loadPacket: () => api.setDataPacket(payload.packet || payload),
        setObjects: () => api.setObjects(payload.objects || [], payload.metadata || {}),
        setSelections: () => api.setSelections(payload.selections || payload, payload.options || {}),
        getOutput: () => api.getOutput(),
        getState: () => api.getState(payload.options || payload),
        loadState: () => api.loadState(payload.state || payload, payload.options || {}),
        resetEncounter: () => api.resetEncounter(payload.options || payload),
        loadTemplate: () => api.loadTemplate(payload.template || payload, payload.options || {}),
        validate: () => api.validate(payload.options || payload),
        setView: () => api.setView(payload.mode || payload)
      };

      if (!commands[command]) {
        throw new Error(`Unsupported narrative bridge command: ${command}`);
      }

      return await commands[command]();
    }

    async function handleBridgeMessage(event) {
      if (event.source !== window.parent || !isAllowedBridgeOrigin(event.origin)) {
        return;
      }

      const message = event.data;

      if (!message || typeof message !== "object") {
        return;
      }

      const isVersionedRequest = message.channel === "opdoc:narrative" && message.kind === "request";
      const isLegacyRequest = ["loadPacket", "getState", "getOutput", "resetEncounter"].includes(message.type);

      if (!isVersionedRequest && !isLegacyRequest) {
        return;
      }

      const requestId = String(message.requestId || message.id || createLocalId("request"));
      const command = isVersionedRequest ? message.command : message.type;

      try {
        const result = await executeBridgeCommand(command, message.payload || {});
        event.source.postMessage({
          channel: "opdoc:narrative",
          kind: "response",
          requestId,
          ok: true,
          result
        }, event.origin);

        if (message.type === "loadPacket") {
          event.source.postMessage({ type: "state", payload: getNarrativeOutput() }, event.origin);
        }
      } catch (error) {
        const errorPayload = {
          code: "NARRATIVE_BRIDGE_ERROR",
          message: error instanceof Error ? error.message : String(error)
        };
        event.source.postMessage({
          channel: "opdoc:narrative",
          kind: "response",
          requestId,
          ok: false,
          error: errorPayload
        }, event.origin);

        if (isLegacyRequest) {
          event.source.postMessage({ type: "error", error: errorPayload }, event.origin);
        }
      }
    }

    function announceBridgeReady() {
      if (window.parent === window || !document.referrer) {
        return;
      }

      try {
        const parentOrigin = new URL(document.referrer).origin;

        if (!isAllowedBridgeOrigin(parentOrigin)) {
          return;
        }

        window.parent.postMessage({
          channel: "opdoc:narrative",
          kind: "ready",
          apiVersion: 1,
          moduleVersion: MODULE_VERSION,
          schemas: PUBLIC_SCHEMAS
        }, parentOrigin);
        window.parent.postMessage({ type: "ready", version: MODULE_VERSION }, parentOrigin);
      } catch (error) {
        // An invalid or unavailable referrer simply disables the bridge announcement.
      }
    }

    function runTokenDemo() {
      const demoSelections = [
        ["origin_type", "preplanned_targeted_arrest"],
        ["encounter_location_type", "residence"],
        ["final_outcome", "transported_ice_office"],
        ["claimed_health", "claims_good_health"],
        ["medication_statement", "claims_no_medications"],
        ["currency_statement", "usd_in_possession"],
        ["subject_nationality", "mexican"],
        ["identity_documents", "documents_in_property"],
        ["bwc_closing_statement", "bwc_worn"]
      ];

      demoSelections.forEach(([fieldId, optionId]) => {
        const select = document.getElementById(fieldId);

        if (select && !select.disabled && !select.value) {
          select.value = optionId;
        }
      });

      updateConditionalLogic();
      manualEdits = false;
      selectionsPending = false;
      resolvedDraft.value = "";
      resolvedFromRevision = -1;
      resolvedManualEdits = false;
      resolvedPending = false;
      replaceDraftWithSelections();
      loadDataPacket(JSON.parse(JSON.stringify(TEST_DATA_PACKET)));
      setViewMode("types");

      const tokens = Array.from(draft.querySelectorAll(".binding-token"));
      tokens.forEach((token) => token.classList.add("demo-highlight"));

      window.setTimeout(() => {
        tokens.forEach((token) => token.classList.remove("demo-highlight"));
      }, 3000);

      const firstToken = tokens[0];

      if (firstToken) {
        firstToken.scrollIntoView({ block: "center", behavior: "smooth" });
        firstToken.focus({ preventScroll: true });
      }

      updateStatus("Demo ready. Move through Types, Roles, Values, and Plain Text to inspect the same live bindings at each level.");
    }

    /* ======================================================================
       UI EVENT WIRING
       These handlers adapt user actions into the same engine used by the host
       API. The public API never synthesizes clicks or reaches into modal DOM.
       ====================================================================== */
    draft.addEventListener("input", () => {
      manualEdits = true;
      markTemplateChanged();
      updateStatus("Draft edited manually. Your prose is protected; use Rebuild Draft to replace it from the dropdowns.");
    });

    resolvedDraft.addEventListener("input", () => {
      resolvedManualEdits = true;
      updateStatus("Plain-text narrative edited manually. The dynamic template remains preserved.");
      emitNarrativeChange("plain-text-edited");
    });

    draft.addEventListener("click", (event) => {
      const token = event.target.closest(".binding-token");

      if (token && draft.contains(token)) {
        event.preventDefault();
        openTokenDialog(token);
      }
    });

    draft.addEventListener("keydown", (event) => {
      const token = event.target.closest?.(".binding-token");

      if (token && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        openTokenDialog(token);
      }
    });

    draft.addEventListener("paste", (event) => {
      const plainText = event.clipboardData?.getData("text/plain");

      if (plainText === undefined) {
        return;
      }

      event.preventDefault();
      document.execCommand("insertText", false, plainText);
    });

    tokenObjectSelect.addEventListener("change", () => {
      if (!activeTokenElement) {
        return;
      }

      populateFieldOptions(getTokenMeta(activeTokenElement), tokenObjectSelect.value);
      updateBindingPreview();
    });
    tokenRoleSelectorSelect.addEventListener("change", () => {
      bindTokenButton.disabled = !tokenRoleSelectorSelect.value;
      tokenBindingPreview.textContent = tokenRoleSelectorSelect.value
        ? "This reusable role will resolve to the matching encounter object."
        : "Choose a semantic role.";
    });
    tokenFieldSelect.addEventListener("change", updateBindingPreview);
    tokenCustomValue.addEventListener("input", () => {
      customTokenButton.disabled = tokenCustomValue.value.trim() === "";
    });

    tokenDialogClose.addEventListener("click", closeTokenDialog);
    tokenModal.addEventListener("click", (event) => {
      if (event.target === tokenModal) {
        closeTokenDialog();
      }
    });
    templateManagerButton.addEventListener("click", () => openTemplateManager(templateManagerButton));
    saveTemplateButton.addEventListener("click", saveActiveTemplate);
    templateDialogClose.addEventListener("click", closeTemplateManager);
    templateModal.addEventListener("click", (event) => {
      if (event.target === templateModal) {
        closeTemplateManager();
      }
    });
    templateLibrarySelect.addEventListener("change", populateTemplateFormFromSelection);
    saveTemplateAsButton.addEventListener("click", saveTemplateAsNew);
    updateTemplateButton.addEventListener("click", updateSelectedTemplate);
    loadTemplateButton.addEventListener("click", loadSelectedTemplate);
    deleteTemplateButton.addEventListener("click", deleteSelectedTemplate);
    exportTemplateButton.addEventListener("click", exportSelectedTemplate);
    importTemplateButton.addEventListener("click", () => templateImportInput.click());
    templateImportInput.addEventListener("change", async () => {
      const file = templateImportInput.files?.[0];

      if (file) {
        await importTemplateFile(file);
      }

      templateImportInput.value = "";
    });
    addMasterElementButton.addEventListener("click", addSelectedMasterElement);
    restoreMasterLayoutButton.addEventListener("click", restoreMasterLayout);

    elementEditorClose.addEventListener("click", () => closeElementEditor());
    cancelElementChangesButton.addEventListener("click", () => closeElementEditor());
    elementEditorModal.addEventListener("click", (event) => {
      if (event.target === elementEditorModal) {
        closeElementEditor();
      }
    });
    elementOptionSelect.addEventListener("change", () => {
      commitElementEditorInputs();
      loadElementEditorOption(elementOptionSelect.value);
    });
    elementLabelInput.addEventListener("input", () => {
      if (elementEditorState) {
        elementEditorState.field.label = elementLabelInput.value;
      }
    });
    elementOptionLabelInput.addEventListener("input", () => {
      const option = getElementStagingOption();

      if (option) {
        option.label = elementOptionLabelInput.value;
      }
    });
    elementHasEventTimeCheckbox.addEventListener("change", () => {
      if (elementEditorState) {
        elementEditorState.field.hasEventTime = elementHasEventTimeCheckbox.checked;
      }
    });
    elementSentenceInput.addEventListener("input", () => {
      const option = getElementStagingOption();

      if (option) {
        option.text = elementSentenceInput.value;
      }

      renderElementSentencePreview();
    });
    elementValueTextInput.addEventListener("input", () => {
      const option = getElementStagingOption();

      if (option) {
        option.valueText = elementValueTextInput.value;
      }
    });
    elementIncidentReasonInput.addEventListener("input", () => {
      const option = getElementStagingOption();

      if (option) {
        option.incidentReason = elementIncidentReasonInput.value;
      }
    });
    insertElementVariableButton.addEventListener("click", insertElementVariable);
    resetElementOptionButton.addEventListener("click", resetCurrentElementOption);
    revertElementSavedButton.addEventListener("click", revertCurrentElementToSavedTemplate);
    resetElementMasterButton.addEventListener("click", resetCurrentElementToMaster);
    removeElementLayoutButton.addEventListener("click", removeCurrentElementFromLayout);
    applyElementChangesButton.addEventListener("click", applyElementEditorChanges);

    helpButton.addEventListener("click", openHelpDialog);
    helpDialogClose.addEventListener("click", closeHelpDialog);
    helpModal.addEventListener("click", (event) => {
      if (event.target === helpModal) {
        closeHelpDialog();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elementEditorModal.hidden) {
        closeElementEditor();
      } else if (event.key === "Escape" && !templateModal.hidden) {
        closeTemplateManager();
      } else if (event.key === "Escape" && !tokenModal.hidden) {
        closeTokenDialog();
      } else if (event.key === "Escape" && !helpModal.hidden) {
        closeHelpDialog();
      }
    });

    bindTokenButton.addEventListener("click", bindActiveTokenToObject);
    setTokenCategoryButton.addEventListener("click", setActiveTokenCategory);
    customTokenButton.addEventListener("click", bindActiveTokenToCustomText);
    unbindTokenButton.addEventListener("click", unbindActiveToken);
    typesViewButton.addEventListener("click", () => setViewMode("types"));
    rolesViewButton.addEventListener("click", () => setViewMode("roles"));
    valuesViewButton.addEventListener("click", () => setViewMode("values"));
    plainTextViewButton.addEventListener("click", () => setViewMode("plain"));
    bindingsViewButton.addEventListener("click", () => setViewMode("bindings"));
    autoBindButton.addEventListener("click", () => {
      const boundCount = autoBindAllTokens();
      updateStatus(boundCount
        ? `${boundCount} unresolved token binding${boundCount === 1 ? " was" : "s were"} filled automatically.`
        : "No additional compatible bindings were available.");
    });
    detectTokensButton.addEventListener("click", tokenizeLoosePlaceholders);
    runTokenDemoButton.addEventListener("click", runTokenDemo);
    loadTestDataButton.addEventListener("click", () => {
      loadDataPacket(JSON.parse(JSON.stringify(TEST_DATA_PACKET)));
    });
    importDataButton.addEventListener("click", () => dataPacketInput.click());
    dataPacketInput.addEventListener("change", async () => {
      const file = dataPacketInput.files?.[0];

      if (!file) {
        return;
      }

      try {
        const packet = JSON.parse(await file.text());
        loadDataPacket(packet);
      } catch (error) {
        updateStatus(`Data packet not loaded: ${error.message}`);
      } finally {
        dataPacketInput.value = "";
      }
    });
    clearDataButton.addEventListener("click", clearDataPacket);
    rebuildButton.addEventListener("click", rebuildDraft);
    copyButton.addEventListener("click", copyNarrative);
    clearButton.addEventListener("click", clearAll);

    /* ======================================================================
       BOOTSTRAP AND PUBLIC SURFACE
       Render first, then publish the API and readiness event. A host that adds
       its listener too late can simply test `window.OpDocNarrative` directly.
       ====================================================================== */
    if (window.OpDocNarrativeConfig && typeof window.OpDocNarrativeConfig === "object") {
      configureModule(window.OpDocNarrativeConfig);
    }
    loadSavedTemplatesFromStorage();
    renderForm();
    updateConditionalLogic();
    updateDataPacketStatus();
    replaceDraftWithSelections();
    setViewMode("types");
    updateActiveTemplateStatus();
    populateMasterElementSelect();

    const PUBLIC_SCHEMAS = deepFreeze({
      data: DATA_SCHEMA,
      state: STATE_SCHEMA,
      output: OUTPUT_SCHEMA,
      template: TEMPLATE_SCHEMA
    });
    const PUBLIC_EVENTS = deepFreeze({
      ready: "opdoc:narrative-ready",
      narrativeChange: "opdoc:narrative-change",
      dataChange: "opdoc:narrative-data-change",
      templateChange: "opdoc:narrative-template-change",
      configurationChange: "opdoc:narrative-configuration-change",
      sourceEditRequest: "opdoc:narrative-source-edit-request"
    });

    window.OpDocNarrative = Object.freeze({
      version: MODULE_VERSION,
      build: MODULE_BUILD,
      schemas: PUBLIC_SCHEMAS,
      events: PUBLIC_EVENTS,
      supportedObjectTypes: Object.freeze(Object.keys(OBJECT_TYPE_LABELS)),
      configure: configureModule,
      getConfiguration: () => cloneTemplateData(moduleConfig),
      getContract: getDataContract,
      setDataPacket: loadDataPacket,
      setObjects,
      getDataPacket: getDataPacketSnapshot,
      clearData: clearDataPacket,
      registerObjectAdapter,
      unregisterObjectAdapter,
      setSourceEditHandler,
      setCopyOutputHandler: function (handler) {
        if (handler !== null && typeof handler !== "function") throw new TypeError("Copy output handler must be a function or null.");
        copyOutputHandler = handler;
      },
      getNarrative: getNarrativeText,
      getOutput: getNarrativeOutput,
      getSections: getStructuredNarrativeSections,
      validate: validateNarrative,
      getBindingManifest,
      getStatus: getModuleStatus,
      getState: getIntegrationState,
      loadState: loadIntegrationState,
      resetEncounter: resetEncounterState,
      getTemplate: captureTemplateState,
      loadTemplate: loadTemplateFromApi,
      listSavedTemplates: () => cloneTemplateData(savedTemplates),
      getMasterTemplate: () => ({
        schema: TEMPLATE_SCHEMA,
        id: "master",
        name: "Master",
        masterBuild: MODULE_BUILD,
        sections: createWorkingTemplateFromMaster()
      }),
      rebuild: rebuildFromApi,
      setSelections: setSelectionsFromApi,
      setView: setViewFromApi
    });

    moduleReady = true;
    window.addEventListener("message", handleBridgeMessage);
    emitIntegrationEvent(PUBLIC_EVENTS.ready, {
      apiName: "OpDocNarrative",
      schemas: PUBLIC_SCHEMAS,
      supportedObjectTypes: window.OpDocNarrative.supportedObjectTypes
    });
    announceBridgeReady();
  
      return window.OpDocNarrative;
    }
    window.__opdocNarrativeBootstrap = __opdocNarrativeBootstrap;
    if (!(window.COPDoc && window.COPDoc.narratives && window.COPDoc.narratives.deferBoot)) {
      __opdocNarrativeBootstrap();
    }
})(typeof window !== "undefined" ? window : globalThis);
