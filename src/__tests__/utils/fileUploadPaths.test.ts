import { describe, expect, it } from 'vitest';
import {
  filterAdminKbReferenceUploadFiles,
  filterCompanyLibraryUploadFiles,
  isCompanyLibraryUploadPath,
  uploadLeafNameForAdminKbFilter,
} from '../../utils/fileUploadPaths';

function fileWithPath(name: string, webkitRelativePath?: string, type = ''): File {
  const f = new File([], name, { type });
  if (webkitRelativePath != null) {
    Object.defineProperty(f, 'webkitRelativePath', { value: webkitRelativePath, enumerable: true });
  }
  return f;
}

describe('uploadLeafNameForAdminKbFilter', () => {
  it('uses last segment of webkitRelativePath when present', () => {
    const f = fileWithPath('', 'policies\\section\\handbook.pdf');
    expect(uploadLeafNameForAdminKbFilter(f)).toBe('handbook.pdf');
  });

  it('falls back to File.name when webkitRelativePath is missing', () => {
    const f = fileWithPath('manual.docx');
    expect(uploadLeafNameForAdminKbFilter(f)).toBe('manual.docx');
  });
});

describe('filterAdminKbReferenceUploadFiles', () => {
  it('accepts PDFs when only webkitRelativePath carries the filename', () => {
    const f = fileWithPath('', 'folder/nested/report.pdf');
    const { accepted, skipped } = filterAdminKbReferenceUploadFiles([f]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('accepts by MIME when leaf has no extension but type is known', () => {
    const f = fileWithPath('', undefined, 'application/pdf');
    const { accepted } = filterAdminKbReferenceUploadFiles([f]);
    expect(accepted).toHaveLength(1);
  });

  it('skips unknown extensions and empty types', () => {
    const f = fileWithPath('readme.md');
    const { accepted, skipped } = filterAdminKbReferenceUploadFiles([f]);
    expect(accepted).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe('isCompanyLibraryUploadPath', () => {
  it('accepts nested PDF paths without a File object', () => {
    expect(isCompanyLibraryUploadPath('GV/AMM/32-40.pdf')).toBe(true);
    expect(isCompanyLibraryUploadPath('notes.md')).toBe(false);
  });

  it('accepts all Company Library allowlisted extensions without MIME', () => {
    const accepted = [
      'manual.pdf',
      'memo.doc',
      'memo.docx',
      'notes.txt',
      'scan.jpg',
      'scan.jpeg',
      'scan.png',
      'chapter.xml',
      '05-10-00-in_xml.js',
    ];
    for (const path of accepted) {
      expect(isCompanyLibraryUploadPath(path)).toBe(true);
    }
  });

  it('rejects unsupported types without MIME', () => {
    expect(isCompanyLibraryUploadPath('archive.zip')).toBe(false);
    expect(isCompanyLibraryUploadPath('readme.md')).toBe(false);
    expect(isCompanyLibraryUploadPath('sheet.csv')).toBe(false);
    expect(isCompanyLibraryUploadPath('photo.webp')).toBe(false);
  });

  it('accepts by MIME when extension is missing', () => {
    expect(isCompanyLibraryUploadPath('untitled', 'image/png')).toBe(true);
    expect(isCompanyLibraryUploadPath('untitled', 'application/xml')).toBe(true);
    expect(isCompanyLibraryUploadPath('untitled', 'application/octet-stream')).toBe(false);
  });
});

describe('filterCompanyLibraryUploadFiles', () => {
  it('accepts png/xml/js and skips zip/md in a mixed batch', () => {
    const files = [
      fileWithPath('scan.png', undefined, 'image/png'),
      fileWithPath('chapter.xml', undefined, 'application/xml'),
      fileWithPath('05-10-00-in_xml.js'),
      fileWithPath('archive.zip'),
      fileWithPath('readme.md'),
    ];
    const { accepted, skipped } = filterCompanyLibraryUploadFiles(files);
    expect(accepted.map((f) => f.name).sort()).toEqual([
      '05-10-00-in_xml.js',
      'chapter.xml',
      'scan.png',
    ]);
    expect(skipped).toBe(2);
  });
});
