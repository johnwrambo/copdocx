# Narrative → Encounter review

The live Narrative page provides **Back to Evidence**, **Save**, and **Continue to Review** in the app bar. Evidence and Review return to the corresponding tab of the same Encounter.

Save retains the exact narrative output, editor state and source snapshot in `Encounter.narratives`. It also saves drafts retained while switching participants. These remain editable drafts until the Encounter is closed. Both navigation actions save pending drafts before leaving; a failed persistence operation leaves the editor open with its working text. A completed Encounter remains read-only.

The Encounter Review tab displays the saved prose using text content, including manually edited text. **Confirm and close encounter** copies these exact records into `Encounter.completed.narratives`; it does not regenerate them from newer source facts. Completion metadata and the Encounter lock establish the committed snapshot. Narrative workflow status is retained so the existing unlock/edit flow continues to work.

Unlocking retains the previous completed snapshot. Reclosing moves it into completion history and captures the new saved prose. Older completed records without narrative snapshots remain readable and are labeled as older snapshots; their history is not silently backfilled.

Implementation:

- `functions/app-bar.js`: live Narrative actions.
- `functions/narratives/narrative-page.js`: `saveNarrative`, `navigateEncounterStep`.
- `functions/encounters.js`: `openRequestedEncounterTab`, `paintReviewNarratives`.
- `functions/model/store.js`: `buildEncounterCompleted`.

Regression coverage: `scripts/test-stage3-narrative-page.js` verifies save-before-navigation, participant drafts, failed-save retention and read-only navigation. `scripts/test-encounter-narrative-snapshot.js` verifies review output, exact close snapshots, unlock/reclose history, failed persistence and stale close protection. Both run through the Stage 0–6 gate.
