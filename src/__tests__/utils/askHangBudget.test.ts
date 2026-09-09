import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  armAskHangBudget,
  wasAskHangAbort,
  ASK_HANG_ABORT_REASON,
} from '../../utils/askHangBudget';

describe('askHangBudget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts with hang reason after the budget', () => {
    const controller = new AbortController();
    armAskHangBudget(controller, 1000);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(wasAskHangAbort(controller.signal)).toBe(true);
    expect(controller.signal.reason).toBe(ASK_HANG_ABORT_REASON);
  });

  it('disarm prevents abort', () => {
    const controller = new AbortController();
    const disarm = armAskHangBudget(controller, 1000);
    disarm();
    vi.advanceTimersByTime(2000);
    expect(controller.signal.aborted).toBe(false);
  });
});
