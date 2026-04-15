import { describe, expect, it, vi } from 'vitest';
import { ingestDctDocumentsInChunks } from '../../services/dctIngestChunks';

const mkDoc = (n: number) => ({
  fileName: `doc-${n}.xml`,
  contentHash: `h${n}`,
  questions: [],
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
});
