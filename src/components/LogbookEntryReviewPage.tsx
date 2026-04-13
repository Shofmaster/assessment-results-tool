/**
 * LogbookEntryReviewPage — standalone page for quick logbook entry compliance checks.
 *
 * Modes:
 *   Part 43 review — Text: paste logbook text → select portion → review; Image: crop/capture → review
 *   Manual vs log — Upload/paste manual + log entry; compare required items for a named inspection type; save gaps as findings
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  FiUpload, FiX, FiLoader, FiAlertCircle, FiAlertTriangle, FiCheckCircle,
  FiImage, FiType, FiScissors, FiRefreshCw, FiMonitor, FiBook,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { DocumentExtractor, userFacingExtractionError } from '../services/documentExtractor';
import {
  runManualLogbookComparison,
  comparisonGapsToComplianceFindings,
  type ManualComparisonResult,
  type ManualComparisonItem,
} from '../services/manualLogbookComparison';
import { useAppStore } from '../store/appStore';
import {
  useAircraftAssets,
  useAddComplianceFindings,
  useIsLogbookEnabled,
  useDefaultClaudeModel,
  useUserSettings,
  useLogbookEntries,
} from '../hooks/useConvexData';

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

// ── Prompt ────────────────────────────────────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `You are an expert aviation maintenance records auditor with deep knowledge of:
- 14 CFR Part 43 (Maintenance, Preventive Maintenance, Rebuilding, and Alteration)
- 14 CFR Part 91 (General Operating and Flight Rules — inspection requirements)
- EASA Part-M (Airworthiness — M.A.305 Aircraft continuing airworthiness record system)
- EASA Part-145 (Approved Maintenance Organisations — 145.A.50 Certification of maintenance)
- AC 43-9C (Maintenance Records — Airworthiness Inspectors Handbook)

14 CFR 43.9(a) verbatim: "Each person who maintains, performs preventive maintenance, rebuilds, or alters an aircraft, airframe, aircraft engine, propeller, appliance, or component part shall make an entry in the maintenance record of that equipment containing the following information:
(1) A description (or reference to data acceptable to the Administrator) of work performed;
(2) The date of completion of the work performed;
(3) The name of the person performing the work (if other than the person specified in paragraph (a)(4) of this section); and
(4) If the work performed on the aircraft, airframe, aircraft engine, propeller, appliance, or component part has been approved for return to service, the signature, the certificate number, and kind of certificate held by the person approving the work."

14 CFR 43.11(a): Annual/100-hour inspections require: type of inspection, date, aircraft total time in service, certification statement, signature, certificate number, certificate type.

For AD compliance entries: AD number, amendment/revision date, method of compliance, terminating vs. recurrent status required.

For major alterations/repairs (43.9(c)): FAA Form 337 is required; maintenance record should reference it.

EASA: M.A.305(a) requires component details, date, description, identity of maintenance org/certifying staff. Part-145.A.50 requires a Certificate of Release to Service (CRS) with task ref, date, approval number, authorised person signature.

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

complianceScore: 100=fully compliant, 85–99=advisory only, 70–84=minor issues, 50–69=major issues, 0–49=non-compliant.`;

function buildTextMessage(text: string): string {
  return `Review the following logbook entry text for regulatory compliance. Identify all deficiencies, missing required fields, and areas that do not meet 14 CFR Part 43 or EASA Part-M requirements. Be specific — quote exact text where relevant.\n\n---\n${text}\n---\n\nRespond with the JSON review object only.`;
}

function userFacingReviewCallError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err ?? '');
  if (/401|403|api|key|Unauthorized|quota|rate/i.test(m)) {
    return 'Review failed — check your AI/API settings and try again.';
  }
  if (/No JSON in response/i.test(m)) {
    return 'The review service returned an unreadable response. Try a shorter selection or run the review again.';
  }
  if (/network|fetch|Failed to fetch/i.test(m)) {
    return 'Network error during review. Check your connection and try again.';
  }
  return m.length > 200 ? `${m.slice(0, 197)}…` : m || 'Review failed. Try again.';
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBadgeClass(score: number): string {
  if (score >= 85) return 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40';
  if (score >= 70) return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
  if (score >= 50) return 'text-orange-300 bg-orange-500/20 border-orange-500/40';
  return 'text-red-300 bg-red-500/20 border-red-500/40';
}

function overallLabel(status: SmartReviewResult['overallCompliance']): { label: string; cls: string } {
  switch (status) {
    case 'compliant':     return { label: 'Compliant',     cls: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40' };
    case 'minor_issues':  return { label: 'Minor Issues',  cls: 'text-amber-300 bg-amber-500/20 border-amber-500/40' };
    case 'major_issues':  return { label: 'Major Issues',  cls: 'text-orange-300 bg-orange-500/20 border-orange-500/40' };
    case 'non_compliant': return { label: 'Non-Compliant', cls: 'text-red-300 bg-red-500/20 border-red-500/40' };
  }
}

function severityBadgeCls(s: SmartReviewFinding['severity']): string {
  if (s === 'critical') return 'text-red-300 bg-red-500/15 border-red-500/30';
  if (s === 'major')    return 'text-orange-300 bg-orange-500/15 border-orange-500/30';
  return 'text-sky-300 bg-sky/15 border-sky/30';
}

function severityIcon(s: SmartReviewFinding['severity']) {
  if (s === 'critical') return <FiAlertCircle className="text-red-400 flex-shrink-0 mt-0.5" />;
  if (s === 'major')    return <FiAlertTriangle className="text-orange-400 flex-shrink-0 mt-0.5" />;
  return <FiCheckCircle className="text-sky-400 flex-shrink-0 mt-0.5" />;
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function callReview(
  mode: 'text' | 'image',
  payload: { text?: string; base64?: string; mediaType?: string },
  model: string,
): Promise<SmartReviewResult> {
  const userContent =
    mode === 'text'
      ? buildTextMessage(payload.text!)
      : [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: payload.mediaType as any, data: payload.base64! } },
          { type: 'text' as const, text: 'Review the logbook entry shown in this image for regulatory compliance against 14 CFR Part 43 / EASA Part-M. Respond with the JSON review object only.' },
        ];

  const response = await createClaudeMessage({
    model,
    max_tokens: 3000,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent as any }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]) as SmartReviewResult;
}

// ── Canvas image selector ─────────────────────────────────────────────────────

interface CanvasSel { x: number; y: number; w: number; h: number }

function normalizeImageMime(mime: string | undefined): string {
  if (mime && mime.startsWith('image/')) return mime;
  return 'image/png';
}

/** One frame from user-chosen display/window/tab; stream tracks are always stopped in `finally`. */
async function captureDisplayMediaFrame(): Promise<{ blob: Blob; mime: string }> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('SCREEN_CAPTURE_UNSUPPORTED');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('VIDEO_LOAD_ERROR'));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('VIDEO_METADATA_TIMEOUT'));
      }, 5000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });
    await video.play();
    // Avoid blank captures by waiting for at least one decoded frame.
    await new Promise<void>((resolve) => {
      if ('requestVideoFrameCallback' in video && typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => resolve());
        return;
      }
      window.setTimeout(() => resolve(), 120);
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('ZERO_DIMENSIONS');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NO_2D_CONTEXT');
    ctx.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
    if (!blob) throw new Error('BLOB_FAILED');
    return { blob, mime: 'image/png' };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

function ImageSelector({ onSelect, onClear }: { onSelect: (b64: string, mt: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [imgEl,  setImgEl]  = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [sel, setSel]         = useState<CanvasSel | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [hasSelection, setHasSelection] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureHint, setCaptureHint] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl || !imgSize) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEl, 0, 0, imgSize.w, imgSize.h);
    if (sel && (sel.w !== 0 || sel.h !== 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
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
      // Corner handles
      ctx.fillStyle = '#38bdf8';
      [[rx,ry],[rx+rw,ry],[rx,ry+rh],[rx+rw,ry+rh]].forEach(([cx,cy]) => {
        ctx.beginPath(); ctx.arc(cx!, cy!, 4, 0, Math.PI*2); ctx.fill();
      });
    }
  }, [imgEl, imgSize, sel]);

  const loadFromSource = useCallback((source: File | Blob, mimeHint?: string) => {
    const mt = normalizeImageMime(mimeHint ?? (source instanceof File ? source.type : undefined));
    setMediaType(mt);
    setCaptureHint(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxW = 860;
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        canvas.width = w; canvas.height = h;
        setImgSize({ w, h }); setImgEl(img); setSel(null); setHasSelection(false);
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(source);
  }, []);

  const loadFile = (file: File) => loadFromSource(file, file.type);

  const onClipboardPaste = useCallback(
    (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const items = dt.items;
      if (items?.length) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault();
            const f = item.getAsFile();
            if (f) loadFromSource(f, item.type);
            return;
          }
        }
      }
      const fileFromFiles = dt.files?.[0];
      if (fileFromFiles?.type.startsWith('image/')) {
        e.preventDefault();
        loadFromSource(fileFromFiles, fileFromFiles.type);
        return;
      }
    },
    [loadFromSource],
  );

  useEffect(() => {
    window.addEventListener('paste', onClipboardPaste);
    return () => window.removeEventListener('paste', onClipboardPaste);
  }, [onClipboardPaste]);

  const runScreenCapture = async () => {
    setCaptureHint(null);
    setCaptureBusy(true);
    try {
      const { blob, mime } = await captureDisplayMediaFrame();
      loadFromSource(blob, mime);
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        setCaptureHint('Capture canceled.');
      } else if (err instanceof Error && err.message === 'SCREEN_CAPTURE_UNSUPPORTED') {
        setCaptureHint('Screen capture needs a secure context (HTTPS) and a supported browser.');
      } else {
        setCaptureHint('Could not capture the screen. Try again or paste an image instead.');
      }
    } finally {
      setCaptureBusy(false);
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top)  * (canvasRef.current!.height / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imgEl) return;
    const p = getPos(e);
    dragStart.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
    setDragging(true); setHasSelection(false);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStart.current) return;
    const p = getPos(e);
    setSel({ x: dragStart.current.x, y: dragStart.current.y, w: p.x - dragStart.current.x, h: p.y - dragStart.current.y });
  };
  const onMouseUp = () => {
    setDragging(false);
    if (sel && (Math.abs(sel.w) > 10 || Math.abs(sel.h) > 10)) setHasSelection(true);
  };

  const extractCrop = useCallback(() => {
    if (!canvasRef.current || !imgEl || !sel) return;
    const rx = Math.min(sel.x, sel.x + sel.w), ry = Math.min(sel.y, sel.y + sel.h);
    const rw = Math.abs(sel.w), rh = Math.abs(sel.h);
    if (rw < 5 || rh < 5) return;
    const c = document.createElement('canvas');
    c.width = rw; c.height = rh;
    c.getContext('2d')!.drawImage(imgEl, rx, ry, rw, rh, 0, 0, rw, rh);
    onSelect(c.toDataURL(mediaType, 0.92).split(',')[1], mediaType);
  }, [sel, imgEl, mediaType, onSelect]);

  const extractFull = useCallback(() => {
    if (!canvasRef.current || !imgEl || !imgSize) return;
    const c = document.createElement('canvas');
    c.width = imgSize.w; c.height = imgSize.h;
    c.getContext('2d')!.drawImage(imgEl, 0, 0, imgSize.w, imgSize.h);
    onSelect(c.toDataURL(mediaType, 0.92).split(',')[1], mediaType);
  }, [imgEl, imgSize, mediaType, onSelect]);

  const clearAll = () => {
    setImgEl(null); setImgSize(null); setSel(null); setHasSelection(false);
    setCaptureHint(null);
    if (fileRef.current) fileRef.current.value = '';
    onClear();
  };

  if (!imgEl) {
    const canCapture = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;
    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50 space-y-2 leading-relaxed">
          <p>
            <span className="font-semibold text-white/70">Snip from anywhere: </span>
            use <kbd className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-white/80 font-mono text-[10px]">Win+Shift+S</kbd> or Snipping Tool, copy the snip, then{' '}
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-white/80 font-mono text-[10px]">Ctrl+V</kbd>{' '}
            while this tab is focused.
          </p>
          <p>
            <span className="font-semibold text-white/70">Or capture in-browser: </span>
            pick a screen or window when the browser asks — then drag to select the logbook lines you want reviewed.
          </p>
        </div>
        {captureHint && <p className="text-xs text-amber-300/90 px-1">{captureHint}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {canCapture ? (
            <button
              type="button"
              disabled={captureBusy}
              onClick={runScreenCapture}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white/85 border border-white/20 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {captureBusy ? <FiLoader className="animate-spin" /> : <FiMonitor />}
              {captureBusy ? 'Capturing…' : 'Capture screen or window'}
            </button>
          ) : (
            <p className="text-xs text-white/35">Screen capture needs HTTPS (or localhost) and a supported browser. Use paste or upload instead.</p>
          )}
        </div>
        <label
          className="flex flex-1 min-h-[200px] flex-col items-center justify-center gap-3 border-2 border-dashed border-white/15 rounded-2xl p-8 sm:p-12 cursor-pointer hover:border-sky/50 hover:bg-sky/5 transition-all"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) loadFile(f); }}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <FiUpload className="text-2xl text-white/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/80">Drop a photo or scan here</p>
            <p className="text-xs text-white/40 mt-1">or click to browse · JPG · PNG · WebP</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
        </label>
      </div>
    );
  }

  const canCapture = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {captureHint && <p className="text-xs text-amber-300/90">{captureHint}</p>}
      <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap flex-shrink-0">
        <FiScissors className="text-sky-light flex-shrink-0" />
        <span className="min-w-0">Drag to select a specific entry — or review the full page</span>
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {canCapture && (
            <button
              type="button"
              disabled={captureBusy}
              onClick={runScreenCapture}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 disabled:opacity-50 transition-colors"
              title="Replace with a new screen or window capture"
            >
              {captureBusy ? <FiLoader className="animate-spin text-sm" /> : <FiMonitor className="text-sm" />}
              <span className="hidden sm:inline">Capture…</span>
            </button>
          )}
          <button type="button" onClick={clearAll} className="flex items-center gap-1 text-white/40 hover:text-red-400 transition-colors">
            <FiX className="text-xs" /> Remove
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-white/10 bg-black/20">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="block max-w-full cursor-crosshair select-none"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <button
          type="button"
          onClick={extractCrop}
          disabled={!hasSelection}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FiScissors /> Review Selection
        </button>
        <button
          type="button"
          onClick={extractFull}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white/80 border border-white/20 hover:bg-white/15 transition-colors"
        >
          <FiImage /> Review Full Page
        </button>
        {hasSelection && (
          <button type="button" onClick={() => { setSel(null); setHasSelection(false); }} className="text-xs text-white/40 hover:text-white/60">
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}

// ── Review result panel ───────────────────────────────────────────────────────

function ReviewResult({ result, onDismiss }: { result: SmartReviewResult; onDismiss: () => void }) {
  const overall = overallLabel(result.overallCompliance);
  const ordered = [
    ...result.findings.filter(f => f.severity === 'critical'),
    ...result.findings.filter(f => f.severity === 'major'),
    ...result.findings.filter(f => f.severity === 'advisory'),
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${overall.cls}`}>{overall.label}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${scoreBadgeClass(result.complianceScore)}`}>
            Score {result.complianceScore}/100
          </span>
          <span className="text-xs text-white/40 font-mono">{result.regulatoryFramework} Part 43</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          title="Clear result"
        >
          <FiRefreshCw className="text-sm" />
        </button>
      </div>

      {ordered.length === 0 ? (
        <div className="px-5 py-8 flex flex-col items-center gap-2 text-emerald-400">
          <FiCheckCircle className="text-3xl" />
          <p className="text-sm font-medium">No compliance issues found</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {ordered.map((f, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex items-start gap-3">
                {severityIcon(f.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${severityBadgeCls(f.severity)}`}>
                      {f.severity}
                    </span>
                    <span className="text-xs font-mono text-white/50">{f.citation}</span>
                    {f.field && <span className="text-xs text-white/30">· {f.field}</span>}
                  </div>
                  <p className="text-sm text-white/85">{f.issue}</p>
                  {f.suggestedText && (
                    <div className="mt-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Suggested</p>
                      <p className="text-xs text-white/70 italic leading-relaxed">{f.suggestedText}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(result.suggestedWorkPerformed || result.suggestedRts) && (
        <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] space-y-4">
          {result.suggestedWorkPerformed && (
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Suggested Work Performed</p>
              <p className="text-sm text-white/75 leading-relaxed">{result.suggestedWorkPerformed}</p>
            </div>
          )}
          {result.suggestedRts && (
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Suggested Return-to-Service Statement</p>
              <p className="text-sm text-white/75 leading-relaxed">{result.suggestedRts}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manual vs log comparison result ───────────────────────────────────────────

function manualItemStatusCls(s: ManualComparisonItem['status']): string {
  if (s === 'matched') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  if (s === 'missing') return 'text-red-300 bg-red-500/15 border-red-500/30';
  return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
}

function ManualCompareRow({ item }: { item: ManualComparisonItem }) {
  return (
    <div className="px-5 py-3 border-b border-white/[0.06] last:border-b-0">
      <div className="flex items-start gap-2 flex-wrap mb-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${manualItemStatusCls(item.status)}`}>
          {item.status}
        </span>
      </div>
      <p className="text-sm text-white/85 mb-2">{item.requirementText}</p>
      {item.manualEvidence ? (
        <p className="text-xs text-white/45 font-mono leading-relaxed mb-1">
          <span className="text-white/30">Manual: </span>
          {item.manualEvidence}
        </p>
      ) : null}
      {item.logEvidence ? (
        <p className="text-xs text-sky-light/70 font-mono leading-relaxed mb-1">
          <span className="text-white/30">Log: </span>
          {item.logEvidence}
        </p>
      ) : null}
      {item.notes ? <p className="text-xs text-white/40 italic mt-1">{item.notes}</p> : null}
    </div>
  );
}

function ManualCompareResultPanel({
  result,
  onDismiss,
  onSaveGaps,
  canSaveGaps,
  savingGaps,
}: {
  result: ManualComparisonResult;
  onDismiss: () => void;
  onSaveGaps: () => void;
  canSaveGaps: boolean;
  savingGaps: boolean;
}) {
  const matched = result.requiredItems.filter((i) => i.status === 'matched');
  const missing = result.requiredItems.filter((i) => i.status === 'missing');
  const unclear = result.requiredItems.filter((i) => i.status === 'unclear');
  const gapCount = missing.length + unclear.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-white/70">Manual vs log</span>
          <span className="text-xs font-mono text-white/40">{result.inspectionType || '—'}</span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300/90">
            matched {result.summary.matched}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-300/90">
            missing {result.summary.missing}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-300/90">
            unclear {result.summary.unclear}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gapCount > 0 && (
            <button
              type="button"
              disabled={!canSaveGaps || savingGaps}
              onClick={onSaveGaps}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savingGaps ? <FiLoader className="animate-spin" /> : <FiAlertTriangle />}
              Save {gapCount} gap{gapCount === 1 ? '' : 's'} as findings
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            title="Clear result"
          >
            <FiRefreshCw className="text-sm" />
          </button>
        </div>
      </div>

      {(result.truncatedManual || result.truncatedRequirements) && (
        <div className="px-5 py-2 text-[11px] text-amber-300/90 border-b border-white/10 bg-amber-500/10">
          {result.truncatedManual && (
            <p>Manual text was trimmed to fit analysis limits ({result.manualCharsUsed?.toLocaleString()} characters used).</p>
          )}
          {result.truncatedRequirements && (
            <p>Only the first {result.requirementsCap} extracted requirements were compared — shorten the manual excerpt or split uploads for full coverage.</p>
          )}
        </div>
      )}

      {result.requiredItems.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-white/50">
          No required items were extracted for this inspection type. Try a more specific manual section, or adjust the inspection label (e.g. &quot;96/144&quot;, &quot;12-month&quot;).
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {missing.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300/80 bg-red-500/5">Missing in log</div>
              {missing.map((item, i) => (
                <ManualCompareRow key={`m-${i}`} item={item} />
              ))}
            </div>
          )}
          {unclear.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-300/80 bg-amber-500/5">Unclear</div>
              {unclear.map((item, i) => (
                <ManualCompareRow key={`u-${i}`} item={item} />
              ))}
            </div>
          )}
          {matched.length > 0 && (
            <div>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300/80 bg-emerald-500/5">Matched</div>
              {matched.map((item, i) => (
                <ManualCompareRow key={`ok-${i}`} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LogbookEntryReviewPage() {
  const storeProjectId = useAppStore((s) => s.activeProjectId);
  const userSettings = useUserSettings();
  const activeProjectId = useMemo(() => {
    if (storeProjectId) return storeProjectId;
    const sid = userSettings?.activeProjectId;
    return sid ? String(sid) : null;
  }, [storeProjectId, userSettings?.activeProjectId]);

  const defaultModel = useDefaultClaudeModel();
  const logbookEnabled = useIsLogbookEnabled();
  const addComplianceFindings = useAddComplianceFindings();

  const aircraftList = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as { _id: string; tailNumber?: string; registration?: string }[];
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  useEffect(() => {
    if (!selectedAircraftId && aircraftList.length > 0) {
      setSelectedAircraftId(String(aircraftList[0]._id));
    }
  }, [aircraftList, selectedAircraftId]);

  const entries = (useLogbookEntries(activeProjectId ?? undefined, selectedAircraftId || undefined) ?? []) as {
    _id: string;
    entryDate?: string;
    rawText?: string;
    workPerformed?: string;
  }[];
  const recentEntries = useMemo(() => {
    return [...entries]
      .filter((e) => e.entryDate)
      .sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''))
      .slice(0, 40);
  }, [entries]);

  const [pageMode, setPageMode] = useState<'part43' | 'manualCompare'>('part43');
  const [mode, setMode]           = useState<'text' | 'image'>('text');
  const [text, setText]           = useState('');
  const [selectedText, setSelectedText] = useState('');
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const docFileInputRef           = useRef<HTMLInputElement>(null);
  const extractorRef              = useRef(new DocumentExtractor());
  const [reviewing, setReviewing] = useState(false);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [result, setResult]       = useState<SmartReviewResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  /** Manual vs log */
  const [inspectionType, setInspectionType] = useState('');
  const [manualText, setManualText] = useState('');
  const [compareLogText, setCompareLogText] = useState('');
  const [selectedCompareLog, setSelectedCompareLog] = useState('');
  const compareLogRef = useRef<HTMLTextAreaElement>(null);
  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const manualExtractorRef = useRef(new DocumentExtractor());
  const [extractingManual, setExtractingManual] = useState(false);
  const [comparingManual, setComparingManual] = useState(false);
  const [manualCompareResult, setManualCompareResult] = useState<ManualComparisonResult | null>(null);
  const [savingManualGaps, setSavingManualGaps] = useState(false);
  const [optionalEntryId, setOptionalEntryId] = useState('');

  const handleCompareLogSelect = () => {
    const ta = compareLogRef.current;
    if (!ta) return;
    setSelectedCompareLog(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim());
  };

  const handleManualFileUpload = async (file: File) => {
    setExtractingManual(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const extracted = await manualExtractorRef.current.extractText(
        buffer,
        file.name,
        file.type || 'application/octet-stream',
        defaultModel,
      );
      const cleaned = extracted.trim();
      if (!cleaned) throw new Error('No readable text found in this file.');
      setManualText((prev) => (prev.trim() ? `${prev}\n\n${cleaned}` : cleaned));
      setManualCompareResult(null);
    } catch (err: unknown) {
      setError(userFacingExtractionError(err));
    } finally {
      setExtractingManual(false);
      if (manualFileInputRef.current) manualFileInputRef.current.value = '';
    }
  };

  const doManualCompare = async () => {
    const logSrc = (selectedCompareLog || compareLogText).trim();
    if (!inspectionType.trim() || !manualText.trim() || !logSrc) return;
    setComparingManual(true);
    setManualCompareResult(null);
    setError(null);
    try {
      const res = await runManualLogbookComparison({
        inspectionType: inspectionType.trim(),
        manualText,
        logEntryText: logSrc,
        model: defaultModel,
      });
      setManualCompareResult(res);
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally {
      setComparingManual(false);
    }
  };

  const saveManualGaps = async () => {
    if (!manualCompareResult || !activeProjectId || !selectedAircraftId) return;
    const gapsPayload = comparisonGapsToComplianceFindings(selectedAircraftId, manualCompareResult, {
      logbookEntryId: optionalEntryId || undefined,
    });
    if (gapsPayload.length === 0) return;
    setSavingManualGaps(true);
    try {
      await addComplianceFindings({
        projectId: activeProjectId as any,
        findings: gapsPayload.map((f) => ({
          aircraftId: f.aircraftId as any,
          logbookEntryId: f.logbookEntryId ? (f.logbookEntryId as any) : undefined,
          ruleId: f.ruleId,
          findingType: f.findingType,
          severity: f.severity,
          title: f.title,
          description: f.description,
          citation: f.citation,
          evidenceSnippet: f.evidenceSnippet,
        })),
      });
      toast.success(`Saved ${gapsPayload.length} finding(s). Open Logbook → Compliance to review.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save findings');
    } finally {
      setSavingManualGaps(false);
    }
  };

  const manualGapCount =
    manualCompareResult?.requiredItems.filter((i) => i.status === 'missing' || i.status === 'unclear').length ?? 0;
  const canSaveManualGaps =
    logbookEnabled &&
    !!activeProjectId &&
    !!selectedAircraftId &&
    manualGapCount > 0;

  const handleTextSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSelectedText(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim());
  };

  const doTextReview = async (src: string) => {
    if (!src.trim()) return;
    setReviewing(true); setResult(null); setError(null);
    try {
      setResult(await callReview('text', { text: src }, DEFAULT_CLAUDE_MODEL));
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally { setReviewing(false); }
  };

  const doImageReview = async (b64: string, mt: string) => {
    setReviewing(true); setResult(null); setError(null);
    try {
      setResult(await callReview('image', { base64: b64, mediaType: mt }, DEFAULT_CLAUDE_MODEL));
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally { setReviewing(false); }
  };

  const handleDocUpload = async (file: File) => {
    setExtractingDoc(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const extracted = await extractorRef.current.extractText(
        buffer,
        file.name,
        file.type || 'application/octet-stream',
        DEFAULT_CLAUDE_MODEL
      );
      const cleaned = extracted.trim();
      if (!cleaned) {
        throw new Error('No readable text found in this file.');
      }
      setText((prev) => (prev.trim() ? `${prev}\n\n${cleaned}` : cleaned));
      setSelectedText('');
      setResult(null);
    } catch (err: unknown) {
      setError(userFacingExtractionError(err));
    } finally {
      setExtractingDoc(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  const reset = () => { setResult(null); setError(null); };

  const switchPageMode = (next: 'part43' | 'manualCompare') => {
    setPageMode(next);
    setError(null);
    if (next === 'part43') {
      setManualCompareResult(null);
    } else {
      setResult(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col w-full min-w-0 box-border p-3 sm:p-6 lg:p-8">
      {/* Page heading */}
      <div className="flex-shrink-0 mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Entry Review
        </h1>
        <p className="text-white/60 text-base sm:text-lg max-w-4xl">
          {pageMode === 'part43'
            ? 'Paste logbook text and highlight any entry — or use Image mode to upload, paste a snip (Win+Shift+S), or capture a window/screen'
            : 'Upload or paste an aircraft manual section, name the inspection type (e.g. Gulfstream 96/144), and compare required items to your log entry text. Save gaps as Compliance findings.'}
        </p>
      </div>

      {/* Part 43 vs Manual comparison */}
      <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit mb-4 flex-shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => switchPageMode('part43')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            pageMode === 'part43'
              ? 'bg-sky/20 text-sky-light border border-sky/40'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <FiCheckCircle className="text-base" />
          Part 43 review
        </button>
        <button
          type="button"
          onClick={() => switchPageMode('manualCompare')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            pageMode === 'manualCompare'
              ? 'bg-sky/20 text-sky-light border border-sky/40'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <FiBook className="text-base" />
          Manual vs log
        </button>
      </div>

      {/* Text / Image (Part 43 only) */}
      {pageMode === 'part43' && (
      <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit mb-5 flex-shrink-0">
        {(['text', 'image'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); reset(); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === m
                ? 'bg-sky/20 text-sky-light border border-sky/40'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            {m === 'text' ? <FiType /> : <FiImage />}
            {m === 'text' ? 'Text' : 'Image'}
          </button>
        ))}
      </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col gap-5 w-full max-w-none overflow-y-auto">
        {pageMode === 'manualCompare' && (
          <div className="flex flex-col gap-4">
            {!activeProjectId && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
                Select a project from the main Logbook page (or open a project elsewhere) so findings can be saved to the right place.
              </div>
            )}
            {activeProjectId && aircraftList.length === 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
                No aircraft in this project. Add an aircraft under Logbook first to save findings.
              </div>
            )}
            {!logbookEnabled && (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/50">
                Logbook Compliance is not enabled for this account — you can still run comparisons, but saving findings requires Logbook access.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden min-h-[200px]">
                <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
                  <FiBook className="text-sky-light/70 flex-shrink-0" />
                  <span className="min-w-0">Manual — paste text or upload PDF / Word</span>
                  <button
                    type="button"
                    onClick={() => manualFileInputRef.current?.click()}
                    disabled={extractingManual || comparingManual}
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40"
                  >
                    {extractingManual ? <FiLoader className="animate-spin" /> : <FiUpload />}
                    {extractingManual ? 'Extracting…' : 'Upload'}
                  </button>
                  <input
                    ref={manualFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleManualFileUpload(f);
                    }}
                  />
                </div>
                <textarea
                  value={manualText}
                  onChange={(e) => { setManualText(e.target.value); setManualCompareResult(null); }}
                  placeholder="Paste the relevant CMP / inspection program section (e.g. 96-month / 144-month tasks)…"
                  className="w-full flex-1 min-h-[200px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
                />
              </div>

              <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden min-h-[200px]">
                <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
                  <FiScissors className="text-sky-light/70 flex-shrink-0" />
                  <span>Log entry — <strong className="text-white/60">select text</strong> to compare one entry, or compare all</span>
                </div>
                <textarea
                  ref={compareLogRef}
                  value={compareLogText}
                  onChange={(e) => { setCompareLogText(e.target.value); setSelectedCompareLog(''); setManualCompareResult(null); }}
                  onSelect={handleCompareLogSelect}
                  onMouseUp={handleCompareLogSelect}
                  onKeyUp={handleCompareLogSelect}
                  placeholder="Paste the maintenance log entry (or work order / sign-off text) to compare…"
                  className="w-full flex-1 min-h-[200px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end">
              <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Inspection type</span>
                <input
                  type="text"
                  value={inspectionType}
                  onChange={(e) => { setInspectionType(e.target.value); setManualCompareResult(null); }}
                  placeholder="e.g. 96/144, 12-month, Phase A"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-sky/50"
                />
              </label>
              {activeProjectId && aircraftList.length > 0 && (
                <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Aircraft (for saving findings)</span>
                  <select
                    value={selectedAircraftId}
                    onChange={(e) => setSelectedAircraftId(e.target.value)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-sky/50"
                  >
                    {aircraftList.map((a) => (
                      <option key={a._id} value={String(a._id)} className="bg-navy-900">
                        {a.tailNumber || a.registration || a._id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {recentEntries.length > 0 && (
                <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Link finding to entry (optional)</span>
                  <select
                    value={optionalEntryId}
                    onChange={(e) => setOptionalEntryId(e.target.value)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-sky/50"
                  >
                    <option value="" className="bg-navy-900">— None —</option>
                    {recentEntries.map((e) => (
                      <option key={e._id} value={String(e._id)} className="bg-navy-900">
                        {(e.entryDate ?? '?')} — {(e.workPerformed || e.rawText || '').slice(0, 48)}
                        {(e.workPerformed || e.rawText || '').length > 48 ? '…' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  comparingManual ||
                  extractingManual ||
                  !inspectionType.trim() ||
                  !manualText.trim() ||
                  !(selectedCompareLog || compareLogText).trim()
                }
                onClick={() => void doManualCompare()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {comparingManual ? <FiLoader className="animate-spin" /> : <FiBook />}
                {comparingManual ? 'Analyzing manual & log…' : 'Compare manual to log'}
              </button>
              {selectedCompareLog && (
                <span className="text-xs text-white/40">Using selection ({selectedCompareLog.length} chars)</span>
              )}
            </div>
          </div>
        )}

        {/* ── TEXT MODE ── */}
        {pageMode === 'part43' && mode === 'text' && (
          <div className="flex flex-1 min-h-0 flex-col gap-3">
            <div className="flex flex-1 min-h-[220px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
              <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
                <FiScissors className="text-sky-light/70" />
                <span>Paste logbook text — <strong className="text-white/60">select any portion</strong> to review just that entry, or use Review All</span>
                <button
                  type="button"
                  onClick={() => docFileInputRef.current?.click()}
                  disabled={extractingDoc || reviewing}
                  className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {extractingDoc ? <FiLoader className="animate-spin" /> : <FiUpload />}
                  {extractingDoc ? 'Extracting…' : 'Upload PDF / Word'}
                </button>
                <input
                  ref={docFileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleDocUpload(f);
                  }}
                />
              </div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => { setText(e.target.value); setSelectedText(''); }}
                onSelect={handleTextSelect}
                onMouseUp={handleTextSelect}
                onKeyUp={handleTextSelect}
                placeholder={`Paste logbook entry text here…\n\nExample:\n09/15/2024 – Performed 100-hour inspection per 14 CFR 91.409(b). Aircraft total time: 1,450.3 hrs. Inspected and found airworthy. Signed: John Smith`}
                className="w-full flex-1 min-h-[180px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
              />
            </div>

            <div className="flex flex-shrink-0 items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={!selectedText || reviewing || extractingDoc}
                onClick={() => doTextReview(selectedText)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {reviewing ? <FiLoader className="animate-spin" /> : <FiScissors />}
                {selectedText ? `Review Selection (${selectedText.length} chars)` : 'Review Selection'}
              </button>
              <button
                type="button"
                disabled={!text.trim() || reviewing || extractingDoc}
                onClick={() => doTextReview(text)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white/80 border border-white/20 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {reviewing ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}
                Review All
              </button>
              {text && (
                <button type="button" onClick={() => { setText(''); setSelectedText(''); reset(); }} className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                  <FiX />
                </button>
              )}
            </div>
            {selectedText && (
              <p className="text-xs text-white/40 italic">{selectedText.length} characters selected</p>
            )}
            <p className="text-xs text-white/35">Supports pasted text plus uploads: PDF, Word (.docx), .txt (legacy .doc may be limited by source formatting).</p>
          </div>
        )}

        {/* ── IMAGE MODE ── */}
        {pageMode === 'part43' && mode === 'image' && (
          <div className="flex min-h-[240px] flex-1 flex-col">
            <ImageSelector onSelect={doImageReview} onClear={reset} />
          </div>
        )}

        {/* Loading Part 43 */}
        {pageMode === 'part43' && reviewing && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-sky/20 bg-sky/10 text-sm text-sky-light/80">
            <FiLoader className="animate-spin flex-shrink-0" />
            Analyzing entry against 14 CFR Part 43 and EASA requirements…
          </div>
        )}

        {/* Loading manual compare */}
        {pageMode === 'manualCompare' && comparingManual && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-sky/20 bg-sky/10 text-sm text-sky-light/80">
            <FiLoader className="animate-spin flex-shrink-0" />
            Extracting required items from the manual and comparing to the log entry…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <FiAlertCircle className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Result Part 43 */}
        {pageMode === 'part43' && result && !reviewing && (
          <ReviewResult result={result} onDismiss={reset} />
        )}

        {/* Result manual compare */}
        {pageMode === 'manualCompare' && manualCompareResult && !comparingManual && (
          <ManualCompareResultPanel
            result={manualCompareResult}
            onDismiss={() => { setManualCompareResult(null); setError(null); }}
            onSaveGaps={() => void saveManualGaps()}
            canSaveGaps={canSaveManualGaps}
            savingGaps={savingManualGaps}
          />
        )}

        {/* Info panel when idle */}
        {pageMode === 'part43' && !result && !reviewing && !error && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
            <p className="text-sm font-semibold text-white/60">What gets checked</p>
            <ul className="space-y-1.5 text-xs text-white/40 list-disc list-inside">
              <li>Required fields per 14 CFR 43.9(a) — description, date, name, signature, cert number</li>
              <li>Annual / 100-hour inspection certification statement (14 CFR 43.11)</li>
              <li>AD compliance entries — AD number, effectivity, method, terminating status</li>
              <li>Major alteration/repair entries — Form 337 reference (43.9(c))</li>
              <li>EASA Part-M / Part-145 Certificate of Release to Service requirements</li>
              <li>Adequacy of work description language against AC 43-9C guidance</li>
            </ul>
          </div>
        )}

        {pageMode === 'manualCompare' && !manualCompareResult && !comparingManual && !error && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
            <p className="text-sm font-semibold text-white/60">How manual comparison works</p>
            <ul className="space-y-1.5 text-xs text-white/40 list-disc list-inside">
              <li>Upload or paste the manual section that lists tasks for your inspection (full manuals are OK — text is analyzed in chunks).</li>
              <li>Enter the same label you use in the program (e.g. &quot;96/144&quot;, &quot;96-month / 144-month&quot;).</li>
              <li>The app extracts required items, then checks whether the log entry documents each one.</li>
              <li>Save missing or unclear items as Compliance findings (Logbook → Compliance).</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
