import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * registerLocalFolderRefs used to dedupe by contentHash only. Mtime in the
 * identity hash meant OneDrive timestamp jitter created duplicate rows. These
 * guards lock the path-first index + update return shape.
 */
const convexDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'convex');

describe('registerLocalFolderRefs path dedupe surface', () => {
  const schema = readFileSync(join(convexDir, 'schema.ts'), 'utf8');
  const documents = readFileSync(join(convexDir, 'documents.ts'), 'utf8');

  it('indexes documents by projectId + source + path', () => {
    expect(schema).toMatch(/\.index\(\s*"by_projectId_source_path"\s*,\s*\[\s*"projectId"\s*,\s*"source"\s*,\s*"path"\s*\]/);
  });

  it('uses the path index and returns updated counts', () => {
    expect(documents).toContain('by_projectId_source_path');
    expect(documents).toContain('decideLocalFolderRefAction');
    expect(documents).toMatch(/return \{\s*added,\s*updated,\s*skippedDuplicate,\s*documentIds\s*\}/);
    expect(documents).toMatch(/updated:\s*0/);
  });
});
