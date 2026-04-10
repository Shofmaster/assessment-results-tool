# DCT data from Microsoft Access

Use this when you have FAA SAS DCT content in a **Microsoft Access** database (often many DCTs) instead of individual XML files.

## Phase 1: Discover your schema

Access layouts vary by FAA export and version. Before exporting:

1. Run **list tables** (see below) on your `.mdb` / `.accdb` file.
2. Identify tables and columns for:
   - **DCT document header** — one row per DCT (peer group, MLF, version IDs, purpose, objective, etc.).
   - **Questions** — many rows per DCT, each with a stable question id and question text.
   - **References** (optional) — rows keyed to a question, with a human-readable label (and optional source id).
   - **Responses** (optional) — rows keyed to a question, with response text.

3. Map those columns to the app’s ingest shape by copying [`mapping.example.json`](mapping.example.json) to `mapping.json` and editing table/column names to match **your** database (the example uses placeholder names only).

Target field semantics match [`src/services/dctXmlParser.ts`](../../src/services/dctXmlParser.ts) (`ParsedDctToolDocument` / `ParsedDctQuestion`).

## List tables and columns

```bash
npm run dct:list-mdb -- "C:\path\to\database.mdb"
```

Writes a JSON description of user tables and column names to stdout. Redirect to a file if helpful:

```bash
npm run dct:list-mdb -- "C:\path\to\database.mdb" > schema-dump.json
```

If opening `.accdb` fails, try **Access “Save As”** to `.mdb`, or export linked data to `.mdb` first.

## Export to DCT ingest bundle (JSON)

With a completed `mapping.json`:

```bash
npm run dct:export-mdb -- "C:\path\to\database.mdb" ".\mapping.json" ".\dct-bundle.json"
```

The output file is either `{ "documents": [ ... ] }` or a bare array — both are accepted by **DCT Compliance → Import DCT JSON bundle**.

## `.accdb` vs `.mdb`

`mdb-reader` supports many Access versions (Jet / ACE). Some encrypted or very new files may still fail; use an `.mdb` copy or export from Access when needed.

## Browser workflow

1. Export `dct-bundle.json` locally (steps above).
2. In the app, open **DCT Compliance** and use **Import DCT JSON bundle** (chunked ingest, progress).
3. Optionally still use **Upload folder** for raw `.xml` trees without Access.
