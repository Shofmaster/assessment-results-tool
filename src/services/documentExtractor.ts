import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { createClaudeMessage } from './claudeProxy';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export class DocumentExtractor {
  async extractText(
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractPdfText(fileBuffer);
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.extractDocxText(fileBuffer);
    }
    if (mimeType === 'text/plain') {
      return this.extractPlainText(fileBuffer);
    }
    if (mimeType.startsWith('image/')) {
      return this.extractImageText(fileBuffer, mimeType);
    }

    throw new Error(`Unsupported file type: ${mimeType} (${fileName})`);
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
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Extract all visible text from this image. Return only the extracted text content, preserving the original structure and formatting as much as possible. If there is no readable text, return "[No readable text found]".',
            },
          ],
        },
      ],
    });

    return message.content[0].type === 'text'
      ? message.content[0].text || ''
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
