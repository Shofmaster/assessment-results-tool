/**
 * Context builders for the splash "Ask an Expert" flow: turn project docs,
 * shared references, retrieved passages/full documents, and the company
 * profile into prompt context blocks (with optional [S#] source tagging).
 * Extracted verbatim from SplashPage.tsx.
 */
import type { AskChunkSource, AskDocumentSource } from '../../types/askSources';
import { makeExcerpt } from '../../types/askSources';
import { categoryLabel } from '../ask/AskMarkdown';
import type { RetrievedDocRef } from './chatModel';

/** Categories treated as "company documents" for splash search context. */
export const COMPANY_DOCUMENT_CATEGORIES = new Set([
  'uploaded',
  'entity',
  'regulatory',
  'sms',
  'reference',
  'mel',
  'maintenance_manual',
  'parts_catalog',
  'logbook_scan',
  'wiring_diagram',
]);

/**
 * Below this count of indexed documents, we pass the full set of indexed doc ids
 * to documentChunks.search to bypass ANN pre-filter drops. Above it, we let ANN
 * handle pre-filtering for performance.
 */
export const ASK_AGENTS_FOCUS_THRESHOLD = 50;

/** Technical library uploads (Company Library) — always targeted in homepage retrieval. */
export const TECHNICAL_LIBRARY_CATEGORIES = new Set(['maintenance_manual', 'parts_catalog', 'logbook_scan']);

export function remediationHintForReason(reason: string): string | null {
  const lower = reason.toLowerCase();
  if (lower.includes('drive search index') || lower.includes('refresh search index')) {
    return 'Suggested fix: open Admin · Library or Company Library and click "Refresh search index", then sign in to Google.';
  }
  if (lower.includes('no extracted text')) {
    return 'Suggested fix: for uploaded manuals, re-upload an OCR/text-readable file then Re-index. For Google Drive links, use Refresh search index instead.';
  }
  if (lower.includes('indexing_unavailable') || lower.includes('embed_') || lower.includes('voyage') || lower.includes('openai')) {
    return 'Suggested fix: verify embedding API env vars in Convex, then re-index.';
  }
  if (lower.includes('unsupported category')) {
    return 'Suggested fix: open the publication and re-save to normalize category, then re-index.';
  }
  return null;
}

export function buildUploadedDocumentsContext(documents: any[]): { context: string; usedCount: number; totalAvailable: number } {
  const seenIds = new Set<string>();
  const uploadedWithText = (documents || []).filter((doc) => {
    if (!doc || typeof doc?.extractedText !== 'string' || doc.extractedText.trim().length === 0) return false;
    if (!COMPANY_DOCUMENT_CATEGORIES.has(doc?.category)) return false;
    const key = doc._id ? String(doc._id) : `${doc?.name || ''}|${doc?.category || ''}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
  if (!uploadedWithText.length) {
    return { context: '', usedCount: 0, totalAvailable: 0 };
  }

  const maxDocs = 14;
  const maxTotalChars = 180000;
  let totalChars = 0;
  const chunks: string[] = [];
  let usedCount = 0;

  for (const doc of uploadedWithText.slice(0, maxDocs)) {
    const name = String(doc?.name || doc?.title || `Company document ${usedCount + 1}`).trim();
    const normalizedText = String(doc.extractedText)
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedText) continue;
    const label = categoryLabel(doc?.category);
    const heading = `### ${name}\n_source: ${label}_\n`;
    let body = normalizedText;
    if (totalChars + heading.length + body.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars - heading.length;
      if (remaining < 400) break;
      body = `${body.slice(0, remaining - 30)}\n[Context limit reached for this request.]`;
    }
    const chunk = `${heading}${body}`;
    if (totalChars + chunk.length > maxTotalChars) break;
    chunks.push(chunk);
    totalChars += chunk.length;
    usedCount += 1;
    if (totalChars >= maxTotalChars) break;
  }

  if (!chunks.length) {
    return { context: '', usedCount: 0, totalAvailable: uploadedWithText.length };
  }

  return {
    context: chunks.join('\n\n'),
    usedCount,
    totalAvailable: uploadedWithText.length,
  };
}

export function buildSharedReferenceContext(documents: any[]): { context: string; usedCount: number; totalAvailable: number } {
  const docsWithText = (documents || []).filter(
    (doc) => typeof doc?.extractedText === 'string' && doc.extractedText.trim().length > 0
  );
  if (!docsWithText.length) {
    return { context: '', usedCount: 0, totalAvailable: 0 };
  }

  const maxDocs = 10;
  const maxTotalChars = 120000;
  let totalChars = 0;
  const chunks: string[] = [];
  let usedCount = 0;

  for (const doc of docsWithText.slice(0, maxDocs)) {
    const name = String(doc?.name || `Shared reference ${usedCount + 1}`).trim();
    const metaBits = [
      typeof doc?.documentType === 'string' ? `type: ${doc.documentType}` : '',
      typeof doc?.issuer === 'string' ? `issuer: ${doc.issuer}` : '',
      typeof doc?.revision === 'string' ? `revision: ${doc.revision}` : '',
    ].filter(Boolean);
    const normalizedText = String(doc.extractedText).replace(/\s+/g, ' ').trim();
    if (!normalizedText) continue;
    const metaLine = metaBits.length > 0 ? `\n_${metaBits.join(' | ')}_` : '';
    const heading = `### ${name}${metaLine}\n`;
    let body = normalizedText;
    if (totalChars + heading.length + body.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars - heading.length;
      if (remaining < 400) break;
      body = `${body.slice(0, remaining - 30)}\n[Context limit reached for this request.]`;
    }
    const chunk = `${heading}${body}`;
    if (totalChars + chunk.length > maxTotalChars) break;
    chunks.push(chunk);
    totalChars += chunk.length;
    usedCount += 1;
    if (totalChars >= maxTotalChars) break;
  }

  if (!chunks.length) {
    return { context: '', usedCount: 0, totalAvailable: docsWithText.length };
  }

  return {
    context: chunks.join('\n\n'),
    usedCount,
    totalAvailable: docsWithText.length,
  };
}

export function buildRetrievedPassageContext(
  chunks: any[],
  tagging = false,
): {
  context: string;
  usedCount: number;
  docCount: number;
  docs: RetrievedDocRef[];
  sources: AskChunkSource[];
} {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return { context: '', usedCount: 0, docCount: 0, docs: [], sources: [] };
  }
  const docIds = new Set<string>();
  const docsByOrder: RetrievedDocRef[] = [];
  const lines: string[] = [];
  const sources: AskChunkSource[] = [];
  for (const chunk of chunks) {
    const docId = String(chunk?.documentId || '');
    if (docId && !docIds.has(docId)) {
      docIds.add(docId);
      docsByOrder.push({
        id: docId,
        name: String(chunk?.docName || 'Company document').trim() || 'Company document',
        category: String(chunk?.category || ''),
      });
    }
    const docName = String(chunk?.docName || 'Company document').trim();
    const chunkIndex = Number.isFinite(chunk?.chunkIndex) ? Number(chunk.chunkIndex) + 1 : '?';
    const totalChunks = Number.isFinite(chunk?.totalChunks) ? Number(chunk.totalChunks) : '?';
    const category = categoryLabel(chunk?.category);
    const text = String(chunk?.text || '').trim();
    if (!text) continue;
    const canTag = tagging && docId && Number.isFinite(chunk?.startChar) && Number.isFinite(chunk?.endChar);
    if (canTag) {
      const tag = `S${sources.length + 1}`;
      sources.push({
        tag,
        kind: 'chunk',
        documentId: docId,
        chunkId: String(chunk?.chunkId || ''),
        docName: docName || 'Company document',
        category: String(chunk?.category || ''),
        chunkIndex: Number.isFinite(chunk?.chunkIndex) ? Number(chunk.chunkIndex) : 0,
        totalChunks: Number.isFinite(chunk?.totalChunks) ? Number(chunk.totalChunks) : 0,
        startChar: Number(chunk.startChar),
        endChar: Number(chunk.endChar),
        score: Number.isFinite(chunk?.score) ? Number(chunk.score) : 0,
        excerpt: makeExcerpt(text),
      });
      lines.push(`[${tag}] ${docName} (passage ${chunkIndex}/${totalChunks}) — ${category}\n${text}`);
    } else {
      lines.push(`### ${docName} (passage ${chunkIndex}/${totalChunks})\n_source: ${category}_\n${text}`);
    }
  }
  if (lines.length === 0) return { context: '', usedCount: 0, docCount: 0, docs: docsByOrder, sources: [] };
  return {
    context: lines.join('\n\n'),
    usedCount: lines.length,
    docCount: docIds.size,
    docs: docsByOrder,
    sources,
  };
}

export function buildRetrievedFullDocumentContext(
  documents: any[],
  tagging = false,
): {
  context: string;
  usedCount: number;
  docs: RetrievedDocRef[];
  sources: AskDocumentSource[];
} {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { context: '', usedCount: 0, docs: [], sources: [] };
  }
  const lines: string[] = [];
  const docs: RetrievedDocRef[] = [];
  const sources: AskDocumentSource[] = [];
  for (const doc of documents) {
    const docId = String(doc?.documentId || '');
    const docName = String(doc?.docName || 'Company document').trim();
    const category = categoryLabel(doc?.category);
    const text = String(doc?.text || '').trim();
    if (!text) continue;
    if (tagging && docId) {
      const tag = `S${sources.length + 1}`;
      sources.push({
        tag,
        kind: 'document',
        documentId: docId,
        docName: docName || 'Company document',
        category: String(doc?.category || ''),
      });
      lines.push(`[${tag}] ${docName} — ${category} (full document)\n${text}`);
    } else {
      lines.push(`### ${docName}\n_source: ${category}_\n${text}`);
    }
    docs.push({
      id: docId,
      name: docName || 'Company document',
      category: String(doc?.category || ''),
    });
  }
  if (lines.length === 0) return { context: '', usedCount: 0, docs, sources: [] };
  return {
    context: lines.join('\n\n'),
    usedCount: lines.length,
    docs,
    sources,
  };
}

export function buildCompanyProfileContext(profile: any): { context: string; hasAny: boolean } {
  if (!profile || typeof profile !== 'object') return { context: '', hasAny: false };

  const scalarRows: Array<[string, unknown]> = [
    ['Company name', profile.companyName],
    ['Legal entity', profile.legalEntityName],
    ['Primary location', profile.primaryLocation],
    ['Primary contact', profile.contactName],
    ['Contact email', profile.contactEmail],
    ['Contact phone', profile.contactPhone],
    ['Repair station type', profile.repairStationType],
    ['Operations scope', profile.operationsScope],
    ['SMS maturity', profile.smsMaturity],
  ];

  const lines: string[] = [];
  for (const [label, rawValue] of scalarRows) {
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    lines.push(`- ${label}: ${value}`);
  }

  const numberRows: Array<[string, unknown]> = [
    ['Facility square footage', profile.facilitySquareFootage],
    ['Employee count', profile.employeeCount],
  ];
  for (const [label, rawValue] of numberRows) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
    lines.push(`- ${label}: ${rawValue}`);
  }

  const listRows: Array<[string, unknown]> = [
    ['Certifications', profile.certifications],
    ['Aircraft categories', profile.aircraftCategories],
    ['Services offered', profile.servicesOffered],
  ];
  for (const [label, rawValue] of listRows) {
    if (!Array.isArray(rawValue) || rawValue.length === 0) continue;
    const values = rawValue
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (values.length === 0) continue;
    lines.push(`- ${label}: ${values.join(', ')}`);
  }

  if (typeof profile.hasSms === 'boolean') {
    lines.push(`- Has SMS program: ${profile.hasSms ? 'Yes' : 'No'}`);
  }

  if (lines.length === 0) return { context: '', hasAny: false };
  return {
    context: lines.join('\n'),
    hasAny: true,
  };
}
