import { describe, expect, it } from 'vitest';
import { shouldImportDocument } from '../lib/projectBundle';

describe('projectBundle import filters', () => {
  it('allows uploaded regulatory documents', () => {
    expect(shouldImportDocument('uploaded')).toBe(true);
    expect(shouldImportDocument('regulatory')).toBe(true);
  });

  it('blocks manufacturer manual reference categories', () => {
    expect(shouldImportDocument('maintenance_manual')).toBe(false);
  });
});
