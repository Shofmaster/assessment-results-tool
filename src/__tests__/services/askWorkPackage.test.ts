import { describe, expect, it } from 'vitest';
import { coerceAskWorkPackage, expandFullAnswerQuery, workPackageToMarkdown } from '../../services/askWorkPackage';
import { ASK_STEP_CITATION_RULE } from '../../utils/askSpecGrounding';
import type { AskChunkSource } from '../../types/askSources';

function chunk(tag: string, excerpt: string, docName = 'AMM'): AskChunkSource {
  return {
    tag,
    kind: 'chunk',
    documentId: 'doc1',
    chunkId: 'c1',
    docName,
    category: 'mel',
    chunkIndex: 0,
    totalChunks: 1,
    startChar: 0,
    endChar: 100,
    score: 1,
    excerpt,
  };
}

describe('ASK_STEP_CITATION_RULE', () => {
  it('requires numbered steps and trailing tags', () => {
    expect(ASK_STEP_CITATION_RULE).toMatch(/numbered list/i);
    expect(ASK_STEP_CITATION_RULE).toMatch(/\[S#\]|bracket tag/i);
    expect(ASK_STEP_CITATION_RULE).toMatch(/general practice/i);
  });
});

describe('coerceAskWorkPackage', () => {
  it('drops unknown ref tags and fills MEL gap when empty', () => {
    const sources = [chunk('S1', 'MEL Item 21-30-01 cabin outflow valve')];
    const pkg = coerceAskWorkPackage(
      {
        summary: 'Check MEL deferral.',
        mel: {},
        troubleshootingSteps: [
          { text: 'Verify MEL relief [S1]', refTags: ['S1', 'S99'] },
          { text: 'General check', refTags: [] },
        ],
        correctiveAction: 'Repair or defer.',
        partsNeeded: [],
        exampleLogEntries: {
          discrepancyWriteUp: 'Cabin outflow valve inop',
          workPerformed: 'Deferred per MEL 21-30-01',
          ataChapter: '21-30-01',
          returnToServiceStatement: 'Aircraft approved for return to service.',
        },
        noManualReferencesFound: false,
      },
      sources,
    );
    expect(pkg.mel.gapNote).toMatch(/not in retrieved mel/i);
    expect(pkg.troubleshootingSteps[0].refTags).toEqual(['S1']);
    expect(pkg.troubleshootingSteps[0].text).not.toContain('[S1]');
    expect(pkg.exampleLogEntries.workPerformed).toContain('Deferred');
  });

  it('marks no manuals when sources empty', () => {
    const pkg = coerceAskWorkPackage({ summary: 'x' }, []);
    expect(pkg.noManualReferencesFound).toBe(true);
  });
});

describe('expandFullAnswerQuery', () => {
  it('appends MEL/AMM troubleshooting terms', () => {
    const q = expandFullAnswerQuery('landing gear indication fault');
    expect(q.toLowerCase()).toMatch(/mel/);
    expect(q.toLowerCase()).toMatch(/troubleshooting/);
  });
});

describe('workPackageToMarkdown', () => {
  it('includes MEL and numbered steps', () => {
    const md = workPackageToMarkdown({
      summary: 'Do this.',
      mel: {
        item: '32-40-01',
        deferralCategory: 'B',
        maintenanceProcedures: '',
        operationalProcedures: '',
        operationalLimits: '',
        gapNote: '',
      },
      troubleshootingSteps: [{ text: 'Check CB', refTags: ['S1'] }],
      correctiveAction: 'Replace unit',
      partsNeeded: [],
      exampleLogEntries: {
        discrepancyWriteUp: '',
        workPerformed: 'Replaced unit',
        ataChapter: '32-40',
        returnToServiceStatement: '',
      },
      noManualReferencesFound: false,
    });
    expect(md).toContain('## MEL');
    expect(md).toContain('1. Check CB [S1]');
    expect(md).toContain('Work performed');
  });
});
