/**
 * Structured "Full Answer" work package from Ask an Expert —
 * MEL + troubleshooting-with-refs + example log entries in one shot.
 */

export type AskWorkPackageMel = {
  item: string;
  deferralCategory: string;
  maintenanceProcedures: string;
  operationalProcedures: string;
  operationalLimits: string;
  /** Explicit gap when MEL/MMEL excerpts did not support an item. */
  gapNote: string;
};

export type AskWorkPackageStep = {
  text: string;
  /** Tags like "S1" that exist in this turn's sources. */
  refTags: string[];
};

export type AskWorkPackageLog = {
  discrepancyWriteUp: string;
  workPerformed: string;
  ataChapter: string;
  returnToServiceStatement: string;
};

export type AskWorkPackagePart = {
  partNumber: string;
  description: string;
};

export type AskWorkPackage = {
  summary: string;
  mel: AskWorkPackageMel;
  troubleshootingSteps: AskWorkPackageStep[];
  correctiveAction: string;
  partsNeeded: AskWorkPackagePart[];
  exampleLogEntries: AskWorkPackageLog;
  noManualReferencesFound: boolean;
};

export function emptyAskWorkPackageMel(gapNote = ''): AskWorkPackageMel {
  return {
    item: '',
    deferralCategory: '',
    maintenanceProcedures: '',
    operationalProcedures: '',
    operationalLimits: '',
    gapNote,
  };
}

export function emptyAskWorkPackage(): AskWorkPackage {
  return {
    summary: '',
    mel: emptyAskWorkPackageMel(),
    troubleshootingSteps: [],
    correctiveAction: '',
    partsNeeded: [],
    exampleLogEntries: {
      discrepancyWriteUp: '',
      workPerformed: '',
      ataChapter: '',
      returnToServiceStatement: '',
    },
    noManualReferencesFound: false,
  };
}
