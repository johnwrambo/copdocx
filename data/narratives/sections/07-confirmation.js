/**
 * Narrative Master — 7. Confirmation
 * Section id: `confirmation`
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

  N._sectionBuilders.push(function build_confirmation(N) {
    return (
  {
          id: "confirmation",
          title: "7. Confirmation",
          description: "How were identity, alienage, and the right to remain established?",
          fields: [
            {
              id: "identity_confirmation",
              label: "Identity established by",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "name_dob",
                  label: "Name and date of birth provided",
                  text: "The individual provided the name [NAME] and date of birth [DOB]."
                },
                {
                  id: "identification_document",
                  label: "Identification document",
                  text: "The individual presented [DOCUMENT], which identified the individual as [SUBJECT]."
                },
                {
                  id: "foreign_identification",
                  label: "Foreign identification document",
                  text: "The individual possessed [DOCUMENT] issued by [COUNTRY], which identified the individual as [SUBJECT]."
                },
                {
                  id: "database_match",
                  label: "Database match",
                  text: "A review of [DATABASE] records confirmed the individual as [SUBJECT], A-number [A-NUMBER]."
                },
                {
                  id: "biometric_match",
                  label: "Biometric match",
                  text: "A biometric records check confirmed the individual as [SUBJECT], A-number [A-NUMBER]."
                },
                {
                  id: "officer_recognition",
                  label: "Officer recognition",
                  text: "[OFFICER] recognized and identified the individual as [SUBJECT]."
                }
              ]
            },
            {
              id: "alienage_confirmation",
              label: "Alienage established by",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "foreign_citizenship_statement",
                  label: "Statement of foreign citizenship",
                  text: "During questioning, [SUBJECT] stated [COUNTRY] citizenship and nationality."
                },
                {
                  id: "foreign_birth_statement",
                  label: "Statement of foreign birth",
                  text: "[SUBJECT] stated being born in [COUNTRY]."
                },
                {
                  id: "foreign_document",
                  label: "Foreign document",
                  text: "[SUBJECT] possessed [DOCUMENT] issued by [COUNTRY]."
                },
                {
                  id: "immigration_records_alienage",
                  label: "Immigration records",
                  text: "Immigration records identified [SUBJECT] as a citizen and national of [COUNTRY]."
                }
              ]
            },
            {
              id: "right_to_remain",
              label: "Right to be or remain established by",
              options: [
                N.NOT_INCLUDED,
                {
                  id: "no_lawful_right_admitted",
                  label: "No lawful right admitted",
                  text: "[SUBJECT] stated having no lawful right to be or to remain in the United States."
                },
                {
                  id: "entry_without_inspection",
                  label: "Entry without inspection",
                  text: "[SUBJECT] stated entering the United States without inspection at or near [LOCATION] on or about [DATE]."
                },
                {
                  id: "status_expired",
                  label: "Authorized period of stay expired",
                  text: "[SUBJECT] stated that the previously authorized period of stay had expired."
                },
                {
                  id: "no_documents_presented",
                  label: "No documents demonstrating current right",
                  text: "At the time of the encounter, [SUBJECT] did not present any document demonstrating a current right to be or to remain in the United States."
                },
                {
                  id: "records_confirmed_status",
                  label: "Records confirmed status or disposition",
                  text: "A review of [DATABASE] records confirmed that [SUBJECT] was [IMMIGRATION STATUS OR DISPOSITION]."
                },
                {
                  id: "final_order_confirmed",
                  label: "Final order confirmed",
                  text: "Immigration records confirmed that [SUBJECT] was subject to a final administrative order of removal dated [DATE]."
                }
              ]
            }
          ]
        }
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
