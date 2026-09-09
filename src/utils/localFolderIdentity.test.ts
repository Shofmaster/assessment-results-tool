import { describe, it, expect } from 'vitest';
import { localIdentityHash } from './localFolderIdentity';

describe('localIdentityHash', () => {
  it('is stable for the same path/size', () => {
    expect(localIdentityHash('GV/AMM.pdf', 1200, 1_700_000_000_000)).toBe(
      localIdentityHash('GV/AMM.pdf', 1200, 1_700_000_000_000),
    );
  });

  it('ignores mtime so OneDrive timestamp jitter does not create new hashes', () => {
    const a = localIdentityHash('GV/AMM.pdf', 1200, 1);
    const b = localIdentityHash('GV/AMM.pdf', 1200, 2);
    expect(a).toBe(b);
    expect(a).toBe('local:GV/AMM.pdf:1200');
  });

  it('changes when size changes', () => {
    const a = localIdentityHash('GV/AMM.pdf', 1200, 1);
    const b = localIdentityHash('GV/AMM.pdf', 1201, 1);
    expect(a).not.toBe(b);
  });

  it('normalizes backslashes', () => {
    expect(localIdentityHash('GV\\AMM.pdf', 10, 0)).toBe(localIdentityHash('GV/AMM.pdf', 10, 0));
  });
});
