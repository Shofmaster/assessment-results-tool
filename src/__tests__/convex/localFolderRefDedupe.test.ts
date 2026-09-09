import { describe, it, expect } from 'vitest';
import { decideLocalFolderRefAction } from '../../../convex/lib/localFolderRefDedupe';

describe('decideLocalFolderRefAction', () => {
  it('inserts when no existing row', () => {
    expect(decideLocalFolderRefAction(null, { contentHash: 'local:a:1', size: 1 })).toBe('insert');
    expect(decideLocalFolderRefAction(undefined, { contentHash: 'local:a:1', size: 1 })).toBe(
      'insert',
    );
  });

  it('skips when contentHash matches (same path+size identity)', () => {
    expect(
      decideLocalFolderRefAction(
        { contentHash: 'local:GV/AMM.pdf:1200', size: 1200 },
        { contentHash: 'local:GV/AMM.pdf:1200', size: 1200 },
      ),
    ).toBe('skip');
  });

  it('updates when size/hash changed for the same path row', () => {
    expect(
      decideLocalFolderRefAction(
        { contentHash: 'local:GV/AMM.pdf:1200', size: 1200 },
        { contentHash: 'local:GV/AMM.pdf:1300', size: 1300 },
      ),
    ).toBe('update');
  });
});
