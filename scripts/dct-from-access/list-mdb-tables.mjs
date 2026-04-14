#!/usr/bin/env node
/**
 * List user tables and column names from an Access .mdb/.accdb file (mdb-reader).
 * Usage: node list-mdb-tables.mjs <database.mdb>
 */
import { readFileSync } from 'node:fs';
import MDBReader from 'mdb-reader';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node list-mdb-tables.mjs <path-to-database.mdb-or-accdb>');
  process.exit(1);
}

try {
  const buffer = readFileSync(path);
  const reader = new MDBReader(buffer);
  const names = reader.getTableNames({
    normalTables: true,
    systemTables: false,
    linkedTables: false,
  });
  const tables = {};
  for (const name of names) {
    try {
      const table = reader.getTable(name);
      tables[name] = table.getColumnNames();
    } catch (err) {
      tables[name] = { error: String(err?.message ?? err) };
    }
  }
  console.log(JSON.stringify({ file: path, tables }, null, 2));
} catch (err) {
  console.error('Failed to read database:', err?.message ?? err);
  console.error(
    'Tip: try converting .accdb to .mdb in Access, or ensure the file is not encrypted/password-protected.',
  );
  process.exit(1);
}
