---
name: guided-audit
description: Acts as the all-knowing auditor: orchestrates the guided audit flow, knows which auditor skills to invoke based on documents and scope, and ensures nothing is overlooked—flag appropriately, never silently move on. Use when editing GuidedAudit.tsx, wiring features, or extending the guided audit.
---

# Guided Audit

## Identity: All-knowing auditor

The guided audit acts as an **all-knowing auditor**. It has comprehensive knowledge of aviation compliance and the full audit landscape. It:

- Knows which auditor perspectives to bring in based on what the user uploaded—no outside help needed.
- Never silently moves on from a gap, ambiguity, or non-compliance—always flag appropriately.
- Orchestrates all relevant perspectives so nothing falls through the cracks.

## Purpose

The Guided Audit is an all-encompassing workflow that runs all audit-related features in one flow with minimal human input. When building or extending it, prioritize automation, smart defaults, batch operations, and thorough flagging.

## When to use this skill

- Editing [src/components/GuidedAudit.tsx](src/components/GuidedAudit.tsx)
- Adding new steps or integrations to the guided flow
- Wiring features (Analysis, Audit Simulation, Paperwork Review, Revisions, Entity Issues, report generation)
- Reducing human input (auto-select, auto-pair, auto-export)
- Deciding which auditor skills to invoke based on documents and scope
- Ensuring gaps and findings are flagged, not skipped

## Auditor skills to invoke

The guided audit **selects which skills to use** from uploaded documents, assessment data, and regulatory context. Invoke these without outside help:

| Skill | When to invoke | Trigger signals |
|-------|----------------|-----------------|
| **faa-inspector** | FAA/U.S. repair station or Part 145/43/121/135 scope | CFRs, Part 145, Part 43, ACs, repair station, 14 CFR in docs or assessment |
| **easa-inspector** | European maintenance or Part-145 approval | EASA, Part-M, Part-CAMO, European, AMC, GM in docs or assessment |
| **isbao-auditor** | Business aviation, voluntary standards | IS-BAO, ICAO Annex 6/8, business aircraft, IBAC in docs |
| **as9100-auditor** | Aerospace QMS, MRO, AS9100 scope | AS9100, AS9110, aerospace, QMS, ISO 9001 in docs or assessment |
| **sms-consultant** | SMS implementation, safety management | SMS, ICAO 9859, AC 120-92, four pillars, safety culture in docs |
| **safety-auditor** | Charter, third-party safety audit | ARGUS, Wyvern, charter operator, insurance audit in docs or assessment |
| **shop-owner** | Entity perspective: certificate holder | Always for simulation; represents the org under audit |
| **dom-maintenance-manager** | Entity: maintenance operations | Maintenance, DOM, technical authority in entity docs |
| **chief-inspector-quality-manager** | Entity: quality/QC | QC, quality system, inspections, nonconformities in entity docs |
| **entity-safety-manager** | Entity: in-house SMS | SMS, hazards, risk, safety culture in entity docs |
| **general-manager** | Entity: accountability, resources | Management, accountability, resources in entity docs |

**Selection logic:** Scan document names, extracted text, and assessment data. If any trigger is present, include that skill's perspective in analysis, simulation, or paperwork review. Default: include faa-inspector and shop-owner for repair stations; add others as scope indicates.

## Flag; do not skip

**Never move on from something without flagging it appropriately.** If a gap, ambiguity, non-compliance, or missing item is encountered:

1. **Add to Entity issues** — Use `addEntityIssue` with severity (critical/major/minor/observation), title, description, and regulationRef when applicable.
2. **Create a finding** — In paperwork review, add findings; in analysis, include in recommendations. Do not omit.
3. **Show a warning** — When data is missing or unclear, surface a non-blocking warning to the user. Do not silently proceed.
4. **Record in transcript** — In simulation, ensure agents raise findings; extract via `extractDiscrepanciesFromTranscript` and add to Entity issues.
5. **Do not skip** — If a step fails, a document is unreadable, or a comparison is inconclusive, flag it. Never assume "it's fine" and move on.

## Orchestration rules

### Step order and dependencies

1. **Upload documents** — User uploads by category (regulatory, entity, sms, reference, uploaded); imports assessment JSON. Required before analysis.
2. **Run analysis** — Batch mode (all assessments) or single. Uses regulatory, entity, sms, uploaded docs. Required before simulation.
3. **Audit simulation** — Runs for one assessment; optionally adds discrepancies to Entity issues. Reuses selected assessment from analysis.
4. **Paperwork review** — Smart-pair documents by type (inferDocType, scorePair) or manual pair; creates reviews and runs AI suggestions.
5. **Revision check** — Scans documents for revision levels. Standalone.
6. **Summary** — Links to all views; auto-exports Analysis PDF and Simulation DOCX when reached.

### Automation priorities

- **Auto-select assessment** when only one exists; remember selection across steps.
- **Batch analysis** — Run for all assessments by default.
- **Entity issues** — Auto-extract simulation discrepancies and add to Entity issues (configurable checkbox).
- **Smart document pairing** — Match by document type; infer type from uploaded content (see Document type inference below).
- **Automatic export** — When Summary step is reached, generate and download Analysis PDF and Simulation DOCX (no user click).

### Retry

When a step fails (API error, timeout, rate limit):

- **Retry** failed operations with exponential backoff (e.g., 1s, 2s, 4s, max 3 attempts).
- Apply retry to: analysis, simulation, paperwork AI suggest, revision check, export.
- After max retries, show a clear error; allow the user to skip the step or retry manually.
- Do not block the flow — user can proceed to the next step if they choose.

### Warnings

Show **non-blocking warnings** when important data is missing; do not prevent the user from continuing:

- No assessment imported before analysis — "Import an assessment for best results."
- No regulatory docs — "Add regulatory documents (CFRs, IS-BAO, etc.) for compliance analysis."
- No entity docs before paperwork review — "Add entity documents for document comparison."
- Few or no documents with extracted text — "Some documents may have failed extraction; check Library."
- Warn on step entry when prerequisites for that step are weak; allow skip.
- **Flag, don't ignore** — When something is wrong, missing, or unclear, always surface it (Entity issue, finding, or warning). Never silently move on.

## Feature inventory

| Feature | Location | Integration point |
|--------|----------|-------------------|
| Analysis | AnalysisView, ClaudeAnalyzer | Step 2; addAnalysis; PDFReportGenerator |
| Audit Simulation | AuditSimulation, AuditSimulationService | Step 3; addSimulationResult; extractDiscrepanciesFromTranscript |
| Paperwork Review | PaperworkReview | Step 4; addDocumentReview; suggestPaperworkFindings; updateDocumentReview |
| Revisions | RevisionChecker | Step 5; setDocumentRevisions |
| Entity issues | EntityIssues | Step 3 (from sim); Step 6 (link); addEntityIssue |
| Analysis PDF | PDFReportGenerator | Step 6 auto-export |
| Simulation DOCX | AuditSimulationDOCXGenerator | Step 6 auto-export |

## Key files

- [src/components/GuidedAudit.tsx](src/components/GuidedAudit.tsx) — Main orchestration UI
- [src/services/auditAgents.ts](src/services/auditAgents.ts) — extractDiscrepanciesFromTranscript, getPaperworkReviewSystemPrompt
- [src/services/claudeApi.ts](src/services/claudeApi.ts) — suggestPaperworkFindings
- [src/services/pdfGenerator.ts](src/services/pdfGenerator.ts) — Analysis PDF
- [src/services/auditDocxGenerator.ts](src/services/auditDocxGenerator.ts) — Simulation DOCX
- [convex/documentReviews.ts](convex/documentReviews.ts) — addDocumentReview, updateDocumentReview
- [convex/entityIssues.ts](convex/entityIssues.ts) — addEntityIssue

## Document type inference

**Read what the user uploaded** to determine the correct document type. Do not rely only on filename or user-selected category.

1. **Use extracted text** — After upload, use the document’s `extractedText` (first N characters or a representative sample) to classify.
2. **Content-based classification** — Infer type from content (e.g., "14 CFR Part 145" → part-145-manual; "IS-BAO", "ICAO" → isbao-standards; "Quality Control", "Inspection" → qcm/ipm; "Safety Management System" → sms-manual).
3. **Fallbacks** — If content is unclear, use name and category; prefer content when available. If type remains unknown after fallbacks, **flag it** (e.g., add observation to Entity issues or paperwork findings) rather than forcing a guess.
4. **Type mapping** — Align with REFERENCE_DOC_TYPE_LABELS: part-145-manual, gmm, qcm, sms-manual, training-program, ipm, tool-calibration, isbao-standards, part-135-manual, part-121-manual, part-91-manual, mel, ops-specs, hazmat-manual, other.
5. **Pairing** — Match under-review docs to reference docs by inferred type from content; same or compatible type gets highest score.

## Smart pairing logic

Documents are paired by inferred type (from content first) and keyword overlap:

- Infer type from **content** (see Document type inference above), then fall back to `inferDocType(name, category)`.
- `scorePair(underName, underCat, refName, refCat, refDocType)` — Scores match quality; prefer same inferred type, then keyword overlap, then category.
- Reference sources: project documents (regulatory, reference category) and sharedReferenceDocuments (with documentType).
- Under-review: entity, sms, uploaded documents with extracted text.

## Resolved decisions

1. **Paperwork auto-pairing:** Smart match by document type labels from Library (REFERENCE_DOC_TYPE_LABELS, category metadata).
2. **Report export:** Automatic at end of flow — Analysis PDF and Simulation DOCX when Summary is reached.
3. **Batch analysis:** Run analysis for all assessments in Step 2 by default.
4. **Skill selection:** The guided audit chooses which auditor skills to invoke from document content and assessment scope—no outside input required.
5. **Flag, never skip:** Gaps, ambiguities, non-compliance, or missing data must be flagged (Entity issue, finding, or warning). Never silently move on.
