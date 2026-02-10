export interface AssessmentData {
  companyName: string;
  location: string;
  employeeCount: string;
  annualRevenue: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  certifications: string[];
  as9100Rev: string;
  argusLevel: string;
  aircraftCategories: string[];
  specificAircraftTypes: string;
  servicesOffered: string[];
  operationsScope: string;
  oemAuthorizations: string[];
  specialCapabilities: string[];
  maintenanceTrackingSoftware: string;
  softwareSatisfaction: string;
  hasDefinedProcess: string;
  processDocumented: string;
  processFollowed: string;
  processEffectiveness: string;
  partsInventoryMethod: string;
  partsTrackingSystem: string;
  inventoryAccuracy: string;
  shelfLifeTracking: string;
  qualityMethodologies: string[];
  continuousImprovementActive: string;
  toolControlMethod: string;
  toolControlDescription: string;
  toolControlErrors: string;
  toolControlErrorFrequency: string;
  hasSMS: string;
  smsProgram: string;
  smsMaturity: string;
  challenges: string[];
  trainingProgramType: string;
  trainingTracking: string;
  initialTrainingDuration: string;
  recurrentTrainingFrequency: string;
  competencyVerification: string;
  timeToCompetency: string;
  calibrationProgram: string;
  calibrationTracking: string;
  overdueCalibrations: string;
  outOfToleranceFrequency: string;
  outOfToleranceResponse: string;
  capaSystemStatus: string;
  discrepancyTracking: string;
  capaClosureTime: string;
  repeatDiscrepancies: string;
  capaAuthority: string;
  lastFAASurveillance: string;
  auditFindingsCount: string;
  findingSeverity: string;
  recurringFindings: string;
  findingClosureStatus: string;
  certificateActions: string[];
  workOrderSystem: string;
  scheduleAdherence: string;
  productionBottlenecks: string[];
  wipVisibility: string;
  routineInspectionDays: string;
  typicalRepairDays: string;
  majorOverhaulDays: string;
  capacityUtilization: string;
  productionPlanning: string;
  firstPassRate: string;
  warrantyRate: string;
  repeatMaintenanceRate: string;
  jobMargin: string;
  revenuePerTech: string;
  scrapReworkCost: string;
  partsWaitDays: string;
  inspectionWaitHours: string;
  approvalTurnaroundDays: string;
  auditHistory: string;
  turnoverRate: string;
  reworkRate: string;
  upcomingAudits: string;
  specificConcerns: string;
}

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  category?: string;
  size: number;
  importedAt: string;
}

export interface AssessmentImport {
  id: string;
  data: AssessmentData;
  importedAt: string;
}

export interface ComparisonResult {
  assessmentId: string;
  companyName: string;
  analysisDate: string;
  findings: Finding[];
  recommendations: Recommendation[];
  compliance: ComplianceStatus;
}

export interface Finding {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  category: string;
  title: string;
  description: string;
  regulation: string;
  evidence: string;
  requirement: string;
}

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  area: string;
  recommendation: string;
  expectedImpact: string;
  timeline: string;
}

export interface ComplianceStatus {
  overall: number;
  byCategory: Record<string, number>;
  criticalGaps: number;
  majorGaps: number;
  minorGaps: number;
}

export interface DocumentAnalysis {
  documentId: string;
  documentName: string;
  extractedText: string;
  keyFindings: string[];
  complianceIssues: string[];
  recommendations: string[];
  analyzedAt: string;
}

export interface EnhancedComparisonResult extends ComparisonResult {
  documentAnalyses?: DocumentAnalysis[];
  combinedInsights?: string[];
}
