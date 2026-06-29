import { describe, expect, it } from 'vitest';
import {
  classifyByName,
  classifyByContent,
  needsContentPeek,
  PUBLICATION_TYPE_TO_CATEGORY,
} from '../../services/driveFileClassifier';

describe('classifyByName', () => {
  it('routes a clearly-named parts catalog with high confidence', () => {
    const c = classifyByName('208B_IPC.pdf', 'maintenance_manual');
    expect(c.publicationType).toBe('parts_catalog');
    expect(c.category).toBe('parts_catalog');
    expect(c.confidence).toBe('high');
    expect(c.signal).toBe('filename');
    expect(needsContentPeek(c)).toBe(false);
  });

  it('keeps the fine-grained doc type when the name matches a regulatory doc but no pub bucket', () => {
    const c = classifyByName('RSM_rev3.pdf', 'maintenance_manual');
    // No technical-pub signal → routing stays on the batch bucket…
    expect(c.publicationType).toBe('maintenance_manual');
    // …but the fine-grained type is captured for the document metadata.
    expect(c.documentType).toBe('part-145-manual');
    expect(c.confidence).toBe('high');
    expect(c.signal).toBe('filename');
  });

  it('captures the SMS manual type from the filename', () => {
    const c = classifyByName('SMS_Manual.docx', 'maintenance_manual');
    expect(c.documentType).toBe('sms-manual');
    expect(c.signal).toBe('filename');
  });

  it('falls back to the picked bucket with low confidence when the name is vague', () => {
    const c = classifyByName('scan001.pdf', 'maintenance_manual');
    expect(c.publicationType).toBe('maintenance_manual');
    expect(c.category).toBe(PUBLICATION_TYPE_TO_CATEGORY.maintenance_manual);
    expect(c.confidence).toBe('low');
    expect(c.signal).toBe('fallback');
    expect(needsContentPeek(c)).toBe(true);
  });
});

describe('classifyByContent', () => {
  it('upgrades a vague file to the right bucket from peek text (medium confidence)', () => {
    const base = classifyByName('scan001.pdf', 'maintenance_manual');
    const c = classifyByContent('ILLUSTRATED PARTS CATALOG\nCessna 208B', base);
    expect(c.publicationType).toBe('parts_catalog');
    expect(c.category).toBe('parts_catalog');
    expect(c.confidence).toBe('medium');
    expect(c.signal).toBe('content');
  });

  it('records the fine-grained type from content even without a pub-bucket signal', () => {
    const base = classifyByName('document.pdf', 'maintenance_manual');
    const c = classifyByContent('REPAIR STATION MANUAL — Part 145', base);
    expect(c.documentType).toBe('part-145-manual');
    expect(c.confidence).toBe('medium');
    expect(c.signal).toBe('content');
  });

  it('returns the base unchanged when the peek text is empty (scanned page)', () => {
    const base = classifyByName('scan001.pdf', 'maintenance_manual');
    const c = classifyByContent('', base);
    expect(c).toEqual(base);
    expect(c.confidence).toBe('low');
    expect(c.signal).toBe('fallback');
  });
});
