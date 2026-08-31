/**
 * Narrative Master — 3. Encounter Context
 * Section id: `context`
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

  N._sectionBuilders.push(function build_context(N) {
    return (
  {
          id: "context",
          title: "3. Encounter Context",
          description: "When and where did the encounter occur?",
          fields: [
            {
              id: "encounter_location_type",
              label: "Encounter setting",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "residence",
                  label: "Residence",
                  text: "On [DATE], at approximately [TIME] hours, Officers arrived at [ADDRESS] to conduct the enforcement action."
                },
                {
                  id: "workplace",
                  label: "Business or workplace",
                  text: "On [DATE], at approximately [TIME] hours, Officers arrived at [BUSINESS OR WORKPLACE] located at [ADDRESS]."
                },
                {
                  id: "public_place",
                  label: "Public place",
                  text: "On [DATE], at approximately [TIME] hours, Officers conducted the enforcement action near [LOCATION]."
                },
                {
                  id: "parked_vehicle",
                  label: "Parked vehicle",
                  text: "On [DATE], at approximately [TIME] hours, Officers located [VEHICLE] parked at [LOCATION]."
                },
                {
                  id: "moving_vehicle",
                  label: "Moving vehicle",
                  text: "On [DATE], at approximately [TIME] hours, Officers observed [VEHICLE] traveling near [LOCATION]."
                },
                {
                  id: "custodial_transfer",
                  label: "Custodial transfer",
                  text: "On [DATE], at approximately [TIME] hours, Officers responded to [FACILITY] to assume custody of [SUBJECT]."
                },
                {
                  id: "other_context",
                  label: "Other setting",
                  text: "On [DATE], at approximately [TIME] hours, Officers conducted an enforcement action at [LOCATION]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
