import { describe, expect, it, vi } from 'vitest';
import { ingestDctDocumentsInChunks, MAX_QUESTIONS_PER_BATCH } from '../../services/dctIngestChunks';

const mkDoc = (n: number, questionCount = 0) => ({
  fileName: `doc-${n}.xml`,
  contentHash: `h${n}`,
  questions: Array.from({ length: questionCount }, (_, i) => ({
    questionId: `q${n}-${i}`,
    text: 'text',
    references: [],
    responses: [],
  })),
});

describe('ingestDctDocumentsInChunks', () => {
  it('aggregates server-reported ingested and skipped counts', async () => {
    const ingestBatch = vi
      .fn()
      .mockResolvedValueOnce({ ingested: 1, skippedExisting: 1 })
      .mockResolvedValueOnce({ ingested: 2, skippedExisting: 0 });
    const progress: Array<{ ingested: number; total: number; skipped: number }> = [];

    const out = await ingestDctDocumentsInChunks({
      ingestBatch,
      projectId: 'p1',
      documents: [mkDoc(1), mkDoc(2), mkDoc(3), mkDoc(4)] as any,
      batchSize: 2,
      onProgress: (ingested, total, skipped) => progress.push({ ingested, total, skipped }),
    });

    expect(out).toEqual({
      totalIngested: 3,
      totalSkipped: 1,
      chunkErrors: [],
    });
    expect(progress).toEqual([
      { ingested: 1, total: 4, skipped: 1 },
      { ingested: 3, total: 4, skipped: 1 },
    ]);
  });

  it('falls back to chunk length when mutation does not return counts', async () => {
    const ingestBatch = vi.fn().mockResolvedValue(undefined);
    const out = await ingestDctDocumentsInChunks({
      ingestBatch,
      projectId: 'p1',
      documents: [mkDoc(1), mkDoc(2), mkDoc(3)] as any,
      batchSize: 2,
    });

    expect(out.totalIngested).toBe(3);
    expect(out.totalSkipped).toBe(0);
    expect(out.chunkErrors).toEqual([]);
  });

  it('captures batch errors and continues remaining chunks', async () => {
    const ingestBatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ingested: 1, skippedExisting: 0 });

    const out = await ingestDctDocumentsInChunks({
      ingestBatch,
      projectId: 'p1',
      documents: [mkDoc(1), mkDoc(2), mkDoc(3)] as any,
      batchSize: 2,
    });

    expect(out.totalIngested).toBe(1);
    expect(out.totalSkipped).toBe(0);
    expect(out.chunkErrors).toHaveLength(1);
    expect(out.chunkErrors[0]).toContain('Batch 1');
  });

  it('splits into separate batches when question count would exceed MAX_QUESTIONS_PER_BATCH', async () => {
    const ingestBatch = vi.fn().mockResolvedValue({ ingested: 1, skippedExisting: 0 });
    // Two docs each with enough questions to exceed the cap when combined
    const halfLimit = Math.floor(MAX_QUESTIONS_PER_BATCH / 2) + 1;
    const docs = [mkDoc(1, halfLimit), mkDoc(2, halfLimit)] as any;

    const out = await ingestDctDocumentsInChunks({
      ingestBatch,
      projectId: 'p1',
      documents: docs,
    });

    // Each doc should have been sent in its own mutation call
    expect(ingestBatch).toHaveBeenCalledTimes(2);
    expect(ingestBatch.mock.calls[0][0].documents).toHaveLength(1);
    expect(ingestBatch.mock.calls[1][0].documents).toHaveLength(1);
    expect(out.chunkErrors).toEqual([]);
  });

  it('keeps docs with few questions together up to batchSize', async () => {
    const ingestBatch = vi.fn().mockResolvedValue({ ingested: 3, skippedExisting: 0 });
    // Three docs with 1 question each — well under MAX_QUESTIONS_PER_BATCH
    const docs = [mkDoc(1, 1), mkDoc(2, 1), mkDoc(3, 1)] as any;

    await ingestDctDocumentsInChunks({
      ingestBatch,
      projectId: 'p1',
      documents: docs,
      batchSize: 12,
    });

    // All three should fit in one call
    expect(ingestBatch).toHaveBeenCalledTimes(1);
    expect(ingestBatch.mock.calls[0][0].documents).toHaveLength(3);
  });
});
