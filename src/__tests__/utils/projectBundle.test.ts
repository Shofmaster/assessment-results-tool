import { describe, expect, it } from 'vitest';
import { parseProjectBundle, bundleFilename, PROJECT_BUNDLE_VERSION } from '../../utils/projectBundle';

describe('projectBundle utils', () => {
  it('parses a valid bundle', () => {
    const bundle = parseProjectBundle({
      version: PROJECT_BUNDLE_VERSION,
      project: { name: 'Hangar audit' },
      assessments: [],
    });
    expect(bundle.project.name).toBe('Hangar audit');
  });

  it('rejects unsupported versions', () => {
    expect(() =>
      parseProjectBundle({ version: '1.0.0', project: { name: 'X' } }),
    ).toThrow(/Unsupported bundle version/);
  });

  it('builds a safe download filename', () => {
    expect(bundleFilename('Acme 145 Audit')).toMatch(/^acme-145-audit-\d{4}-\d{2}-\d{2}\.aqp\.json$/);
  });
});
