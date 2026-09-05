/* Unmodified report builder/functions extracted from user-supplied Alien_Book_In_Docs_v1_12_0.html.
 * SHA-256 of source HTML: 40da14e495de15fa8986d7c1677a21ed196f934de283e98039b7aa0ab234bddf.
 * Test reference only; host supplies data, column and card dependencies. */
function escapeEmailReportHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

function formatLongReportDate(dateKey) {
      const [year, month, day] = String(dateKey || "")
        .split("-")
        .map(Number);

      if (![year, month, day].every(Number.isInteger)) {
        return dateKey || "";
      }

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(new Date(year, month - 1, day));
    }

function buildSelectedRecordsReport(
      views,
      { mode = "selected", todayKey = getLocalDateKey() } = {}
    ) {
      const isTodayReport = mode === "today";
      const dailySummary = isTodayReport
        ? buildDailyArrestSummary(todayKey)
        : null;
      const reportViews = isTodayReport
        ? dailySummary.todayViews
        : views;
      const baseballCardSnapshots =
        getBaseballCardSnapshotsForReport(reportViews, {
          isToday: isTodayReport,
          todayKey
        });
      const selectedEncounterNumbers = new Set(
        reportViews
          .map(view =>
            String(view.encounterNumber || "")
              .trim()
              .toLocaleUpperCase("en-US")
          )
          .filter(Boolean)
      );
      const selectedAlienCount = reportViews.length;
      const selectedEncounterCount =
        selectedEncounterNumbers.size;
      const selectedMissingEncounterCount = reportViews.filter(
        view => !String(view.encounterNumber || "").trim()
      ).length;
      const title = isTodayReport
        ? dailySummary.headline
        : `${DAILY_REPORT_UNIT_LABEL} Selected Arrest Report: ` +
          `${selectedAlienCount} ` +
          `${selectedAlienCount === 1 ? "alien" : "aliens"} in ` +
          `${selectedEncounterCount} ` +
          `${selectedEncounterCount === 1 ? "encounter" : "encounters"}.`;
      const selectedDateKeys = [
        ...new Set(
          reportViews
            .map(view => view.arrestDateKey)
            .filter(Boolean)
        )
      ].sort();
      const summary = isTodayReport
        ? dailySummary.arrestOfDayLine
        : selectedDateKeys.length === 1
          ? `Selected arrests from ${formatLongReportDate(selectedDateKeys[0])}.`
          : selectedDateKeys.length > 1
            ? `Selected arrests from ${formatLongReportDate(selectedDateKeys[0])} through ${formatLongReportDate(selectedDateKeys.at(-1))}.`
            : "Selected saved arrest records.";
      const columns = getVisibleSavedRecordColumns().map(
        column => ({
          ...column,
          label: column.reportLabel || column.tableLabel
        })
      );
      const headerCells = columns
        .map(column =>
          `<th style="padding:7px;border:1px solid #6b7280;background:#e5e7eb;text-align:left;vertical-align:top;">${escapeEmailReportHtml(column.label)}</th>`
        )
        .join("");
      const bodyRows = reportViews
        .map(view => {
          const cells = columns
            .map(column =>
              `<td style="padding:7px;border:1px solid #9ca3af;text-align:left;vertical-align:top;">${escapeEmailReportHtml(column.value(view))}</td>`
            )
            .join("");

          return `<tr>${cells}</tr>`;
        })
        .join("");
      const baseballCardReportHtml = baseballCardSnapshots
        .map(snapshot =>
          `<div style="margin:20px 0 0;">${buildBaseballCardEmailMarkup(
            snapshot.content,
            snapshot.photoDataUrl,
            snapshot.layout,
            snapshot.photoAdjustments
          )}</div>`
        )
        .join("");
      const baseballCardReportPlainText = baseballCardSnapshots
        .map(snapshot => buildBaseballCardPlainText(snapshot.content))
        .filter(Boolean)
        .join("\n\n");

      generatedEmailReportHtml =
        `<div style="font-family:Arial,sans-serif;color:#111827;">` +
        `<h2 style="margin:0 0 6px;font-size:20px;">${escapeEmailReportHtml(title)}</h2>` +
        `<p style="margin:0 0 14px;font-size:13px;color:#374151;">${escapeEmailReportHtml(summary)}</p>` +
        `<table border="1" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">` +
        `<thead><tr>${headerCells}</tr></thead>` +
        `<tbody>${bodyRows}</tbody>` +
        `</table>${baseballCardReportHtml}</div>`;

      generatedEmailReportPlainText = [
        title,
        summary,
        "",
        columns.map(column => column.label).join("\t"),
        ...reportViews.map(view =>
          columns
            .map(column =>
              String(column.value(view) || "")
                .replace(/[\t\r\n]+/g, " ")
            )
            .join("\t")
        ),
        ...(baseballCardReportPlainText
          ? ["", baseballCardReportPlainText]
          : [])
      ].join("\n");

      return {
        title,
        summary,
        mode: isTodayReport ? "today" : "selected",
        alienCount: isTodayReport
          ? dailySummary.alienCount
          : selectedAlienCount,
        encounterCount: isTodayReport
          ? dailySummary.encounterCount
          : selectedEncounterCount,
        missingEncounterCount: isTodayReport
          ? dailySummary.missingEncounterCount
          : selectedMissingEncounterCount,
        includesBaseballCard: baseballCardSnapshots.length > 0,
        baseballCardCount: baseballCardSnapshots.length,
        visibleColumns: columns.map(column => column.key)
      };
    }

function formatDateTime(dateTimeValue) {
      if (!dateTimeValue) {
        return "";
      }

      const date = new Date(dateTimeValue);

      if (Number.isNaN(date.getTime())) {
        return dateTimeValue;
      }

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }

function formatSavedTimestamp(value) {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "Unknown";
      }

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
