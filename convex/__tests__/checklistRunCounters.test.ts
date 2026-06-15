import { describe, expect, it } from "vitest";
import {
  applyRunCounterDelta,
  counterDeltaForItemChange,
  countersFromStatuses,
  initialRunCounters,
} from "../lib/checklistRunCounters";
import type { Id } from "../_generated/dataModel";

describe("counterDeltaForItemChange", () => {
  it("counts an inserted item toward total only", () => {
    expect(counterDeltaForItemChange(null, "not_started")).toEqual({
      total: 1,
      complete: 0,
      inProgress: 0,
    });
  });

  it("counts a deleted item out of total and its status bucket", () => {
    expect(counterDeltaForItemChange("complete", null)).toEqual({
      total: -1,
      complete: -1,
      inProgress: 0,
    });
    expect(counterDeltaForItemChange("in_progress", null)).toEqual({
      total: -1,
      complete: 0,
      inProgress: -1,
    });
  });

  it("moves between status buckets without changing total", () => {
    expect(counterDeltaForItemChange("in_progress", "complete")).toEqual({
      total: 0,
      complete: 1,
      inProgress: -1,
    });
    expect(counterDeltaForItemChange("not_started", "in_progress")).toEqual({
      total: 0,
      complete: 0,
      inProgress: 1,
    });
    expect(counterDeltaForItemChange("in_progress", "blocked")).toEqual({
      total: 0,
      complete: 0,
      inProgress: -1,
    });
  });

  it("is a no-op when status does not change", () => {
    expect(counterDeltaForItemChange("complete", "complete")).toEqual({
      total: 0,
      complete: 0,
      inProgress: 0,
    });
  });

  it("handles the recurring-complete reset (complete -> not_started)", () => {
    expect(counterDeltaForItemChange("complete", "not_started")).toEqual({
      total: 0,
      complete: -1,
      inProgress: 0,
    });
  });
});

describe("countersFromStatuses", () => {
  it("recomputes exact counters from item statuses", () => {
    expect(
      countersFromStatuses(["not_started", "in_progress", "complete", "complete", "blocked"]),
    ).toEqual({ itemsTotal: 5, itemsComplete: 2, itemsInProgress: 1 });
  });

  it("returns zeros for an empty run", () => {
    expect(countersFromStatuses([])).toEqual({
      itemsTotal: 0,
      itemsComplete: 0,
      itemsInProgress: 0,
    });
  });
});

describe("initialRunCounters", () => {
  it("starts all items as not started", () => {
    expect(initialRunCounters(12)).toEqual({
      itemsTotal: 12,
      itemsComplete: 0,
      itemsInProgress: 0,
    });
  });
});

describe("applyRunCounterDelta", () => {
  const runId = "run1" as Id<"auditChecklistRuns">;

  function fakeCtx(runDoc: Record<string, unknown> | null) {
    const patches: Array<{ id: unknown; patch: Record<string, unknown> }> = [];
    return {
      patches,
      ctx: {
        db: {
          get: async () => runDoc,
          patch: async (id: unknown, patch: Record<string, unknown>) => {
            patches.push({ id, patch });
          },
        },
      },
    };
  }

  it("applies the delta on top of existing counters with the extra patch", async () => {
    const { ctx, patches } = fakeCtx({ itemsTotal: 5, itemsComplete: 2, itemsInProgress: 1 });
    await applyRunCounterDelta(
      ctx,
      runId,
      { total: 0, complete: 1, inProgress: -1 },
      { updatedAt: "2026-06-12T00:00:00.000Z" },
    );
    expect(patches).toEqual([
      {
        id: runId,
        patch: {
          updatedAt: "2026-06-12T00:00:00.000Z",
          itemsTotal: 5,
          itemsComplete: 3,
          itemsInProgress: 0,
        },
      },
    ]);
  });

  it("skips counter fields on legacy runs without counters but still applies the extra patch", async () => {
    const { ctx, patches } = fakeCtx({ status: "active" });
    await applyRunCounterDelta(
      ctx,
      runId,
      { total: 1, complete: 0, inProgress: 0 },
      { updatedAt: "now" },
    );
    expect(patches).toEqual([{ id: runId, patch: { updatedAt: "now" } }]);
  });

  it("clamps counters at zero", async () => {
    const { ctx, patches } = fakeCtx({ itemsTotal: 0, itemsComplete: 0, itemsInProgress: 0 });
    await applyRunCounterDelta(ctx, runId, { total: -1, complete: -1, inProgress: 0 });
    expect(patches[0].patch).toEqual({
      itemsTotal: 0,
      itemsComplete: 0,
      itemsInProgress: 0,
    });
  });

  it("does nothing when the run is missing or there is nothing to patch", async () => {
    const missing = fakeCtx(null);
    await applyRunCounterDelta(missing.ctx, runId, { total: 1, complete: 0, inProgress: 0 });
    expect(missing.patches).toEqual([]);

    const noop = fakeCtx({ itemsTotal: 3, itemsComplete: 1, itemsInProgress: 1 });
    await applyRunCounterDelta(noop.ctx, runId, { total: 0, complete: 0, inProgress: 0 });
    expect(noop.patches).toEqual([]);
  });
});
