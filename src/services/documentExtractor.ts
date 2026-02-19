import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { createClaudeMessage } from './claudeProxy';

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

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

export class DocumentExtractor {
  async extractText(
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    const effectiveMime =
      mimeType && mimeType !== 'application/octet-stream'
        ? mimeType
        : getMimeFromFileName(fileName) ?? mimeType;

    if (effectiveMime === 'application/pdf') {
      return this.extractPdfText(fileBuffer);
    }
    if (effectiveMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.extractDocxText(fileBuffer);
    }
    if (effectiveMime === 'text/plain') {
      return this.extractPlainText(fileBuffer);
    }
    if (effectiveMime.startsWith('image/')) {
      return this.extractImageText(fileBuffer, effectiveMime);
    }

    throw new Error(`Unsupported file type: ${effectiveMime || mimeType || 'unknown'} (${fileName})`);
  }

  private async extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n\n');
  }

  private async extractDocxText(buffer: ArrayBuffer): Promise<string> {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  private extractPlainText(buffer: ArrayBuffer): string {
    return new TextDecoder().decode(buffer);
  }

  private async extractImageText(
    buffer: ArrayBuffer,
    mimeType: string
  ): Promise<string> {
    const base64 = this.arrayBufferToBase64(buffer);
    const mediaType = mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

    const message = await createClaudeMessage({
      model: CLAUDE_MODEL,
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
    return firstBlock && firstBlock.type === 'text'
      ? firstBlock.text || ''
      : '[Failed to extract text from image]';
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
