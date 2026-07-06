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
    // With structured selectors honored this row would be applicable (0.95).
    // In heuristics-only mode they are ignored, so the row lands in the unsure
    // pool instead (no part marker in the label, no function-level evidence).
    const result = classifyDctApplicability(
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
    );
    expect(result.state).toBe('unsure');
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
    // Peer group matches (145 vs 145) but there is no function-level evidence,
    // so the row is unsure — NOT auto-applicable (that was the 100% bug).
    const result = classifyDctApplicability(
      'Part 145 Repair Station',
      undefined,
      undefined,
      { repairStationType: 'Part 145' },
      { applicabilityMode: 'structured_preferred' },
      undefined,
      { selectedRatings: [], selectedCapabilities: [] },
    );
    expect(result.state).toBe('unsure');
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

  it('peer group label is empty string + profile has tokens → unsure (no label = no info, needs triage)', () => {
    const result = classifyDctApplicability('', undefined, undefined, { repairStationType: 'Part 145 repair station' }, {});
    expect(result.state).toBe('unsure');
  });

  it('peer group label is undefined + profile has tokens → unsure', () => {
    const result = classifyDctApplicability(undefined, undefined, undefined, { repairStationType: 'Part 145' }, {});
    expect(result.state).toBe('unsure');
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
// FAA SAS scoping model (8900.1 Vol 10 / SAS definitions):
//
//   "Scalability allows us to tailor and scope the operating profile to each
//    certificate holder's unique operation. This is accomplished through the
//    use of peer groups and configuration data which results in scoped DCTs."
//
// Peer-group match (145 vs 145) is NECESSARY but not SUFFICIENT. Which
// elements actually apply is driven by the operating profile: OpSpecs,
// ratings/capabilities, and functions performed. A bare part-number match
// therefore lands in the unsure pool — the old "peer group matched →
// applicable" behavior was the cause of the "100% applicable" symptom.
// ---------------------------------------------------------------------------
describe('DCT applicability — FAA SAS peer group + operating profile model', () => {
  const part145Profile = { repairStationType: 'Part 145 repair station, domestic operations' };

  it('FAA SAS "145F within the U.S." → unsure for Part 145 company (peer group alone is not enough)', () => {
    const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('unsure');
  });

  it('FAA SAS "145G outside the U.S." → NOT applicable for a domestic-only Part 145 company', () => {
    // A domestic-only shop has profile token '145F' (not '145G').
    // Peer group G/H (outside the U.S.) correctly doesn't apply to a domestic shop.
    const result = classifyDctApplicability('145G outside the U.S. (no BASA)', undefined, undefined, part145Profile, {});
    expect(result.state).toBe('not_applicable');
  });

  it('FAA SAS "145G outside the U.S." → not excluded when profile includes international scope', () => {
    const intlProfile = { repairStationType: 'Part 145 repair station', operationsScope: 'international operations outside the U.S.' };
    const result = classifyDctApplicability('145G outside the U.S. (no BASA)', undefined, undefined, intlProfile, {});
    expect(result.state).not.toBe('not_applicable');
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
    ['145F within the U.S.', 'unsure'],           // right peer group, function unknown → triage
    ['145G outside the U.S.', 'not_applicable'],  // wrong peer group for a domestic shop
    ['145H outside the U.S. BASA', 'not_applicable'],
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

  describe('function-level evidence decides applicability within the peer group', () => {
    it('universal core element (training program) → applicable for every 145 shop', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Training Program', purpose: 'Evaluate the repair station training program required by 14 CFR 145.163.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('applicable');
    });

    it('universal core element (housing and facilities) → applicable', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Housing and Facilities', purpose: 'Verify housing, facilities, equipment and materials.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('applicable');
    });

    it('line maintenance element WITHOUT D107 opspec → unsure (authorization unknown)', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Line Maintenance', purpose: 'Evaluate line maintenance performed for air carriers.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('unsure');
    });

    it('line maintenance element WITH D107 opspec token → applicable', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Line Maintenance', purpose: 'Evaluate line maintenance performed for air carriers.' },
        undefined,
      );
      const result = classifyDctApplicability(
        '145F within the U.S.', undefined, undefined, part145Profile, {},
        ['d107', 'line maintenance authorization'], undefined, haystack,
      );
      expect(result.state).toBe('applicable');
    });

    it('SMS element when the entity has NO SMS → not_applicable', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Safety Management System', purpose: 'Evaluate the SMS processes.' },
        undefined,
      );
      const result = classifyDctApplicability(
        '145F within the U.S.', undefined, undefined,
        { ...part145Profile, hasSms: false }, {}, undefined, undefined, haystack,
      );
      expect(result.state).toBe('not_applicable');
    });

    it('SMS element when the entity HAS an SMS → applicable', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Safety Management System', purpose: 'Evaluate the SMS processes.' },
        undefined,
      );
      const result = classifyDctApplicability(
        '145F within the U.S.', undefined, undefined,
        { ...part145Profile, hasSms: true }, {}, undefined, undefined, haystack,
      );
      expect(result.state).toBe('applicable');
    });

    it('hazmat element with no hazmat evidence in profile → unsure', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'Repair Station HM Functions', purpose: 'Evaluate hazardous material functions per 49 CFR part 172.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('unsure');
    });

    it('hazmat element when profile mentions hazmat → applicable', () => {
      const hazmatProfile = { ...part145Profile, operationsScope: 'domestic operations, hazmat handling and shipping' };
      const haystack = buildDctHaystack(
        { mlfName: 'Repair Station HM Functions', purpose: 'Evaluate hazardous material functions per 49 CFR part 172.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, hazmatProfile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('applicable');
    });

    it('BASA/MAG element for a domestic-only shop → not_applicable', () => {
      const haystack = buildDctHaystack(
        { mlfName: 'EASA Supplement', purpose: 'Evaluate compliance with the Maintenance Annex Guidance under the bilateral agreement.' },
        undefined,
      );
      const result = classifyDctApplicability('145F within the U.S.', undefined, undefined, part145Profile, {}, undefined, undefined, haystack);
      expect(result.state).toBe('not_applicable');
    });
  });

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

  it('REGRESSION: a corpus of only 145F rows must NOT be blanket-marked applicable', () => {
    // Old behavior: every "145F within the U.S." row matched the entity's
    // "145" token and was stamped applicable → users saw 100% applicable,
    // which contradicts the FAA scoping model (peer group + configuration
    // data → scoped DCTs). Peer-group match alone now lands in the unsure
    // triage pool; applicable requires function-level evidence (opspecs,
    // ratings/capabilities, universal core elements, conditional rules).
    const domesticOnly145Labels = [
      '145F within the U.S.',
      '145F within the U.S.',
      '145F within the U.S.',
    ];
    const results = domesticOnly145Labels.map((label) =>
      classifyDctApplicability(label, undefined, undefined, part145Profile, {})
    );
    expect(results.every((r) => r.state === 'unsure')).toBe(true);
    expect(results.some((r) => r.state === 'applicable')).toBe(false);
  });
});
