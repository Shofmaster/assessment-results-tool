# Analysis Workflow

Route: `/analysis`  
Component: `src/components/AnalysisView.tsx`  
Primary backend: `convex/assessments.ts`, `convex/analyses.ts`

## What this page does

Analysis turns selected assessment context and project evidence into a structured output that can be reviewed, exported, and shared.

## Steps

1. Select or prepare an assessment context.
2. Optionally attach images/supporting evidence.
3. Run analysis.
4. Review generated results.
5. Export PDF or assessment JSON.
6. Send finalized output to customer workflow.

## Screenshots

![Analysis workflow page showing context setup and output/export controls.](/help/images/analysis-step-01-page-overview.png)

> Best practice: Run analysis after your Library corpus is complete and current to reduce false positives.

## Key functions and behavior

- `handleAnalyze()`  
  Runs the core analysis request against selected project context and saves result state.
- `handleImageAttach(event)`  
  Adds user-supplied image evidence to the analysis request context.
- `handleExportPDF()`  
  Generates a formatted analysis PDF for download/share.
- `handleExportAssessmentJson()`  
  Exports the underlying assessment result as JSON for archival or integration.
- `handleSendToCustomer()`  
  Pushes finalized analysis output into customer-facing delivery flow.

## Data dependencies

- Reads project assessments and prior analyses from Convex.
- Uses model/service layer (`src/services/claudeApi.ts`) for generation.
- Uses PDF helper (`src/services/pdfGenerator.ts`) for export formatting.

## Outputs and downstream links

- Analysis result records in project history.
- PDF and JSON export artifacts.
- Inputs for reporting (`/report`) and issue decision workflows.

## Troubleshooting

- Missing active project or assessment context: select a project and retry.
- Model request failure: retry with reduced context or alternative model settings.
- Export failure: regenerate result first, then retry export.

## Related guides and next step

- Related: [Library and Document Ingestion](./library-and-document-ingestion.md), [Issues, Command Center, and Analytics](./issues-command-center-and-analytics.md)
- Next step: Export a PDF and add any critical findings to CARs/issues.
