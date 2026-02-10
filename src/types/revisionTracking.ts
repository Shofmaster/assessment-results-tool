export type RevisionStatus = 'unknown' | 'current' | 'outdated' | 'checking' | 'error';

export interface DocumentRevision {
  id: string;
  documentName: string;
  documentType: 'regulatory' | 'entity' | 'uploaded';
  sourceDocumentId: string;
  category?: string;
  detectedRevision: string;
  latestKnownRevision: string;
  isCurrentRevision: boolean | null;
  lastCheckedAt: string | null;
  searchSummary: string;
  status: RevisionStatus;
}
