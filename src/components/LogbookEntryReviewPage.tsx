/**
 * LogbookEntryReviewPage — standalone page for quick logbook entry compliance checks.
 *
 * Two modes:
 *   1. Text mode: paste or type logbook text → select any portion (or all) → review
 *   2. Image mode: upload a photo/scan → drag to select a region → review that crop
 *
 * No project required. Works as a self-contained snipping-style review tool.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FiUpload, FiX, FiLoader, FiAlertCircle, FiAlertTriangle, FiCheckCircle,
  FiImage, FiType, FiScissors, FiRefreshCw,
} from 'react-icons/fi';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';

// ── Result types ──────────────────────────────────────────────────────────────

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

// ── Prompt builders ───────────────────────────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `You are an expert aviation maintenance records auditor with deep knowledge of:
- 14 CFR Part 43 (Maintenance, Preventive Maintenance, Rebuilding, and Alteration)
- 14 CFR Part 91 (General Operating and Flight Rules — inspection requirements)
- EASA Part-M (Airworthiness — M.A.305 Aircraft continuing airworthiness record system)
- EASA Part-145 (Approved Maintenance Organisations — 145.A.50 Certification of maintenance)
- AC 43-9C (Maintenance Records — Airworthiness Inspectors Handbook)
- AC 43.13-1B / 2B (Acceptable Methods, Techniques, and Practices)

14 CFR 43.9(a) verbatim: "Each person who maintains, performs preventive maintenance, rebuilds, or alters an aircraft, airframe, aircraft engine, propeller, appliance, or component part shall make an entry in the maintenance record of that equipment containing the following information:
(1) A description (or reference to data acceptable to the Administrator) of work performed;
(2) The date of completion of the work performed;
(3) The name of the person performing the work (if other than the person specified in paragraph (a)(4) of this section); and
(4) If the work performed on the aircraft, airframe, aircraft engine, propeller, appliance, or component part has been approved for return to service, the signature, the certificate number, and kind of certificate held by the person approving the work, or the authorized representative of the certificated repair station approving the work."

14 CFR 43.11(a): Annual / 100-hour inspections require the following in the maintenance record:
- The type of inspection (annual, 100-hr, etc.)
- The date of the inspection and aircraft total time in service
- A certification statement — e.g. "I certify that this aircraft has been inspected in accordance with an annual/100-hour inspection and was found to be in airworthy condition"
- Signature, certificate number, and certificate type of the approving person

For AD compliance entries (14 CFR 39): The entry must include the AD number, amendment date, revision date, method of compliance, and whether the AD is recurring or terminating. If terminated, the entry should state "Terminated."

For major alterations/repairs (14 CFR 43.9(c)): FAA Form 337 is required. The maintenance record should reference the Form 337 and note the data used.

EASA (if applicable):
- M.A.305(a): Owner/operator must keep continuing airworthiness records including: component details, date, description of work, identity of maintenance organisation/certifying staff
- Part-145.A.50: A Certificate of Release to Service (CRS) must be issued after every maintenance task. The CRS must include: task ref, date, maintenance organisation approval number, and authorised person's signature + certification reference.

You respond ONLY with a JSON object (no markdown, no preamble) matching this exact schema:
{
  "overallCompliance": "compliant" | "minor_issues" | "major_issues" | "non_compliant",
  "complianceScore": <integer 0–100>,
  "regulatoryFramework": "FAA" | "EASA",
  "findings": [
    {
      "severity": "critical" | "major" | "advisory",
      "category": "missing_field" | "inadequate_description" | "signoff_deficiency" | "regulatory_gap" | "best_practice",
      "field": "<field name if applicable>",
      "citation": "<exact CFR/AC/EASA cite>",
      "issue": "<clear description of the problem>",
      "suggestedText": "<suggested replacement or addition — optional>"
    }
  ],
  "suggestedWorkPerformed": "<improved work description — optional>",
  "suggestedRts": "<improved return-to-service statement — optional>"
}

complianceScore guidelines:
100 = fully compliant, nothing missing
85–99 = advisory items only (best practice / minor style)
70–84 = minor issues (1–2 major findings)
50–69 = major issues (multiple major or 1 critical)
0–49 = non-compliant (critical field missing or entry invalid)`;

function buildTextReviewMessage(text: string): string {
  return `Review the following logbook entry text for regulatory compliance. Identify all deficiencies, missing required fields, and areas that do not meet 14 CFR Part 43 or EASA Part-M requirements. Be specific — quote the exact text where relevant.\n\n---\n${text}\n---\n\nRespond with the JSON review object only.`;
}

// ── Score / status helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (score >= 50) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function overallLabel(status: SmartReviewResult['overallCompliance']): { label: string; color: string } {
  switch (status) {
    case 'compliant':       return { label: 'Compliant',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    case 'minor_issues':    return { label: 'Minor Issues', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    case 'major_issues':    return { label: 'Major Issues', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    case 'non_compliant':   return { label: 'Non-Compliant', color: 'text-red-700 bg-red-50 border-red-200' };
  }
}

function severityIcon(severity: SmartReviewFinding['severity']) {
  if (severity === 'critical')  return <FiAlertCircle className="text-red-600 flex-shrink-0 mt-0.5" />;
  if (severity === 'major')     return <FiAlertTriangle className="text-orange-500 flex-shrink-0 mt-0.5" />;
  return <FiCheckCircle className="text-sky-500 flex-shrink-0 mt-0.5" />;
}

function severityBadge(severity: SmartReviewFinding['severity']): string {
  if (severity === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  if (severity === 'major')    return 'bg-orange-100 text-orange-700 border-orange-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function runReview(
  mode: 'text',
  payload: { text: string },
  model: string,
): Promise<SmartReviewResult>;
async function runReview(
  mode: 'image',
  payload: { base64: string; mediaType: string; hint?: string },
  model: string,
): Promise<SmartReviewResult>;
async function runReview(
  mode: 'text' | 'image',
  payload: { text?: string; base64?: string; mediaType?: string; hint?: string },
  model: string,
): Promise<SmartReviewResult> {
  const userContent =
    mode === 'text'
      ? buildTextReviewMessage(payload.text!)
      : [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: payload.mediaType as any, data: payload.base64! },
          },
          {
            type: 'text' as const,
            text: `Review the logbook entry shown in this image for regulatory compliance.${payload.hint ? ` Focus on: ${payload.hint}` : ''} Identify all deficiencies against 14 CFR Part 43 / EASA Part-M requirements. Respond with the JSON review object only.`,
          },
        ];

  const response = await createClaudeMessage({
    model,
    max_tokens: 3000,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent as any }],
  });

  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text || '')
    .join('');

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]) as SmartReviewResult;
}

// ── Canvas Image Selector ────────────────────────────────────────────────────

interface CanvasSelection { x: number; y: number; w: number; h: number }

function ImageSelector({
  onSelect,
  onClear,
}: {
  onSelect: (base64: string, mediaType: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [sel, setSel] = useState<CanvasSelection | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [mediaType, setMediaType] = useState<string>('image/jpeg');
  const [hasSelection, setHasSelection] = useState(false);

  // Redraw whenever image or selection changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl || !imgSize) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEl, 0, 0, imgSize.w, imgSize.h);
    if (sel && (sel.w !== 0 || sel.h !== 0)) {
      // Dim outside selection
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, imgSize.w, imgSize.h);
      const rx = Math.min(sel.x, sel.x + sel.w);
      const ry = Math.min(sel.y, sel.y + sel.h);
      const rw = Math.abs(sel.w);
      const rh = Math.abs(sel.h);
      ctx.drawImage(imgEl, rx, ry, rw, rh, rx, ry, rw, rh);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }, [imgEl, imgSize, sel]);

  const loadFile = (file: File) => {
    setMediaType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Fit to max 900px wide
        const maxW = 900;
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        canvas.width  = w;
        canvas.height = h;
        setImgSize({ w, h });
        setImgEl(img);
        setSel(null);
        setHasSelection(false);
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width  / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imgEl) return;
    const pos = getCanvasPos(e);
    dragStart.current = pos;
    setSel({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setDragging(true);
    setHasSelection(false);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStart.current) return;
    const pos = getCanvasPos(e);
    setSel({ x: dragStart.current.x, y: dragStart.current.y, w: pos.x - dragStart.current.x, h: pos.y - dragStart.current.y });
  };

  const onMouseUp = () => {
    setDragging(false);
    if (sel && (Math.abs(sel.w) > 10 || Math.abs(sel.h) > 10)) {
      setHasSelection(true);
    }
  };

  const extractAndReview = useCallback(() => {
    if (!canvasRef.current || !imgEl || !sel) return;
    const rx = Math.min(sel.x, sel.x + sel.w);
    const ry = Math.min(sel.y, sel.y + sel.h);
    const rw = Math.abs(sel.w);
    const rh = Math.abs(sel.h);
    if (rw < 5 || rh < 5) return;
    const crop = document.createElement('canvas');
    crop.width = rw;
    crop.height = rh;
    crop.getContext('2d')!.drawImage(imgEl, rx, ry, rw, rh, 0, 0, rw, rh);
    const base64 = crop.toDataURL(mediaType, 0.92).split(',')[1];
    onSelect(base64, mediaType);
  }, [sel, imgEl, mediaType, onSelect]);

  const reviewFull = useCallback(() => {
    if (!canvasRef.current || !imgEl || !imgSize) return;
    const full = document.createElement('canvas');
    full.width = imgSize.w;
    full.height = imgSize.h;
    full.getContext('2d')!.drawImage(imgEl, 0, 0, imgSize.w, imgSize.h);
    const base64 = full.toDataURL(mediaType, 0.92).split(',')[1];
    onSelect(base64, mediaType);
  }, [imgEl, imgSize, mediaType, onSelect]);

  const clearAll = () => {
    setImgEl(null);
    setImgSize(null);
    setSel(null);
    setHasSelection(false);
    if (fileRef.current) fileRef.current.value = '';
    onClear();
  };

  return (
    <div className="flex flex-col gap-3">
      {!imgEl ? (
        <label
          className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-stone-300 rounded-xl p-10 cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith('image/')) loadFile(f);
          }}
        >
          <FiUpload className="text-3xl text-stone-400" />
          <p className="text-sm text-stone-500 text-center">
            Drop a photo or scan here, or click to browse
          </p>
          <p className="text-xs text-stone-400">JPG · PNG · WebP · GIF</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
          />
        </label>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <FiScissors className="text-amber-500" />
            <span>Drag to select a specific entry, or review the full page</span>
            <button type="button" onClick={clearAll} className="ml-auto flex items-center gap-1 text-stone-400 hover:text-red-500 transition-colors">
              <FiX className="text-xs" /> Remove image
            </button>
          </div>
          <div className="overflow-auto rounded-xl border border-stone-200 bg-stone-50 max-h-[60vh]">
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              className="block max-w-full cursor-crosshair select-none"
              style={{ imageRendering: 'auto' }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={extractAndReview}
              disabled={!hasSelection}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FiScissors /> Review Selection
            </button>
            <button
              type="button"
              onClick={reviewFull}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-700 text-white hover:bg-stone-800 transition-colors"
            >
              <FiImage /> Review Full Page
            </button>
            {hasSelection && (
              <button type="button" onClick={() => { setSel(null); setHasSelection(false); }} className="text-xs text-stone-400 hover:text-stone-600">
                Clear selection
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Review Result Panel ───────────────────────────────────────────────────────

function ReviewResult({ result, onDismiss }: { result: SmartReviewResult; onDismiss: () => void }) {
  const overall = overallLabel(result.overallCompliance);
  const criticals = result.findings.filter(f => f.severity === 'critical');
  const majors    = result.findings.filter(f => f.severity === 'major');
  const advisories = result.findings.filter(f => f.severity === 'advisory');

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 bg-stone-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-bold px-2 py-1 rounded border ${overall.color}`}>
            {overall.label}
          </span>
          <span className={`text-xs font-bold px-2 py-1 rounded border ${scoreColor(result.complianceScore)}`}>
            Score {result.complianceScore}/100
          </span>
          <span className="text-xs text-stone-400">
            Framework: {result.regulatoryFramework} Part 43
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded"
          aria-label="Clear results"
        >
          <FiRefreshCw className="text-sm" />
        </button>
      </div>

      {result.findings.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-emerald-600 flex items-center justify-center gap-2">
          <FiCheckCircle /> No compliance issues found.
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {[...criticals, ...majors, ...advisories].map((f, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start gap-2">
                {severityIcon(f.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${severityBadge(f.severity)}`}>
                      {f.severity}
                    </span>
                    <span className="text-xs text-stone-500 font-mono">{f.citation}</span>
                    {f.field && <span className="text-xs text-stone-400">· {f.field}</span>}
                  </div>
                  <p className="text-sm text-stone-800">{f.issue}</p>
                  {f.suggestedText && (
                    <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-100">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Suggested</p>
                      <p className="text-xs text-stone-700 italic">{f.suggestedText}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suggested full-text improvements */}
      {(result.suggestedWorkPerformed || result.suggestedRts) && (
        <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 space-y-3">
          {result.suggestedWorkPerformed && (
            <div>
              <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Suggested Work Performed Text</p>
              <p className="text-xs text-stone-700 leading-relaxed">{result.suggestedWorkPerformed}</p>
            </div>
          )}
          {result.suggestedRts && (
            <div>
              <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Suggested Return-to-Service Statement</p>
              <p className="text-xs text-stone-700 leading-relaxed">{result.suggestedRts}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LogbookEntryReviewPage() {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<SmartReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mediaType: string } | null>(null);

  // Track text selection in textarea
  const handleTextSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    setSelectedText(sel);
  };

  const reviewText = async (textToReview: string) => {
    if (!textToReview.trim()) return;
    setReviewing(true);
    setResult(null);
    setError(null);
    try {
      const res = await runReview('text', { text: textToReview }, DEFAULT_CLAUDE_MODEL);
      setResult(res);
    } catch (e) {
      setError('Review failed. Please check your Claude API key in Settings and try again.');
    } finally {
      setReviewing(false);
    }
  };

  const reviewImage = async (base64: string, mediaType: string) => {
    setReviewing(true);
    setResult(null);
    setError(null);
    try {
      const res = await runReview('image', { base64, mediaType }, DEFAULT_CLAUDE_MODEL);
      setResult(res);
    } catch (e) {
      setError('Review failed. Please check your Claude API key in Settings and try again.');
    } finally {
      setReviewing(false);
    }
  };

  const handleImageSelect = (base64: string, mediaType: string) => {
    setImagePayload({ base64, mediaType });
    reviewImage(base64, mediaType);
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#faf8f5]">
      {/* Page header */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-stone-200 bg-white">
        <h1 className="text-xl font-bold text-stone-800 font-['Source_Serif_4',serif]">Entry Review</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Paste logbook text and select any entry to check compliance, or upload a photo to review a specific region.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
        {/* Mode switcher */}
        <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-fit">
          {(['text', 'image'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); reset(); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {m === 'text' ? <FiType /> : <FiImage />}
              {m === 'text' ? 'Text' : 'Image'}
            </button>
          ))}
        </div>

        {/* ── TEXT MODE ── */}
        {mode === 'text' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm">
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 border-b border-stone-100 text-xs text-stone-400">
                <FiScissors className="text-amber-400" />
                <span>Paste logbook text below — then <strong className="text-stone-600">select any portion</strong> and click "Review Selection", or click "Review All"</span>
              </div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => { setText(e.target.value); setSelectedText(''); }}
                onSelect={handleTextSelect}
                onMouseUp={handleTextSelect}
                onKeyUp={handleTextSelect}
                placeholder={`Paste logbook entry text here...\n\nExample:\n09/15/2024 – Performed 100-hour inspection per 14 CFR 91.409(b). Aircraft total time: 1,450.3 hrs. Inspected and found airworthy. Signed: John Smith`}
                className="w-full min-h-[220px] resize-y p-4 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none font-mono leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={!selectedText || reviewing}
                onClick={() => reviewText(selectedText)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {reviewing ? <FiLoader className="animate-spin" /> : <FiScissors />}
                {selectedText ? `Review Selection (${selectedText.length} chars)` : 'Review Selection'}
              </button>
              <button
                type="button"
                disabled={!text.trim() || reviewing}
                onClick={() => reviewText(text)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-white hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {reviewing ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}
                Review All
              </button>
              {text && (
                <button type="button" onClick={() => { setText(''); setSelectedText(''); reset(); }} className="text-xs text-stone-400 hover:text-stone-600 px-2 py-2">
                  <FiX />
                </button>
              )}
              {selectedText && (
                <span className="text-xs text-stone-400 italic">{selectedText.length} chars selected</span>
              )}
            </div>
          </div>
        )}

        {/* ── IMAGE MODE ── */}
        {mode === 'image' && (
          <ImageSelector
            onSelect={handleImageSelect}
            onClear={reset}
          />
        )}

        {/* Loading state */}
        {reviewing && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-700">
            <FiLoader className="animate-spin flex-shrink-0" />
            Analyzing entry against 14 CFR Part 43 and EASA requirements…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
            <FiAlertCircle className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {result && !reviewing && (
          <ReviewResult result={result} onDismiss={reset} />
        )}

        {/* Tips */}
        {!result && !reviewing && !error && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-400 space-y-2">
            <p className="font-semibold text-stone-500 text-sm">What gets checked</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Required fields per 14 CFR 43.9(a) — work description, date, name, signature, cert number</li>
              <li>Annual / 100-hour inspection certification statement (14 CFR 43.11)</li>
              <li>AD compliance entries — AD number, effectivity, method, terminating status</li>
              <li>Major alteration/repair entries — Form 337 reference</li>
              <li>EASA Part-M / Part-145 Certificate of Release to Service requirements</li>
              <li>Adequacy of work description language</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
