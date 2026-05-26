import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import { ingestXmlText, isXmlIngestCandidate, type XmlIngestResult } from './xmlIngest';

type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
const DEFAULT_PDF_OCR_MAX_PAGES = 24;
const DEFAULT_PDF_OCR_EARLY_STOP_CHARS = 14_000;
const DEFAULT_PDF_OCR_MIN_PAGES_BEFORE_EARLY_STOP = 10;

export interface OcrExtractionMetadata {
  backend:
    | 'pdfjs_text'
    | 'external_ocr'
    | 'claude_vision'
    | 'mammoth'
    | 'plain_text'
    | 'xml_ata_ispec'
    | 'xml_s1000d'
    | 'xml_generic';
  confidence?: number;
}

export interface OcrExtractionNotice {
  level: 'info' | 'warning';
  code:
    | 'external_ocr_unavailable'
    | 'external_ocr_failed'
    | 'external_ocr_rejected'
    | 'ocr_early_stop'
    | 'ocr_page_limit'
    | 'ocr_fallback_used';
  message: string;
}

export interface OcrExtractionResult {
  text: string;
  metadata: OcrExtractionMetadata;
  notices?: OcrExtractionNotice[];
  /**
   * Structured XML ingest output when the source was an XML/JS file.
   * Lives outside `metadata` because the Convex `documents.extractionMeta`
   * validator is strict and rejects unknown nested fields — callers must
   * read this in-memory and not persist it in `extractionMeta`.
   */
  xmlIngest?: XmlIngestResult;
}

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Map file extension to MIME type for when browser omits or misreports type (e.g. .docx on Windows). */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.js': 'application/javascript',
};

function getMimeFromFileName(fileName: string): string | undefined {
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TO_MIME[ext];
}

function isSupportedImageMime(mimeType: string): mimeType is SupportedImageMime {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/gif';
}

export class DocumentExtractor {
  /**
   * Some parsers (notably PDF.js worker paths) may transfer/detach buffers.
   * Clone before handing a buffer to third-party parsers when we need to reuse it.
   */
  private cloneBuffer(buffer: ArrayBuffer): ArrayBuffer {
    return buffer.slice(0);
  }

  private getPositiveIntEnv(name: string, fallback: number): number {
    const raw = (import.meta.env as Record<string, unknown>)[name];
    if (typeof raw !== 'string') return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async extractText(
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<string> {
    const result = await this.extractTextWithMetadata(fileBuffer, fileName, mimeType, model);
    return result.text;
  }

  async extractTextWithMetadata(
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<OcrExtractionResult> {
    const effectiveMime =
      mimeType && mimeType !== 'application/octet-stream'
        ? mimeType
        : getMimeFromFileName(fileName) ?? mimeType;

    if (isXmlIngestCandidate(fileName, effectiveMime)) {
      return this.extractXmlText(fileBuffer, fileName);
    }

    if (effectiveMime === 'application/pdf') {
      return this.extractPdfText(fileBuffer, model);
    }
    if (effectiveMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const text = await this.extractDocxText(fileBuffer);
      return { text, metadata: { backend: 'mammoth', confidence: 0.99 } };
    }
    if (effectiveMime === 'text/plain' || effectiveMime === 'text/csv') {
      return { text: this.extractPlainText(fileBuffer), metadata: { backend: 'plain_text', confidence: 1 } };
    }
    if (effectiveMime.startsWith('image/')) {
      if (!isSupportedImageMime(effectiveMime)) {
        throw new Error(`Unsupported image MIME type: ${effectiveMime}`);
      }
      return this.extractImageText(fileBuffer, effectiveMime, model);
    }

    throw new Error(`Unsupported file type: ${effectiveMime || mimeType || 'unknown'} (${fileName})`);
  }

  private shouldFallbackToOcr(extractedText: string): boolean {
    // pdfjs can return empty/near-empty output for scanned/image-only PDFs.
    // Use a conservative threshold to avoid extra (and expensive) OCR for text-based PDFs.
    const nonWhitespaceChars = extractedText.replace(/\s+/g, '').length;
    return nonWhitespaceChars < 200;
  }

  private async extractPdfText(buffer: ArrayBuffer, model: string = DEFAULT_CLAUDE_MODEL): Promise<OcrExtractionResult> {
    const pdfData = new Uint8Array(this.cloneBuffer(buffer));
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      pages.push(pageText);
    }

    const extractedText = pages.join('\n\n');
    if (!this.shouldFallbackToOcr(extractedText)) {
      return { text: extractedText, metadata: { backend: 'pdfjs_text', confidence: 0.99 } };
    }

    // Fallback: if pdfjs doesn't find meaningful text, OCR by rasterizing pages.
    // Defaults favor broader extraction so large scanned logbooks do not truncate to one entry.
    const maxPages = Math.min(
      this.getPositiveIntEnv('VITE_LOGBOOK_OCR_MAX_PAGES', DEFAULT_PDF_OCR_MAX_PAGES),
      pdf.numPages
    );
    const earlyStopChars = this.getPositiveIntEnv('VITE_LOGBOOK_OCR_EARLY_STOP_CHARS', DEFAULT_PDF_OCR_EARLY_STOP_CHARS);
    const minPagesBeforeEarlyStop = Math.min(
      maxPages,
      this.getPositiveIntEnv('VITE_LOGBOOK_OCR_MIN_PAGES_BEFORE_EARLY_STOP', DEFAULT_PDF_OCR_MIN_PAGES_BEFORE_EARLY_STOP)
    );

    return this.extractPdfTextViaOcr(this.cloneBuffer(buffer), model, {
      maxPages,
      earlyStopChars,
      minPagesBeforeEarlyStop,
    });
  }

  private async extractDocxText(buffer: ArrayBuffer): Promise<string> {
    const raw = await mammoth.extractRawText({ arrayBuffer: this.cloneBuffer(buffer) });
    const rawText = (raw.value ?? '').toString();

    // If the docx contains typed text but mammoth couldn't extract it reliably,
    // fall back to HTML conversion and strip tags to recover text.
    if (rawText.trim().length >= 1) {
      return rawText.trim();
    }

    try {
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: this.cloneBuffer(buffer) });
      const html = htmlResult.value ?? '';
      if (!html) return '';

      if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.innerHTML = html;
        return (div.textContent ?? '').trim();
      }

      // Non-DOM fallback: best-effort tag stripping.
      return String(html)
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return rawText.trim();
    }
  }

  private extractPlainText(buffer: ArrayBuffer): string {
    return new TextDecoder().decode(buffer);
  }

  /**
   * Decode the buffer as UTF-8 text and run the XML ingest pipeline. The
   * structured result lives on the top-level `xmlIngest` field (not under
   * `metadata`) so it never gets sent to the Convex `documents.extractionMeta`
   * validator, which is strict and rejects unknown fields.
   */
  private extractXmlText(buffer: ArrayBuffer, fileName: string): OcrExtractionResult {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const xml = ingestXmlText(text, fileName);
    const backend =
      xml.format.family === 'ata_ispec'
        ? 'xml_ata_ispec'
        : xml.format.family === 's1000d'
        ? 'xml_s1000d'
        : 'xml_generic';
    return {
      text: xml.readingText,
      metadata: {
        backend,
        confidence: xml.format.confidence,
      },
      xmlIngest: xml,
    };
  }

  private async extractImageText(
    buffer: ArrayBuffer,
    mimeType: SupportedImageMime,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<OcrExtractionResult> {
    const base64 = this.arrayBufferToBase64(buffer);
    return this.extractImageTextFromBase64(base64, mimeType, model);
  }

  private async extractImageTextFromBase64(
    base64: string,
    mediaType: SupportedImageMime,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<OcrExtractionResult> {
    const externalAttempt = await this.tryExternalOcr(base64, mediaType);
    const notices: OcrExtractionNotice[] = [];
    if (externalAttempt.notice) notices.push(externalAttempt.notice);

    const externalResult = externalAttempt.result;
    if (externalResult?.text?.trim()) {
      return {
        text: externalResult.text,
        metadata: {
          backend: 'external_ocr',
          confidence: externalResult.confidence,
        },
        notices,
      };
    }

    if (externalAttempt.attempted) {
      notices.push({
        level: 'info',
        code: 'ocr_fallback_used',
        message: 'External OCR did not return usable text; used Claude vision OCR fallback.',
      });
    }

    const message = await createClaudeMessage({
      model,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: 'Extract all visible text from this image. Return only the extracted text content, preserving the original structure and formatting as much as possible. If there is no readable text, return "[No readable text found]".',
            },
          ],
        },
      ],
    });

    const firstBlock = message.content[0];
    const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text || '' : '[Failed to extract text from image]';
    return {
      text,
      metadata: {
        backend: 'claude_vision',
      },
      notices,
    };
  }

  private async extractPdfTextViaOcr(
    buffer: ArrayBuffer,
    model: string,
    opts: { maxPages: number; earlyStopChars: number; minPagesBeforeEarlyStop: number }
  ): Promise<OcrExtractionResult> {
    if (typeof document === 'undefined') {
      // OCR needs rasterization via canvas; in non-DOM environments we can't render pages.
      throw new Error('OCR fallback requires a DOM canvas');
    }

    const pdfData = new Uint8Array(this.cloneBuffer(buffer));
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const maxPages = Math.min(opts.maxPages, pdf.numPages);

    const pagesText: string[] = [];
    const confidences: number[] = [];
    const notices: OcrExtractionNotice[] = [];
    let accumulatedLen = 0;
    let stoppedEarly = false;

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);

      // Determine a reasonable scale to keep images from becoming gigantic.
      const rawViewport = page.getViewport({ scale: 1 });
      const maxWidthPx = 2000;
      const scale = Math.min(2.25, maxWidthPx / rawViewport.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D canvas context for PDF OCR');

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      // Rasterized page -> image OCR via the same Claude vision path.
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      const pageOcr = await this.extractImageTextFromBase64(base64, 'image/png', model);
      if (typeof pageOcr.metadata.confidence === 'number') {
        confidences.push(pageOcr.metadata.confidence);
      }
      pagesText.push(`--- Page ${i} ---\n${pageOcr.text}`);

      accumulatedLen += pageOcr.text.replace(/\s+/g, '').length;
      const reachedMinPages = i >= opts.minPagesBeforeEarlyStop;
      const reachedTextTarget = accumulatedLen >= opts.earlyStopChars;
      if (reachedMinPages && reachedTextTarget) {
        stoppedEarly = true;
        notices.push({
          level: 'warning',
          code: 'ocr_early_stop',
          message: `OCR stopped after ${i} page(s) once ${opts.earlyStopChars.toLocaleString()} non-whitespace characters were reached.`,
        });
        break;
      }
    }

    if (!stoppedEarly && maxPages < pdf.numPages) {
      notices.push({
        level: 'warning',
        code: 'ocr_page_limit',
        message: `OCR processed ${maxPages} of ${pdf.numPages} pages due to page limit.`,
      });
    }

    const avgConfidence = confidences.length
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : undefined;

    return {
      text: pagesText.join('\n\n'),
      metadata: {
        backend: 'claude_vision',
        confidence: avgConfidence,
      },
      notices,
    };
  }

  private async tryExternalOcr(
    base64: string,
    mediaType: SupportedImageMime
  ): Promise<{
    attempted: boolean;
    result: { text: string; confidence?: number } | null;
    notice?: OcrExtractionNotice;
  }> {
    const url = import.meta.env.VITE_LOGBOOK_OCR_ENDPOINT as string | undefined;
    if (!url) return { attempted: false, result: null };

    const apiKey = import.meta.env.VITE_LOGBOOK_OCR_API_KEY as string | undefined;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType,
        }),
      });

      if (!response.ok) {
        return {
          attempted: true,
          result: null,
          notice: {
            level: 'warning',
            code: 'external_ocr_rejected',
            message: `External OCR endpoint responded with ${response.status}; falling back to Claude vision OCR.`,
          },
        };
      }
      const payload = (await response.json()) as { text?: string; confidence?: number };
      if (!payload.text) {
        return {
          attempted: true,
          result: null,
          notice: {
            level: 'warning',
            code: 'external_ocr_failed',
            message: 'External OCR endpoint returned no text; falling back to Claude vision OCR.',
          },
        };
      }
      return {
        attempted: true,
        result: {
          text: payload.text,
          confidence: payload.confidence,
        },
      };
    } catch (error: any) {
      return {
        attempted: true,
        result: null,
        notice: {
          level: 'warning',
          code: 'external_ocr_unavailable',
          message: `External OCR request failed (${error?.message || 'network error'}); falling back to Claude vision OCR.`,
        },
      };
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/** User-safe message for extraction or upload failures shown in the logbook UI */
export function userFacingExtractionError(error: unknown): string {
  if (error instanceof Error) {
    const m = error.message;
    if (/Unsupported file type/i.test(m)) {
      return 'This file type is not supported. Use PDF, Word (.docx), plain text, CSV, or PNG/JPEG/WebP/GIF images.';
    }
    if (/Unsupported image MIME/i.test(m)) {
      return 'This image format is not supported. Try PNG or JPEG.';
    }
    if (/network|fetch|Failed to fetch/i.test(m)) {
      return 'Network error while processing the file. Check your connection and try again.';
    }
    return m.length > 200 ? `${m.slice(0, 197)}…` : m;
  }
  return 'Something went wrong while reading this file. Try again or upload a different copy.';
}
