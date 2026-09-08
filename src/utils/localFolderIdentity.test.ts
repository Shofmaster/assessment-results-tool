import { describe, it, expect } from 'vitest';
import { localIdentityHash } from './localFolderIdentity';

describe('localIdentityHash', () => {
  it('is stable for the same path/size/mtime', () => {
    expect(localIdentityHash('GV/AMM.pdf', 1200, 1_700_000_000_000)).toBe(
      localIdentityHash('GV/AMM.pdf', 1200, 1_700_000_000_000),
    );
  });

  it('changes when size or mtime changes', () => {
    const a = localIdentityHash('GV/AMM.pdf', 1200, 1);
    const b = localIdentityHash('GV/AMM.pdf', 1201, 1);
    const c = localIdentityHash('GV/AMM.pdf', 1200, 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('normalizes backslashes', () => {
    expect(localIdentityHash('GV\\AMM.pdf', 10, 0)).toBe(localIdentityHash('GV/AMM.pdf', 10, 0));
  });
});
