/**
 * Form 337 Validator
 *
 * Real-time validation rules based on:
 * - AC 43.9-1G (Instructions for Completion of FAA Form 337)
 * - 14 CFR Part 43, Appendix B (Recording of major repairs and alterations)
 * - Common FSDO rejection reasons
 */

import type { Form337Input, WizardStepKey } from './form337Service';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  field: string;
  step: WizardStepKey;
  severity: ValidationSeverity;
  message: string;
  /** Regulatory reference (e.g., "AC 43.9-1G, Item 1") */
  reference?: string;
}

/* ── N-Number format: N followed by 1-5 alphanumeric (no I or O) ───── */
const N_NUMBER_REGEX = /^N[0-9]{1,5}[A-HJ-NP-Z]{0,2}$/i;

/* ── Date format: YYYY-MM-DD ────────────────────────────────────────── */
function isValidDate(d: string): boolean {
  if (!d) return false;
  const parsed = Date.parse(d);
  return !isNaN(parsed);
}

/**
 * Run all validation rules against the current form state.
 * Returns an array of issues sorted by severity (errors first).
 */
export function validateForm337(input: Form337Input): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  /* ── Step: aircraft (Item 1) ────────────────────────────────────── */
  if (!input.aircraft.nationalityRegistration.trim()) {
    issues.push({
      field: 'aircraft.nationalityRegistration',
      step: 'aircraft',
      severity: 'error',
      message: 'N-Number (nationality and registration mark) is required.',
      reference: 'AC 43.9-1G, Item 1',
    });
  } else if (!N_NUMBER_REGEX.test(input.aircraft.nationalityRegistration.trim())) {
    issues.push({
      field: 'aircraft.nationalityRegistration',
      step: 'aircraft',
      severity: 'warning',
      message: 'N-Number format appears incorrect. U.S. aircraft use "N" followed by 1-5 alphanumeric characters (no I or O).',
      reference: 'AC 43.9-1G, Item 1',
    });
  }

  if (!input.aircraft.serialNumber.trim()) {
    issues.push({
      field: 'aircraft.serialNumber',
      step: 'aircraft',
      severity: 'error',
      message: 'Aircraft serial number is required.',
      reference: 'AC 43.9-1G, Item 1',
    });
  }

  if (!input.aircraft.make.trim()) {
    issues.push({
      field: 'aircraft.make',
      step: 'aircraft',
      severity: 'warning',
      message: 'Aircraft make should be provided (from manufacturer identification plate).',
      reference: 'AC 43.9-1G, Item 1',
    });
  }

  if (!input.aircraft.model.trim()) {
    issues.push({
      field: 'aircraft.model',
      step: 'aircraft',
      severity: 'warning',
      message: 'Aircraft model should be provided (from manufacturer identification plate).',
      reference: 'AC 43.9-1G, Item 1',
    });
  }

  /* ── Step: owner (Item 2) ───────────────────────────────────────── */
  if (!input.owner.name.trim()) {
    issues.push({
      field: 'owner.name',
      step: 'owner',
      severity: 'error',
      message: 'Owner name is required.',
      reference: 'AC 43.9-1G, Item 2',
    });
  }

  if (!input.owner.address.trim()) {
    issues.push({
      field: 'owner.address',
      step: 'owner',
      severity: 'warning',
      message: 'Owner address should be provided (as shown on Certificate of Aircraft Registration).',
      reference: 'AC 43.9-1G, Item 2',
    });
  }

  /* ── Step: workType (Items 3-5) ─────────────────────────────────── */
  // No hard errors here — the type/unit selections have defaults.
  // But warn if unit identification is empty when the unit isn't the airframe itself.
  if (input.unitType !== 'airframe') {
    const ui = input.unitIdentification;
    if (!ui?.make?.trim() && !ui?.model?.trim() && !ui?.serialNumber?.trim()) {
      issues.push({
        field: 'unitIdentification',
        step: 'workType',
        severity: 'warning',
        message: `Item 4 requires the ${input.unitType}'s make, model, and serial number when work is not on the airframe itself.`,
        reference: 'AC 43.9-1G, Item 4',
      });
    }
  }

  /* ── Step: description (Item 8) ─────────────────────────────────── */
  if (!input.workDescription.summaryOfWork.trim()) {
    issues.push({
      field: 'workDescription.summaryOfWork',
      step: 'description',
      severity: 'error',
      message: 'Summary of work accomplished is required for Item 8.',
      reference: '14 CFR 43 Appendix B',
    });
  } else if (input.workDescription.summaryOfWork.trim().length < 100) {
    issues.push({
      field: 'workDescription.summaryOfWork',
      step: 'description',
      severity: 'warning',
      message: 'Work description appears brief. FSDOs may reject descriptions that lack sufficient detail for a person unfamiliar with the work to understand what was done.',
      reference: 'AC 43.9-1G, Item 8',
    });
  }

  if (!input.workDescription.methodsAndData.trim()) {
    issues.push({
      field: 'workDescription.methodsAndData',
      step: 'description',
      severity: 'error',
      message: 'Methods and data used must be described in Item 8.',
      reference: '14 CFR 43 Appendix B',
    });
  }

  if (!input.workDescription.approvedDataReferences || input.workDescription.approvedDataReferences.length === 0) {
    issues.push({
      field: 'workDescription.approvedDataReferences',
      step: 'description',
      severity: 'warning',
      message: 'No approved data references cited. Item 8 should reference the STC, AC, AD, service bulletin, or other approved data used as the basis for the work.',
      reference: 'AC 43.9-1G, Item 8',
    });
  }

  // Validate approved data reference format
  for (const ref of input.workDescription.approvedDataReferences || []) {
    if (ref.type === 'STC' && ref.identifier && !/^S[AEP]/i.test(ref.identifier.trim())) {
      issues.push({
        field: 'workDescription.approvedDataReferences',
        step: 'description',
        severity: 'info',
        message: `STC number "${ref.identifier}" — FAA STCs typically use SA (airframe), SE (engine), or SP (propeller) prefix.`,
      });
    }
  }

  if (!input.workDescription.weightAndBalanceImpact?.trim()) {
    issues.push({
      field: 'workDescription.weightAndBalanceImpact',
      step: 'description',
      severity: 'warning',
      message: 'Weight & balance impact statement is recommended. Per AC 43.9-1G, Item 8 should note that W&B data and equipment list have been revised.',
      reference: 'AC 43.9-1G, Item 8',
    });
  }

  if (!input.workDescription.location?.trim()) {
    issues.push({
      field: 'workDescription.location',
      step: 'description',
      severity: 'info',
      message: 'Consider specifying the precise location on the aircraft (station numbers, bay, panel) for Item 8 clarity.',
      reference: 'AC 43.9-1G, Item 8',
    });
  }

  /* ── Step: conformity (Item 6) ──────────────────────────────────── */
  if (!input.conformityStatement.nameAndAddress.trim()) {
    issues.push({
      field: 'conformityStatement.nameAndAddress',
      step: 'conformity',
      severity: 'error',
      message: 'Agency name and address (Item 6A) is required.',
      reference: 'AC 43.9-1G, Item 6',
    });
  }

  if (!input.conformityStatement.certificateNumber.trim()) {
    issues.push({
      field: 'conformityStatement.certificateNumber',
      step: 'conformity',
      severity: 'warning',
      message: 'Certificate number should be provided in Item 6C.',
      reference: 'AC 43.9-1G, Item 6',
    });
  }

  if (!input.conformityStatement.completionDate.trim()) {
    issues.push({
      field: 'conformityStatement.completionDate',
      step: 'conformity',
      severity: 'error',
      message: 'Completion date is required in Item 6.',
      reference: 'AC 43.9-1G, Item 6',
    });
  } else if (!isValidDate(input.conformityStatement.completionDate)) {
    issues.push({
      field: 'conformityStatement.completionDate',
      step: 'conformity',
      severity: 'warning',
      message: 'Completion date format appears invalid. Use YYYY-MM-DD.',
    });
  }

  if (!input.conformityStatement.signerName?.trim()) {
    issues.push({
      field: 'conformityStatement.signerName',
      step: 'conformity',
      severity: 'warning',
      message: 'Signer name should be provided for the conformity statement (Item 6D).',
      reference: 'AC 43.9-1G, Item 6',
    });
  }

  /* ── Step: approval (Item 7) ────────────────────────────────────── */
  if (!input.returnToService.approverName.trim()) {
    issues.push({
      field: 'returnToService.approverName',
      step: 'approval',
      severity: 'warning',
      message: 'Approver name should be provided for Item 7.',
      reference: 'AC 43.9-1G, Item 7',
    });
  }

  // Critical: warn if approver type isn't someone authorized for Block 7
  const validApproverKinds = ['ia', 'dar', 'repair_station', 'faa_inspector'];
  if (input.returnToService.approverKind && !validApproverKinds.includes(input.returnToService.approverKind)) {
    issues.push({
      field: 'returnToService.approverKind',
      step: 'approval',
      severity: 'warning',
      message: 'Item 7 must be signed by an authorized person: IA holder, DAR, repair station inspector, or FAA inspector. A regular A&P mechanic WITHOUT an IA cannot sign Block 7.',
      reference: '14 CFR 43.7, AC 43.9-1G, Item 7',
    });
  }

  if (!input.returnToService.approverCertificateOrDesignation.trim()) {
    issues.push({
      field: 'returnToService.approverCertificateOrDesignation',
      step: 'approval',
      severity: 'warning',
      message: 'Certificate or designation number should be provided for the approver (Item 7).',
      reference: 'AC 43.9-1G, Item 7',
    });
  }

  if (!input.returnToService.approvalDate.trim()) {
    issues.push({
      field: 'returnToService.approvalDate',
      step: 'approval',
      severity: 'warning',
      message: 'Approval date should be provided for Item 7.',
      reference: 'AC 43.9-1G, Item 7',
    });
  } else if (!isValidDate(input.returnToService.approvalDate)) {
    issues.push({
      field: 'returnToService.approvalDate',
      step: 'approval',
      severity: 'warning',
      message: 'Approval date format appears invalid. Use YYYY-MM-DD.',
    });
  }

  /* ── Step: review (disposition) ─────────────────────────────────── */
  // Info-level reminders shown on review step
  issues.push({
    field: 'disposition',
    step: 'review',
    severity: 'info',
    message: 'Remember: the completed form must be forwarded to the FAA Aircraft Registration Branch (AFS-750) within 48 hours of approval for return to service, and the aircraft owner must receive a signed copy.',
    reference: '14 CFR 43 Appendix B',
  });

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

/** Get issues for a specific wizard step. */
export function getStepIssues(issues: ValidationIssue[], step: WizardStepKey): ValidationIssue[] {
  return issues.filter((i) => i.step === step);
}

/** Check if a step has any errors (blocks progression). */
export function stepHasErrors(issues: ValidationIssue[], step: WizardStepKey): boolean {
  return issues.some((i) => i.step === step && i.severity === 'error');
}

/** Summary counts per severity. */
export function issueSummary(issues: ValidationIssue[]): Record<ValidationSeverity, number> {
  return {
    error: issues.filter((i) => i.severity === 'error').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
}
