import { describe, expect, it } from 'vitest';
import { filterAdminKbReferenceUploadFiles, uploadLeafNameForAdminKbFilter } from '../../utils/fileUploadPaths';

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
