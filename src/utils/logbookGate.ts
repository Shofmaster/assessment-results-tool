/**
 * Copy for the Logbook module gate.
 *
 * Logbook stays off until an admin turns it on. Company policy wins when it
 * is saved (including an explicit off). The per-user Admin → Users switch
 * applies only when the company has no logbook policy. This module does not
 * turn the flag on by itself.
 */

export type LogbookGateAudience = {
  isPlatformAdmin: boolean;
  /** company_admin or company_manager — can open Company Admin and save policy. */
  canEditCompanyPolicy: boolean;
};

export type LogbookGateAction = {
  label: string;
  to: string;
};

export type LogbookGateCopy = {
  title: string;
  summary: string;
  steps: string[];
  entryReviewNote: string;
  actions: LogbookGateAction[];
};

export function logbookGateCopy(audience: LogbookGateAudience): LogbookGateCopy {
  const steps = [
    'Company policy wins when it is saved. A company admin or company manager opens Company Admin, selects the organization, checks Logbook enabled, and clicks Save Policy. Saving it unchecked turns Logbook off for every member, even if a per-user switch is on. The QM Core preset saves it off; Full platform saves it on.',
    'The per-user switch applies only when that company has no Logbook policy saved. A platform admin opens Admin → Users, finds the person, and sets Logbook: Enabled. Unset or Disabled means off — there is no on-by-default.',
    'Settings does not have this switch. Ask a company admin, a company manager, or an AeroGap platform admin if you cannot open those pages.',
  ];

  const actions: LogbookGateAction[] = [];
  if (audience.canEditCompanyPolicy) {
    actions.push({ label: 'Open Company Admin', to: '/company-admin' });
  }
  if (audience.isPlatformAdmin) {
    actions.push({ label: 'Open Admin → Users', to: '/admin?tab=users' });
    actions.push({ label: 'Open Admin → Companies', to: '/admin?tab=companies' });
  }

  return {
    title: 'Logbook is turned off',
    summary:
      'This account cannot open Logbook yet. An admin has to enable it for the organization or for this user. Nothing is broken, and this page does not turn it on by itself.',
    steps,
    entryReviewNote:
      'Entry Review stays available at Logbook → Entry Review (or /logbook/entry-review) without this module. Saving findings back into the logbook still needs Logbook enabled.',
    actions,
  };
}

/** Toast used when Fleet (same entitlement) bounces the user away. */
export function fleetLogbookDisabledToast(): string {
  return (
    'Fleet needs the Logbook module. A company admin or manager turns it on under Company Admin → Logbook enabled → Save Policy. ' +
    'A platform admin can do the same under Admin → Companies, or set Admin → Users → Logbook: Enabled when the company has no Logbook policy. ' +
    'Settings does not have this switch.'
  );
}
