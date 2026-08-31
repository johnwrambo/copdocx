/**
 * Narrative Master — 2. Authority and Basis
 * Section id: `authority`
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

  N._sectionBuilders.push(function build_authority(N) {
    return (
  {
          id: "authority",
          title: "2. Authority and Basis",
          description: "What supported the encounter, detention, or arrest?",
          fields: [
            {
              id: "existing_authority",
              label: "Existing authority or enforcement basis",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "form_i200",
                  label: "Form I-200",
                  text: "Before the encounter, an authorized immigration officer issued Form I-200, Warrant for Arrest of Alien, for [SUBJECT]."
                },
                {
                  id: "final_order",
                  label: "Final administrative order",
                  text: "Immigration records reflected that [SUBJECT] was subject to a final administrative order of removal."
                },
                {
                  id: "form_i205",
                  label: "Form I-205",
                  text: "Form I-205, Warrant of Removal/Deportation, had been issued for [SUBJECT]."
                },
                {
                  id: "warrantless_basis",
                  label: "Warrantless administrative-arrest basis",
                  text: "Based on [ARREST FACTS], Officers had reason to believe that [SUBJECT] was in the United States in violation of law and was likely to escape before a warrant could be obtained."
                },
                {
                  id: "existing_agency_custody",
                  label: "Existing agency custody",
                  text: "At the time of the encounter, [SUBJECT] was in the lawful custody of [AGENCY]."
                },
                {
                  id: "other_authority",
                  label: "Other authority",
                  text: "Officers acted pursuant to [AUTHORITY AND BASIS]."
                }
              ]
            },
            {
              id: "initial_encounter_level",
              label: "Initial encounter level",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "consensual_encounter",
                  label: "Consensual encounter",
                  text: "Officers initially contacted [SUBJECT] during a consensual encounter."
                },
                {
                  id: "investigative_detention",
                  label: "Investigative detention",
                  text: "Based on [SPECIFIC ARTICULABLE FACTS], Officers temporarily detained [SUBJECT] to investigate identity and immigration status."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
