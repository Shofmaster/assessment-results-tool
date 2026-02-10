import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ClaudeAnalyzer } from '../services/claudeApi';
import { PDFReportGenerator } from '../services/pdfGenerator';
import { FiPlay, FiDownload, FiCheckCircle, FiCloud } from 'react-icons/fi';

export default function AnalysisView() {
  const [selectedAssessment, setSelectedAssessment] = useState('');

  const assessments = useAppStore((state) => state.assessments);
  const regulatoryFiles = useAppStore((state) => state.regulatoryFiles);
  const entityDocuments = useAppStore((state) => state.entityDocuments);
  const uploadedDocuments = useAppStore((state) => state.uploadedDocuments);
  const currentAnalysis = useAppStore((state) => state.currentAnalysis);
  const isAnalyzing = useAppStore((state) => state.isAnalyzing);
  const setCurrentAnalysis = useAppStore((state) => state.setCurrentAnalysis);
  const setIsAnalyzing = useAppStore((state) => state.setIsAnalyzing);
  const thinkingEnabled = useAppStore((state) => state.thinkingEnabled);
  const thinkingBudget = useAppStore((state) => state.thinkingBudget);
  const uploadedWithText = uploadedDocuments.filter((d) => (d.text || '').length > 0);

  const handleAnalyze = async () => {
    if (!selectedAssessment) {
      alert('Please select an assessment to analyze');
      return;
    }

    const assessment = assessments.find((a) => a.id === selectedAssessment);
    if (!assessment) return;

    setIsAnalyzing(true);

    try {
      const analyzer = new ClaudeAnalyzer(
        thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined
      );

      if (uploadedWithText.length > 0) {
        const result = await analyzer.analyzeWithDocuments(
          assessment.data,
          regulatoryFiles.map((f) => f.name),
          entityDocuments.map((d) => d.name),
          uploadedWithText.map((d) => ({ name: d.name, text: d.text || '' }))
        );
        setCurrentAnalysis({
          ...result,
          assessmentId: assessment.id,
        });
      } else {
        const result = await analyzer.analyzeAssessment(
          assessment.data,
          regulatoryFiles.map((f) => f.name),
          entityDocuments.map((d) => d.name)
        );
        setCurrentAnalysis({
          assessmentId: assessment.id,
          companyName: assessment.data.companyName,
          analysisDate: new Date().toISOString(),
          findings: result.findings,
          recommendations: result.recommendations,
          compliance: result.compliance,
        });
      }
    } catch (error: any) {
      alert(`Analysis failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!currentAnalysis) return;

    const assessment = assessments.find((a) => a.id === currentAnalysis.assessmentId);
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
      alert(`PDF export failed: ${error.message}`);
    }
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
        return '🚨';
      case 'major':
        return '⚠️';
      case 'minor':
        return 'ℹ️';
      default:
        return '📋';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Compliance Analysis
        </h1>
        <p className="text-white/60 text-lg">
          AI-powered assessment analysis with Claude
        </p>
      </div>

      {/* Analysis Setup */}
      {!currentAnalysis && (
        <div className="glass rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-display font-bold mb-4">Run Analysis</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">
                Select Assessment
              </label>
              <select
                value={selectedAssessment}
                onChange={(e) => setSelectedAssessment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
                disabled={isAnalyzing}
              >
                <option value="" className="bg-navy-800">
                  Choose an assessment...
                </option>
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id} className="bg-navy-800">
                    {assessment.data.companyName} - {new Date(assessment.importedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
              <FiCheckCircle className="text-2xl text-green-400" />
              <div className="flex-1">
                <div className="font-medium">{regulatoryFiles.length} Regulatory Files</div>
                <div className="text-sm text-white/60">
                  {entityDocuments.length} Entity Documents
                </div>
              </div>
            </div>

            {uploadedDocuments.length > 0 && (
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

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !selectedAssessment}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FiPlay />
                  Start Analysis
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {currentAnalysis && (
        <>
          {/* Header */}
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-display font-bold">{currentAnalysis.companyName}</h2>
                <p className="text-white/60">
                  Analyzed on {new Date(currentAnalysis.analysisDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all"
                >
                  <FiDownload />
                  Export PDF
                </button>
                <button
                  onClick={() => setCurrentAnalysis(null)}
                  className="px-6 py-3 glass glass-hover rounded-xl font-semibold transition-all"
                >
                  New Analysis
                </button>
              </div>
            </div>

            {/* Compliance Score */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="col-span-1 text-center p-4 bg-white/5 rounded-xl">
                <div className="text-4xl font-bold mb-1">{currentAnalysis.compliance.overall}%</div>
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
          </div>

          {/* Findings */}
          <div className="glass rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-display font-bold mb-4">Findings</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {currentAnalysis.findings.map((finding) => (
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
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg">{finding.title}</h3>
                        <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-semibold uppercase">
                          {finding.severity}
                        </span>
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
          </div>

          {/* Combined Insights from Documents */}
          {currentAnalysis.combinedInsights && currentAnalysis.combinedInsights.length > 0 && (
            <div className="glass rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <FiCloud className="text-green-400" />
                Document Insights
              </h2>
              <div className="space-y-3">
                {currentAnalysis.combinedInsights.map((insight, idx) => (
                  <div key={idx} className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-white/90">
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Analyses */}
          {currentAnalysis.documentAnalyses && currentAnalysis.documentAnalyses.length > 0 && (
            <div className="glass rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-display font-bold mb-4">Document Analysis Details</h2>
              <div className="space-y-4">
                {currentAnalysis.documentAnalyses.map((docAnalysis) => (
                  <div key={docAnalysis.documentId} className="p-5 bg-white/5 rounded-xl">
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                      <FiCloud className="text-green-400" />
                      {docAnalysis.documentName}
                    </h3>
                    {docAnalysis.keyFindings.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-white/60 mb-1">Key Findings</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {docAnalysis.complianceIssues.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-red-400/80 mb-1">Compliance Issues</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.complianceIssues.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {docAnalysis.recommendations.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-sky-light/80 mb-1">Recommendations</div>
                        <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                          {docAnalysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-xl font-display font-bold mb-4">Recommendations</h2>
            <div className="space-y-4">
              {currentAnalysis.recommendations.map((rec) => (
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
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            rec.priority === 'high'
                              ? 'bg-red-500/20 text-red-400'
                              : rec.priority === 'medium'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-sky/20 text-sky-light'
                          }`}
                        >
                          {rec.priority} priority
                        </span>
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
          </div>
        </>
      )}
    </div>
  );
}
