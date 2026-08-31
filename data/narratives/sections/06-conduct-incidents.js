/**
 * Narrative Master — 6. Subject Conduct and Incidents
 * Section id: `conduct`
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

  N._sectionBuilders.push(function build_conduct(N) {
    return (
  {
          id: "conduct",
          title: "6. Subject Conduct and Incidents",
          description: "Select the involved subject first. Force and window-break events then bind to that subject and the selected conduct.",
          fields: [
            {
              id: "incident_subject",
              repeatGroup: "force_incident",
              label: "Subject involved / force against",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "primary_subject",
                  label: "Primary subject / target",
                  text: "",
                  valueText: "[SUBJECT]"
                },
                {
                  id: "other_subject",
                  label: "Other encountered subject",
                  text: "",
                  valueText: "[OTHER SUBJECT]"
                },
                {
                  id: "unresolved_subject",
                  label: "Unresolved or custom subject",
                  text: "",
                  valueText: "[INCIDENT SUBJECT]"
                }
              ]
            },
            {
              id: "subject_conduct",
              repeatGroup: "force_incident",
              label: "Subject conduct",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "fully_compliant",
                  label: "Fully compliant",
                  text: "[INCIDENT SUBJECT] complied with Officers’ commands and did not actively resist detention or arrest."
                },
                {
                  id: "generally_compliant",
                  label: "Generally compliant",
                  text: "[INCIDENT SUBJECT] was generally compliant with Officers’ commands and did not actively resist detention or arrest."
                },
                {
                  id: "delayed_compliance",
                  label: "Delayed compliance",
                  text: "[INCIDENT SUBJECT] initially delayed compliance but subsequently complied with Officers’ commands."
                },
                {
                  id: "refused_commands",
                  label: "Refused commands",
                  text: "[INCIDENT SUBJECT] refused repeated verbal commands to [COMMAND].",
                  incidentReason: "refusing repeated verbal commands to [COMMAND]"
                },
                {
                  id: "active_resistance",
                  label: "Active resistance",
                  text: "[INCIDENT SUBJECT] actively resisted Officers by [CONDUCT].",
                  incidentReason: "actively resisting Officers by [CONDUCT]"
                },
                {
                  id: "assaultive_conduct",
                  label: "Assaultive conduct",
                  text: "[INCIDENT SUBJECT] engaged in assaultive conduct by [CONDUCT].",
                  incidentReason: "engaging in assaultive conduct by [CONDUCT]"
                },
                {
                  id: "concealed_hands",
                  label: "Refused to show hands",
                  text: "[INCIDENT SUBJECT] refused repeated commands to show both hands and keep them visible.",
                  incidentReason: "refusing repeated commands to show both hands and keep them visible"
                },
                {
                  id: "locked_vehicle_refused_exit",
                  label: "Locked vehicle and refused to exit",
                  text: "[INCIDENT SUBJECT] locked the vehicle doors and refused repeated commands to unlock the vehicle and exit.",
                  incidentReason: "locking the vehicle doors and refusing repeated commands to unlock the vehicle and exit"
                }
              ]
            },
            {
              id: "flight",
              repeatGroup: "force_incident",
              label: "Flight",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "fled_on_foot",
                  label: "Fled on foot and apprehended",
                  text: "[INCIDENT SUBJECT] fled from Officers on foot. Officers pursued [INCIDENT SUBJECT] and apprehended [INCIDENT SUBJECT] near [LOCATION].",
                  incidentReason: "fleeing from Officers on foot"
                },
                {
                  id: "fled_in_vehicle",
                  label: "Fled in vehicle",
                  text: "[INCIDENT SUBJECT] fled from Officers in [VEHICLE], resulting in a vehicle pursuit.",
                  incidentReason: "fleeing from Officers in [VEHICLE]"
                },
                {
                  id: "flight_prevented",
                  label: "Attempted flight prevented without pursuit",
                  text: "[INCIDENT SUBJECT] attempted to flee but was prevented from leaving the location.",
                  incidentReason: "attempting to flee the location"
                }
              ]
            },
            {
              id: "force_type",
              repeatGroup: "force_incident",
              label: "Type of force",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "physical_control",
                  label: "Physical control techniques",
                  text: "In response to [SUBJECT CONDUCT], Officers used physical control techniques against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "takedown",
                  label: "Takedown",
                  text: "In response to [SUBJECT CONDUCT], Officers used a takedown against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "ground_stabilization",
                  label: "Ground stabilization",
                  text: "In response to [SUBJECT CONDUCT], Officers used ground-stabilization techniques against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "control_hold",
                  label: "Control hold or joint manipulation",
                  text: "In response to [SUBJECT CONDUCT], Officers used a control hold or joint-manipulation technique against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "strikes",
                  label: "Strikes",
                  text: "In response to [SUBJECT CONDUCT], Officers used strikes against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "oc_spray",
                  label: "OC spray",
                  text: "In response to [SUBJECT CONDUCT], Officers deployed oleoresin capsicum spray against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "electronic_control_device",
                  label: "Electronic control device",
                  text: "In response to [SUBJECT CONDUCT], Officers deployed an electronic control device against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                },
                {
                  id: "other_force",
                  label: "Other technique or tool",
                  text: "In response to [SUBJECT CONDUCT], Officers used [TECHNIQUE OR TOOL] against [INCIDENT SUBJECT] to gain control. [FORCE RESULT]"
                }
              ]
            },
            {
              id: "force_result",
              repeatGroup: "force_incident",
              label: "Force injury result",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "no_injury",
                  label: "No injury reported or observed",
                  text: "",
                  valueText: "No injury was reported or observed."
                },
                {
                  id: "injury",
                  label: "Injury",
                  text: "",
                  valueText: "The use of force resulted in [INJURY DETAILS]."
                },
                {
                  id: "medical_evaluation",
                  label: "Medical evaluation or treatment",
                  text: "",
                  valueText: "Following the use of force, [INCIDENT SUBJECT] received [MEDICAL EVALUATION OR TREATMENT]."
                },
                {
                  id: "fatality",
                  label: "Fatality",
                  text: "",
                  valueText: "The use of force resulted in a fatality."
                }
              ]
            },
            {
              id: "window_break",
              repeatGroup: "force_incident",
              label: "Window broken",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "driver_front_window",
                  label: "Driver-side front window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke the driver-side front window of [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                },
                {
                  id: "passenger_front_window",
                  label: "Passenger-side front window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke the passenger-side front window of [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                },
                {
                  id: "driver_rear_window",
                  label: "Driver-side rear window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke the driver-side rear window of [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                },
                {
                  id: "passenger_rear_window",
                  label: "Passenger-side rear window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke the passenger-side rear window of [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                },
                {
                  id: "rear_window",
                  label: "Rear window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke the rear window of [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                },
                {
                  id: "other_window",
                  label: "Other window",
                  text: "In response to [SUBJECT CONDUCT], Officers broke [WINDOW] on [VEHICLE] using [WINDOW BREAK TOOL] to gain access to [INCIDENT SUBJECT]."
                }
              ]
            },
            {
              id: "window_break_tool",
              repeatGroup: "force_incident",
              label: "Window-break tool",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "window_punch",
                  label: "Window punch",
                  text: "",
                  valueText: "a window punch"
                },
                {
                  id: "baton",
                  label: "Baton",
                  text: "",
                  valueText: "a baton"
                },
                {
                  id: "other_tool",
                  label: "Other tool",
                  text: "",
                  valueText: "[TOOL]"
                }
              ]
            },
            {
              id: "collision",
              label: "Collision",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "collision_occurred",
                  label: "Collision occurred",
                  text: "During [EVENT], [VEHICLE 1] collided with [VEHICLE 2] near [LOCATION]. The collision resulted in [DAMAGE OR INJURY RESULT]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
