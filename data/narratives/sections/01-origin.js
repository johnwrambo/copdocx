/**
 * Narrative Master — 1. Origin
 * Section id: `origin`
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

  N._sectionBuilders.push(function build_origin(N) {
    return (
  {
          id: "origin",
          title: "1. Origin",
          description: "Why did ICE become involved?",
          fields: [
            {
              id: "origin_type",
              label: "Origin type",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "preplanned_targeted_arrest",
                  label: "Preplanned targeted arrest",
                  text: "Officers conducted a preplanned enforcement action to locate and arrest [SUBJECT]."
                },
                {
                  id: "elite_lead",
                  label: "ELITE lead",
                  text: "Officers received an ELITE lead identifying [SUBJECT] as a potential target for enforcement action."
                },
                {
                  id: "eid_review",
                  label: "EID record review",
                  text: "A review of EID records identified [SUBJECT] as a potential target for enforcement action."
                },
                {
                  id: "earm_review",
                  label: "EARM case review",
                  text: "A review of EARM records identified [SUBJECT] as a potential target for enforcement action."
                },
                {
                  id: "other_database_review",
                  label: "Other database or case review",
                  text: "A review of [DATABASE] records identified [SUBJECT] as a potential target for enforcement action."
                },
                {
                  id: "plate_registration_check",
                  label: "License-plate or registration check",
                  text: "A license-plate and vehicle-registration query identified [VEHICLE], bearing [PLATE], as associated with [SUBJECT]."
                },
                {
                  id: "ice_component_referral",
                  label: "Referral from another ICE component",
                  text: "[ICE COMPONENT] referred [SUBJECT] for possible enforcement action based on [REFERRAL INFORMATION]."
                },
                {
                  id: "federal_referral",
                  label: "Referral from another federal agency",
                  text: "[AGENCY] referred [SUBJECT] to ICE for possible enforcement action based on [REFERRAL INFORMATION]."
                },
                {
                  id: "state_referral",
                  label: "Referral from a state agency",
                  text: "[AGENCY] referred [SUBJECT] to ICE for possible enforcement action based on [REFERRAL INFORMATION]."
                },
                {
                  id: "local_referral",
                  label: "Referral from a local agency",
                  text: "[AGENCY] referred [SUBJECT] to ICE for possible enforcement action based on [REFERRAL INFORMATION]."
                },
                {
                  id: "collateral_encounter",
                  label: "Collateral encounter",
                  text: "Officers encountered [SUBJECT] while conducting an enforcement action concerning [TARGET]."
                },
                {
                  id: "other_origin",
                  label: "Other origin",
                  text: "Officers initiated the enforcement action based on [ORIGIN DETAILS]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
