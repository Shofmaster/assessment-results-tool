import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';

type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
const DEFAULT_PDF_OCR_MAX_PAGES = 24;
const DEFAULT_PDF_OCR_EARLY_STOP_CHARS = 14_000;
const DEFAULT_PDF_OCR_MIN_PAGES_BEFORE_EARLY_STOP = 10;

export interface OcrExtractionMetadata {
  backend: 'pdfjs_text' | 'external_ocr' | 'claude_vision' | 'mammoth' | 'plain_text';
  confidence?: number;
}

export interface OcrExtractionResult {
  text: string;
  metadata: OcrExtractionMetadata;
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
    const externalResult = await this.tryExternalOcr(base64, mediaType);
    if (externalResult?.text?.trim()) {
      return {
        text: externalResult.text,
        metadata: {
          backend: 'external_ocr',
          confidence: externalResult.confidence,
        },
      };
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
    let accumulatedLen = 0;

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
      if (reachedMinPages && reachedTextTarget) break;
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
    };
  }

  private async tryExternalOcr(
    base64: string,
    mediaType: SupportedImageMime
  ): Promise<{ text: string; confidence?: number } | null> {
    const url = import.meta.env.VITE_LOGBOOK_OCR_ENDPOINT as string | undefined;
    if (!url) return null;

    const apiKey = import.meta.env.VITE_LOGBOOK_OCR_API_KEY as string | undefined;
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

    if (!response.ok) return null;
    const payload = (await response.json()) as { text?: string; confidence?: number };
    if (!payload.text) return null;
    return {
      text: payload.text,
      confidence: payload.confidence,
    };
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
