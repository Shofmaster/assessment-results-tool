import { describe, expect, it } from "vitest";
import {
  buildPersistRows,
  extractJsonArray,
  parseSliceCustomId,
  planSlices,
  sliceCustomId,
} from "../../../convex/lib/traceabilityBatch";

describe("sliceCustomId / parseSliceCustomId", () => {
  it("round-trips a start index", () => {
    expect(sliceCustomId(0)).toBe("slice-0");
    expect(sliceCustomId(144)).toBe("slice-144");
    expect(parseSliceCustomId(sliceCustomId(0))).toBe(0);
    expect(parseSliceCustomId(sliceCustomId(144))).toBe(144);
  });

  it("rejects malformed ids", () => {
    expect(parseSliceCustomId("slice-")).toBeNull();
    expect(parseSliceCustomId("slice--5")).toBeNull();
    expect(parseSliceCustomId("slice-1.5")).toBeNull();
    expect(parseSliceCustomId("other-12")).toBeNull();
  });
});

describe("planSlices", () => {
  it("covers the remaining range in batchSize strides", () => {
    expect(planSlices(30, 0, 12, 100)).toEqual([
      { startIndex: 0, count: 12 },
      { startIndex: 12, count: 12 },
      { startIndex: 24, count: 6 },
    ]);
  });

  it("resumes from processed offset", () => {
    expect(planSlices(30, 24, 12, 100)).toEqual([{ startIndex: 24, count: 6 }]);
  });

  it("returns empty when nothing remains", () => {
    expect(planSlices(30, 30, 12, 100)).toEqual([]);
    expect(planSlices(0, 0, 12, 100)).toEqual([]);
  });

  it("caps the number of slices per Anthropic batch", () => {
    const slices = planSlices(10_000, 0, 12, 100);
    expect(slices).toHaveLength(100);
    expect(slices[99]).toEqual({ startIndex: 99 * 12, count: 12 });
  });

  it("guards against batchSize < 1", () => {
    expect(planSlices(3, 0, 0, 100)).toEqual([
      { startIndex: 0, count: 1 },
      { startIndex: 1, count: 1 },
      { startIndex: 2, count: 1 },
    ]);
  });
});

describe("extractJsonArray", () => {
  it("parses a bare array", () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("parses an array embedded in prose", () => {
    expect(
      extractJsonArray('Here are the results:\n[{"a":1},{"b":2}]\nDone.'),
    ).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("parses an empty array", () => {
    expect(extractJsonArray("[]")).toEqual([]);
  });

  it("returns null when no array exists", () => {
    expect(extractJsonArray("no json here")).toBeNull();
    expect(extractJsonArray('{"a":1}')).toBeNull();
  });
});

describe("buildPersistRows", () => {
  const opts = {
    docIdSet: new Set(["doc1"]),
    applicabilityMap: { c1: "applicable" as const },
    lowConfidenceMap: { c2: true },
  };

  it("keeps valid rows and maps applicability + low-confidence flags", () => {
    const rows = buildPersistRows(
      [
        {
          comparisonId: "c1",
          status: "aligned",
          underReviewDocumentId: "doc1",
          evidenceSnippet: "snippet",
          rationale: "why",
        },
        { comparisonId: "c2", status: "gap" },
      ],
      opts,
    );
    expect(rows).toEqual([
      {
        comparisonId: "c1",
        status: "aligned",
        underReviewDocumentId: "doc1",
        evidenceSnippet: "snippet",
        rationale: "why",
        lowConfidenceApplicability: false,
        applicabilityState: "applicable",
        applicabilitySource: "auto",
      },
      {
        comparisonId: "c2",
        status: "gap",
        underReviewDocumentId: undefined,
        evidenceSnippet: undefined,
        rationale: undefined,
        lowConfidenceApplicability: true,
        applicabilityState: undefined,
        applicabilitySource: undefined,
      },
    ]);
  });

  it("drops rows with bad status or missing comparisonId", () => {
    const rows = buildPersistRows(
      [
        { comparisonId: "c1", status: "weird" },
        { status: "aligned" },
        null,
        "string",
        { comparisonId: "", status: "gap" },
      ],
      opts,
    );
    expect(rows).toEqual([]);
  });

  it("discards document ids the run does not know about", () => {
    const rows = buildPersistRows(
      [{ comparisonId: "c1", status: "mismatch", underReviewDocumentId: "doc-unknown" }],
      opts,
    );
    expect(rows[0].underReviewDocumentId).toBeUndefined();
  });
});
