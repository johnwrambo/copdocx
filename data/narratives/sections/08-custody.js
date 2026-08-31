/**
 * Narrative Master — 8. Enforcement Action and Custody
 * Section id: `custody`
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

  N._sectionBuilders.push(function build_custody(N) {
    return (
  {
          id: "custody",
          title: "8. Enforcement Action and Custody",
          description: "What action did Officers take with the subject?",
          fields: [
            {
              id: "enforcement_action",
              label: "Enforcement action",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "administrative_arrest_i200",
                  label: "Administrative arrest under I-200",
                  text: "Based on the foregoing facts, Officers placed [SUBJECT] under administrative arrest pursuant to the previously issued Form I-200."
                },
                {
                  id: "warrantless_administrative_arrest",
                  label: "Warrantless administrative arrest",
                  text: "Based on [FACTS SUPPORTING ARREST], Officers placed [SUBJECT] under warrantless administrative arrest."
                },
                {
                  id: "criminal_arrest",
                  label: "Criminal arrest",
                  text: "Officers placed [SUBJECT] under criminal arrest for [OFFENSE OR WARRANT]."
                },
                {
                  id: "detained_then_released",
                  label: "Temporary detention followed by release",
                  text: "After completing the inquiry, Officers released [SUBJECT] from temporary detention."
                },
                {
                  id: "released_no_action",
                  label: "Released without enforcement action",
                  text: "Officers concluded the encounter without taking enforcement action against [SUBJECT]."
                },
                {
                  id: "custody_assumed",
                  label: "Custody assumed from agency",
                  text: "Officers assumed custody of [SUBJECT] from [AGENCY]."
                }
              ]
            },
            {
              id: "restraints",
              label: "Restraints",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "handcuffs",
                  label: "Handcuffs",
                  text: "Officers applied handcuffs, checked them for proper fit, and double-locked them."
                },
                {
                  id: "other_restraints",
                  label: "Other restraints",
                  text: "Officers applied [RESTRAINT TYPE] based on [REASON]."
                }
              ]
            },
            {
              id: "search_type",
              label: "Search",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "search_incident_to_arrest",
                  label: "Search incident to arrest",
                  text: "Officers searched [SUBJECT] incident to arrest."
                },
                {
                  id: "protective_pat_down",
                  label: "Protective pat-down",
                  text: "Officers conducted a protective pat-down of [SUBJECT] for weapons."
                },
                {
                  id: "consent_search",
                  label: "Consent search",
                  text: "After obtaining consent, Officers searched [SUBJECT]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
