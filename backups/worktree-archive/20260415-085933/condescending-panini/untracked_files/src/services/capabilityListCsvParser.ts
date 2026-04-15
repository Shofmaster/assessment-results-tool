/**
 * Browser-safe CSV parser for Capability List (CL) bulk import.
 *
 * Expected columns (order flexible, matched by header name):
 *   cl_number, article_description, make, model, part_number,
 *   authorized_functions, technical_data_ref, notes
 *
 * `authorized_functions` can be a semicolon- or comma-separated list within the cell.
 */

export interface CapabilityListRow {
  clNumber?: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions: string[];
  technicalDataRef?: string;
  notes?: string;
}

export interface CsvParseResult {
  rows: CapabilityListRow[];
  errors: string[];
  totalLines: number;
  skippedLines: number;
}

/** Normalize a CSV header to a canonical key. */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Split a single CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse `authorized_functions` cell value into an array. */
function parseFunctions(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const HEADER_ALIASES: Record<string, keyof CapabilityListRow> = {
  cl_number: "clNumber",
  cl_no: "clNumber",
  cl_item: "clNumber",
  item: "clNumber",
  article_description: "articleDescription",
  article: "articleDescription",
  description: "articleDescription",
  make: "make",
  manufacturer: "make",
  model: "model",
  part_number: "partNumber",
  part_no: "partNumber",
  pn: "partNumber",
  p_n: "partNumber",
  authorized_functions: "authorizedFunctions",
  functions: "authorizedFunctions",
  maintenance_functions: "authorizedFunctions",
  authorized_maintenance: "authorizedFunctions",
  technical_data_ref: "technicalDataRef",
  technical_data: "technicalDataRef",
  tech_data: "technicalDataRef",
  cmm_ref: "technicalDataRef",
  notes: "notes",
  remarks: "notes",
  comments: "notes",
};

export function parseCapabilityListCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length === 0) {
    return { rows: [], errors: ["File is empty"], totalLines: 0, skippedLines: 0 };
  }

  const headerLine = lines[0];
  const rawHeaders = splitCsvLine(headerLine).map(normalizeHeader);

  // Map column index → field name
  const colMap: Record<number, keyof CapabilityListRow> = {};
  for (let i = 0; i < rawHeaders.length; i++) {
    const mapped = HEADER_ALIASES[rawHeaders[i]];
    if (mapped) colMap[i] = mapped;
  }

  if (!Object.values(colMap).includes("articleDescription")) {
    return {
      rows: [],
      errors: [
        `Could not find 'article_description' column. Found headers: ${rawHeaders.join(", ")}. ` +
        `Expected column names: cl_number, article_description, make, model, part_number, authorized_functions, technical_data_ref, notes`,
      ],
      totalLines: lines.length - 1,
      skippedLines: lines.length - 1,
    };
  }

  const rows: CapabilityListRow[] = [];
  const errors: string[] = [];
  let skippedLines = 0;

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line) { skippedLines++; continue; }

    const fields = splitCsvLine(line);
    const partial: Partial<Record<keyof CapabilityListRow, string>> & { authorizedFunctions?: string } = {};

    for (const [colStr, fieldName] of Object.entries(colMap)) {
      const col = Number(colStr);
      const val = fields[col]?.trim() ?? "";
      if (val) (partial as any)[fieldName] = val;
    }

    const articleDescription = partial.articleDescription ?? "";
    if (!articleDescription) {
      errors.push(`Line ${lineIdx + 1}: Missing article_description — skipped`);
      skippedLines++;
      continue;
    }

    rows.push({
      clNumber: partial.clNumber || undefined,
      articleDescription,
      make: partial.make || undefined,
      model: partial.model || undefined,
      partNumber: partial.partNumber || undefined,
      authorizedFunctions: parseFunctions(partial.authorizedFunctions ?? ""),
      technicalDataRef: (partial as any).technicalDataRef || undefined,
      notes: partial.notes || undefined,
    });
  }

  return {
    rows,
    errors,
    totalLines: lines.length - 1,
    skippedLines,
  };
}
