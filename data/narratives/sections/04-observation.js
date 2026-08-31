/**
 * Narrative Master — 4. Observation and Corroboration
 * Section id: `observation`
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

  N._sectionBuilders.push(function build_observation(N) {
    return (
  {
          id: "observation",
          title: "4. Observation and Corroboration",
          description: "What did Officers observe before contact?",
          hasEventTimes: true,
          fields: [
            {
              id: "surveillance_type",
              label: "Surveillance",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "static_surveillance",
                  label: "Static surveillance",
                  text: "Before making contact, Officers conducted static surveillance near [LOCATION]."
                },
                {
                  id: "mobile_surveillance",
                  label: "Mobile surveillance",
                  text: "Officers conducted mobile surveillance of [VEHICLE] from [STARTING LOCATION] to [CONTACT LOCATION]."
                },
                {
                  id: "static_mobile_surveillance",
                  label: "Static and mobile surveillance",
                  text: "Officers initially conducted static surveillance near [LOCATION] and subsequently conducted mobile surveillance of [VEHICLE]."
                }
              ]
            },
            {
              id: "corroboration_one",
              label: "Corroborating observation",
              options: N.CORROBORATION_OPTIONS
            },
            {
              id: "corroboration_two",
              label: "Additional corroborating observation",
              options: N.CORROBORATION_OPTIONS
            },
            {
              id: "corroboration_three",
              label: "Additional corroborating observation 2",
              options: N.CORROBORATION_OPTIONS
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
