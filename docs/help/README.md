# AeroGap Help and Instructions

This help set explains how each user-facing page works and what the main functions do in plain language.

## Route and access inventory

### Public (signed out)

| Route | Page | Access rule | Notes |
|---|---|---|---|
| `/` | `LandingPage` | Public | Marketing and product overview entry point. |
| `/aviation-compliance-audit-services` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/aviation-quality-software` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/faa-repair-station-audit-checklist` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/as9100-internal-audit-software` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/aviation-audit-readiness` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/manual-audits-vs-software-assisted-audits` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/audit-evidence-management-best-practices` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/faa-as9100-readiness-roadmap` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| `/aviation-compliance-kpis` | `PublicSeoPage` | Public | SEO content page from `SEO_PAGE_BY_PATH`. |
| Any other signed-out route | Clerk `SignIn` | Public | Login card rendered by `AuthGate`. |

### Authenticated app routes

| Route | Page | Access rule | Notes |
|---|---|---|---|
| `/` | Redirect to `/splash` | Authenticated | Default app entry. |
| `/splash` | `SplashPage` | Authenticated | Home/start screen after login. |
| `/library` | `LibraryManager` | Authenticated | Upload and manage project docs. |
| `/analysis` | `AnalysisView` | Authenticated | Run analysis and export results. |
| `/audit` | `AuditSimulation` | Authenticated | Multi-agent simulation workflow. |
| `/review` | `PaperworkReview` | Authenticated | Document review and findings. |
| `/quality-command-center` | `ComplianceDashboard` | Authenticated + feature gated | Quality command center. |
| `/compliance-dashboard` | Redirect to `/quality-command-center` | Authenticated | Backward compatibility route. |
| `/entity-issues` | `EntityIssues` | Authenticated | CARs/issues management. |
| `/roster` | `Roster` | Authenticated | Qualification and assignment tracking. |
| `/guided-audit` | `GuidedAudit` | Authenticated | Guided assessment path. |
| `/revisions` | `RevisionTracker` | Authenticated | Document revision checks. |
| `/dct-compliance` | `DctCompliance` | Authenticated | DCT traceability workflow. |
| `/schedule` | Redirect to `/logbook?tab=schedule` | Authenticated | Convenience shortcut. |
| `/logbook` | `LogbookRouteGuard` | Authenticated + module gated | Opens logbook if enabled. |
| `/logbook/entry-review` | `LogbookEntryReviewPage` | Authenticated | Entry review workspace. |
| `/form-337` | `Form337` | Authenticated | FAA 337 support page. |
| `/analytics` | `AnalyticsDashboard` | Authenticated | KPI and trend views. |
| `/report` | `ReportBuilder` | Authenticated | Build and export reports. |
| `/checklists` | `Checklists` | Authenticated | Checklist execution workflow. |
| `/manual-writer` | `ManualWriter` | Authenticated | Manual section generation/approval. |
| `/manual-management` | `ManualManagement` | Authenticated | Manual revisions and versions. |
| `/aerogap-dashboard` | `AerogapDashboard` | Aerogap employee only | Staff-only operations dashboard. |
| `/companies` | `CompanyBrowser` | Aerogap employee only | Staff-only company list. |
| `/companies/:companyId/projects` | `CompanyProjectsPage` | Authenticated | Company project management. |
| `/company-admin` | `CompanyAdminHomeRoute` | Company admin scope | Redirects to settings if no company access. |
| `/projects` | Redirect to `/logbook` | Authenticated | Legacy shortcut route. |
| `/settings` | `Settings` | Authenticated | User and model settings. |
| `/admin` | `AdminPanel` | Admin only | Platform admin operations. |
| `/help` | `HelpCenter` | Authenticated | In-app help center page. |
| `*` | Redirect to `/splash` | Authenticated | Catch-all fallback. |

## Documentation map

- [Auth and Public Pages](./auth-and-public-pages.md)
- [App Navigation and Access](./app-navigation-and-access.md)
- [Library and Document Ingestion](./library-and-document-ingestion.md)
- [Analysis Workflow](./analysis-workflow.md)
- [Audit Simulation](./audit-simulation.md)
- [Paperwork Review](./paperwork-review.md)
- [Checklists and Recurring Cycles](./checklists-and-recurring-cycles.md)
- [Logbook and Inspection Schedule](./logbook-and-inspection-schedule.md)
- [Roster and Qualifications](./roster-and-qualifications.md)
- [Issues, Command Center, and Analytics](./issues-command-center-and-analytics.md)
- [Manual Authoring, Management, and Revisions](./manual-authoring-management-and-revisions.md)
- [DCT Compliance](./dct-compliance.md)
- [Settings and Admin](./settings-and-admin.md)

## Workflow order

1. Set access and project context.
2. Load source evidence into Library/Logbook.
3. Run analysis, simulation, review, and checklists.
4. Escalate findings to CARs/issues and monitor in command views.
5. Generate reports and maintain manuals/revisions.

## Visual asset pipeline

- Screenshot and visual asset root: `public/help/images`.
- Naming convention: `<module>-step-<nn>-<state>.png` (example: `audit-simulation-step-01-start.png`).
- Keep screenshots focused on one action/state with readable labels.
- Default capture guidance:
  - Use consistent desktop viewport.
  - Crop out unrelated browser chrome where possible.
  - Include a short alt/caption sentence that explains why the image matters.

### Markdown conventions used by in-app renderer

- Image figure:
  - `![Start a simulation from this panel.](/help/images/audit-simulation-step-01-start.png)`
- Callouts (rendered as styled cards):
  - `> Tip: ...`
  - `> Warning: ...`
  - `> Best practice: ...`
- Step checklist:
  - `- [ ] Step text` for a pending checklist style.
  - `- [x] Step text` for completed/example state.

## Maintenance notes

- Route truth is in `src/App.tsx` and `src/components/AuthGate.tsx`.
- Public SEO routes are defined in `src/seo/seoContent.ts`.
- Update this index whenever routes, role gates, redirects, or page names change.
