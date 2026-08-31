/**
 * Narrative Master — 9. Vehicle, Property, and Evidence
 * Section id: `items`
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

  N._sectionBuilders.push(function build_items(N) {
    return (
  {
          id: "items",
          title: "9. Vehicle, Property, and Evidence",
          description: "What happened to vehicles, property, documents, and evidence?",
          fields: [
            {
              id: "vehicle_disposition",
              label: "Vehicle disposition",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "vehicle_left_secured",
                  label: "Left parked and secured",
                  text: "Officers left [VEHICLE] legally parked and secured at [LOCATION]."
                },
                {
                  id: "vehicle_left_keys_with_person",
                  label: "Left at location — keys left with person",
                  text: "[ENCOUNTERED VEHICLE] was left at [LOCATION], the keys being left with [PERSON]."
                },
                {
                  id: "vehicle_left_keys_in_location",
                  label: "Left at location — keys left in specific place",
                  text: "[ENCOUNTERED VEHICLE] was left at [LOCATION], the keys being left in [SPECIFIC LOCATION]."
                },
                {
                  id: "vehicle_left_keys_on_location",
                  label: "Left at location — keys left on specific place",
                  text: "[ENCOUNTERED VEHICLE] was left at [LOCATION], the keys being left on [SPECIFIC LOCATION]."
                },
                {
                  id: "vehicle_released",
                  label: "Released to another person",
                  text: "Officers released [VEHICLE] and the vehicle keys to [PERSON]."
                },
                {
                  id: "vehicle_towed",
                  label: "Towed",
                  text: "[TOW COMPANY] towed [VEHICLE] to [DESTINATION]."
                },
                {
                  id: "vehicle_impounded",
                  label: "Impounded or seized",
                  text: "Officers impounded [VEHICLE] and transported it to [DESTINATION]."
                },
                {
                  id: "vehicle_transferred",
                  label: "Transferred to another agency",
                  text: "Officers transferred custody of [VEHICLE] to [AGENCY]."
                }
              ]
            },
            {
              id: "property_disposition",
              label: "Personal-property disposition",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "property_retained",
                  label: "Remained with subject",
                  text: "[SUBJECT] retained all personal property."
                },
                {
                  id: "property_inventoried_transported",
                  label: "Inventoried and transported",
                  text: "Officers inventoried [SUBJECT]’s personal property, which accompanied [SUBJECT]."
                },
                {
                  id: "property_released",
                  label: "Released to another person",
                  text: "At [SUBJECT]’s request, Officers released [PROPERTY] to [PERSON]."
                },
                {
                  id: "property_stored",
                  label: "Stored as detainee property",
                  text: "Officers inventoried [PROPERTY] and retained it as detainee property."
                }
              ]
            },
            {
              id: "document_disposition",
              label: "Identification-document disposition",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "document_photographed_returned",
                  label: "Photographed and returned",
                  text: "Officers photographed [DOCUMENT] and returned it to [SUBJECT]."
                },
                {
                  id: "document_retained_property",
                  label: "Retained with property",
                  text: "[DOCUMENT] was inventoried and retained with [SUBJECT]’s personal property."
                },
                {
                  id: "document_seized",
                  label: "Seized as evidence",
                  text: "Officers seized [DOCUMENT] as evidence."
                }
              ]
            },
            {
              id: "evidence_disposition",
              label: "Evidence disposition",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "evidence_photographed",
                  label: "Photographed only",
                  text: "Officers photographed [ITEM] but did not take possession of the item."
                },
                {
                  id: "evidence_collected",
                  label: "Collected or seized",
                  text: "Officers collected [ITEM] as evidence."
                },
                {
                  id: "evidence_submitted",
                  label: "Submitted to evidence storage",
                  text: "Officers packaged and submitted [ITEM] to [EVIDENCE LOCATION]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
