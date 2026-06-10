# Due-list forecasting — "Coming due" on the Quality Command Center

**Status:** Implemented (2026-06-10) — pending manual QA and production Convex deploy.
Shipped: engine (`src/utils/dueForecast.ts`, 34 tests), `convex/dueForecast.ts`
(`collectDueSources` + `sourcesForProject` + `setEstimatedDailyRates`), `estDaily*` fields on
`aircraftAssets`, `ComingDueCard` + `DueListImportModal` in `src/components/dashboard/`,
FleetView `UtilizationRatesEditor`, `FEATURE_KEYS.DUE_FORECAST`; import stack
(`src/services/dueListImporter.ts` with pinned CAMP/Veryon fixtures, `externalDueItems` table,
replace-on-reimport); reconciliation (`src/utils/dueListReconcile.ts`, ±3 days/±5 hr, ATA-aware
one-to-one matcher); iCal feed (`calendarFeedTokens` table, `convex/calendarFeed.ts`,
`src/utils/icalFeed.ts`, `api/due-ical.ts` capability-URL endpoint, subscribe/regenerate buttons
on the card).

**Original plan (2026-06-10, interfaces added same day):** Decisions locked: v1 surface is a
**Quality Command Center card only** (FleetView column and a standalone due-list page are fast
follows); overdue items are **display-only** (no auto-CARs); the weekly email digest is
**deferred**; missing utilization data uses **manual per-aircraft rates plus a visible "needs
utilization data" flag** — items are never silently dropped. Interfaces (decided 2026-06-10):
inbound = **CAMP/Veryon due-list report import** with **reconciliation that flags mismatches**
against AeroGap's own forecast; outbound = **iCal calendar feed**. FL3XX/Traxxall sync, CSV
export, and a REST API are fast follows.

**Competitive driver:** CAMP's stickiest feature is the due list — "what's coming due in
30/60/90 days," forecast by hours/cycles/calendar against each aircraft's utilization. AeroGap
already stores everything needed; this feature is a computation + one dashboard card. The
reconciliation import flips CAMP from competitor to data source: *"audit your CAMP due list"* —
no tracker offers an independent cross-check of its own math against the logbooks.

---

## 1. Data sources (verified in schema)

Three kinds of native due items, one shared forecast engine:

| Source | Fields used | Tie |
|---|---|---|
| `inspectionScheduleItems` | `intervalType`, `intervalMonths`, `intervalDays`, `intervalValue`, `lastPerformedAt`, `title`, `regulationRef` | Project-level (facility/training/tooling recurrences) — mostly calendar |
| `logbookEntries` (recurring) | `nextDueDate`, `recurrenceInterval`, `recurrenceUnit` ("hours"\|"cycles"\|"landings"\|"calendar_months"\|"calendar_days"), `totalTimeAtEntry`, `totalCyclesAtEntry`, `totalLandingsAtEntry`, `inspectionType`, `entryType` | Per aircraft |
| `aircraftComponents` (life-limited, `status = "installed"`) | `lifeLimit`, `lifeLimitUnit`, `tsnAtInstall`/`tsoAtInstall`/`cyclesAtInstall`, `aircraftTimeAtInstall`, `aircraftCyclesAtInstall`, `installDate` | Per aircraft |

Utilization comes from `aircraftAssets`: Avianis-synced `currentTotalTime`/`currentTotalCycles`/
`currentTotalLandings` + `currentAsOfDate` (sync in `convex/avianisIntegration.ts`, cron-driven),
with `baselineTotal*` + `baselineAsOfDate` as the historical anchor.

A fourth, external source is added by the import interface (§4): `externalDueItems` rows parsed
from CAMP/Veryon reports.

## 2. Forecast model

### 2.1 Daily utilization rate (per aircraft, per unit)

1. **Derived (preferred):** `(currentTotal − baselineTotal) / daysBetween(baselineAsOfDate,
   currentAsOfDate)`. Guards: span < 7 days, non-positive delta, or missing either endpoint →
   no derived rate.
2. **Manual override:** new optional fields on `aircraftAssets` — `estDailyHours`,
   `estDailyCycles`, `estDailyLandings` (numbers, editable in FleetView's aircraft editor).
   Derived beats manual when the derived window is ≥30 days (fresher truth); manual fills gaps.
   Show which rate is in use.
3. **Neither:** hours/cycles items for that aircraft get bucket `unforecastable` with reason
   `"needs utilization data"` and a link to set the manual rate. Calendar items always forecast.

### 2.2 Days-until-due per item

- **Calendar:** `nextDueDate` (logbook) or `lastPerformedAt + intervalMonths/Days` (schedule
  items) → `dueDate − today` in days. Items with neither anchor → `unforecastable`
  (`"no last-performed date"`).
- **Hours/cycles/landings (logbook recurrence):** `dueAtValue = total*AtEntry +
  recurrenceInterval`; `remaining = dueAtValue − currentTotal*`; `days = remaining / dailyRate`.
  `remaining ≤ 0` → overdue (display "overdue by N hr").
- **Life-limited components:** consumed since install = `currentTotal* −
  aircraftTotal*AtInstall`; `remaining = lifeLimit − (ts(n|o)AtInstall + consumed)`; same
  conversion to days. `lifeLimitUnit = "calendar_months"` → `installDate + lifeLimit months`.
- **External items (§4):** forecast directly from the report's own `nextDue` date/hours (their
  tracker already did the math); convert hours-due to days with the same rate engine.
- **Staleness guard:** if `currentAsOfDate` is older than 30 days, forecasts for that aircraft
  carry `stale: true`, rendered as an amber "times as of <date>" note — never blocks display.
- **Buckets:** `overdue`, `due30`, `due60`, `due90`, `later`, `unforecastable`.

All of §2 is pure functions in `src/utils/dueForecast.ts` (typed inputs, no Convex imports) so
the math is unit-testable and reusable by the future `list_upcoming_due` Ask-an-Expert tool.

## 3. Core implementation plan

### Milestone 0 — engine + schema (~1 day)

1. `src/utils/dueForecast.ts`: `deriveDailyRates(aircraft)`, `forecastItem(item, rates, today)`,
   `bucketize(days)`, types `DueForecastItem { source, sourceId, aircraftId?, title, kind,
   dueDate?, remainingValue?, remainingUnit?, days?, bucket, reasons[], stale }`. `source` gains
   `'external'` for imported rows.
2. Schema: add `estDailyHours`, `estDailyCycles`, `estDailyLandings` (all `v.optional(v.number())`)
   to `aircraftAssets`. Additive — no migration.
3. `convex/dueForecast.ts` → `forecastForProject({ projectId, horizonDays = 90 })` query: loads the
   source tables via existing `by_projectId` / `by_aircraftId_status` indexes, maps through the
   pure engine, returns items + per-bucket counts + per-aircraft rate provenance. Access control
   mirrors other project queries (`_helpers.ts`).

### Milestone 1 — Quality Command Center card (~1 day)

4. New `src/components/dashboard/ComingDueCard.tsx` rendered in `ComplianceDashboard.tsx`'s
   summary section (existing `GlassCard` KPI grid, ~line 252): four bucket counts
   (overdue red / 30 amber / 60 / 90) using `readinessSeverity` color conventions, then the five
   soonest items (title, tail number when aircraft-tied, due-in text, source icon — external
   items get a provider badge: "CAMP" / "Veryon").
5. Row click → source view: schedule items → `/schedule`; logbook recurrences →
   `/logbook/entry-review`; components → `/fleet`; external items → the import detail (§4.3).
6. `unforecastable` count renders as a quiet footer line: "N items need utilization data" →
   links to FleetView. Display-only overdue (decision): no CAR creation anywhere in v1.
7. FleetView aircraft editor: add the three `estDaily*` inputs with helper text showing the
   derived rate when one exists ("Derived from Avianis: 1.8 hr/day over 142 days").

### Milestone 2 — flag, tests (~0.5 day)

8. `FEATURE_KEYS.DUE_FORECAST` per-user flag; card hidden when off.
9. Unit tests for the engine (pattern: `src/__tests__/utils/`): rate derivation (normal, short
   window, zero delta, missing baseline), each item kind, overdue-by-hours, calendar-month
   arithmetic (month-end edge: Jan 31 + 1 month), staleness flag, bucket boundaries (exactly 30/
   60/90), unforecastable reasons.

## 4. Interfaces — inbound: CAMP/Veryon due-list report import (~1.5–2 days)

Customers export their due-list report from CAMP or Veryon (CSV; both products offer it) and
upload it to AeroGap. No partner API agreement required. This extends the existing import stack:
[src/services/csvImporter.ts](../src/services/csvImporter.ts) already implements `parseCSV`,
provider detection for `'camp' | 'veryon' | 'bluetail'` header signatures, column auto-mapping,
and a preview UX — currently targeting logbook entries.

### 4.1 Parser

10. Extend `csvImporter.ts` with a second mapping target, `DueListColumnMapping`: item/task
    description, ATA, interval text, last-done (date/hours/cycles), next-due (date/hours/cycles),
    remaining. Add CAMP and Veryon due-list header signatures to `detectCsvImportProvider`
    (their due-list exports differ from logbook exports; collect one real sample of each during
    QA and pin the signatures in tests). Auto-mapping failures fall back to the existing manual
    column-mapping preview UI. CSV only in v1 — CAMP users export XLS→CSV; note it in the modal.
11. Tail-number matching: report rows match `aircraftAssets.tailNumber` (normalize "N123AB" vs
    "N-123AB"). Unmatched tails are listed in the preview and skipped on confirm, never guessed.

### 4.2 Storage

12. New table `externalDueItems`: `projectId`, `aircraftId`, `provider` ("camp"|"veryon"),
    `importBatchId`, `reportAsOfDate` (user-entered or parsed), `title`, `ataChapter?`,
    `intervalText?`, `lastDoneDate?`, `lastDoneHours?`, `lastDoneCycles?`, `nextDueDate?`,
    `nextDueHours?`, `nextDueCycles?`, `remainingText?`, `raw` (`v.any()`), `createdAt`.
    Index `by_projectId`, `by_aircraftId`. Re-import with the same provider+aircraft **replaces**
    the prior batch (due lists are snapshots, not ledgers); prior batches are deleted, with the
    batch id recorded on the import event for traceability.

### 4.3 Reconciliation (decision: flag mismatches, v1)

13. Pure matcher in `src/utils/dueListReconcile.ts`, run inside `forecastForProject` when external
    items exist. Tiered matching per aircraft: (a) ATA chapter + interval equivalence (normalize
    "100 HR"/"100 hours"); (b) normalized-title token overlap ≥0.6; else unmatched.
14. Matched pairs compare next-due with tolerance **±3 days or ±5 hours**:
    - `agrees` — shown once, AeroGap value, provider badge as corroboration;
    - `mismatch` — both values shown: *"CAMP: due 4,250.0 hr · AeroGap logbooks: 4,210.0 hr"*;
    - `only_external` — in their tracker, not derivable from your records (often a missing
      logbook entry — exactly what an auditor would find);
    - `only_aerogap` — your records imply a requirement their tracker doesn't list.
15. Surface: mismatch + only-* counts as an amber line on the ComingDueCard, expanding to a
    reconciliation detail list (grouped by aircraft). Display-only in v1, consistent with the
    no-auto-CAR decision.
16. Tests: matcher tiers (ATA hit, title-only hit, no match), tolerance boundaries, replace-on-
    reimport, tail normalization, and a pinned fixture CSV per provider.

## 5. Interfaces — outbound: iCal calendar feed (~0.5–1 day)

17. New Vercel endpoint `api/due-ical.ts`: returns `text/calendar` with one all-day `VEVENT` per
    forecast item due within the horizon (UID = stable item id so calendar clients update rather
    than duplicate; `SUMMARY` = title + tail; `DESCRIPTION` = source + remaining).
18. Auth: calendar clients can't send Clerk tokens, so this is a **capability URL** — random
    128-bit token per project, stored in a new `calendarFeedTokens` table (`projectId`, `token`,
    `createdBy`, `revokedAt?`), constant-time compare in the endpoint, which then reads the
    forecast via a Convex internal query. "Subscribe in calendar" button on the ComingDueCard
    generates/copies the URL; "Regenerate" revokes the old token. Feed contains titles, tails,
    and dates only — no document content.
19. Tests: token revocation, ICS escaping (commas/newlines in titles), UID stability across
    refreshes.

## 6. Estimate & sequencing

~5–6 days total: M0 engine → M1 card → M2 flag/tests (ship native forecast behind the flag) →
§4 import + reconciliation → §5 iCal. The import work is independent of M1 and can ship as its
own increment. No `/api` changes until §5; schema changes are additive (`estDaily*`,
`externalDueItems`, `calendarFeedTokens`).

## 7. Fast follows (explicitly out of v1)

- **FleetView per-tail "next due" column** — reuses `forecastForProject` filtered per aircraft.
- **Standalone due-list page** — sortable/filterable table; add when the card proves use.
- **FL3XX live utilization sync** — second source besides Avianis; public documented REST API,
  follows the `avianisIntegration.ts` pattern (settings-stored credentials + cron).
- **Traxxall report import** — third provider signature in the §4 parser.
- **CSV/Excel export** of the due list; **read-only REST API** with per-company keys.
- **Weekly email digest** — Convex cron + Resend (`convex/notifications.ts` pattern), per-user
  opt-in. Deferred until forecast data is trusted.
- **"Open CAR" action on overdue/mismatch rows** — pre-filled `entityIssues`; deferred by decision.
- **Ask-an-Expert `list_upcoming_due` tool** — same query, exposed in the Phase 2 tool set
  (see `ask-an-expert-spec.md` §6).

## 8. Risks

- **Bad rates → wrong forecasts:** mitigated by rate provenance in the UI, derived-over-manual
  precedence, and the staleness flag. A wrong "due in 45 days" is recoverable; a silently missing
  item is not — hence `unforecastable` is always visible.
- **Report-format drift:** CAMP/Veryon can change export columns. Provider signatures are pinned
  in test fixtures; detection failure degrades to manual column mapping, never a hard error.
- **False mismatches eroding trust:** the matcher is conservative (unmatched beats wrongly
  matched), tolerances absorb rounding, and every mismatch shows both raw values so the user can
  judge instantly. Reconciliation copy says "review", never "error".
- **iCal URL leakage:** capability URL is revocable, feed is metadata-only, and the subscribe UI
  warns that anyone with the link can see due dates.
- **`inspectionScheduleItems` without `lastPerformedAt`:** land in `unforecastable` with a clear
  reason rather than polluting overdue.

## 9. Success criteria

- Forecast matches hand-computed due dates on the QA seed to the day.
- Zero items disappear: every source row (native and imported) lands in exactly one bucket.
- A real CAMP due-list CSV imports with ≥90% of rows auto-mapped and tail-matched.
- Reconciliation on the QA seed produces zero false mismatches at the chosen tolerances.
- QCC card renders in <1s on a project with 500 logbook entries.
