import { describe, expect, it } from 'vitest';
import {
  ASK_MAX_TOOL_ROUNDS,
  ASK_MAX_TOOL_RESULT_CHARS,
  ASK_MAX_OUTPUT_TOKENS,
  ASK_MAX_PASSAGE_CONTEXT_CHARS,
  ASK_MAX_COMPANY_DRIVE_PROJECTS,
} from '../../utils/askSpendLimits';
import { MAX_RECORD_TOOL_CALLS } from '../../services/askRecordTools';

/**
 * Pin Ask spend envelope — accidental bumps fail CI (same pattern as DCT).
 */
describe('askSpendLimits', () => {
  it('keeps tool rounds aligned with record-tools constant', () => {
    expect(ASK_MAX_TOOL_ROUNDS).toBe(3);
    expect(MAX_RECORD_TOOL_CALLS).toBe(ASK_MAX_TOOL_ROUNDS);
  });

  it('pins output and tool-result caps', () => {
    expect(ASK_MAX_OUTPUT_TOKENS).toBe(3000);
    expect(ASK_MAX_TOOL_RESULT_CHARS).toBe(48_000);
    expect(ASK_MAX_PASSAGE_CONTEXT_CHARS).toBe(36_000);
    expect(ASK_MAX_COMPANY_DRIVE_PROJECTS).toBe(12);
  });
});
