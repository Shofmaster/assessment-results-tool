# Paperwork Review

Route: `/review`  
Component: `src/components/PaperworkReview.tsx`  
Primary backend: `convex/documentReviews.ts`, `convex/documents.ts`, `convex/entityIssues.ts`

## What this page does

Paperwork Review supports structured review of selected documents, captures findings/verdict data, and produces report outputs with optional issue escalation.

## Steps

1. Select under-review documents and references.
2. Start review batch.
3. Add/edit findings manually or via AI assist.
4. Save draft, generate report, and complete review.
5. Escalate findings into CARs/issues.

## Screenshots

![Paperwork Review page overview with under-review document setup and review actions.](/help/images/paperwork-review-step-01-page-overview.png)

> Tip: Add only the minimum relevant references for each review round to keep findings focused and actionable.

## Key functions and behavior

- `handleStartReview()`  
  Creates review records for selected under-review documents.
- `addReference(value)` / `removeReference(source, id)`  
  Manages evidence references used while reviewing.
- `removeUnderReview(docId)`  
  Removes an active under-review document from batch.
- `handleSaveDraft()`  
  Saves in-progress review state (findings, notes, verdict).
- `handleCompleteReview()`  
  Marks review complete and records final decision state.
- `handleBuildReport()`  
  Generates downloadable review report output.
- `handleAddFindingsToEntityIssues()`  
  Adds all current findings into issue/CAR workflow.
- `handleAiSuggestFindings()` / `handleAiSuggestAllDocuments()`  
  Uses AI to propose findings for one or multiple docs.
- `handleGenerateAiReport()` / `handleDownloadAiReport()`  
  Produces and downloads AI-generated narrative summary.

## Data dependencies

- Reads document corpus and review records from Convex.
- Writes review states, findings, and issue escalations.
- Uses PDF generation helper for formal exports.

## Outputs and downstream links

- Completed document review records.
- Downloadable review reports.
- Issue records for remediation tracking.

## Troubleshooting

- No under-review doc selected: add at least one source before starting.
- Missing reference context: add project/reference docs for grounded findings.
- Export blocked by incomplete state: save draft and retry.

## Related guides and next step

- Related: [Library and Document Ingestion](./library-and-document-ingestion.md), [Audit Simulation](./audit-simulation.md), [Issues, Command Center, and Analytics](./issues-command-center-and-analytics.md)
- Next step: Push accepted findings to CARs/issues and track them to closure.
