import type { AssessmentData } from './assessment';
import type { SimulationResult } from './auditSimulation';
import type { DocumentRevision } from './revisionTracking';
import type { UploadedDocument } from './document';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  assessments: AssessmentData[];
  documents: UploadedDocument[];
  analyses: any[];
  simulationResults: SimulationResult[];
  documentRevisions?: DocumentRevision[];
}

export interface AgentKnowledgeBaseDocument {
  id: string;
  name: string;
  text: string;
  source: string;
  addedAt: string;
}

export type AgentKnowledgeBases = Record<string, AgentKnowledgeBaseDocument[]>;
