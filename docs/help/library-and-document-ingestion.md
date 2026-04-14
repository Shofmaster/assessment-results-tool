# Library and Document Ingestion

Route: `/library`  
Component: `src/components/LibraryManager.tsx`  
Primary backend: `convex/documents.ts`, `convex/fileActions.ts`, `convex/sharedReferenceDocuments.ts`

## What this page does

The Library page is the intake point for project documents. Users import entity/reference material, ingest DCT XML, review extracted content, and remove obsolete files.

## Main user actions

1. Import one or many entity files.
2. Import an entity folder in batch.
3. Import DCT XML files or folder for compliance workflows.
4. Verify extracted text appears in the list.
5. Delete stale or incorrect documents.

## Key functions and behavior

- `processEntityFiles(fileList, sourceLabel)`  
  Reads selected files, extracts text, uploads records to project storage, and writes document rows.
- `handleImportEntity()`  
  Opens the regular file picker for entity docs and forwards selected files to `processEntityFiles`.
- `handleImportEntityFolder()`  
  Opens a directory-capable picker and batch-processes all files through the same ingestion pipeline.
- `processDctXmlFilesToLibrary(fileList, sourceLabel)`  
  Parses DCT XML content and stores it in library records so DCT compliance can consume it.
- `handleImportDctXml()` / `handleImportDctXmlFolder()`  
  File/folder wrappers for DCT ingestion paths.
- `handleDelete(fileId)`  
  Deletes a library document entry and its associated record.

## Data dependencies

- Project-scoped documents are read/written via Convex document queries/mutations.
- Upload URLs are generated server-side and used by the client to place binary files.
- Extracted text is persisted for downstream analysis/review/simulation modules.

## Outputs and downstream links

- Stored document corpus used by:
  - `/analysis`
  - `/audit`
  - `/review`
  - `/checklists`
  - `/dct-compliance`
  - `/manual-writer`

## Common failure states

- Unsupported or unreadable file format: re-upload with accepted formats only.
- Empty extraction: check file quality/OCR source and re-import.
- Upload interruption: retry import in smaller batches.
