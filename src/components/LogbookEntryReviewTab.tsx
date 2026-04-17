import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  FiSearch,
  FiAlertTriangle,
  FiLoader,
  FiCheckCircle,
} from 'react-icons/fi';
import {
  useLogbookEntries,
  useAddComplianceFindings,
  useUpdateLogbookEntry,
} from '../hooks/useConvexData';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import type {
  AircraftAsset,
  LogbookEntry,
} from '../types/logbook';

interface SmartReviewFinding {
  severity: 'critical' | 'major' | 'advisory';
  category: 'missing_field' | 'inadequate_description' | 'signoff_deficiency' | 'regulatory_gap' | 'best_practice';
  field?: string;
  citation: string;
  issue: string;
  suggestedText?: string;
}

interface SmartReviewResult {
  overallCompliance: 'compliant' | 'minor_issues' | 'major_issues' | 'non_compliant';
  complianceScore: number;
  findings: SmartReviewFinding[];
  suggestedWorkPerformed?: string;
  suggestedRts?: string;
  regulatoryFramework: 'FAA' | 'EASA';
}

function buildEntryReviewPrompt(entry: LogbookEntry, aircraft?: AircraftAsset): { system: string; user: string } {
  const isFaa = !entry.regulatoryBasis || entry.regulatoryBasis === 'FAA' || entry.regulatoryBasis === '14 CFR';
  const entryType = entry.entryType ?? 'maintenance';

  let typeSpecificRules = '';
  if (isFaa) {
    if (entryType === 'inspection') {
      const iType = (entry as any).inspectionType ?? '';
      if (iType === 'annual') {
        typeSpecificRules = `
ANNUAL INSPECTION SPECIFIC (14 CFR 43.15, 91.409(a)):
- Must reference the manufacturer's maintenance manual or equivalent FAA-approved data as the inspection basis
- Entry must indicate it was an annual inspection (not just "inspection")
- Requires the IA (Inspection Authorization) holder's signature, cert number, and IA certificate type
- 91.409(a): aircraft may not be operated unless it has been inspected within preceding 12 calendar months
- Total time in service is required per 43.11(a)(1)`;
      } else if (iType === '100_hour') {
        typeSpecificRules = `
100-HOUR INSPECTION SPECIFIC (14 CFR 91.409(b)):
- Required for aircraft used for hire or flight instruction
- Must reference inspection basis (manufacturer's maintenance manual or equivalent)
- A&P mechanic may perform (IA not required unlike annual)
- Total time in service required per 43.11(a)(1)`;
      } else {
        typeSpecificRules = `
INSPECTION SPECIFIC (14 CFR 43.11):
- 43.11(a)(1): total time in service of airframe, engines, propellers, and appliances
- 43.11(a)(2): current status of applicable ADs
- 43.11(a)(3): the date the work was approved for return to service
- 43.11(b): list of discrepancies and unairworthy items not corrected (if any)`;
      }
    } else if (entryType === 'ad_compliance') {
      typeSpecificRules = `
AD COMPLIANCE SPECIFIC:
- Must include the specific AD number (e.g., "AD 2021-15-10")
- Must state the AD effective date
- Must state the method of compliance (e.g., "per AD paragraph (c)(1)")
- Must indicate terminating action or recurrent interval if applicable
- Must include parts replaced, part numbers, and serial numbers if components were changed
- Reference AC 43-9 for acceptable AD compliance entries`;
    } else if (entryType === 'alteration') {
      typeSpecificRules = `
MAJOR ALTERATION SPECIFIC (14 CFR 43.9(c), Part 43 Appendix A):
- Major alterations require FAA Form 337 in addition to the logbook entry
- Entry must reference the Form 337 by date
- Must specify the data (STC, AML, FAA-approved data) authorizing the alteration
- Minor alterations: logbook entry alone is sufficient per 43.9`;
    }
  } else {
    typeSpecificRules = `
EASA SPECIFIC REQUIREMENTS:
- Part-M M.A.305(a): maintenance records must be kept for 2 years after aircraft is permanently withdrawn
- Part-M M.A.305(b): the aircraft technical log must record: current aircraft flight hours, date of last overhaul, hrs/cycles since last overhaul
- Part-145.A.50: certifying staff must sign CRS (Certificate of Release to Service) before flight
- AMC M.A.305: work order reference must be included where applicable
- EASA Form 1 may be required for component work`;
  }

  const faaCore = isFaa ? `
You are an FAA aviation maintenance records compliance expert. Review the logbook entry against:

14 CFR 43.9(a) — CONTENT REQUIREMENTS (exact regulatory text):
Each person who maintains, rebuilds, or alters an aircraft, airframe, aircraft engine, propeller, appliance, or component part shall make an entry in the maintenance record of that equipment containing the following information:
(1) A description (or reference to data acceptable to the Administrator) of work performed;
(2) The date of completion of the work performed;
(3) The name of the person performing the work (if other than the person specified in paragraph (a)(4) of this section);
(4) If the work performed on the aircraft, airframe, aircraft engine, propeller, appliance, or component part has been approved for return to service, the signature, the certificate number, and kind of certificate held by the person approving the work.

14 CFR 43.13(a): Each person performing maintenance, alteration, or preventive maintenance on an aircraft, engine, propeller, or appliance shall use the methods, techniques, and practices prescribed in the current manufacturer's maintenance manual or Instructions for Continued Airworthiness (ICA) or other methods, techniques, and practices acceptable to the Administrator.

Return-to-service statement (43.9(a)(4)): The entry should include or reference the RTS authorization. A bare signature without "approved for return to service" language is technically deficient.
${typeSpecificRules}` : `
You are an EASA aviation maintenance records compliance expert. Review the entry against EASA Part-M M.A.305 and Part-145.A.50 record-keeping requirements.
${typeSpecificRules}`;

  const system = `${faaCore}

SEVERITY DEFINITIONS:
- critical: Entry is legally invalid or aircraft would be unairworthy without correction (e.g., missing signature, no RTS)
- major: Significant gap that may affect traceability or regulatory defensibility (e.g., no cert number, vague work description)
- advisory: Best practice improvement that strengthens the record but does not invalidate it

Respond ONLY with valid JSON in this exact schema:
{
  "overallCompliance": "compliant"|"minor_issues"|"major_issues"|"non_compliant",
  "complianceScore": <0-100 integer>,
  "findings": [
    {
      "severity": "critical"|"major"|"advisory",
      "category": "missing_field"|"inadequate_description"|"signoff_deficiency"|"regulatory_gap"|"best_practice",
      "field": "<field name if applicable>",
      "citation": "<exact CFR/AMC citation>",
      "issue": "<concise description of the problem>",
      "suggestedText": "<improved text if applicable>"
    }
  ],
  "suggestedWorkPerformed": "<complete rewrite of work performed description if needed, otherwise omit>",
  "suggestedRts": "<return-to-service language if missing/inadequate, otherwise omit>",
  "regulatoryFramework": "FAA"|"EASA"
}`;

  const aircraftCtx = aircraft
    ? `Aircraft: ${aircraft.tailNumber}${aircraft.make ? ` ${aircraft.make}` : ''}${aircraft.model ? ` ${aircraft.model}` : ''}${aircraft.year ? ` (${aircraft.year})` : ''}\n`
    : '';

  const user = `${aircraftCtx}Review this maintenance logbook entry for regulatory compliance:\n\n${JSON.stringify({
    entryDate: entry.entryDate,
    entryType: entry.entryType,
    inspectionType: (entry as any).inspectionType,
    workPerformed: entry.workPerformed,
    signerName: entry.signerName,
    signerCertType: entry.signerCertType,
    signerCertNumber: entry.signerCertNumber,
    totalTimeAtEntry: entry.totalTimeAtEntry,
    returnToServiceStatement: entry.returnToServiceStatement,
    hasReturnToService: entry.hasReturnToService,
    regulatoryBasis: entry.regulatoryBasis,
    adReferences: entry.adReferences,
    ataChapter: entry.ataChapter,
    rawText: entry.rawText?.slice(0, 600),
  }, null, 2)}`;

  return { system, user };
}

export default function LogbookEntryReviewTab({
  projectId,
  aircraftId,
  aircraft,
}: {
  projectId: string;
  aircraftId: string;
  aircraft?: AircraftAsset;
}) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const addFindings = useAddComplianceFindings();
  const updateEntry = useUpdateLogbookEntry();

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [reviewCache, setReviewCache] = useState<Map<string, SmartReviewResult>>(new Map());
  const [reviewing, setReviewing] = useState(false);
  const [savingFindings, setSavingFindings] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const filteredEntries = useMemo(() => {
    const q = searchFilter.toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.entryDate ?? '').includes(q) ||
      (e.workPerformed ?? '').toLowerCase().includes(q) ||
      (e.entryType ?? '').includes(q)
    );
  }, [entries, searchFilter]);

  const selectedEntry = entries.find((e) => e._id === selectedEntryId) ?? null;
  const cachedResult = selectedEntryId ? reviewCache.get(selectedEntryId) ?? null : null;

  const runReview = async () => {
    if (!selectedEntry) return;
    setReviewing(true);
    const { system, user } = buildEntryReviewPrompt(selectedEntry, aircraft);
    try {
      const resp = await createClaudeMessage({
        model: DEFAULT_CLAUDE_MODEL,
        max_tokens: 3000,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = (resp.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const result: SmartReviewResult = JSON.parse(match[0]);
        setReviewCache((prev) => new Map(prev).set(selectedEntry._id, result));
      } else {
        toast.error('Could not parse review response');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Review failed');
    } finally {
      setReviewing(false);
    }
  };

  const saveAsFindings = async () => {
    if (!selectedEntry || !cachedResult) return;
    setSavingFindings(true);
    try {
      const findingsToSave = cachedResult.findings
        .filter((f) => f.severity !== 'advisory')
        .map((f) => ({
          projectId: projectId as any,
          aircraftId: aircraftId as any,
          logbookEntryId: selectedEntry._id as any,
          ruleId: f.citation,
          findingType: (f.category === 'missing_field' ? 'missing_field'
            : f.category === 'signoff_deficiency' ? 'incomplete_signoff'
            : 'missing_field') as any,
          severity: (f.severity === 'critical' ? 'critical' : f.severity === 'major' ? 'major' : 'minor') as any,
          title: f.issue.slice(0, 80),
          description: f.issue,
          citation: f.citation,
          evidenceSnippet: f.suggestedText,
          status: 'open' as const,
        }));
      await addFindings({ findings: findingsToSave } as any);
      toast.success(`Saved ${findingsToSave.length} finding${findingsToSave.length !== 1 ? 's' : ''} to Compliance tab`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save findings');
    } finally {
      setSavingFindings(false);
    }
  };

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-green-700 bg-green-100 border-green-200'
    : score >= 50 ? 'text-amber-700 bg-amber-100 border-amber-200'
    : 'text-red-700 bg-red-100 border-red-200';

  const overallLabel: Record<SmartReviewResult['overallCompliance'], string> = {
    compliant: 'Compliant',
    minor_issues: 'Minor Issues',
    major_issues: 'Major Issues',
    non_compliant: 'Non-Compliant',
  };

  const severityColors: Record<SmartReviewFinding['severity'], string> = {
    critical: 'border-red-300 bg-red-50',
    major: 'border-amber-300 bg-amber-50',
    advisory: 'border-sky-200 bg-sky-50',
  };

  const severityBadge: Record<SmartReviewFinding['severity'], string> = {
    critical: 'bg-red-100 text-red-800',
    major: 'bg-orange-100 text-orange-800',
    advisory: 'bg-sky-100 text-sky-800',
  };

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left: Entry List */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-2">
        <div className="relative">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs" />
          <input
            type="text"
            placeholder="Filter entries..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded border border-amber-300 bg-[#fffaf0] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {filteredEntries.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-6">No entries found</p>
          )}
          {filteredEntries.map((entry) => {
            const cached = reviewCache.get(entry._id);
            const isSelected = selectedEntryId === entry._id;
            return (
              <button
                key={entry._id}
                type="button"
                onClick={() => setSelectedEntryId(entry._id)}
                className={`w-full text-left px-2.5 py-2 rounded border text-xs transition-colors ${
                  isSelected
                    ? 'border-amber-400 bg-[#fffaf0] shadow-sm'
                    : 'border-transparent hover:border-amber-200 hover:bg-amber-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-stone-800 truncate">{entry.entryDate ?? 'No date'}</span>
                  {cached && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${scoreColor(cached.complianceScore)}`}>
                      {cached.complianceScore}
                    </span>
                  )}
                </div>
                {entry.entryType && (
                  <span className="text-[10px] text-stone-500 capitalize">{entry.entryType.replace(/_/g, ' ')}</span>
                )}
                <p className="text-[10px] text-stone-400 truncate mt-0.5">{entry.workPerformed?.slice(0, 50) ?? ''}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Review Panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedEntry ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-stone-400">Select an entry to review</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Entry header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-stone-800 font-['Source_Serif_4',serif]">
                  {selectedEntry.entryDate ?? 'No date'} · {selectedEntry.entryType?.replace(/_/g, ' ') ?? 'maintenance'}
                </p>
                {aircraft && (
                  <p className="text-xs text-stone-500">
                    {aircraft.tailNumber}{aircraft.make ? ` · ${aircraft.make}` : ''}{aircraft.model ? ` ${aircraft.model}` : ''}
                  </p>
                )}
                <p className="text-xs text-stone-400 mt-0.5">
                  Framework: {cachedResult?.regulatoryFramework ?? (selectedEntry.regulatoryBasis || 'FAA')} Part 43
                </p>
              </div>
              <button
                type="button"
                onClick={runReview}
                disabled={reviewing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 text-white rounded hover:bg-stone-900 disabled:opacity-50 transition-colors"
              >
                {reviewing ? <FiLoader className="animate-spin text-xs" /> : <FiCheckCircle className="text-xs" />}
                {reviewing ? 'Reviewing...' : cachedResult ? 'Re-review' : 'Review Entry'}
              </button>
            </div>

            {cachedResult ? (
              <div className="space-y-3">
                {/* Score */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1 rounded border text-sm font-semibold ${scoreColor(cachedResult.complianceScore)}`}>
                    Score: {cachedResult.complianceScore}/100
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    cachedResult.overallCompliance === 'compliant' ? 'bg-green-100 text-green-800'
                    : cachedResult.overallCompliance === 'minor_issues' ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                    {overallLabel[cachedResult.overallCompliance]}
                  </span>
                </div>

                {/* Findings */}
                {cachedResult.findings.length === 0 ? (
                  <div className="rounded border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
                    No compliance issues found. Entry appears complete and well-documented.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cachedResult.findings.map((f, i) => (
                      <div key={i} className={`rounded border px-3 py-2.5 space-y-1.5 ${severityColors[f.severity]}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${severityBadge[f.severity]}`}>
                            {f.severity}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">{f.citation}</span>
                          {f.field && <span className="text-[10px] text-stone-500">· {f.field}</span>}
                        </div>
                        <p className="text-xs text-stone-800">{f.issue}</p>
                        {f.suggestedText && (
                          <div className="rounded border border-sky-200 bg-white px-2 py-1.5 space-y-1">
                            <p className="text-[10px] text-sky-700 font-semibold uppercase">Suggested text</p>
                            <p className="text-xs text-stone-700 font-mono whitespace-pre-wrap">{f.suggestedText}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Apply suggestions */}
                {(cachedResult.suggestedWorkPerformed || cachedResult.suggestedRts) && (
                  <div className="space-y-2">
                    {cachedResult.suggestedWorkPerformed && (
                      <div className="rounded border border-stone-200 bg-white px-3 py-2.5 space-y-2">
                        <p className="text-xs font-semibold text-stone-700">Suggested Work Description</p>
                        <p className="text-xs text-stone-600 font-mono whitespace-pre-wrap bg-stone-50 rounded px-2 py-1.5">
                          {cachedResult.suggestedWorkPerformed}
                        </p>
                        <button
                          type="button"
                          onClick={() => updateEntry({ entryId: selectedEntry._id as any, workPerformed: cachedResult.suggestedWorkPerformed }).then(() => toast.success('Work description updated'))}
                          className="text-xs px-2.5 py-1 bg-stone-800 text-white rounded hover:bg-stone-900"
                        >
                          Apply to entry
                        </button>
                      </div>
                    )}
                    {cachedResult.suggestedRts && (
                      <div className="rounded border border-stone-200 bg-white px-3 py-2.5 space-y-2">
                        <p className="text-xs font-semibold text-stone-700">Suggested Return-to-Service Statement</p>
                        <p className="text-xs text-stone-600 font-mono whitespace-pre-wrap bg-stone-50 rounded px-2 py-1.5">
                          {cachedResult.suggestedRts}
                        </p>
                        <button
                          type="button"
                          onClick={() => updateEntry({ entryId: selectedEntry._id as any, returnToServiceStatement: cachedResult.suggestedRts }).then(() => toast.success('RTS statement updated'))}
                          className="text-xs px-2.5 py-1 bg-stone-800 text-white rounded hover:bg-stone-900"
                        >
                          Apply to entry
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Save to Compliance Findings */}
                {cachedResult.findings.some((f) => f.severity !== 'advisory') && (
                  <button
                    type="button"
                    onClick={saveAsFindings}
                    disabled={savingFindings}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-400 text-amber-800 rounded hover:bg-amber-50 disabled:opacity-50 transition-colors"
                  >
                    {savingFindings ? <FiLoader className="animate-spin text-xs" /> : <FiAlertTriangle className="text-xs" />}
                    {savingFindings ? 'Saving...' : 'Save as Compliance Findings'}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded border border-amber-200 bg-amber-50/50 px-3 py-4 text-center space-y-2">
                <p className="text-sm text-stone-600">
                  Click <strong>Review Entry</strong> to run a detailed compliance check against{' '}
                  {selectedEntry.regulatoryBasis === 'EASA' ? 'EASA Part-M / Part-145' : '14 CFR Part 43'} requirements.
                </p>
                <p className="text-xs text-stone-400">
                  Checks for missing required fields, inadequate descriptions, signoff deficiencies, and specific regulatory gaps.
                  Results include severity-coded findings, exact CFR citations, and suggested corrective text.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
