# Manual Authoring, Management, and Revisions

Routes:
- `/manual-writer` (`ManualWriter`)
- `/manual-management` (`ManualManagement`)
- `/revisions` (`RevisionTracker`)

Primary backend:
- `convex/manualSections.ts`
- `convex/manuals.ts`
- `convex/manualChangeLogs.ts`
- `convex/documentRevisions.ts`

## What these pages do

- `ManualWriter`: Generate, save, approve, and export manual sections.
- `ManualManagement`: Track manual revisions and customer review lifecycle.
- `RevisionTracker`: Scan and verify source-document revision currency.

## Steps

1. Draft or generate section updates in Manual Writer.
2. Save and approve sections intended for release.
3. Create or update manual revisions in Manual Management.
4. Submit revisions and track customer review outcomes.
5. Run Revision Tracker checks to confirm document currency.

## Key functions and behavior

### Manual writer (`src/components/ManualWriter.tsx`)

- `handleRequestGenerate()` + `executeGenerate(...)`  
  Collects generation inputs and produces section draft content.
- `handleConfirmInterview(answers)`  
  Applies interview/clarification answers before generation.
- `handleSave()` / `handleSaveWithOverrides()`  
  Stores generated section as draft.
- `handleApprove(sectionId)`  
  Marks section as approved for export.
- `handleCheckRegUpdates()`  
  Compares current sections against update checks and flags review needs.
- `handleLoadSavedSection(sec)` / `handleDelete(sectionId)` / `handleCopy(text)`  
  Editor management helpers for saved content.

### Manual management (`src/components/ManualManagement.tsx`)

- `handleCreate()` / `handleAdd()`  
  Creates manual and revision entries.
- `handleNewRevision()` / `handleSaveRevision(...)`  
  Adds and updates revision metadata.
- `handleSubmitRevision(revId)` / `handleResolveRevision(revId, resolution)`  
  Drives submit/customer-review/resolve lifecycle.
- `handleDeleteRevision(revisionId)` / `handleDelete()`  
  Removes revision or full manual.
- `handleDownloadManual()`  
  Downloads current manual artifact.
- `handleUploadCurrentManuals()` / `handleRegisterExistingDocument(doc)`  
  Onboards existing manual files into tracking.

### Revision tracker (`src/components/RevisionTracker.tsx`)

- `handleScanDocuments()`  
  Extracts revision levels from selected documents and stores baseline.
- `handleCheckSingle(revision)` / `handleCheckAll()`  
  Validates revision currency, updates status and check timestamps.
- `handleMoveRevision(revisionId, toPile)`  
  Re-categorizes revision record by document type/category.
- `handleRevisionImageAttach(event)`  
  Adds image references used during revision checks.

## Troubleshooting

- No approved sections for export: complete approval first.
- Review lifecycle blocked: status transition not allowed by role/state.
- Revision checks failing: verify source document text and connectivity.

## Related guides and next step

- Related: [DCT Compliance](./dct-compliance.md), [Issues, Command Center, and Analytics](./issues-command-center-and-analytics.md)
- Next step: Confirm revision currency after each approval cycle before external release.
