import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAssessmentJson, downloadAssessmentsExport } from '../../utils/exportAssessment';

describe('downloadAssessmentJson', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    const fakeAnchor = { href: '', download: '', click: clickSpy } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);
    createObjectURLSpy = vi.fn().mockReturnValue('blob:fake-url');
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a download link and clicks it', () => {
    downloadAssessmentJson({ companyName: 'Acme Aviation', score: 95 });
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('cleans up the object URL after download', () => {
    downloadAssessmentJson({ score: 100 });
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
  });

  it('uses custom filename when provided', () => {
    const fakeAnchor = { href: '', download: '', click: vi.fn() } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    downloadAssessmentJson({ score: 100 }, { filename: 'custom.json' });
    expect(fakeAnchor.download).toBe('custom.json');
  });

  it('generates filename from companyName when no filename given', () => {
    const fakeAnchor = { href: '', download: '', click: vi.fn() } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    downloadAssessmentJson({ companyName: 'Acme Air' });
    expect(fakeAnchor.download).toMatch(/^assessment-Acme-Air-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('downloadAssessmentsExport', () => {
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    const fakeAnchor = { href: '', download: '', click: clickSpy } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports multiple assessments', () => {
    downloadAssessmentsExport([
      { data: { score: 90 }, companyName: 'A' },
      { data: { score: 80 }, companyName: 'B' },
    ]);
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('generates the correct filename format', () => {
    const fakeAnchor = { href: '', download: '', click: vi.fn() } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    downloadAssessmentsExport([{ data: {} }]);
    expect(fakeAnchor.download).toMatch(/^assessments-export-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
