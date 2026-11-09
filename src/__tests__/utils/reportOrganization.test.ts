import { describe, expect, it } from 'vitest';
import { resolveReportOrganizationName } from '../../utils/reportOrganization';

describe('resolveReportOrganizationName', () => {
  it('uses the company, not the project, when no analysis has run', () => {
    expect(
      resolveReportOrganizationName({ companyName: 'ZZ Test Co', projectName: 'Test Project A' }),
    ).toBe('ZZ Test Co');
  });

  it('prefers the company recorded on the latest analysis', () => {
    expect(
      resolveReportOrganizationName({
        analysisCompanyName: 'Acme Air',
        companyName: 'ZZ Test Co',
        projectName: 'Test Project A',
      }),
    ).toBe('Acme Air');
  });

  it('falls back to the project name for a project with no company', () => {
    expect(resolveReportOrganizationName({ companyName: '  ', projectName: 'Personal' })).toBe('Personal');
  });

  it('returns undefined when nothing is known', () => {
    expect(resolveReportOrganizationName({})).toBeUndefined();
  });
});
