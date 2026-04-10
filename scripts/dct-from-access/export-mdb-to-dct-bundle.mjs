#!/usr/bin/env node
/**
 * Export FAA DCT-shaped JSON bundle from Access using a column mapping file.
 * Usage: node export-mdb-to-dct-bundle.mjs <database.mdb> <mapping.json> <out-bundle.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import MDBReader from 'mdb-reader';

function hashDctContent(input) {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function getCell(row, col) {
  if (col == null || col === '') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
  const keys = Object.keys(row);
  const found = keys.find((k) => k.toLowerCase() === String(col).toLowerCase());
  return found !== undefined ? row[found] : undefined;
}

function str(v) {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t === '' ? undefined : t;
}

function num(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function loadMapping(path) {
  const raw = readFileSync(path, 'utf8');
  const m = JSON.parse(raw);
  if (m.version !== 1 || !m.documents || !m.questions) {
    throw new Error('mapping.json must have version: 1, documents, and questions sections');
  }
  const qc = m.questions.columns ?? {};
  if (typeof qc.questionId !== 'string' || typeof qc.text !== 'string') {
    throw new Error('mapping.questions.columns must include questionId and text (database column names)');
  }
  if (typeof m.questions.documentIdColumn !== 'string') {
    throw new Error('mapping.questions.documentIdColumn is required');
  }
  return m;
}

function readTable(reader, name) {
  const table = reader.getTable(name);
  return table.getData();
}

function main() {
  const dbPath = process.argv[2];
  const mappingPath = process.argv[3];
  const outPath = process.argv[4];
  if (!dbPath || !mappingPath || !outPath) {
    console.error(
      'Usage: node export-mdb-to-dct-bundle.mjs <database.mdb> <mapping.json> <out-bundle.json>',
    );
    process.exit(1);
  }

  const mapping = loadMapping(mappingPath);
  const buffer = readFileSync(dbPath);
  const reader = new MDBReader(buffer);

  const { table: docTable, idColumn: docIdCol, columns: docCols } = mapping.documents;
  const {
    table: qTable,
    documentIdColumn: qDocCol,
    columns: qCols,
    sortColumn: qSortCol,
  } = mapping.questions;

  const docRows = readTable(reader, docTable);
  const qRows = readTable(reader, qTable);

  const refCfg = mapping.references;
  if (refCfg?.table) {
    if (typeof refCfg.questionIdColumn !== 'string' || typeof refCfg.labelColumn !== 'string') {
      throw new Error('mapping.references requires questionIdColumn and labelColumn when table is set');
    }
  }
  const refRows = refCfg?.table ? readTable(reader, refCfg.table) : [];
  const respCfg = mapping.responses;
  if (respCfg?.table && typeof respCfg.valueColumn !== 'string') {
    throw new Error('mapping.responses requires valueColumn when table is set');
  }
  const respRows = respCfg?.table ? readTable(reader, respCfg.table) : [];

  const documents = [];

  for (const row of docRows) {
    const docIdRaw = getCell(row, docIdCol);
    if (docIdRaw === undefined || docIdRaw === null) continue;
    const docId = String(docIdRaw);

    const fields = {};
    for (const [key, col] of Object.entries(docCols)) {
      if (typeof col !== 'string') continue;
      const raw = getCell(row, col);
      const s = str(raw);
      if (s) fields[key] = s;
    }

    let fileName = fields.fileName;
    if (!fileName) fileName = `DCT_${docId}.xml`;

    let questions = qRows
      .filter((qr) => String(getCell(qr, qDocCol) ?? '') === docId)
      .map((qr) => {
        const questionId = str(getCell(qr, qCols.questionId));
        if (!questionId) return null;
        const q = {
          questionId,
          questionDetailsId: str(getCell(qr, qCols.questionDetailsId)),
          qVersionNumber: str(getCell(qr, qCols.qVersionNumber)),
          qVersionDate: str(getCell(qr, qCols.qVersionDate)),
          displayOrder: num(getCell(qr, qCols.displayOrder)),
          text: str(getCell(qr, qCols.text)) ?? '',
          safetyAttribute: str(getCell(qr, qCols.safetyAttribute)),
          questionType: str(getCell(qr, qCols.questionType)),
          scopingAttribute: str(getCell(qr, qCols.scopingAttribute)),
          noteToUser: str(getCell(qr, qCols.noteToUser)),
          references: [],
          responses: [],
        };
        return q;
      })
      .filter(Boolean);

    if (qSortCol) {
      questions.sort((a, b) => {
        const sa = getCell(
          qRows.find((r) => String(getCell(r, qDocCol) ?? '') === docId && str(getCell(r, qCols.questionId)) === a.questionId) ?? {},
          qSortCol,
        );
        const sb = getCell(
          qRows.find((r) => String(getCell(r, qDocCol) ?? '') === docId && str(getCell(r, qCols.questionId)) === b.questionId) ?? {},
          qSortCol,
        );
        const na = num(sa);
        const nb = num(sb);
        if (na !== undefined && nb !== undefined) return na - nb;
        return String(sa ?? '').localeCompare(String(sb ?? ''));
      });
    }

    for (const q of questions) {
      if (refCfg?.table) {
        const qidCol = refCfg.questionIdColumn;
        const docRefCol = refCfg.documentIdColumn;
        const lblCol = refCfg.labelColumn;
        const srcCol = refCfg.srcIdColumn;
        for (const rr of refRows) {
          if (String(getCell(rr, qidCol) ?? '') !== q.questionId) continue;
          if (docRefCol && String(getCell(rr, docRefCol) ?? '') !== docId) continue;
          const label = str(getCell(rr, lblCol));
          if (!label) continue;
          q.references.push({
            srcId: srcCol ? str(getCell(rr, srcCol)) : undefined,
            label,
          });
        }
      }

      if (respCfg?.table) {
        const qidCol = respCfg.questionIdColumn;
        const docRespCol = respCfg.documentIdColumn;
        const valCol = respCfg.valueColumn;
        for (const rr of respRows) {
          if (String(getCell(rr, qidCol) ?? '') !== q.questionId) continue;
          if (docRespCol && String(getCell(rr, docRespCol) ?? '') !== docId) continue;
          const val = str(getCell(rr, valCol));
          if (val) q.responses.push(val);
        }
      }
    }

    const docOut = {
      fileName,
      contentHash: '',
      standardDctId: fields.standardDctId,
      standardDctDetailId: fields.standardDctDetailId,
      dctVersionNumber: fields.dctVersionNumber,
      dctVersionDate: fields.dctVersionDate,
      dctStatus: fields.dctStatus,
      mlfId: fields.mlfId,
      mlfLabel: fields.mlfLabel,
      mlfName: fields.mlfName,
      assessmentTypeLabel: fields.assessmentTypeLabel,
      specialtyLabel: fields.specialtyLabel,
      peerGroupLabel: fields.peerGroupLabel,
      purpose: fields.purpose,
      objective: fields.objective,
      questions: questions.map(({ references, responses, ...rest }) => ({
        ...rest,
        references,
        responses,
      })),
    };

    const forHash = JSON.stringify({
      fileName: docOut.fileName,
      standardDctId: docOut.standardDctId,
      standardDctDetailId: docOut.standardDctDetailId,
      dctVersionNumber: docOut.dctVersionNumber,
      dctVersionDate: docOut.dctVersionDate,
      dctStatus: docOut.dctStatus,
      mlfId: docOut.mlfId,
      mlfLabel: docOut.mlfLabel,
      mlfName: docOut.mlfName,
      assessmentTypeLabel: docOut.assessmentTypeLabel,
      specialtyLabel: docOut.specialtyLabel,
      peerGroupLabel: docOut.peerGroupLabel,
      purpose: docOut.purpose,
      objective: docOut.objective,
      questions: docOut.questions.map((q) => ({
        ...q,
        references: [...q.references].sort((a, b) => a.label.localeCompare(b.label)),
        responses: [...q.responses].sort(),
      })),
    });
    docOut.contentHash = hashDctContent(forHash);

    documents.push(docOut);
  }

  writeFileSync(outPath, JSON.stringify({ documents }, null, 2), 'utf8');
  console.error(`Wrote ${documents.length} document(s) to ${outPath}`);
}

main();
