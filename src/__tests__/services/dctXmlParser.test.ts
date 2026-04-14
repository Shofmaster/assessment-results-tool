import { describe, expect, it } from 'vitest';
import { parseDctXmlString } from '../../services/dctXmlParser';

const NS = 'http://fsims.faa.gov/sasdct';

describe('parseDctXmlString', () => {
  it('parses minimal SAS DCT with one question', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sasdct:SASStandardDCT xmlns:sasdct="${NS}">
  <sasdct:DCTData>
    <sasdct:DCTVersioning StandardDCTID="STD1" VersionNumber="2" VersionDate="2025-01-01" Status="Active"/>
    <sasdct:PeerGroup PeerGroupLabel="145F within the U.S."/>
    <sasdct:DCTQuestions>
      <sasdct:Question QuestionID="Q-1" DisplayOrder="1">
        <sasdct:Text>Verify training program is current.</sasdct:Text>
      </sasdct:Question>
    </sasdct:DCTQuestions>
  </sasdct:DCTData>
</sasdct:SASStandardDCT>`;

    const out = parseDctXmlString('sample.xml', xml);
    expect(out.fileName).toBe('sample.xml');
    expect(out.standardDctId).toBe('STD1');
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].questionId).toBe('Q-1');
    expect(out.questions[0].text).toContain('training program');
    expect(out.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });
});
