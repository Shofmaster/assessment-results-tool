export type ParsedClassRating = {
  category: string;
  classNumber: number;
  limitations?: string;
  isActive?: boolean;
};

export type ParsedCapabilityItem = {
  clNumber?: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions: string[];
  technicalDataRef?: string;
  notes?: string;
  isActive?: boolean;
};

export type ParsedRepairStationImport = {
  ratings: ParsedClassRating[];
  capabilities: ParsedCapabilityItem[];
  errors: string[];
};

function csvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/g).filter((line) => line.trim().length > 0);
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return undefined;
}

function parseFunctions(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;|,/]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseRatingsCsv(text: string): { rows: ParsedClassRating[]; errors: string[] } {
  const rows = csvRows(text);
  if (rows.length === 0) return { rows: [], errors: ["CSV is empty"] };
  const header = rows[0].map((h) => h.toLowerCase());
  const dataRows = rows.slice(1);
  const out: ParsedClassRating[] = [];
  const errors: string[] = [];
  const idxCategory = header.indexOf("category");
  const idxClass = header.indexOf("class_number");
  const idxLimitations = header.indexOf("limitations");
  const idxIsActive = header.indexOf("is_active");
  if (idxCategory < 0 || idxClass < 0) {
    return { rows: [], errors: ["Missing required columns: category,class_number"] };
  }
  dataRows.forEach((row, i) => {
    const category = row[idxCategory]?.trim();
    const classRaw = row[idxClass]?.trim();
    const classNumber = Number(classRaw);
    if (!category || !Number.isFinite(classNumber)) {
      errors.push(`Row ${i + 2}: category and class_number are required`);
      return;
    }
    out.push({
      category,
      classNumber,
      limitations: idxLimitations >= 0 ? row[idxLimitations] || undefined : undefined,
      isActive: idxIsActive >= 0 ? parseBoolean(row[idxIsActive]) : undefined,
    });
  });
  return { rows: out, errors };
}

export function parseCapabilitiesCsv(text: string): { rows: ParsedCapabilityItem[]; errors: string[] } {
  const rows = csvRows(text);
  if (rows.length === 0) return { rows: [], errors: ["CSV is empty"] };
  const header = rows[0].map((h) => h.toLowerCase());
  const dataRows = rows.slice(1);
  const out: ParsedCapabilityItem[] = [];
  const errors: string[] = [];
  const idxArticle = header.indexOf("article_description");
  if (idxArticle < 0) {
    return { rows: [], errors: ["Missing required column: article_description"] };
  }
  const idxCl = header.indexOf("cl_number");
  const idxMake = header.indexOf("make");
  const idxModel = header.indexOf("model");
  const idxPart = header.indexOf("part_number");
  const idxFns = header.indexOf("authorized_functions");
  const idxTech = header.indexOf("technical_data_ref");
  const idxNotes = header.indexOf("notes");
  const idxIsActive = header.indexOf("is_active");
  dataRows.forEach((row, i) => {
    const articleDescription = row[idxArticle]?.trim();
    if (!articleDescription) {
      errors.push(`Row ${i + 2}: article_description is required`);
      return;
    }
    out.push({
      clNumber: idxCl >= 0 ? row[idxCl] || undefined : undefined,
      articleDescription,
      make: idxMake >= 0 ? row[idxMake] || undefined : undefined,
      model: idxModel >= 0 ? row[idxModel] || undefined : undefined,
      partNumber: idxPart >= 0 ? row[idxPart] || undefined : undefined,
      authorizedFunctions: idxFns >= 0 ? parseFunctions(row[idxFns]) : [],
      technicalDataRef: idxTech >= 0 ? row[idxTech] || undefined : undefined,
      notes: idxNotes >= 0 ? row[idxNotes] || undefined : undefined,
      isActive: idxIsActive >= 0 ? parseBoolean(row[idxIsActive]) : undefined,
    });
  });
  return { rows: out, errors };
}
