/** Aircraft asset stored in Convex. */
export interface AircraftAsset {
  _id: string;
  projectId: string;
  userId: string;
  aircraftTypeId?: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  operator?: string;
  year?: number;
  baselineTotalTime?: number;
  baselineTotalCycles?: number;
  baselineTotalLandings?: number;
  baselineAsOfDate?: string;
  notes?: string;
  status?: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
}

/** Component installed on or removed from an aircraft. */
export interface AircraftComponent {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  partNumber: string;
  serialNumber?: string;
  description: string;
  ataChapter?: string;
  position?: string;
  isLifeLimited?: boolean;
  lifeLimit?: number;
  lifeLimitUnit?: "hours" | "cycles" | "landings" | "calendar_months";
  tsnAtInstall?: number;
  tsoAtInstall?: number;
  cyclesAtInstall?: number;
  aircraftTimeAtInstall?: number;
  aircraftCyclesAtInstall?: number;
  installDate?: string;
  removeDate?: string;
  installLogbookEntryId?: string;
  removeLogbookEntryId?: string;
  status: "installed" | "removed" | "scrapped";
  createdAt: string;
  updatedAt: string;
}
