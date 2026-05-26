/**
 * Validates the XML ingest against the real Gulfstream G5/G500/G550 AMM data
 * module supplied by the user (ATA 05-10-00 "Time Limits"). The fixture lives
 * outside the project tree so this test is best-effort: it skips cleanly when
 * the file is not present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { ingestXmlText } from '../index';

const SAMPLE_PATH = 'C:\\Users\\shelb\\Downloads\\05-10-00-in_xml.js';

describe('xmlIngest – real Gulfstream sample', () => {
  if (!existsSync(SAMPLE_PATH)) {
    it.skip('sample file not present on this machine', () => {});
    return;
  }

  const raw = readFileSync(SAMPLE_PATH, 'utf-8');
  const result = ingestXmlText(raw, '05-10-00-in_xml.js');

  it('detects ATA iSpec + Gulfstream', () => {
    expect(result.format.family).toBe('ata_ispec');
    expect(result.format.oem).toBe('gulfstream');
  });

  it('extracts ATA 05-10-00 metadata', () => {
    expect(result.metadata.ataNbr).toBe('05-10-00');
    expect(result.metadata.ataChapter).toBe('05');
    expect(result.metadata.ataSection).toBe('05-10');
  });

  it('extracts revision 60 + applicable models', () => {
    expect(result.metadata.revisionNumber).toBe('60');
    expect(result.metadata.revisionDate).toContain('January');
    expect(result.metadata.applicableModels).toEqual(
      expect.arrayContaining(['G5', 'G500', 'G550'])
    );
    expect(result.metadata.manufacturer).toBe('Gulfstream');
    expect(result.metadata.manualType).toBe('AMM');
  });

  it('extracts a non-trivial reading text and section list', () => {
    expect(result.readingText.length).toBeGreaterThan(500);
    expect(result.readingText).toContain('Time Limits');
    expect(result.sections.length).toBeGreaterThan(0);
  });
});
