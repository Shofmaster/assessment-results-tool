import { useState, useEffect, useRef } from 'react';
import { FiPlay, FiDownload, FiCheckCircle, FiCloud, FiSend } from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { ClaudeAnalyzer, type DocWithOptionalText } from '../services/claudeApi';
import { PDFReportGenerator } from '../services/pdfGenerator';
import {
  useAssessments,
  useDocuments,
  useAnalyses,
  useAnalysis,
  useAddAnalysis,
  useUserSettings,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { downloadAssessmentJson } from '../utils/exportAssessment';
import { Button, GlassCard, Select, Input, Badge } from './ui';

export default function AnalysisView() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [localAnalysis, setLocalAnalysis] = useState<any | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const isAnalyzing = useAppStore((state) => state.isAnalyzing);
  const setIsAnalyzing = useAppStore((state) => state.setIsAnalyzing);

  const settings = useUserSettings();
  const thinkingEnabled = settings?.thinkingEnabled ?? false;
  const thinkingBudget = settings?.thinkingBudget ?? 10000;

  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const analyses = (useAnalyses(activeProjectId || undefined) || []) as any[];
  const addAnalysis = useAddAnalysis();

  const uploadedWithText = uploadedDocuments.filter((d: any) => (d.extractedText || '').length > 0);
  const regulatoryDocs = regulatoryFiles.map((f: any) => ({
    name: f.name,
    ...(f.extractedText ? { text: f.extractedText } : {}),
  }));
  const entityDocs = entityDocuments.map((d: any) => ({
    name: d.name,
    ...(d.extractedText ? { text: d.extractedText } : {}),
  }));
  const smsDocs = smsDocuments.map((d: any) => ({
    name: d.name,
    ...(d.extractedText ? { text: d.extractedText } : {}),
  }));
  const latestAnalysisSummary = analyses.length > 0
    ? analyses.slice().sort((a: any, b: any) => (a.analysisDate > b.analysisDate ? 1 : -1)).slice(-1)[0]
    : null;
  const currentAnalysisId = localAnalysis?._id ?? latestAnalysisSummary?._id;
  const fullAnalysis = useAnalysis(currentAnalysisId ?? undefined);
  const currentAnalysis = localAnalysis ?? fullAnalysis ?? null;

  // Pre-fill customer email when analysis loads
  const currentAssessment = currentAnalysis
    ? assessments.find((a: any) => a._id === currentAnalysis.assessmentId)
    : null;
  useEffect(() => {
    const assessment = currentAnalysis
      ? assessments.find((a: any) => a._id === currentAnalysis.assessmentId)
      : null;
    setCustomerEmail(assessment?.data?.contactEmail || '');
    setCustomerMessage('');
  }, [currentAnalysis?.assessmentId, assessments]);

  const handleSendToCustomer = () => {
    const email = customerEmail.trim();
    if (!email) {
      toast.warning('Please enter a customer email address');
      return;
    }
    const subject = encodeURIComponent(`Aviation Quality Audit Report - ${currentAnalysis?.companyName || 'Compliance Assessment'}`);
    const findingsSummary = currentAnalysis?.findings
      ?.slice(0, 5)
      .map((f: any) => `• ${f.severity}: ${f.title}`)
      .join('\n') || '';
    const bodyParts = [
      `Dear ${currentAssessment?.data?.contactName || 'Customer'},`,
      '',
      'Please find attached the Aviation Quality compliance assessment report.',
      customerMessage.trim() ? `\n${customerMessage.trim()}\n` : '',
      'Summary of key findings:',
      findingsSummary || '(See attached report for details)',
      '',
      'Recommend exporting the full PDF report and attaching it to this email.',
    ];
    const body = encodeURIComponent(bodyParts.join('\n'));
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleAnalyze = async () => {
    if (!activeProjectId) return;
    if (!selectedAssessment) {
      toast.warning('Please select an assessment to analyze');
      return;
    }

    const assessment = assessments.find((a: any) => a._id === selectedAssessment);
    if (!assessment) return;

    setIsAnalyzing(true);

    try {
      const analyzer = new ClaudeAnalyzer(
        thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined
      );

      let result: any;
      if (uploadedWithText.length > 0) {
        result = await analyzer.analyzeWithDocuments(
          assessment.data,
          regulatoryDocs,
          entityDocs,
          uploadedWithText.map((d: any) => ({ name: d.name, text: d.extractedText || '' })),
          smsDocs
        );
      } else {
        const base = await analyzer.analyzeAssessment(
          assessment.data,
          regulatoryDocs,
          entityDocs,
          smsDocs
        );
        result = {
          assessmentId: assessment._id,
          companyName: assessment.data.companyName,
          analysisDate: new Date().toISOString(),
          findings: base.findings,
          recommendations: base.recommendations,
          compliance: base.compliance,
        };
      }

      const analysisRecord = {
        ...result,
        assessmentId: assessment._id,
      };

      await addAnalysis({
        projectId: activeProjectId as any,
        assessmentId: analysisRecord.assessmentId,
        companyName: analysisRecord.companyName,
        analysisDate: analysisRecord.analysisDate,
        findings: analysisRecord.findings,
        recommendations: analysisRecord.recommendations,
        compliance: analysisRecord.compliance,
        documentAnalyses: analysisRecord.documentAnalyses,
        combinedInsights: analysisRecord.combinedInsights,
      });

      setLocalAnalysis(analysisRecord);
    } catch (error: any) {
      toast.error('Analysis failed', { description: error.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!currentAnalysis) return;
    const assessment = assessments.find((a: any) => a._id === currentAnalysis.assessmentId);
    if (!assessment) return;

    try {
      const generator = new PDFReportGenerator();
      const pdfBytes = await generator.generateReport(
        assessment.data,
        currentAnalysis.findings,
        currentAnalysis.recommendations,
        currentAnalysis.compliance
      );

      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${assessment.data.companyName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error('PDF export failed', { description: error.message });
    }
  };

  const handleExportAssessmentJson = () => {
    const assessment = currentAnalysis
      ? assessments.find((a: any) => a._id === currentAnalysis.assessmentId)
      : selectedAssessment
        ? assessments.find((a: any) => a._id === selectedAssessment)
        : null;
    if (!assessment?.data) {
      toast.warning('Select an assessment to export');
      return;
    }
    downloadAssessmentJson(assessment.data, { companyName: assessment.data.companyName });
    toast.success('Assessment exported to your downloads');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'from-red-500 to-red-600';
      case 'major':
        return 'from-amber-500 to-amber-600';
      case 'minor':
        return 'from-sky to-sky-light';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '!';
      case 'major':
        return '!!';
      case 'minor':
        return 'i';
      default:
        return '-';
    }
  };

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Compliance Analysis
        </h1>
        <p className="text-white/60 text-lg">
          AI-powered assessment analysis with Claude
        </p>
      </div>

      {!currentAnalysis && (
        <GlassCard className="mb-6">
          <h2 className="text-xl font-display font-bold mb-4">Run Analysis</h2>

          <div className="space-y-4">
            <Select
              label="Select Assessment"
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              disabled={isAnalyzing}
            >
              <option value="" className="bg-navy-800">
                Choose an assessment...
              </option>
              {assessments.map((assessment: any) => (
                <option key={assessment._id} value={assessment._id} className="bg-navy-800">
                  {assessment.data.companyName} - {new Date(assessment.importedAt).toLocaleDateString()}
                </option>
              ))}
            </Select>

            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
              <FiCheckCircle className="text-2xl text-green-400" />
              <div className="flex-1">
                <div className="font-medium">{regulatoryFiles.length} Regulatory Files</div>
                <div className="text-sm text-white/60">
                  {entityDocuments.length} Entity · {smsDocuments.length} SMS Data
                </div>
              </div>
            </div>

            {uploadedWithText.length > 0 && (
              <div className="flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <FiCloud className="text-2xl text-green-400" />
                <div className="flex-1">
                  <div className="font-medium text-green-400">
                    {uploadedWithText.length} Uploaded Document{uploadedWithText.length > 1 ? 's' : ''} with extracted content
                  </div>
                  <div className="text-sm text-white/60">
                    Document content will be included in the analysis
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                fullWidth
                onClick={handleAnalyze}
                disabled={isAnalyzing || !selectedAssessment}
                loading={isAnalyzing}
                icon={!isAnalyzing ? <FiPlay /> : undefined}
                className="py-4"
              >
                {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={handleExportAssessmentJson}
                disabled={!selectedAssessment}
                icon={<FiDownload />}
                className="sm:w-auto"
              >
                Export assessment (JSON)
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {currentAnalysis && (
        <>
          <GlassCard className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-display font-bold truncate">{currentAnalysis.companyName}</h2>
                <p className="text-white/60">
                  Analyzed on {new Date(currentAnalysis.analysisDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button
                  variant="success"
                  size="lg"
                  onClick={handleExportPDF}
                  icon={<FiDownload />}
                  className="w-full sm:w-auto"
                >
                  Export PDF
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleExportAssessmentJson}
                  icon={<FiDownload />}
                  className="w-full sm:w-auto"
                >
                  Export assessment (JSON)
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setLocalAnalysis(null)}
                  className="w-full sm:w-auto"
                >
                  New Analysis
                </Button>
              </div>
            </div>

            {/* Send to Customer */}
            <GlassCard className="mb-6 border border-sky/20">
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <FiSend className="text-sky-light" />
                Send Results to Customer
              </h2>
              <p className="text-white/60 text-sm mb-4">
                Prepare an email to share the audit report. Export the PDF first, then attach it when your email client opens.
              </p>
              <div className="space-y-4">
                <Input
                  label="Customer email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
                <div>
                  <label className="block text-sm font-medium mb-2 text-white/80">Optional message</label>
                  <textarea
                    value={customerMessage}
                    onChange={(e) => setCustomerMessage(e.target.value)}
                    placeholder="Add a personal note to include in the email..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors resize-none"
                  />
                </div>
                <Button
                  size="lg"
                  onClick={handleSendToCustomer}
                  disabled={!customerEmail.trim()}
                  icon={<FiSend />}
                >
                  Open Email Client
                </Button>
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-1 text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl sm:text-4xl font-bold mb-1">{currentAnalysis.compliance.overall}%</div>
                <div className="text-white/60 text-sm">Overall Compliance</div>
              </div>
              <div className="text-center p-4 bg-red-500/10 rounded-xl">
                <div className="text-3xl font-bold text-red-400 mb-1">
                  {currentAnalysis.compliance.criticalGaps}
                </div>
                <div className="text-white/60 text-sm">Critical Findings</div>
              </div>
              <div className="text-center p-4 bg-amber-500/10 rounded-xl">
                <div className="text-3xl font-bold text-amber-400 mb-1">
                  {currentAnalysis.compliance.majorGaps}
                </div>
                <div className="text-white/60 text-sm">Major Findings</div>
              </div>
              <div className="text-center p-4 bg-sky/10 rounded-xl">
                <div className="text-3xl font-bold text-sky-light mb-1">
                  {currentAnalysis.compliance.minorGaps}
                </div>
                <div className="text-white/60 text-sm">Minor Findings</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="mb-6">
            <h2 className="text-xl font-display font-bold mb-4">Findings</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {currentAnalysis.findings.map((finding: any) => (
                <div
                  key={finding.id}
                  className="p-5 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getSeverityColor(finding.severity)} flex items-center justify-center text-2xl flex-shrink-0`}
                    >
                      {getSeverityIcon(finding.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-bold text-lg">{finding.title}</h3>
                        <Badge size="lg" pill>
                          {finding.severity}
                        </Badge>
                      </div>
                      <p className="text-white/80 mb-3">{finding.description}</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-2">
                          <span className="text-white/60">Regulation:</span>
                          <span className="font-mono text-sky-light">{finding.regulation}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-white/60">Requirement:</span>
                          <span className="text-white/80">{finding.requirement}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {currentAnalysis.combinedInsights && currentAnalysis.combinedInsights.length > 0 && (
            <GlassCard className="mb-6">
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <FiCloud className="text-green-400" />
                Document Insights
              </h2>
              <div className="space-y-3">
                {currentAnalysis.combinedInsights.map((insight: string, idx: number) => (
                  <div key={idx} className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-white/90">
                    {insight}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {currentAnalysis.documentAnalyses && currentAnalysis.documentAnalyses.length > 0 && (
            <GlassCard className="mb-6">
              <h2 className="text-xl font-display font-bold mb-4">Document Analysis Details</h2>
              <div className="space-y-4">
                {currentAnalysis.documentAnalyses.map((docAnalysis: any) => (
                  <div key={docAnalysis.documentId} className="p-5 bg-white/5 rounded-xl">
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                      <FiCloud className="text-green-400" />
                      {docAnalysis.documentName}
                    </h3>
                    {docAnalysis.keyFindings.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-white/60 mb-1">Key Findings</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.keyFindings.map((f: string, i: number) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {docAnalysis.complianceIssues.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-red-400/80 mb-1">Compliance Issues</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.complianceIssues.map((c: string, i: number) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {docAnalysis.recommendations.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-sky-light/80 mb-1">Recommendations</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard>
            <h2 className="text-xl font-display font-bold mb-4">Recommendations</h2>
            <div className="space-y-4">
              {currentAnalysis.recommendations.map((rec: any) => (
                <div
                  key={rec.id}
                  className="p-5 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
                      <FiCheckCircle className="text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold">{rec.area}</h3>
                        <Badge
                          variant={
                            rec.priority === 'high'
                              ? 'destructive'
                              : rec.priority === 'medium'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {rec.priority} priority
                        </Badge>
                      </div>
                      <p className="text-white/80 mb-3">{rec.recommendation}</p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <span className="text-white/60">Timeline: </span>
                          <span>{rec.timeline}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Impact: </span>
                          <span>{rec.expectedImpact}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
