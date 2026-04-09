export type RevisionStatus = 'unknown' | 'current' | 'outdated' | 'checking' | 'error';

export interface DocumentRevision {
  id: string;
  documentName: string;
  documentType: 'regulatory' | 'entity' | 'uploaded' | 'reference';
  sourceDocumentId: string;
  category?: string;
  detectedRevision: string;
  latestKnownRevision: string;
  isCurrentRevision: boolean | null;
  lastCheckedAt: string | null;
  searchSummary: string;
  status: RevisionStatus;
}

export interface ManualRevisionLink {
  _id: string;
  projectId: string;
  manualId: string;
  manualRevisionId: string;
  sourceDocumentId?: string;
  documentRevisionId?: string;
  documentName?: string;
  detectedRevision?: string;
  manualRevisionNumber: string;
  comparisonStatus: 'match' | 'mismatch' | 'unknown';
  matchConfidence?: number;
  lastSyncedAt: string;
}
