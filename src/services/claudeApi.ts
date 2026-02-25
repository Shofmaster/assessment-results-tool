import type { AssessmentData, Finding, Recommendation, ComplianceStatus, DocumentAnalysis, EnhancedComparisonResult } from '../types/assessment';
import type { ThinkingConfig } from '../types/auditSimulation';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import type { ClaudeMessageContent } from './claudeProxy';
import { createClaudeMessage, createClaudeMessageStream } from './claudeProxy';

/** Optional image attachment for multimodal analysis (e.g. photos of logs, nameplates). */
export type AttachedImage = { media_type: string; data: string };

/** Truncate document text to stay within context limits (15–20k chars per doc) */
const MAX_CHARS_PER_DOC = 18000;

/** Build a section for regulatory/entity document content when text is available */
function buildRegulatoryEntityContentSection(
  docs: Array<{ name: string; text?: string }>,
  title: string
): string {
  const withText = docs.filter((d) => d.text && d.text.length > 0);
  if (withText.length === 0) return '';
  const sections = withText.map(
    (d) => `## ${d.name}\n${(d.text || '').substring(0, MAX_CHARS_PER_DOC)}`
  );
  return `\n\n# ${title}\nThe following documents have been provided for your analysis. Reference them directly when citing requirements.\n\n${sections.join('\n\n')}`;
}

export type DocWithOptionalText = { name: string; text?: string };

export class ClaudeAnalyzer {
  private thinkingConfig?: ThinkingConfig;
  private model: string;

  constructor(thinkingConfig?: ThinkingConfig, model?: string) {
    this.thinkingConfig = thinkingConfig;
    this.model = model ?? DEFAULT_CLAUDE_MODEL;
  }

  private extractTextContent(response: { content: Array<{ type: string; text?: string }> }): string {
    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => block.text || '').join('\n\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildApiParams(
    maxTokensBase: number,
    messages: Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }>,
    systemPrompt?: string
  ): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: this.model,
      max_tokens: this.thinkingConfig?.enabled ? Math.max(maxTokensBase, 16000) : maxTokensBase,
      messages,
    };
    if (systemPrompt) {
      params.system = systemPrompt;
    }
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
    regulatoryDocs: Array<DocWithOptionalText | string>,
    entityDocs: Array<DocWithOptionalText | string>,
    smsDocs: Array<DocWithOptionalText | string> = [],
    options?: { onStreamText?: (text: string) => void; attachedImages?: AttachedImage[] }
  ): Promise<{
    findings: Finding[];
    recommendations: Recommendation[];
    compliance: ComplianceStatus;
  }> {
    const regDocs = regulatoryDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    const entDocs = entityDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    const sms = smsDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    const prompt = this.buildAnalysisPrompt(assessment, regDocs, entDocs, sms);
    const userContent = this.buildUserContent(prompt, options?.attachedImages);
    const params = this.buildApiParams(16000, [{ role: 'user', content: userContent }]);

    const message = options?.onStreamText
      ? await createClaudeMessageStream(params, { onText: options.onStreamText })
      : await createClaudeMessage(params);

    const responseText = this.extractTextContent(message);
    return this.parseAnalysisResponse(responseText);
  }

  private buildUserContent(prompt: string, attachedImages?: AttachedImage[]): string | ClaudeMessageContent[] {
    if (!attachedImages?.length) return prompt;
    const blocks: ClaudeMessageContent[] = [
      { type: 'text', text: prompt + '\n\n# ATTACHED IMAGES\nYou have been given one or more images (e.g. photos of logs, nameplates, or documents). Use them to support or refine your compliance analysis where relevant.' },
      ...attachedImages.map((img) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
      })),
    ];
    return blocks;
  }

  private buildAnalysisPrompt(
    assessment: AssessmentData,
    regulatoryDocs: Array<DocWithOptionalText>,
    entityDocs: Array<DocWithOptionalText>,
    smsDocs: Array<DocWithOptionalText> = []
  ): string {
    const regContent = buildRegulatoryEntityContentSection(regulatoryDocs, 'REGULATORY DOCUMENT CONTENT');
    const entityContent = buildRegulatoryEntityContentSection(entityDocs, 'ENTITY DOCUMENT CONTENT');
    const smsContent = buildRegulatoryEntityContentSection(smsDocs, 'SMS DATA');

    return `You are an experienced aviation quality auditor working with FAA representatives to conduct a comprehensive audit. Analyze the following aviation maintenance organization assessment against regulatory requirements.

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# REGULATORY STANDARDS AVAILABLE
${regulatoryDocs.map((doc) => `- ${doc.name}`).join('\n')}

# ENTITY DOCUMENTS AVAILABLE
${entityDocs.map((doc) => `- ${doc.name}`).join('\n')}
${regContent}
${entityContent}
${smsContent}

# YOUR TASK
As an FAA-aligned auditor, perform a thorough compliance audit. Use this reasoning process for each finding:
1. **Identify the regulatory gap** — Which requirement (14 CFR, AS9100, etc.) applies? Reference specific sections from the regulatory document content when provided.
2. **Extract evidence** — What in the assessment data indicates noncompliance or risk?
3. **Assess severity** — Critical (certificate risk), Major (30-day fix), Minor (90-day), or Observation.

Focus areas:
- 14 CFR Part 145 Compliance — Analyze all aspects against Part 145 requirements
- Quality System Effectiveness — CAPA, calibration, training, tool control
- Documentation & Recordkeeping — Regulatory documentation requirements
- Operational Performance — Metrics vs. industry standards
- Certification Risks — Areas that could lead to certificate action

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

Provide thorough, actionable findings with specific regulation references. Cite exact regulation text when document content is provided above. Be direct and professional, as this will guide critical compliance decisions.`;
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
    regulatoryDocs: Array<DocWithOptionalText | string>,
    entityDocs: Array<DocWithOptionalText | string>,
    uploadedDocuments: Array<{ name: string; text: string }>,
    smsDocs: Array<DocWithOptionalText | string> = [],
    options?: { onStreamText?: (text: string) => void; attachedImages?: AttachedImage[] }
  ): Promise<EnhancedComparisonResult> {
    // First, analyze each uploaded document (with delay to avoid rate limits)
    const documentAnalyses: DocumentAnalysis[] = [];
    for (const doc of uploadedDocuments.filter((d) => d.text && d.text.length > 0)) {
      try {
        const analysis = await this.analyzeDocument(doc.name, doc.text || '', assessment);
        documentAnalyses.push(analysis);
        // Space out requests to stay under 30k tokens/min
        await new Promise((resolve) => setTimeout(resolve, 2500));
      } catch (error) {
        console.error(`Error analyzing document ${doc.name}:`, error);
      }
    }

    // Then, perform the main assessment analysis (optional streaming, optional images)
    const baseAnalysis = await this.analyzeAssessment(assessment, regulatoryDocs, entityDocs, smsDocs, {
      onStreamText: options?.onStreamText,
      attachedImages: options?.attachedImages,
    });

    // Finally, synthesize combined insights via LLM
    const combinedInsights = await this.synthesizeCombinedInsights(baseAnalysis, documentAnalyses);

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

  private async synthesizeCombinedInsights(
    baseAnalysis: { findings: Finding[]; recommendations: Recommendation[] },
    documentAnalyses: DocumentAnalysis[]
  ): Promise<string[]> {
    if (documentAnalyses.length === 0) {
      return [];
    }

    const prompt = `You are an aviation quality auditor synthesizing insights from an assessment analysis and multiple document analyses.

# ASSESSMENT FINDINGS (${baseAnalysis.findings.length} total)
${baseAnalysis.findings.map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join('\n')}

# ASSESSMENT RECOMMENDATIONS (${baseAnalysis.recommendations.length} total)
${baseAnalysis.recommendations.map((r) => `- [${r.priority}] ${r.area}: ${r.recommendation}`).join('\n')}

# DOCUMENT ANALYSES
${documentAnalyses.map((doc) => `
## ${doc.documentName}
Key Findings: ${doc.keyFindings.join('; ')}
Compliance Issues: ${doc.complianceIssues.join('; ')}
Recommendations: ${doc.recommendations.join('; ')}
`).join('\n')}

# YOUR TASK
Synthesize 3–7 high-value combined insights that:
1. Identify cross-cutting themes between the assessment and document analyses
2. Note any contradictions or consistencies between documents and assessment data
3. Prioritize recommendations that integrate evidence from multiple sources
4. Highlight documents or findings requiring immediate attention

# OUTPUT FORMAT
Return a JSON array of insight strings (each 1–3 sentences, actionable and specific):
\`\`\`json
{
  "insights": [
    "First synthesized insight...",
    "Second insight..."
  ]
}
\`\`\``;

    const params = this.buildApiParams(4000, [{ role: 'user', content: prompt }]);
    const message = await createClaudeMessage(params);
    const responseText = this.extractTextContent(message);

    try {
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return Array.isArray(parsed.insights) ? parsed.insights : [];
      }
    } catch {
      // Fallback to rule-based insights if parsing fails
    }

    return [
      `Document analysis revealed ${documentAnalyses.reduce((s, d) => s + d.complianceIssues.length, 0)} compliance issues across ${documentAnalyses.length} document(s).`,
    ];
  }

  /**
   * Try to extract a JSON object with a "findings" array from model response text.
   * Tries: (1) ```json ... ``` block, (2) ```JSON ... ```, (3) first {...} containing "findings".
   */
  private parseFindingsFromResponse(responseText: string): Array<{ severity: string; location?: string; description: string }> | null {
    if (!responseText?.trim()) return null;

    const normalize = (arr: any[]) =>
      arr
        .filter((f: any) => f && typeof f.severity === 'string' && typeof f.description === 'string')
        .map((f: any) => ({
          severity: ['critical', 'major', 'minor', 'observation'].includes(String(f.severity).toLowerCase())
            ? String(f.severity).toLowerCase()
            : 'minor',
          location: f.location,
          description: String(f.description).trim(),
        }))
        .filter((f) => f.description.length > 0);

    // 1) Code block: ```json ... ``` or ```JSON ... ``` (flexible whitespace)
    const codeBlockMatch = responseText.match(/```(?:json|JSON)\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        const arr = parsed?.findings;
        if (Array.isArray(arr)) return normalize(arr);
      } catch {
        // continue to fallback
      }
    }

    // 2) Find a JSON object that contains "findings" (e.g. raw output without markdown)
    const findingsKey = '"findings"';
    const idx = responseText.indexOf(findingsKey);
    if (idx !== -1) {
      const before = responseText.substring(0, idx);
      const open = before.lastIndexOf('{');
      if (open !== -1) {
        let depth = 1;
        let i = open + 1;
        while (i < responseText.length && depth > 0) {
          const c = responseText[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          i++;
        }
        if (depth === 0) {
          try {
            const slice = responseText.substring(open, i);
            const parsed = JSON.parse(slice);
            const arr = parsed?.findings;
            if (Array.isArray(arr)) return normalize(arr);
          } catch {
            // continue
          }
        }
      }
    }

    return null;
  }

  async suggestPaperworkFindings(
    referenceText: string,
    underReviewText: string,
    referenceName?: string,
    underReviewName?: string,
    reviewScope?: string,
    attachedImages?: AttachedImage[],
    notes?: string,
    systemPrompt?: string
  ): Promise<Array<{ severity: string; location?: string; description: string }>> {
    if (!referenceText.trim() || !underReviewText.trim()) {
      return [];
    }

    const refLabel = referenceName || 'Reference';
    const underLabel = underReviewName || 'Under review';
    const scopeLine = reviewScope?.trim()
      ? `\n# REVIEW SCOPE\nFocus only on: ${reviewScope.trim()}\n`
      : '';
    const notesLine = notes?.trim()
      ? `\n# USER NOTES / FOCUS\nThe reviewer asked you to pay special attention to:\n${notes.trim()}\nUse this to guide what you compare and what findings you emphasize. If the notes ask a specific question (e.g. "compare section 5", "are training requirements aligned?"), answer it in your findings.\n`
      : '';
    const prompt = systemPrompt
      ? `${scopeLine}${notesLine}

# REFERENCE DOCUMENT (${refLabel})
${referenceText.substring(0, 50000)}

# DOCUMENT UNDER REVIEW (${underLabel})
${underReviewText.substring(0, 50000)}
${attachedImages?.length ? '\n\n# ATTACHED IMAGES\nOne or more images (e.g. photos of nameplates, logs, or document pages) are provided below. Use them to support or refine your comparison and findings where relevant.\n' : ''}

# OUTPUT FORMAT
Return only a single JSON object with a "findings" array, in a fenced code block:
\`\`\`json
{
  "findings": [
    {
      "severity": "major",
      "location": "Section 3.2",
      "description": "Missing calibration record requirement"
    },
    {
      "severity": "observation",
      "location": "Section 1",
      "description": "Scope and definitions were compared; no discrepancies."
    }
  ]
}
\`\`\``
      : `You are an aviation quality auditor comparing two documents: a known-good reference and a document under review.${scopeLine}${notesLine}

# REFERENCE DOCUMENT (${refLabel})
${referenceText.substring(0, 50000)}

# DOCUMENT UNDER REVIEW (${underLabel})
${underReviewText.substring(0, 50000)}
${attachedImages?.length ? '\n\n# ATTACHED IMAGES\nOne or more images (e.g. photos of nameplates, logs, or document pages) are provided below. Use them to support or refine your comparison and findings where relevant.\n' : ''}

# YOUR TASK
Compare the two documents and list specific findings: compliance gaps, missing requirements, wording errors, or inconsistencies. Be thorough and cite specific sections or requirements when possible.
- For each finding use: severity ("critical" | "major" | "minor" | "observation"), optional location (section/page), and a concise description.
- If the documents are largely compliant, still list 1–3 "observation" findings summarizing what you compared and any minor notes (e.g. "Section X matches reference; no gaps found").
- Always return at least one finding so the reviewer has a record of what was checked.
- If the user provided notes above, address what they asked (e.g. compare specific sections, answer a question, focus on a theme).

# OUTPUT FORMAT
Return only a single JSON object with a "findings" array, in a fenced code block:
\`\`\`json
{
  "findings": [
    {
      "severity": "major",
      "location": "Section 3.2",
      "description": "Missing calibration record requirement"
    },
    {
      "severity": "observation",
      "location": "Section 1",
      "description": "Scope and definitions were compared; no discrepancies."
    }
  ]
}
\`\`\``;

    const userContent = this.buildUserContent(prompt, attachedImages);
    const params = this.buildApiParams(4000, [{ role: 'user', content: userContent }], systemPrompt);
    const message = await createClaudeMessage(params);
    const responseText = this.extractTextContent(message);

    const parsed = this.parseFindingsFromResponse(responseText);
    return parsed ?? [];
  }

  /**
   * Compare multiple documents under review against the same reference in one call.
   * Returns findings per document plus cross-document findings (inconsistencies, comparisons).
   */
  async suggestPaperworkFindingsBatch(
    referenceText: string,
    underReviewDocs: Array<{ name: string; text: string }>,
    referenceNames: string,
    reviewScope?: string,
    notes?: string,
    attachedImages?: AttachedImage[],
    systemPrompt?: string
  ): Promise<{
    byDocument: Record<string, Array<{ severity: string; location?: string; description: string }>>;
    crossDocumentFindings: Array<{ severity: string; location?: string; description: string }>;
  }> {
    if (!referenceText.trim() || underReviewDocs.length === 0) {
      return { byDocument: {}, crossDocumentFindings: [] };
    }

    const scopeLine = reviewScope?.trim()
      ? `\n# REVIEW SCOPE\nFocus only on: ${reviewScope.trim()}\n`
      : '';
    const notesLine = notes?.trim()
      ? `\n# USER NOTES / FOCUS\nThe reviewer asked you to pay special attention to:\n${notes.trim()}\nUse this to guide your comparison and findings.\n`
      : '';

    const docsBlock = underReviewDocs
      .map(
        (d) =>
          `## DOCUMENT: ${d.name}\n${(d.text || '').substring(0, Math.floor(40000 / underReviewDocs.length))}`
      )
      .join('\n\n---\n\n');

    const batchTaskAndFormat = `# YOUR TASK
1. For each document under review, list findings comparing that document to the reference (compliance gaps, missing requirements, wording errors).
2. Add "crossDocumentFindings" for any findings that compare or contrast the documents with each other (e.g. "Document A requires X in Section 3, Document B omits it"; "Both documents align on training requirements but differ on record retention").
- Use severity: "critical" | "major" | "minor" | "observation".
- Include optional "location" (section/page) and a clear "description".
- If the user provided notes above, address what they asked across the documents.

# OUTPUT FORMAT
Return only a single JSON object with "byDocument" (object keyed by exact document name) and "crossDocumentFindings" (array), in a fenced code block:
\`\`\`json
{
  "byDocument": {
    "Exact Document Name 1": [
      { "severity": "major", "location": "Section 3", "description": "..." }
    ],
    "Exact Document Name 2": [ ... ]
  },
  "crossDocumentFindings": [
    { "severity": "observation", "location": "N/A", "description": "Document A and B both..." }
  ]
}
\`\`\`
Use the exact document names as given above for the "byDocument" keys.`;

    const prompt = systemPrompt
      ? `${scopeLine}${notesLine}

# REFERENCE DOCUMENT(S)
${referenceText.substring(0, 50000)}

# DOCUMENTS UNDER REVIEW (compare these to the reference and to each other)
${docsBlock}
${attachedImages?.length ? '\n\n# ATTACHED IMAGES\nUse any provided images to support your comparison where relevant.\n' : ''}

${batchTaskAndFormat}`
      : `You are an aviation quality auditor. You have one reference and ${underReviewDocs.length} document(s) under review. Compare all of them together so you can find per-document issues and also cross-document comparisons (e.g. inconsistencies between the documents, or how they each align with the reference).${scopeLine}${notesLine}

# REFERENCE DOCUMENT(S)
${referenceText.substring(0, 50000)}

# DOCUMENTS UNDER REVIEW (compare these to the reference and to each other)
${docsBlock}
${attachedImages?.length ? '\n\n# ATTACHED IMAGES\nUse any provided images to support your comparison where relevant.\n' : ''}

${batchTaskAndFormat}`;

    const userContent = this.buildUserContent(prompt, attachedImages);
    const params = this.buildApiParams(8000, [{ role: 'user', content: userContent }], systemPrompt);
    const message = await createClaudeMessage(params);
    const responseText = this.extractTextContent(message);

    const byDocument: Record<string, Array<{ severity: string; location?: string; description: string }>> = {};
    let crossDocumentFindings: Array<{ severity: string; location?: string; description: string }> = [];

    const codeBlockMatch = responseText.match(/```(?:json|JSON)\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        const normalize = (arr: any[]) =>
          (Array.isArray(arr) ? arr : [])
            .filter((f: any) => f && typeof f.severity === 'string' && typeof f.description === 'string')
            .map((f: any) => ({
              severity: ['critical', 'major', 'minor', 'observation'].includes(String(f.severity).toLowerCase())
                ? String(f.severity).toLowerCase()
                : 'minor',
              location: f.location,
              description: String(f.description).trim(),
            }))
            .filter((f) => f.description.length > 0);

        if (parsed.byDocument && typeof parsed.byDocument === 'object') {
          for (const [name, findings] of Object.entries(parsed.byDocument)) {
            byDocument[name] = normalize(findings as any[]);
          }
        }
        if (Array.isArray(parsed.crossDocumentFindings)) {
          crossDocumentFindings = normalize(parsed.crossDocumentFindings);
        }
      } catch {
        // fallback: leave byDocument empty, crossDocumentFindings empty
      }
    }

    return { byDocument, crossDocumentFindings };
  }
}
