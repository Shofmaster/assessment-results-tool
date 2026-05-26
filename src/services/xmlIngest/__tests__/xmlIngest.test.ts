/**
 * Sanity tests for the XML ingest pipeline. The Gulfstream fixture exercises:
 *   - JS wrapper unwrap (XmlProc.Source['..'] = '..\n..\n..';)
 *   - ATA iSpec family detection
 *   - Processing-instruction metadata (REVNBR, REVDATE, ATANBR)
 *   - inpgblk chap/sect/subj attributes
 *   - ataref applicable models → OEM inference
 *   - <topic> / <intro> section extraction
 *   - Reading-text walk that skips <chgdesc> revision noise
 */
import { describe, it, expect } from 'vitest';
import {
  ingestXmlText,
  detectAndUnwrap,
  isXmlIngestCandidate,
} from '../index';
import { unwrapGulfstreamXml } from '../unwrap';
import { stripXmlToText } from '../generic';
import { detectOemFromModel } from '../oem';

const GULFSTREAM_FIXTURE = `XmlProc.Source["05-10-00-in_xml.js"] = '\\
<?xml version="1.0" encoding="iso-8859-1"?>\\
<printgroup><?REVNBR 60?><?REVDATE January 31/26?><?ATATITLE TIME LIMITS?><?ATANBR 05-10-00?>\\
  <?PN1 05?>\\
  <?PN2 10?>\\
  <?PN3 00?>\\
  <inpgblk chapnbr="05" key="a" pgblknbr="00" sectnbr="10" subjnbr="00">\\
    <intro key="a104328" id="idm1">\\
      <meta>\\
        <ataref manual="AMM" model="G5"/>\\
        <ataref manual="AMM" model="G500"/>\\
        <ataref manual="AMM" model="G550"/>\\
      </meta>\\
      <title>Time Limits</title>\\
      <topic id="t1">\\
        <chgdesc chg-source="GAC" revnbr="35">Time Limits, revised paragraph.</chgdesc>\\
        <title>Introduction</title>\\
        <para>The Time Limits Section provides manufacturer recommended time limits.</para>\\
      </topic>\\
      <topic id="t2">\\
        <title>Manufacturers Recommended Restore / Discard Items</title>\\
        <para>List of installed components with restoration / discard intervals.</para>\\
      </topic>\\
    </intro>\\
  </inpgblk>\\
</printgroup>\\
';`;

const S1000D_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<dmodule xmlns="urn:s1000d:6.0">
  <identAndStatusSection>
    <dmAddress>
      <dmCode modelIdentCode="G650" systemCode="29" subSystemCode="10" subSubSystemCode="00" assyCode="00" disassyCode="00" disassyCodeVariant="A" infoCode="040" infoCodeVariant="A" itemLocationCode="A"/>
      <dmTitle>
        <techName>Hydraulic Power</techName>
        <infoName>Description</infoName>
      </dmTitle>
      <issueInfo issueNumber="003" inWork="00"/>
      <issueDate year="2024" month="11" day="01"/>
    </dmAddress>
  </identAndStatusSection>
  <content>
    <description>
      <levelledPara>
        <title>Overview</title>
        <para>The hydraulic system supplies pressurized fluid to the flight controls.</para>
      </levelledPara>
    </description>
  </content>
</dmodule>`;

describe('xmlIngest – detection helpers', () => {
  it('flags .xml and .js files as XML ingest candidates', () => {
    expect(isXmlIngestCandidate('foo.xml', 'application/xml')).toBe(true);
    expect(isXmlIngestCandidate('05-10-00-in_xml.js', 'application/javascript')).toBe(true);
    expect(isXmlIngestCandidate('foo.pdf', 'application/pdf')).toBe(false);
  });

  it('infers OEM from common aircraft model names', () => {
    expect(detectOemFromModel('G550')).toBe('gulfstream');
    expect(detectOemFromModel('A320')).toBe('airbus');
    expect(detectOemFromModel('B737')).toBe('boeing');
    expect(detectOemFromModel('E190')).toBe('embraer');
    expect(detectOemFromModel('Citation 560')).toBe('cessna');
    expect(detectOemFromModel('NoneSuch')).toBe('unknown');
  });
});

describe('xmlIngest – Gulfstream JS wrapper', () => {
  it('unwraps the wrapper and recovers the inner XML', () => {
    const unwrapped = unwrapGulfstreamXml(GULFSTREAM_FIXTURE);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.filename).toBe('05-10-00-in_xml.js');
    expect(unwrapped!.xml.startsWith('<?xml')).toBe(true);
    expect(unwrapped!.xml).toContain('<inpgblk');
    expect(unwrapped!.xml).toContain('Time Limits');
  });

  it('returns null when the input has no XmlProc.Source header', () => {
    expect(unwrapGulfstreamXml('<?xml ?><root/>')).toBeNull();
  });

  it('detectAndUnwrap routes wrapped Gulfstream files to ATA iSpec', () => {
    const detection = detectAndUnwrap(GULFSTREAM_FIXTURE, '05-10-00-in_xml.js');
    expect(detection.family).toBe('ata_ispec');
    expect(detection.oem).toBe('gulfstream');
  });
});

describe('xmlIngest – ATA iSpec parser', () => {
  it('extracts metadata, reading text, and sections from the Gulfstream fixture', () => {
    const result = ingestXmlText(GULFSTREAM_FIXTURE, '05-10-00-in_xml.js');
    expect(result.format.family).toBe('ata_ispec');
    expect(result.format.oem).toBe('gulfstream');
    expect(result.metadata.title).toBe('Time Limits');
    expect(result.metadata.ataNbr).toBe('05-10-00');
    expect(result.metadata.ataChapter).toBe('05');
    expect(result.metadata.ataSection).toBe('05-10');
    expect(result.metadata.revisionNumber).toBe('60');
    expect(result.metadata.revisionDate).toBe('January 31/26');
    expect(result.metadata.manufacturer).toBe('Gulfstream');
    expect(result.metadata.applicableModels).toEqual(['G5', 'G500', 'G550']);
    expect(result.metadata.manualType).toBe('AMM');

    // Section titles include intro + the two <topic> headings.
    const titles = result.sections.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Time Limits', 'Introduction', 'Manufacturers Recommended Restore / Discard Items'])
    );
    expect(result.sections.every((s) => s.ataChapter === '05')).toBe(true);
    expect(result.sections.every((s) => s.ataSection === '05-10')).toBe(true);

    // Reading text includes paragraph content and skips chgdesc noise.
    expect(result.readingText).toContain('Time Limits Section provides');
    expect(result.readingText).not.toContain('Time Limits, revised paragraph');
  });
});

describe('xmlIngest – S1000D parser', () => {
  it('extracts dmCode + title + reading text', () => {
    const result = ingestXmlText(S1000D_FIXTURE, 'hyd-001.xml');
    expect(result.format.family).toBe('s1000d');
    expect(result.metadata.title).toBe('Hydraulic Power — Description');
    expect(result.metadata.ataChapter).toBe('29');
    expect(result.metadata.ataSection).toBe('29-10');
    expect(result.metadata.ataSubject).toBe('00');
    expect(result.metadata.revisionNumber).toBe('003');
    expect(result.metadata.revisionDate).toBe('2024-11-01');
    expect(result.readingText).toContain('hydraulic system supplies pressurized fluid');
    expect(result.sections).toHaveLength(1);
  });
});

describe('xmlIngest – generic fallback', () => {
  it('strips tags from unrecognized XML', () => {
    const xml = '<?xml version="1.0"?><foo><bar>hello &amp; world</bar><baz/></foo>';
    const result = ingestXmlText(xml, 'foo.xml');
    expect(result.format.family).toBe('unrecognized');
    expect(result.readingText).toBe('hello & world');
    expect(result.notices?.[0]?.level).toBe('info');
  });

  it('strips tags, decodes named entities and numeric references', () => {
    const text = stripXmlToText('<x>A &lt; B &amp; C &#65; &#x42;</x>');
    expect(text).toBe('A < B & C A B');
  });
});
