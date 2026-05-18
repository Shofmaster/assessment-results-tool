import { useState, useRef, useCallback, useEffect } from 'react';
import { FiUpload, FiX, FiLoader, FiImage, FiScissors, FiMonitor } from 'react-icons/fi';
import { captureDisplayMediaFrame, normalizeImageMime } from './reviewClient';

interface CanvasSel {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function ImageSelector({
  onSelect,
  onClear,
}: {
  onSelect: (b64: string, mt: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [sel, setSel] = useState<CanvasSel | null>(null);
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
      ctx.fillStyle = '#38bdf8';
      [
        [rx, ry],
        [rx + rw, ry],
        [rx, ry + rh],
        [rx + rw, ry + rh],
      ].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx!, cy!, 4, 0, Math.PI * 2);
        ctx.fill();
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
        canvas.width = w;
        canvas.height = h;
        setImgSize({ w, h });
        setImgEl(img);
        setSel(null);
        setHasSelection(false);
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
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imgEl) return;
    const p = getPos(e);
    dragStart.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
    setDragging(true);
    setHasSelection(false);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStart.current) return;
    const p = getPos(e);
    setSel({
      x: dragStart.current.x,
      y: dragStart.current.y,
      w: p.x - dragStart.current.x,
      h: p.y - dragStart.current.y,
    });
  };
  const onMouseUp = () => {
    setDragging(false);
    if (sel && (Math.abs(sel.w) > 10 || Math.abs(sel.h) > 10)) setHasSelection(true);
  };

  const extractCrop = useCallback(() => {
    if (!canvasRef.current || !imgEl || !sel) return;
    const rx = Math.min(sel.x, sel.x + sel.w);
    const ry = Math.min(sel.y, sel.y + sel.h);
    const rw = Math.abs(sel.w);
    const rh = Math.abs(sel.h);
    if (rw < 5 || rh < 5) return;
    const c = document.createElement('canvas');
    c.width = rw;
    c.height = rh;
    c.getContext('2d')!.drawImage(imgEl, rx, ry, rw, rh, 0, 0, rw, rh);
    onSelect(c.toDataURL(mediaType, 0.92).split(',')[1], mediaType);
  }, [sel, imgEl, mediaType, onSelect]);

  const extractFull = useCallback(() => {
    if (!canvasRef.current || !imgEl || !imgSize) return;
    const c = document.createElement('canvas');
    c.width = imgSize.w;
    c.height = imgSize.h;
    c.getContext('2d')!.drawImage(imgEl, 0, 0, imgSize.w, imgSize.h);
    onSelect(c.toDataURL(mediaType, 0.92).split(',')[1], mediaType);
  }, [imgEl, imgSize, mediaType, onSelect]);

  const clearAll = () => {
    setImgEl(null);
    setImgSize(null);
    setSel(null);
    setHasSelection(false);
    setCaptureHint(null);
    if (fileRef.current) fileRef.current.value = '';
    onClear();
  };

  const canCapture =
    typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;

  if (!imgEl) {
    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50">
          Paste a snip with <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl+V</kbd> or upload / capture below.
        </div>
        {captureHint && <p className="text-xs text-amber-300/90">{captureHint}</p>}
        {canCapture && (
          <button
            type="button"
            disabled={captureBusy}
            onClick={runScreenCapture}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/85 border border-white/20 hover:bg-white/15 disabled:opacity-50 w-fit"
          >
            {captureBusy ? <FiLoader className="animate-spin" /> : <FiMonitor />}
            {captureBusy ? 'Capturing…' : 'Capture screen'}
          </button>
        )}
        <label
          className="flex flex-1 min-h-[160px] flex-col items-center justify-center gap-2 border-2 border-dashed border-white/15 rounded-xl p-6 cursor-pointer hover:border-sky/50 hover:bg-sky/5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith('image/')) loadFile(f);
          }}
        >
          <FiUpload className="text-xl text-white/40" />
          <p className="text-sm text-white/70">Drop image or click to browse</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {captureHint && <p className="text-xs text-amber-300/90">{captureHint}</p>}
      <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap flex-shrink-0">
        <FiScissors className="text-sky-light flex-shrink-0" />
        <span className="min-w-0">Drag to select an entry, or review the full page</span>
        <div className="flex items-center gap-2 ml-auto">
          {canCapture && (
            <button
              type="button"
              disabled={captureBusy}
              onClick={runScreenCapture}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {captureBusy ? <FiLoader className="animate-spin text-sm" /> : <FiMonitor className="text-sm" />}
            </button>
          )}
          <button type="button" onClick={clearAll} className="flex items-center gap-1 text-white/40 hover:text-red-400">
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
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40"
        >
          <FiScissors /> Review selection
        </button>
        <button
          type="button"
          onClick={extractFull}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80 border border-white/20 hover:bg-white/15"
        >
          <FiImage /> Review full page
        </button>
      </div>
    </div>
  );
}