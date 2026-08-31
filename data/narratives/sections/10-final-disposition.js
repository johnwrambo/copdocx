/**
 * Narrative Master — 10. Final Disposition
 * Section id: `final_disposition`
 *
 * Edit option labels and `text` sentence templates here.
 * Placeholders like [SUBJECT] stay in bracket form for the engine.
 * Keep option `id` values stable if saved templates depend on them.
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var N = (root.narratives = root.narratives || {});
  N._sectionBuilders = N._sectionBuilders || [];

  N._sectionBuilders.push(function build_final_disposition(N) {
    return (
  {
          id: "final_disposition",
          title: "10. Final Disposition",
          description: "Where did the subject ultimately go, and how did the encounter end?",
          fields: [
            {
              id: "final_outcome",
              label: "Final outcome",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "transported_ice_office",
                  label: "Arrested and transported to field office",
                  text: "[SUBJECT] was arrested and transported to the [FIELD OFFICE] for processing."
                },
                {
                  id: "subject_released",
                  label: "Released",
                  text: "[SUBJECT] was released."
                },
                {
                  id: "transferred_detention",
                  label: "Transferred to detention facility",
                  text: "Following processing, Officers transferred [SUBJECT] to [FACILITY]."
                },
                {
                  id: "remained_agency_custody",
                  label: "Remained in other agency custody",
                  text: "[SUBJECT] remained in the custody of [AGENCY] pending [ACTION]."
                },
                {
                  id: "released_scene",
                  label: "Released at scene",
                  text: "Officers released [SUBJECT] at the scene after determining [REASON FOR RELEASE]."
                },
                {
                  id: "processed_released",
                  label: "Processed and released",
                  text: "Following processing, Officers released [SUBJECT] pursuant to [DISPOSITION]."
                },
                {
                  id: "medical_assessment",
                  label: "Transported for medical assessment",
                  text: "Officers transported [SUBJECT] to [MEDICAL FACILITY] for medical assessment."
                },
                {
                  id: "target_not_located",
                  label: "Target not located",
                  text: "Officers did not locate [SUBJECT] during the operation, and no enforcement action was taken."
                }
              ]
            },
            {
              id: "claimed_health",
              label: "Claimed health",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "claims_good_health",
                  label: "Claims good health",
                  text: "[SUBJECT] claims to be in good health."
                }
              ]
            },
            {
              id: "minor_children_statement",
              label: "Minor children in the United States",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "claims_no_minor_children_us",
                  label: "Claims no minor children in the United States",
                  text: "[SUBJECT] claims no minor children in the United States."
                }
              ]
            },
            {
              id: "medication_statement",
              label: "Medication statement",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "claims_named_medications",
                  label: "Claims to take listed medications",
                  text: "[SUBJECT] claims to take [MEDICATIONS]."
                },
                {
                  id: "claims_no_medications",
                  label: "Claims to take no medications",
                  text: "[SUBJECT] claims to take no medications."
                }
              ]
            },
            {
              id: "currency_statement",
              label: "Currency in possession",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "usd_in_possession",
                  label: "United States currency",
                  text: "[SUBJECT] is in possession of $[AMOUNT] USD."
                }
              ]
            },
            {
              id: "subject_nationality",
              label: "Subject nationality",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "mexican",
                  label: "Mexican",
                  text: "",
                  valueText: "MEXICAN"
                },
                {
                  id: "other_nationality",
                  label: "Other or unresolved country",
                  text: "",
                  valueText: "[COUNTRY]"
                }
              ]
            },
            {
              id: "identity_documents",
              label: "Identity documents",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "documents_in_property",
                  label: "In detainee property",
                  text: "[DOCUMENT NATIONALITY] IDENTITY DOCUMENTS ARE IN THE DETAINEE'S PROPERTY."
                },
                {
                  id: "no_identity_documents",
                  label: "No identity documents in possession",
                  text: "DETAINEE NOT IN POSSESSION OF ANY IDENTITY DOCUMENTS."
                }
              ]
            },
            {
              id: "bwc_closing_statement",
              label: "Body-worn camera",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "bwc_worn",
                  label: "BWC worn — include closing statement",
                  text: "This narrative summarizes the material events and is not a verbatim transcript or frame-by-frame account of the BWC (Body Worn Camera) recording. Unless enclosed in quotation marks, statements may be paraphrased, and nonmaterial details may be condensed for clarity. The narrative accurately reflects the substance of the events as known to the reporting Officer."
                },
                {
                  id: "bwc_not_worn",
                  label: "BWC not worn — no closing statement",
                  text: ""
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
