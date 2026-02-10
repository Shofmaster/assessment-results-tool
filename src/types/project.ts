import type { AssessmentImport, FileInfo, EnhancedComparisonResult } from './assessment';
import type { UploadedDocument } from './googleDrive';
import type { DocumentRevision } from './revisionTracking';
import type { AuditAgent, SimulationResult } from './auditSimulation';

/** Per-agent knowledge base: maps agent ID to an array of uploaded documents */
export type AgentKnowledgeBases = Partial<Record<AuditAgent['id'], UploadedDocument[]>>;

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  assessments: AssessmentImport[];
  regulatoryFiles: FileInfo[];
  entityDocuments: FileInfo[];
  uploadedDocuments: UploadedDocument[];
  agentKnowledgeBases?: AgentKnowledgeBases;
  analyses: EnhancedComparisonResult[];
  documentRevisions: DocumentRevision[];
  simulationResults?: SimulationResult[];
  driveFileId?: string;
  lastSyncedAt?: string;
}
