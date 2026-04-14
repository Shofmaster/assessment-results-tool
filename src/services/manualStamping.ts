import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

type PreparedDownload = {
  blob: Blob;
  fileName: string;
  warnings: string[];
};

function withUncontrolledSuffix(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName}-uncontrolled-copy`;
  return `${fileName.slice(0, dot)}-uncontrolled-copy${fileName.slice(dot)}`;
}

async function stampPdf(buffer: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(buffer);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const size = Math.min(Math.max(width, height) / 10, 72);
    page.drawText('UNCONTROLLED COPY', {
      x: width * 0.15,
      y: height * 0.5,
      size,
      font,
      rotate: degrees(35),
      color: rgb(0.82, 0.1, 0.12),
      opacity: 0.2,
    });
  }
  return await pdf.save();
}

export async function prepareManualDownload(params: {
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  stampUncontrolledCopy: boolean;
}): Promise<PreparedDownload> {
  const response = await fetch(params.fileUrl);
  if (!response.ok) {
    throw new Error('Failed to download file');
  }
  const blob = await response.blob();
  if (!params.stampUncontrolledCopy) {
    return { blob, fileName: params.fileName, warnings: [] };
  }

  const mimeType = params.mimeType || blob.type;
  if (mimeType.includes('pdf') || params.fileName.toLowerCase().endsWith('.pdf')) {
    const stamped = await stampPdf(await blob.arrayBuffer());
    const stampedArray = new Uint8Array(stamped);
    return {
      blob: new Blob([stampedArray], { type: 'application/pdf' }),
      fileName: withUncontrolledSuffix(params.fileName),
      warnings: [],
    };
  }

  return {
    blob,
    fileName: withUncontrolledSuffix(params.fileName),
    warnings: ['Binary stamping is currently supported for PDF files. A filename marker was added instead.'],
  };
}
