export interface AuditAgent {
  id: 'faa-inspector' | 'shop-owner' | 'isbao-auditor' | 'easa-inspector' | 'as9100-auditor' | 'sms-consultant' | 'safety-auditor';
  name: string;
  role: string;
  avatar: string;
  color: string;
}

export interface AuditMessage {
  id: string;
  agentId: AuditAgent['id'];
  agentName: string;
  role: string;
  content: string;
  timestamp: string;
  round: number;
  reviewIteration?: number;
  wasRevised?: boolean;
}

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

export type SelfReviewMode = 'off' | 'per-turn' | 'post-simulation';

export interface SelfReviewConfig {
  mode: SelfReviewMode;
  maxIterations: number;
}

export type KBCurrencyStatus = 'unchecked' | 'checking' | 'current' | 'outdated' | 'unknown' | 'error';

export interface KBDocumentCurrencyResult {
  documentId: string;
  documentName: string;
  status: KBCurrencyStatus;
  latestRevision: string;
  summary: string;
  checkedAt: string | null;
}

export interface AuditSimulationConfig {
  totalRounds: number;
  assessmentId: string;
  thinking?: ThinkingConfig;
  selfReview?: SelfReviewConfig;
}

export interface SimulationResult {
  id: string;
  name: string;
  assessmentId: string;
  assessmentName: string;
  agentIds: AuditAgent['id'][];
  totalRounds: number;
  messages: AuditMessage[];
  createdAt: string;
  thinkingEnabled: boolean;
  selfReviewMode: SelfReviewMode;
}
