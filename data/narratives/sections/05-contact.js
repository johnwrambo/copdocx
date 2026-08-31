/**
 * Narrative Master — 5. Contact
 * Section id: `contact`
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

  N._sectionBuilders.push(function build_contact(N) {
    return (
  {
          id: "contact",
          title: "5. Contact",
          description: "How did Officers initiate contact?",
          hasEventTimes: true,
          fields: [
            {
              id: "contact_method",
              label: "Contact method",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "approached_on_foot",
                  label: "Approached on foot",
                  text: "Officers approached [SUBJECT] on foot, displayed their credentials, identified themselves as police, and requested identification."
                },
                {
                  id: "outside_residence",
                  label: "Contact outside residence",
                  text: "Officers approached [SUBJECT] outside [ADDRESS], displayed their credentials, and identified themselves as police."
                },
                {
                  id: "knock_and_talk",
                  label: "Doorway or knock-and-talk",
                  text: "Officers approached [ADDRESS], knocked on the door, and identified themselves as police."
                },
                {
                  id: "parked_vehicle_contact",
                  label: "Occupant of parked vehicle",
                  text: "Officers approached [VEHICLE], displayed their credentials, identified themselves as police, and made contact with the occupants."
                },
                {
                  id: "vehicle_stop",
                  label: "Vehicle stop",
                  text: "Officers followed the vehicle and identified a suitable location to conduct a vehicle stop. At approximately [STOP TIME] hours, Officers activated the emergency lights on their government vehicles and initiated a vehicle stop near [STOP LOCATION]."
                },
                {
                  id: "partner_vehicle_stop",
                  label: "Partner-agency vehicle stop",
                  text: "At the request of Officers, [AGENCY] initiated a vehicle stop on [VEHICLE] near [LOCATION]."
                },
                {
                  id: "custodial_handoff",
                  label: "Custodial handoff",
                  text: "Officers identified themselves to [AGENCY] personnel and assumed custody of [SUBJECT]."
                }
              ]
            },
            {
              id: "commands",
              label: "Commands",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "show_hands_exit_vehicle",
                  label: "Show hands and exit vehicle",
                  text: "Officers approached the vehicle and issued verbal commands in [LANGUAGE] directing the occupants to show their hands and exit the vehicle."
                },
                {
                  id: "step_outside",
                  label: "Step outside",
                  text: "Officers issued verbal commands directing [SUBJECT] to step outside."
                },
                {
                  id: "remain_in_place",
                  label: "Remain in place",
                  text: "Officers directed [SUBJECT] to remain in place and keep both hands visible."
                }
              ]
            },
            {
              id: "vehicle_containment",
              label: "Vehicle containment",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "blocked_or_pinned",
                  label: "Vehicle blocked or pinned",
                  text: "Officers positioned their government vehicles to prevent [VEHICLE] from leaving the location."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
