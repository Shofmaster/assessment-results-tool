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
