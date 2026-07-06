# Changelog — Aviation Assessment Analyzer

All notable changes to this project are documented here.
Each entry includes the **git commit hash** so you can roll back with:

```bash
# Preview what a rollback would change
git diff <commit-hash> HEAD

# Roll back to a specific commit (keeps changes as uncommitted)
git reset --soft <commit-hash>

# Roll back to a specific commit (discards changes entirely)
git reset --hard <commit-hash>
```

---

## 2026-07-06 — DCT applicability now follows the FAA SAS scoping model (fixes "100% applicable")

**Commit:** _(pending)_

### Summary

The DCT Compliance applicability heuristic marked essentially every requirement in a
Part 145 DCT corpus **applicable** because a bare part-number match (entity "145" token vs
"145F …" peer-group label) was treated as sufficient. Per the FAA's own SAS model
(8900.1 Vol 10; SAS Acronyms & Definitions: *"peer groups and configuration data …
results in scoped DCTs"*), peer group is only the first gate — which elements apply is
driven by the certificate holder's operating profile (OpSpecs, ratings, functions
performed).

`classifyDctApplicability` (both `src/utils/dctApplicability.ts` and the Convex mirror
`convex/lib/dctApplicability.ts`) now runs four gates:

1. **Peer group** — wrong peer group (121/135/141/142/147 vs 145, or 145G/H
   "outside the U.S." for a domestic-only shop) → `not_applicable`. A match falls through.
2. **Function-level evidence** — active OpSpec paragraph ids (A025, D107, …) or
   authorization phrases matching the DCT text → `applicable`.
3. **Conditional elements** — SMS, line maintenance (D107), contract maintenance,
   hazmat, drug & alcohol, capability list, BASA/EASA, work-away: evidence in the
   profile/opspecs → `applicable`; provably absent (SMS declined, domestic-only vs
   BASA) → `not_applicable`; otherwise → `unsure` (triage pool).
4. **Universal core elements** (housing/facilities, personnel, training, manuals,
   quality control, records…) → `applicable` for every certificate holder in the peer group.
5. Peer-group match with no evidence either way → `unsure` (previously `applicable` —
   the root cause of the symptom).

Also: `buildDctHaystack` now includes each question's FAA `scopingAttribute` (the field
the FAA itself scopes questions with), and the over-broad SMS text match
(`safety risk|safety assurance`, which hit nearly every DCT purpose) is gone.

### Behavior change / action needed

- Stored `applicabilityState` values stamped by the old heuristic (`applicabilitySource:
  "auto"`) are re-stamped the next time applicability re-evaluates: any **Save
  applicability filters** action, or **Matrix tab → Refresh applicability**. Rows the
  user set (`user`) or a traceability run set (`traceability`) are untouched.
- Expect the Applicable count to drop and the Unsure pool to grow — that pool is the
  designed triage surface; traceability runs still include unsure rows by default.
- Requires a `convex deploy` for the server-side mirror (summary metrics + re-stamp
  mutation) to match the client.

### Tests

- Rewrote `src/__tests__/utils/dctApplicability.test.ts` diagnostic suite: the old test
  asserting "a pure 145F corpus shows 100% applicable — this is correct" is replaced by a
  regression test asserting the opposite, plus coverage for peer-group gating, D107 line
  maintenance, SMS present/absent/declined, hazmat, BASA/EASA for domestic shops, and
  universal core elements. Full suite: 65 files / 624 tests green.

---

## 2026-07-01 — Company Library page UI redesign (glass theme, de-AI'd, light IA)

**Commit:** `fc3ed05` (code) — this changelog entry: see the commit that follows it on `main`.

### Summary

Frontend-only visual overhaul + light information-architecture cleanup of the **Company
Library** page. The page kept the navy/sky glass-morphism theme and reuses the existing
`src/components/ui/*` primitives — the goal was to remove the "auto-generated" tells (gradient
clip-text headline, explanatory prose under every heading, six wrapping pill-tabs, a stack of
equal-weight glass cards, giant faded empty-state icons) and give the page real hierarchy.

**No behavior, data-flow, Convex, or feature-flag changes.** All six capabilities (maintenance
manuals, parts catalogs, logbook scans, entity documents, compliance standards, library search)
are preserved. This is a **pure frontend deploy (Vercel)** — no `convex deploy` required.

### Changed

- **Header → toolbar:** solid title + sky icon tile instead of the gradient clip-text headline;
  the three descriptive paragraphs are now `Target:` / `Scope:` chips + a quiet "Manage aircraft
  types" link. Verbose upload/reference/TOC help moved into a "How it works" `GlassModal`.
- **Tabs:** six wrapping pill-tabs replaced by an underline tab strip (new
  `src/components/library/LibraryTabs.tsx`).
- **Upload controls:** the large make/model + upload `GlassCard` collapsed into a slim action
  bar; make/model tags now sit behind a "Tags (optional)" disclosure.
- **Search index tooling** (`RefreshSearchIndexButton` + `SearchCoveragePanel`) relocated from a
  standalone always-open card into the **Search** tab, where indexing belongs.
- **Publication rows:** prominent title, single `·`-separated metadata line, right-aligned index
  status badge, and row actions revealed on hover (always visible on mobile; keyboard-reachable
  via `focus-within`). Denser padding, calmer selection styling.
- **Left rail:** `AircraftScopeTree` + `LibraryFolderTree` get uppercase tracked section labels,
  one shared calm active-row treatment, and hover-revealed folder actions.
- **Accessibility:** bumped `/40`–`/50` body text to `/55`+ per the WCAG note in `src/index.css`.

### Added

- `src/components/library/LibraryTabs.tsx` — stateless underline tab strip.
- `src/components/library/LibraryEmptyState.tsx` — compact empty state (framed icon + one line +
  optional action), replacing the giant faded-glyph pattern.

### Files touched

`src/components/CompanyLibrary.tsx` (M), `src/components/library/AircraftScopeTree.tsx` (M),
`src/components/library/LibraryFolderTree.tsx` (M), plus the two new files above.

### Verification

`npx tsc --noEmit` → exit 0 (zero errors). `npx vite build` → exit 0 (only the pre-existing
>1200 kB chunk-size warning). Live in-browser screenshots were not captured in CI (the sandbox
can't reach the authenticated Library route: Convex unlinked + no Clerk creds).

### Rollback

Frontend-only — reverting restores the previous Library UI with no backend/state implications:

```bash
git revert fc3ed05          # safe: creates an inverse commit, redeploys prior UI via Vercel
# or, to reset main to the state just before this change:
git reset --hard aa96bfb    # parent commit (destructive; force-push required)
```

---

## 2026-06-11 — Ask an Expert (citations + record tools + embedded panels), due-list forecasting with CAMP/Veryon import + iCal, lifecycle timeline, AD/SB watch, reg-change draft loop

**Commits:** `6cc6a6e` (deps fix) → `4c8565b` (reg-change draft loop), 9 commits merged via PR #18.

### Summary

The June 2026 competitive roadmap (vs. Bluetail "Ask Bluetail", CAMP due lists, Web Manuals
compliance libraries), shipped as five features plus a dependency patch. Every feature is behind
a per-user feature flag, and **all Convex schema changes are additive** (three new tables, optional
fields only) — rolling back the frontend alone fully reverts user-visible behavior.

1. **Ask an Expert — verifiable citations (`b95b077`)** — retrieved passages enter the prompt as
   tagged sources `[S1]…[Sn]`; the model cites inline; tags it invents are stripped before render.
   Chips open a source modal with the cited span highlighted via the new `documents.getTextSlice`
   action. Uncited grounded answers get a "treat as general guidance" notice. UI renamed from
   "Ask Agents". Flag: `ask-citations`.
2. **Due-list forecasting (`175d6d6`, `19b3607`)** — CAMP-style overdue/30/60/90 buckets across
   schedule items, recurring logbook entries, and life-limited components, using per-aircraft
   utilization rates (Avianis-derived; manual `estDaily*` overrides). Coming Due card on the
   Quality Command Center; CAMP/Veryon due-list CSV import with reconciliation (±3 days/±5 hr)
   against the native forecast; revocable iCal calendar feed (`api/due-ical.ts`); FleetView
   next-due chips + CSV export. Flag: `due-forecast`.
3. **Ask an Expert — record tools + embedded panels (`ea284aa`, `47b7aeb`)** — five tools
   (aircraft status, logbook search, components, discrepancies, coming-due) answer fleet questions
   from structured data in a bounded 6-call tool-use loop; cited rows deep-link to the owning view.
   Reusable `AskPanel` embedded in Company Library and per-tail in FleetView.
   Flags: `ask-record-tools` (requires `ask-citations`).
4. **Lifecycle timeline (`e3436b1`)** — per-tail reverse-chronological history (logbook entries,
   component installs/removals, discrepancies, Form 337s) grouped by year, lazy-loaded inside
   expanded FleetView aircraft cards.
5. **AD/SB watch (`aa5dc10`)** — web-search discovery of recent FAA ADs per aircraft make/model,
   cross-referenced against logbook AD references ("in logbook" / "no logbook record"), advisory
   review workflow (recorded/dismiss) on the Quality Command Center. Flag: `ad-watch`.
6. **Reg change → draft update (`4c8565b`)** — the Manual Writer reg-update check returns
   structured changes with "Draft update: *section*" buttons that load the change as drafting
   context for generation.
7. **Deps (`6cc6a6e`)** — patches all 16 npm audit vulnerabilities.

### Added

- **Convex tables:** `externalDueItems` (imported tracker due lists), `calendarFeedTokens`
  (revocable iCal capability tokens), `adWatchFindings` (AD watch review queue).
- **Convex fields:** `aircraftAssets.estDailyHours/Cycles/Landings` (optional).
- **Convex functions:** `documents.getTextSlice`, `dueForecast.*`, `externalDueItems.*`,
  `calendarFeed.*`, `askTools.*`, `lifecycle.eventsForAircraft`, `adWatch.*`; shared helpers in
  `convex/_textUtils.ts` (`normalizeText`, `normalizeAdNumber`).
- **API endpoint:** `api/due-ical.ts` (token-authorized calendar feed; fails closed).
- **UI:** `src/components/ask/` (AskPanel, AskMarkdown, AskSourceModal),
  `src/components/dashboard/` (ComingDueCard, DueListImportModal, AdWatchCard),
  `src/components/fleet/LifecycleTimeline.tsx`.
- **Engines/services (unit-tested):** `utils/dueForecast.ts`, `utils/dueListReconcile.ts`,
  `utils/icalFeed.ts`, `utils/dueListCsv.ts`, `utils/lifecycleTimeline.ts`,
  `services/dueListImporter.ts`, `services/askRecordTools.ts`, `services/adWatchService.ts`,
  `services/askContext.ts`, `types/askSources.ts`.
- **Feature flags:** `ask-citations`, `ask-record-tools`, `due-forecast`, `ad-watch`
  (default-on under allowlist semantics; admins can withhold per user — this is the no-deploy
  kill switch).

### Changed

- `SplashPage.tsx` — tagged retrieval context, tool-use loop, citation chips; shared renderer
  extracted to `ask/AskMarkdown.tsx`. Old saved chats load unchanged.
- `FleetView.tsx` — utilization-rates editor, next-due chips, lifecycle timeline section,
  per-tail Ask panel. `CompanyLibrary.tsx` — collapsible Ask panel.
- `ComplianceDashboard.tsx` — Coming Due + AD/SB watch cards.
- `ManualWriter.tsx` / `manualRegUpdateChecker.ts` — structured `RegChange[]` + draft-update flow.
- `documentChunks.search` — returns `chunkId`/`startChar`/`endChar` (additive).
- `claudeProxy.ts` — assistant messages may carry `tool_use` blocks for loop replay.

### Operations (deploy order matters)

1. **Backend first:** `npx convex deploy --yes` → production deployment
   `warmhearted-hamster-274`. Watch for the spend-limit warning (see 2026-06-10 gotcha).
2. **Frontend:** merge PR #18 into `main` → Vercel auto-deploys production.
3. Verification before release: 462 unit tests, `tsc` clean, eslint clean, production build clean;
   dev preview deployed against dev Convex for QA.

### How to verify

1. Splash page → ask a grounded question → citation chips render and open the highlighted span.
2. Quality Command Center → Coming Due card shows buckets; CSV download works; Calendar feed
   button copies a working iCal URL.
3. FleetView → expand an aircraft: utilization rates, next-due chip, Lifecycle timeline,
   "Ask about this aircraft".
4. Quality Command Center → AD/SB watch → Run check → findings appear with logbook cross-ref.
5. Manual Writer → Check for regulation updates → "Draft update" buttons load change context.

### Rollback (undo this release)

- **Instant, no rebuild:** Vercel dashboard → previous production deployment → *Promote to
  Production* (or `npx vercel rollback`). Backend stays — all schema changes are additive and the
  old frontend never calls the new functions, so this alone fully reverts user behavior.
- **Soft kill, no deploy:** Admin → Feature Toggles → disable `ask-citations`,
  `ask-record-tools`, `due-forecast`, `ad-watch` per user.
- **Git:** `git revert -m 1 release-20260611` (the PR #18 merge commit) and push — clean forward
  revert, no force-push. Pre-release anchors: tag `pre-release-20260611` /
  branch `backup/main-pre-release-20260611` (= `d284167`, the prior production HEAD).
- **Convex:** no action needed; new tables (`externalDueItems`, `calendarFeedTokens`,
  `adWatchFindings`) are inert without the new frontend.

---

## 2026-04-16 — Company library + liskov refactor: technical publications, inspection schedule, compliance report; Logbook/Admin/AuditSimulation tab split

**Commits:** `caeccd3` (feature baseline) → `a27a8cf` (liskov refactor reconciled)

### Summary

Two related changes shipped together.

1. **Feature baseline (`caeccd3`)** — introduces the company-library / technical-publications workflow, a recurring inspection schedule, schedule-to-logbook cross-referencing, and a compliance-report PDF. Adds a book-volume field to logbook entries and a semantic "company library" search panel inside the Logbook → Search tab.
2. **Liskov refactor (`a27a8cf`)** — merges the `claude/inspiring-liskov` worktree refactor. `LogbookManagement`, `AdminPanel`, and `AuditSimulation` are split into per-tab components; `types/logbook.ts` becomes a barrel over `aircraftAsset` / `logbookEntry` / `compliance`; new shared utilities (`logbookUtils`, `jsonParsing`) and data modules (`auditAgentDefinitions`, `adminAgentTypes`) are extracted.

The liskov WIP was based on commit `96a7c47`, which was 12 commits behind `main`. Three reconciliations were performed so none of those 12 shipped commits are reverted:

- **`AdminLibraryTab`** keeps the *reindex company documents* action + button from commit `8691e19` (document chunk storage).
- **`auditAgents.ts`** keeps `claude-opus-4-7` in `ADAPTIVE_THINKING_MODELS` from commit `d7d70fa` (SEO/landing release).
- **`LogbookSearchTab`** gets the `bookVolume` filter, the *last 100 hour* NL quick-handle, and the semantic library search panel that originally lived inside `LogbookManagement.tsx`'s search tab.

Intentionally **skipped** from the liskov WIP (would have reverted recent commits):

- `useConvexData.ts` split into domain sub-hook files (5 post-96a7c47 commits added new hooks — op specs, limited ratings, DCT ingest, technical publications — that the refactor did not know about). Main's consolidated `useConvexData.ts` is retained.
- `PaperworkReview.tsx` extraction (would have conflicted with the +1030/-448 rewrite in `d7d70fa`).

### Added

- **Convex:** `convex/technicalPublications.ts`, `convex/publicationSections.ts`, expanded `convex/inspectionSchedule.ts`, `convex/logbookEntries.ts`, `convex/logbookDraftEntries.ts`, `convex/documents.ts`, `convex/documentChunks.ts`, `convex/schema.ts` (+58 lines for new tables / fields).
- **UI routes / pages:** `src/components/CompanyLibrary.tsx` (`/library`), `src/components/TechnicalPublicationViewer.tsx` (`/library/publication/:publicationId`), `src/components/ComplianceReport.tsx` (`/compliance-report`).
- **Services / utilities:** `src/services/manualIngestion.ts`, `src/services/scheduleLogbookCrossRef.ts`, `src/services/complianceReportPdf.ts`, and tests under `src/__tests__/services/`.
- **Types:** `src/types/technicalPublication.ts`; `bookVolume?: string` field on `LogbookEntry`.
- **Hooks:** `useDocument`, `useDocumentFileUrl`, `useTechnicalPublications*`, `usePublicationSections`, `useDocumentChunksSearch`, `useScheduleLogbookCrossRef`.
- **Refactored tab components:** `LogbookDueListTab`, `LogbookEntryReviewTab`, `LogbookFindingsTab`, `LogbookSearchTab`, `LogbookTimelineTab`, `LogbookConfigurationTab`, `LogbooksLibraryTab`, `AdminUsersTab`, `AdminKbTab`, `AdminLibraryTab`, `AdminRefDocsTab`, `AdminTogglesTab`, `AdminAuditorDocsTab`, `SimulationAgentSelector`, `SimulationTranscript`, `DiscardConfirmModal`.

### Changed

- `src/App.tsx` — new routes for `/library`, `/library/publication/:publicationId`, `/compliance-report`; `LibraryManager` lazy-load replaced by `CompanyLibrary`.
- `src/hooks/useFocusViewHeading.ts` — now accepts an `enabled` flag for optional activation.
- `src/components/LibraryManager.tsx`, `src/components/InspectionSchedule.tsx`, `src/services/recurringInspectionExtractor.ts` — small additions supporting the new workflows.
- `convex/_helpers.ts`, `convex/manuals.ts`, `src/services/kbCurrencyChecker.ts`, `src/services/revisionChecker.ts` — liskov cleanups (unchanged in main since `96a7c47`, safe to apply wholesale).

### Operations

- **Before deploy:** back up the prior HEAD — done automatically by this release:
  - Git tag: `pre-liskov-merge-20260416-195554`
  - Backup branch: `backup/main-pre-liskov-20260416-195554`
  - Patch archive: `.backups/main-uncommitted-20260416-195554.patch`, `.backups/liskov-wip-20260416-195554.patch`
- **Convex:** `npm run deploy:convex` (or `npx convex deploy --yes`) — applies new `technicalPublications`, `publicationSections`, `inspectionSchedule` tables/fields.
- **Vercel:** `npx vercel --prod` (or push + auto-deploy) once Convex is live.

### How to verify

1. Open `/library`, upload a maintenance manual PDF → confirm publication appears with `Processing` → `Ready` and section TOC populates.
2. Open `/library/publication/:id` → run *Extract recurring inspections* and confirm schedule items are created.
3. Open `/` (Logbook Management) → Search tab: filter by **All log volumes → engine_1**, type "last 100 hour" and submit, and run a semantic **Search library** query.
4. Open `/compliance-report` with an aircraft selected → download PDF and confirm schedule/logbook cross-refs render.
5. Open `/admin` → Library tab → click **Reindex company documents** (should queue N docs).

### Rollback (undo this release — restores pre-liskov, pre-feature main HEAD)

```bash
git reset --hard pre-liskov-merge-20260416-195554
# Or equivalently:
git reset --hard 58609b7
```

To re-land main's feature baseline but undo only the liskov refactor:

```bash
git reset --hard caeccd3
```

### Files changed

62 files total (30 in feature baseline, 32 in refactor merge). See `git show --stat caeccd3` and `git show --stat a27a8cf`.

---

## 2026-04-16 — DCT Compliance: resilient SAS XML parsing, faster library sync, Convex ingest throughput

**Commit:** `6c3560d`

### Summary

This release tightens **DCT / DRSS SAS XML** parsing for real exports that nest `Question` content deeper than a shallow first-match, speeds **shared reference library → project** sync (fewer Convex round-trips + bounded parallel downloads), and batches Convex reads/writes during DCT ingest. If behavior looks different from the prior build, compare **question counts** and spot-check **Purpose / Objective** text before assuming a regression.

### Fixed / improved

- **`src/services/dctXmlParser.ts`** — Single pass to locate `DCTData`, `DCTSummaryInformation`, and `DCTQuestions`; prefers **direct children** for common blocks (versioning, MLF, assessment/specialty/peer, purpose/objective) with safe fallbacks. **Question** parsing walks the subtree so `Text`, references (`QuestionReferences` / `Reference`), and responses (`QuestionResponses` / `Response`) are gathered even when not where the old “first descendant only” logic expected.
- **`src/components/DctCompliance.tsx`** — **`getSharedReferenceDocumentFileUrlsBatch`** via `fetchSharedReferenceDocumentFileUrlsBatch` (one Convex query for many documents) instead of one URL query per file; **`parallelMap`** for bounded-concurrency fetch/parse. Auto-sync prepares only **changed** references when a baseline signature set exists, and can **finalize metadata only** when nothing needs downloading.
- **Traceability prep** — Resolves extracted text for the document slice with bounded parallelism instead of strictly serial work.
- **`convex/dctCompliance.ts`** — Cascade delete and question/comparison inserts use **`Promise.all`** patterns to reduce sequential awaits (same stored fields; `questionDelta` still reflects `d.questions.length`).
- **`convex/fileActions.ts`** — New **`getSharedReferenceDocumentFileUrlsBatch`** query: same access rules as `getSharedReferenceDocumentFileUrl`, returns `{ documentId, url | null }[]` for deduplicated IDs.
- **`src/hooks/useConvexData.ts`**, **`convex/_generated/api.ts`** — Wiring / generated API for the batch query.

### How to verify (recommended)

1. **Parse smoke test:** Sync or upload a DCT XML you trust; confirm **non-zero questions** and that **Purpose / Objective** (summary) look right in the UI or ingest result.
2. **Regression vs prior build:** Re-sync the same catalog as before this commit. **Higher question counts** can mean the parser is now picking up questions that were previously skipped (correctness fix), not necessarily a bug—spot-check a few rows.
3. **Many shared references:** Run **Sync from reference library** with several XMLs; confirm progress completes and Convex logs show one batch URL query rather than per-file URL spam.
4. **Production Convex:** After `npx convex deploy`, confirm **`fileActions.getSharedReferenceDocumentFileUrlsBatch`** is listed in the deployment.

### Operations

- **`npm run deploy:convex`** (or `npx convex deploy --yes`) so the new query and `dctCompliance` changes are live.

### Rollback (undo only this DCT release)

```bash
git reset --hard d7d70fa
```

### Files changed

~6 files, ~+322 / −155 lines (see `git show --stat 6c3560d`).

---

## 2026-04-16 — Public SEO: sitemap, prerendered pages, landing, Claude model wiring

**Commit:** `d7d70fa`

### Summary

Ships the **static SEO** pipeline (sitemap generation + prerendered HTML for public routes), public **landing / SEO** pages, **Paperwork Review** and **audit agent** updates, and centralized **Claude** model configuration. Already on `main` before the DCT commit above.

### Added

- **`scripts/prerender-seo-pages.mjs`** — Run from `npm run build` after `vite build`; writes prerendered HTML for configured public SEO routes.
- **`scripts/generate-sitemap.mjs`** updates and regenerated **`public/sitemap.xml`**.

### Changed

- **`index.html`**, **`src/components/landing/LandingPage.tsx`**, **`src/components/public/PublicSeoPage.tsx`**, **`src/seo/seoContent.ts`**, **`src/components/PaperworkReview.tsx`**, **`src/services/auditAgents.ts`**
- **`api/claude-models.ts`**, **`src/constants/claude.ts`**, **`package.json`**, **`README.md`**

### How to verify

1. **`npm run build`** — Should print `Prerendered … SEO pages` and exit 0.
2. On the deployed host, open **`/sitemap.xml`** and a few listed public URLs; view source and confirm `<title>` / meta description match `src/seo/seoContent.ts` expectations.

### Rollback (undo SEO + related UI only)

```bash
git reset --hard e8ef532
```

### Files changed

13 files in that commit (`git show --stat d7d70fa`).

---

## 2026-04-02 — Quality Command Center, QM Core presets, CAR webhooks, tenant-scoped shared docs

**Commit:** `ffa67ae`

### Summary

This release targets **Chief Inspector / Quality Manager** workflows: a single readiness hub, clearer **feature packaging** for tenants, optional **outbound CAR lifecycle webhooks**, and **company-scoped shared library documents** so multi-tenant data stays isolated while platform-wide KB remains available.

### Added

- **Quality Command Center** (`src/components/QualityCommandCenter.tsx`, route `/quality-command-center`) — dashboard for the active project: CAR/issue status breakdown, overdue open items, upcoming inspection schedule items (calendar intervals), and roster-oriented snapshot, backed by `convex/qualityDashboard.ts` (`getCommandCenterSummary`).
- **Feature key** `quality-command-center` (`src/config/featureKeys.ts`) with sidebar and nav wiring (`src/components/Sidebar.tsx`, `src/App.tsx`).
- **Company feature presets** — **QM Core** vs **Full platform** (`src/config/featureBundles.ts`): QM Core enables the quality hub, library, paperwork review, analysis, guided audit, CARs/issues, checklists, revisions, report builder, and schedule; it turns off logbook-heavy add-ons (Form 337, manual tools) and audit simulation/analytics unless enabled separately.
- **CAR lifecycle webhooks** — optional per-tenant HTTPS URL and shared secret on `companyFeaturePolicies` (`convex/schema.ts`): `carLifecycleWebhookUrl`, `carLifecycleWebhookSecret`; outbound delivery in `convex/integrations.ts` (`deliverCarWebhook` internal action) with headers `X-AeroGap-Event` and optional `X-AeroGap-Webhook-Secret`.
- **Tenant vs platform shared documents** — optional `companyId` on `sharedAgentDocuments` and `sharedReferenceDocuments` plus `by_companyId` indexes; visibility helper `convex/sharedDocVisibility.ts` (platform docs omit `companyId`; tenant docs require a matching viewer company).
- **`getFeaturePolicyInternal`** (`convex/companies.ts`) for internal webhook and policy reads.

### Changed

- **Admin / company admin** — extended feature policy editing (webhook fields, presets) in `src/components/AdminPanel.tsx` and `src/components/CompanyAdminPanel.tsx`.
- **Library & reviews** — `LibraryManager`, `convex/sharedAgentDocuments.ts`, `convex/sharedReferenceDocuments.ts`, and related queries respect company visibility; `documents.ts`, `fileActions.ts`, `projects.ts`, `auditChecklists.ts`, `entityIssues.ts`, `users.ts` updated for multi-tenant and integration flows.
- **Splash** — `SplashPage.tsx` simplified substantially (fewer lines, leaner authenticated landing).
- **Hooks** — `useConvexData.ts` expanded for new queries and policy/summary needs.
- **Minor nav/copy** — `AuditSimulation`, `Checklists`, `CompanyBrowser`, `EntityIssues`, `GuidedAudit`, `ManualWriter`, `PaperworkReview` touched for consistency with feature gating or routing.

### Operations

- After deploy, run **`npx convex deploy`** (or your usual Convex production deploy) so schema changes and new modules (`qualityDashboard`, `integrations`, policy fields) are applied to the Convex deployment linked to this app.
- Webhooks only fire when a URL is set on the tenant policy; failures are logged server-side (`deliverCarWebhook`).

### Files changed

32 files, +1,084 / −651 lines (excluding this changelog line count adjustment)

---

## 2026-03-25 — Authenticated Splash Page + Unified Search

**Commit:** `7744d45`

### Added
- New authenticated splash route at `/splash` with restored spinning AeroGap logo (`src/components/SplashPage.tsx`)
- Unified splash search entry that supports:
  - Internal app navigation
  - Audit agent discovery
  - Claude API query
  - Web search handoff

### Changed
- Post-login routing now always lands authenticated users on `/splash` (`src/components/AuthGate.tsx`)
- App root and fallback routes now default to splash (`src/App.tsx`)
- Agent cards on splash deep-link into Audit Simulation with preselected agent query params (`/audit?agent=<id>`)
- Audit Simulation now reads URL agent params (`agent` and `agents`) and preselects matching participants (`src/components/AuditSimulation.tsx`)

### Files changed
5 files, +298 / −5 lines

---

## 2026-03-25 — Aerospace Quality Copilot (Landing, Readiness, Trust, KPIs)

**Commit:** `987e878`

### Added
- Public Claude-style entry experience at `/` for unauthenticated visitors (see `src/components/AuthGate.tsx` + `src/components/landing/LandingPage.tsx`)
- In-app readiness checklist + missing-evidence guidance inside `GuidedAudit` before analysis/simulation/review (`src/components/GuidedAudit.tsx`)
- Evidence-segmented findings display in Audit Simulation (“Requirement / Evidence / Gap / Corrective action”) (`src/components/AuditSimulation.tsx`)
- Per-finding human review states and reviewer attribution in Paperwork Review (`Draft`, `Accepted`, `Needs work`) (`src/components/PaperworkReview.tsx`)
- Lightweight KPI/event logging via Convex `productEvents` (`convex/productEvents.ts`) with events:
  - `landing_cta_click`
  - `first_run_complete` (de-duped per actor)
  - `finding_accepted`

### Files changed
10 files, +916 / −7 lines

### Rollback all Mar 25 Copilot changes
```bash
git reset --hard 987e878
```

---

## 2026-03-10 — Audit / Manual Writer Sidebar Switcher

**Commit:** `48f4218`

### Added
- **Section switcher** in Sidebar (`src/components/Sidebar.tsx`) — toggle between Audit and Manual Writer modes directly from the nav

### Files changed
1 file, +79 / −2 lines

---

## 2026-03-10 — Deploy manualSections Schema to Convex

**Commit:** `0ced86f`

### Added
- Convex generated bindings synced for `manualSections` schema (`convex/_generated/api.ts`, `convex/_generated/dataModel.ts`)
- `useConvexData` hook updated with manual sections queries
- `Badge` UI component minor fix (`src/components/ui/Badge.tsx`)

### Files changed
4 files, +202 / −8 lines

---

## 2026-03-10 — Analytics Dashboard, Manual Writer & Report Builder

**Commit:** `195ec3a`

### Added
- **Analytics Dashboard** (`src/components/AnalyticsDashboard.tsx`) — visual metrics across audits
- **Manual Writer** (`src/components/ManualWriter.tsx`, `src/services/manualWriterService.ts`) — AI-assisted manual/procedure drafting
- **Report Builder** (`src/components/ReportBuilder.tsx`, `src/services/masterReportGenerator.ts`) — consolidated audit report generation
- Convex backend functions for analytics (`convex/analytics.ts`) and manual sections (`convex/manualSections.ts`)
- New `useConvexData` hooks for analytics and manual sections

### Enhanced
- **Entity Issues** (`src/components/EntityIssues.tsx`) — major expansion with enhanced issue tracking (541 lines changed)
- Sidebar navigation updated with new menu items
- Schema expanded for analytics and manual section tables

### Files changed
18 files, +3,749 / −56 lines

---

## 2026-03-06 — Live eCFR Lookup for FAA Inspector

**Commit:** `e216399`

### Added
- **eCFR API endpoint** (`api/ecfr.ts`) — live lookup of electronic Code of Federal Regulations
- FAA Inspector agent can now fetch real-time regulatory text via Claude tool-use

### Files changed
3 files, +238 / −5 lines

---

## 2026-03-02 — Audit Intelligence Analyst Agent

**Commit:** `09d6379`

### Added
- **Audit Intelligence Analyst** agent with cross-audit pattern recognition (`src/services/auditAgents.ts`)
- Convex backend actions for audit intelligence (`convex/auditIntelligenceActions.ts`)
- Cron job for periodic pattern analysis (`convex/crons.ts`)
- Cursor skill file for the analyst persona (`.cursor/skills/audit-intelligence-analyst/SKILL.md`)
- Admin Panel controls for the intelligence analyst

### Files changed
9 files, +442 / −5 lines

---

## 2026-02-26 — Recurring Inspection Schedule

**Commits:** `c3fa895` → `5ad7a4e` (4 commits)

### Added
- **Inspection Schedule** component (`src/components/InspectionSchedule.tsx`) — full schedule management UI
- **Recurring Inspection Extractor** service (`src/services/recurringInspectionExtractor.ts`) — AI-driven extraction of inspection intervals from documents
- Convex backend for inspection records (`convex/inspectionSchedule.ts`, schema updates)
- **Export utility** (`src/utils/exportInspectionSchedule.ts`) — CSV/PDF export of schedules
- Cursor skills: Guided Audit (`.cursor/skills/guided-audit/SKILL.md`), Recurring Inspection Scheduler (`.cursor/skills/recurring-inspection-scheduler/SKILL.md`)
- Type definitions (`src/types/inspectionSchedule.ts`)

### Enhanced
- Sortable columns and completion-date second pass in schedule view
- Guided Audit component expanded significantly
- PaperworkReview component refinements

### Rollback all inspection schedule work
```bash
git reset --hard 4fac412
```

### Files changed (across 4 commits)
~20 files, +2,900 lines net

---

## 2026-02-25 — PaperworkReview & Convex Integration Polish

**Commits:** `c5447d3` → `4fac412` (5 commits)

### Added
- Full-app Playwright tests (`tests/app-full.spec.ts`, `tests/utils/app-helpers.ts`)
- Paperwork review agent tests (`tests/paperwork-review-agent.spec.ts`)
- Convex user settings and schema additions

### Enhanced
- **PaperworkReview** component iteratively refined across 5 commits
- `useConvexData` hook expanded with new query helpers
- Audit agents updated with paperwork review capabilities
- Claude API service refactored for better model handling
- UI component styling updates (`index.css`)

### Rollback all Feb 25 changes
```bash
git reset --hard 6e3e648
```

---

## 2026-02-23 — Entity Issues, Skills & Guided Audit

**Commits:** `858c14f` → `6e3e648` (6 commits)

### Added
- **Entity Issues** tracker (`src/components/EntityIssues.tsx`, `convex/entityIssues.ts`)
- **Convex Deploy Walkthrough** (`CONVEX_DEPLOY_WALKTHROUGH.md`)
- Shared Agent Documents Convex functions (`convex/sharedAgentDocuments.ts`)
- **13 Cursor skill files** for all auditor/entity personas:
  AS9100, EASA, FAA, IS-BAO, Safety, SMS Consultant (auditor-side);
  Chief Inspector, DOM, Safety Manager, General Manager, Shop Owner (entity-side)
- Audit simulation button tests (`tests/audit-sim-buttons.spec.ts`)

### Enhanced
- **Audit Simulation** component substantially reworked
- Guided Audit component updates
- `useConvexData` hook expanded for entity issues

### Rollback all Feb 23 changes
```bash
git reset --hard d56b1d3
```

---

## 2026-02-20 — Admin Panel & Audit Simulation Refinements

**Commit:** `d56b1d3`

### Enhanced
- Admin Panel, Audit Simulation, and Page Model Selector consistency fixes
- New Playwright test for audit simulation buttons

---

## 2026-02-19 — Model Selector, Sidebar & Core Refactoring

**Commits:** `06bcf53` → `5cb2ce3` (10 commits)

### Added
- **Page Model Selector** (`src/components/PageModelSelector.tsx`) — choose Claude model per page
- **Claude Models API** (`api/` updates) — backend endpoint for available models
- **Comparison View** updates (`src/components/ComparisonView.tsx`)
- DOCX/PDF report generators updated
- FAA Inspector types expanded (`src/services/faaInspectorTypes.ts`)
- Design audit docs (`docs/DESIGN-AUDIT.md`)
- Playwright test for menu organization (`tests/menu-organization.spec.ts`)

### Fixed
- **New Project button** in audit dropdown (`1ead025`)
- **Reverted document bandwidth changes** — restored full list with extractedText (`06bcf53`)

### Enhanced
- Selected model now used in all Claude call paths (`7c609dd`)
- Sidebar updated with Claude model API integration
- Analysis View, Audit Simulation, Guided Audit, Paperwork Review all updated
- Claude API and proxy service refactored

### Rollback all Feb 19 changes
```bash
git reset --hard c44a441
```

---

## 2026-02-18 — Major Feature Drop: GuidedAudit, PaperworkReview, Document Reviews

**Commits:** `32dc8d6` → `4481701` (3 commits)

### Added
- **Guided Audit** component (`src/components/GuidedAudit.tsx`)
- **Paperwork Review** component (`src/components/PaperworkReview.tsx`)
- Document review system with Convex backend
- Convex schema, backend services, and new features

### Fixed
- Restored `api/chat` dispatch for AI paperwork review — fixed 405 error (`4481701`)
- Reverted broken build from `10e879b` via `32dc8d6`

### Rollback all Feb 18 changes
```bash
git reset --hard 59e196c
```

---

## 2026-02-12 — Quiz Feature (Added & Reverted)

**Commits:** `a936d83` (added) → `59e196c` (reverted)

### Notes
- Quiz feature was added and then immediately reverted in the same session
- No quiz code remains in the codebase

---

## 2026-02-11 — Convex Integration & Admin Panel

**Commit:** `6553e49`

### Enhanced
- Convex integration improvements
- Admin Panel and Sidebar component updates

---

## 2026-02-10 — Startup Fix & Google Drive Integration

**Commits:** `ad11e93`, `3a42b5e`

### Fixed
- **Blank screen on startup** — synced Convex integration (`ad11e93`)

### Added
- Shared Google Drive repository for team collaboration (`3a42b5e`)

---

## 2026-02-09 — Initial Commit

**Commit:** `925acc6`

### Added
- Full Aviation Assessment Analyzer application
- React + TypeScript + Vite frontend
- Convex backend integration
- Claude AI integration for audit analysis
- Core components: Dashboard, Analysis View, Admin Panel, Sidebar, Settings
- Document upload and management
- Audit simulation framework

### Rollback to initial state
```bash
git reset --hard 925acc6
```

---

## Quick Reference — Rollback Targets

| Want to undo...                         | Run this                          |
|-----------------------------------------|-----------------------------------|
| DCT XML / library sync (2026-04-16)     | `git reset --hard d7d70fa`        |
| SEO prerender + landing (2026-04-16)   | `git reset --hard e8ef532`        |
| Quality Command Center / webhooks / QM Core presets | `git reset --hard ffa67ae` |
| Sidebar Audit/Manual Writer switcher    | `git reset --hard 0ced86f`        |
| manualSections Convex schema deploy     | `git reset --hard 195ec3a`        |
| Analytics/Manual Writer/Report Builder  | `git reset --hard e216399`        |
| eCFR Lookup                             | `git reset --hard 09d6379`        |
| Audit Intelligence Analyst              | `git reset --hard 5ad7a4e`        |
| Inspection Schedule (all)               | `git reset --hard 4fac412`        |
| Feb 25 Paperwork/Convex polish          | `git reset --hard 6e3e648`        |
| Feb 23 Entity Issues & Skills           | `git reset --hard d56b1d3`        |
| Feb 19 Model Selector & refactoring     | `git reset --hard c44a441`        |
| Feb 18 GuidedAudit/PaperworkReview      | `git reset --hard 59e196c`        |
| Everything after initial commit         | `git reset --hard 925acc6`        |

> **Tip:** Use `git reset --soft` instead of `--hard` to keep changes staged so you can review before discarding. Use `git stash` before a reset if you have uncommitted work.
