/**
 * Pure roll-up of the requirements an aircraft carries because of its
 * modifications (ModRequirementsSummary.tsx). Installed mods only.
 */
import type {
  AircraftModification,
  IcaRequirement,
  RecurringInspection,
} from '../types/aircraftModification';

export interface SourcedItem<T> {
  item: T;
  modId: string;
  modTitle: string;
}

export interface ModRequirementsRollup {
  icaTasks: SourcedItem<IcaRequirement>[];
  recurringInspections: SourcedItem<RecurringInspection>[];
  afmsLimitations: SourcedItem<string>[];
  /** Mods that require an AFM supplement (with its reference when known). */
  afmsSupplements: SourcedItem<string>[];
  placards: SourcedItem<string>[];
  netWeightChangeLbs: number;
  counts: {
    installedMods: number;
    icaTasks: number;
    recurringInspections: number;
    afmsSupplements: number;
    placards: number;
  };
}

export function aggregateModRequirements(
  mods: AircraftModification[],
): ModRequirementsRollup {
  const installed = mods.filter((m) => m.status === 'installed');

  const icaTasks: SourcedItem<IcaRequirement>[] = [];
  const recurringInspections: SourcedItem<RecurringInspection>[] = [];
  const afmsLimitations: SourcedItem<string>[] = [];
  const afmsSupplements: SourcedItem<string>[] = [];
  const placards: SourcedItem<string>[] = [];
  let netWeightChangeLbs = 0;

  for (const mod of installed) {
    const source = { modId: mod._id, modTitle: mod.title };
    for (const ica of mod.icaRequirements ?? []) {
      icaTasks.push({ item: ica, ...source });
    }
    for (const insp of mod.recurringInspections ?? []) {
      recurringInspections.push({ item: insp, ...source });
    }
    if (mod.afmSupplement?.required) {
      afmsSupplements.push({
        item: mod.afmSupplement.reference || 'AFM supplement required (no reference recorded)',
        ...source,
      });
      for (const limitation of mod.afmSupplement.limitations ?? []) {
        afmsLimitations.push({ item: limitation, ...source });
      }
    }
    for (const placard of mod.placards ?? []) {
      placards.push({ item: placard, ...source });
    }
    if (typeof mod.weightBalance?.weightChangeLbs === 'number') {
      netWeightChangeLbs += mod.weightBalance.weightChangeLbs;
    }
  }

  return {
    icaTasks,
    recurringInspections,
    afmsLimitations,
    afmsSupplements,
    placards,
    netWeightChangeLbs: Math.round(netWeightChangeLbs * 100) / 100,
    counts: {
      installedMods: installed.length,
      icaTasks: icaTasks.length,
      recurringInspections: recurringInspections.length,
      afmsSupplements: afmsSupplements.length,
      placards: placards.length,
    },
  };
}
