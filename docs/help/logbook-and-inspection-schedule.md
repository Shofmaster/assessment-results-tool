# Logbook and Inspection Schedule

Route: `/logbook` (plus `/schedule` redirect)  
Component: `src/components/LogbookManagement.tsx`  
Primary backend: `convex/logbookEntries.ts`, `convex/logbookDraftEntries.ts`, `convex/inspectionSchedule.ts`, `convex/complianceFindings.ts`

## What this page does

Logbook Management handles aircraft logbook ingestion, draft review/import, compliance checks, findings-to-issue conversion, and schedule synchronization.

## Main user actions

1. Upload one or many logbook files.
2. Review parsed draft entries.
3. Import selected drafts into final entries.
4. Delete unwanted drafts or source documents.
5. Run compliance checks and detect chronic findings.
6. Sync entry-driven schedule updates.
7. Export data (CSV) and use review prompts.

## Key functions and behavior

- `handleUpload()` / `processSingleUploadFile(file, clientId)`  
  Parses source files and builds draft entries for user validation.
- `handleImportSelected()`  
  Commits selected draft rows into canonical logbook entries.
- `handleDeleteSelectedDrafts()` / `handleDeleteSingleDraft(draftId)`  
  Removes unwanted draft imports.
- `handleDeleteDocument(doc)`  
  Deletes a logbook source document.
- `handleRunChecks()`  
  Runs compliance rule checks against current entries/components.
- `handleDetectChronic()`  
  Flags recurrence patterns in findings.
- `handleConvertToIssue(finding)`  
  Escalates compliance findings to entity issues.
- `handleSyncSchedule()`  
  Calculates schedule updates (`buildScheduleUpdates`) and persists sync.
- `buildLogbookCSV(entries, tailNumber)` / `triggerDownload(content, filename)`  
  Creates CSV export content and initiates browser download.

## Data dependencies

- Logbook entries/drafts, components, findings, and schedule datasets from Convex.
- CSV import helpers (`parseCSV`, mapping, preview) for structured imports.
- Integration service (`logbookIntegration`) for issue/schedule bridging.

## Outputs and downstream links

- Finalized logbook entries.
- Compliance findings and escalated issues.
- Updated inspection schedule.
- CSV exports for external review.

## Common failure states

- Module disabled by entitlement: route guard blocks access.
- Parse/mapping errors: fix field mapping or source format and retry upload.
- Schedule sync mismatch: run checks/import first, then sync.
