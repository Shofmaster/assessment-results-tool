import { describe, expect, it } from 'vitest';
import {
  buildDctHaystack,
  inferApplicabilityTokens,
  inferApplicabilityTokensFromManualCorpus,
  mergeApplicabilityTokens,
  isDctApplicable,
  classifyDctApplicability,
} from '../../utils/dctApplicability';

describe('inferApplicabilityTokens', () => {
  it('detects Part 145 from repair station text', () => {
    const t = inferApplicabilityTokens({
      repairStationType: 'Part 145 repair station',
      operationsScope: '',
      certifications: [],
    });
    expect(t).toContain('145');
  });
});

describe('isDctApplicable', () => {
  it('returns true when showAllDcts', () => {
    expect(
      isDctApplicable('145F domestic', undefined, undefined, { repairStationType: 'Part 121' }, { showAllDcts: true }),
    ).toBe(true);
  });

  it('matches peer group when profile includes 145', () => {
    expect(
      isDctApplicable('Part 145 Repair Station', undefined, undefined, { repairStationType: '145' }, {}),
    ).toBe(true);
  });

  it('respects manual exclude list', () => {
    expect(
      isDctApplicable(
        'Part 145 Repair Station',
        undefined,
        undefined,
        { repairStationType: '145' },
        { excludedPeerGroupSubstrings: ['145'] },
      ),
    ).toBe(false);
  });

  it('merges extraTokens from manual corpus with empty profile', () => {
    expect(
      isDctApplicable(
        'Part 145 Repair Station',
        undefined,
        undefined,
        {},
        {},
        inferApplicabilityTokensFromManualCorpus('We operate a Part 145 repair station within the United States.'),
      ),
    ).toBe(true);
  });

  it('mergeApplicabilityTokens unions profile and manual hints', () => {
    const t = mergeApplicabilityTokens(
      { repairStationType: 'Part 121 carrier' },
      'Also maintain Part 145 repair capability for contract work.',
    );
    expect(t).toContain('121');
    expect(t).toContain('145');
  });

  it('prioritizes structured selected tokens when configured', () => {
    expect(
      isDctApplicable(
        'Composite airframe class 4 repair',
        undefined,
        undefined,
        { repairStationType: 'Part 145' },
        { applicabilityMode: 'structured_preferred' },
        undefined,
        {
          selectedRatings: [{ normalizedTokens: ['airframe class 4'] }],
          selectedCapabilities: [],
        },
      ),
    ).toBe(true);
  });

  it('can ignore structured selectors in heuristics-only mode', () => {
    expect(
      isDctApplicable(
        'Composite airframe class 4 repair',
        undefined,
        undefined,
        { repairStationType: 'Part 121' },
        { applicabilityMode: 'heuristics_only' },
        undefined,
        {
          selectedRatings: [{ normalizedTokens: ['airframe class 4'] }],
          selectedCapabilities: [],
        },
      ),
    ).toBe(false);
  });
});

describe('classifyDctApplicability — structured ratings are authoritative', () => {
  it('returns not_applicable when structured tokens miss, even if profile heuristics would hit', () => {
    // Structured ratings picked "airframe class 4" but DCT row is labeled only
    // for "Part 145 Repair Station". The user's structured choice is
    // authoritative — Part 145 heuristic MUST NOT re-include the row.
    const result = classifyDctApplicability(
      'Part 145 Repair Station',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      {
        selectedRatings: [{ normalizedTokens: ['airframe class 4'] }],
        selectedCapabilities: [],
      },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('returns not_applicable when structured misses AND profile misses', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      {
        selectedRatings: [{ normalizedTokens: ['airframe class 4'] }],
        selectedCapabilities: [],
      },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('returns applicable at high confidence when structured tokens match', () => {
    const result = classifyDctApplicability(
      'Composite airframe class 4 repair',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      {
        selectedRatings: [{ normalizedTokens: ['airframe class 4'] }],
        selectedCapabilities: [],
      },
    );
    expect(result.state).toBe('applicable');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('falls back to profile heuristics when no structured ratings are selected', () => {
    const result = classifyDctApplicability(
      'Part 145 Repair Station',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      { selectedRatings: [], selectedCapabilities: [] },
    );
    expect(result.state).toBe('applicable');
  });
});

describe('inferApplicabilityTokensFromManualCorpus', () => {
  it('detects Part 135 from ops manual text', () => {
    const t = inferApplicabilityTokensFromManualCorpus(
      'Operations conducted under 14 CFR Part 135 commuter rules.',
    );
    expect(t).toContain('135');
  });

  it('detects SMS from manual text', () => {
    const t = inferApplicabilityTokensFromManualCorpus('Safety Management System VP and risk assessment process.');
    expect(t).toContain('SMS');
  });
});

// ---------------------------------------------------------------------------
// Edge cases that can cause the "always 500 applicable" symptom
// ---------------------------------------------------------------------------
describe('DCT applicability — edge cases that can cause 500/500 applicable', () => {
  it('showAllDcts=true overrides exclude list — everything stays applicable', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { showAllDcts: true, excludedPeerGroupSubstrings: ['121'] },
    );
    expect(result.state).toBe('applicable');
  });

  it('showAllDcts=true overrides a structured mode miss — still applicable', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { showAllDcts: true, applicabilityMode: 'structured_preferred' },
      undefined,
      { selectedRatings: [{ normalizedTokens: ['airframe class 4'] }], selectedCapabilities: [] },
    );
    expect(result.state).toBe('applicable');
  });

  it('empty profile + no corpus + no structured → unsure, NOT applicable', () => {
    const result = classifyDctApplicability('Part 145 Repair Station', undefined, undefined, {}, {});
    expect(result.state).toBe('unsure');
  });

  it('null profile + no corpus → unsure', () => {
    const result = classifyDctApplicability('Part 145 Repair Station', undefined, undefined, null, null);
    expect(result.state).toBe('unsure');
  });

  it('heuristics_only + profile has 145 token + peer group is "Part 121 Air Carrier" → not_applicable', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145 repair station' },
      { applicabilityMode: 'heuristics_only' },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('includedPeerGroupSubstrings present + row does not match → not_applicable', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { includedPeerGroupSubstrings: ['145'] },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('excludedPeerGroupSubstrings + row matches → not_applicable even when profile would include it', () => {
    const result = classifyDctApplicability(
      'Part 145 Repair Station',
      undefined,
      undefined,
      { repairStationType: 'Part 145 repair station' },
      { excludedPeerGroupSubstrings: ['145'] },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('structured_preferred + empty ratings + empty capabilities → falls back to heuristics (not always applicable)', () => {
    const result = classifyDctApplicability(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145 repair station' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      { selectedRatings: [], selectedCapabilities: [] },
    );
    expect(result.state).toBe('not_applicable');
  });

  it('peer group label is empty string + profile has tokens → not_applicable (no label to match against)', () => {
    const result = classifyDctApplicability('', undefined, undefined, { repairStationType: 'Part 145 repair station' }, {});
    expect(result.state).toBe('not_applicable');
  });

  it('peer group label is undefined + profile has tokens → not_applicable', () => {
    const result = classifyDctApplicability(undefined, undefined, undefined, { repairStationType: 'Part 145' }, {});
    expect(result.state).toBe('not_applicable');
  });

  it('all labels undefined + empty profile → unsure (no tokens, no haystack)', () => {
    const result = classifyDctApplicability(undefined, undefined, undefined, {}, {});
    expect(result.state).toBe('unsure');
  });

  it('isDctApplicable returns false when classifyDctApplicability returns not_applicable', () => {
    const applicable = isDctApplicable(
      'Part 121 Air Carrier',
      undefined,
      undefined,
      { repairStationType: 'Part 145 repair station' },
      { applicabilityMode: 'heuristics_only' },
    );
    expect(applicable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Diagnostic: FAA SAS peer group label formats vs. entity profiles
//
// Answers the question: "Why do I always see 500/500 applicable?"
//
// Each DCT XML file has ONE shared peerGroupLabel for ALL its questions.
// If you ingested a pure Part 145 SAS DCT, every row will have a "145F/G/H"
// label — and ALL will match a Part 145 profile. The filter is working
// correctly; there's simply nothing to filter out of a Part 145-only corpus.
// ---------------------------------------------------------------------------
describe('DCT applicability — FAA SAS peer group label patterns (diagnostic)', () => {
  const part145Profile = { repairStationType: 'Part 145 repair station, domestic operations' };

  it('FAA SAS "145F within the U.S." → applicable for Part 145 company', () => {
    const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('applicable');
  });

  it('FAA SAS "145G outside the U.S." → NOT applicable for a domestic-only Part 145 company', () => {
    // A domestic-only shop has profile token '145F' (not '145G').
    // International requirements (145G) correctly don't match a domestic shop.
    // If your shop does international work, add "international" or "outside the u.s."
    // to your entity profile's operationsScope so '145G' token gets inferred.
    const result = classifyDctApplicability('145G outside the U.S. (no BASA)', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('not_applicable');
  });

  it('FAA SAS "145G outside the U.S." → applicable when profile includes international scope', () => {
    const intlProfile = { repairStationType: 'Part 145 repair station', operationsScope: 'international operations outside the U.S.' };
    const result = classifyDctApplicability('145G outside the U.S. (no BASA)', undefined, undefined, intlProfile, {});
    expect(result.state).toBe('applicable');
  });

  it('Part 121 Air Carrier label → NOT applicable for Part 145-only company', () => {
    const result = classifyDctApplicability('Part 121 Air Carrier', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('not_applicable');
  });

  it('Part 135 On-Demand label → NOT applicable for Part 145-only company', () => {
    const result = classifyDctApplicability('Part 135 On-Demand', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('not_applicable');
  });

  it.each([
    // Labels from actual FAA SAS DCT XML (the format used in PeerGroupLabel attribute)
    ['145F within the U.S.', 'applicable'],   // domestic Part 145 — matches ✓
    ['145G outside the U.S.', 'not_applicable'], // international — domestic profile doesn't have '145G' token
    ['145H outside the U.S. BASA', 'not_applicable'], // same reason
    // Labels from non-Part-145 entity types
    ['Part 121 Air Carrier', 'not_applicable'],
    ['Part 135 On-Demand Charter', 'not_applicable'],
    ['Part 141 Pilot School', 'not_applicable'],
    ['Part 147 AMTS', 'not_applicable'],
  ])(
    'peer group "%s" → %s for a domestic-only Part 145 repair station',
    (peerGroupLabel, expected) => {
      const result = classifyDctApplicability(peerGroupLabel, undefined, undefined, part145Profile, {});
      expect(result.state).toBe(expected);
    },
  );

  describe('A025 opspec → digital recordkeeping DCT applicability', () => {
    const part145Domestic = {
      repairStationType: 'Part 145 repair station',
      operationsScope: 'within the United States',
      faaCertTypesHeld: ['145'],
    };
    const oneClassRating = {
      selectedRatings: [
        { normalizedTokens: ['airframe', 'class 1'], category: 'airframe', classNumber: 1, authority: 'faa' },
      ],
      selectedCapabilities: [],
    };
    const a025Tokens = [
      'a025',
      'electronic/digital recordkeeping system, electronic/digital signature, and electronic media',
      'electronic',
      'digital recordkeeping system',
      'digital signature',
      'electronic media',
    ];

    it('matches paragraph identifier "A025" inside DCT haystack via word boundary', () => {
      const result = classifyDctApplicability(
        'Op Spec A025 Determination',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        oneClassRating,
        undefined,
      );
      expect(result.state).toBe('applicable');
    });

    it('matches phrase token when title appears only in extraHaystack', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Records & Reports', purpose: 'Verify the use of electronic signature procedures.' },
        undefined,
      );
      const result = classifyDctApplicability(
        '145F within the U.S.',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        oneClassRating,
        haystack,
      );
      expect(result.state).toBe('applicable');
    });

    it('matches paragraph token from question text widened into haystack', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Records', purpose: 'Inspection of recordkeeping practices.' },
        { text: 'Verify compliance with Op Spec A025.', references: [{ label: '14 CFR 145.219' }] },
      );
      const result = classifyDctApplicability(
        '145F within the U.S.',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        oneClassRating,
        haystack,
      );
      expect(result.state).toBe('applicable');
    });

    it('does NOT match A025 inside an unrelated alphanumeric ("JA025X")', () => {
      const result = classifyDctApplicability(
        'Aircraft JA025X Inspection',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        oneClassRating,
        undefined,
      );
      expect(result.state).toBe('not_applicable');
    });

    it('returns not_applicable for unrelated DCT (no matching token anywhere)', () => {
      const result = classifyDctApplicability(
        'Part 145 General Inspection',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        oneClassRating,
        undefined,
      );
      expect(result.state).toBe('not_applicable');
    });

    it('paragraph token also matches in heuristic (no structured) path', () => {
      const result = classifyDctApplicability(
        'Op Spec A025 verification',
        undefined,
        undefined,
        part145Domestic,
        {},
        a025Tokens,
        null,
        undefined,
      );
      expect(result.state).toBe('applicable');
    });

    it('buildDctHaystack truncates at the configured cap', () => {
      const big = 'x'.repeat(5000);
      const out = buildDctHaystack({ mlfName: big }, { text: big });
      expect(out).toBeDefined();
      expect(out!.length).toBeLessThanOrEqual(1500);
    });
  });

  it('DIAGNOSIS: a corpus of only 145F rows will always show 100% applicable for a domestic shop', () => {
    // The FAA SAS Part 145 DCT files all use "145F within the U.S." peer group labels.
    // For a domestic Part 145 shop, ALL of those rows will be applicable — by design.
    // 500/500 applicable means your corpus is a pure domestic Part 145 DCT. This is correct.
    //
    // To see fewer applicable rows you would need one of:
    //   a) Your entity profile is not set up (Settings → Entity) — rows fall through to "unsure"
    //   b) Use the Exclude list in Settings to manually narrow by substring
    //   c) Use structured Ratings/Capabilities in Settings to narrow by repair capability
    //   d) Ingest DCT files for other entity types (international 145G, Part 121, etc.)
    const domesticOnly145Labels = [
      '145F within the U.S.',
      '145F within the U.S.',
      '145F within the U.S.',
    ];
    const results = domesticOnly145Labels.map((label) =>
      classifyDctApplicability(label, undefined, undefined, part145Profile, {})
    );
    expect(results.every((r) => r.state === 'applicable')).toBe(true);
  });
});
