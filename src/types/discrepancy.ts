/** Client-side mirror of the Convex `aircraftDiscrepancies` row. */
export interface AircraftDiscrepancy {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  avianisExternalId?: string;
  source: "avianis" | "manual" | string;
  status: "open" | "deferred" | "resolved" | "closed" | string;
  category?: string;
  ataChapter?: string;
  melItem?: string;
  description: string;
  location?: string;
  partNumbers?: string[];
  discoveredAt?: string;
  discoveredAtTotalTime?: number;
  deferralCategory?: string;
  deferralExpiresAt?: string;
  research?: DiscrepancyResearchResult;
  researchedAt?: number;
  logbookDraftEntryId?: string;
  raw?: unknown;
  createdAt: string;
  updatedAt: string;
}

/** Shape persisted by `discrepancyResearch.saveResearch`. Must match the JSON
 *  we ask Claude to produce in src/services/discrepancyResearchService.ts. */
export interface DiscrepancyResearchResult {
  problemAnalysis: string;
  likelyRootCauses: string[];
  troubleshootingSteps: string[];
  correctiveAction: string;
  partsNeeded: { partNumber: string; description: string }[];
  references: {
    documentId: string;
    docName: string;
    chunkIndex: number;
    excerpt: string;
  }[];
  suggestedLogbookEntry: {
    workPerformed: string;
    ataChapter: string;
    returnToServiceStatement: string;
  };
  noManualReferencesFound: boolean;
}

export interface AvianisStatus {
  configured: boolean;
  authMethod: string | null;
  baseUrl: string | null;
  tenantId: string | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}
