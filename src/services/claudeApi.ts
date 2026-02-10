import type { AssessmentData, Finding, Recommendation, ComplianceStatus, DocumentAnalysis, EnhancedComparisonResult } from '../types/assessment';
import type { ThinkingConfig } from '../types/auditSimulation';
import { createClaudeMessage } from './claudeProxy';

export class ClaudeAnalyzer {
  private thinkingConfig?: ThinkingConfig;

  constructor(thinkingConfig?: ThinkingConfig) {
    this.thinkingConfig = thinkingConfig;
  }

  private extractTextContent(response: { content: Array<{ type: string; text?: string }> }): string {
    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => block.text || '').join('\n\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildApiParams(maxTokensBase: number, messages: Array<{ role: 'user' | 'assistant'; content: string }>): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: this.thinkingConfig?.enabled ? Math.max(maxTokensBase, 16000) : maxTokensBase,
      messages,
    };

    if (this.thinkingConfig?.enabled) {
      params.thinking = { type: 'enabled', budget_tokens: this.thinkingConfig.budgetTokens };
      params.temperature = 1;
    } else {
      params.temperature = 0.3;
    }

    return params;
  }

  async analyzeAssessment(
    assessment: AssessmentData,
    regulatoryDocs: string[],
    entityDocs: string[]
  ): Promise<{
    findings: Finding[];
    recommendations: Recommendation[];
    compliance: ComplianceStatus;
  }> {
    const prompt = this.buildAnalysisPrompt(assessment, regulatoryDocs, entityDocs);
    const params = this.buildApiParams(16000, [{ role: 'user', content: prompt }]);
    const message = await createClaudeMessage(params);

    const responseText = this.extractTextContent(message);
    return this.parseAnalysisResponse(responseText);
  }

  private buildAnalysisPrompt(
    assessment: AssessmentData,
    regulatoryDocs: string[],
    entityDocs: string[]
  ): string {
    return `You are an experienced aviation quality auditor working with FAA representatives to conduct a comprehensive audit. Analyze the following aviation maintenance organization assessment against regulatory requirements.

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# REGULATORY STANDARDS AVAILABLE
${regulatoryDocs.map((doc) => `- ${doc}`).join('\n')}

# ENTITY DOCUMENTS AVAILABLE
${entityDocs.map((doc) => `- ${doc}`).join('\n')}

# YOUR TASK
As an FAA-aligned auditor, perform a thorough compliance audit focusing on:

1. **14 CFR Part 145 Compliance** - Analyze all aspects against Part 145 requirements
2. **Quality System Effectiveness** - Evaluate CAPA, calibration, training, tool control
3. **Documentation & Recordkeeping** - Assess compliance with regulatory documentation requirements
4. **Operational Performance** - Review metrics against industry standards
5. **Certification Risks** - Identify areas that could lead to certificate action

# OUTPUT FORMAT
Provide your analysis in the following JSON structure:

\`\`\`json
{
  "findings": [
    {
      "severity": "critical|major|minor|observation",
      "category": "Category name",
      "title": "Brief finding title",
      "description": "Detailed description of the finding",
      "regulation": "Specific regulation reference (e.g., 14 CFR 145.109)",
      "evidence": "Evidence from assessment data",
      "requirement": "What the regulation requires"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "area": "Area name",
      "recommendation": "Specific actionable recommendation",
      "expectedImpact": "Expected improvement from implementing this",
      "timeline": "Suggested implementation timeframe"
    }
  ],
  "compliance": {
    "overall": 75,
    "byCategory": {
      "Quality Systems": 65,
      "Training & Competency": 70,
      "Calibration & Equipment": 60,
      "Production Control": 80,
      "Documentation": 75,
      "Audit & CAPA": 55
    },
    "criticalGaps": 2,
    "majorGaps": 5,
    "minorGaps": 8
  }
}
\`\`\`

# SEVERITY DEFINITIONS
- **Critical**: Immediate safety/compliance risk, could lead to certificate action
- **Major**: Significant compliance gap, must be addressed within 30 days
- **Minor**: Improvement opportunity, should be addressed within 90 days
- **Observation**: Best practice recommendation, no immediate compliance risk

# FOCUS AREAS
Pay special attention to:
- Recurring audit findings (indicates systemic issues)
- Training program deficiencies (Part 145 §145.163)
- Calibration program gaps (Part 145 §145.109)
- CAPA system effectiveness
- Tool control and FOD prevention
- High rework/turnover rates
- Schedule adherence issues

Provide thorough, actionable findings with specific regulation references. Be direct and professional, as this will guide critical compliance decisions.`;
  }

  async analyzeDocument(
    documentName: string,
    documentText: string,
    assessment?: AssessmentData
  ): Promise<DocumentAnalysis> {
    const prompt = this.buildDocumentAnalysisPrompt(documentName, documentText, assessment);
    const params = this.buildApiParams(8000, [{ role: 'user', content: prompt }]);
    const message = await createClaudeMessage(params);

    const responseText = this.extractTextContent(message);
    return this.parseDocumentAnalysisResponse(documentName, responseText);
  }

  async analyzeWithDocuments(
    assessment: AssessmentData,
    regulatoryDocs: string[],
    entityDocs: string[],
    uploadedDocuments: Array<{ name: string; text: string }>
  ): Promise<EnhancedComparisonResult> {
    // First, analyze each uploaded document
    const documentAnalyses: DocumentAnalysis[] = [];
    for (const doc of uploadedDocuments.filter((d) => d.text && d.text.length > 0)) {
      try {
        const analysis = await this.analyzeDocument(doc.name, doc.text || '', assessment);
        documentAnalyses.push(analysis);
      } catch (error) {
        console.error(`Error analyzing document ${doc.name}:`, error);
      }
    }

    // Then, perform the main assessment analysis
    const baseAnalysis = await this.analyzeAssessment(assessment, regulatoryDocs, entityDocs);

    // Finally, create a combined analysis with insights from documents
    const combinedInsights = this.generateCombinedInsights(baseAnalysis, documentAnalyses);

    return {
      ...baseAnalysis,
      assessmentId: '',
      companyName: assessment.companyName,
      analysisDate: new Date().toISOString(),
      documentAnalyses,
      combinedInsights,
    };
  }

  private buildDocumentAnalysisPrompt(
    documentName: string,
    documentText: string,
    assessment?: AssessmentData
  ): string {
    const assessmentContext = assessment
      ? `
# COMPANY CONTEXT
Company Name: ${assessment.companyName}
Certifications: ${assessment.certifications.join(', ')}
Services: ${assessment.servicesOffered.join(', ')}
Key Challenges: ${assessment.challenges.join(', ')}
`
      : '';

    return `You are an experienced aviation quality auditor. Analyze the following document for compliance issues, findings, and recommendations.

# DOCUMENT TO ANALYZE
Document Name: ${documentName}
${assessmentContext}
# DOCUMENT CONTENT
${documentText.substring(0, 100000)}

# YOUR TASK
Analyze this document for:
1. **Compliance Issues** - Any regulatory violations or gaps (especially 14 CFR Part 145, AS9100, etc.)
2. **Key Findings** - Important observations about quality, safety, or operational issues
3. **Recommendations** - Actionable suggestions for improvement

# OUTPUT FORMAT
Provide your analysis in the following JSON structure:

\`\`\`json
{
  "keyFindings": [
    "Finding 1: Brief description",
    "Finding 2: Brief description"
  ],
  "complianceIssues": [
    "Issue 1 with regulation reference",
    "Issue 2 with regulation reference"
  ],
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2"
  ]
}
\`\`\`

Focus on actionable insights and specific regulatory references where applicable.`;
  }

  private parseAnalysisResponse(response: string): {
    findings: Finding[];
    recommendations: Recommendation[];
    compliance: ComplianceStatus;
  } {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);

        // Add IDs to findings and recommendations
        const findings = parsed.findings.map((f: any, i: number) => ({
          ...f,
          id: `finding-${i + 1}`,
        }));

        const recommendations = parsed.recommendations.map((r: any, i: number) => ({
          ...r,
          id: `rec-${i + 1}`,
        }));

        return {
          findings,
          recommendations,
          compliance: parsed.compliance,
        };
      }

      // Fallback if no JSON found
      return {
        findings: [],
        recommendations: [],
        compliance: {
          overall: 0,
          byCategory: {},
          criticalGaps: 0,
          majorGaps: 0,
          minorGaps: 0,
        },
      };
    } catch (error) {
      console.error('Error parsing Claude response:', error);
      throw new Error('Failed to parse analysis response');
    }
  }

  private parseDocumentAnalysisResponse(documentName: string, response: string): DocumentAnalysis {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          documentId: `doc-${Date.now()}`,
          documentName,
          extractedText: '',
          keyFindings: parsed.keyFindings || [],
          complianceIssues: parsed.complianceIssues || [],
          recommendations: parsed.recommendations || [],
          analyzedAt: new Date().toISOString(),
        };
      }

      return {
        documentId: `doc-${Date.now()}`,
        documentName,
        extractedText: '',
        keyFindings: [],
        complianceIssues: [],
        recommendations: [],
        analyzedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error parsing document analysis response:', error);
      throw new Error('Failed to parse document analysis response');
    }
  }

  private generateCombinedInsights(
    _baseAnalysis: { findings: Finding[]; recommendations: Recommendation[] },
    documentAnalyses: DocumentAnalysis[]
  ): string[] {
    const insights: string[] = [];

    if (documentAnalyses.length === 0) {
      return insights;
    }

    // Count total compliance issues from documents
    const totalDocIssues = documentAnalyses.reduce(
      (sum, doc) => sum + doc.complianceIssues.length,
      0
    );

    if (totalDocIssues > 0) {
      insights.push(
        `Document analysis revealed ${totalDocIssues} additional compliance issues across ${documentAnalyses.length} uploaded document(s).`
      );
    }

    // Highlight critical documents
    const criticalDocs = documentAnalyses.filter((doc) => doc.complianceIssues.length >= 3);
    if (criticalDocs.length > 0) {
      insights.push(
        `${criticalDocs.length} document(s) contain multiple compliance issues requiring immediate attention: ${criticalDocs.map((d) => d.documentName).join(', ')}`
      );
    }

    // Count total findings
    const totalFindings = documentAnalyses.reduce((sum, doc) => sum + doc.keyFindings.length, 0);
    if (totalFindings > 0) {
      insights.push(
        `Document review identified ${totalFindings} key findings that support or expand upon the assessment analysis.`
      );
    }

    return insights;
  }
}
