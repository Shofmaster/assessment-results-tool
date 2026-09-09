import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { allowAppFileSystemAccess } = require_(
  join(dirname(fileURLToPath(import.meta.url)), '../desktop/fileSystemPermissions.cjs'),
);

describe('allowAppFileSystemAccess', () => {
  it('grants fileSystem for allowed origins and denies it for others', () => {
    let requestHandler: ((wc: any, permission: string, cb: (ok: boolean) => void) => void) | null =
      null;
    let checkHandler: ((wc: any, permission: string) => boolean) | null = null;
    const ses = {
      setPermissionRequestHandler: (h: typeof requestHandler) => {
        requestHandler = h;
      },
      setPermissionCheckHandler: (h: typeof checkHandler) => {
        checkHandler = h;
      },
    };

    allowAppFileSystemAccess(ses, () => ['http://127.0.0.1:8080', 'https://app.example.com']);

    const allowed = { getURL: () => 'http://127.0.0.1:8080/library' };
    const foreign = { getURL: () => 'https://evil.example/x' };

    const req = vi.fn();
    requestHandler!(allowed, 'fileSystem', req);
    expect(req).toHaveBeenCalledWith(true);

    const deny = vi.fn();
    requestHandler!(foreign, 'fileSystem', deny);
    expect(deny).toHaveBeenCalledWith(false);

    expect(checkHandler!(allowed, 'fileSystem')).toBe(true);
    expect(checkHandler!(foreign, 'fileSystem')).toBe(false);
    // Unrelated permissions stay open.
    expect(checkHandler!(foreign, 'notifications')).toBe(true);
  });
});
