import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_STANDARDS,
  MANUAL_TYPES,
  getSectionTemplates,
  buildManualWriterSystemPrompt,
} from '../../services/manualWriterService';
import type { StandardDefinition, ManualTypeDefinition } from '../../services/manualWriterService';

describe('AVAILABLE_STANDARDS', () => {
  it('is a non-empty array', () => {
    expect(AVAILABLE_STANDARDS.length).toBeGreaterThan(0);
  });

  it('each standard has required fields', () => {
    for (const s of AVAILABLE_STANDARDS) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.agentKbId).toBeTruthy();
      expect(s.citationStyle).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = AVAILABLE_STANDARDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes FAA, IS-BAO, AS9100, and EASA', () => {
    const ids = AVAILABLE_STANDARDS.map((s) => s.id);
    expect(ids).toContain('faa');
    expect(ids).toContain('isbao');
    expect(ids).toContain('as9100');
    expect(ids).toContain('easa');
  });
});

describe('MANUAL_TYPES', () => {
  it('is a non-empty array', () => {
    expect(MANUAL_TYPES.length).toBeGreaterThan(0);
  });

  it('each type has required fields', () => {
    for (const mt of MANUAL_TYPES) {
      expect(mt.id).toBeTruthy();
      expect(mt.label).toBeTruthy();
      expect(Array.isArray(mt.cfrParts)).toBe(true);
      expect(mt.cfrParts.length).toBeGreaterThan(0);
      expect(mt.refDocType).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = MANUAL_TYPES.map((mt) => mt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes common manual types', () => {
    const ids = MANUAL_TYPES.map((mt) => mt.id);
    expect(ids).toContain('part-145-manual');
    expect(ids).toContain('gmm');
    expect(ids).toContain('qcm');
    expect(ids).toContain('sms-manual');
  });
});

describe('getSectionTemplates', () => {
  it('returns base sections for a known manual type', () => {
    const sections = getSectionTemplates('part-145-manual', []);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].title).toBeTruthy();
  });

  it('returns empty array for unknown manual type with no standards', () => {
    const sections = getSectionTemplates('nonexistent', []);
    expect(sections).toEqual([]);
  });

  it('appends standard sections when standards are active', () => {
    const baseCount = getSectionTemplates('part-145-manual', []).length;
    const withIsbao = getSectionTemplates('part-145-manual', ['isbao']);
    expect(withIsbao.length).toBeGreaterThan(baseCount);
  });

  it('combines multiple standards', () => {
    const withOne = getSectionTemplates('gmm', ['isbao']).length;
    const withTwo = getSectionTemplates('gmm', ['isbao', 'as9100']).length;
    expect(withTwo).toBeGreaterThan(withOne);
  });
});

describe('buildManualWriterSystemPrompt', () => {
  const baseCtx = {
    manualType: MANUAL_TYPES[0] as ManualTypeDefinition,
    sectionTitle: 'Housing and Facilities',
    sectionNumber: '145.103',
    activeStandards: [AVAILABLE_STANDARDS[0]] as StandardDefinition[],
    cfrText: '14 CFR Part 145.103 text...',
    referenceDocText: '',
    standardsKbText: '',
    auditIntelligenceMemory: '',
    approvedPriorSections: '',
    paperworkReviewFindings: '',
    assessmentSummary: '',
    activeCars: '',
    sourceDocumentText: '',
    companyName: 'Test Aviation Inc',
  };

  it('returns a non-empty string', () => {
    const prompt = buildManualWriterSystemPrompt(baseCtx);
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('includes the company name', () => {
    const prompt = buildManualWriterSystemPrompt(baseCtx);
    expect(prompt).toContain('Test Aviation Inc');
  });

  it('includes the section title', () => {
    const prompt = buildManualWriterSystemPrompt(baseCtx);
    expect(prompt).toContain('Housing and Facilities');
  });

  it('includes regulatory text when provided', () => {
    const prompt = buildManualWriterSystemPrompt(baseCtx);
    expect(prompt).toContain('14 CFR Part 145.103 text');
  });

  it('uses rewrite mode phrasing when rewriteMode is true', () => {
    const prompt = buildManualWriterSystemPrompt({ ...baseCtx, rewriteMode: true, sourceDocumentText: 'old content' });
    expect(prompt).toContain('rewrite');
  });
});
