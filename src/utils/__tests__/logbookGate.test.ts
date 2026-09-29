import { describe, expect, it } from 'vitest';
import { fleetLogbookDisabledToast, logbookGateCopy } from '../../utils/logbookGate';

describe('logbookGateCopy', () => {
  it('tells every user which admin pages enable Logbook', () => {
    const copy = logbookGateCopy({ isPlatformAdmin: false, canEditCompanyPolicy: false });
    expect(copy.title).toMatch(/turned off/i);
    expect(copy.summary).toMatch(/does not turn it on/i);
    expect(copy.steps.join(' ')).toMatch(/Company Admin/);
    expect(copy.steps.join(' ')).toMatch(/Admin → Users/);
    expect(copy.steps.join(' ')).toMatch(/Settings does not/);
    expect(copy.entryReviewNote).toMatch(/entry-review/);
    expect(copy.actions).toEqual([]);
  });

  it('offers Company Admin to someone who can save company policy', () => {
    const copy = logbookGateCopy({ isPlatformAdmin: false, canEditCompanyPolicy: true });
    expect(copy.actions.map((a) => a.to)).toEqual(['/company-admin']);
  });

  it('offers platform admin links without hiding the company path', () => {
    const copy = logbookGateCopy({ isPlatformAdmin: true, canEditCompanyPolicy: true });
    expect(copy.actions.map((a) => a.to)).toEqual([
      '/company-admin',
      '/admin?tab=users',
      '/admin?tab=companies',
    ]);
  });

  it('explains the Fleet bounce in the same terms', () => {
    const toast = fleetLogbookDisabledToast();
    expect(toast).toMatch(/Company Admin/);
    expect(toast).toMatch(/Admin → Users/);
    expect(toast).toMatch(/Settings does not/);
  });
});
