/**
 * LogbookEntryReviewPage — standalone page for quick logbook entry compliance checks.
 *
 * Two modes:
 *   1. Text mode: paste or type logbook text → select any portion → review that selection
 *   2. Image mode: upload, paste (e.g. Win+Shift+S), or capture screen/window → crop → review
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FiUpload, FiX, FiLoader, FiAlertCircle, FiAlertTriangle, FiCheckCircle,
  FiImage, FiType, FiScissors, FiRefreshCw, FiMonitor,
} from 'react-icons/fi';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { DocumentExtractor, userFacingExtractionError } from '../services/documentExtractor';

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LogbookEntryReviewPage() {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col w-full min-w-0 box-border p-3 sm:p-6 lg:p-8">
      {/* Page heading */}
      <div className="flex-shrink-0 mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Entry Review
        </h1>
        <p className="text-white/60 text-base sm:text-lg max-w-4xl">
          Paste logbook text and highlight any entry — or use Image mode to upload, paste a snip (Win+Shift+S), or capture a window/screen
        </p>
      </div>

      {/* Mode switcher */}
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

      <div className="flex flex-1 min-h-0 flex-col gap-5 w-full max-w-none overflow-y-auto">
        {/* ── TEXT MODE ── */}
        {mode === 'text' && (
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
        {mode === 'image' && (
          <div className="flex min-h-[240px] flex-1 flex-col">
            <ImageSelector onSelect={doImageReview} onClear={reset} />
          </div>
        )}

        {/* Loading */}
        {reviewing && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-sky/20 bg-sky/10 text-sm text-sky-light/80">
            <FiLoader className="animate-spin flex-shrink-0" />
            Analyzing entry against 14 CFR Part 43 and EASA requirements…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <FiAlertCircle className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Result */}
        {result && !reviewing && (
          <ReviewResult result={result} onDismiss={reset} />
        )}

        {/* Info panel when idle */}
        {!result && !reviewing && !error && (
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
      </div>
    </div>
  );
}
