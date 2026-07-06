# DCT Compliance

Route: `/dct-compliance`  
Component: [`src/components/DctCompliance.tsx`](../../src/components/DctCompliance.tsx)  
Primary backend: [`convex/dctCompliance.ts`](../../convex/dctCompliance.ts)

## What this page does

DCT Compliance copies FAA SAS DCT **requirements** (questions) from your company’s shared reference library into the **active project**, runs AI traceability against manuals with extracted text, tracks scheduled check completion, and generates reports.

## End-to-end flow

1. **Upload DCT XML once** — In **Entity Documents** (Library), use **Upload DCT XML** / folder. Each file is parsed **once** at upload time; questions are stored in the company-level cache (`dctParsedLibraryDocuments` / `dctParsedLibraryQuestions` in Convex).
2. **Sync into this project** — On DCT Compliance, click **Sync from library**. This copies cached rows into `dctToolDocuments`, `dctQuestions`, and `dctComparisons` for the current project. No re-download and no re-parse. Already-ingested content hashes are skipped.
3. **Applicability** — Adjust filters and structured selectors, then **Save applicability filters**.

   Classification follows the FAA SAS scoping model (peer groups + configuration data → scoped DCTs):
   - **Peer-group gate** — a DCT labeled for another peer group (e.g., Part 121, or 145G/H "outside the U.S." for a domestic shop) is **not applicable**. A peer-group *match* is necessary but not sufficient.
   - **Function-level evidence** — a row becomes **applicable** only with positive evidence: selected class ratings/capabilities match, an active OpSpec paragraph (A025, D107, …) or authorization phrase appears in the DCT text, the element is conditional and your profile shows you perform the function (SMS, line maintenance, hazmat, contract maintenance, BASA/EASA, …), or the element is a universal Part 145 core requirement (housing/facilities, personnel, training, manuals, quality control, records).
   - Everything else in your peer group lands in the **unsure** pool for triage (Findings tab) — it is still included in traceability runs by default, and the AI run or your manual review then stamps the final state.
4. **Traceability** — Choose perspective/model, then **Run traceability**.
5. **Schedule** — Use **Complete scheduled check** when your review cycle is done.
6. **Reports** — Download PDF or save a snapshot to history.

## Status line on the page

The sync section shows:

- **Library files (with storage)** — Shared `faa_sas_dct` references that have a stored XML blob and `contentHash`.
- **Ingested in project** — Rows in `dctToolDocuments` for this project.
- **New available** — Library hashes not yet present in the project (when > 0, **Sync from library** is enabled).

## Troubleshooting

- **New available** stays high after sync: some files may lack an upload-time parse cache (uploaded before this flow). **Re-upload** those XML files in Entity Documents so the cache is populated.
- **No library files**: Upload `.xml` in Entity Documents for a project that belongs to your company.
- Traceability blocked: extract text on entity/regulatory manuals first; ensure requirements are ingested (`Ingested in project` > 0).

## Related guides

- [Library and Document Ingestion](./library-and-document-ingestion.md)  
- [Manual Authoring, Management, and Revisions](./manual-authoring-management-and-revisions.md)
