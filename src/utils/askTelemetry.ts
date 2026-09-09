/**
 * Production-safe Ask telemetry sampling (citation rate, Drive degrade, hangs).
 * Complements DEV-only askPerf timings.
 */

import { track, ANALYTICS_EVENTS } from '../services/analyticsEvents';

export type AskTurnTelemetry = {
  cited: boolean;
  citedCount: number;
  groundedSourceCount: number;
  underCited: boolean;
  driveUnavailable: boolean;
  demotedCitations: number;
  hangTimeout?: boolean;
  panel?: boolean;
};

/** Sample rate for successful Ask turns (1.0 = always). Hangs always track. */
const SAMPLE_RATE = 0.25;

export function trackAskTurn(props: AskTurnTelemetry): void {
  if (props.hangTimeout) {
    track(ANALYTICS_EVENTS.ASK_TURN, { ...props, sampled: true });
    return;
  }
  if (Math.random() > SAMPLE_RATE) return;
  track(ANALYTICS_EVENTS.ASK_TURN, { ...props, sampled: true, sampleRate: SAMPLE_RATE });
}
